export default {
  mounted(el, binding) {
    let isHovering = false

    let startX, startY, lastX, lastY

    function calculatePoints(event) {
      const clientX = event.touches ? event.touches[0].clientX : event.clientX
      const clientY = event.touches ? event.touches[0].clientY : event.clientY

      const tx = clientX - startX
      const ty = clientY - startY

      const dx = clientX - lastX
      const dy = clientY - lastY

      const detail = { clientX, clientY, tx, ty, dx, dy }

      const svgElement = el.closest('svg')
      if (svgElement) {
        const ctm = svgElement.getScreenCTM()

        const sx = ctm ? 1 / ctm.a : 1
        const sy = ctm ? 1 / ctm.d : 1

        detail.svg_dx = dx * sx
        detail.svg_dy = dy * sy

        if (ctm) {
          const point = svgElement.createSVGPoint()
          point.x = clientX
          point.y = clientY
          const svgPoint = point.matrixTransform(ctm.inverse())
          detail.svg_x = svgPoint.x
          detail.svg_y = svgPoint.y
        }
      }

      return detail
    }

    el.emitHoverStart = event => {
      if (!isHovering) {
        isHovering = true

        const clientX = event.touches ? event.touches[0].clientX : event.clientX
        const clientY = event.touches ? event.touches[0].clientY : event.clientY

        startX = clientX
        startY = clientY
        lastX = clientX
        lastY = clientY

        const detail = calculatePoints(event)

        el.dispatchEvent(new CustomEvent('hoverstart', { detail }))
      }
    }

    el.emitHoverEnd = event => {
      if (isHovering) {
        isHovering = false

        const detail = calculatePoints(event)
        el.dispatchEvent(new CustomEvent('hoverend', { detail }))
      }
    }

    el.emitHover = event => {
      const detail = calculatePoints(event)
      el.dispatchEvent(new CustomEvent('hover', { detail }))
    }

    el.addEventListener('mouseenter', el.emitHoverStart)
    el.addEventListener('mouseleave', el.emitHoverEnd)
    el.addEventListener('mousemove', el.emitHover)
  },

  unmounted(el) {
    el.removeEventListener('mouseenter', el.emitHoverStart)
    el.removeEventListener('mouseleave', el.emitHoverEnd)
    el.removeEventListener('mousemove', el.emitHover)
  },
}
