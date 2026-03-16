// game.js
const ANIMAL_NAMES = { lu:'鹿', gezi:'鸽子', tuzi:'兔子', he:'鹤', e:'鹅', canglu:'苍鹭' }
const RY_STEP = 6
const SCALE   = 0.2

// e 的 layer1 文件名不同
const LAYER1 = { e: 'reference/e/layer1_combined.jpg.svg' }
function refPath(animal, layer) {
  if (layer === 'layer1' && LAYER1[animal]) return LAYER1[animal]
  return reference/${animal}/${layer === 'layer1' ? 'layer1_combined' : 'layer2_circle_system'}.svg
}

let gameMode      = false
let ellipseData   = {}
let dragging      = null
let selectedPiece = null
let snapHighlight = null  // { x, y, r } 供 sketch.js 高亮圆环
let hintCount     = 0
let hintTimer     = null

// 每个动物独立状态：{ placedPieces, usedIdx }
const animalState = {}
let currentState  = null  // 指向当前动物的状态

fetch('ellipse_data.json').then(r => r.json()).then(d => { ellipseData = d })

function getSortedNodes(animal) {
  const nodes = (typeof allNodes !== 'undefined' && allNodes[animal]) || []
  return nodes.slice().sort((a, b) => b.r - a.r)
}

// 按坐标最近邻匹配：返回与 sortedNodes 等长的数组，每个元素是对应的 ellipse（无匹配则 null）
function matchEllipsesToNodes(animal) {
  const nodes = getSortedNodes(animal)
  const eData = (ellipseData[animal] || []).slice()
  const used  = new Set()
  return nodes.map(n => {
    let best = -1, bestD = Infinity
    eData.forEach((e, i) => {
      if (used.has(i)) return
      const d = (e.cx - n.x) ** 2 + (e.cy - n.y) ** 2
      if (d < bestD) { bestD = d; best = i }
    })
    if (best < 0) return null
    used.add(best)
    return eData[best]
  })
}

// ── 开关游戏模式 ──────────────────────────────────────────
function togglePlay() {
  gameMode = !gameMode
  const panel = document.getElementById('panel')
  const btn   = document.getElementById('play-btn')
  if (gameMode) {
    panel.classList.add('open'); btn.textContent = '■ STOP'
    loadAnimalState(currentAnimal)
  } else {
    panel.classList.remove('open'); btn.textContent = '▶ PLAY'
    hideAnimalPieces(currentAnimal)
    hideFeature()
    hideRef()
    hintCount = 0
  }
}

// 切换动物时由 sketch.js 的 switchAnimal 调用
// 在 sketch.js 的 switchAnimal 末尾会调用 buildLibrary（如果 gameMode）
// 这里我们 hook 进去：
const _origSwitchAnimal = typeof switchAnimal !== 'undefined' ? switchAnimal : null
function onAnimalSwitch(prev, next) {
  if (!gameMode) return
  hideAnimalPieces(prev)
  // 隐藏完成叠加层
  const overlay = document.getElementById('complete-overlay')
  if (overlay) { overlay.style.display = 'none'; document.getElementById('complete-img').style.opacity = '0' }
  loadAnimalState(next)
}

function hideAnimalPieces(animal) {
  const st = animalState[animal]
  if (!st) return
  st.placedPieces.forEach(p => { if (p.svg) p.svg.style.display = 'none' })
}

function showAnimalPieces(animal) {
  const st = animalState[animal]
  if (!st) return
  st.placedPieces.forEach(p => { if (p.svg) p.svg.style.display = '' })
}

function loadAnimalState(animal) {
  snapHighlight = null
  hintCount = 0
  clearTimeout(hintTimer)
  hideRef()
  if (!animalState[animal]) {
    animalState[animal] = { placedPieces: [], usedIdx: new Set() }
  }
  currentState = animalState[animal]
  showAnimalPieces(animal)
  buildLibrary(animal)
  initFeaturePieces(animal)
  document.getElementById('ref-img').src = reference/${animal}/hint.svg
}

// 每个动物中"白色圆环"的 class 名（用于过滤 feature 椭圆）
const CIRCLE_CLS = { lu:'cls-1',gezi:'cls-1',tuzi:'cls-2',he:'cls-3',e:'cls-2',canglu:'cls-1' }

