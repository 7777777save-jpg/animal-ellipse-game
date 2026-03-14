// game.js — 椭圆拼图游戏
const ANIMAL_NAMES = { lu:'鹿', gezi:'鸽子', tuzi:'兔子', he:'鹤', e:'鹅', canglu:'苍鹭' }
const SNAP_RATIO   = 0.4
const ROT_SPEED    = 2  // 长按旋转速度（度/帧）

let gameMode     = false
let ellipseData  = {}
let libraryItems = []
let placedPieces = []
let dragging     = null
let rotInterval  = null  // 长按旋转定时器
let selectedPiece = null // 当前选中的已放置椭圆

fetch('ellipse_data.json').then(r => r.json()).then(d => { ellipseData = d })

function togglePlay() {
  gameMode = !gameMode
  const panel = document.getElementById('panel')
  const btn   = document.getElementById('play-btn')
  if (gameMode) {
    panel.classList.add('open')
    btn.textContent = '■ STOP'
    buildLibrary()
  } else {
    panel.classList.remove('open')
    btn.textContent = '▶ PLAY'
    clearLibrary()
  }
}

function buildLibrary() {
  const lib = document.getElementById('ellipse-library')
  lib.innerHTML = ''
  libraryItems = []
  placedPieces = []
  selectedPiece = null
  document.querySelectorAll('.placed-ellipse').forEach(e => e.remove())
  document.getElementById('complete-msg').style.display = 'none'

  const animal = currentAnimal
  const nodes  = (typeof allNodes !== 'undefined' && allNodes[animal]) || []
  const eData  = ellipseData[animal] || []

  // 按半径从大到小排序
  const sorted = nodes.slice().sort((a, b) => b.r - a.r)

  sorted.forEach((n, i) => {
    const longAxis  = n.r * CANVAS * 2
    const libShort  = longAxis * 0.25   // 库中显示用的短轴（紧凑）
    const shortAxis = longAxis * 0.5    // 初始放置短轴
    const eColor = eData[i] || {}
    const fill   = (eColor.fill && eColor.fill !== 'none') ? eColor.fill : '#a4e1ff'
    const stroke = eColor.stroke || '#fff'

    // 竖向放置：宽=libShort+16，高=longAxis+16
    const bw = Math.ceil(libShort + 16)
    const bh = Math.ceil(longAxis + 16)
    const wrapper = document.createElement('div')
    wrapper.style.cssText = `position:relative;width:${bw}px;height:${bh}px;cursor:grab;flex-shrink:0;`

    const svg = document.createElementNS('http://www.w3.org/2000/svg','svg')
    svg.setAttribute('width', bw)
    svg.setAttribute('height', bh)
    svg.style.overflow = 'visible'

    const el = document.createElementNS('http://www.w3.org/2000/svg','ellipse')
    el.setAttribute('cx', bw/2)
    el.setAttribute('cy', bh/2)
    el.setAttribute('rx', libShort/2)   // 短轴横向
    el.setAttribute('ry', longAxis/2)   // 长轴竖向
    el.setAttribute('fill', fill)
    el.setAttribute('stroke', stroke)
    el.setAttribute('stroke-width', '1')
    svg.appendChild(el)
    wrapper.appendChild(svg)
    lib.appendChild(wrapper)

    const item = { wrapper, data: { longAxis, shortAxis, fill, stroke, nodeR: n.r * CANVAS, nodeIdx: i }, used: false }
    libraryItems.push(item)
    makeDraggable(wrapper, item)
  })
}

function clearLibrary() {
  document.getElementById('ellipse-library').innerHTML = ''
  document.querySelectorAll('.placed-ellipse').forEach(e => e.remove())
  libraryItems = []
  placedPieces = []
  selectedPiece = null
  document.getElementById('complete-msg').style.display = 'none'
}

// ── 从库拖拽 ──────────────────────────────────────────────
function makeDraggable(wrapper, item) {
  wrapper.addEventListener('mousedown', e => startLibDrag(e, item))
  wrapper.addEventListener('touchstart', e => startLibDrag(e.touches[0], item), { passive: false })
}

function startLibDrag(e, item) {
  if (item.used) return
  if (e.preventDefault) e.preventDefault()
  const canvasEl = document.querySelector('#canvas-container canvas')
  if (!canvasEl) return
  const { data } = item
  const float = createFloat(data.longAxis, data.shortAxis, 0, data.fill, data.stroke)
  dragging = { ...float, data, item, canvasEl }
  moveFloat(e.clientX, e.clientY)
}

