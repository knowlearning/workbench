export default function drawArrow(ctx, from, to, headlen = 5) {
  const [x1, y1] = from
  const [x2, y2] = to

  const angle = Math.atan2(y2 - y1, x2 - x1)

  // main line
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.lineTo(x2, y2)
  ctx.stroke()

  // arrowhead lines
  ctx.beginPath()
  ctx.moveTo(x2, y2)
  ctx.lineTo(
    x2 - headlen * Math.cos(angle - Math.PI / 6),
    y2 - headlen * Math.sin(angle - Math.PI / 6)
  )
  ctx.moveTo(x2, y2)
  ctx.lineTo(
    x2 - headlen * Math.cos(angle + Math.PI / 6),
    y2 - headlen * Math.sin(angle + Math.PI / 6)
  )
  ctx.stroke()
}
