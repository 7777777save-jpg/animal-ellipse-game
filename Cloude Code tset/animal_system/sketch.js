let maskImg
/* global redraw */

function preload(){
  maskImg = loadImage("./images/bailu.jpg")
}

let seed = 1
let showGrid = true
let coverThreshold = 0.85
let maxEllipses = 40

const CANVAS_SIZE = 700
const BASE = 27

let maskPixels = [], maskW, maskH
let cellUnit
let placedEllipses = []

function precomputeMask(){
  maskImg.loadPixels()
  maskW = maskImg.width
  maskH = maskImg.height
  maskPixels = new Uint8Array(maskW * maskH)
  for(let i = 0; i < maskW * maskH; i++){
    let r = maskImg.pixels[i*4]
    let g = maskImg.pixels[i*4+1]
    let b = maskImg.pixels[i*4+2]
    maskPixels[i] = (r+g+b)/3 < 128 ? 1 : 0
  }
}

function isInside(x, y){
  let ix = int(x), iy = int(y)
  if(ix<0||iy<0||ix>=maskW||iy>=maskH) return false
  return maskPixels[iy*maskW+ix] === 1
}

function squareCoverage(x, y, size){
  let step = max(2, size/16)
  let inside = 0, total = 0
  for(let sy=y; sy<y+size; sy+=step)
    for(let sx=x; sx<x+size; sx+=step){
      if(isInside(sx,sy)) inside++
      total++
    }
  return total>0 ? inside/total : 0
}

function pcaAngle(x, y, size){
  let step = max(2, size/12)
  let sx=0,sy=0,n=0
  for(let py=y; py<y+size; py+=step)
    for(let px=x; px<x+size; px+=step)
      if(isInside(px,py)){ sx+=px; sy+=py; n++ }
  if(n<3) return 0
  let mx=sx/n, my=sy/n
  let ixx=0,iyy=0,ixy=0
  for(let py=y; py<y+size; py+=step)
    for(let px=x; px<x+size; px+=step)
      if(isInside(px,py)){
        let dx=px-mx, dy=py-my
        ixx+=dx*dx; iyy+=dy*dy; ixy+=dx*dy
      }
  return 0.5*atan2(2*ixy, ixx-iyy)
}

function inEllipse(px, py, cx, cy, a, b, angle){
  let dx=px-cx, dy=py-cy
  let c=Math.cos(-angle), s=Math.sin(-angle)
  let lx=dx*c-dy*s, ly=dx*s+dy*c
  return (lx*lx)/(a*a)+(ly*ly)/(b*b) <= 1
}

function globalCoverageRatio(){
  let step=4, covered=0, total=0
  for(let y=0; y<maskH; y+=step)
    for(let x=0; x<maskW; x+=step){
      if(!isInside(x,y)) continue
      total++
      for(let e of placedEllipses)
        if(inEllipse(x,y,e.cx,e.cy,e.a,e.b,e.angle)){ covered++; break }
    }
  return total>0 ? covered/total : 0
}

function setup(){
  let cnv = createCanvas(CANVAS_SIZE, CANVAS_SIZE)
  cnv.parent("canvas-container")
  noLoop()
  strokeWeight(1)
  cellUnit = CANVAS_SIZE / BASE

  if(maskImg){
    maskImg.resize(CANVAS_SIZE, CANVAS_SIZE)
    precomputeMask()
  }

  document.getElementById("threshold").addEventListener("input", function(){
    coverThreshold = parseFloat(this.value)
    document.getElementById("threshVal").textContent = coverThreshold.toFixed(2)
    redraw()
  })
  document.getElementById("maxE").addEventListener("input", function(){
    maxEllipses = int(this.value)
    document.getElementById("maxEVal").textContent = maxEllipses
    redraw()
  })
  document.getElementById("showGrid").addEventListener("change", function(){
    showGrid = this.checked
    redraw()
  })
}

function regenerate(){
  seed = floor(random(1,99999))
  redraw()
}

function switchImage(name){
  maskImg = loadImage("./images/"+name+".jpg", ()=>{
    maskImg.resize(CANVAS_SIZE, CANVAS_SIZE)
    precomputeMask()
    redraw()
  })
}

function draw(){
  background(10)
  randomSeed(seed)
  placedEllipses = []

  // 从大到小枚举正方形尺寸（三分网格对齐）
  let sizes = []
  for(let k=BASE; k>=1; k = k>3 ? k-3 : k-1) sizes.push(k)

  for(let k of sizes){
    let size = k * cellUnit
    for(let gy=0; gy<=BASE-k; gy++){
      for(let gx=0; gx<=BASE-k; gx++){
        if(placedEllipses.length >= maxEllipses) break
        let px=gx*cellUnit, py=gy*cellUnit
        let cov = squareCoverage(px, py, size)
        if(cov < coverThreshold) continue
        let cx=px+size/2, cy=py+size/2
        let alreadyCovered = false
        for(let e of placedEllipses){
          if(sqrt((cx-e.cx)**2+(cy-e.cy)**2) < e.a*0.5){ alreadyCovered=true; break }
        }
        if(alreadyCovered) continue
        let angle = pcaAngle(px, py, size)
        let r = size/2
        let b = r * random(0.4, 0.9)
        placedEllipses.push({cx, cy, a:r, b, angle})
      }
      if(placedEllipses.length >= maxEllipses) break
    }
    if(placedEllipses.length > 5 && globalCoverageRatio() >= 0.90) break
  }

  // 显示网格
  if(showGrid){
    noFill()
    stroke(100,180,255,40)
    strokeWeight(0.5)
    for(let i=0; i<=BASE; i++){
      line(i*cellUnit,0,i*cellUnit,CANVAS_SIZE)
      line(0,i*cellUnit,CANVAS_SIZE,i*cellUnit)
    }
    stroke(100,180,255,160)
    strokeWeight(1.5)
    let third=CANVAS_SIZE/3
    for(let i=1; i<3; i++){
      line(third*i,0,third*i,CANVAS_SIZE)
      line(0,third*i,CANVAS_SIZE,third*i)
    }
  }

  // 渲染椭圆
  fill(255)
  stroke(255)
  strokeWeight(0.5)
  for(let e of placedEllipses){
    push()
    translate(e.cx, e.cy)
    rotate(e.angle)
    ellipse(0, 0, e.a*2, e.b*2)
    pop()
  }

  noStroke()
  fill(200,200,100)
  textSize(12)
  text("椭圆数: "+placedEllipses.length, 10, CANVAS_SIZE-10)
}