// ── 已放置椭圆拖拽 ────────────────────────────────────────
function makePlacedDraggable(svg, piece, item) {
  let pressTimer = null
  let didRotate  = false

  const onDown = e => {
    if (piece.locked) { toggleLock(piece); return }
    if (e.preventDefault) e.preventDefault()
    if (e.stopPropagation) e.stopPropagation()

    didRotate = false

    // 长按400ms开始旋转
    pressTimer = setTimeout(() => {
      pressTimer = null
      didRotate = true
      startRotate(piece)
    }, 400)
  }

  const onUp = () => {
    const wasLongPress = didRotate
    if (pressTimer) { clearTimeout(pressTimer); pressTimer = null }
    stopRotate()

    if (wasLongPress) return  // 长按旋转结束，不触发拖拽

    // 短按：选中/取消选中，显示/隐藏控制点
    if (selectedPiece && selectedPiece !== piece) deselectPiece(selectedPiece)
    if (selectedPiece === piece) {
      deselectPiece(piece)
    } else {
      selectPiece(piece)
    }
  }

  const onMoveStart = e => {
    // 移动超过5px视为拖拽，取消长按
    if (pressTimer) { clearTimeout(pressTimer); pressTimer = null }
    if (didRotate) return
    if (piece.locked) return
    if (e.preventDefault) e.preventDefault()
    if (e.stopPropagation) e.stopPropagation()

    const canvasEl = document.querySelector('#canvas-container canvas')
    if (!canvasEl) return
    const float = createFloat(piece.data.longAxis, piece.currentRy * 2, piece.currentAngle, piece.data.fill, piece.data.stroke)

    svg.remove()
    placedPieces = placedPieces.filter(p => p !== piece)
    if (selectedPiece === piece) selectedPiece = null

    dragging = { ...float, data: piece.data, item, canvasEl, prevRy: piece.currentRy, prevAngle: piece.currentAngle }
    moveFloat(e.clientX ?? e.touches?.[0]?.clientX, e.clientY ?? e.touches?.[0]?.clientY)
  }

  // 用 pointerdown/pointermove 区分点击和拖拽
  let startX, startY
  svg.addEventListener('pointerdown', e => {
    startX = e.clientX; startY = e.clientY
    onDown(e)
  })
  svg.addEventListener('pointermove', e => {
    if (!pressTimer && !didRotate) return
    if (Math.hypot(e.clientX - startX, e.clientY - startY) > 5) {
      onMoveStart(e)
    }
  })
  svg.addEventListener('pointerup', onUp)
  svg.addEventListener('pointercancel', () => {
    if (pressTimer) { clearTimeout(pressTimer); pressTimer = null }
    stopRotate()
  })
}

function createFloat(longAxis, shortAxis, angle, fill, stroke) {
  const sz = longAxis + 20
  const floatSvg = document.createElementNS('http://www.w3.org/2000/svg','svg')
  floatSvg.setAttribute('width', sz)
  floatSvg.setAttribute('height', sz)
  floatSvg.style.cssText = `position:fixed;pointer-events:none;z-index:500;overflow:visible;`
  const floatEl = document.createElementNS('http://www.w3.org/2000/svg','ellipse')
  floatEl.setAttribute('cx', sz/2)
  floatEl.setAttribute('cy', sz/2)
  floatEl.setAttribute('rx', longAxis/2)
  floatEl.setAttribute('ry', shortAxis/2)
  floatEl.setAttribute('transform', `rotate(${angle},${sz/2},${sz/2})`)
  floatEl.setAttribute('fill', fill)
  floatEl.setAttribute('stroke', stroke)
  floatEl.setAttribute('stroke-width', '1.5')
  floatSvg.appendChild(floatEl)
  document.body.appendChild(floatSvg)
  return { floatSvg, floatEl, sz }
}

let snapHighlight = null  // { x, y, r } 当前高亮的目标圆

function moveFloat(mx, my) {
  if (!dragging) return
  const { floatSvg, sz, canvasEl } = dragging
  floatSvg.style.left = (mx - sz/2) + 'px'
  floatSvg.style.top  = (my - sz/2) + 'px'
  const rect = canvasEl.getBoundingClientRect()
  const snap = findSnap(mx - rect.left, my - rect.top)
  dragging.floatEl.setAttribute('stroke', snap ? '#a4e1ff' : (dragging.data.stroke || '#fff'))
  snapHighlight = snap || null
}