// ── Feature 预放置：直接用 feature.svg 的精确椭圆数据放置 ──
function initFeaturePieces(animal) {
  if (currentState.featureInited) return
  currentState.featureInited = true

  fetch(reference/${animal}/feature.svg)
    .then(r => r.text())
    .then(svgText => {
      const S = CANVAS / 1000
      const circleCls = CIRCLE_CLS[animal]
      const sorted = getSortedNodes(animal)
      const eList  = matchEllipsesToNodes(animal)

      // 解析 style 块，获取每个 class 的 fill（取第一个有 fill 的规则）
      const clsFill = {}
      for (const m of svgText.matchAll(/\.(cls-\d+)[^{]*\{([^}]+)\}/g)) {
        const fm = m[2].match(/fill:\s*([^;]+)/)
        if (fm && fm[1].trim() !== 'none' && !clsFill[m[1]]) {
          clsFill[m[1]] = fm[1].trim()
        }
      }

      const parser = new DOMParser()
      const doc = parser.parseFromString(svgText, 'image/svg+xml')

      let featureDelay = 0
      const place = (cx, cy, rx, ry, angle, cls, overrideOrder) => {
        const fill = clsFill[cls] || '#a4e1ff'
        let bestI = 0, bestD = Infinity
        const majorR = Math.max(rx, ry)
        sorted.forEach((n, i) => {
          const distScore = Math.hypot(cx - n.x*CANVAS, cy - n.y*CANVAS)
          const sizeScore = Math.abs(n.r*CANVAS - majorR) * 2
          const d = distScore + sizeScore
          if (d < bestD) { bestD = d; bestI = i }
        })
        const n      = sorted[bestI]
        const order  = overrideOrder ?? (eList[bestI] || {}).order ?? 500
        const realRx = Math.max(rx, ry)
        const realRy = Math.min(rx, ry)
        const finalAngle = ry > rx ? angle + 90 : angle
        const data = { realRx, realRy, initAngle: finalAngle, fill, targetIdx: -(bestI+1), order }
        currentState.usedIdx.add(bestI)
        const nx = n.x * CANVAS, ny = n.y * CANVAS
        const piece = placePiece({ x: nx, y: ny }, data, realRy, finalAngle)
        const sz = realRx * 2 + 40
        piece.svg.style.left = (nx - sz/2) + 'px'
        piece.svg.style.top  = (ny - sz/2) + 'px'
        piece.nodeIdx = bestI; piece.snapped = true
        piece.svg.style.cursor = 'default'
        piece.svg.style.zIndex = 100 + order
        // 涟漪扩展动画
        piece.svg.style.transform = 'scale(0)'
        piece.svg.style.transformOrigin = '50% 50%'
        piece.svg.style.transition = 'transform 0.5s cubic-bezier(0.34,1.56,0.64,1)'
        setTimeout(() => { piece.svg.style.transform = 'scale(1)' }, featureDelay)
        featureDelay += 120
      }

      doc.querySelectorAll('ellipse').forEach(e => {
        const cls = e.getAttribute('class') || ''
        if (cls === 'cls-4' || cls === circleCls) return
        const cx = parseFloat(e.getAttribute('cx')) * S
        const cy = parseFloat(e.getAttribute('cy')) * S
        const rx = parseFloat(e.getAttribute('rx')) * S
        const ry = parseFloat(e.getAttribute('ry')) * S
        const tf = e.getAttribute('transform') || ''
        const rotM = tf.match(/rotate\(([^,)]+)/)
        place(cx, cy, rx, ry, rotM ? parseFloat(rotM[1]) : 0, cls)
      })

      doc.querySelectorAll('circle').forEach(e => {
        const cls = e.getAttribute('class') || ''
        if (cls === 'cls-4' || cls === circleCls) return
        const cx = parseFloat(e.getAttribute('cx')) * S
        const cy = parseFloat(e.getAttribute('cy')) * S
        const r  = parseFloat(e.getAttribute('r')) * S
        place(cx, cy, r, r, 0, cls)
      })

      // path 元素（如鹤的红色头顶）：只处理有特殊颜色的
      doc.querySelectorAll('path').forEach(e => {
        const cls = e.getAttribute('class') || ''
        if (cls === 'cls-4' || cls === circleCls) return
        const fill = clsFill[cls]
        if (!fill || fill === '#a4e1ff') return
        // 从 path d 属性解析近似中心（用 bezier 端点平均，比起点更准确）
        const d = e.getAttribute('d') || ''
        const coords = d.match(/[Mm]\s*([\d.+-]+)[,\s]([\d.+-]+)/)
        if (!coords) return
        const mx = parseFloat(coords[1]) * S
        const my = parseFloat(coords[2]) * S
        // 提取所有数字，计算 bezier 端点
        const allNums = d.match(/[-+]?\d+\.?\d*/g)?.map(Number) || []
        let cx = mx, cy = my
        if (allNums.length >= 14) {
          // c1 终点
          const p1x = mx + allNums[6], p1y = my + allNums[7]
          // c2 终点
          const p2x = p1x + allNums[12], p2y = p1y + allNums[13]
          cx = (mx + p1x + p2x) / 3
          cy = (my + p1y + p2y) / 3
        }
        // 用 circle_nodes 里最近的圆半径作为近似尺寸
        let bestI = 0, bestD = Infinity
        getSortedNodes(animal).forEach((n, i) => {
          const dd = Math.hypot(cx - n.x*CANVAS, cy - n.y*CANVAS)
          if (dd < bestD) { bestD = dd; bestI = i }
        })
        const r = getSortedNodes(animal)[bestI].r * CANVAS
        // 红色特征（path）层级：取所有已放置 feature piece 的最大 order + 1，确保在最上层
        const maxOrder = currentState.placedPieces.reduce((m, p) => Math.max(m, p.data.order || 0), 500)
        place(cx, cy, r, r * 0.7, 0, cls, maxOrder + 1)
      })

      buildLibrary(animal)
    })
}

