import fs from 'node:fs/promises'
import path from 'node:path'

async function fileExists(p) {
  try {
    await fs.access(p)
    return true
  } catch {
    return false
  }
}

async function readText(p) {
  return (await fs.readFile(p, 'utf8')).trim()
}

async function resolveGitDir(root) {
  // root/.git can be a directory OR a file containing "gitdir: <path>"
  const dotGit = path.join(root, '.git')

  if (!(await fileExists(dotGit))) return null

  const stat = await fs.lstat(dotGit)
  if (stat.isDirectory()) return dotGit

  // worktrees/submodules: .git is a file pointing to the real git dir
  const content = await readText(dotGit)
  const m = content.match(/^gitdir:\s*(.+)\s*$/i)
  if (!m) return null

  const gitdirPath = m[1]
  return path.resolve(root, gitdirPath)
}

async function readPackedRef(gitDir, refPath) {
  const packedRefsPath = path.join(gitDir, 'packed-refs')
  if (!(await fileExists(packedRefsPath))) return null

  const packed = await readText(packedRefsPath)
  // lines look like:
  // <sha> refs/heads/main
  // ^<peeled> (for annotated tags)
  const target = refPath.replace(/\\/g, '/')

  for (const line of packed.split('\n')) {
    if (!line || line.startsWith('#') || line.startsWith('^')) continue
    const [sha, ref] = line.split(' ')
    if (ref === target) return sha
  }

  return null
}

async function readRefSha(gitDir, refPath) {
  const refFile = path.join(gitDir, refPath)
  if (await fileExists(refFile)) {
    const sha = await readText(refFile)
    if (sha) return sha
  }

  return await readPackedRef(gitDir, refPath)
}

async function readHeadSha(gitDir) {
  const headPath = path.join(gitDir, 'HEAD')
  if (!(await fileExists(headPath))) return null

  const head = await readText(headPath)

  // detached HEAD: HEAD is the sha
  if (/^[0-9a-f]{40}$/i.test(head)) return head

  // symbolic: "ref: refs/heads/main"
  const m = head.match(/^ref:\s*(.+)\s*$/i)
  if (!m) return null

  const refPath = m[1].trim()
  const sha = await readRefSha(gitDir, refPath)
  return sha || null
}

async function findRepoRoot(startDir) {
  // Walk upward until we find .git
  let dir = startDir
  while (true) {
    if (await fileExists(path.join(dir, '.git'))) return dir
    const parent = path.dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

export default function gitHashPlugin(options = {}) {
  const {
    envKey = 'VITE_GIT_HASH',
    short = 7,
    htmlToken = '%VITE_GIT_HASH%',
    insertMeta = false,
    metaName = 'git-hash'
  } = options

  let rootDir = process.cwd()
  let computed = null
  let gitDir = null
  let repoRoot = null

  async function compute() {
    repoRoot = await findRepoRoot(rootDir)
    if (!repoRoot) return null

    gitDir = await resolveGitDir(repoRoot)
    if (!gitDir) return null

    const sha = await readHeadSha(gitDir)
    if (!sha) return null

    return short ? sha.slice(0, short) : sha
  }

  return {
    name: 'direct-git-hash',
    enforce: 'pre',

    async config(userConfig) {
      rootDir = userConfig?.root ? path.resolve(userConfig.root) : process.cwd()
      computed = await compute()

      const value = computed || 'unknown'

      return {
        define: {
          [`import.meta.env.${envKey}`]: JSON.stringify(value)
        }
      }
    },

    transformIndexHtml(html) {
      const value = computed || 'unknown'

      let out = html

      // Replace token if present
      if (out.includes(htmlToken)) out = out.split(htmlToken).join(value)

      // Optionally insert a meta tag if you want it auto-added
      if (insertMeta && !out.includes(`name="${metaName}"`)) {
        out = out.replace(
          /<\/head>/i,
          `  <meta name="${metaName}" content="${value}">\n</head>`
        )
      }

      return out
    },

    configureServer(server) {
      // Watch for git ref changes in dev so the value updates across rebuilds
      if (gitDir) {
        server.watcher.add(path.join(gitDir, 'HEAD'))
        server.watcher.add(path.join(gitDir, 'packed-refs'))
        server.watcher.add(path.join(gitDir, 'refs'))
      }

      const recompute = async () => {
        const next = await compute()
        computed = next
      }

      server.watcher.on('change', async changedPath => {
        if (!gitDir) return
        const gp = changedPath.startsWith(gitDir)
        if (!gp) return
        await recompute()
      })
    }
  }
}