const onMove = e => { if (dragging) moveFloat(e.clientX, e.clientY) }
const onTouchMove = e => { if (dragging) { e.preventDefault(); moveFloat(e.touches[0].clientX, e.touches[0].clientY) } }
const onUp = e => {
  if (!dragging) return
  const { floatSvg, data, item, canvasEl } = dragging
  floatSvg.remove()
  snapHighlight = null
  const rect = canvasEl.getBoundingClientRect()
  const mx = (e.clientX ?? e.changedTouches?.[0]?.clientX) - rect.left
  const my = (e.clientY ?? e.changedTouches?.[0]?.clientY) - rect.top
  if (mx >= 0 && my >= 0 && mx <= CANVAS && my <= CANVAS) {
    const snap = findSnap(mx, my)
    const pos  = snap || { x: mx, y: my, idx: -1 }
    const ry   = dragging.prevRy ?? data.shortAxis / 2
    const ang  = dragging.prevAngle ?? 0
    placePiece(pos, data, item, ry, ang)
  } else {
    // 放回库
    if (item) { item.used = false; item.wrapper.style.display = '' }
  }
  dragging = null
}
document.addEventListener('mousemove', onMove)
document.addEventListener('mouseup', onUp)
document.addEventListener('touchmove', onTouchMove, { passive: false })
document.addEventListener('touchend', onUp)

function findSnap(mx, my) {
  const nodes = (typeof allNodes !== 'undefined' && allNodes[currentAnimal]) || []
  let best = null, bestDist = Infinity
  nodes.forEach((n, i) => {
    const nx = n.x * CANVAS, ny = n.y * CANVAS, nr = n.r * CANVAS
    const dist = Math.hypot(mx - nx, my - ny)
    if (dist < nr * SNAP_RATIO && dist < bestDist) { bestDist = dist; best = { x: nx, y: ny, r: nr, idx: i } }
  })
  return best
}

// ── 放置椭圆 ──────────────────────────────────────────────
function placePiece(pos, data, item, initRy, initAngle) {
  const container = document.getElementById('canvas-container')
  container.style.position = 'relative'

  const sz  = data.longAxis + 40  // 留出控制点空间
  const svg = document.createElementNS('http://www.w3.org/2000/svg','svg')
  svg.setAttribute('width', sz)
  svg.setAttribute('height', sz)
  svg.classList.add('placed-ellipse')
  svg.style.cssText = `position:absolute;overflow:visible;z-index:${100+(pos.idx>=0?pos.idx:50)};cursor:grab;touch-action:none;`
  svg.style.left = (pos.x - sz/2) + 'px'
  svg.style.top  = (pos.y - sz/2) + 'px'

  const el = document.createElementNS('http://www.w3.org/2000/svg','ellipse')
  el.setAttribute('cx', sz/2)
  el.setAttribute('cy', sz/2)
  el.setAttribute('rx', data.longAxis/2)
  const ry0 = initRy ?? data.shortAxis/2
  el.setAttribute('ry', ry0)
  el.setAttribute('fill', data.fill)
  el.setAttribute('stroke', data.stroke || '#fff')
  el.setAttribute('stroke-width', '1')
  svg.appendChild(el)

  // 短轴控制点（默认隐藏，选中时显示）
  const cp1 = makeControlPoint(sz/2, sz/2 - ry0)
  const cp2 = makeControlPoint(sz/2, sz/2 + ry0)
  cp1.style.display = 'none'
  cp2.style.display = 'none'
  svg.appendChild(cp1)
  svg.appendChild(cp2)

  container.appendChild(svg)
  item.used = true
  item.wrapper.style.display = 'none'

  const piece = { svg, el, cp1, cp2, nodeIdx: pos.idx, data, currentAngle: initAngle ?? 0, currentRy: ry0, locked: false }
  placedPieces.push(piece)
  selectedPiece = piece

  updateTransform(piece)
  attachControlPoints(piece)
  makePlacedDraggable(svg, piece, item)

  // 滚轮缩放短轴
  svg.addEventListener('wheel', ev => {
    if (piece.locked) return
    ev.preventDefault()
    piece.currentRy = clampRy(piece.currentRy - ev.deltaY * 0.1, data.longAxis)
    updateTransform(piece)
  }, { passive: false })

  checkComplete()
}

function makeControlPoint(cx, cy) {
  const c = document.createElementNS('http://www.w3.org/2000/svg','circle')
  c.setAttribute('cx', cx)
  c.setAttribute('cy', cy)
  c.setAttribute('r', 6)
  c.setAttribute('fill', '#a4e1ff')
  c.setAttribute('stroke', '#fff')
  c.setAttribute('stroke-width', '1')
  c.style.cursor = 'ns-resize'
  return c
}