function hideFeature() {}

// ── Hint 系统 ─────────────────────────────────────────────
function showHint() {
  hintCount++
  const img = document.getElementById('ref-img')
  img.style.display = 'block'
  clearTimeout(hintTimer)
  if (hintCount === 1) {
    hintTimer = setTimeout(hideRef, 3000)
  } else if (hintCount === 2) {
    hintTimer = setTimeout(hideRef, 10000)
  }
  // 第3次及以上：永久显示，不设 timer
}

function hideRef() {
  document.getElementById('ref-img').style.display = 'none'
}

// ── 组件库 ────────────────────────────────────────────────
function buildLibrary(animal) {
  const lib = document.getElementById('ellipse-library')
  lib.innerHTML = ''
  document.getElementById('complete-msg').style.display = 'none'

  const sorted  = getSortedNodes(animal)
  const eList   = matchEllipsesToNodes(animal)
  const st      = currentState

  sorted.forEach((n, i) => {
    if (st.usedIdx.has(i)) return  // 已使用的不显示

    const ed   = eList[i] || {}
    const fill = '#a4e1ff'
    // 长轴 = 圆直径（硬性约束）
    const realRx = n.r * CANVAS  // 长半轴 = 圆半径
    // 短轴初始 = ellipse_data 中较小的半轴（已归一化，乘CANVAS）
    const edRx = (ed.rx || n.r) * CANVAS
    const edRy = (ed.ry || n.r) * CANVAS
    const realRy = Math.min(edRx, edRy)
    const initAngle = ed.angle || 0
    const order     = ed.order || 500

    const dRx = realRx * SCALE, dRy = realRy * SCALE
    const bw  = Math.ceil(realRx * 2 * SCALE + 4)

    const wrapper = document.createElement('div')
    wrapper.style.cssText = position:relative;width:${bw}px;height:${bw}px;cursor:grab;flex-shrink:0;
    wrapper.dataset.idx = i

    const svg = document.createElementNS('http://www.w3.org/2000/svg','svg')
    svg.setAttribute('width', bw); svg.setAttribute('height', bw)
    svg.style.overflow = 'visible'

    const el = document.createElementNS('http://www.w3.org/2000/svg','ellipse')
    el.setAttribute('cx', bw/2); el.setAttribute('cy', bw/2)
    el.setAttribute('rx', dRx); el.setAttribute('ry', dRy)
    el.setAttribute('transform', rotate(${initAngle},${bw/2},${bw/2}))
    el.setAttribute('fill', fill)
    el.setAttribute('stroke', 'black'); el.setAttribute('stroke-width', '1')
    svg.appendChild(el); wrapper.appendChild(svg); lib.appendChild(wrapper)

    const data = { realRx, realRy, initAngle, fill, targetIdx: i, order }
    makeDraggable(wrapper, data)
  })
}

