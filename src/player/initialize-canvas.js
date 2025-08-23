import screen from './screen.js'

export default function initialize(canvas) {
  const ctx = canvas.getContext("2d")
  const dpr = window.devicePixelRatio || 1
  canvas.width = screen.width * dpr
  canvas.height = screen.height * dpr
  canvas.style.width = `${screen.width}px`
  canvas.style.height = `${screen.height}px`
  ctx.scale(dpr, dpr)
}