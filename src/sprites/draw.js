import { clamp } from './pan-zoom.js'

// preview.ui.x/y is written by drawPreviewPanel so interactions.js can hit-test the panel.
// Both share the same preview object reference.
export function createDraw({ view, preview, getImg, setImg, getCanvas,
                              frames, activeFrame, hoverFrame, theme, prefersDark,
                              panZoom, frameOps, player, emitCurrent }) {
  function drawPreviewPanel(ctx, cw, ch) {
    const margin = 12
    const w = preview.ui.w
    const h = preview.ui.h
    const x = cw - w - margin
    const y = margin

    preview.ui.x = x
    preview.ui.y = y

    const th = theme.value

    ctx.save()

    ctx.fillStyle = th.PREVIEW_PANEL_BG
    ctx.fillRect(x, y, w, h)
    ctx.strokeStyle = th.PREVIEW_PANEL_BORDER
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1)

    const pad = preview.ui.pad
    const headerH = 46
    ctx.fillStyle = th.PREVIEW_HEADER_BG
    ctx.fillRect(x, y, w, headerH)

    ctx.font = '12px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'
    ctx.textBaseline = 'top'
    ctx.fillStyle = th.LABEL_FG

    const stateNames = player.listStateNames()
    if (!preview.state) preview.state = stateNames[0] || ''

    const frameName = player.pickPreviewFrameName()
    const f = frames.value[frameName]
    const rf = frameOps.readFrame(f)

    const playTxt = preview.playing ? 'playing' : 'paused'
    ctx.fillText(`preview (${playTxt})`, x + pad, y + 8)
    ctx.fillText(preview.state ? `state: ${preview.state}` : 'state: (none)', x + pad, y + 24)

    const cx = x + pad
    const cy = y + headerH + pad
    const cw2 = w - pad * 2
    const ch2 = h - headerH - pad * 2

    if (frameName && frameName === activeFrame.value) {
      ctx.strokeStyle = th.FRAME_ACTIVE_OUTLINE
      ctx.lineWidth = 2
      ctx.strokeRect(cx - 3, cy - 3, cw2 + 6, ch2 + 6)
      ctx.lineWidth = 1
    }

    const cell = 10
    for (let yy = 0; yy < ch2; yy += cell) {
      for (let xx = 0; xx < cw2; xx += cell) {
        const v = ((xx / cell) ^ (yy / cell)) & 1
        ctx.fillStyle = v ? th.PREVIEW_CHECK_B : th.PREVIEW_CHECK_A
        ctx.fillRect(cx + xx, cy + yy, cell, cell)
      }
    }

    const ax = cx + cw2 / 2
    const ay = cy + ch2 * 0.82
    ctx.strokeStyle = th.PREVIEW_GROUND
    ctx.beginPath()
    ctx.moveTo(cx + 6, ay + 0.5)
    ctx.lineTo(cx + cw2 - 6, ay + 0.5)
    ctx.stroke()

    const img = getImg()
    if (img?.complete && img.naturalWidth && rf) {
      const { x: sx, y: sy, w: sw, h: sh, ox, oy } = rf

      const maxScaleX = Math.floor((cw2 * 0.9) / Math.max(1, sw))
      const maxScaleY = Math.floor((ch2 * 0.9) / Math.max(1, sh))
      const base = Math.max(1, Math.min(maxScaleX || 1, maxScaleY || 1))
      const s = clamp(Math.round(base), 1, 12)

      const dx = Math.round(ax - ox * sw * s)
      const dy = Math.round(ay - oy * sh * s)

      ctx.save()
      ctx.beginPath()
      ctx.rect(cx, cy, cw2, ch2)
      ctx.clip()

      ctx.imageSmoothingEnabled = false
      ctx.drawImage(img, sx, sy, sw, sh, dx, dy, sw * s, sh * s)

      ctx.fillStyle = th.ORIGIN_COLOR
      ctx.beginPath()
      ctx.arc(Math.round(ax), Math.round(ay), 3, 0, Math.PI * 2)
      ctx.fill()

      ctx.restore()
    } else {
      ctx.fillStyle = prefersDark.value ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.6)'
      ctx.fillText('no frame/image', cx, cy + 6)
    }

    ctx.restore()
  }

  function draw(ctx, c, dt) {
    panZoom.resizeToDisplaySize(c)

    const th = theme.value

    ctx.save()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, c.width, c.height)

    const pixelRatio = panZoom.dpr()
    ctx.scale(pixelRatio, pixelRatio)

    const cw = c.width / pixelRatio
    const ch = c.height / pixelRatio

    if (preview.playing) preview.t += dt * preview.speed

    const playheadName = player.currentPlayheadFrameName()
    emitCurrent(playheadName)

    const stateSet = player.activeStateFrameSet()

    ctx.fillStyle = th.BG_COLOR
    ctx.fillRect(0, 0, cw, ch)

    const img = getImg()
    if (img?.complete && img.naturalWidth) {
      ctx.imageSmoothingEnabled = false
      ctx.drawImage(img, view.panX, view.panY, img.naturalWidth * view.scale, img.naturalHeight * view.scale)

      // faint border around the sprite sheet
      const sw = img.naturalWidth * view.scale
      const sh = img.naturalHeight * view.scale

      ctx.save()
      ctx.imageSmoothingEnabled = true
      ctx.lineWidth = 4
      ctx.strokeStyle = th.SHEET_BORDER || (prefersDark.value ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)')

      const half = ctx.lineWidth / 2
      ctx.strokeRect(view.panX - half, view.panY - half, sw + ctx.lineWidth, sh + ctx.lineWidth)

      ctx.restore()
    }

    ctx.imageSmoothingEnabled = true
    ctx.font = '12px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'
    ctx.textBaseline = 'top'

    for (const [name, f] of Object.entries(frames.value)) {
      const rf = frameOps.readFrame(f)
      if (!rf) continue
      const { x, y, w, h } = rf

      const sx = x * view.scale + view.panX
      const sy = y * view.scale + view.panY
      const sw = w * view.scale
      const sh = h * view.scale

      const isActive = name === activeFrame.value
      const isPlayhead = name === playheadName
      const isHot = isActive || (name === hoverFrame.value && !activeFrame.value)
      const isInActiveState = stateSet.has(name)

      ctx.lineWidth = 1
      if (isInActiveState) ctx.strokeStyle = th.FRAME_STATE_STROKE
      else ctx.strokeStyle = isHot ? th.FRAME_HOVER_STROKE : th.FRAME_STROKE
      ctx.strokeRect(sx, sy, sw, sh)

      if (isPlayhead && !isActive) {
        ctx.strokeStyle = th.FRAME_PLAYHEAD_OUTLINE
        ctx.lineWidth = 2
        ctx.strokeRect(sx, sy, sw, sh)
        ctx.lineWidth = 1
      }

      if (isActive) {
        ctx.strokeStyle = th.FRAME_ACTIVE_OUTLINE
        ctx.lineWidth = 2
        ctx.strokeRect(sx, sy, sw, sh)
        ctx.lineWidth = 1
      }

      const b = frameOps.rectWorldBounds(f)
      const hx = (b.x1 + b.x2) / 2
      const hy = (b.y1 + b.y2) / 2
      const pts = [
        [b.x1, b.y1], [hx, b.y1], [b.x2, b.y1],
        [b.x2, hy],
        [b.x2, b.y2], [hx, b.y2], [b.x1, b.y2],
        [b.x1, hy]
      ]
      if (isInActiveState) ctx.fillStyle = th.FRAME_STATE_FILL
      else ctx.fillStyle = isHot ? th.FRAME_HOVER_FILL : th.FRAME_FILL
      for (const [px, py] of pts) ctx.fillRect(px - 3, py - 3, 6, 6)

      const op = frameOps.originWorldPos(f)
      ctx.fillStyle = th.ORIGIN_COLOR
      ctx.beginPath()
      ctx.arc(op.x, op.y, 3, 0, Math.PI * 2)
      ctx.fill()

      const label = name
      const pad = 4
      const tw = ctx.measureText(label).width
      const lx = sx
      const ly = sy - 16

      ctx.fillStyle = th.LABEL_BG
      ctx.fillRect(lx, ly, tw + pad * 2, 16)
      ctx.fillStyle = th.LABEL_FG
      ctx.fillText(label, lx + pad, ly + 2)
    }

    drawPreviewPanel(ctx, cw, ch)

    ctx.strokeStyle = th.BORDER_COLOR
    ctx.strokeRect(0.5, 0.5, cw - 1, ch - 1)

    ctx.restore()
  }

  function loadSheet(url) {
    const newImg = new Image()
    newImg.src = url
    newImg.onload = () => {
      panZoom.fitSheetToCanvas(getCanvas())
    }
    setImg(newImg)
  }

  return { draw, loadSheet }
}