function clearLibrary() {
  document.getElementById('ellipse-library').innerHTML = ''
  // 隐藏所有动物的已放置椭圆
  Object.keys(animalState).forEach(a => hideAnimalPieces(a))
  Object.keys(animalState).forEach(k => delete animalState[k])
  currentState  = null
  selectedPiece = null
  snapHighlight = null
  document.getElementById('complete-msg').style.display = 'none'
}

// Reset：只重置当前动物
function resetAnimal() {
  const animal = currentAnimal
  const st = animalState[animal]
  if (!st) return
  st.placedPieces.forEach(p => { if (p.svg) p.svg.remove() })
  animalState[animal] = { placedPieces: [], usedIdx: new Set() }
  currentState = animalState[animal]
  selectedPiece = null
  snapHighlight = null
  hintCount = 0; clearTimeout(hintTimer); hideRef()
  const overlay = document.getElementById('complete-overlay')
  if (overlay) { overlay.style.display = 'none'; document.getElementById('complete-img').style.opacity = '0' }
  buildLibrary(animal)
  initFeaturePieces(animal)
}
function makeDraggable(wrapper, data) {
  wrapper.addEventListener('mousedown', e => startLibDrag(e, wrapper, data))
  wrapper.addEventListener('touchstart', e => startLibDrag(e.touches[0], wrapper, data), { passive: false })
}

function startLibDrag(e, wrapper, data) {
  if (e.preventDefault) e.preventDefault()
  const canvasEl = document.querySelector('#canvas-container canvas')
  if (!canvasEl) return
  wrapper.style.display = 'none'
  currentState.usedIdx.add(data.targetIdx)
  const float = createFloat(data.realRx, data.realRy, data.initAngle, data.fill)
  dragging = { ...float, data, libWrapper: wrapper, canvasEl }
  moveFloat(e.clientX, e.clientY)
}

// ── 椭圆几何命中检测（考虑旋转）────────────────────────────
function hitTestPiece(piece, clientX, clientY) {
  const rect = piece.svg.getBoundingClientRect()
  const sz = piece.data.realRx * 2 + 40
  const scale = rect.width / sz  // CSS zoom 缩放比
  const cx = rect.left + rect.width / 2
  const cy = rect.top  + rect.height / 2
  const dx = (clientX - cx) / scale
  const dy = (clientY - cy) / scale
  const rad = -piece.currentAngle * Math.PI / 180
  const lx = dx * Math.cos(rad) - dy * Math.sin(rad)
  const ly = dx * Math.sin(rad) + dy * Math.cos(rad)
  const rx = piece.data.realRx, ry = piece.currentRy
  return (lx * lx) / (rx * rx) + (ly * ly) / (ry * ry) <= 1
}

// ── 已放置椭圆交互 ────────────────────────────────────────
function makePlacedDraggable(svg, piece) {
  let rotTimer = null, rotInterval = null
  let isDragging = false, startX, startY

  const stopRot = () => {
    if (rotTimer)    { clearTimeout(rotTimer);    rotTimer    = null }
    if (rotInterval) { clearInterval(rotInterval); rotInterval = null }
  }

  // pointerdown 由 container 统一分发（见下方 initPieceHitDispatch）
  piece._startPress = (e) => {
    isDragging = false
    startX = e.clientX; startY = e.clientY
    const pid = e.pointerId

    rotTimer = setTimeout(() => {
      rotTimer = null
      if (piece.hardLocked) return
      let elapsed = 0, totalRot = 0
      rotInterval = setInterval(() => {
        elapsed += 16
        const t = Math.max(0, elapsed - 300) / 2000
        const speed = 0.05 + Math.min(t, 1) * 4.95
        totalRot += speed
        if (totalRot > 720) { stopRot(); return }
        piece.currentAngle = (piece.currentAngle + speed) % 360
        updateTransform(piece)
      }, 16)
    }, 400)

    const onMove = (ev) => {
      if (ev.pointerId !== pid) return
      if (Math.hypot(ev.clientX - startX, ev.clientY - startY) > 5 && !isDragging) {
        if (piece.snapped) { stopRot(); return }
        isDragging = true; stopRot()
        ev.preventDefault(); ev.stopPropagation()
        const canvasEl = document.querySelector('#canvas-container canvas')
        if (!canvasEl) return
        const float = createFloat(piece.data.realRx, piece.currentRy, piece.currentAngle, piece.data.fill)
        svg.style.display = 'none'
        if (selectedPiece === piece) selectedPiece = null
        dragging = { ...float, data: piece.data, piece, canvasEl, prevRy: piece.currentRy, prevAngle: piece.currentAngle }
        moveFloat(ev.clientX, ev.clientY)
      }
    }

    const onUp = (ev) => {
      if (ev.pointerId !== pid) return
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
      document.removeEventListener('pointercancel', onUp)
      const wasRotating = rotInterval !== null
      stopRot()
      if (isDragging) { isDragging = false; return }
      if (wasRotating) return
      handleClick(piece)
    }
    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
    document.addEventListener('pointercancel', onUp)
  }
}

