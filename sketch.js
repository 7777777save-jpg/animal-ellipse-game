const CANVAS       = 900
const BG           = [0, 23, 56]
const WHITE        = [255, 255, 255]
const GRID_COLOR   = [164, 225, 255]
const STEP_DELAY   = 0.06
const RIPPLE_DUR   = 5.76
const POINT_PHASE  = RIPPLE_DUR * 0.30

let allNodes = {}
let allGrids = {}
let currentAnimal = 'lu'
let circles  = []
let gridData = {'1':[],'2':[],'3':[],'4':[]}
let startTime = 0
let _pauseUntil = 0
const ANIMALS = ['lu','canglu','e','gezi','tuzi','he']
let _idleCycle = 0

// 播放序列：两两叠加 → 各自单独
const SEQUENCE = [
  { type: 'duo',  animals: ['lu', 'gezi']     },
  { type: 'solo', animal:  'lu'               },
  { type: 'solo', animal:  'gezi'             },
  { type: 'duo',  animals: ['tuzi', 'he']     },
  { type: 'solo', animal:  'tuzi'             },
  { type: 'solo', animal:  'he'               },
  { type: 'duo',  animals: ['e', 'canglu']    },
  { type: 'solo', animal:  'e'                },
  { type: 'solo', animal:  'canglu'           },
]
let seqIndex = 0

function preload() {
  loadJSON(
    'circle_nodes.json',
    data => { allNodes = data || {} },
    err => {
      allNodes = {}
      if (typeof showLoadError === 'function') {
        showLoadError('读取 circle_nodes.json 失败。', err?.message || String(err))
      }
    }
  )
  loadJSON(
    'grid_nodes.json',
    data => { allGrids = data || {} },
    err => {
      allGrids = {}
      if (typeof showLoadError === 'function') {
        showLoadError('读取 grid_nodes.json 失败。', err?.message || String(err))
      }
    }
  )
}

function setup() {
  createCanvas(CANVAS, CANVAS).parent('canvas-container')
  frameRate(60)
  if (typeof window !== 'undefined' && window.__startupErrors && window.__startupErrors.length) {
    noLoop()
    return
  }
  applyStep(seqIndex)
}

function buildCircles(name) {
  const nodes = (allNodes[name] || []).slice().sort((a, b) => b.r - a.r)
  const maxR  = nodes.length ? nodes[0].r : 1
  return nodes.map((n, i) => {
    const appear    = i * STEP_DELAY
    const rippleEnd = appear + RIPPLE_DUR + (Math.random() * 0.3 - 0.15)
    const sizeRatio = n.r / maxR
    const bigBonus  = i < 6 ? 1.3 : 1.0
    const fadeStart = POINT_PHASE * (0.4 + 0.6 * sizeRatio) * bigBonus + (Math.random() * 0.16 - 0.08)
    const fadeEnd   = fadeStart + (0.06 + Math.random() * 0.06) * bigBonus
    return { x: n.x * CANVAS, y: n.y * CANVAS, target: n.r * CANVAS,
             appear, rippleEnd, fadeStart, fadeEnd }
  })
}

function applyStep(idx) {
  const step = SEQUENCE[idx % SEQUENCE.length]
  if (step.type === 'duo') {
    const [a1, a2] = step.animals
    circles      = [...buildCircles(a1), ...buildCircles(a2)]
    currentAnimal = a1
    gridData     = {'1':[],'2':[],'3':[],'4':[]}   // 叠加时不显示网格
    // 叠加时不高亮任何动物按钮
    document.querySelectorAll('button').forEach(b => b.classList.remove('active'))
  } else {
    currentAnimal = step.animal
    circles  = buildCircles(step.animal)
    gridData = allGrids[step.animal] || {'1':[],'2':[],'3':[],'4':[]}
    _updateButtons()
  }
  startTime   = millis()
  _pauseUntil = 0
}

function _updateButtons() {
  const nameMap = { lu:'鹿', canglu:'苍鹭', e:'鹅', gezi:'鸽子', tuzi:'兔子', he:'鹤' }
  document.querySelectorAll('button').forEach(b => {
    b.classList.toggle('active', b.textContent === nameMap[currentAnimal])
  })
}

