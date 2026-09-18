const fs = require('node:fs/promises')
const fsStream = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { ZipArchive } = require('archiver')

const root = path.resolve(__dirname, '..')
const toolsRoot = path.join(root, 'tools')
const packageJson = require(path.join(root, 'package.json'))
const releaseMetadata = require(path.join(root, 'tool-pack.release.json'))
const outputRoot = path.join(root, 'release', 'tool-pack')
const artifactName = `JaeTravelToolbox-tools-${packageJson.version}.zip`

async function sha256(file) {
  const hash = crypto.createHash('sha256')
  await new Promise((resolve, reject) => {
    const input = fsStream.createReadStream(file)
    input.on('error', reject); input.on('end', resolve); input.on('data', (chunk) => hash.update(chunk))
  })
  return hash.digest('hex')
}

async function listFiles(directory, prefix = '') {
  const result = []
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const relative = path.posix.join(prefix, entry.name)
    const absolute = path.join(directory, entry.name)
    if (entry.isDirectory()) result.push(...await listFiles(absolute, relative))
    else if (entry.isFile()) {
      const stat = await fs.stat(absolute)
      result.push({ absolute, path: `tools/${relative}`, size: stat.size, sha256: await sha256(absolute) })
    }
  }
  return result
}

async function build() {
  const files = await listFiles(toolsRoot)
  if (!files.length) throw new Error('tools 目录为空，无法构建工具资源包。')
  await fs.mkdir(outputRoot, { recursive: true })
  const outputPath = path.join(outputRoot, artifactName)
  const temporaryPath = `${outputPath}.${crypto.randomUUID()}.tmp`
  if (releaseMetadata.version !== 1 || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(releaseMetadata.toolPackVersion || '') || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(releaseMetadata.minAppVersion || '') || (releaseMetadata.maxAppVersionExclusive && !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(releaseMetadata.maxAppVersionExclusive)) || !['stable', 'beta'].includes(releaseMetadata.channel)) throw new Error('tool-pack.release.json 不符合发布元数据要求。')
  const manifest = { version: 1, packageId: 'official-tools', appVersion: packageJson.version, toolPackVersion: releaseMetadata.toolPackVersion, minAppVersion: releaseMetadata.minAppVersion, maxAppVersionExclusive: releaseMetadata.maxAppVersionExclusive || '', channel: releaseMetadata.channel, generatedAt: new Date().toISOString(), fileCount: files.length, totalBytes: files.reduce((sum, file) => sum + file.size, 0), files: files.map(({ path: entryPath, size, sha256: digest }) => ({ path: entryPath, size, sha256: digest })) }
  const output = fsStream.createWriteStream(temporaryPath)
  const archive = new ZipArchive({ zlib: { level: 9 } })
  await new Promise((resolve, reject) => {
    output.on('close', resolve); output.on('error', reject); archive.on('error', reject); archive.pipe(output)
    archive.append(JSON.stringify(manifest, null, 2), { name: 'manifest.json' })
    for (const file of files) archive.file(file.absolute, { name: file.path })
    archive.finalize()
  })
  await fs.rename(temporaryPath, outputPath)
  const digest = await sha256(outputPath)
  await fs.writeFile(`${outputPath}.sha256`, `${digest}  ${artifactName}\n`, 'utf8')
  const releaseManifest = { version: 1, packageId: manifest.packageId, toolPackVersion: manifest.toolPackVersion, minAppVersion: manifest.minAppVersion, maxAppVersionExclusive: manifest.maxAppVersionExclusive, channel: manifest.channel, archive: { name: artifactName, sha256: digest, size: (await fs.stat(outputPath)).size } }
  await fs.writeFile(path.join(outputRoot, `${path.basename(artifactName, '.zip')}.json`), `${JSON.stringify(releaseManifest, null, 2)}\n`, 'utf8')
  console.log(`已生成工具资源包：${outputPath}`)
  console.log(`SHA-256：${digest}`)
}

build().catch((error) => { console.error(error); process.exitCode = 1 })
