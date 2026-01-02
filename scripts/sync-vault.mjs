import { cp, mkdir, readdir, rm, stat } from 'node:fs/promises'
import { extname, resolve } from 'node:path'

const vaultPath =
  process.env.VAULT_PATH ||
  '/Users/minzu/Library/Mobile Documents/com~apple~CloudDocs/GithubBlog/GithubBlog'

const mappings = [
  { from: 'blog', to: 'src/content/blog' },
  { from: 'ctf', to: 'src/content/ctf' },
  { from: 'ctf-projects', to: 'src/content/ctf-projects' },
  { from: 'projects', to: 'src/content/projects' },
  { from: 'authors', to: 'src/content/authors' },
  { from: 'assets', to: 'public/static' },
]

async function pathExists(path) {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

async function syncDir(from, to) {
  const src = resolve(vaultPath, from)
  const dest = resolve(to)
  if (!(await pathExists(src))) {
    console.warn(`Skip: ${src} does not exist`)
    return
  }

  await ensureVaultMdCopies(src)
  await rm(dest, { recursive: true, force: true })
  await mkdir(dest, { recursive: true })

  if (from === 'assets') {
    await cp(src, dest, { recursive: true })
    console.log(`Synced assets: ${src} -> ${dest}`)
    return
  }

  await copyContentDir(src, dest)
  console.log(`Synced content: ${src} -> ${dest}`)
}

async function copyContentDir(src, dest) {
  const entries = await readdir(src, { withFileTypes: true })
  for (const entry of entries) {
    const srcPath = resolve(src, entry.name)
    const destPath = resolve(dest, entry.name)

    if (entry.isDirectory()) {
      await mkdir(destPath, { recursive: true })
      await copyContentDir(srcPath, destPath)
      continue
    }

    const ext = extname(entry.name).toLowerCase()
    if (ext !== '.md' && ext !== '.mdx') continue

    if (ext === '.md') {
      const mdxDest = destPath.replace(/\.md$/i, '.mdx')
      await cp(srcPath, mdxDest)
      continue
    }

    await cp(srcPath, destPath)
  }
}

async function ensureVaultMdCopies(src) {
  const entries = await readdir(src, { withFileTypes: true })
  for (const entry of entries) {
    const srcPath = resolve(src, entry.name)
    if (entry.isDirectory()) {
      await ensureVaultMdCopies(srcPath)
      continue
    }
    if (extname(entry.name).toLowerCase() !== '.mdx') continue

    const mdPath = srcPath.replace(/\\.mdx$/i, '.md')
    if (await pathExists(mdPath)) continue
    await cp(srcPath, mdPath)
  }
}

async function main() {
  if (!(await pathExists(vaultPath))) {
    throw new Error(`Vault path not found: ${vaultPath}`)
  }

  for (const mapping of mappings) {
    await syncDir(mapping.from, mapping.to)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
