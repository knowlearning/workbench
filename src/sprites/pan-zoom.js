// Named exports — used by renderer.vue RAF loop and other modules
export function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v))
}

export function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3)
}

// Constants
export const HANDLE = 6   // CSS px
export const MIN_SIZE = 2  // sheet px
export const FIT_PAD = 16  // CSS px

// Factory — closes over live view and getImg() getter
export function createPanZoom({ view, getImg }) {
  const dpr = () => Math.max(1, window.devicePixelRatio || 1)

  function resizeToDisplaySize(c) {
    const rect = c.getBoundingClientRect()
    const pixelRatio = dpr()
    const w = Math.max(1, Math.floor(rect.width * pixelRatio))
    const h = Math.max(1, Math.floor(rect.height * pixelRatio))
    if (c.width !== w || c.height !== h) {
      c.width = w
      c.height = h
      return true
    }
    return false
  }

  // Optional but recommended for pixel art (reduces shimmer)
  function snapPanToDevicePixels() {
    const pr = dpr()
    view.panX = Math.round(view.panX * pr) / pr
    view.panY = Math.round(view.panY * pr) / pr
  }

  function worldToSheet(wx, wy) {
    return {
      x: (wx - view.panX) / view.scale,
      y: (wy - view.panY) / view.scale
    }
  }

  function sheetToWorld(x, y) {
    return {
      x: x * view.scale + view.panX,
      y: y * view.scale + view.panY
    }
  }

  function sheetWorldRect(scale = view.scale, panX = view.panX, panY = view.panY) {
    const img = getImg()
    const w = img?.naturalWidth || 0
    const h = img?.naturalHeight || 0
    const sw = w * scale
    const sh = h * scale
    return { x1: panX, y1: panY, x2: panX + sw, y2: panY + sh }
  }

  // --- zoom/pan constraints ---
  function fitScaleForCanvas(cw, ch) {
    const img = getImg()
    if (!img?.naturalWidth || !img?.naturalHeight) return 0.25

    const availW = Math.max(1, cw - FIT_PAD * 2)
    const availH = Math.max(1, ch - FIT_PAD * 2)

    const s = Math.min(availW / img.naturalWidth, availH / img.naturalHeight)
    return clamp(s, 0.01, 20)
  }

  function panBoundsForAxis(cLen, sLen) {
    // image rect is [pan, pan + sLen]
    // Constraints:
    //   pan + sLen >= 0   (right/bottom never past left/top)
    //   pan <= cLen       (left/top never past right/bottom)
    // So:
    //   pan >= -sLen
    //   pan <= cLen
    return [-sLen, cLen]
  }

  function clampPanToBounds(cw, ch, scale = view.scale, panX = view.panX, panY = view.panY) {
    const img = getImg()
    if (!img?.naturalWidth || !img?.naturalHeight) return { panX, panY }

    const sw = img.naturalWidth * scale
    const sh = img.naturalHeight * scale

    const [xMin, xMax] = panBoundsForAxis(cw, sw)
    const [yMin, yMax] = panBoundsForAxis(ch, sh)

    return {
      panX: clamp(panX, xMin, xMax),
      panY: clamp(panY, yMin, yMax)
    }
  }

  function nearestPanInBounds(cw, ch) {
    return clampPanToBounds(cw, ch)
  }

  // ---------- fit/center on load ----------
  function fitSheetToCanvas(canvasEl) {
    const img = getImg()
    if (!canvasEl || !img?.complete || !img.naturalWidth || !img.naturalHeight) return

    resizeToDisplaySize(canvasEl)

    const pixelRatio = dpr()
    const cw = canvasEl.width / pixelRatio
    const ch = canvasEl.height / pixelRatio

    const w = img.naturalWidth
    const h = img.naturalHeight

    const availW = Math.max(1, cw - FIT_PAD * 2)
    const availH = Math.max(1, ch - FIT_PAD * 2)

    const s = Math.min(availW / w, availH / h)

    // allow fit to go smaller than viewport (don't enforce 0.25 floor)
    view.scale = clamp(s, 0.01, 40)
    view.panX = (cw - w * view.scale) / 2
    view.panY = (ch - h * view.scale) / 2

    snapPanToDevicePixels()
  }

  // ---------- pan bounds + settle animation (post-zoom) ----------
  let zoomSettleRaf = 0
  let zoomSettleTimer = 0

  function stopZoomSettle() {
    if (zoomSettleRaf) cancelAnimationFrame(zoomSettleRaf)
    zoomSettleRaf = 0
    clearTimeout(zoomSettleTimer)
    zoomSettleTimer = 0
  }

  function settlePanToBounds(cw, ch) {
    stopZoomSettle()

    const fromX = view.panX
    const fromY = view.panY
    const { panX: toX, panY: toY } = nearestPanInBounds(cw, ch)

    if (Math.abs(toX - fromX) < 0.01 && Math.abs(toY - fromY) < 0.01) return

    const dur = 180
    const t0 = performance.now()

    const step = (now) => {
      const t = clamp((now - t0) / dur, 0, 1)
      const k = easeOutCubic(t)

      view.panX = fromX + (toX - fromX) * k
      view.panY = fromY + (toY - fromY) * k

      if (t >= 1) {
        snapPanToDevicePixels()
        zoomSettleRaf = 0
        return
      }

      zoomSettleRaf = requestAnimationFrame(step)
    }

    zoomSettleRaf = requestAnimationFrame(step)
  }

  function scheduleZoomSettle(cw, ch) {
    clearTimeout(zoomSettleTimer)
    zoomSettleTimer = setTimeout(() => {
      settlePanToBounds(cw, ch)
    }, 90)
  }

  function roundInt(v) {
    return Math.round(v)
  }

  return {
    dpr,
    resizeToDisplaySize,
    snapPanToDevicePixels,
    worldToSheet,
    sheetToWorld,
    sheetWorldRect,
    fitScaleForCanvas,
    clampPanToBounds,
    nearestPanInBounds,
    fitSheetToCanvas,
    stopZoomSettle,
    scheduleZoomSettle,
    // also exposed for frame.js destructuring
    clamp,
    roundInt
  }
}
