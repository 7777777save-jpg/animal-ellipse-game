const CANVAS       = 900
const BG           = [0, 23, 56]
const WHITE        = [255, 255, 255]
const GRID_COLOR   = [164, 225, 255]
const STEP_DELAY   = 0.05
const RIPPLE_DUR   = 6.0
const POINT_PHASE  = RIPPLE_DUR * 0.30  // 点只存在于前30%时间内

let allNodes = {}
let allGrids = {}
let currentAnimal = 'lu'
let circles  = []
let gridData = {'1':[],'2':[],'3':[],'4':[]}
let startTime = 0

function preload() {
  allNodes = loadJSON('circle_nodes.json')
  allGrids = loadJSON('grid_nodes.json')
}

function setup() {
  createCanvas(CANVAS, CANVAS).parent('canvas-container')
  frameRate(60)
  switchAnimal(currentAnimal)
}

function switchAnimal(name) {
  const prev = currentAnimal
  currentAnimal = name

  // 按半径从大到小排序
  const nodes = (allNodes[name] || []).slice().sort((a, b) => b.r - a.r)
  const maxR  = nodes.length ? nodes[0].r : 1

  circles = nodes.map((n, i) => {
    const appear    = i * STEP_DELAY
    const rippleEnd = appear + RIPPLE_DUR + (Math.random() * 0.3 - 0.15)
    const sizeRatio = n.r / maxR
    const bigBonus  = i < 6 ? 1.3 : 1.0
    const fadeStart = POINT_PHASE * (0.4 + 0.6 * sizeRatio) * bigBonus + (Math.random() * 0.16 - 0.08)
    const fadeEnd   = fadeStart + (0.06 + Math.random() * 0.06) * bigBonus
    return { x: n.x * CANVAS, y: n.y * CANVAS, target: n.r * CANVAS,
             appear, rippleEnd, fadeStart, fadeEnd }
  })

  gridData = allGrids[name] || {'1':[],'2':[],'3':[],'4':[]}
  startTime = millis()

  // 切换动物时保存/恢复状态
  if (typeof onAnimalSwitch !== 'undefined') onAnimalSwitch(prev, name)
  else if (typeof clearLibrary !== 'undefined' && gameMode) buildLibrary()
  else if (typeof clearLibrary !== 'undefined') clearLibrary()

  document.querySelectorAll('button').forEach(b => {
    b.classList.toggle('active', b.textContent === {
      lu:'鹿', canglu:'苍鹭', e:'鹅', gezi:'鸽子', tuzi:'兔子', he:'鹤'
    }[name])
  })
}

function draw() {
  background(...BG)
  const elapsed = (millis() - startTime) / 1000

  drawGrid(elapsed)

  strokeWeight(0.8)

  for (let c of circles) {
    if (elapsed < c.appear) continue

    const rippleT  = min((elapsed - c.appear) / (c.rippleEnd - c.appear), 1)
    const rippleTe = 1 - pow(1 - rippleT, 2)  // easeOut
    const r        = c.target * rippleTe

    // 点：出现后显示，按 sizeRatio 决定淡出时机
    if (elapsed >= c.appear && elapsed < c.fadeEnd) {
      const ptAlpha = elapsed < c.fadeStart ? 220
                    : map(elapsed, c.fadeStart, c.fadeEnd, 220, 0)
      noStroke()
      fill(WHITE[0], WHITE[1], WHITE[2], ptAlpha)
      ellipse(c.x, c.y, 5, 5)
    }

    // 涟漪圆
    noFill()
    stroke(WHITE[0], WHITE[1], WHITE[2], map(rippleTe, 0, 1, 40, 220))
    ellipse(c.x, c.y, r * 2, r * 2)
  }

  // 目标圆高亮（拖拽接近时）— snapHighlight 已是像素坐标
  if (typeof snapHighlight !== 'undefined' && snapHighlight) {
    noFill()
    stroke(164, 225, 255, 200)
    strokeWeight(3)
    ellipse(snapHighlight.x, snapHighlight.y, snapHighlight.r * 2, snapHighlight.r * 2)
    strokeWeight(0.8)
  }

  // 完成闪烁
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