function switchAnimal(name) {
  const prev    = currentAnimal
  currentAnimal = name
  circles  = buildCircles(name)
  gridData = allGrids[name] || {'1':[],'2':[],'3':[],'4':[]}
  startTime   = millis()
  _pauseUntil = 0
  _idleCycle  = 0

  // 找到该动物 solo 步骤，下次自动从那之后继续序列
  const soloIdx = SEQUENCE.findIndex(s => s.type === 'solo' && s.animal === name)
  seqIndex = soloIdx >= 0 ? soloIdx : 0

  if (typeof onAnimalSwitch !== 'undefined') onAnimalSwitch(prev, name)
  else if (typeof clearLibrary !== 'undefined' && gameMode) buildLibrary()
  else if (typeof clearLibrary !== 'undefined') clearLibrary()

  _updateButtons()
}

// 动画总时长：最后一个圆扩散完毕
function cycleDuration() {
  return circles.reduce((m, c) => Math.max(m, c.rippleEnd), 0)
}

function draw() {
  background(...BG)

  const now = millis()

  // 序列推进（idle 状态）
  if (!(typeof gameMode !== 'undefined' && gameMode)) {
    const elapsed = (now - startTime) / 1000
    const dur     = cycleDuration()
    if (dur > 0 && elapsed >= dur) {
      if (_pauseUntil === 0) _pauseUntil = now + 500
      if (now >= _pauseUntil) {
        seqIndex = (seqIndex + 1) % SEQUENCE.length
        applyStep(seqIndex)
      }
    }
  }

  const elapsed = (now - startTime) / 1000

  drawGrid(elapsed)
  strokeWeight(0.8)
  drawCircleSet(circles, elapsed)

  if (typeof snapHighlight !== 'undefined' && snapHighlight) {
    noFill()
    stroke(164, 225, 255, 200)
    strokeWeight(3)
    ellipse(snapHighlight.x, snapHighlight.y, snapHighlight.r * 2, snapHighlight.r * 2)
    strokeWeight(0.8)
  }

  if (typeof _flashEnd !== 'undefined' && millis() < _flashEnd) {
    const t = (millis() % 500) / 500
    const a = sin(t * PI) * 200
    const nodes = (typeof allNodes !== 'undefined' && allNodes[currentAnimal]) || []
    noFill(); strokeWeight(4)
    stroke(255, 255, 255, a)
    nodes.forEach(n => ellipse(n.x * CANVAS, n.y * CANVAS, n.r * CANVAS * 2, n.r * CANVAS * 2))
    strokeWeight(0.8)
  }
}

function drawCircleSet(circleArr, elapsed) {
  for (let c of circleArr) {
    if (elapsed < c.appear) continue

    const rippleT  = min((elapsed - c.appear) / (c.rippleEnd - c.appear), 1)
    const rippleTe = 1 - pow(1 - rippleT, 2)
    const r        = c.target * rippleTe

    if (elapsed < c.fadeEnd) {
      const ptAlpha = elapsed < c.fadeStart ? 220
                    : map(elapsed, c.fadeStart, c.fadeEnd, 220, 0)
      noStroke()
      fill(WHITE[0], WHITE[1], WHITE[2], ptAlpha)
      ellipse(c.x, c.y, 5, 5)
    }

    noFill()
    stroke(WHITE[0], WHITE[1], WHITE[2], map(rippleTe, 0, 1, 40, 220))
    ellipse(c.x, c.y, r * 2, r * 2)
  }
}

function drawGrid(elapsed) {
  noFill()
  rectMode(CORNER)
  strokeWeight(0.4)

  const stages = [
    { key:'1', start:0, end:1,   alpha:30 },
    { key:'2', start:2, end:3,   alpha:25 },
    { key:'3', start:4, end:5,   alpha:20 },
    { key:'4', start:6, end:6.8, alpha:16 }
  ]

  for (let s of stages) {
    if (elapsed < s.start) continue
    const a = map(min(elapsed, s.end), s.start, s.end, 0, s.alpha)
    stroke(GRID_COLOR[0], GRID_COLOR[1], GRID_COLOR[2], a)
    for (let r of (gridData[s.key] || []))
      rect(r.x * CANVAS, r.y * CANVAS, r.w * CANVAS, r.h * CANVAS)
  }
}

let _flashEnd = 0
function triggerCompleteFlash() { _flashEnd = millis() + 600 }
