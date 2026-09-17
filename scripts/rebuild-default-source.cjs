const fs = require('node:fs/promises')
const fsStream = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { ZipArchive } = require('archiver')
const unzipper = require('unzipper')

const root = path.resolve(__dirname, '..')
const archivePath = path.join(root, 'runtime-template', 'config', 'default-source.attconfig')
const ulidPattern = /^[0-9A-HJKMNP-TV-Z]{26}$/i

function parseJson(buffer, fallback) {
  try { return JSON.parse(buffer.toString('utf8')) } catch { return fallback }
}

function normalizeItem(value) {
  const target = String(value?.target || '').trim()
  return {
    image: typeof value?.image === 'string' ? value.image : '',
    name: String(value?.name || '').trim(),
    target: /^https?:\/\//i.test(target) ? target : target.replace(/\\/g, '/'),
    description: String(value?.description || '').trim(),
    category: String(value?.category || '').trim(),
    favorite: Boolean(value?.favorite),
    advancedLaunchEnabled: Boolean(value?.advancedLaunchEnabled),
    commandLaunches: Array.isArray(value?.commandLaunches) ? value.commandLaunches : [],
  }
}

function normalizedOrder(value, itemIds) {
  const known = new Set(itemIds)
  const saved = Array.isArray(value?.order) ? value.order.filter((id) => typeof id === 'string' && known.has(id)) : []
  return [...new Set([...saved, ...itemIds.filter((id) => !saved.includes(id))])]
}

async function rebuild() {
  const archive = await unzipper.Open.file(archivePath)
  const entries = new Map(archive.files.filter((entry) => entry.type === 'File').map((entry) => [entry.path, entry]))
  const itemEntries = [...entries.entries()].filter(([name]) => /^items\/[0-9A-HJKMNP-TV-Z]{26}\.json$/i.test(name))
  const itemIds = itemEntries.map(([name]) => path.basename(name, '.json')).filter((id) => ulidPattern.test(id))
  if (!itemIds.length) throw new Error('默认配置源未包含有效项目。')

  const categoryEntry = entries.get('categories.json')
  const orderEntry = entries.get('item-order.json')
  const categories = categoryEntry ? parseJson(await categoryEntry.buffer(), { version: 1, categories: [] }) : { version: 1, categories: [] }
  const orderData = orderEntry ? parseJson(await orderEntry.buffer(), {}) : {}
  const normalizedItems = await Promise.all(itemEntries.map(async ([name, entry]) => [name, JSON.stringify(normalizeItem(parseJson(await entry.buffer(), {})), null, 2)]))
  const manifest = { version: 1, source: { name: '默认配置源' }, exportedAt: new Date().toISOString(), itemCount: itemIds.length }
  const wheelLayout = { version: 1, center: null, outer: Array(9).fill(null) }
  const schedules = { version: 1, schedules: [] }
  const temporaryPath = `${archivePath}.${crypto.randomUUID()}.tmp`
  const output = fsStream.createWriteStream(temporaryPath)
  const outputArchive = new ZipArchive({ zlib: { level: 9 } })

  await new Promise((resolve, reject) => {
    output.on('close', resolve)
    output.on('error', reject)
    outputArchive.on('error', reject)
    outputArchive.pipe(output)
    for (const [name, entry] of entries) {
      if (['manifest.json', 'categories.json', 'item-order.json', 'wheel-layout.json', 'schedules.json'].includes(name)) continue
      if (/^items\/[0-9A-HJKMNP-TV-Z]{26}\.json$/i.test(name)) continue
      outputArchive.append(entry.stream(), { name })
    }
    outputArchive.append(JSON.stringify(manifest, null, 2), { name: 'manifest.json' })
    outputArchive.append(JSON.stringify({ version: 1, categories: Array.isArray(categories?.categories) ? categories.categories : [] }, null, 2), { name: 'categories.json' })
    outputArchive.append(JSON.stringify({ version: 1, order: normalizedOrder(orderData, itemIds) }, null, 2), { name: 'item-order.json' })
    outputArchive.append(JSON.stringify(wheelLayout, null, 2), { name: 'wheel-layout.json' })
    outputArchive.append(JSON.stringify(schedules, null, 2), { name: 'schedules.json' })
    for (const [name, item] of normalizedItems) outputArchive.append(item, { name })
    outputArchive.finalize()
  })
  await fs.rename(temporaryPath, archivePath)
  console.log(`已更新默认配置源：${itemIds.length} 个项目；定时任务、项目快捷键与快捷轮盘均为空。`)
}

rebuild().catch((error) => { console.error(error); process.exitCode = 1 })
