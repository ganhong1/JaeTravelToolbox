const { app, BrowserWindow, Menu, shell, ipcMain, dialog, globalShortcut, screen, net, protocol } = require('electron')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const fs = require('node:fs/promises')
const fsStream = require('node:fs')
const crypto = require('node:crypto')
const { Readable, Transform } = require('node:stream')
const { pipeline } = require('node:stream/promises')
const { createRuntimeLogger } = require('./logger.cjs')
const { ZipArchive } = require('archiver')
const unzipper = require('unzipper')
const { autoUpdater } = require('electron-updater')

const defaultSourceId = 'default'
const imageExtensions = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.ico'])
const imageMimes = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.bmp': 'image/bmp', '.ico': 'image/x-icon' }
const root = () => {
  if (!app.isPackaged) return app.getAppPath()
  return process.env.PORTABLE_EXECUTABLE_DIR ? path.resolve(process.env.PORTABLE_EXECUTABLE_DIR) : path.dirname(process.execPath)
}
const dataRoot = () => !app.isPackaged || process.env.PORTABLE_EXECUTABLE_DIR ? root() : app.getPath('userData')
const template = (...parts) => path.join(app.getAppPath(), 'runtime-template', ...parts)
const config = (...parts) => path.join(dataRoot(), 'config', ...parts)
const itemsDir = (sourceId) => path.join(dataRoot(), 'items', sourceId)
const categoryFile = (sourceId) => config('sources', sourceId, 'categories.json')
const itemOrderFile = (sourceId) => config('sources', sourceId, 'item-order.json')
const schedulesFile = () => config('schedules.json')
const sourceScheduleFile = (sourceId) => config('sources', sourceId, 'schedules.json')
const wheelLayoutFile = (sourceId) => config('sources', sourceId, 'wheel-layout.json')
const shortcutsFile = () => config('shortcuts.json')
let mainWindow = null
let wheelWindow = null
let wheelPreviewTimer = null
const registeredShortcuts = new Set()
const activeScheduleIds = new Set()
const scheduleQueue = []
let scheduleQueueRunning = false
const repeatTimers = new Map()
const sourceFile = () => config('sources.json')
const customImagesDir = () => path.join(dataRoot(), 'static', 'images', 'custom')
const backgroundsDir = () => path.join(customImagesDir(), 'backgrounds')
const backgroundFile = () => config('background.json')
const updateSettingsFile = () => config('update-settings.json')
const toolPackStateFile = () => config('tool-pack.json')
const announcementCacheFile = () => config('announcement-cache.json')
const announcementStateFile = () => config('announcement-state.json')
const onlineServicesFile = () => template('config', 'online-services.json')
let updateState = { phase: 'idle', available: false, downloaded: false, version: app.getVersion(), message: '尚未检查更新。', releaseNotes: '' }
let updateCheckInFlight = null
const UPDATE_CHECK_TIMEOUT_MS = 15_000
const runtimeLog = createRuntimeLogger({ directory: path.join(dataRoot(), 'logs'), appVersion: app.getVersion(), development: !app.isPackaged })
const logDateStamp = () => new Date().toISOString().slice(0, 10)

function ipcArgumentSummary(args) { return args.map((value) => Array.isArray(value) ? { type: 'array', count: value.length } : value && typeof value === 'object' ? { type: 'object', keys: Object.keys(value).slice(0, 20) } : { type: typeof value }) }
function installIpcLogging() {
  const quietSuccessChannels = new Set(['toolbox:get-runtime-logs'])
  const originalHandle = ipcMain.handle.bind(ipcMain)
  ipcMain.handle = (channel, handler) => originalHandle(channel, async (event, ...args) => {
    const startedAt = Date.now()
    const logSuccess = !quietSuccessChannels.has(channel)
    if (logSuccess) runtimeLog.debug('ipc.request', { channel, arguments: ipcArgumentSummary(args) })
    try {
      const result = await handler(event, ...args)
      if (logSuccess) runtimeLog.info('ipc.success', { channel, durationMs: Date.now() - startedAt })
      return result
    } catch (error) {
      runtimeLog.error('ipc.failure', { channel, durationMs: Date.now() - startedAt, error })
      throw error
    }
  })
}
installIpcLogging()
runtimeLog.subscribe((entry) => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('toolbox:runtime-log', entry) })
process.on('uncaughtException', (error) => { runtimeLog.critical('process.uncaught_exception', { error }); runtimeLog.flush() })
process.on('unhandledRejection', (reason) => { runtimeLog.critical('process.unhandled_rejection', { error: reason instanceof Error ? reason : new Error(String(reason)) }); runtimeLog.flush() })

