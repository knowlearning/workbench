import { clamp, MIN_SIZE } from './pan-zoom.js'

export function createInteractions({ view, preview, frames, activeFrame, hoverFrame,
                                      getImg, panZoom, frameOps, player,
                                      handleHover, emitCurrent, emit }) {
  function isTextInputLike(el) {
    if (!el || el === document.body || el === document.documentElement) return false

    if (el.matches?.('textarea, select')) return true

    if (el.matches?.('input')) {
      const type = (el.getAttribute('type') || 'text').toLowerCase()
      return !['button', 'checkbox', 'radio', 'range', 'color', 'file', 'submit', 'reset'].includes(type)
    }

    if (el.isContentEditable) return true
    const ce = el.closest?.('[contenteditable=""], [contenteditable="true"]')
    if (ce) return true

    const role = el.getAttribute?.('role')
    if (role && ['textbox', 'searchbox', 'combobox'].includes(role)) return true

    return false
  }

  function isTypingContext(evt) {
    const path = evt.composedPath?.() || []
    for (const n of path) {
      if (n && n.nodeType === 1 && isTextInputLike(n)) return true
    }
    return isTextInputLike(document.activeElement)
  }

  function setupInteractions(c) {
    let mode = 'none'
    let activeName = ''
    let activeHandle = ''
    let start = null

    const pick = (wx, wy) => {
      const entries = Object.entries(frames.value)

      for (let i = entries.length - 1; i >= 0; i--) {
        const [name, f] = entries[i]
        if (!frameOps.readFrame(f)) continue
        if (frameOps.hitOrigin(wx, wy, f)) return { kind: 'origin', name }
      }

      for (let i = entries.length - 1; i >= 0; i--) {
        const [name, f] = entries[i]
        if (!frameOps.readFrame(f)) continue
        const h = frameOps.hitHandle(wx, wy, f)
        if (h) return { kind: 'handle', name, handle: h }
      }

      for (let i = entries.length - 1; i >= 0; i--) {
        const [name, f] = entries[i]
        if (!frameOps.readFrame(f)) continue
        if (frameOps.hitRect(wx, wy, f)) return { kind: 'rect', name }
      }

      return null
    }

    const inPreview = (mx, my) => {
      const r = preview.ui
      return mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h
    }

    const setPlaying = (v) => {
      preview.playing = v
      if (v) preview.manualFrameName = ''
    }

    const onDown = (e) => {
      const rect = c.getBoundingClientRect()
      const mx = e.clientX - rect.left
      const my = e.clientY - rect.top

      if (e.button === 0 && inPreview(mx, my)) {
        setPlaying(!preview.playing)
        return
      }

      const sp = panZoom.worldToSheet(mx, my)
      const p = pick(mx, my)
      const isPrimary = e.button === 0 || e.pointerType !== 'mouse'
      if (!isPrimary) return

      if (p?.kind === 'origin') {
        mode = 'origin'
        activeName = p.name
        activeHandle = ''
      } else if (p?.kind === 'handle') {
        mode = 'resize'
        activeName = p.name
        activeHandle = p.handle
      } else if (p?.kind === 'rect') {
        mode = 'move'
        activeName = p.name
        activeHandle = ''
      } else {
        mode = 'pan'
        activeName = ''
        activeHandle = ''
      }

      activeFrame.value = activeName

      const f = activeName ? frames.value[activeName] : null
      const rf = frameOps.readFrame(f)
      start = {
        clientX: e.clientX,
        clientY: e.clientY,
        panX: view.panX,
        panY: view.panY,
        fx: rf?.x ?? 0,
        fy: rf?.y ?? 0,
        fw: rf?.w ?? 0,
        fh: rf?.h ?? 0,
        sx: sp.x,
        sy: sp.y
      }

      c.setPointerCapture?.(e.pointerId)
    }

    const onHoverMove = (e) => {
      if (mode !== 'none') return
      const rect = c.getBoundingClientRect()
      const mx = e.clientX - rect.left
      const my = e.clientY - rect.top

      if (inPreview(mx, my)) {
        hoverFrame.value = ''
        handleHover('')
        return
      }

      const p = pick(mx, my)
      const next = p?.name || ''
      hoverFrame.value = next
      handleHover(next)
    }

    const onMove = (e) => {
      if (mode === 'none' || !start) return

      // keep backing store synced for consistent cw/ch
      panZoom.resizeToDisplaySize(c)

      const rect = c.getBoundingClientRect()
      const pr = panZoom.dpr()
      const cw = c.width / pr
      const ch = c.height / pr

      // convert rect-space mouse to drawing space
      const sx = rect.width ? cw / rect.width : 1
      const sy = rect.height ? ch / rect.height : 1

      const mx = (e.clientX - rect.left) * sx
      const my = (e.clientY - rect.top) * sy
      const sp = panZoom.worldToSheet(mx, my)

      if (mode === 'pan') {
        const dx = (e.clientX - start.clientX) * sx
        const dy = (e.clientY - start.clientY) * sy
        view.panX = start.panX + dx
        view.panY = start.panY + dy

        const t = panZoom.clampPanToBounds(cw, ch)
        view.panX = t.panX
        view.panY = t.panY
        panZoom.snapPanToDevicePixels()
        return
      }

      const name = activeName
      const f = frames.value[name]
      if (!frameOps.readFrame(f)) return

      if (mode === 'origin') {
        frameOps.applyOriginToFrame(name, sp.x, sp.y)
        return
      }

      if (mode === 'move') {
        const dx = sp.x - start.sx
        const dy = sp.y - start.sy
        frameOps.applyRectToFrame(name, start.fx + dx, start.fy + dy, start.fw, start.fh)
        return
      }

      if (mode === 'resize') {
        let x1 = start.fx
        let y1 = start.fy
        let x2 = start.fx + start.fw
        let y2 = start.fy + start.fh

        if (activeHandle.includes('w')) x1 = sp.x
        if (activeHandle.includes('e')) x2 = sp.x
        if (activeHandle.includes('n')) y1 = sp.y
        if (activeHandle.includes('s')) y2 = sp.y

        if (e.altKey) {
          const cx = start.fx + start.fw / 2
          const cy = start.fy + start.fh / 2
          const hw = Math.abs(sp.x - cx)
          const hh = Math.abs(sp.y - cy)

          if (activeHandle === 'n' || activeHandle === 's') {
            y1 = cy - hh
            y2 = cy + hh
          } else if (activeHandle === 'w' || activeHandle === 'e') {
            x1 = cx - hw
            x2 = cx + hw
          } else {
            x1 = cx - hw
            x2 = cx + hw
            y1 = cy - hh
            y2 = cy + hh
          }
        }

        if (e.shiftKey) {
          const ar = start.fw / (start.fh || 1)
          let w = Math.abs(x2 - x1)
          let h = Math.abs(y2 - y1)

          if (activeHandle === 'n' || activeHandle === 's') {
            w = h * ar
            const cx = (x1 + x2) / 2
            x1 = cx - w / 2
            x2 = cx + w / 2
          } else if (activeHandle === 'w' || activeHandle === 'e') {
            h = w / ar
            const cy = (y1 + y2) / 2
            y1 = cy - h / 2
            y2 = cy + h / 2
          } else {
            const dw = Math.abs(sp.x - start.sx)
            const dh = Math.abs(sp.y - start.sy)
            if (dw > dh) h = w / ar
            else w = h * ar

            const ox = activeHandle.includes('w') ? x2 : x1
            const oy = activeHandle.includes('n') ? y2 : y1
            if (activeHandle.includes('w')) x1 = ox - w
            else x2 = ox + w
            if (activeHandle.includes('n')) y1 = oy - h
            else y2 = oy + h
          }
        }

        let nx = Math.min(x1, x2)
        let ny = Math.min(y1, y2)
        let nw = Math.max(MIN_SIZE, Math.abs(x2 - x1))
        let nh = Math.max(MIN_SIZE, Math.abs(y2 - y1))

        const img = getImg()
        if (img?.naturalWidth && img?.naturalHeight) {
          nx = clamp(nx, 0, img.naturalWidth - MIN_SIZE)
          ny = clamp(ny, 0, img.naturalHeight - MIN_SIZE)
          nw = clamp(nw, MIN_SIZE, img.naturalWidth - nx)
          nh = clamp(nh, MIN_SIZE, img.naturalHeight - ny)
        }

        frameOps.applyRectToFrame(name, nx, ny, nw, nh)
      }
    }

    const onUp = (e) => {
      mode = 'none'
      activeName = ''
      activeHandle = ''
      start = null
      activeFrame.value = ''
      c.releasePointerCapture?.(e.pointerId)
    }

    // WHEEL: cursor-anchored zoom + post-zoom settle (no center zoom ever)
    const onWheel = (e) => {
      e.preventDefault()

      // ensure cw/ch match draw() space
      panZoom.resizeToDisplaySize(c)

      const rect = c.getBoundingClientRect()
      const pr = panZoom.dpr()
      const cw = c.width / pr
      const ch = c.height / pr

      // rect-space mouse
      const mxRect = e.clientX - rect.left
      const myRect = e.clientY - rect.top

      // convert to drawing space
      const sx = rect.width ? cw / rect.width : 1
      const sy = rect.height ? ch / rect.height : 1
      const mx = mxRect * sx
      const my = myRect * sy

      if (inPreview(mx, my)) {
        const factor = Math.exp(-e.deltaY * 0.001)
        preview.speed = clamp(preview.speed * factor, 0.1, 4)
        return
      }

      const wantsPan = e.shiftKey || Math.abs(e.deltaX) > 0
      const wantsZoom = !wantsPan || e.ctrlKey

      if (!wantsZoom) {
        view.panX -= e.deltaX * sx
        view.panY -= e.deltaY * sy

        const t = panZoom.clampPanToBounds(cw, ch)
        view.panX = t.panX
        view.panY = t.panY
        panZoom.snapPanToDevicePixels()
        return
      }

      const img = getImg()
      if (!img?.naturalWidth || !img?.naturalHeight) return

      panZoom.stopZoomSettle()

      const prevScale = view.scale
      const factor = Math.exp(-e.deltaY * 0.001)

      const fit = panZoom.fitScaleForCanvas(cw, ch)
      const minScale = Math.max(0.01, fit * 0.1)
      const maxScale = 40

      const nextScale = clamp(prevScale * factor, minScale, maxScale)
      if (nextScale === prevScale) return

      // ALWAYS keep cursor fixed at same image coordinate:
      const sheetX = (mx - view.panX) / prevScale
      const sheetY = (my - view.panY) / prevScale

      view.scale = nextScale
      view.panX = mx - sheetX * nextScale
      view.panY = my - sheetY * nextScale

      // Do not clamp during the zoom gesture; settle after zoom ends:
      panZoom.scheduleZoomSettle(cw, ch)
    }

    const onKey = (e) => {
      if (isTypingContext(e)) return

      if (e.key === ' ') {
        e.preventDefault()
        setPlaying(!preview.playing)
        return
      }

      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        player.stepPreviewFrame(-1)
        return
      }

      if (e.key === 'ArrowRight') {
        e.preventDefault()
        player.stepPreviewFrame(1)
        return
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault()
        player.stepState(-1)
        return
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault()
        player.stepState(1)
        return
      }

      if (e.key === 'Escape') {
        hoverFrame.value = ''
        handleHover('')
        activeFrame.value = ''
        preview.manualFrameName = ''
      }
    }

    c.style.touchAction = 'none'
    c.addEventListener('pointerdown', onDown)
    c.addEventListener('pointermove', onHoverMove)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('keydown', onKey)
    c.addEventListener('wheel', onWheel, { passive: false })

    return () => {
      c.removeEventListener('pointerdown', onDown)
      c.removeEventListener('pointermove', onHoverMove)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('keydown', onKey)
      c.removeEventListener('wheel', onWheel)
      frameOps.cancelScheduledLog()
      panZoom.stopZoomSettle()
    }
  }

  return { setupInteractions }
}
