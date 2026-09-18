const fs = require('node:fs/promises')
const { existsSync } = require('node:fs')
const path = require('node:path')

module.exports = async (context) => {
  if (context.electronPlatformName !== 'win32') return
  const root = path.resolve(__dirname, '..')
  const launcher = path.join(root, 'build', 'launcher', 'JaeTravelToolbox.exe')
  const appOut = context.appOutDir
  const runtimeDirectory = path.join(appOut, 'app')
  const runtimeExecutable = path.join(runtimeDirectory, 'JaeTravelToolbox.exe')
  const renamedRuntimeExecutable = path.join(runtimeDirectory, 'JaeTravelToolbox.Runtime.exe')

  if (!existsSync(launcher)) throw new Error('缺少已编译的根目录启动器，请先执行 npm run build:launcher。')
  await fs.mkdir(runtimeDirectory, { recursive: true })
  for (const entry of await fs.readdir(appOut)) {
    if (entry === 'app') continue
    await fs.rename(path.join(appOut, entry), path.join(runtimeDirectory, entry))
  }
  if (!existsSync(runtimeExecutable)) throw new Error('未找到 Electron 运行时可执行文件，无法重组安装目录。')
  await fs.rename(runtimeExecutable, renamedRuntimeExecutable)
  await fs.copyFile(launcher, path.join(appOut, 'JaeTravelToolbox.exe'))
}