function ulid() {
  const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; let stamp = BigInt(Date.now()); let value = ''
  for (let index = 0; index < 10; index += 1) { value = alphabet[Number(stamp % 32n)] + value; stamp /= 32n }
  for (const byte of crypto.randomBytes(16)) value += alphabet[byte % 32]
  return value
}
function validUlid(value) { return /^[0-9A-HJKMNP-TV-Z]{26}$/.test(value || '') }
function assertSource(sourceId) { if (sourceId !== defaultSourceId && !validUlid(sourceId)) throw new Error('无效的配置源 ID。'); return sourceId }
function assertItem(id) { if (!validUlid(id)) throw new Error('无效的项目 ID。'); return id }
function customImage(image) { return typeof image === 'string' && /^static\/images\/custom\/[^/]+$/i.test(image) }
function registerToolboxAssetProtocol() {
  protocol.handle('toolbox-asset', (request) => {
    const url = new URL(request.url)
    const relative = decodeURIComponent(`${url.hostname}${url.pathname}`).replace(/^\/+/, '')
    if (!/^static\/images\/(?:custom|builtin)(?:\/[^/?#]+)+\.(?:png|jpe?g|webp|gif|bmp|ico)$/i.test(relative)) return new Response('Not found', { status: 404 })
    const imagesRoot = path.resolve(dataRoot(), 'static', 'images')
    const file = path.resolve(dataRoot(), relative)
    if (!file.startsWith(`${imagesRoot}${path.sep}`)) return new Response('Forbidden', { status: 403 })
    return net.fetch(pathToFileURL(file).toString())
  })
}
async function readJson(file, fallback) { try { return JSON.parse(await fs.readFile(file, 'utf8')) } catch (error) { if (error.code === 'ENOENT') return fallback; runtimeLog.error('storage.read_json_failed', { file: path.basename(file), error }); throw error } }
async function writeJson(file, value) { await fs.mkdir(path.dirname(file), { recursive: true }); const temp = `${file}.tmp`; await fs.writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, 'utf8'); await fs.rename(temp, file); runtimeLog.debug('storage.write_json', { file: path.basename(file) }) }
function normalizeUpdateSettings(value) {
  return {
    version: 1,
    checkOnLaunch: value?.checkOnLaunch !== false,
    autoDownload: Boolean(value?.autoDownload),
    autoInstallOnQuit: Boolean(value?.autoInstallOnQuit),
  }
}
async function updateSettings() { return normalizeUpdateSettings(await readJson(updateSettingsFile(), {})) }
async function saveUpdateSettings(value) { const settings = normalizeUpdateSettings(value); await writeJson(updateSettingsFile(), settings); if (updaterAvailable()) { autoUpdater.autoDownload = settings.autoDownload; autoUpdater.autoInstallOnAppQuit = settings.autoInstallOnQuit } return settings }
async function officialOnlineServices() {
  const fallback = { version: 1, announcement: { url: '', timeoutSeconds: 8 }, updater: { provider: 'github', owner: '', repo: '', channel: 'latest' }, toolPack: { url: '', sha256: '', version: '', maxSizeMiB: 2048 } }
  const configured = await readJson(onlineServicesFile(), fallback)
  return {
    version: 1,
    announcement: { url: /^https:\/\//i.test(configured?.announcement?.url || '') ? configured.announcement.url : '', timeoutSeconds: Math.max(3, Math.min(20, Number(configured?.announcement?.timeoutSeconds) || 8)) },
    updater: { provider: 'github', owner: String(configured?.updater?.owner || '').trim(), repo: String(configured?.updater?.repo || '').trim(), channel: String(configured?.updater?.channel || 'latest').trim() || 'latest' },
    toolPack: { url: /^https:\/\//i.test(configured?.toolPack?.url || '') ? configured.toolPack.url : '', sha256: /^[a-f0-9]{64}$/i.test(configured?.toolPack?.sha256 || '') ? configured.toolPack.sha256.toLowerCase() : '', version: String(configured?.toolPack?.version || '').trim().slice(0, 64), maxSizeMiB: Math.max(64, Math.min(4096, Number(configured?.toolPack?.maxSizeMiB) || 2048)) },
  }
}
function updaterAvailable() { return app.isPackaged && !process.env.PORTABLE_EXECUTABLE_DIR && updateState.supported === true }
function publishUpdateState(patch) { updateState = { ...updateState, ...patch }; runtimeLog.info('updater.state_changed', { phase: updateState.phase, available: Boolean(updateState.available), downloaded: Boolean(updateState.downloaded), version: updateState.version || '' }); if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('toolbox:update-status', updateState) }
async function initializeUpdater() {
  const services = await officialOnlineServices()
  const supported = app.isPackaged && !process.env.PORTABLE_EXECUTABLE_DIR && Boolean(services.updater.owner && services.updater.repo)
  updateState = { ...updateState, supported, provider: 'github', currentVersion: app.getVersion(), releaseUrl: services.updater.owner && services.updater.repo ? `https://github.com/${services.updater.owner}/${services.updater.repo}/releases` : '', phase: supported ? 'idle' : 'unavailable', message: supported ? '尚未检查更新。' : (app.isPackaged ? '当前发行包未配置 GitHub 更新源；自动更新不可用，但不影响正常使用。' : '开发模式不检查更新。'), error: '' }
  if (!supported) return updateState
  const settings = await updateSettings()
  autoUpdater.setFeedURL({ provider: 'github', owner: services.updater.owner, repo: services.updater.repo, channel: services.updater.channel, releaseType: 'release' })
  autoUpdater.autoDownload = settings.autoDownload
  autoUpdater.autoInstallOnAppQuit = settings.autoInstallOnQuit
  autoUpdater.autoRunAppAfterInstall = true
  autoUpdater.on('checking-for-update', () => publishUpdateState({ phase: 'checking', message: '正在检查 GitHub Release 更新…', error: '' }))
  autoUpdater.on('update-available', (info) => publishUpdateState({ phase: 'available', available: true, downloaded: false, version: info.version, releaseNotes: typeof info.releaseNotes === 'string' ? info.releaseNotes : '', message: `发现新版本 ${info.version}。`, error: '' }))
  autoUpdater.on('update-not-available', () => publishUpdateState({ phase: 'latest', available: false, downloaded: false, message: '当前已是最新版本。', error: '' }))
  autoUpdater.on('download-progress', (progress) => publishUpdateState({ phase: 'downloading', progress: Math.round(progress.percent || 0), transferred: progress.transferred || 0, total: progress.total || 0, message: `正在下载更新：${Math.round(progress.percent || 0)}%。`, error: '' }))
  autoUpdater.on('update-downloaded', (info) => publishUpdateState({ phase: 'downloaded', available: true, downloaded: true, version: info.version, message: `版本 ${info.version} 已下载，重启后即可安装。`, error: '' }))
  autoUpdater.on('error', (error) => { runtimeLog.warning('updater.operation_failed', { error }); publishUpdateState({ phase: 'error', message: '更新服务暂时不可用；不影响工具箱正常使用。请稍后重试，或前往 Releases 手动下载。', error: '' }) })
  return updateState
}
async function checkForUpdates() {
  if (!updaterAvailable()) return updateState
  if (updateCheckInFlight) return updateCheckInFlight
  updateCheckInFlight = (async () => {
    publishUpdateState({ phase: 'checking', available: false, downloaded: false, message: '正在检查 GitHub Release 更新…', error: '' })
    let timer = null
    try {
      await Promise.race([
        autoUpdater.checkForUpdates(),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('UPDATE_CHECK_TIMEOUT')), UPDATE_CHECK_TIMEOUT_MS) }),
      ])
    } catch (error) {
      const timedOut = error?.message === 'UPDATE_CHECK_TIMEOUT'
      runtimeLog.warning('updater.check_failed', { reason: timedOut ? 'timeout' : 'request_failed', error })
      publishUpdateState({ phase: 'error', available: false, downloaded: false, message: timedOut ? '更新检查超时；不影响工具箱正常使用。请稍后重试，或前往 Releases 手动下载。' : '更新检查失败；不影响工具箱正常使用。请稍后重试，或前往 Releases 手动下载。', error: '' })
    } finally { if (timer) clearTimeout(timer) }
    return updateState
  })()
  try { return await updateCheckInFlight } finally { updateCheckInFlight = null }
}
async function downloadUpdate() { if (!updaterAvailable()) throw new Error(updateState.message); if (!updateState.available) throw new Error('当前没有可下载的更新。'); await autoUpdater.downloadUpdate(); return updateState }
function installDownloadedUpdate() { if (!updaterAvailable() || !updateState.downloaded) throw new Error('尚未下载可安装的更新。'); autoUpdater.quitAndInstall(false, true); return { installing: true } }
async function fetchAnnouncement() {
  const bundledPath = path.join(app.getAppPath(), 'apps', 'desktop', 'renderer', 'content', 'announcement.zh-CN.md')
  const bundled = await fs.readFile(bundledPath, 'utf8')
  const services = await officialOnlineServices()
  const cached = await readJson(announcementCacheFile(), { markdown: '', etag: '', updatedAt: '' })
  if (!services.announcement.url) return { markdown: bundled, source: 'bundled', updatedAt: '', unread: false, remoteConfigured: false }
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), services.announcement.timeoutSeconds * 1000)
  try {
    const headers = cached.etag ? { 'If-None-Match': cached.etag } : {}
    const response = await fetch(services.announcement.url, { headers, signal: controller.signal })
    if (response.status === 304 && cached.markdown) return { markdown: cached.markdown, source: 'cache', updatedAt: cached.updatedAt, unread: false, remoteConfigured: true }
    if (!response.ok) throw new Error(`公告请求失败（HTTP ${response.status}）。`)
    const markdown = await response.text()
    if (!markdown.trim() || Buffer.byteLength(markdown, 'utf8') > 512 * 1024) throw new Error('公告内容为空或超过大小限制。')
    const next = { markdown, etag: response.headers.get('etag') || '', updatedAt: new Date().toISOString() }
    await writeJson(announcementCacheFile(), next)
    return { markdown, source: 'remote', updatedAt: next.updatedAt, unread: markdown !== cached.markdown, remoteConfigured: true }
  } catch (error) {
    runtimeLog.warning('announcement.sync_failed', { error })
    return { markdown: cached.markdown || bundled, source: cached.markdown ? 'cache' : 'bundled', updatedAt: cached.updatedAt || '', unread: false, remoteConfigured: true, error: error.message }
  } finally { clearTimeout(timer) }
}
function announcementContentId(markdown) { return crypto.createHash('sha256').update(String(markdown || ''), 'utf8').digest('hex') }
async function announcementView() {
  const announcement = await fetchAnnouncement()
  const contentId = announcementContentId(announcement.markdown)
  const state = await readJson(announcementStateFile(), {})
  const dismissed = state?.appVersion === app.getVersion() && state?.contentId === contentId
  return { ...announcement, contentId, appVersion: app.getVersion(), dismissed, shouldShow: !dismissed, unread: !dismissed }
}
async function dismissAnnouncement(contentId) {
  const announcement = await announcementView()
  if (contentId !== announcement.contentId) throw new Error('公告内容已更新，请重新阅读后再设置。')
  const state = { version: 1, appVersion: announcement.appVersion, contentId: announcement.contentId, dismissedAt: new Date().toISOString() }
  await writeJson(announcementStateFile(), state)
  return { ...announcement, dismissed: true, shouldShow: false, unread: false }
}
function imageData(file) { const ext = path.extname(file).toLowerCase(); return imageExtensions.has(ext) ? fs.readFile(file).then((data) => `data:${imageMimes[ext]};base64,${data.toString('base64')}`) : null }
function backgroundImage(image) { return typeof image === 'string' && /^static\/images\/custom\/backgrounds\/[^/]+$/i.test(image) }
async function readBackgroundSettings() { const data = await readJson(backgroundFile(), { current: '', history: [] }); return { current: backgroundImage(data.current) ? data.current : '', history: [...new Set((data.history || []).filter(backgroundImage))].slice(0, 10) } }
async function cleanupBackgrounds(settings) { const kept = new Set([settings.current, ...settings.history].filter(Boolean)); const entries = await fs.readdir(backgroundsDir(), { withFileTypes: true }).catch(() => []); for (const entry of entries) if (entry.isFile() && !kept.has(`static/images/custom/backgrounds/${entry.name}`)) await fs.unlink(path.join(backgroundsDir(), entry.name)) }
async function backgroundView() { const settings = await readBackgroundSettings(); const currentDataUrl = settings.current ? await imageData(path.join(dataRoot(), settings.current)).catch(() => null) : null; const history = []; for (const image of settings.history) history.push({ image, dataUrl: await imageData(path.join(dataRoot(), image)).catch(() => null) }); return { current: settings.current, currentDataUrl, history: history.filter((entry) => entry.dataUrl) } }
async function saveBackground(payload) { let extension = ''; let data; if (payload.sourcePath) { const source = path.resolve(payload.sourcePath); extension = path.extname(source).toLowerCase(); if (!imageExtensions.has(extension)) throw new Error('不支持的背景图片格式。'); data = await fs.readFile(source) } else { const match = /^data:(image\/(?:png|jpeg|webp|gif|bmp));base64,([\s\S]+)$/.exec(payload.dataUrl || ''); if (!match) throw new Error('无法读取背景图片。'); extension = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'image/gif': '.gif', 'image/bmp': '.bmp' }[match[1]]; data = Buffer.from(match[2], 'base64') } const image = `static/images/custom/backgrounds/${ulid()}${extension}`; await fs.writeFile(path.join(dataRoot(), image), data); const settings = await readBackgroundSettings(); settings.current = image; settings.history = [image, ...settings.history.filter((entry) => entry !== image)].slice(0, 10); await writeJson(backgroundFile(), settings); await cleanupBackgrounds(settings); runtimeLog.info('background.saved', { format: extension, bytes: data.length, historyCount: settings.history.length }); return backgroundView() }
async function selectBackground(image) { const settings = await readBackgroundSettings(); if (!settings.history.includes(image)) throw new Error('历史背景不存在。'); settings.current = image; settings.history = [image, ...settings.history.filter((entry) => entry !== image)]; await writeJson(backgroundFile(), settings); runtimeLog.info('background.selected', { historyCount: settings.history.length }); return backgroundView() }
async function resetBackground() { const settings = await readBackgroundSettings(); settings.current = ''; await writeJson(backgroundFile(), settings); await cleanupBackgrounds(settings); runtimeLog.info('background.reset', { historyCount: settings.history.length }); return backgroundView() }
function normalizeCommandLaunches(value) {
  if (!Array.isArray(value)) return []
  return value.slice(0, 20).map((entry) => ({ id: validUlid(entry?.id) ? entry.id : ulid(), name: String(entry?.name || '').trim().slice(0, 64), command: String(entry?.command || '').trim().slice(0, 4096) })).filter((entry) => entry.name && entry.command)
}
function normalizeItem(value) {
  const item = { image: typeof value.image === 'string' ? value.image : '', name: String(value.name || '').trim(), target: String(value.target || '').trim(), description: String(value.description || '').trim(), category: String(value.category || '').trim(), favorite: Boolean(value.favorite), advancedLaunchEnabled: Boolean(value.advancedLaunchEnabled), commandLaunches: normalizeCommandLaunches(value.commandLaunches) }
  if (!item.name || !item.target) throw new Error('项目名称和启动路径不能为空。')
  return item
}
function normalizeOrder(value) { return [...new Set((Array.isArray(value) ? value : []).filter(validUlid))] }
async function storedItemIds(sourceId) { const entries = await fs.readdir(itemsDir(sourceId), { withFileTypes: true }).catch((error) => error.code === 'ENOENT' ? [] : Promise.reject(error)); return entries.filter((entry) => entry.isFile() && /^[0-9A-HJKMNP-TV-Z]{26}\.json$/i.test(entry.name)).map((entry) => path.basename(entry.name, '.json')).sort() }
async function completeItemOrder(sourceId) { const ids = await storedItemIds(sourceId); const known = new Set(ids); const saved = normalizeOrder((await readJson(itemOrderFile(sourceId), { order: [] })).order); const savedSet = new Set(saved); return [...saved.filter((id) => known.has(id)), ...ids.filter((id) => !savedSet.has(id))] }
async function saveItemOrder(sourceId, ids) { await requireSource(sourceId); const order = normalizeOrder((ids || []).map(assertItem)); const known = new Set(await storedItemIds(sourceId)); if (order.length !== known.size || order.some((id) => !known.has(id))) throw new Error('排序项目与当前配置源不一致，请刷新后重试。'); await writeJson(itemOrderFile(sourceId), { version: 1, order }); runtimeLog.info('items.order_saved', { sourceId, itemCount: order.length }); return order }
function resolveLocalTarget(target) { const value = String(target || '').trim(); const userCandidate = path.resolve(dataRoot(), value); return fs.access(userCandidate).then(() => userCandidate).catch(() => { const candidate = path.resolve(root(), value); return fs.access(candidate).then(() => candidate).catch(() => { const packaged = app.isPackaged ? path.resolve(process.resourcesPath, value) : candidate; return fs.access(packaged).then(() => packaged).catch(() => { if (/^tools[\\/]/i.test(value)) throw new ToolPackError('TOOL_PACK_REQUIRED', '该本地工具需要安装“官方工具资源包”，请在设置中完成安装。'); throw new Error('找不到本地启动路径，请检查项目设置。') }) }) }) }
function launchElevated(target) { return new Promise((resolve, reject) => { const child = require('node:child_process').spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', "$launchTarget = [Environment]::GetEnvironmentVariable('JAE_TOOLBOX_LAUNCH_TARGET', 'Process'); Start-Process -FilePath $launchTarget -Verb RunAs -ErrorAction Stop"], { windowsHide: true, env: { ...process.env, JAE_TOOLBOX_LAUNCH_TARGET: target } }); let error = ''; child.stderr.on('data', (chunk) => { error += chunk.toString() }); child.on('error', reject); child.on('close', (code) => code === 0 ? resolve() : reject(new Error(error || '管理员启动已取消或失败。'))) }) }
function runCustomCommand(command) { if (process.platform !== 'win32') throw new Error('自定义命令启动目前仅支持 Windows。'); const text = String(command || '').trim(); if (!text) throw new Error('自定义命令不能为空。'); if (text.length > 4096) throw new Error('自定义命令长度不能超过 4096 个字符。'); return new Promise((resolve, reject) => { const child = require('node:child_process').spawn('cmd.exe', ['/d', '/s', '/c', text], { cwd: dataRoot(), windowsHide: true }); let error = ''; child.stderr.on('data', (chunk) => { error += chunk.toString() }); child.on('error', reject); child.on('close', (code) => code === 0 ? resolve() : reject(new Error(error || '自定义命令执行失败。'))) }) }
function command(program, args) { return new Promise((resolve, reject) => { const child = require('node:child_process').spawn(program, args, { windowsHide: true }); let error = ''; child.stderr.on('data', (data) => { error += data }); child.on('error', reject); child.on('close', (code) => code === 0 ? resolve() : reject(new Error(error || `${program} 执行失败。`))) }) }
function windowsTrigger(cron) { const [minute, hour, day, month, week] = cron.split(' '); if (/^\*\/\d+$/.test(minute) && hour === '*' && day === '*' && month === '*' && week === '*') return ['/SC', 'MINUTE', '/MO', minute.slice(2)]; if (/^\d+$/.test(minute) && /^\d+$/.test(hour) && day === '*' && month === '*') { const time = `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`; if (week === '*') return ['/SC', 'DAILY', '/ST', time]; const names = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']; const days = week.split(',').flatMap((value) => names[Number(value)] ? [names[Number(value)]] : []); if (days.length) return ['/SC', 'WEEKLY', '/D', days.join(','), '/ST', time] } if (/^\d+$/.test(minute) && /^\d+$/.test(hour) && /^\d+$/.test(day) && month === '*' && week === '*') return ['/SC', 'MONTHLY', '/D', day, '/ST', `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`]; throw new Error('该 Cron 无法转换为 Windows 定时启动，请改用简易设置或关闭“到点启动工具箱”。') }
async function syncWindowsSchedule(entry) { const name = `JaeTravelToolbox_${entry.id}`; const legacyName = `AngelinaTravelToolbox_${entry.id}`; if (!entry.wakeToolbox || !entry.enabled) { await Promise.all([command('schtasks.exe', ['/Delete', '/TN', name, '/F']).catch(() => {}), command('schtasks.exe', ['/Delete', '/TN', legacyName, '/F']).catch(() => {})]); return; } const args = windowsTrigger(entry.cron); const appArgs = app.isPackaged ? ['--run-schedule', entry.id] : [app.getAppPath(), '--run-schedule', entry.id]; const taskRun = `"${process.execPath}" ${appArgs.map((value) => `"${value}"`).join(' ')}`; await command('schtasks.exe', ['/Create', '/F', '/TN', name, '/TR', taskRun, ...args]); await command('schtasks.exe', ['/Delete', '/TN', legacyName, '/F']).catch(() => {}) }function normalizeSchedule(value, sourceId) {
  const cron = String(value?.cron || '').trim()
  if (cron.split(/\s+/).length !== 5) return null
  const steps = (Array.isArray(value?.steps) ? value.steps : []).filter((step) => validUlid(step?.itemId)).map((step) => ({ itemId: step.itemId, elevated: Boolean(step.elevated), delayAfterSeconds: Math.max(0, Math.min(3600, Number(step.delayAfterSeconds) || 0)) }))
  if (!steps.length) return null
  return { id: validUlid(value?.id) ? value.id : ulid(), name: String(value?.name || '').trim().slice(0, 48) || '未命名定时任务', sourceId, cron, enabled: value?.enabled !== false, wakeToolbox: Boolean(value?.wakeToolbox), runOnStartup: Boolean(value?.runOnStartup), repeatEveryMinutes: Math.max(0, Math.min(1440, Number(value?.repeatEveryMinutes) || 0)), steps, updatedAt: typeof value?.updatedAt === 'string' ? value.updatedAt : new Date().toISOString() }
}
async function sourceSchedules(sourceId) {
  await requireSource(sourceId)
  const data = await readJson(sourceScheduleFile(sourceId), { version: 1, schedules: [] })
  return (Array.isArray(data.schedules) ? data.schedules : []).map((entry) => normalizeSchedule(entry, sourceId)).filter(Boolean)
}
async function writeSourceSchedules(sourceId, entries) {
  await requireSource(sourceId)
  const normalized = entries.map((entry) => normalizeSchedule(entry, sourceId)).filter(Boolean)
  await writeJson(sourceScheduleFile(sourceId), { version: 1, schedules: normalized })
  return normalized
}
async function schedules() { return (await Promise.all((await sources()).sources.map((source) => sourceSchedules(source.id)))).flat() }
async function migrateLegacySchedules() {
  const legacy = await readJson(schedulesFile(), null)
  if (!legacy || !Array.isArray(legacy.schedules)) return
  const knownSources = new Set((await sources()).sources.map((source) => source.id))
  for (const legacyEntry of legacy.schedules) {
    if (!knownSources.has(legacyEntry?.sourceId)) continue
    const current = await sourceSchedules(legacyEntry.sourceId)
    if (current.some((entry) => entry.id === legacyEntry.id)) continue
    const normalized = normalizeSchedule(legacyEntry, legacyEntry.sourceId)
    if (normalized) await writeSourceSchedules(legacyEntry.sourceId, [...current, normalized])
  }
  await fs.rename(schedulesFile(), `${schedulesFile()}.migrated`).catch(() => {})
}
async function saveSchedule(payload) {
  await requireSource(payload.sourceId)
  const entry = normalizeSchedule({ ...payload, id: payload.id || ulid(), enabled: payload.enabled !== false }, payload.sourceId)
  if (!entry) throw new Error('定时任务无效：请填写五段式 Cron 规则并至少加入一个启动项目。')
  const all = await schedules()
  for (const old of all.filter((schedule) => schedule.id === entry.id && schedule.sourceId !== entry.sourceId)) {
    await syncWindowsSchedule({ ...old, wakeToolbox: false })
    await writeSourceSchedules(old.sourceId, (await sourceSchedules(old.sourceId)).filter((schedule) => schedule.id !== old.id))
  }
  const current = await sourceSchedules(entry.sourceId)
  const index = current.findIndex((schedule) => schedule.id === entry.id)
  if (index >= 0) current[index] = entry; else current.push(entry)
  await syncWindowsSchedule(entry)
  await writeSourceSchedules(entry.sourceId, current)
  if (repeatTimers.has(entry.id)) { clearInterval(repeatTimers.get(entry.id)); repeatTimers.delete(entry.id) }
  runtimeLog.info(index >= 0 ? 'schedule.updated' : 'schedule.created', { scheduleId: entry.id, sourceId: entry.sourceId, stepCount: entry.steps.length, enabled: entry.enabled, wakeToolbox: entry.wakeToolbox, repeats: entry.repeatEveryMinutes > 0 })
  return entry
}
async function sources() {
  const fallback = { version: 1, activeSourceId: defaultSourceId, sources: [{ id: defaultSourceId, name: '默认配置源', isDefault: true }] }
  const data = await readJson(sourceFile(), fallback); const list = Array.isArray(data.sources) ? data.sources.filter((entry) => entry && typeof entry.id === 'string' && typeof entry.name === 'string') : []
  if (!list.some((entry) => entry.id === defaultSourceId)) list.unshift(fallback.sources[0])
  return { version: 1, activeSourceId: list.some((entry) => entry.id === data.activeSourceId) ? data.activeSourceId : defaultSourceId, sources: list.map((entry) => ({ id: entry.id, name: entry.id === defaultSourceId ? '默认配置源' : entry.name, isDefault: entry.id === defaultSourceId })) }
}
async function requireSource(sourceId) { const data = await sources(); const found = data.sources.find((entry) => entry.id === assertSource(sourceId)); if (!found) throw new Error('目标配置源不存在。'); return { data, source: found } }
async function categories(sourceId) { await requireSource(sourceId); const data = await readJson(categoryFile(sourceId), { categories: [] }); return Array.isArray(data.categories) ? data.categories.filter((value) => typeof value === 'string' && value.trim()) : [] }
async function saveCategories(sourceId, values) { await requireSource(sourceId); const list = [...new Set((values || []).map((value) => String(value).trim()).filter((value) => value && !['全部', '收藏'].includes(value)))]; await writeJson(categoryFile(sourceId), { version: 1, categories: list }); runtimeLog.info('categories.saved', { sourceId, count: list.length }); return list }
async function listItems(sourceId) {
  await requireSource(sourceId); const entries = await fs.readdir(itemsDir(sourceId), { withFileTypes: true }).catch((error) => error.code === 'ENOENT' ? [] : Promise.reject(error)); const result = []
  for (const entry of entries) {
    if (!entry.isFile() || !/^[0-9A-HJKMNP-TV-Z]{26}\.json$/i.test(entry.name)) continue
    const itemId = path.basename(entry.name, '.json')
    try {
      const item = normalizeItem(JSON.parse(await fs.readFile(path.join(itemsDir(sourceId), entry.name), 'utf8')))
      let imageDataUrl = null
      if (customImage(item.image)) {
        try { imageDataUrl = await imageData(path.join(dataRoot(), item.image)) }
        catch (error) { runtimeLog.warning('item.image_unavailable', { sourceId, itemId, error }) }
      }
      result.push({ id: itemId, ...item, imageDataUrl })
    } catch (error) { runtimeLog.warning('item.record_skipped', { sourceId, itemId, error }) }
  }
  const rank = new Map((await completeItemOrder(sourceId)).map((id, index) => [id, index]))
  return result.sort((a, b) => (rank.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b.id) ?? Number.MAX_SAFE_INTEGER) || a.id.localeCompare(b.id))
}
async function allItems() { return (await Promise.all((await sources()).sources.map((source) => listItems(source.id)))).flat() }
async function clearUnusedImage(image) { if (!customImage(image) || (await allItems()).some((item) => item.image === image)) return false; try { await fs.unlink(path.join(dataRoot(), image)); return true } catch (error) { if (error.code === 'ENOENT') return false; throw error } }
async function saveItem(payload) {
  const sourceId = payload.sourceId || (await sources()).activeSourceId; await requireSource(sourceId); const id = payload.id || ulid(); assertItem(id)
  const file = path.join(itemsDir(sourceId), `${id}.json`); const old = await readJson(file, null); const item = normalizeItem({ ...old, ...payload }); const oldImage = old?.image || payload.currentImage || ''; let copied = ''; let committed = false
  try {
    if (payload.imageSourcePath) { const origin = path.resolve(payload.imageSourcePath); const ext = path.extname(origin).toLowerCase(); if (!imageExtensions.has(ext)) throw new Error('不支持的图片格式。'); copied = path.join(customImagesDir(), `${ulid()}${ext}`); await fs.copyFile(origin, copied); item.image = `static/images/custom/${path.basename(copied)}` }
    await writeJson(file, item); committed = true; await writeJson(itemOrderFile(sourceId), { version: 1, order: await completeItemOrder(sourceId) }); const imageDataUrl = customImage(item.image) ? await imageData(path.join(dataRoot(), item.image)) : null
    const oldImageRemoved = oldImage !== item.image && await clearUnusedImage(oldImage)
    runtimeLog.info(old ? 'item.updated' : 'item.created', { sourceId, itemId: id, hasImage: Boolean(item.image), oldImageRemoved })
    return { id, ...item, imageDataUrl, oldImageRemoved }
  } catch (error) { if (copied && !committed) await fs.unlink(copied).catch((cleanupError) => runtimeLog.warning('item.image_cleanup_failed', { error: cleanupError })); runtimeLog.error('item.save_failed', { sourceId, itemId: id, error }); throw error }
}
async function deleteItem(sourceId, id) {
  await requireSource(sourceId)
  const file = path.join(itemsDir(sourceId), `${assertItem(id)}.json`); const item = await readJson(file, null)
  if (!item) return { deleted: false, imageRemoved: false }
  await fs.unlink(file)
  await writeJson(itemOrderFile(sourceId), { version: 1, order: await completeItemOrder(sourceId) })
  const imageRemoved = await clearUnusedImage(item.image); runtimeLog.info('item.deleted', { sourceId, itemId: id, imageRemoved }); return { deleted: true, imageRemoved }
}
async function bulkUpdateItems(payload) {
  const sourceId = payload.sourceId
  await requireSource(sourceId)
  const ids = [...new Set((payload.ids || []).map(assertItem))]
  if (!ids.length) throw new Error('请至少选择一个项目。')
  const storedItems = await Promise.all(ids.map(async (id) => {
    const file = path.join(itemsDir(sourceId), `${id}.json`)
    const item = await readJson(file, null)
    if (!item) throw new Error('部分所选项目已不存在，请刷新后重试。')
    return { file, item: normalizeItem(item) }
  }))
  if (payload.operation === 'set-category') {
    const category = String(payload.category || '').trim()
    if (!category || !(await categories(sourceId)).includes(category)) throw new Error('目标分类不存在，请先创建或选择一个分类。')
    await Promise.all(storedItems.map(({ file, item }) => writeJson(file, { ...item, category })))
    runtimeLog.info('items.bulk_updated', { sourceId, operation: 'set-category', count: storedItems.length }); return { operation: 'set-category', updated: storedItems.length, imageRemoved: 0 }
  }
  if (payload.operation === 'copy-to-category') {
    const category = String(payload.category || '').trim()
    if (!category || !(await categories(sourceId)).includes(category)) throw new Error('目标分类不存在，请先创建或选择一个分类。')
    await Promise.all(storedItems.map(({ item }) => saveItem({ sourceId, ...item, category, id: undefined, imageSourcePath: '' })))
    runtimeLog.info('items.bulk_updated', { sourceId, operation: 'copy-to-category', count: storedItems.length }); return { operation: 'copy-to-category', copied: storedItems.length, imageRemoved: 0 }
  }
  if (payload.operation === 'delete') {
    await Promise.all(storedItems.map(({ file }) => fs.unlink(file)))
    await writeJson(itemOrderFile(sourceId), { version: 1, order: await completeItemOrder(sourceId) })
    let imageRemoved = 0
    for (const image of new Set(storedItems.map(({ item }) => item.image))) if (await clearUnusedImage(image)) imageRemoved += 1
    runtimeLog.info('items.bulk_updated', { sourceId, operation: 'delete', count: storedItems.length, imageRemoved }); return { operation: 'delete', deleted: storedItems.length, imageRemoved }
  }
  throw new Error('不支持的批量操作。')
}
async function createSource(payload) {
  const name = String(payload.name || '').trim(); if (!name) throw new Error('请填写配置源名称。'); const data = await sources(); if (data.sources.some((source) => source.name === name)) throw new Error('配置源名称不能重复。')
const source = { id: ulid(), name, isDefault: false }
  data.sources.push(source)
  await writeJson(sourceFile(), data)
  await fs.mkdir(itemsDir(source.id), { recursive: true })
  await saveCategories(source.id, payload.inheritDefault ? await categories(defaultSourceId) : [])
  if (payload.inheritDefault) {
    const inheritedIdMap = new Map()
    for (const item of await listItems(defaultSourceId)) {
      const saved = await saveItem({ sourceId: source.id, ...item, id: undefined, imageSourcePath: '' })
      inheritedIdMap.set(item.id, saved.id)
    }
    const inheritedLayout = await wheelLayout(defaultSourceId)
    await saveWheelLayout(source.id, { center: inheritedIdMap.get(inheritedLayout.center), outer: inheritedLayout.outer.map((id) => inheritedIdMap.get(id) || null) })
    const inheritedSchedules = (await sourceSchedules(defaultSourceId)).map((entry) => normalizeSchedule({ ...entry, id: ulid(), enabled: false, wakeToolbox: false, steps: entry.steps.map((step) => ({ ...step, itemId: inheritedIdMap.get(step.itemId) })).filter((step) => step.itemId) }, source.id)).filter(Boolean)
    await writeSourceSchedules(source.id, inheritedSchedules)
  }
  await writeJson(sourceFile(), data)
  runtimeLog.info('source.created', { sourceId: source.id, inheritedDefault: Boolean(payload.inheritDefault) }); return source
}
async function switchSource(sourceId) { const { data, source } = await requireSource(sourceId); data.activeSourceId = source.id; await writeJson(sourceFile(), data); runtimeLog.info('source.switched', { sourceId: source.id }); return source }
async function deleteSource(sourceId) {
  if (sourceId === defaultSourceId) throw new Error('默认配置源不能删除。'); const { data, source } = await requireSource(sourceId); const stored = await listItems(source.id)
  for (const schedule of await sourceSchedules(source.id)) await syncWindowsSchedule({ ...schedule, wakeToolbox: false })
  await fs.rm(itemsDir(source.id), { recursive: true, force: true }); await fs.rm(path.dirname(categoryFile(source.id)), { recursive: true, force: true }); data.sources = data.sources.filter((entry) => entry.id !== source.id); if (data.activeSourceId === source.id) data.activeSourceId = defaultSourceId; await writeJson(sourceFile(), data)
  for (const item of stored) await clearUnusedImage(item.image); runtimeLog.warning('source.deleted', { sourceId, itemCount: stored.length }); return { activeSourceId: data.activeSourceId }
}
async function importItem(payload) { const source = (await listItems(payload.sourceId)).find((item) => item.id === assertItem(payload.itemId)); if (!source) throw new Error('要导入的项目不存在。'); if (payload.sourceId === payload.targetSourceId) throw new Error('目标配置源与当前配置源相同。'); const list = await categories(payload.targetSourceId); if (source.category && !list.includes(source.category)) await saveCategories(payload.targetSourceId, [...list, source.category]); return saveItem({ sourceId: payload.targetSourceId, ...source, id: undefined, imageSourcePath: '' }) }
async function exportSource(sourceId, webContents) {
  const { source } = await requireSource(sourceId); const result = await dialog.showSaveDialog(BrowserWindow.fromWebContents(webContents), { title: '导出配置源', defaultPath: `${source.name}.attconfig`, filters: [{ name: '阿洁的旅行工具箱配置', extensions: ['attconfig'] }] })
  if (result.canceled || !result.filePath) return null
  const sourceItems = await listItems(sourceId); const sourceCategories = await categories(sourceId); const sourceWheelLayout = await wheelLayout(sourceId); const sourceScheduleEntries = await sourceSchedules(sourceId); const output = fsStream.createWriteStream(result.filePath); const archive = new ZipArchive({ zlib: { level: 9 } })
  await new Promise((resolve, reject) => { output.on('close', resolve); output.on('error', reject); archive.on('error', reject); archive.pipe(output); archive.append(JSON.stringify({ version: 1, source: { name: source.name }, exportedAt: new Date().toISOString(), itemCount: sourceItems.length }, null, 2), { name: 'manifest.json' }); archive.append(JSON.stringify({ version: 1, categories: sourceCategories }, null, 2), { name: 'categories.json' }); archive.append(JSON.stringify({ version: 1, order: sourceItems.map((item) => item.id) }, null, 2), { name: 'item-order.json' }); archive.append(JSON.stringify(sourceWheelLayout, null, 2), { name: 'wheel-layout.json' }); archive.append(JSON.stringify({ version: 1, schedules: sourceScheduleEntries }, null, 2), { name: 'schedules.json' }); sourceItems.forEach(({ id, imageDataUrl, ...item }) => archive.append(JSON.stringify(item, null, 2), { name: `items/${id}.json` })); [...new Set(sourceItems.map((item) => item.image).filter(customImage))].forEach((image) => archive.file(path.join(dataRoot(), image), { name: `images/${path.basename(image)}` })); archive.finalize() })
  runtimeLog.info('source.exported', { sourceId, itemCount: sourceItems.length, scheduleCount: sourceScheduleEntries.length }); return { filePath: result.filePath, itemCount: sourceItems.length }
}
async function readImportArchive(sourcePath) {
  const resolvedPath = path.resolve(sourcePath)
  let info
  try { info = await fs.stat(resolvedPath) } catch { throw new Error('找不到所选的配置包。') }
  if (!info.isFile() || info.size === 0) throw new Error('配置包为空，请重新导出后再导入。')
  let archive
  try { archive = await unzipper.Open.file(resolvedPath) } catch { throw new Error('配置包损坏或不是有效的 ZIP 文件。') }
  const files = new Map(archive.files.filter((entry) => entry.type === 'File').map((entry) => [entry.path, entry]))
  const parseOptional = async (name, fallback) => {
    const entry = files.get(name)
    if (!entry) return fallback
    try { return JSON.parse((await entry.buffer()).toString('utf8')) } catch { throw new Error(`配置包中的 ${name} 无法解析。`) }
  }
  const itemEntries = [...files.entries()].filter(([name]) => /^items\/[0-9A-HJKMNP-TV-Z]{26}\.json$/i.test(name)).slice(0, 5000)
  const manifest = await parseOptional('manifest.json', { version: 0, source: {} })
  const importedCategories = await parseOptional('categories.json', { version: 1, categories: [] })
  if (!files.has('manifest.json') && !files.has('categories.json') && !itemEntries.length) throw new Error('配置包未包含可识别的配置内容。')
  const fallbackOrder = itemEntries.map(([name]) => path.basename(name, '.json'))
  const orderData = await parseOptional('item-order.json', { order: fallbackOrder })
  const importedOrder = Array.isArray(orderData.order) ? normalizeOrder(orderData.order).filter((id) => fallbackOrder.includes(id)) : fallbackOrder
  const importedWheelLayout = normalizeWheelLayout(await parseOptional('wheel-layout.json', {}))
  const scheduleData = await parseOptional('schedules.json', { schedules: [] })
  const importedSchedules = Array.isArray(scheduleData.schedules) ? scheduleData.schedules : []
  return { files, manifest: manifest && typeof manifest === 'object' ? manifest : { version: 0, source: {} }, importedCategories: importedCategories && typeof importedCategories === 'object' ? importedCategories : { categories: [] }, itemEntries, importedOrder, importedWheelLayout, importedSchedules }
}
async function readBundledDefaultArchive() {
  const data = await fs.readFile(template('config', 'default-source.attconfig'))
  let archive
  try { archive = await unzipper.Open.buffer(data) } catch { throw new Error('内置默认配置源损坏或不是有效的 ZIP 文件。') }
  const files = new Map(archive.files.filter((entry) => entry.type === 'File').map((entry) => [entry.path, entry]))
  const manifestEntry = files.get('manifest.json'); const categoriesEntry = files.get('categories.json')
  if (!manifestEntry || !categoriesEntry) throw new Error('内置默认配置源缺少必要文件。')
  let manifest
  try { manifest = JSON.parse((await manifestEntry.buffer()).toString('utf8')) } catch { throw new Error('内置默认配置源清单无法解析。') }
  const importedCategories = JSON.parse((await categoriesEntry.buffer()).toString('utf8'))
  const itemEntries = [...files.entries()].filter(([name]) => /^items\/[0-9A-HJKMNP-TV-Z]{26}\.json$/i.test(name))
  if (manifest.version !== 1 || manifest.itemCount !== itemEntries.length || itemEntries.length > 5000) throw new Error('内置默认配置源版本或项目数量无效。')
  return { files, manifest, importedCategories, itemEntries, fingerprint: crypto.createHash('sha256').update(data).digest('hex') }
}
async function writeImportedImages(files) {
  const imageMap = new Map()
  for (const [entryName, entry] of files) {
    if (!/^images\/[^/]+$/i.test(entryName)) continue
    const extension = path.extname(entryName).toLowerCase(); if (!imageExtensions.has(extension)) continue
    const filename = `${ulid()}${extension}`; await fs.writeFile(path.join(customImagesDir(), filename), await entry.buffer()); imageMap.set(`static/images/custom/${path.basename(entryName)}`, `static/images/custom/${filename}`)
  }
  return imageMap
}
async function writeImportedItems(sourceId, itemEntries, imageMap) {
  const importedIdMap = new Map()
  for (const [entryName, entry] of itemEntries) {
    try {
      const item = normalizeItem(JSON.parse((await entry.buffer()).toString('utf8')))
      if (customImage(item.image)) item.image = imageMap.get(item.image) || ''
      const saved = await saveItem({ sourceId, ...item })
      importedIdMap.set(path.basename(entryName, '.json'), saved.id)
    } catch (error) { runtimeLog.warning('config.import_item_skipped', { entryName: path.basename(entryName), error }) }
  }
  return importedIdMap
}
async function importSourceScheduling(sourceId, bundle, importedIdMap, mode) {
  const layout = normalizeWheelLayout({ center: importedIdMap.get(bundle.importedWheelLayout.center), outer: bundle.importedWheelLayout.outer.map((id) => importedIdMap.get(id) || null) })
  if (mode !== 'merge') await saveWheelLayout(sourceId, layout)
  const imported = bundle.importedSchedules.map((entry) => {
    const steps = (Array.isArray(entry?.steps) ? entry.steps : []).map((step) => ({ ...step, itemId: importedIdMap.get(step?.itemId) })).filter((step) => step.itemId)
    return normalizeSchedule({ ...entry, id: ulid(), enabled: false, wakeToolbox: false, steps }, sourceId)
  }).filter(Boolean)
  const current = mode === 'merge' ? await sourceSchedules(sourceId) : []
  await writeSourceSchedules(sourceId, [...current, ...imported])
}
async function restoreImportedOrder(sourceId, existingOrder, importedOrder, importedIdMap) {
  const importedIds = importedOrder.map((id) => importedIdMap.get(id)).filter(Boolean)
  const known = new Set(await storedItemIds(sourceId)); const preferred = [...existingOrder, ...importedIds].filter((id, index, list) => known.has(id) && list.indexOf(id) === index)
  const remaining = (await completeItemOrder(sourceId)).filter((id) => !preferred.includes(id))
  await saveItemOrder(sourceId, [...preferred, ...remaining])
}
async function installBundledDefaultSource(initialization) {
  const bundle = await readBundledDefaultArchive()
  if (initialization.defaultSourceFingerprint === bundle.fingerprint) return initialization
  await saveCategories(defaultSourceId, [...await categories(defaultSourceId), ...(bundle.importedCategories.categories || [])])
  const knownItems = new Set((await listItems(defaultSourceId)).map((item) => `${item.name}\n${item.target.replace(/\\/g, '/')}`))
  const imageMap = await writeImportedImages(bundle.files)
  for (const [, entry] of bundle.itemEntries) {
    const item = normalizeItem(JSON.parse((await entry.buffer()).toString('utf8')))
    if (!/^https?:\/\//i.test(item.target)) item.target = item.target.replace(/\\/g, '/')
    const identity = `${item.name}\n${item.target}`
    if (knownItems.has(identity)) continue
    if (customImage(item.image)) item.image = imageMap.get(item.image) || ''
    await saveItem({ sourceId: defaultSourceId, ...item })
    knownItems.add(identity)
  }
  for (const image of imageMap.values()) await clearUnusedImage(image)
  const updated = { ...initialization, defaultSourceFingerprint: bundle.fingerprint, defaultSourceItemCount: bundle.itemEntries.length }
  await writeJson(config('initialization.json'), updated)
  return updated
}
async function importConfig(payload) {
  const bundle = await readImportArchive(payload.sourcePath)
  const mode = payload.mode
  let source
  let existingOrder = []
  if (mode === 'incremental') {
    const names = (await sources()).sources.map((entry) => entry.name)
    const base = String(bundle.manifest.source?.name || '导入配置源').trim() || '导入配置源'
    let name = base
    let index = 2
    while (names.includes(name)) name = `${base}（${index++}）`
    source = await createSource({ name, inheritDefault: false })
    await saveCategories(source.id, bundle.importedCategories.categories || [])
  } else {
    if (!['merge', 'overwrite'].includes(mode)) throw new Error('无效的导入方式。')
    const current = await requireSource(payload.targetSourceId)
    if (current.source.isDefault) throw new Error('默认配置源不可合并或覆盖；请使用增量导入或切换到自定义配置源。')
    source = current.source
    existingOrder = mode === 'merge' ? await completeItemOrder(source.id) : []
    if (mode === 'overwrite') {
      const oldItems = await listItems(source.id)
      for (const schedule of await sourceSchedules(source.id)) await syncWindowsSchedule({ ...schedule, wakeToolbox: false })
      await fs.rm(itemsDir(source.id), { recursive: true, force: true })
      await fs.mkdir(itemsDir(source.id), { recursive: true })
      await saveCategories(source.id, bundle.importedCategories.categories || [])
      for (const item of oldItems) await clearUnusedImage(item.image)
    } else await saveCategories(source.id, [...await categories(source.id), ...(bundle.importedCategories.categories || [])])
  }
  const imageMap = await writeImportedImages(bundle.files)
  const importedIdMap = await writeImportedItems(source.id, bundle.itemEntries, imageMap)
  await restoreImportedOrder(source.id, existingOrder, bundle.importedOrder, importedIdMap)
  await importSourceScheduling(source.id, bundle, importedIdMap, mode)
  await switchSource(source.id)
  runtimeLog.info('config.imported', { sourceId: source.id, mode, itemCount: importedIdMap.size })
  return source
}
function shortcutEntryKey(sourceId, itemId) { return `${sourceId}:${itemId}` }
function normalizeWheelLayout(value) {
  const slots = value?.wheelSlots || value || {}
  const outer = Array.isArray(slots.outer) ? slots.outer.slice(0, 9) : []
  while (outer.length < 9) outer.push(null)
  const cleanSlot = (id) => validUlid(id) ? id : null
  return { version: 1, center: cleanSlot(slots.center), outer: outer.map(cleanSlot) }
}
async function wheelLayout(sourceId) { await requireSource(sourceId); return normalizeWheelLayout(await readJson(wheelLayoutFile(sourceId), {})) }
async function saveWheelLayout(sourceId, value) {
  await requireSource(sourceId)
  const layout = normalizeWheelLayout(value)
  const ids = new Set((await listItems(sourceId)).map((item) => item.id))
  layout.center = ids.has(layout.center) ? layout.center : null
  layout.outer = layout.outer.map((id) => ids.has(id) ? id : null)
  await writeJson(wheelLayoutFile(sourceId), layout)
  runtimeLog.info('wheel.layout_saved', { sourceId, itemCount: [layout.center, ...layout.outer].filter(Boolean).length })
  return layout
}
function normalizeShortcuts(value) {
  const sourceId = typeof value?.sourceId === 'string' ? value.sourceId : defaultSourceId
  const anchors = new Set(['top-left', 'top', 'top-right', 'left', 'center', 'right', 'bottom-left', 'bottom', 'bottom-right'])
  const itemShortcuts = {}
  for (const [key, accelerator] of Object.entries(value?.itemShortcuts || {})) if (/^[^:]+:[0-9A-HJKMNP-TV-Z]{26}$/.test(key) && typeof accelerator === 'string' && accelerator.trim().length <= 128) itemShortcuts[key] = accelerator.trim()
  return { version: 2, enabled: Boolean(value?.enabled), sourceId, wheelEnabled: Boolean(value?.wheelEnabled), wheelShortcut: typeof value?.wheelShortcut === 'string' ? value.wheelShortcut.trim().slice(0, 128) : '', wheelSize: Math.max(320, Math.min(900, Number(value?.wheelSize) || 760)), wheelAnchor: anchors.has(value?.wheelAnchor) ? value.wheelAnchor : 'center', wheelOffsetX: Math.max(-45, Math.min(45, Number(value?.wheelOffsetX) || 0)), wheelOffsetY: Math.max(-45, Math.min(45, Number(value?.wheelOffsetY) || 0)), itemShortcuts }
}
async function shortcutSettings() { return normalizeShortcuts(await readJson(shortcutsFile(), {})) }
async function migrateLegacyWheelLayout() {
  const legacy = await readJson(shortcutsFile(), null)
  if (!legacy?.wheelSlots) return
  const sourceId = typeof legacy.sourceId === 'string' ? legacy.sourceId : defaultSourceId
  if (!(await readJson(wheelLayoutFile(sourceId), null))) await saveWheelLayout(sourceId, legacy.wheelSlots)
  await writeJson(shortcutsFile(), normalizeShortcuts(legacy))
}
class ToolPackError extends Error {
  constructor(code, message) { super(message); this.name = 'ToolPackError'; this.code = code }
}
async function sha256File(file) {
  const hash = crypto.createHash('sha256')
  await new Promise((resolve, reject) => { const input = fsStream.createReadStream(file); input.on('error', reject); input.on('end', resolve); input.on('data', (chunk) => hash.update(chunk)) })
  return hash.digest('hex')
}
async function relativeFiles(directory, prefix = '') {
  const result = []
  for (const entry of await fs.readdir(directory, { withFileTypes: true }).catch((error) => error.code === 'ENOENT' ? [] : Promise.reject(error))) {
    const relative = path.posix.join(prefix, entry.name); const absolute = path.join(directory, entry.name)
    if (entry.isDirectory()) result.push(...await relativeFiles(absolute, relative))
    else if (entry.isFile()) result.push(relative)
  }
  return result
}
function validToolPackPath(value) { return typeof value === 'string' && /^tools\/(?:[^\\/:*?"<>|]+\/)*[^\\/:*?"<>|]+$/i.test(value) && !value.includes('..') }
async function toolPackStatus() {
  const [state, services, files] = await Promise.all([readJson(toolPackStateFile(), null), officialOnlineServices(), relativeFiles(path.join(dataRoot(), 'tools'), 'tools')])
  const expected = Array.isArray(state?.files) ? state.files.filter(validToolPackPath) : []
  const installed = Boolean(state?.version && expected.length && expected.length === files.length && expected.every((file) => files.includes(file)))
  return { installed, installedVersion: installed ? state.version : '', fileCount: files.length, managed: Boolean(state?.version), downloadConfigured: Boolean(services.toolPack.url && services.toolPack.sha256), availableVersion: services.toolPack.version, releaseUrl: services.updater.owner && services.updater.repo ? `https://github.com/${services.updater.owner}/${services.updater.repo}/releases` : '' }
}
async function readToolPackManifest(archive) {
  const files = new Map(archive.files.filter((entry) => entry.type === 'File').map((entry) => [entry.path, entry]))
  const manifestEntry = files.get('manifest.json')
  if (!manifestEntry) throw new ToolPackError('MANIFEST_MISSING', '工具资源包缺少 manifest.json。')
  let manifest
  try { manifest = JSON.parse((await manifestEntry.buffer()).toString('utf8')) } catch { throw new ToolPackError('MANIFEST_INVALID', '工具资源包清单无法解析。') }
  const listed = Array.isArray(manifest?.files) ? manifest.files : []
  if (manifest?.version !== 1 || !manifest?.packageId || !listed.length || listed.length > 10000) throw new ToolPackError('MANIFEST_INVALID', '工具资源包清单无效。')
  const names = listed.map((entry) => entry?.path)
  if (new Set(names).size !== names.length || names.some((name) => !validToolPackPath(name))) throw new ToolPackError('PATH_INVALID', '工具资源包包含不安全的文件路径。')
  const totalBytes = listed.reduce((sum, entry) => sum + (Number.isSafeInteger(entry?.size) && entry.size >= 0 ? entry.size : -1), 0)
  if (totalBytes < 0 || !Number.isSafeInteger(totalBytes) || Number(manifest.totalBytes) !== totalBytes) throw new ToolPackError('MANIFEST_INVALID', '工具资源包清单中的文件大小无效。')
  if (files.size !== listed.length + 1 || [...files.keys()].some((name) => name !== 'manifest.json' && !names.includes(name))) throw new ToolPackError('CONTENTS_INVALID', '工具资源包内容与清单不一致。')
  return { files, manifest, listed }
}
async function installToolPackArchive(sourcePath, expectedDigest = '') {
  const source = path.resolve(sourcePath); const info = await fs.stat(source).catch(() => null)
  if (!info?.isFile() || info.size <= 0) throw new ToolPackError('ARCHIVE_MISSING', '找不到工具资源包文件。')
  const services = await officialOnlineServices(); const maximum = services.toolPack.maxSizeMiB * 1024 * 1024
  if (info.size > maximum) throw new ToolPackError('ARCHIVE_TOO_LARGE', `工具资源包超过 ${services.toolPack.maxSizeMiB} MiB 上限。`)
  const digest = await sha256File(source)
  if (expectedDigest && digest !== expectedDigest) throw new ToolPackError('CHECKSUM_MISMATCH', '工具资源包校验失败，请重新下载。')
  let archive
  try { archive = await unzipper.Open.file(source) } catch { throw new ToolPackError('ARCHIVE_INVALID', '工具资源包不是有效的 ZIP 文件。') }
  const { files, manifest, listed } = await readToolPackManifest(archive)
  if (Number(manifest.totalBytes) > maximum) throw new ToolPackError('ARCHIVE_TOO_LARGE', `工具资源包解压后超过 ${services.toolPack.maxSizeMiB} MiB 上限。`)
  const currentState = await readJson(toolPackStateFile(), null); const toolsDirectory = path.join(dataRoot(), 'tools')
  const currentFiles = await relativeFiles(toolsDirectory, 'tools')
  const managedFiles = Array.isArray(currentState?.files) ? currentState.files.filter(validToolPackPath) : []
  if (currentFiles.length && (!managedFiles.length || currentFiles.length !== managedFiles.length || currentFiles.some((file) => !managedFiles.includes(file)))) throw new ToolPackError('TOOLS_DIRECTORY_OCCUPIED', '检测到 tools 目录中存在未由工具箱管理的文件；为保护你的文件，已取消安装。')
  const staging = path.join(dataRoot(), `.tool-pack-${crypto.randomUUID()}`); const stagedTools = path.join(staging, 'tools'); const backup = path.join(dataRoot(), `.tool-pack-backup-${crypto.randomUUID()}`)
  try {
    for (const descriptor of listed) {
      const entry = files.get(descriptor.path); const output = path.resolve(staging, descriptor.path)
      if (!entry || !output.startsWith(`${staging}${path.sep}`) || Number(descriptor.size) !== entry.uncompressedSize) throw new ToolPackError('CONTENTS_INVALID', '工具资源包中的文件校验失败。')
      await fs.mkdir(path.dirname(output), { recursive: true })
      const hash = crypto.createHash('sha256'); const verifier = new Transform({ transform(chunk, _encoding, callback) { hash.update(chunk); callback(null, chunk) } })
      await pipeline(entry.stream(), verifier, fsStream.createWriteStream(output))
      if (!/^[a-f0-9]{64}$/i.test(descriptor.sha256 || '') || hash.digest('hex') !== descriptor.sha256.toLowerCase()) throw new ToolPackError('FILE_CHECKSUM_MISMATCH', `工具资源包中的文件校验失败：${path.basename(descriptor.path)}`)
    }
    if (currentFiles.length) await fs.rename(toolsDirectory, backup)
    await fs.rename(stagedTools, toolsDirectory)
    await writeJson(toolPackStateFile(), { version: 1, packageId: manifest.packageId, version: String(manifest.appVersion || manifest.version), installedAt: new Date().toISOString(), archiveSha256: digest, files: listed.map((entry) => entry.path) })
    await fs.rm(backup, { recursive: true, force: true }); runtimeLog.info('tool_pack.installed', { version: String(manifest.appVersion || manifest.version), fileCount: listed.length }); return toolPackStatus()
  } catch (error) {
    if (!(await fs.stat(toolsDirectory).catch(() => null)) && await fs.stat(backup).catch(() => null)) await fs.rename(backup, toolsDirectory).catch(() => {})
    runtimeLog.error('tool_pack.install_failed', { code: error?.code || 'UNEXPECTED', error }); throw error
  } finally { await fs.rm(staging, { recursive: true, force: true }).catch(() => {}); await fs.rm(backup, { recursive: true, force: true }).catch(() => {}) }
}
async function downloadToolPack() {
  const services = await officialOnlineServices(); const settings = services.toolPack
  if (!settings.url || !settings.sha256) throw new ToolPackError('DOWNLOAD_UNAVAILABLE', '官方工具资源包尚未发布，请前往 Releases 下载后选择本地文件安装。')
  const temporary = path.join(dataRoot(), `tool-pack-${crypto.randomUUID()}.zip`); const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 10 * 60 * 1000)
  try {
    const response = await fetch(settings.url, { signal: controller.signal })
    if (!response.ok || !response.body) throw new ToolPackError('DOWNLOAD_FAILED', '下载工具资源包失败，请稍后重试。')
    const declaredSize = Number(response.headers.get('content-length') || 0); const limit = settings.maxSizeMiB * 1024 * 1024
    if (declaredSize && declaredSize > limit) throw new ToolPackError('ARCHIVE_TOO_LARGE', `工具资源包超过 ${settings.maxSizeMiB} MiB 上限。`)
    let downloaded = 0; const limiter = new Transform({ transform(chunk, _encoding, callback) { downloaded += chunk.length; callback(downloaded > limit ? new ToolPackError('ARCHIVE_TOO_LARGE', `工具资源包超过 ${settings.maxSizeMiB} MiB 上限。`) : null, chunk) } })
    await pipeline(Readable.fromWeb(response.body), limiter, fsStream.createWriteStream(temporary))
    return await installToolPackArchive(temporary, settings.sha256)
  } catch (error) { runtimeLog.warning('tool_pack.download_failed', { code: error?.code || 'UNEXPECTED', error }); throw error }
  finally { clearTimeout(timer); await fs.rm(temporary, { force: true }).catch(() => {}) }
}
async function launchTarget(target, options = {}) {
  const targetType = /^https?:\/\//i.test(target) ? 'web' : 'local'
  const mode = options.command ? 'custom_command' : options.elevated ? 'elevated' : 'normal'
  runtimeLog.info('launch.requested', { targetType, mode })
  try {
    if (targetType === 'web') { if (options.elevated || options.command) throw new Error('网站不支持高级启动。'); await shell.openExternal(target); runtimeLog.info('launch.completed', { targetType, mode }); return }
    if (options.command) { await runCustomCommand(options.command); runtimeLog.info('launch.completed', { targetType, mode }); return }
    const installedTarget = await resolveLocalTarget(target)
    const result = options.elevated ? await launchElevated(installedTarget) : await shell.openPath(installedTarget)
    if (result) throw new Error(result)
    runtimeLog.info('launch.completed', { targetType, mode })
  } catch (error) { runtimeLog.error('launch.failed', { targetType, mode, error }); throw error }
}
async function launchShortcutItem(sourceId, itemId) {
  const item = (await listItems(sourceId)).find((entry) => entry.id === itemId)
  if (!item) throw new Error('快捷键关联的项目已不存在。')
  return launchTarget(item.target)
}
function cronFieldMatches(field, value, minimum, maximum, weekday = false) {
  const normalizedValue = weekday && value === 7 ? 0 : value
  return String(field || '').split(',').some((rawPart) => {
    const [rawRange, rawStep] = rawPart.trim().split('/')
    const step = rawStep === undefined ? 1 : Number(rawStep)
    if (!Number.isInteger(step) || step < 1) return false
    let start = minimum; let end = maximum
    if (rawRange !== '*') {
      const range = rawRange.split('-').map(Number)
      if (range.some((part) => !Number.isInteger(part))) return false
      start = range[0]; end = range.length === 2 ? range[1] : range[0]
    }
    if (weekday) { if (start === 7) start = 0; if (end === 7) end = 0 }
    if (start < minimum || start > maximum || end < minimum || end > maximum || start > end) return false
    return normalizedValue >= start && normalizedValue <= end && (normalizedValue - start) % step === 0
  })
}
function cronMatches(cron, date) {
  const [minute = '', hour = '', day = '', month = '', weekday = ''] = String(cron || '').trim().split(/\s+/)
  if (![minute, hour, day, month, weekday].every(Boolean)) return false
  if (!cronFieldMatches(minute, date.getMinutes(), 0, 59) || !cronFieldMatches(hour, date.getHours(), 0, 23) || !cronFieldMatches(month, date.getMonth() + 1, 1, 12)) return false
  const dayMatches = cronFieldMatches(day, date.getDate(), 1, 31)
  const weekdayMatches = cronFieldMatches(weekday, date.getDay(), 0, 6, true)
  return day === '*' && weekday === '*' ? true : day === '*' ? weekdayMatches : weekday === '*' ? dayMatches : dayMatches || weekdayMatches
}
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))
async function processScheduleQueue() {
  if (scheduleQueueRunning) return
  scheduleQueueRunning = true
  try {
    while (scheduleQueue.length) {
      const entry = scheduleQueue.shift()
      try {
        runtimeLog.info('schedule.execution_started', { scheduleId: entry.id, sourceId: entry.sourceId, stepCount: entry.steps.length })
        const itemsById = new Map((await listItems(entry.sourceId)).map((item) => [item.id, item]))
        let completed = 0
        for (let index = 0; index < entry.steps.length; index += 1) {
          const step = entry.steps[index]; const item = itemsById.get(step.itemId)
          if (!item) { runtimeLog.warning('schedule.step_skipped', { scheduleId: entry.id, stepIndex: index, reason: 'item_not_found' }); continue }
          try { await launchTarget(item.target, { elevated: step.elevated }); completed += 1 }
          catch (error) { runtimeLog.error('schedule.step_failed', { scheduleId: entry.id, stepIndex: index, elevated: step.elevated, error }) }
          if (step.delayAfterSeconds > 0 && index < entry.steps.length - 1) await sleep(step.delayAfterSeconds * 1000)
        }
        runtimeLog.info('schedule.execution_completed', { scheduleId: entry.id, completedSteps: completed, totalSteps: entry.steps.length })
      } catch (error) { runtimeLog.error('schedule.execution_failed', { scheduleId: entry.id, error }) }
      finally { activeScheduleIds.delete(entry.id) }
    }
  } finally { scheduleQueueRunning = false }
}
async function enqueueSchedule(id) {
  const entry = (await schedules()).find((schedule) => schedule.id === id)
  if (!entry) throw new Error('定时任务不存在。')
  if (!entry.enabled) { runtimeLog.info('schedule.enqueue_skipped', { scheduleId: entry.id, reason: 'disabled' }); return false }
  if (activeScheduleIds.has(entry.id)) { runtimeLog.info('schedule.enqueue_skipped', { scheduleId: entry.id, reason: 'already_queued_or_running' }); return false }
  activeScheduleIds.add(entry.id); scheduleQueue.push(entry)
  runtimeLog.info('schedule.queued', { scheduleId: entry.id, sourceId: entry.sourceId, queueLength: scheduleQueue.length })
  void processScheduleQueue()
  return true
}
function triggerSchedule(entry) {
  enqueueSchedule(entry.id).catch((error) => runtimeLog.error('schedule.trigger_failed', { scheduleId: entry.id, error }))
  if (repeatTimers.has(entry.id)) clearInterval(repeatTimers.get(entry.id))
  if (entry.repeatEveryMinutes > 0) {
    const timer = setInterval(() => enqueueSchedule(entry.id).catch((error) => runtimeLog.error('schedule.repeat_failed', { scheduleId: entry.id, error })), entry.repeatEveryMinutes * 60 * 1000)
    repeatTimers.set(entry.id, timer)
    runtimeLog.info('schedule.repeat_registered', { scheduleId: entry.id, everyMinutes: entry.repeatEveryMinutes })
  }
}
function unregisterToolboxShortcuts() { const count = registeredShortcuts.size; for (const accelerator of registeredShortcuts) globalShortcut.unregister(accelerator); registeredShortcuts.clear(); if (count) runtimeLog.debug('shortcuts.unregistered', { count }) }
function registerShortcut(accelerator, callback, errors, label) {
  if (!accelerator) return
  try { if (!globalShortcut.register(accelerator, callback)) { errors.push(`“${label}”无法注册：该快捷键可能正被其他程序占用。`); runtimeLog.warning('shortcut.registration_failed', { label, reason: 'unavailable' }) } else registeredShortcuts.add(accelerator) } catch (error) { errors.push(`“${label}”无效：${error.message || accelerator}`); runtimeLog.warning('shortcut.registration_failed', { label, error }) }
}
async function applyShortcuts() {
  unregisterToolboxShortcuts()
  const settings = await shortcutSettings(); const errors = []
  if (!settings.enabled) { runtimeLog.info('shortcuts.disabled', {}); return { settings, errors } }
  if (settings.wheelEnabled) registerShortcut(settings.wheelShortcut, () => toggleWheel().catch((error) => runtimeLog.error('wheel.toggle_failed', { error })), errors, '快捷轮盘')
  for (const [key, accelerator] of Object.entries(settings.itemShortcuts)) {
    const [sourceId, itemId] = key.split(':')
    if (settings.wheelEnabled && accelerator === settings.wheelShortcut) { errors.push(`“${accelerator}”与快捷轮盘重复，已跳过项目快捷键。`); continue }
    registerShortcut(accelerator, () => launchShortcutItem(sourceId, itemId).catch((error) => runtimeLog.error('shortcut.launch_failed', { sourceId, itemId, error })), errors, `项目快捷键 ${accelerator}`)
  }
  runtimeLog.info('shortcuts.applied', { registeredCount: registeredShortcuts.size, errorCount: errors.length, wheelEnabled: Boolean(settings.wheelEnabled) }); return { settings, errors }
}
async function wheelPayload() {
  const sourceId = (await sources()).activeSourceId
  const layout = await wheelLayout(sourceId)
  const items = await listItems(sourceId)
  const index = new Map(items.map((item) => [item.id, item]))
  const present = (id) => { const item = index.get(id); return item ? { id: item.id, name: item.name, target: item.target, imageDataUrl: item.imageDataUrl, isWeb: /^https?:\/\//i.test(item.target) } : null }
  return { sourceId, center: present(layout.center), outer: layout.outer.map(present) }
}
function wheelBounds(settings, display) {
  const size = Math.round(Math.min(settings.wheelSize, display.width - 32, display.height - 32))
  const anchors = { 'top-left': [0, 0], top: [.5, 0], 'top-right': [1, 0], left: [0, .5], center: [.5, .5], right: [1, .5], 'bottom-left': [0, 1], bottom: [.5, 1], 'bottom-right': [1, 1] }
  const [anchorX, anchorY] = anchors[settings.wheelAnchor] || anchors.center
  const centerX = display.x + display.width * (anchorX + settings.wheelOffsetX / 100)
  const centerY = display.y + display.height * (anchorY + settings.wheelOffsetY / 100)
  return { width: size, height: size, x: Math.round(Math.max(display.x, Math.min(display.x + display.width - size, centerX - size / 2))), y: Math.round(Math.max(display.y, Math.min(display.y + display.height - size, centerY - size / 2))) }
}
async function toggleWheel() {
  if (wheelWindow && !wheelWindow.isDestroyed() && wheelWindow.isVisible()) { clearTimeout(wheelPreviewTimer); wheelPreviewTimer = null; wheelWindow.hide(); runtimeLog.info('wheel.hidden', { trigger: 'toggle' }); return }
  return showWheel()
}
async function showWheel(appearance = null, preview = false) {
  if (preview && wheelPreviewTimer && wheelWindow && !wheelWindow.isDestroyed() && wheelWindow.isVisible()) { clearTimeout(wheelPreviewTimer); wheelPreviewTimer = null; wheelWindow.hide(); return }
  const settings = normalizeShortcuts({ ...await shortcutSettings(), ...(appearance || {}) })
  const payload = await wheelPayload()
  const bounds = wheelBounds(settings, screen.getPrimaryDisplay().workArea)
  if (!wheelWindow || wheelWindow.isDestroyed()) {
    wheelWindow = new BrowserWindow({ ...bounds, frame: false, transparent: true, resizable: false, maximizable: false, minimizable: false, skipTaskbar: true, alwaysOnTop: true, hasShadow: false, webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false } })
    wheelWindow.setAlwaysOnTop(true, 'screen-saver'); wheelWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true }); wheelWindow.on('blur', () => wheelWindow?.hide()); wheelWindow.on('closed', () => { wheelWindow = null }); await wheelWindow.loadFile(path.join(app.getAppPath(), 'apps', 'desktop', 'renderer', 'wheel.html'))
  } else wheelWindow.setBounds(bounds)
  wheelWindow.webContents.send('wheel:data', payload); wheelWindow.show(); wheelWindow.focus(); runtimeLog.info('wheel.shown', { preview, itemCount: [payload.center, ...payload.outer].filter(Boolean).length })
  clearTimeout(wheelPreviewTimer); wheelPreviewTimer = preview ? setTimeout(() => { wheelWindow?.hide(); wheelPreviewTimer = null }, 6000) : null
}
async function ensureRuntimeLayout() {
  await Promise.all(['items', 'items/default', 'static/images/builtin', 'static/images/custom', 'static/images/custom/backgrounds', 'static/icons', 'static/themes', 'static/templates', 'static/data', 'tools', 'config', 'config/sources/default', 'logs'].map((directory) => fs.mkdir(path.join(dataRoot(), directory), { recursive: true })))
  const bundledTools = app.isPackaged && !process.env.PORTABLE_EXECUTABLE_DIR ? path.join(process.resourcesPath, 'tools') : ''
  const userTools = path.join(dataRoot(), 'tools')
  const userToolEntries = await fs.readdir(userTools).catch((error) => error.code === 'ENOENT' ? [] : Promise.reject(error))
  if (bundledTools && userToolEntries.length === 0) {
    try { for (const entry of await fs.readdir(bundledTools)) await fs.cp(path.join(bundledTools, entry), path.join(userTools, entry), { recursive: true, force: false, errorOnExist: false }) }
    catch (error) { if (error.code !== 'ENOENT') { runtimeLog.error('runtime.bundled_tools_copy_failed', { error }); throw error } }
  }
  const data = await sources(); if (!(await readJson(sourceFile(), null))) await writeJson(sourceFile(), data); if (!(await readJson(categoryFile(defaultSourceId), null))) await fs.writeFile(categoryFile(defaultSourceId), await fs.readFile(template('config', 'categories.json')))
  const initialization = await readJson(config('initialization.json'), { version: 1 })
  await installBundledDefaultSource(initialization)
  await migrateLegacyWheelLayout()
  await migrateLegacySchedules(); runtimeLog.info('runtime.layout_ready', { packaged: app.isPackaged, portable: Boolean(process.env.PORTABLE_EXECUTABLE_DIR) })
}
function createWindow() { mainWindow = new BrowserWindow({ width: 1280, height: 820, minWidth: 960, minHeight: 640, autoHideMenuBar: true, backgroundColor: '#f8e6d2', icon: path.join(__dirname, '..', 'renderer', 'assets', 'jae-travel-suitcase.ico'), webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false } }); mainWindow.setMenuBarVisibility(false); mainWindow.on('closed', () => { runtimeLog.info('window.main_closed', {}); mainWindow = null }); if (process.env.VITE_DEV_SERVER_URL) mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL); else mainWindow.loadFile(path.join(app.getAppPath(), 'dist', 'renderer', 'index.html')); runtimeLog.info('window.main_created', { development: Boolean(process.env.VITE_DEV_SERVER_URL) }) }
app.on('render-process-gone', (_event, webContents, details) => runtimeLog.error('renderer.process_gone', { reason: details.reason, exitCode: details.exitCode, role: webContents.getType() }))
app.whenReady().then(async () => {
  Menu.setApplicationMenu(null); registerToolboxAssetProtocol(); await ensureRuntimeLayout(); await initializeUpdater()
  ipcMain.handle('toolbox:launch', async (_event, target, options = {}) => launchTarget(target, options))
ipcMain.handle('toolbox:get-shortcuts', async () => { const settings = await shortcutSettings(); return { ...settings, wheelLayout: await wheelLayout(settings.sourceId) } })
  ipcMain.handle('toolbox:get-wheel-layout', (_event, sourceId) => wheelLayout(sourceId))
  ipcMain.handle('toolbox:save-shortcuts', async (_event, payload) => {
    const settings = normalizeShortcuts(payload)
    await requireSource(settings.sourceId)
    for (const key of Object.keys(settings.itemShortcuts)) { const [sourceId, itemId] = key.split(':'); if (!(await listItems(sourceId).catch(() => [])).some((item) => item.id === itemId)) delete settings.itemShortcuts[key] }
    const layout = await saveWheelLayout(settings.sourceId, payload?.wheelLayout)
    await writeJson(shortcutsFile(), settings)
    const applied = await applyShortcuts()
    return { ...applied, settings: { ...applied.settings, wheelLayout: layout } }
  })
  ipcMain.handle('toolbox:preview-wheel', async (_event, appearance) => showWheel(appearance, true))
  ipcMain.handle('toolbox:wheel-launch', async (_event, id) => { const sourceId = (await sources()).activeSourceId; const layout = await wheelLayout(sourceId); const itemId = assertItem(id); if (![layout.center, ...layout.outer].includes(itemId)) throw new Error('该项目不在快捷轮盘中。'); wheelWindow?.hide(); return launchShortcutItem(sourceId, itemId) })
  ipcMain.on('toolbox:wheel-hide', () => wheelWindow?.hide())
  ipcMain.handle('toolbox:choose-item-image', async (event) => { const result = await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender), { title: '选择项目图标', properties: ['openFile'], filters: [{ name: '图片或图标文件', extensions: [...imageExtensions].map((ext) => ext.slice(1)) }] }); return result.canceled || !result.filePaths[0] ? null : { sourcePath: result.filePaths[0], previewUrl: await imageData(result.filePaths[0]) } })
  ipcMain.handle('toolbox:choose-config-import', async (event) => { const result = await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender), { title: '选择 .attconfig 配置包', properties: ['openFile'], filters: [{ name: '阿洁的旅行工具箱配置', extensions: ['attconfig'] }] }); return result.canceled || !result.filePaths[0] ? null : { sourcePath: result.filePaths[0], fileName: path.basename(result.filePaths[0]) } })
  ipcMain.handle('toolbox:get-tool-pack-status', () => toolPackStatus())
  ipcMain.handle('toolbox:choose-tool-pack', async (event) => { const result = await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender), { title: '选择工具资源包', properties: ['openFile'], filters: [{ name: '阿洁的旅行工具资源包', extensions: ['zip'] }] }); return result.canceled || !result.filePaths[0] ? null : { sourcePath: result.filePaths[0], fileName: path.basename(result.filePaths[0]) } })
  ipcMain.handle('toolbox:install-tool-pack', (_event, sourcePath) => installToolPackArchive(sourcePath))
  ipcMain.handle('toolbox:download-tool-pack', () => downloadToolPack())
  ipcMain.handle('toolbox:import-config', (_event, payload) => importConfig(payload || {}))
  ipcMain.handle('toolbox:export-source', (event, sourceId) => exportSource(sourceId, event.sender))
  ipcMain.handle('toolbox:list-sources', () => sources()); ipcMain.handle('toolbox:create-source', (_event, payload) => createSource(payload || {})); ipcMain.handle('toolbox:switch-source', (_event, id) => switchSource(id)); ipcMain.handle('toolbox:delete-source', (_event, id) => deleteSource(id)); ipcMain.handle('toolbox:list-categories', (_event, id) => categories(id)); ipcMain.handle('toolbox:save-categories', (_event, id, list) => saveCategories(id, list)); ipcMain.handle('toolbox:list-items', (_event, id) => listItems(id)); ipcMain.handle('toolbox:save-item-order', (_event, sourceId, ids) => saveItemOrder(sourceId, ids)); ipcMain.handle('toolbox:save-item', (_event, payload) => saveItem(payload || {})); ipcMain.handle('toolbox:delete-item', (_event, sourceId, id) => deleteItem(sourceId, id)); ipcMain.handle('toolbox:bulk-update-items', (_event, payload) => bulkUpdateItems(payload || {})); ipcMain.handle('toolbox:import-item-to-source', (_event, payload) => importItem(payload || {}))
  ipcMain.handle('toolbox:choose-background', async (event) => { const result = await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender), { title: '选择背景图片', properties: ['openFile'], filters: [{ name: '图片文件', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'] }] }); return result.canceled || !result.filePaths[0] ? null : { sourcePath: result.filePaths[0], previewUrl: await imageData(result.filePaths[0]) } })
  ipcMain.handle('toolbox:get-background-settings', () => backgroundView())
  ipcMain.handle('toolbox:save-background', (_event, payload) => saveBackground(payload || {}))
  ipcMain.handle('toolbox:select-background', (_event, image) => selectBackground(image))
  ipcMain.handle('toolbox:reset-background', () => resetBackground())
  ipcMain.handle('toolbox:get-announcement', () => announcementView())
  ipcMain.handle('toolbox:dismiss-announcement', (_event, contentId) => dismissAnnouncement(contentId))
  ipcMain.handle('toolbox:get-update-state', () => updateState)
  ipcMain.handle('toolbox:get-update-settings', () => updateSettings())
  ipcMain.handle('toolbox:save-update-settings', (_event, payload) => saveUpdateSettings(payload || {}))
  ipcMain.handle('toolbox:check-for-updates', () => checkForUpdates())
  ipcMain.handle('toolbox:download-update', () => downloadUpdate())
  ipcMain.handle('toolbox:install-update', () => installDownloadedUpdate())
  ipcMain.handle('toolbox:get-runtime-logs', (_event, limit) => runtimeLog.recent(limit))
  ipcMain.handle('toolbox:export-runtime-logs', async (event) => {
    const result = await dialog.showSaveDialog(BrowserWindow.fromWebContents(event.sender), { title: '导出运行日志', defaultPath: `JaeTravelToolbox-runtime-${logDateStamp()}.txt`, filters: [{ name: '文本文件', extensions: ['txt'] }] })
    if (result.canceled || !result.filePath) return null
    const exported = await runtimeLog.exportText(result.filePath)
    runtimeLog.info('logs.exported', { count: exported.count })
    return { count: exported.count, fileName: path.basename(exported.path) }
  })
  ipcMain.handle('toolbox:log-renderer-event', (_event, payload = {}) => {
    const level = ['debug', 'info', 'warning', 'error', 'critical'].includes(payload.level) ? payload.level : 'warning'
    const eventName = String(payload.event || 'renderer.event').slice(0, 120)
    runtimeLog[level](`renderer.${eventName}`, { context: payload.context || {} })
  })
  ipcMain.handle('toolbox:list-schedules', () => schedules())
  ipcMain.handle('toolbox:save-schedule', (_event, payload) => saveSchedule(payload || {}))
  ipcMain.handle('toolbox:delete-schedule', async (_event, id) => { const entry = (await schedules()).find((schedule) => schedule.id === id); if (!entry) return; if (repeatTimers.has(entry.id)) { clearInterval(repeatTimers.get(entry.id)); repeatTimers.delete(entry.id) }; await syncWindowsSchedule({ ...entry, wakeToolbox: false }); await writeSourceSchedules(entry.sourceId, (await sourceSchedules(entry.sourceId)).filter((schedule) => schedule.id !== id)); runtimeLog.warning('schedule.deleted', { scheduleId: entry.id, sourceId: entry.sourceId }) })
  ipcMain.handle('toolbox:run-schedule', (_event, id) => enqueueSchedule(id))
  const scheduleArgumentIndex = process.argv.indexOf('--run-schedule')
  const startupId = scheduleArgumentIndex >= 0 ? process.argv[scheduleArgumentIndex + 1] : null
  if (startupId) enqueueSchedule(startupId)
  for (const schedule of await schedules()) if (schedule.enabled && schedule.runOnStartup && schedule.id !== startupId) enqueueSchedule(schedule.id)
  setInterval(async () => { const now = new Date(); if (now.getSeconds() !== 0) return; for (const schedule of await schedules()) if (schedule.enabled && cronMatches(schedule.cron, now)) triggerSchedule(schedule) }, 1000)
  await applyShortcuts()
  createWindow()
  const launchSettings = await updateSettings()
  runtimeLog.info('app.ready', { development: !app.isPackaged, startupSchedule: Boolean(startupId) })
  if (launchSettings.checkOnLaunch) checkForUpdates().catch((error) => runtimeLog.warning('updater.launch_check_failed', { error }))
}).catch((error) => {
  runtimeLog.critical('app.startup_failed', { error })
  runtimeLog.flush()
  dialog.showErrorBox('阿洁的旅行工具箱启动失败', '程序初始化失败，请在“logs”目录中查看运行日志。')
})
app.on('will-quit', () => { runtimeLog.info('app.will_quit', {}); unregisterToolboxShortcuts(); for (const timer of repeatTimers.values()) clearInterval(timer); repeatTimers.clear(); runtimeLog.flush() })
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() }); app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
