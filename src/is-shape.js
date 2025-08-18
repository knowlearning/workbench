const isShape = object => (
  Array.isArray(object.path) &&
  Array.isArray(object.position) &&
  typeof object.angle === "number"
)

export default isShape