// container 统一 pointerdown 分发：倒序检测，找最上层命中的椭圆
function initPieceHitDispatch() {
  const container = document.getElementById('canvas-container')
  container.addEventListener('pointerdown', e => {
    if (!currentState || dragging) return
    // 只处理直接点在 canvas 或 container 上的事件（不拦截已有 SVG 的冒泡）
    const pieces = currentState.placedPieces
    for (let i = pieces.length - 1; i >= 0; i--) {
      const p = pieces[i]
      if (p.svg.style.display === 'none') continue
      if (hitTestPiece(p, e.clientX, e.clientY)) {
        e.preventDefault(); e.stopPropagation()
      if (p.hardLocked) {
        // 锁定状态：直接 toggle 选中，不走 clickCount 计时器
        if (selectedPiece && selectedPiece !== p) deselectPiece(selectedPiece)
        selectedPiece === p ? deselectPiece(p) : selectPiece(p)
        return
      }
        p.svg.setPointerCapture?.(e.pointerId)
        p._startPress(e)
        return
      }
    }
  }, true)  // capture 阶段，优先于 SVG 自身事件
}

// ── 点击逻辑 ──────────────────────────────────────────────
function handleClick(piece) {
  piece.clickCount = (piece.clickCount || 0) + 1
  clearTimeout(piece.clickTimer)
  piece.clickTimer = setTimeout(() => {
    const n = piece.clickCount; piece.clickCount = 0

    if (n === 1) {
      if (!piece.snapped && snapHighlight) {
        doSnap(piece, snapHighlight)
      } else if (!piece.snapped) {
        const snap = getPieceSnap(piece)
        if (snap) { doSnap(piece, snap); return }
        if (selectedPiece && selectedPiece !== piece) deselectPiece(selectedPiece)
        selectedPiece === piece ? deselectPiece(piece) : selectPiece(piece)
      } else {
        // 已吸附：单击仍可选中（用于旋转/缩放），不解锁
        if (selectedPiece && selectedPiece !== piece) deselectPiece(selectedPiece)
        selectedPiece === piece ? deselectPiece(piece) : selectPiece(piece)
      }
    } else if (n === 2) {
      if (!piece.hardLocked) { piece.currentRy = clampRy(piece.currentRy + RY_STEP, piece.data.realRx); updateTransform(piece) }
    } else {
      if (!piece.hardLocked) { piece.currentRy = clampRy(piece.currentRy - RY_STEP, piece.data.realRx); updateTransform(piece) }
    }
  }, 280)
}

// 短暂绿色描边后恢复黑色
function flashStroke(piece, color, restore) {
  piece.el.setAttribute('stroke', color)
  piece.el.setAttribute('stroke-width', '2.5')
  setTimeout(() => {
    piece.el.setAttribute('stroke', restore)
    piece.el.setAttribute('stroke-width', '1')
  }, 300)
}

function getPieceSnap(piece) {
  const sorted = getSortedNodes(currentAnimal)
  const nd = sorted[piece.data.targetIdx]
  if (!nd) return null
  const nx = nd.x * CANVAS, ny = nd.y * CANVAS, nr = nd.r * CANVAS
  const sz = piece.data.realRx * 2 + 40
  const px = parseFloat(piece.svg.style.left) + sz / 2
  const py = parseFloat(piece.svg.style.top)  + sz / 2
  const dist = Math.hypot(px - nx, py - ny)
  return dist < nr + piece.data.realRx ? { x: nx, y: ny, r: nr, idx: piece.data.targetIdx } : null
}

function doSnap(piece, snap) {
  const sz = piece.data.realRx * 2 + 40
  piece.svg.style.left = (snap.x - sz / 2) + 'px'
  piece.svg.style.top  = (snap.y - sz / 2) + 'px'
  piece.nodeIdx = snap.idx; piece.snapped = true
  piece.svg.style.cursor = 'default'
  // order 作为 zIndex：order 越小越在底层，加 100 偏移避免与其他元素冲突
  piece.svg.style.zIndex = 100 + piece.data.order
  snapHighlight = null
  flashStroke(piece, '#4aff8a', 'black')
  checkComplete()
}

