const { existsSync } = require('node:fs')
const fs = require('node:fs/promises')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const root = path.resolve(__dirname, '..')
const source = path.join(root, 'apps', 'desktop', 'launcher', 'Program.cs')
const icon = path.join(root, 'apps', 'desktop', 'renderer', 'assets', 'jae-travel-suitcase.ico')
const outputDirectory = path.join(root, 'build', 'launcher')
const output = path.join(outputDirectory, 'JaeTravelToolbox.exe')
const candidates = [
  path.join(process.env.WINDIR || 'C:\\Windows', 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe'),
  path.join(process.env.WINDIR || 'C:\\Windows', 'Microsoft.NET', 'Framework', 'v4.0.30319', 'csc.exe'),
]
const compiler = candidates.find(existsSync)

if (!compiler) throw new Error('未找到 Windows .NET Framework C# 编译器（csc.exe）。')

async function build() {
  await fs.mkdir(outputDirectory, { recursive: true })
  const result = spawnSync(compiler, ['/nologo', '/target:winexe', `/out:${output}`, `/win32icon:${icon}`, source], { cwd: root, encoding: 'utf8' })
  if (result.status !== 0 || !existsSync(output)) throw new Error(`启动器编译失败：${result.stderr || result.stdout || '未知错误'}`)
  process.stdout.write(`Built ${path.relative(root, output)}\n`)
}

build().catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1 })