function attachControlPoints(piece) {
  const { cp1, cp2, data } = piece

  ;[cp1, cp2].forEach((cp, idx) => {
    const onCpDown = e => {
      if (piece.locked) return
      e.stopPropagation()
      e.preventDefault()
      const startY = e.clientY ?? e.touches?.[0]?.clientY
      const startRy = piece.currentRy
      const sign = idx === 0 ? 1 : -1  // cp1在上：向上拖(y减小)→delta为负→ry减小

      const onMove = ev => {
        const y = ev.clientY ?? ev.touches?.[0]?.clientY
        const delta = (y - startY) * sign
        piece.currentRy = clampRy(startRy - delta, data.longAxis)
        updateTransform(piece)
      }
      const onEnd = () => {
        document.removeEventListener('mousemove', onMove)
        document.removeEventListener('mouseup', onEnd)
        document.removeEventListener('touchmove', onMove)
        document.removeEventListener('touchend', onEnd)
      }
      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', onEnd)
      document.addEventListener('touchmove', onMove, { passive: false })
      document.addEventListener('touchend', onEnd)
    }
    cp.addEventListener('mousedown', onCpDown)
    cp.addEventListener('touchstart', e => onCpDown(e.touches[0]), { passive: false })
  })
}

function updateTransform(piece) {
  const { el, cp1, cp2, data, currentAngle, currentRy } = piece
  const sz = data.longAxis + 40
  el.setAttribute('ry', currentRy)
  el.setAttribute('transform', `rotate(${currentAngle},${sz/2},${sz/2})`)
  // 控制点跟随短轴（未旋转坐标，始终在椭圆短轴端点）
  cp1.setAttribute('cx', sz/2)
  cp1.setAttribute('cy', sz/2 - currentRy)
  cp2.setAttribute('cx', sz/2)
  cp2.setAttribute('cy', sz/2 + currentRy)
}

function clampRy(ry, longAxis) {
  return Math.max(longAxis * 0.35 / 2, Math.min(longAxis * 0.8 / 2, ry))
}

// ── 选中 / 取消选中 ───────────────────────────────────────
function selectPiece(piece) {
  selectedPiece = piece
  piece.cp1.style.display = ''
  piece.cp2.style.display = ''
}

function deselectPiece(piece) {
  if (selectedPiece === piece) selectedPiece = null
  piece.cp1.style.display = 'none'
  piece.cp2.style.display = 'none'
}

// 点击画布空白处取消选中
document.getElementById('canvas-container').addEventListener('pointerdown', e => {
  if (e.target.tagName === 'canvas' && selectedPiece) deselectPiece(selectedPiece)
})

// ── 锁定 / 解锁 ───────────────────────────────────────────
function toggleLock(piece) {
  piece.locked = !piece.locked
  piece.svg.style.cursor = piece.locked ? 'default' : 'grab'
  piece.el.setAttribute('stroke-width', piece.locked ? '2' : '1')
  piece.el.setAttribute('stroke', piece.locked ? '#4aff8a' : (piece.data.stroke || '#fff'))
  piece.cp1.style.display = piece.locked ? 'none' : ''
  piece.cp2.style.display = piece.locked ? 'none' : ''
}

// ── 长按旋转 ──────────────────────────────────────────────
function startRotate(piece) {
  stopRotate()
  rotInterval = setInterval(() => {
    if (!piece || piece.locked) { stopRotate(); return }
    piece.currentAngle = (piece.currentAngle + ROT_SPEED) % 360
    updateTransform(piece)
  }, 16)
}
function stopRotate() {
  if (rotInterval) { clearInterval(rotInterval); rotInterval = null }
}

// R键旋转最后选中的椭圆
document.addEventListener('keydown', e => {
  if (e.key !== 'r' && e.key !== 'R') return
  const p = selectedPiece || placedPieces[placedPieces.length - 1]
  if (!p || p.locked) return
  p.currentAngle = (p.currentAngle + 15) % 360
  updateTransform(p)
})

function checkComplete() {
  const total   = ((typeof allNodes !== 'undefined' && allNodes[currentAnimal]) || []).length
  const snapped = placedPieces.filter(p => p.nodeIdx >= 0).length
  if (snapped >= total) {
    const msg = document.getElementById('complete-msg')
    msg.textContent = `🎉 ${ANIMAL_NAMES[currentAnimal] || currentAnimal}`
    msg.style.display = 'block'
    setTimeout(() => msg.style.display = 'none', 3000)
  }
}
