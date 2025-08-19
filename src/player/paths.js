export function find(object, test, paths=[], path=[]) {
  if (object && typeof object === "object") {
    if (Array.isArray(object)) {
      object.forEach((item, key) => {
        find(item, test, paths, [...path, key])
      })
    } else {
      if (test(object, path)) paths.unshift(path)
      for (const key in object) {
        if (Object.prototype.hasOwnProperty.call(object, key)) {
          find(object[key], test, paths, [...path, key])
        }
      }
    }
  }
  return paths
}

export function resolve(path, value) {
    if (path.length && value !== undefined) {
      return resolve(path.slice(1), value[path[0]])
    }
    return value
  }