// ── 拖动浮层 ──────────────────────────────────────────────
function createFloat(rx, ry, angle, fill) {
  const sz = rx * 2 + 20
  const floatSvg = document.createElementNS('http://www.w3.org/2000/svg','svg')
  floatSvg.setAttribute('width', sz); floatSvg.setAttribute('height', sz)
  floatSvg.style.cssText = position:fixed;pointer-events:none;z-index:500;overflow:visible;
  const floatEl = document.createElementNS('http://www.w3.org/2000/svg','ellipse')
  floatEl.setAttribute('cx', sz/2); floatEl.setAttribute('cy', sz/2)
  floatEl.setAttribute('rx', rx); floatEl.setAttribute('ry', ry)
  floatEl.setAttribute('transform', rotate(${angle||0},${sz/2},${sz/2}))
  floatEl.setAttribute('fill', fill)
  floatEl.setAttribute('stroke', 'black'); floatEl.setAttribute('stroke-width', '1.5')
  floatSvg.appendChild(floatEl); document.body.appendChild(floatSvg)
  return { floatSvg, floatEl, sz }
}

function moveFloat(mx, my) {
  if (!dragging) return
  const { floatSvg, sz, canvasEl, data } = dragging
  floatSvg.style.left = (mx - sz/2) + 'px'
  floatSvg.style.top  = (my - sz/2) + 'px'

  // 将屏幕坐标转换为画布原始坐标（除以 zoomLevel）
  const rect = canvasEl.getBoundingClientRect()
  const zoom = typeof zoomLevel !== 'undefined' ? zoomLevel : 1
  const cx = (mx - rect.left) / zoom
  const cy = (my - rect.top)  / zoom
  const sorted = getSortedNodes(currentAnimal)
  const nd = sorted[data.targetIdx]
  if (nd) {
    const nx = nd.x * CANVAS, ny = nd.y * CANVAS, nr = nd.r * CANVAS
    const dist = Math.hypot(cx - nx, cy - ny)
    if (dist < nr + data.realRx) {
      dragging.snapTarget = { x: nx, y: ny, r: nr, idx: data.targetIdx }
      snapHighlight = { x: nx, y: ny, r: nr }
    } else {
      dragging.snapTarget = null
      snapHighlight = null
    }
  } else {
    snapHighlight = null
    dragging.snapTarget = null
  }
}

const onMove = e => { if (dragging) moveFloat(e.clientX, e.clientY) }
const onTouchMove = e => { if (dragging) { e.preventDefault(); moveFloat(e.touches[0].clientX, e.touches[0].clientY) } }
const onUp = e => {
  if (!dragging) return
  const { floatSvg, data, libWrapper, piece, canvasEl, snapTarget } = dragging
  floatSvg.remove(); snapHighlight = null
  const rect = canvasEl.getBoundingClientRect()
  const zoom = typeof zoomLevel !== 'undefined' ? zoomLevel : 1
  const mx = ((e.clientX ?? e.changedTouches?.[0]?.clientX) - rect.left) / zoom
  const my = ((e.clientY ?? e.changedTouches?.[0]?.clientY) - rect.top)  / zoom

  if (mx >= 0 && my >= 0 && mx <= CANVAS && my <= CANVAS) {
    const ry  = dragging.prevRy    ?? data.realRy
    const ang = dragging.prevAngle ?? data.initAngle
    if (piece) {
      const sz = data.realRx * 2 + 40
      if (snapTarget && !piece.snapped) {
        piece.svg.style.display = ''
        piece.currentRy = ry; piece.currentAngle = ang
        updateTransform(piece)
        doSnap(piece, snapTarget)
      } else {
        piece.svg.style.left = (mx - sz/2) + 'px'
        piece.svg.style.top  = (my - sz/2) + 'px'
        piece.currentRy = ry; piece.currentAngle = ang
        piece.svg.style.display = ''
        updateTransform(piece)
      }
    } else {
      const newPiece = placePiece({ x: mx, y: my }, data, ry, ang)
      if (snapTarget) doSnap(newPiece, snapTarget)
    }
  } else {
    const dropX = e.clientX ?? e.changedTouches?.[0]?.clientX
    const dropY = e.clientY ?? e.changedTouches?.[0]?.clientY
    const lib = document.getElementById('ellipse-library')
    const libRect = lib?.getBoundingClientRect()
    const inLib = libRect && dropX >= libRect.left && dropX <= libRect.right && dropY >= libRect.top && dropY <= libRect.bottom

    if (libWrapper) {
      libWrapper.style.display = ''
      currentState.usedIdx.delete(data.targetIdx)
    } else if (piece) {
      if (inLib) {
        // 归位：移除已放置椭圆，恢复组件库
        piece.svg.remove()
        const idx = currentState.placedPieces.indexOf(piece)
        if (idx !== -1) currentState.placedPieces.splice(idx, 1)
        const realIdx = piece.nodeIdx >= 0 ? piece.nodeIdx : piece.data.targetIdx
        currentState.usedIdx.delete(realIdx)
        buildLibrary(currentAnimal)
      } else {
        piece.svg.style.display = ''
      }
    }
  }
  dragging = null
}
document.addEventListener('mousemove', onMove)
document.addEventListener('mouseup', onUp)
document.addEventListener('touchmove', onTouchMove, { passive: false })
document.addEventListener('touchend', onUp)

