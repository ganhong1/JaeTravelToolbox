const { spawn } = require('node:child_process')
const crypto = require('node:crypto')
const fs = require('node:fs')
const fsp = require('node:fs/promises')
const path = require('node:path')
const { ZipArchive } = require('archiver')

const projectRoot = path.resolve(__dirname, '..')
const packageJson = require(path.join(projectRoot, 'package.json'))
const releaseRoot = path.join(projectRoot, 'release')
const toolsSource = path.join(projectRoot, 'tools')
const baseName = `阿洁的旅行工具箱-v${packageJson.version}-win-x64`
const MAX_CLASSIC_ZIP_BYTES = Math.floor(3.5 * 1024 ** 3)
const MAX_CLASSIC_ZIP_ENTRIES = 60000

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: projectRoot, stdio: 'inherit', windowsHide: true, shell: process.platform === 'win32' })
    child.on('error', reject)
    child.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`${command} 执行失败，退出码 ${code}`)))
  })
}

async function availablePath(parent, preferredName, extension = '') {
  for (let index = 1; ; index += 1) {
    const suffix = index === 1 ? '' : `-${index}`
    const candidate = path.join(parent, `${preferredName}${suffix}${extension}`)
    try { await fsp.access(candidate) } catch { return candidate }
  }
}

async function walkStats(directory) {
  let files = 0
  let bytes = 0
  const pending = [directory]
  while (pending.length) {
    const current = pending.pop()
    for (const entry of await fsp.readdir(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name)
      if (entry.isDirectory()) pending.push(fullPath)
      else if (entry.isFile()) { files += 1; bytes += (await fsp.stat(fullPath)).size }
    }
  }
  return { files, bytes }
}

function sha256(file) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256')
    fs.createReadStream(file).on('error', reject).on('data', (chunk) => hash.update(chunk)).on('end', () => resolve(hash.digest('hex')))
  })
}

async function createZip(sourceDirectory, destination, rootName) {
  const partial = `${destination}.partial`
  const output = fs.createWriteStream(partial)
  const archive = new ZipArchive({ zlib: { level: 6 } })
  let lastProgress = 0
  archive.on('progress', ({ fs: progress }) => {
    const now = Date.now()
    if (now - lastProgress > 5000) {
      lastProgress = now
      process.stdout.write(`\r正在压缩：${progress.processedBytes} / ${progress.totalBytes || '?'} bytes`)
    }
  })
  await new Promise((resolve, reject) => {
    output.on('close', resolve)
    output.on('error', reject)
    archive.on('warning', (error) => error.code === 'ENOENT' ? process.stderr.write(`\n压缩警告：${error.message}\n`) : reject(error))
    archive.on('error', reject)
    archive.pipe(output)
    archive.directory(sourceDirectory, rootName)
    archive.finalize()
  })
  process.stdout.write('\n')
  await fsp.rename(partial, destination)
}

async function assertClassicZipCompatibility(directory) {
  const stats = await walkStats(directory)
  if (stats.bytes > MAX_CLASSIC_ZIP_BYTES || stats.files > MAX_CLASSIC_ZIP_ENTRIES) {
    throw new Error(`发行目录过大，无法安全生成 Windows 内置解压兼容的标准 ZIP（当前 ${stats.files} 个文件、${stats.bytes} bytes）。请改用安装包或拆分发行包。`)
  }
  return stats
}

async function main() {
  await fsp.mkdir(releaseRoot, { recursive: true })
  const programOutput = await availablePath(releaseRoot, `program-only-v${packageJson.version}`)
  const bundleDirectory = await availablePath(releaseRoot, baseName)
  const bundleName = path.basename(bundleDirectory)
  const zipPath = await availablePath(releaseRoot, bundleName, '.zip')

  await fsp.access(toolsSource)
  console.log('1/5 构建前端资源')
  await run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build'])

  console.log('2/5 构建不含 tools 的 Windows x64 便携版 EXE')
  const builder = path.join(projectRoot, 'node_modules', '.bin', process.platform === 'win32' ? 'electron-builder.cmd' : 'electron-builder')
  await run(builder, ['--win', 'portable', '--x64', `--config.directories.output=${path.relative(projectRoot, programOutput)}`])

  const programFiles = await fsp.readdir(programOutput, { withFileTypes: true })
  const portable = programFiles.find((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.exe'))
  if (!portable) throw new Error('没有找到 electron-builder 生成的便携版 EXE。')

  console.log('3/5 组装 EXE、tools 与说明文件')
  await fsp.mkdir(bundleDirectory, { recursive: true })
  const bundledExe = path.join(bundleDirectory, '阿洁的旅行工具箱.exe')
  await fsp.copyFile(path.join(programOutput, portable.name), bundledExe)
  await fsp.cp(toolsSource, path.join(bundleDirectory, 'tools'), { recursive: true, force: false })

  const toolStats = await walkStats(toolsSource)
  const manifest = {
    formatVersion: 1,
    productName: '阿洁的旅行工具箱',
    applicationVersion: packageJson.version,
    platform: 'win32',
    architecture: 'x64',
    packageType: 'portable-folder',
    executable: '阿洁的旅行工具箱.exe',
    executableSha256: await sha256(bundledExe),
    tools: { path: 'tools', files: toolStats.files, bytes: toolStats.bytes },
    runtimeData: ['config', 'items', 'static', 'logs'],
    runtimeDataPolicy: '首次启动时在 EXE 同级目录自动创建',
    generatedAt: new Date().toISOString()
  }
  await fsp.writeFile(path.join(bundleDirectory, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  await fsp.writeFile(path.join(bundleDirectory, 'README.txt'), [
    '阿洁的旅行工具箱（Windows x64 测试包）',
    '',
    '1. 请先完整解压 ZIP，不要直接在压缩包内运行。',
    '2. 双击“阿洁的旅行工具箱.exe”启动。',
    '3. tools 文件夹必须与 EXE 保持同级，否则默认本地工具将无法启动。',
    '4. config、items、static、logs 等用户数据会在首次启动后自动创建。',
    '5. 本测试包为便携版；移动时请整体移动整个文件夹。',
    '',
    '注意：公开分发前，需要逐项确认 tools 中第三方程序的再分发许可。',
    ''
  ].join('\r\n'), 'utf8')
  const licenseDirectory = path.join(bundleDirectory, 'THIRD_PARTY_LICENSES')
  await fsp.mkdir(licenseDirectory)
  await fsp.writeFile(path.join(licenseDirectory, 'README.txt'), '当前为本地测试包。正式公开分发前，请在此收录 tools 中各第三方程序真实、适用的许可证与署名文件。\r\n', 'utf8')

  const bundleStats = await assertClassicZipCompatibility(bundleDirectory)
  console.log('4/5 创建 Windows 内置解压兼容的标准 ZIP 压缩包')
  await createZip(bundleDirectory, zipPath, bundleName)

  console.log('5/5 校验产物')
  const exeInfo = await fsp.stat(bundledExe)
  const zipInfo = await fsp.stat(zipPath)
  console.log(JSON.stringify({ programOutput, bundleDirectory, zipPath, executableBytes: exeInfo.size, zipBytes: zipInfo.size, tools: toolStats, bundle: bundleStats }, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
