const fs = require('node:fs')
const fsPromises = require('node:fs/promises')
const path = require('node:path')
const pino = require('pino')

const LEVELS = Object.freeze({ debug: 'DEBUG', info: 'INFO', warning: 'WARNING', error: 'ERROR', critical: 'CRITICAL' })
const REDACTED_KEYS = /(?:authorization|cookie|credential|password|passphrase|secret|token|api[-_]?key|access[-_]?key|refresh[-_]?key|session|payload|screenshot|window[-_]?handle|native[-_]?handle)/i
const MAX_STRING_LENGTH = 480

function dateStamp(date = new Date()) { return date.toISOString().slice(0, 10) }
function safeText(value) {
  const text = String(value ?? '')
  const withoutUrls = text.replace(/\b(?:https?|ftp|file|ws|wss):\/\/[^\s"')]+|\b(?:mailto|data):[^\s"')]+/gi, '[external-uri]')
  const withoutPaths = withoutUrls.replace(/[A-Za-z]:\\[^\s"')]+|(?:\/[^\s"')]+){2,}/g, (raw) => `[path:${path.basename(raw.replace(/[\\/]+$/, '')) || 'redacted'}]`)
  return withoutPaths.length > MAX_STRING_LENGTH ? `${withoutPaths.slice(0, MAX_STRING_LENGTH)}…` : withoutPaths
}
function sanitize(value, key = '', depth = 0) {
  if (REDACTED_KEYS.test(key)) return '[REDACTED]'
  if (value == null || typeof value === 'boolean' || typeof value === 'number') return value
  if (typeof value === 'string') return safeText(value)
  if (value instanceof Error) return { name: value.name || 'Error', code: value.code || '', message: safeText(value.message) }
  if (Buffer.isBuffer(value)) return `[buffer:${value.length} bytes]`
  if (depth >= 4) return '[truncated]'
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => sanitize(item, '', depth + 1))
  if (typeof value === 'object') return Object.fromEntries(Object.entries(value).slice(0, 40).map(([childKey, childValue]) => [childKey, sanitize(childValue, childKey, depth + 1)]))
  return safeText(value)
}
function readableTime(value) {
  const date = new Date(value || Date.now())
  const pad = (number, length = 2) => String(number).padStart(length, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`
}
function formatTextEntry(entry) {
  const { time, severity, event, msg, ...fields } = entry
  const details = Object.keys(fields).length ? ` ${JSON.stringify(fields)}` : ''
  return `${readableTime(time)} [${severity || 'INFO'}] ${event || msg || 'runtime.event'}${details}`
}

function clearPreviousRuntimeLogs(directory) {
  let removed = 0
  let failures = 0
  try {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (!entry.isFile() || !/^runtime-\d{4}-\d{2}-\d{2}\.ndjson$/i.test(entry.name)) continue
      try { fs.unlinkSync(path.join(directory, entry.name)); removed += 1 } catch { failures += 1 }
    }
  } catch { failures += 1 }
  return { removed, failures }
}

function createRuntimeLogger({ directory, appVersion, processName = 'main', development = false }) {
  fs.mkdirSync(directory, { recursive: true })
  const previousLogs = clearPreviousRuntimeLogs(directory)
  const file = path.join(directory, `runtime-${dateStamp()}.ndjson`)
  const destination = pino.destination({ dest: file, mkdir: true, sync: false })
  const subscriptions = new Set()
  const logger = pino({
    level: process.env.JAE_LOG_LEVEL || (development ? 'debug' : 'info'),
    base: { app: 'JaeTravelToolbox', appVersion, process: processName },
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: { level(label) { return { severity: LEVELS[label === 'warn' ? 'warning' : label === 'fatal' ? 'critical' : label] || String(label).toUpperCase() } } },
  }, destination)

  function emit(level, event, fields = {}) {
    const severity = LEVELS[level] || LEVELS.info
    const cleanFields = sanitize(fields)
    const entry = { ...cleanFields, time: new Date().toISOString(), severity, event: safeText(event) }
    const method = level === 'warning' ? 'warn' : level === 'critical' ? 'fatal' : level
    logger[method]({ event: entry.event, ...cleanFields }, entry.event)
    subscriptions.forEach((listener) => { try { listener(entry) } catch (error) { logger.warn({ error: sanitize(error), event: 'log.subscriber_failed' }, 'log.subscriber_failed') } })
    return entry
  }
  if (previousLogs.failures) emit('warning', 'log.previous_run_cleanup_incomplete', { failureCount: previousLogs.failures })
  else if (previousLogs.removed) emit('info', 'log.previous_run_files_removed', { count: previousLogs.removed })
  async function recent(limit = 400) {
    const files = (await fsPromises.readdir(directory, { withFileTypes: true })).filter((entry) => entry.isFile() && /^runtime-\d{4}-\d{2}-\d{2}\.ndjson$/i.test(entry.name)).map((entry) => entry.name).sort()
    const entries = []
    let malformedEntries = 0
    for (const name of files) {
      const text = await fsPromises.readFile(path.join(directory, name), 'utf8').catch(() => '')
      for (const line of text.split(/\r?\n/)) {
        try { if (line) entries.push(JSON.parse(line)) }
        catch { malformedEntries += 1 }
      }
    }
    if (malformedEntries) emit('warning', 'log.malformed_entries_skipped', { count: malformedEntries })
    return entries.slice(-Math.max(1, Math.min(Number(limit) || 400, 2000))).map((entry) => sanitize(entry))
  }
  async function exportText(destinationPath) {
    const entries = await recent(2000)
    await fsPromises.writeFile(destinationPath, `${entries.map(formatTextEntry).join('\r\n')}\r\n`, 'utf8')
    return { count: entries.length, path: destinationPath }
  }
  return {
    debug: (event, fields) => emit('debug', event, fields), info: (event, fields) => emit('info', event, fields), warning: (event, fields) => emit('warning', event, fields), error: (event, fields) => emit('error', event, fields), critical: (event, fields) => emit('critical', event, fields),
    subscribe(listener) { subscriptions.add(listener); return () => subscriptions.delete(listener) }, recent, exportText, directory, flush() { destination.flushSync?.() }, sanitize,
  }
}

module.exports = { createRuntimeLogger, sanitize, formatTextEntry, readableTime }