// ── 放置椭圆 ──────────────────────────────────────────────
function placePiece(pos, data, initRy, initAngle) {
  const container = document.getElementById('canvas-container')
  container.style.position = 'relative'

  const sz = data.realRx * 2 + 40
  const svg = document.createElementNS('http://www.w3.org/2000/svg','svg')
  svg.setAttribute('width', sz); svg.setAttribute('height', sz)
  svg.classList.add('placed-ellipse')
  svg.style.cssText = position:absolute;overflow:visible;z-index:150;cursor:grab;touch-action:none;
  svg.style.left = (pos.x - sz/2) + 'px'
  svg.style.top  = (pos.y - sz/2) + 'px'

  const el = document.createElementNS('http://www.w3.org/2000/svg','ellipse')
  el.setAttribute('cx', sz/2); el.setAttribute('cy', sz/2)
  el.setAttribute('rx', data.realRx)  // 长轴固定
  el.setAttribute('ry', initRy)
  el.setAttribute('fill', data.fill)
  el.setAttribute('stroke', 'black'); el.setAttribute('stroke-width', '1')
  svg.appendChild(el)
  container.appendChild(svg)

  const piece = {
    svg, el, nodeIdx: -1, snapped: false, data,
    currentAngle: initAngle ?? data.initAngle,
    currentRy: initRy,
    clickCount: 0, clickTimer: null
  }
  currentState.placedPieces.push(piece)
  selectedPiece = piece
  updateTransform(piece)
  makePlacedDraggable(svg, piece)
  return piece
}

function updateTransform(piece) {
  const sz = piece.data.realRx * 2 + 40
  piece.el.setAttribute('ry', piece.currentRy)
  piece.el.setAttribute('transform', rotate(${piece.currentAngle},${sz/2},${sz/2}))
}

function clampRy(ry, maxRx) {
  return Math.max(maxRx * 0.05, Math.min(maxRx, ry))
}

function selectPiece(piece) {
  selectedPiece = piece
  flashStroke(piece, '#a4e1ff', 'black')
  updateLockBtn(piece)
}

function deselectPiece(piece) {
  if (selectedPiece === piece) selectedPiece = null
  piece.el.setAttribute('stroke', 'black')
  piece.el.setAttribute('stroke-width', '1')
  updateLockBtn(null)
}

function updateLockBtn(piece) {
  const btn     = document.getElementById('lock-btn')
  const actions = document.getElementById('piece-actions')
  if (!btn || !actions) return
  actions.style.display = piece ? 'flex' : 'none'
  if (!piece) return
  btn.textContent = piece.hardLocked ? 'Unlock' : 'Lock'
  btn.classList.toggle('locked', !!piece.hardLocked)
}

function shiftLayer(dir) {
  if (!selectedPiece) return
  selectedPiece.svg.style.zIndex = (parseInt(selectedPiece.svg.style.zIndex) || 100) + dir
}

function toggleLockSelected() {
  if (!selectedPiece) return
  const piece = selectedPiece
  piece.hardLocked = !piece.hardLocked
  piece.svg.style.cursor = piece.hardLocked ? 'pointer' : 'grab'
  piece.el.style.strokeDasharray = piece.hardLocked ? '4 2' : ''
  piece.el.setAttribute('stroke', 'black')
  piece.el.setAttribute('stroke-width', piece.hardLocked ? '1.5' : '1')
  updateLockBtn(piece)
}

