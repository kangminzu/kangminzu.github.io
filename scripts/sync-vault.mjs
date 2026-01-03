import { cp, mkdir, readdir, rm, stat, readFile, writeFile } from 'node:fs/promises'
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

const imageKeys = ['image', 'imageLight', 'imageDark']
const imageKeyPattern = imageKeys.join('|')
const imageLineRegex = new RegExp(
  `^\\s*(${imageKeyPattern}):\\s*(['"]?)([^'"]+)\\2\\s*$`,
  'gmi'
)

function normalizeImagePath(value) {
  const normalized = value.replace(/\\/g, '/')
  const publicMatch = normalized.match(/(?:^|\\/+)public\\/static\\/([^\\/]+)$/i)
  if (publicMatch) {
    return `../../../../public/static/${publicMatch[1]}`
  }
  const assetsMatch = normalized.match(/(?:^|\\/+)assets\\/([^\\/]+)$/i)
  if (assetsMatch) {
    return `../../../../public/static/${assetsMatch[1]}`
  }
  return value
}

function expandLogoImage(contents) {
  return contents.replace(
    /^(\s*image:\s*)(['"]?)([^'"\n]+)\2\s*$/gim,
    (line, _prefix, quote, value) => {
      if (!/logo\.(png|svg)$/i.test(value)) return line
      const light = value.replace(/logo\.(png|svg)$/i, 'logo-light.svg')
      const dark = value.replace(/logo\.(png|svg)$/i, 'logo-dark.svg')
      return `imageLight: ${quote}${light}${quote}\nimageDark: ${quote}${dark}${quote}`
    }
  )
}

function expandProjectImage(contents) {
  return contents.replace(
    /^(\s*image:\s*)(['"]?)([^'"\n]+)\2\s*$/gim,
    (line, _prefix, quote, value) => {
      const normalized = value.replace(/\\/g, '/')
      if (!/project-(kernel|software)-(light|dark)\.png$/i.test(normalized)) return line
      const light = normalized.replace(/project-(kernel|software)-(light|dark)\.png$/i, 'project-$1-light.png')
      const dark = normalized.replace(/project-(kernel|software)-(light|dark)\.png$/i, 'project-$1-dark.png')
      return `imageLight: ${quote}${light}${quote}\nimageDark: ${quote}${dark}${quote}`
    }
  )
}

function normalizeFrontmatterImages(contents) {
  const expanded = expandProjectImage(expandLogoImage(contents))
  return expanded.replace(imageLineRegex, (line, key, quote, value) => {
    const next = normalizeImagePath(value.trim())
    if (next === value.trim()) return line
    return `${key}: ${quote}${next}${quote}`
  })
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

    const raw = await readFile(srcPath, 'utf8')
    const contents = normalizeFrontmatterImages(raw)

    if (ext === '.md') {
      const mdxDest = destPath.replace(/\.md$/i, '.mdx')
      await writeFile(mdxDest, contents)
      continue
    }

    await writeFile(destPath, contents)
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
