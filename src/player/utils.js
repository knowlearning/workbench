export function isShape(object) {
  return (
    Array.isArray(object.path) &&
    Array.isArray(object.position) &&
    typeof object.angle === "number"
  )
}

export function isPointInsideShape(shape, px, py) {
  const { path } = shape
  let inside = false
  for (let i = 0, j = path.length - 1; i < path.length; j = i++) {
    const xi = path[i][0], yi = path[i][1]
    const xj = path[j][0], yj = path[j][1]

    const intersect = (
      yi > py !== yj > py &&
      px < ((xj - xi) * (py - yi)) / (yj - yi) + xi
    )

    if (intersect) inside = !inside
  }
  return inside
}

export function isPointInsideShapeWithParents(path, root, px, py) {
  // accumulate transforms from root through the path
  let node = root
  let transforms = []

  if (isShape(node)) transforms.push(node)

  for (const key of path) {
    node = node[key]
    if (!node) break
    if (isShape(node)) transforms.push(node)
  }

  // walk transforms backwards: convert global point into local space
  let x = px
  let y = py
  for (let i = 0; i < transforms.length; i++) {
    const { position, angle } = transforms[i]
    const rad = (angle * Math.PI) / 180
    x -= position[0]
    y -= position[1]
    const lx = x * Math.cos(-rad) - y * Math.sin(-rad)
    const ly = x * Math.sin(-rad) + y * Math.cos(-rad)
    x = lx
    y = ly
  }

  const shape = transforms[transforms.length - 1]
  return isPointInsideShape(shape, x, y)
}

export function matMultiply(a, b) {
  return [
    a[0]*b[0]+a[1]*b[3], a[0]*b[1]+a[1]*b[4], a[0]*b[2]+a[1]*b[5]+a[2],
    a[3]*b[0]+a[4]*b[3], a[3]*b[1]+a[4]*b[4], a[3]*b[2]+a[4]*b[5]+a[5],
    0, 0, 1
  ]
}

export function matInvert(m) {
  const [a,b,c,d,e,f] = m
  const det = a*e - b*d
  if (det === 0) return null
  const idet = 1/det
  return [
    e*idet, -b*idet, (b*f - e*c)*idet,
    -d*idet, a*idet, (d*c - a*f)*idet,
    0,0,1
  ]
}

export function matPoint(m, x, y) {
  return [
    m[0]*x + m[1]*y + m[2],
    m[3]*x + m[4]*y + m[5]
  ]
}

export function matVector(m, x, y) {
  return [
    m[0]*x + m[1]*y,
    m[3]*x + m[4]*y
  ]
}

export function matFromShape(shape) {
  const rad = (shape.angle||0) * Math.PI / 180
  const cos = Math.cos(rad), sin = Math.sin(rad)
  const [x, y] = shape.position || [0,0]
  return [
    cos, -sin, x,
    sin,  cos, y,
    0,0,1
  ]
}

export function computeTransformToNode(path, root) {
  let node = root
  let m = [1,0,0, 0,1,0, 0,0,1] // identity

  // include root if it’s a shape (matches draw order)
  if (isShape(node)) {
    m = matMultiply(m, matFromShape(node)) // T*R
  }

  for (const key of path) {
    node = node[key]
    if (!node) break
    if (isShape(node)) {
      m = matMultiply(m, matFromShape(node)) // T*R
    }
  }
  return m
}

export function toParentEvent(path, root, { x, y, dx, dy }) {
  if (path.length === 0) {
    return { x, y, dx, dy }
  }

  const parentPath = path.slice(0, -1)
  const mParent = computeTransformToNode(parentPath, root)
  const invParent = matInvert(mParent)
  if (!invParent) return { x, y, dx, dy }

  const [px, py]   = matPoint(invParent, x, y)
  const [px2, py2] = matPoint(invParent, x + dx, y + dy)
  return { x: px, y: py, dx: px2 - px, dy: py2 - py }
}

export function getWorldPosition(path, root) {
  const m = computeTransformToNode(path, root)
  return [m[2], m[5]] // translation part of the matrix
}