function backToLibrary() {
  if (!selectedPiece) return
  const piece = selectedPiece
  deselectPiece(piece)
  piece.svg.remove()
  const idx = currentState.placedPieces.indexOf(piece)
  if (idx !== -1) currentState.placedPieces.splice(idx, 1)
  // 用 nodeIdx（真实圆索引）删除，兼容 feature piece（targetIdx 为负数）
  const realIdx = piece.nodeIdx >= 0 ? piece.nodeIdx : piece.data.targetIdx
  currentState.usedIdx.delete(realIdx)
  buildLibrary(currentAnimal)
}

document.getElementById('canvas-container').addEventListener('pointerdown', e => {
  if (e.target.tagName === 'canvas' && selectedPiece) {
    deselectPiece(selectedPiece)
    updateLockBtn(null)
  }
})

document.addEventListener('keydown', e => {
  if ((e.key === 'r' || e.key === 'R') && selectedPiece) {
    selectedPiece.currentAngle = (selectedPiece.currentAngle + 15) % 360
    updateTransform(selectedPiece)
  }
})

function autoPlace() {
  if (!currentState) return
  const animal = currentAnimal
  const sorted = getSortedNodes(animal)
  const eList  = matchEllipsesToNodes(animal)

  // 第一阶段：把库里剩余椭圆归位到圆心
  const pending = []
  sorted.forEach((n, i) => {
    if (currentState.usedIdx.has(i)) return
    const ed = eList[i] || {}
    pending.push({ i, n, ed })
  })
  pending.sort((a, b) => (a.ed.order || 500) - (b.ed.order || 500))

  if (pending.length > 0) {
    // 第一阶段：归位
    let delay = 0
    pending.forEach(({ i, n, ed }) => {
      setTimeout(() => {
        const fill = '#a4e1ff'
        const realRx = n.r * CANVAS
        const edRx   = (ed.rx || n.r) * CANVAS
        const edRy   = (ed.ry || n.r) * CANVAS
        const realRy = Math.min(edRx, edRy)
        const angle  = ed.angle || 0
        const order  = ed.order || 500
        const nx = n.x * CANVAS, ny = n.y * CANVAS
        const data = { realRx, realRy, initAngle: angle, fill, targetIdx: i, order }
        currentState.usedIdx.add(i)
        const piece = placePiece({ x: nx, y: ny }, data, realRy, angle)
        doSnap(piece, { x: nx, y: ny, r: n.r * CANVAS, idx: i })
        const lib = document.getElementById('ellipse-library')
        lib.querySelectorAll('[data-idx]').forEach(w => {
          if (parseInt(w.dataset.idx) === i) w.remove()
        })
      }, delay)
      delay += 80
    })
    currentState._autoStage = 1
  } else if (currentState._autoStage === 1) {
    // 第二阶段：动画旋转+拉伸到参考角度和 ry
    currentState._autoStage = 2
    const pieces = currentState.placedPieces
    pieces.forEach((piece, pi) => {
      if (piece.nodeIdx < 0) return  // 跳过 feature 椭圆
      const i = piece.nodeIdx >= 0 ? piece.nodeIdx : piece.data.targetIdx
      const ed = eList[i] || {}
      const targetAngle = ed.angle || 0
      const edRx = (ed.rx || 0) * CANVAS
      const edRy = (ed.ry || 0) * CANVAS
      const targetRy = Math.min(edRx, edRy)
      if (piece.hardLocked) return

      const startAngle = piece.currentAngle
      const startRy    = piece.currentRy
      const dur = 600
      const t0  = performance.now()

      // 角度差取最短路径
      let dAngle = ((targetAngle - startAngle) % 360 + 540) % 360 - 180

      const animate = (now) => {
        const t = Math.min((now - t0) / dur, 1)
        const ease = t < 0.5 ? 2*t*t : -1+(4-2*t)*t
        piece.currentAngle = startAngle + dAngle * ease
        piece.currentRy    = startRy + (targetRy - startRy) * ease
        updateTransform(piece)
        if (t < 1) requestAnimationFrame(animate)
      }
      setTimeout(() => requestAnimationFrame(animate), pi * 40)
    })
  }
}

function checkComplete() {}

initPieceHitDispatch()
