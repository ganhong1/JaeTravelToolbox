import { pinyin } from 'pinyin-pro';
import Fuse from 'fuse.js';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import guideMarkdown from './content/guide.zh-CN.md?raw';

const drawer = document.querySelector('#category-drawer');
const drawerBackdrop = document.querySelector('#drawer-backdrop');
const settingsButton = document.querySelector('#open-settings');
const settingsMenu = document.querySelector('#settings-menu');
const backgroundDialog = document.querySelector('#background-dialog');
const backgroundDropzone = document.querySelector('#choose-background');
const backgroundHistory = document.querySelector('#background-history');
const openDrawerButton = document.querySelector('#open-drawer');
const closeDrawerButton = document.querySelector('#close-drawer');
let categoryButtons = [...document.querySelectorAll('.category-item')];
const categoryList = document.querySelector('.category-list');
const categoryOptions = document.querySelector('#category-options');
let cards = [...document.querySelectorAll('.tool-card:not(.add-card)')];
const searchInput = document.querySelector('#search');
const pageTitle = document.querySelector('#page-title');
const categoryDescription = document.querySelector('#category-description');
const emptyState = document.querySelector('#empty-state');
const toast = document.querySelector('#toast');
const editDialog = document.querySelector('#edit-dialog');
const confirmDialog = document.querySelector('#confirm-dialog');
const editForm = document.querySelector('#edit-form');
const editorAvatar = document.querySelector('#editor-avatar');
const itemNameInput = document.querySelector('#item-name');
const itemTargetInput = document.querySelector('#item-target');
const itemCategoryInput = document.querySelector('#item-category');
const itemDescriptionInput = document.querySelector('#item-description');
const advancedLaunchEditor = document.querySelector('#advanced-launch-editor');
const advancedLaunchEnabledInput = document.querySelector('#advanced-launch-enabled');
const commandLaunchEditor = document.querySelector('#command-launch-editor');
const commandLaunchList = document.querySelector('#command-launch-list');
const deleteDescription = document.querySelector('#delete-description');
const imageFileInput = document.querySelector('#image-file');
const createDialog = document.querySelector('#create-dialog');
const createForm = document.querySelector('#create-form');
const createNameInput = document.querySelector('#create-name');
const createTargetInput = document.querySelector('#create-target');
const createCategoryInput = document.querySelector('#create-category');
const createDescriptionInput = document.querySelector('#create-description');
const createAvatar = document.querySelector('#create-avatar');
const createImageFileInput = document.querySelector('#create-image-file');
const addCard = document.querySelector('.add-card');
const categoryDialog = document.querySelector('#category-dialog');
const categoryForm = document.querySelector('#category-form');
const newCategoryNameInput = document.querySelector('#new-category-name');
const managedCategoryItems = document.querySelector('#managed-category-items');
const exportDialog = document.querySelector('#export-dialog');
const exportForm = document.querySelector('#export-form');
const exportItemCount = document.querySelector('#export-item-count');
const exportCategoryCount = document.querySelector('#export-category-count');
const exportSourceSelect = document.querySelector('#export-source');
const importDialog = document.querySelector('#import-dialog');
const importForm = document.querySelector('#import-form');
const importFileInput = document.querySelector('#import-file');
const importFileName = document.querySelector('#import-file-name');
const sourceDialog = document.querySelector('#source-dialog');
const sourceForm = document.querySelector('#source-form');
const sourceItems = document.querySelector('#source-items');
const sourceNameInput = document.querySelector('#source-name');
const sourceInheritInput = document.querySelector('#source-inherit');
const itemImportDialog = document.querySelector('#item-import-dialog');
const itemImportForm = document.querySelector('#item-import-form');
const itemImportTarget = document.querySelector('#item-import-target');
const guideDialog = document.querySelector('#guide-dialog');
const guideContent = document.querySelector('#guide-content');
const guideToc = document.querySelector('#guide-toc');
const announcementDialog = document.querySelector('#announcement-dialog');
const announcementContent = document.querySelector('#announcement-content');
const announcementToc = document.querySelector('#announcement-toc');
const announcementStatus = document.querySelector('#announcement-status');
const announcementDot = document.querySelector('#announcement-dot');
const announcementDismiss = document.querySelector('#announcement-dismiss');
const announcementScrollHint = document.querySelector('#announcement-scroll-hint');
const updateDialog = document.querySelector('#update-dialog');
const updateCurrentVersion = document.querySelector('#update-current-version');
const updateStatus = document.querySelector('#update-status');
const updateNotes = document.querySelector('#update-notes');
const updateSourceHint = document.querySelector('#update-source-hint');
const updateCheckOnLaunch = document.querySelector('#update-check-on-launch');
const updateAutoDownload = document.querySelector('#update-auto-download');
const updateAutoInstall = document.querySelector('#update-auto-install');
const downloadUpdateButton = document.querySelector('#download-update');
const installUpdateButton = document.querySelector('#install-update');
const batchToolbar = document.querySelector('#batch-toolbar');
const batchSelectedCount = document.querySelector('#batch-selected-count');
const batchMoveDialog = document.querySelector('#batch-move-dialog');
const batchMoveForm = document.querySelector('#batch-move-form');
const batchCategorySelect = document.querySelector('#batch-category-select');
const batchNewCategoryInput = document.querySelector('#batch-new-category');
const batchMoveDialogTitle = document.querySelector('#batch-move-dialog-title');
const batchCategoryHint = document.querySelector('#batch-category-hint');
const confirmBatchCategory = document.querySelector('#confirm-batch-category');
const batchDeleteDialog = document.querySelector('#batch-delete-dialog');
const batchDeleteDescription = document.querySelector('#batch-delete-description');
const scheduleDialog = document.querySelector('#schedule-dialog');
const scheduleForm = document.querySelector('#schedule-form');
const scheduleItems = document.querySelector('#schedule-items');
const scheduleSource = document.querySelector('#schedule-source');
const scheduleItemPicker = document.querySelector('#schedule-item-picker');
const scheduleSteps = document.querySelector('#schedule-steps');
const scheduleCron = document.querySelector('#schedule-cron');
const shortcutDialog = document.querySelector('#shortcut-dialog');
const shortcutForm = document.querySelector('#shortcut-form');
const shortcutSource = document.querySelector('#shortcut-source');
const shortcutEnabled = document.querySelector('#shortcuts-enabled');
const wheelEnabled = document.querySelector('#wheel-enabled');
const wheelShortcut = document.querySelector('#wheel-shortcut');
const wheelSize = document.querySelector('#wheel-size');
const wheelSizeValue = document.querySelector('#wheel-size-value');
const wheelAnchorGrid = document.querySelector('#wheel-anchor-grid');
const wheelOffsetX = document.querySelector('#wheel-offset-x');
const wheelOffsetXValue = document.querySelector('#wheel-offset-x-value');
const wheelOffsetY = document.querySelector('#wheel-offset-y');
const wheelOffsetYValue = document.querySelector('#wheel-offset-y-value');
const previewWheelButton = document.querySelector('#preview-wheel');
const shortcutCaptureDialog = document.querySelector('#shortcut-capture-dialog');
const shortcutCaptureTitle = document.querySelector('#shortcut-capture-title');
const shortcutCaptureDescription = document.querySelector('#shortcut-capture-description');
const shortcutCaptureValue = document.querySelector('#shortcut-capture-value');
let captureShortcutTarget = null;
const wheelSlotGrid = document.querySelector('#wheel-slot-grid');
const itemShortcutList = document.querySelector('#item-shortcut-list');
let shortcutSettings = null;
let shortcutItems = [];
let scheduleList = [];
let editingScheduleId = null;
let editingScheduleSteps = [];
let simpleScheduleDirty = false;
let currentCategory = '全部';
let sourceSettings = null;
let currentSourceId = 'default';
let toastTimer;
let activeCard = null;
let pendingImage = null;
let editingCommandLaunches = [];
let pendingCreateImage = null;
let pendingImportConfig = null;
let searchEngine = null;
let batchMode = false;
let batchCategoryOperation = 'set-category';
const selectedItemIds = new Set();
let draggedCard = null;

function shortcutItemKey(sourceId, itemId) { return `${sourceId}:${itemId}`; }
function normalizeShortcutSettings(value = {}) {
  const outer = Array.isArray(value.wheelLayout?.outer) ? value.wheelLayout.outer.slice(0, 9) : []
  while (outer.length < 9) outer.push(null)
  return { enabled: Boolean(value.enabled), sourceId: value.sourceId || currentSourceId, wheelEnabled: Boolean(value.wheelEnabled), wheelShortcut: value.wheelShortcut || '', wheelSize: Math.max(320, Math.min(900, Number(value.wheelSize) || 760)), wheelAnchor: value.wheelAnchor || 'center', wheelOffsetX: Math.max(-45, Math.min(45, Number(value.wheelOffsetX) || 0)), wheelOffsetY: Math.max(-45, Math.min(45, Number(value.wheelOffsetY) || 0)), wheelLayout: { center: value.wheelLayout?.center || null, outer }, itemShortcuts: { ...(value.itemShortcuts || {}) } }
}
function displayShortcut(accelerator) { return accelerator ? accelerator.replace('Control', 'Ctrl').replace('CommandOrControl', 'Ctrl').replace('Super', 'Win').replaceAll('+', ' + ') : '点击设置快捷键'; }
function eventToAccelerator(event) { if (['Control', 'Shift', 'Alt', 'Meta'].includes(event.key)) return ''; const keyAliases = { ' ': 'Space', 'ArrowUp': 'Up', 'ArrowDown': 'Down', 'ArrowLeft': 'Left', 'ArrowRight': 'Right', 'Esc': 'Escape', 'OS': 'Super' }; let key = keyAliases[event.key] || event.key; if (key.length === 1) key = key.toUpperCase(); if (!key || key === 'Unidentified' || key === 'Dead' || key === 'Process') return ''; const parts = []; if (event.ctrlKey) parts.push('Control'); if (event.altKey) parts.push('Alt'); if (event.shiftKey) parts.push('Shift'); if (event.metaKey) parts.push('Super'); parts.push(key); return [...new Set(parts)].join('+'); }
function renderWheelAppearance() {
  wheelSize.value = String(shortcutSettings.wheelSize); wheelSizeValue.textContent = `${shortcutSettings.wheelSize} px`
  wheelOffsetX.value = String(shortcutSettings.wheelOffsetX); wheelOffsetXValue.textContent = `${shortcutSettings.wheelOffsetX}%`
  wheelOffsetY.value = String(shortcutSettings.wheelOffsetY); wheelOffsetYValue.textContent = `${shortcutSettings.wheelOffsetY}%`
  const anchors = [['top-left', '左上'], ['top', '上中'], ['top-right', '右上'], ['left', '左中'], ['center', '居中'], ['right', '右中'], ['bottom-left', '左下'], ['bottom', '下中'], ['bottom-right', '右下']]
  wheelAnchorGrid.replaceChildren(...anchors.map(([value, label]) => { const button = document.createElement('button'); button.type = 'button'; button.className = `wheel-anchor-button${shortcutSettings.wheelAnchor === value ? ' is-selected' : ''}`; button.title = label; button.setAttribute('aria-label', label); button.setAttribute('aria-pressed', String(shortcutSettings.wheelAnchor === value)); button.addEventListener('click', () => { shortcutSettings.wheelAnchor = value; renderWheelAppearance(); }); return button; }))
}
function openShortcutCapture(title, current, onSave) { captureShortcutTarget = onSave; shortcutCaptureTitle.textContent = title; shortcutCaptureDescription.textContent = '直接按下想要使用的组合键或单个按键；仅按 Ctrl、Alt、Shift、Win 不会保存。'; shortcutCaptureValue.textContent = current ? displayShortcut(current) : '等待输入…'; shortcutCaptureDialog.showModal(); shortcutCaptureDialog.focus(); }
function renderShortcutEditor() {
  if (!shortcutSettings) return
  shortcutEnabled.checked = shortcutSettings.enabled; wheelEnabled.checked = shortcutSettings.wheelEnabled; wheelShortcut.textContent = displayShortcut(shortcutSettings.wheelShortcut); renderWheelAppearance()
  const options = [{ id: '', name: '未设置' }, ...shortcutItems]
  const slotRows = [{ key: 'center', label: '圆心项目' }, ...Array.from({ length: 9 }, (_, index) => ({ key: index, label: `外围 ${index + 1}` }))]
  wheelSlotGrid.replaceChildren(...slotRows.map((slot) => { const label = document.createElement('label'); label.textContent = slot.label; const select = document.createElement('select'); select.append(...options.map((item) => Object.assign(document.createElement('option'), { value: item.id, textContent: item.name }))); select.value = slot.key === 'center' ? (shortcutSettings.wheelLayout.center || '') : (shortcutSettings.wheelLayout.outer[slot.key] || ''); select.addEventListener('change', () => { if (slot.key === 'center') shortcutSettings.wheelLayout.center = select.value || null; else shortcutSettings.wheelLayout.outer[slot.key] = select.value || null; }); label.append(select); return label; }))
  itemShortcutList.replaceChildren(...shortcutItems.map((item) => { const row = document.createElement('div'); row.className = 'item-shortcut-row'; const name = document.createElement('strong'); name.textContent = item.name; const button = document.createElement('button'); button.type = 'button'; button.className = 'shortcut-capture-button'; const key = shortcutItemKey(shortcutSettings.sourceId, item.id); button.textContent = displayShortcut(shortcutSettings.itemShortcuts[key]); button.addEventListener('click', () => openShortcutCapture(`设置「${item.name}」的快捷键`, shortcutSettings.itemShortcuts[key], (value) => { if (value) shortcutSettings.itemShortcuts[key] = value; else delete shortcutSettings.itemShortcuts[key]; renderShortcutEditor(); })); row.append(name, button); return row; }))
}
async function loadShortcutItems() { shortcutItems = await window.toolbox.listItems(shortcutSettings.sourceId); renderShortcutEditor(); }
async function openShortcutDialog() { setSettingsMenu(false); sourceSettings = await window.toolbox.listSources(); shortcutSettings = normalizeShortcutSettings(await window.toolbox.getShortcuts()); shortcutSource.replaceChildren(...sourceSettings.sources.map((source) => Object.assign(document.createElement('option'), { value: source.id, textContent: source.name }))); if (!sourceSettings.sources.some((source) => source.id === shortcutSettings.sourceId)) shortcutSettings.sourceId = currentSourceId; shortcutSource.value = shortcutSettings.sourceId; shortcutSettings.wheelLayout = await window.toolbox.getWheelLayout(shortcutSettings.sourceId); await loadShortcutItems(); shortcutDialog.showModal(); }

function isWebTarget(target) {
  try {
    const url = new URL(target.trim());
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function updateCardSource(card) {
  const source = card.querySelector('.card-topline > span');
  const isWeb = isWebTarget(card.dataset.target || '');
  source.className = isWeb ? 'source-web' : 'source-local';
  source.textContent = isWeb ? '网站' : '本地工具';
}
function getRegisteredCards() { return [...document.querySelectorAll('.tool-card:not(.add-card)')]; }

function normalizeSearchText(value) { return String(value || '').trim().toLocaleLowerCase(); }
function pinyinText(value, pattern) { return pinyin(String(value || ''), { ...(pattern ? { pattern } : {}), toneType: 'none' }).replace(/[^a-z0-9]/gi, ''); }
function targetSearchName(target) {
  if (isWebTarget(target)) {
    const url = new URL(target);
    return `${url.hostname} ${url.pathname.split('/').filter(Boolean).at(-1) || ''}`;
  }
  return String(target || '').replace(/\\/g, '/').split('/').at(-1) || '';
}
function buildSearchDocument(card) {
  const name = card.querySelector('h2')?.textContent || '';
  const description = card.querySelector('.card-copy p')?.textContent || '';
  const category = card.dataset.category || '';
  return { card, name, targetFile: targetSearchName(card.dataset.target), category, description, namePinyin: pinyinText(name), nameInitials: pinyinText(name, 'first') };
}
function rebuildSearchIndex() {
  searchEngine = new Fuse(getRegisteredCards().map(buildSearchDocument), {
    includeScore: true, shouldSort: true, threshold: 0.2, minMatchCharLength: 1, ignoreLocation: true,
    keys: [{ name: 'name', weight: 0.55 }, { name: 'targetFile', weight: 0.22 }, { name: 'namePinyin', weight: 0.14 }, { name: 'nameInitials', weight: 0.06 }, { name: 'category', weight: 0.02 }, { name: 'description', weight: 0.01 }],
  });
}

function updateCategoryCounts() {
  const registeredCards = getRegisteredCards();
  categoryButtons.forEach((button) => {
    const count = button.dataset.category === '全部' ? registeredCards.length
      : button.dataset.category === '收藏' ? registeredCards.filter((card) => card.dataset.favorite === 'true').length
      : registeredCards.filter((card) => card.dataset.category === button.dataset.category).length;
    button.querySelector('b').textContent = String(count);
  });
}

function setDrawer(open) {
  drawer.classList.toggle('is-open', open);
  drawerBackdrop.hidden = !open;
  openDrawerButton.classList.toggle('is-hidden', open);
  openDrawerButton.setAttribute('aria-expanded', String(open));
}

function setSettingsMenu(open) {
  settingsMenu.hidden = !open;
  settingsButton.setAttribute('aria-expanded', String(open));
}

const defaultBackgroundImage = '';
let backgroundSettings = { current: '', currentDataUrl: null, history: [] };

function applyBackground(imageUrl) {
  document.querySelector('.wallpaper').style.backgroundImage = imageUrl ? `url("${imageUrl}")` : defaultBackgroundImage;
}

function renderBackgroundHistory() {
  backgroundHistory.replaceChildren(...backgroundSettings.history.map(({ image: imagePath, dataUrl }, index) => {
    const button = document.createElement('button');
    button.className = `history-background${imagePath === backgroundSettings.current ? ' is-active' : ''}`;
    button.type = 'button';
    button.title = `使用历史背景 ${index + 1}`;
    const image = document.createElement('img');
    image.src = dataUrl; image.alt = `历史背景 ${index + 1}`;
    button.append(image);
    button.addEventListener('click', async () => { backgroundSettings = await window.toolbox.selectBackground(imagePath); applyBackground(backgroundSettings.currentDataUrl); renderBackgroundHistory(); showToast('已切换到历史背景。'); });
    return button;
  }));
}

async function openBackgroundDialog() {
  setSettingsMenu(false);
  backgroundSettings = await window.toolbox.getBackgroundSettings();
  renderBackgroundHistory();
  backgroundDialog.showModal();
}

function readDroppedImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('is-visible');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove('is-visible'), 2600);
}

function showImagePreview(container, imageUrl, alt) {
  const preview = document.createElement('img');
  preview.src = imageUrl;
  preview.alt = alt;
  preview.addEventListener('error', () => showToast('这个图标文件无法预览，请换一个 .ico 或常见图片文件。'), { once: true });
  container.replaceChildren(preview);
}

async function chooseItemImage() {
  if (!window.toolbox?.chooseItemImage) {
    showToast('请在 Electron 程序中选择项目图标。');
    return null;
  }
  try {
    return await window.toolbox.chooseItemImage();
  } catch {
    showToast('图标读取失败，请换一个文件。');
    return null;
  }
}

function commandLaunchesForCard(card) {
  try { return JSON.parse(card.dataset.commandLaunches || '[]'); } catch { return []; }
}
function setCardAdvancedLaunch(card, enabled, commandLaunches) {
  card.dataset.advancedLaunchEnabled = String(Boolean(enabled));
  card.dataset.commandLaunches = JSON.stringify(commandLaunches || []);
}
function updateAdvancedLaunchEditor() {
  const supportsAdvancedLaunch = !isWebTarget(itemTargetInput.value);
  advancedLaunchEditor.hidden = !supportsAdvancedLaunch;
  if (!supportsAdvancedLaunch) advancedLaunchEnabledInput.checked = false;
  commandLaunchEditor.hidden = !supportsAdvancedLaunch || !advancedLaunchEnabledInput.checked;
}
function renderCommandLaunches() {
  commandLaunchList.replaceChildren(...editingCommandLaunches.map((entry, index) => {
    const row = document.createElement('div');
    row.className = 'command-launch-row';
    const name = document.createElement('input');
    name.type = 'text'; name.maxLength = 64; name.placeholder = '显示名称，例如：调试模式'; name.value = entry.name || '';
    name.addEventListener('input', () => { entry.name = name.value; });
    const command = document.createElement('textarea');
    command.rows = 2; command.maxLength = 4096; command.placeholder = 'CMD 命令，例如：tools/MAA/MAA.exe --debug'; command.value = entry.command || '';
    command.addEventListener('input', () => { entry.command = command.value; });
    const remove = document.createElement('button');
    remove.type = 'button'; remove.className = 'delete-button'; remove.textContent = '删除';
    remove.addEventListener('click', () => { editingCommandLaunches.splice(index, 1); renderCommandLaunches(); });
    row.append(name, command, remove);
    return row;
  }));
}
function validateCommandLaunches() {
  const launches = editingCommandLaunches.map((entry) => ({ id: entry.id || '', name: String(entry.name || '').trim(), command: String(entry.command || '').trim() }));
  if (launches.some((entry) => !entry.name || !entry.command)) throw new Error('请完整填写每条自定义命令的名称和 CMD 命令，或删除空白项。');
  return launches;
}
async function launchTarget(card, elevated = false) {
  const target = card.dataset.target;
  if (!target) return showToast('此项目尚未设置启动路径或网址。');
  if (elevated && isWebTarget(target)) return showToast('网站不支持以管理员权限启动。');
  try {
    if (window.toolbox?.launch) {
      await window.toolbox.launch(target, { elevated });
      showToast(elevated ? `已请求管理员权限启动：${card.querySelector('h2').textContent}` : `正在打开：${card.querySelector('h2').textContent}`);
      return;
    }
    window.open(target, '_blank', 'noopener');
  } catch {
    showToast(elevated ? '管理员启动失败或已取消，请检查路径与系统权限。' : '启动失败，请检查路径或网址是否有效。');
  }
}

async function persistCard(card) {
  if (!card.dataset.id || !window.toolbox?.saveItem) return;
  await window.toolbox.saveItem({
    sourceId: currentSourceId,
    id: card.dataset.id,
    currentImage: card.dataset.image || '',
    name: card.querySelector('h2').textContent,
    target: card.dataset.target || '',
    category: card.dataset.category || '',
    description: card.querySelector('.card-copy p').textContent,
    favorite: card.dataset.favorite === 'true',
    advancedLaunchEnabled: card.dataset.advancedLaunchEnabled === 'true',
    commandLaunches: commandLaunchesForCard(card),
  });
}

function filterCards() {
  const query = normalizeSearchText(searchInput.value);
  const registeredCards = getRegisteredCards();
  const searchMatches = query ? (searchEngine || (rebuildSearchIndex(), searchEngine)).search(query).map(({ item }) => item.card) : registeredCards;
  const visibleCards = searchMatches.filter((card) => {
    const matchesCategory = currentCategory === '全部'
      || (currentCategory === '收藏' ? card.dataset.favorite === 'true' : card.dataset.category === currentCategory);
    return matchesCategory;
  });
  const visibleSet = new Set(visibleCards);
  registeredCards.forEach((card) => { card.hidden = !visibleSet.has(card); });
  (query ? visibleCards : registeredCards).forEach((card) => addCard.before(card));
  const hasNoVisibleCards = visibleCards.length === 0;
  emptyState.hidden = !hasNoVisibleCards;
  if (hasNoVisibleCards) addCard.before(emptyState);
}

function updateBatchSelection() {
  getRegisteredCards().forEach((card) => {
    const selected = selectedItemIds.has(card.dataset.id);
    card.classList.toggle('is-selected', selected);
    const button = card.querySelector('.batch-select-button');
    if (button) button.setAttribute('aria-pressed', String(selected));
  });
  batchSelectedCount.textContent = String(selectedItemIds.size);
}

function setBatchMode(enabled) {
  batchMode = enabled;
  if (!enabled) selectedItemIds.clear();
  document.body.classList.toggle('is-batch-mode', enabled);
  batchToolbar.hidden = !enabled;
  setSettingsMenu(false);
  updateBatchSelection();
}

function toggleBatchSelection(card) {
  if (!card.dataset.id) return;
  if (selectedItemIds.has(card.dataset.id)) selectedItemIds.delete(card.dataset.id);
  else selectedItemIds.add(card.dataset.id);
  updateBatchSelection();
}

function normalizeCategoryName(name) {
  const value = String(name || '').trim();
  if (!/^[\u3400-\u9fff]+$/u.test(value)) throw new Error('分类名称请使用中文，且不要包含空格或符号。');
  if (['全部', '收藏'].includes(value)) throw new Error('系统分类不能作为自定义分类。');
  return value;
}

async function ensureCategory(name) {
  const category = normalizeCategoryName(name);
  if (!getManagedCategoryNames().includes(category)) {
    addCategory(category);
    await window.toolbox.saveCategories(currentSourceId, getManagedCategoryNames());
  }
  return category;
}

function openBatchCategoryDialog(operation) {
  if (!selectedItemIds.size) return showToast('请先选择要移动的项目。');
  batchCategoryOperation = operation;
  const isCopy = operation === 'copy-to-category';
  batchMoveDialogTitle.textContent = isCopy ? '复制项目到分类' : '移动项目到分类';
  batchCategoryHint.textContent = isCopy ? '会在目标分类创建项目副本，原项目保持不变。' : '仅影响当前配置源中已选择的项目。';
  confirmBatchCategory.textContent = isCopy ? '确认复制' : '确认移动';
  batchCategorySelect.replaceChildren(Object.assign(document.createElement('option'), { value: '', textContent: '请选择分类' }), ...getManagedCategoryNames().map((name) => Object.assign(document.createElement('option'), { value: name, textContent: name })));
  batchNewCategoryInput.value = '';
  batchMoveDialog.showModal();
}

openDrawerButton.addEventListener('click', () => setDrawer(true));
closeDrawerButton.addEventListener('click', () => setDrawer(false));
drawerBackdrop.addEventListener('click', () => setDrawer(false));
settingsButton.addEventListener('click', (event) => {
  event.stopPropagation();
  setSettingsMenu(settingsMenu.hidden);
});
document.addEventListener('click', (event) => {
  if (!settingsMenu.contains(event.target) && event.target !== settingsButton && !settingsButton.contains(event.target)) setSettingsMenu(false);
});

function selectCategory(category) {
  currentCategory = category;
  categoryButtons.forEach((button) => button.classList.toggle('is-active', button.dataset.category === category));
  pageTitle.textContent = currentCategory;
  categoryDescription.textContent = currentCategory === '全部'
    ? '把常用网站、本地工具和资料入口放在同一处。'
    : `正在查看「${currentCategory}」中的工具入口。`;
  filterCards();
  setDrawer(false);
}

function attachCategoryButton(button) {
  button.addEventListener('click', () => selectCategory(button.dataset.category));
}

categoryButtons.forEach(attachCategoryButton);

function getManagedCategoryNames() {
  return categoryButtons.filter((button) => !['全部', '收藏'].includes(button.dataset.category)).map((button) => button.dataset.category);
}

function refreshCategoryOptions() {
  categoryOptions.replaceChildren(...getManagedCategoryNames().map((name) => {
    const option = document.createElement('option');
    option.value = name;
    return option;
  }));
}

function renderManagedCategories() {
  managedCategoryItems.replaceChildren(...getManagedCategoryNames().map((name) => {
    const row = document.createElement('div');
    row.className = 'managed-category-row';
    const title = document.createElement('strong'); title.textContent = name;
    const count = document.createElement('span');
    count.textContent = `${getRegisteredCards().filter((card) => card.dataset.category === name).length} 个项目`;
    const remove = document.createElement('button');
    remove.className = 'delete-button'; remove.type = 'button'; remove.textContent = '删除'; remove.setAttribute('aria-label', `删除分类${name}`);
    remove.addEventListener('click', () => deleteCategory(name));
    row.append(title, count, remove);
    return row;
  }));
}

function addCategory(name) {
  const button = document.createElement('button');
  button.className = 'category-item'; button.type = 'button'; button.dataset.category = name;
  const mark = document.createElement('span'); mark.className = 'category-mark'; mark.textContent = '◇';
  const label = document.createElement('span'); label.textContent = name;
  const count = document.createElement('b'); count.textContent = '0';
  button.append(mark, label, count);
  categoryList.append(button);
  categoryButtons = [...categoryButtons, button];
  attachCategoryButton(button);
  refreshCategoryOptions(); updateCategoryCounts(); renderManagedCategories();
}

async function deleteCategory(name) {
  const affectedCards = getRegisteredCards().filter((card) => card.dataset.category === name);
  affectedCards.forEach((card) => {
    card.dataset.category = '';
    card.dataset.search = `${card.querySelector('h2').textContent} ${card.querySelector('.card-copy p').textContent}`;
  });
  const button = categoryButtons.find((item) => item.dataset.category === name);
  button?.remove();
  categoryButtons = categoryButtons.filter((item) => item !== button);
  if (currentCategory === name) selectCategory('全部');
  rebuildSearchIndex(); refreshCategoryOptions(); updateCategoryCounts(); renderManagedCategories(); filterCards();
  await Promise.all(affectedCards.map((card) => persistCard(card)));
  await window.toolbox?.saveCategories?.(currentSourceId, getManagedCategoryNames());
  showToast(`已删除分类「${name}」，相关项目已变为未分类。`);
}

searchInput.addEventListener('input', filterCards);
document.addEventListener('keydown', (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    searchInput.focus();
  }
  if (event.key === 'Escape') setDrawer(false);
});

document.querySelectorAll('.star-button').forEach((button) => {
  button.addEventListener('click', async () => {
    const favorite = button.classList.toggle('is-favorite');
    button.textContent = favorite ? '★' : '☆';
    button.closest('.tool-card').dataset.favorite = String(favorite);
    await persistCard(button.closest('.tool-card'));
    updateCategoryCounts();
    filterCards();
    showToast(favorite ? '已加入收藏' : '已取消收藏');
  });
});

function openEditor(card) {
  activeCard = card;
  pendingImage = null;
  const title = card.querySelector('h2').textContent;
  itemNameInput.value = title;
  itemTargetInput.value = card.dataset.target || '';
  itemCategoryInput.value = card.dataset.category || '';
  itemDescriptionInput.value = card.querySelector('.card-copy p').textContent;
  editingCommandLaunches = commandLaunchesForCard(card).map((entry) => ({ ...entry }));
  advancedLaunchEnabledInput.checked = card.dataset.advancedLaunchEnabled === 'true';
  updateAdvancedLaunchEditor();
  renderCommandLaunches();
  const illustration = card.querySelector('.card-illustration');
  editorAvatar.replaceChildren(...illustration.cloneNode(true).childNodes);
  editorAvatar.className = illustration.className.replace('card-illustration', 'editor-avatar');
  deleteDescription.textContent = `“${title}”将从当前工具箱中移除；原程序或网站不会被删除。`;
  editDialog.showModal();
  itemNameInput.focus();
}

document.querySelectorAll('.edit-button').forEach((button) => {
  button.addEventListener('click', () => openEditor(button.closest('.tool-card')));
});

document.querySelector('#close-editor').addEventListener('click', () => editDialog.close());
document.querySelector('#cancel-edit').addEventListener('click', () => editDialog.close());
itemTargetInput.addEventListener('input', updateAdvancedLaunchEditor);
advancedLaunchEnabledInput.addEventListener('change', updateAdvancedLaunchEditor);
document.querySelector('#add-command-launch').addEventListener('click', () => {
  if (editingCommandLaunches.length >= 20) {
    showToast('最多可配置 20 条自定义命令。')
    return
  }
  editingCommandLaunches.push({ id: '', name: '', command: '' })
  renderCommandLaunches()
});
document.querySelector('#change-image').addEventListener('click', async () => {
  const selection = await chooseItemImage();
  if (!selection) return;
  pendingImage = selection;
  showImagePreview(editorAvatar, selection.previewUrl, '所选图标预览');
  showToast('已选择图标，保存修改后将复制到工具箱。');
});

editForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!activeCard || !editForm.reportValidity()) return;
  if (!window.toolbox?.saveItem) return showToast('请在 Electron 程序中保存项目。');
  const name = itemNameInput.value.trim();
  const description = itemDescriptionInput.value.trim();
  const target = itemTargetInput.value.trim();
  const advancedLaunchEnabled = !isWebTarget(target) && advancedLaunchEnabledInput.checked;
  let commandLaunches = editingCommandLaunches.map((entry) => ({ id: entry.id || '', name: String(entry.name || '').trim(), command: String(entry.command || '').trim() })).filter((entry) => entry.name && entry.command)
  try { if (advancedLaunchEnabled) commandLaunches = validateCommandLaunches(); } catch (error) { showToast(error.message); return; }
  let savedItem;
  try {
    savedItem = await window.toolbox.saveItem({
      sourceId: currentSourceId,
      id: activeCard.dataset.id || undefined,
      currentImage: activeCard.dataset.image || '',
      imageSourcePath: pendingImage?.sourcePath || '',
      name,
      target,
      advancedLaunchEnabled,
      commandLaunches,
      category: itemCategoryInput.value.trim(),
      description,
      favorite: activeCard.dataset.favorite === 'true',
    });
  } catch (error) {
    showToast(`保存失败：${error.message || '请稍后重试。'}`);
    return;
  }
  activeCard.querySelector('h2').textContent = name;
  activeCard.querySelector('.card-copy p').textContent = description;
  activeCard.dataset.target = target;
  setCardAdvancedLaunch(activeCard, savedItem.advancedLaunchEnabled, savedItem.commandLaunches);
  activeCard.dataset.category = itemCategoryInput.value.trim();
  activeCard.dataset.search = `${name} ${description} ${itemCategoryInput.value}`;
  activeCard.dataset.id = savedItem.id;
  activeCard.dataset.image = savedItem.image || '';
  if (pendingImage) {
    const illustration = activeCard.querySelector('.card-illustration');
    showImagePreview(illustration, savedItem.imageDataUrl, `${name}图标`);
    pendingImage = null;
  }
  activeCard.querySelector('.edit-button').setAttribute('aria-label', `编辑${name}`);
  activeCard.querySelector('.star-button').setAttribute('aria-label', `收藏${name}`);
  updateCardSource(activeCard);
  refreshCardLaunchActions(activeCard);
  editDialog.close();
  rebuildSearchIndex();
  updateCategoryCounts();
  filterCards();
  showToast(savedItem.oldImageRemoved ? '项目已保存，未使用的旧图片已自动清理。' : '项目修改已保存。');
});

document.querySelector('#delete-item').addEventListener('click', () => {
  if (!activeCard) return;
  editDialog.close();
  confirmDialog.showModal();
});
document.querySelector('#cancel-delete').addEventListener('click', () => confirmDialog.close());
document.querySelector('#confirm-delete').addEventListener('click', async () => {
  if (!activeCard) return;
  let deleted = { imageRemoved: false };
  if (activeCard.dataset.id && window.toolbox?.deleteItem) {
    try {
      deleted = await window.toolbox.deleteItem(currentSourceId, activeCard.dataset.id);
    } catch (error) {
      showToast(`删除失败：${error.message || '请稍后重试。'}`);
      return;
    }
  }
  activeCard.remove();
  activeCard = null;
  confirmDialog.close();
  rebuildSearchIndex();
  updateCategoryCounts();
  filterCards();
  showToast(deleted.imageRemoved ? '项目已删除，未使用的自定义图片已自动清理。' : '项目已删除。');
});

function closeAdvancedLaunchMenu() {
  document.querySelector('#advanced-launch-menu')?.remove();
}
async function launchCustomCommand(card, launch) {
  try {
    await window.toolbox.launch(card.dataset.target, { command: launch.command });
    showToast(`正在执行：${launch.name}`);
  } catch (error) {
    showToast(`自定义命令启动失败：${error.message || '请检查命令。'}`);
  }
}
function openAdvancedLaunchMenu(trigger, card) {
  closeAdvancedLaunchMenu();
  const menu = document.createElement('div');
  menu.id = 'advanced-launch-menu';
  menu.className = 'advanced-launch-menu';
  const box = trigger.getBoundingClientRect();
  menu.style.left = `${Math.max(12, box.right - 210)}px`;
  menu.style.bottom = `${window.innerHeight - box.top + 7}px`;
  const admin = document.createElement('button');
  admin.type = 'button'; admin.textContent = '以管理员权限启动';
  admin.addEventListener('click', () => { closeAdvancedLaunchMenu(); launchTarget(card, true); });
  menu.append(admin);
  commandLaunchesForCard(card).forEach((launch) => {
    const button = document.createElement('button');
    button.type = 'button'; button.textContent = launch.name;
    button.addEventListener('click', () => { closeAdvancedLaunchMenu(); launchCustomCommand(card, launch); });
    menu.append(button);
  });
  document.body.append(menu);
}
function refreshCardLaunchActions(card) {
  const actions = card.querySelector('.card-actions');
  if (actions) actions.replaceWith(createLaunchActions(card, card.querySelector('h2').textContent));
}
function createLaunchActions(card, name) {
  const isWeb = isWebTarget(card.dataset.target);
  const advanced = !isWeb && card.dataset.advancedLaunchEnabled === 'true';
  const actions = document.createElement('div');
  actions.className = `card-actions${advanced ? ' advanced-actions' : ' web-actions'}`;
  const normal = document.createElement('button');
  normal.className = 'launch-button normal-launch-button'; normal.type = 'button'; normal.setAttribute('aria-label', `启动${name}`);
  const normalText = document.createElement('span'); normalText.textContent = '启动';
  const normalArrow = document.createElement('span'); normalArrow.setAttribute('aria-hidden', 'true'); normalArrow.textContent = '↗';
  normal.replaceChildren(normalText, normalArrow);
  normal.addEventListener('click', () => launchTarget(card));
  actions.append(normal);
  if (advanced) {
    const advancedButton = document.createElement('button');
    advancedButton.className = 'advanced-launch-button'; advancedButton.type = 'button'; advancedButton.textContent = '高级启动 ▾';
    advancedButton.setAttribute('aria-label', `高级启动${name}`);
    advancedButton.addEventListener('click', (event) => { event.stopPropagation(); openAdvancedLaunchMenu(advancedButton, card); });
    actions.append(advancedButton);
  }
  return actions;
}

document.addEventListener('pointerdown', (event) => {
  const menu = document.querySelector('#advanced-launch-menu');
  if (menu && !menu.contains(event.target) && !event.target.closest('.advanced-launch-button')) closeAdvancedLaunchMenu();
});
function openCreateDialog() {
  createForm.reset();
  pendingCreateImage = null;
  createAvatar.className = 'editor-avatar amber';
  createAvatar.replaceChildren(Object.assign(document.createElement('span'), { className: 'icon-fallback', textContent: '＋' }));
  createDialog.showModal();
  createNameInput.focus();
}

function clearDragMarkers() {
  getRegisteredCards().forEach((card) => card.classList.remove('drag-before', 'drag-after', 'drag-target'));
}
async function persistCardOrder() {
  const ids = getRegisteredCards().map((card) => card.dataset.id).filter(Boolean);
  if (!ids.length || !window.toolbox?.saveItemOrder) return;
  await window.toolbox.saveItemOrder(currentSourceId, ids);
}
function enableCardReordering(card) {
  card.draggable = true;
  card.addEventListener('dragstart', (event) => {
    const interactive = event.target.closest('button, input, textarea, select, a, label, .card-copy p');
    if (batchMode || interactive) { event.preventDefault(); return; }
    draggedCard = card;
    card.classList.add('is-dragging');
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', card.dataset.id || '');
  });
  card.addEventListener('dragenter', (event) => {
    if (draggedCard && draggedCard !== card && !card.hidden) event.preventDefault();
  });
  card.addEventListener('dragover', (event) => {
    if (!draggedCard || draggedCard === card || card.hidden) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    clearDragMarkers();
    card.classList.add('drag-target');
  });
  card.addEventListener('drop', async (event) => {
    if (!draggedCard || draggedCard === card || card.hidden) return;
    event.preventDefault();
    const source = draggedCard;
    const placeholder = document.createComment('drag-swap-placeholder');
    source.before(placeholder);
    card.before(source);
    placeholder.replaceWith(card);
    cards = [...addCard.parentElement.querySelectorAll('.tool-card:not(.add-card)')];
    clearDragMarkers();
    try {
      await persistCardOrder();
      showToast('项目顺序已保存。');
    } catch (error) {
      await loadCurrentSource();
      showToast(`排序保存失败：${error.message || '请稍后重试。'}`);
    }
  });
  card.addEventListener('dragend', () => {
    card.classList.remove('is-dragging');
    clearDragMarkers();
    draggedCard = null;
  });
}
function createCard({ id = '', name, target, category, description, imageUrl, imagePath = '', favorite = false, advancedLaunchEnabled = false, commandLaunches = [] }) {
  const isWeb = isWebTarget(target);
  const card = document.createElement('article');
  card.className = 'tool-card';
  card.dataset.category = category;
  card.dataset.target = target;
  card.dataset.favorite = String(favorite);
  setCardAdvancedLaunch(card, advancedLaunchEnabled, commandLaunches);
  if (id) card.dataset.id = id;
  if (imagePath) card.dataset.image = imagePath;

  const topline = document.createElement('div');
  topline.className = 'card-topline';
  const source = document.createElement('span');
  source.className = isWeb ? 'source-web' : 'source-local';
  source.textContent = isWeb ? '网站' : '本地工具';
  const controls = document.createElement('div');
  controls.className = 'card-controls';
  const select = document.createElement('button');
  select.className = 'batch-select-button'; select.type = 'button'; select.textContent = '✓'; select.setAttribute('aria-label', `选择${name}`); select.setAttribute('aria-pressed', 'false');
  const edit = document.createElement('button');
  edit.className = 'edit-button'; edit.type = 'button'; edit.textContent = '编辑'; edit.setAttribute('aria-label', `编辑${name}`);
  const star = document.createElement('button');
  star.className = `star-button${favorite ? ' is-favorite' : ''}`; star.type = 'button'; star.textContent = favorite ? '★' : '☆'; star.setAttribute('aria-label', `收藏${name}`);
  controls.append(select, edit, star); topline.append(source, controls);

  const illustration = document.createElement('div');
  illustration.className = 'card-illustration amber';
  if (imageUrl) {
    const image = document.createElement('img');
    image.src = imageUrl; image.alt = `${name}图标`;
    illustration.append(image);
  } else {
    const fallback = document.createElement('span');
    fallback.className = 'icon-fallback'; fallback.setAttribute('aria-hidden', 'true'); fallback.textContent = name.trim().slice(0, 1) || '新';
    illustration.append(fallback);
  }

  const copy = document.createElement('div');
  copy.className = 'card-copy';
  const title = document.createElement('h2'); title.textContent = name;
  const summary = document.createElement('p'); summary.textContent = description || '暂未填写简介。';
  copy.append(title, summary);
  const actions = createLaunchActions(card, name);
  card.append(topline, illustration, copy, actions);

  enableCardReordering(card);
  select.addEventListener('click', () => toggleBatchSelection(card));
  edit.addEventListener('click', () => openEditor(card));
  star.addEventListener('click', async () => {
    const favorite = star.classList.toggle('is-favorite');
    star.textContent = favorite ? '★' : '☆';
    card.dataset.favorite = String(favorite);
    await persistCard(card);
    updateCategoryCounts();
    filterCards();
    showToast(favorite ? '已加入收藏' : '已取消收藏');
  });
  return card;
}

function applyStoredItemToCard(card, item) {
  card.dataset.id = item.id;
  card.dataset.target = item.target;
  card.dataset.category = item.category;
  card.dataset.favorite = String(item.favorite);
  card.dataset.image = item.image || '';
  setCardAdvancedLaunch(card, item.advancedLaunchEnabled, item.commandLaunches);
  card.querySelector('h2').textContent = item.name;
  card.querySelector('.card-copy p').textContent = item.description || '暂未填写简介。';
  const star = card.querySelector('.star-button');
  star.classList.toggle('is-favorite', item.favorite);
  star.textContent = item.favorite ? '★' : '☆';
  star.setAttribute('aria-label', `收藏${item.name}`);
  card.querySelector('.edit-button').setAttribute('aria-label', `编辑${item.name}`);
  if (item.imageDataUrl) showImagePreview(card.querySelector('.card-illustration'), item.imageDataUrl, `${item.name}图标`);
  updateCardSource(card);
  refreshCardLaunchActions(card);
}

async function loadCurrentSource() {
  if (!window.toolbox?.listItems || !sourceSettings) return;
  try {
    currentCategory = '全部';
    categoryButtons.filter((button) => !['全部', '收藏'].includes(button.dataset.category)).forEach((button) => button.remove());
    categoryButtons = categoryButtons.filter((button) => ['全部', '收藏'].includes(button.dataset.category));
    const storedCategories = await window.toolbox.listCategories(currentSourceId);
    storedCategories.forEach(addCategory);
    getRegisteredCards().forEach((card) => card.remove());
    cards = [];
    const storedItems = await window.toolbox.listItems(currentSourceId);
    storedItems.forEach((item) => {
      const card = createCard({
        id: item.id,
        name: item.name,
        target: item.target,
        category: item.category,
        description: item.description,
        favorite: item.favorite,
        imagePath: item.image,
        imageUrl: item.imageDataUrl,
        advancedLaunchEnabled: item.advancedLaunchEnabled,
        commandLaunches: item.commandLaunches,
      });
      addCard.before(card);
      cards = [...cards, card];
    });
    const activeSource = sourceSettings.sources.find((source) => source.id === currentSourceId);
    categoryDescription.textContent = `当前配置源：${activeSource?.name || '默认配置源'}。`;
    rebuildSearchIndex();
    updateCategoryCounts();
    filterCards();
  } catch {
    showToast('当前配置源读取失败。');
  }
}

async function initializeSources() {
  if (!window.toolbox?.listSources) return;
  sourceSettings = await window.toolbox.listSources();
  currentSourceId = sourceSettings.activeSourceId;
  await loadCurrentSource();
}

document.querySelector('#close-create').addEventListener('click', () => createDialog.close());
document.querySelector('#cancel-create').addEventListener('click', () => createDialog.close());
document.querySelector('#choose-create-image').addEventListener('click', async () => {
  const selection = await chooseItemImage();
  if (!selection) return;
  pendingCreateImage = selection;
  showImagePreview(createAvatar, selection.previewUrl, '所选图标预览');
  showToast('已选择图标，加入清单后将复制到工具箱。');
});
createForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!createForm.reportValidity()) return;
  if (!window.toolbox?.saveItem) return showToast('请在 Electron 程序中保存项目。');
  let savedItem;
  try {
    savedItem = await window.toolbox.saveItem({
      sourceId: currentSourceId,
      name: createNameInput.value.trim(),
      target: createTargetInput.value.trim(),
      category: createCategoryInput.value.trim(),
      description: createDescriptionInput.value.trim(),
      favorite: false,
      imageSourcePath: pendingCreateImage?.sourcePath || '',
    });
  } catch (error) {
    showToast(`保存失败：${error.message || '请稍后重试。'}`);
    return;
  }
  const card = createCard({
    id: savedItem.id,
    name: savedItem.name,
    target: savedItem.target,
    category: savedItem.category,
    description: savedItem.description,
    favorite: savedItem.favorite,
    imagePath: savedItem.image,
    imageUrl: savedItem.imageDataUrl,
  });
  addCard.before(card);
  cards = [...cards, card];
  createDialog.close();
  rebuildSearchIndex();
  updateCategoryCounts();
  filterCards();
  showToast('项目已加入清单。');
});

document.querySelector('#add-item').addEventListener('click', openCreateDialog);
document.querySelector('#add-item-card').addEventListener('click', openCreateDialog);
document.querySelector('#custom-background').addEventListener('click', () => openBackgroundDialog().catch(() => showToast('背景设置读取失败。')));
document.querySelector('#manage-update').addEventListener('click', () => openUpdateDialog().catch((error) => showToast(`更新设置读取失败：${error.message || '请重试。'}`)));
document.querySelector('#close-update').addEventListener('click', () => updateDialog.close());
document.querySelector('#save-update-settings').addEventListener('click', async () => {
  try {
    await window.toolbox.saveUpdateSettings({ checkOnLaunch: updateCheckOnLaunch.checked, autoDownload: updateAutoDownload.checked, autoInstallOnQuit: updateAutoInstall.checked });
    showToast('更新偏好已保存。');
  } catch (error) { showToast(`保存失败：${error.message || '请重试。'}`); }
});
document.querySelector('#check-update').addEventListener('click', async () => {
  try { renderUpdateState({ ...(await window.toolbox.getUpdateState()), phase: 'checking', message: '正在检查 GitHub Release 更新…' }); await window.toolbox.checkForUpdates(); } catch (error) { showToast(`检查更新失败：${error.message || '请稍后重试。'}`); }
});
downloadUpdateButton.addEventListener('click', async () => { try { await window.toolbox.downloadUpdate(); } catch (error) { showToast(`下载更新失败：${error.message || '请稍后重试。'}`); } });
installUpdateButton.addEventListener('click', async () => { try { await window.toolbox.installUpdate(); } catch (error) { showToast(`安装更新失败：${error.message || '请重试。'}`); } });
window.toolbox?.onUpdateStatus?.((state) => { renderUpdateState(state); if (state.phase === 'error' && updateDialog.open) showToast(`更新失败：${state.error || '请稍后重试。'}`); });
document.querySelector('#close-background-dialog').addEventListener('click', () => backgroundDialog.close());
document.querySelector('#done-background').addEventListener('click', () => backgroundDialog.close());
document.querySelector('#reset-background').addEventListener('click', async () => {
  backgroundSettings = await window.toolbox.resetBackground();
  applyBackground('');
  renderBackgroundHistory();
  showToast('已恢复工具箱默认背景。');
});
backgroundDropzone.addEventListener('click', async () => {
  if (!window.toolbox?.chooseBackground) return showToast('请在 Electron 程序中使用自定义背景图片。');
  const selection = await window.toolbox.chooseBackground();
  if (!selection) return;
  backgroundSettings = await window.toolbox.saveBackground({ sourcePath: selection.sourcePath });
  applyBackground(backgroundSettings.currentDataUrl);
  renderBackgroundHistory();
  showToast('背景图片已更新。');
});
['dragenter', 'dragover'].forEach((eventName) => backgroundDropzone.addEventListener(eventName, (event) => { event.preventDefault(); backgroundDropzone.classList.add('is-dragging'); }));
['dragleave', 'drop'].forEach((eventName) => backgroundDropzone.addEventListener(eventName, (event) => { event.preventDefault(); backgroundDropzone.classList.remove('is-dragging'); }));
backgroundDropzone.addEventListener('drop', async (event) => {
  const [file] = event.dataTransfer.files;
  if (!file || !file.type.startsWith('image/')) return showToast('请拖入有效的图片文件。');
  try {
    backgroundSettings = await window.toolbox.saveBackground({ dataUrl: await readDroppedImage(file) });
    applyBackground(backgroundSettings.currentDataUrl);
    renderBackgroundHistory();
    showToast('背景图片已更新。');
  } catch {
    showToast('图片读取失败，请换一张图片。');
  }
});
async function updateExportSummary() {
  const sourceId = exportSourceSelect.value;
  const [items, categories] = await Promise.all([window.toolbox.listItems(sourceId), window.toolbox.listCategories(sourceId)]);
  exportItemCount.textContent = String(items.length);
  exportCategoryCount.textContent = String(categories.length);
}
async function openExportDialog() {
  if (!sourceSettings) sourceSettings = await window.toolbox.listSources();
  exportSourceSelect.replaceChildren(...sourceSettings.sources.map((source) => Object.assign(document.createElement('option'), { value: source.id, textContent: source.name })));
  exportSourceSelect.value = currentSourceId;
  await updateExportSummary();
  exportDialog.showModal();
}
function openImportDialog() {
  importForm.reset();
  pendingImportConfig = null;
  importFileName.textContent = '尚未选择文件';
  importDialog.showModal();
}
document.querySelector('#export-config').addEventListener('click', () => openExportDialog().catch(() => showToast('导出配置源读取失败。')));
exportSourceSelect.addEventListener('change', () => updateExportSummary().catch(() => showToast('配置源统计读取失败。')));
document.querySelector('#import-config').addEventListener('click', openImportDialog);
document.querySelector('#close-export').addEventListener('click', () => exportDialog.close());
document.querySelector('#cancel-export').addEventListener('click', () => exportDialog.close());
exportForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    const result = await window.toolbox.exportSource(exportSourceSelect.value);
    if (!result) return;
    exportDialog.close();
    showToast(`已导出 ${result.itemCount} 个项目。`);
  } catch (error) {
    showToast(`导出失败：${error.message || '请稍后重试。'}`);
  }
});
document.querySelector('#close-import').addEventListener('click', () => importDialog.close());
document.querySelector('#cancel-import').addEventListener('click', () => importDialog.close());
document.querySelector('#choose-import-file').addEventListener('click', async () => {
  if (!window.toolbox?.chooseConfigImport) return showToast('请在 Electron 程序中选择配置包。');
  pendingImportConfig = await window.toolbox.chooseConfigImport();
  importFileName.textContent = pendingImportConfig ? pendingImportConfig.fileName : '尚未选择文件';
});
importForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!pendingImportConfig) {
    showToast('请先选择一个 .attconfig 配置包。');
    return;
  }
  const mode = new FormData(importForm).get('import-mode');
  try {
    const source = await window.toolbox.importConfig({ sourcePath: pendingImportConfig.sourcePath, mode, targetSourceId: currentSourceId });
    sourceSettings = await window.toolbox.listSources();
    currentSourceId = source.id;
    await loadCurrentSource();
    importDialog.close();
    showToast(`已导入为配置源「${source.name}」。`);
  } catch (error) {
    showToast(`导入失败：${error.message || '请稍后重试。'}`);
  }
});
function openCategoryDialog() {
  newCategoryNameInput.value = '';
  renderManagedCategories();
  categoryDialog.showModal();
  newCategoryNameInput.focus();
}
document.querySelector('#manage-categories').addEventListener('click', openCategoryDialog);
document.querySelector('#add-category').addEventListener('click', openCategoryDialog);
document.querySelector('#close-category-dialog').addEventListener('click', () => categoryDialog.close());
document.querySelector('#done-managing-categories').addEventListener('click', () => categoryDialog.close());
categoryForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    const name = normalizeCategoryName(newCategoryNameInput.value);
    if (getManagedCategoryNames().includes(name)) throw new Error(`分类「${name}」已经存在。`);
    await ensureCategory(name);
    newCategoryNameInput.value = '';
    showToast(`已新建分类「${name}」。`);
  } catch (error) { showToast(error.message); newCategoryNameInput.focus(); }
});

document.querySelector('#manage-batch').addEventListener('click', () => setBatchMode(true));
document.querySelector('#exit-batch-mode').addEventListener('click', () => setBatchMode(false));
document.querySelector('#clear-batch-selection').addEventListener('click', () => { selectedItemIds.clear(); updateBatchSelection(); });
document.querySelector('#select-visible-items').addEventListener('click', () => { getRegisteredCards().filter((card) => !card.hidden && card.dataset.id).forEach((card) => selectedItemIds.add(card.dataset.id)); updateBatchSelection(); });
document.querySelector('#move-selected-items').addEventListener('click', () => openBatchCategoryDialog('set-category'));
document.querySelector('#copy-selected-items').addEventListener('click', () => openBatchCategoryDialog('copy-to-category'));
document.querySelector('#close-batch-move').addEventListener('click', () => batchMoveDialog.close());
document.querySelector('#cancel-batch-move').addEventListener('click', () => batchMoveDialog.close());
batchMoveForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    const category = batchNewCategoryInput.value.trim() ? await ensureCategory(batchNewCategoryInput.value) : batchCategorySelect.value;
    if (!category) throw new Error('请选择或输入一个分类。');
    const result = await window.toolbox.bulkUpdateItems({ sourceId: currentSourceId, ids: [...selectedItemIds], operation: batchCategoryOperation, category });
    const isCopy = batchCategoryOperation === 'copy-to-category';
    batchMoveDialog.close(); await loadCurrentSource(); setBatchMode(false); showToast(isCopy ? `已复制 ${result.copied} 个项目到「${category}」。` : `已将 ${result.updated} 个项目移至「${category}」。`);
  } catch (error) { showToast(`移动失败：${error.message || '请稍后重试。'}`); }
});
document.querySelector('#delete-selected-items').addEventListener('click', () => {
  if (!selectedItemIds.size) return showToast('请先选择要删除的项目。');
  batchDeleteDescription.textContent = `将从当前配置源删除 ${selectedItemIds.size} 个项目；原程序、文件和网站不会被删除。`;
  batchDeleteDialog.showModal();
});
document.querySelector('#cancel-batch-delete').addEventListener('click', () => batchDeleteDialog.close());
document.querySelector('#confirm-batch-delete').addEventListener('click', async () => {
  try {
    const result = await window.toolbox.bulkUpdateItems({ sourceId: currentSourceId, ids: [...selectedItemIds], operation: 'delete' });
    batchDeleteDialog.close(); await loadCurrentSource(); setBatchMode(false); showToast(result.imageRemoved ? `已删除 ${result.deleted} 个项目，并清理 ${result.imageRemoved} 个未使用图标。` : `已删除 ${result.deleted} 个项目。`);
  } catch (error) { showToast(`删除失败：${error.message || '请稍后重试。'}`); }
});

function resolveMarkdownImageSource(source) {
  const normalized = String(source || '').replace(/\\/g, '/');
  const match = normalized.match(/^(?:\.\.\/)+(static\/images\/(?:custom|builtin)(?:\/[^/?#]+)+\.(?:png|jpe?g|webp|gif|bmp|ico))(?:[?#].*)?$/i);
  return match ? `toolbox-asset://${encodeURI(match[1])}` : source;
}
function renderMarkdownDocument(content, toc, markdown, prefix) {
  content.innerHTML = DOMPurify.sanitize(marked.parse(markdown, { gfm: true, breaks: true }));
  content.querySelectorAll('img[src]').forEach((image) => image.setAttribute('src', resolveMarkdownImageSource(image.getAttribute('src'))));
  const headings = [...content.querySelectorAll('h2, h3')];
  toc.replaceChildren(...headings.map((heading, index) => {
    heading.id = `${prefix}-section-${index}`;
    const button = document.createElement('button'); button.type = 'button'; button.textContent = heading.textContent; button.className = heading.tagName === 'H3' ? 'guide-toc-subitem' : '';
    button.addEventListener('click', () => heading.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    return button;
  }));
  content.querySelectorAll('a[href]').forEach((link) => { link.target = '_blank'; link.rel = 'noopener noreferrer'; });
}
function renderGuide() { renderMarkdownDocument(guideContent, guideToc, guideMarkdown, 'guide'); }
let currentAnnouncement = null;
function announcementHasReachedEnd() {
  return announcementContent.scrollHeight <= announcementContent.clientHeight + 2 || announcementContent.scrollTop + announcementContent.clientHeight >= announcementContent.scrollHeight - 2;
}
function updateAnnouncementDismissControl() {
  const canDismiss = announcementHasReachedEnd();
  announcementDismiss.disabled = !canDismiss || Boolean(currentAnnouncement?.dismissed);
  announcementDismiss.checked = Boolean(currentAnnouncement?.dismissed);
  announcementScrollHint.hidden = canDismiss || Boolean(currentAnnouncement?.dismissed);
}
async function openAnnouncementDialog({ automatic = false } = {}) {
  try {
    const announcement = await window.toolbox.getAnnouncement();
    currentAnnouncement = announcement;
    renderMarkdownDocument(announcementContent, announcementToc, announcement.markdown, 'announcement');
    const source = announcement.source === 'remote' ? '已同步 GitHub 公告。' : announcement.source === 'cache' ? '网络不可用，正在显示最近缓存的公告。' : '正在显示程序内置公告。';
    announcementStatus.textContent = announcement.error ? `${source} ${announcement.error}` : source;
    announcementDot.hidden = !announcement.shouldShow;
    requestAnimationFrame(updateAnnouncementDismissControl);
  } catch (error) {
    announcementStatus.textContent = `公告读取失败：${error.message || '请稍后重试。'}`;
    return;
  }
  if (!automatic || currentAnnouncement.shouldShow) announcementDialog.showModal();
}
function renderUpdateState(state) {
  updateCurrentVersion.textContent = state.currentVersion || '—';
  updateStatus.textContent = state.error ? `${state.message} ${state.error}` : (state.message || '尚未检查更新。');
  updateNotes.innerHTML = DOMPurify.sanitize(marked.parse(state.releaseNotes || '', { gfm: true, breaks: true }));
  updateSourceHint.textContent = state.supported ? '官方更新资源仅来自 GitHub Releases。' : `${state.message || '当前环境不支持自动更新。'} 可手动前往 GitHub Releases 下载完整安装包。`;
  downloadUpdateButton.hidden = state.phase !== 'available';
  installUpdateButton.hidden = state.phase !== 'downloaded';
}
async function openUpdateDialog() {
  setSettingsMenu(false);
  const [state, settings] = await Promise.all([window.toolbox.getUpdateState(), window.toolbox.getUpdateSettings()]);
  updateCheckOnLaunch.checked = settings.checkOnLaunch;
  updateAutoDownload.checked = settings.autoDownload;
  updateAutoInstall.checked = settings.autoInstallOnQuit;
  renderUpdateState(state);
  updateDialog.showModal();
}
renderGuide();
document.querySelector('#open-guide').addEventListener('click', () => guideDialog.showModal());
document.querySelector('#close-guide').addEventListener('click', () => guideDialog.close());
document.querySelector('#done-guide').addEventListener('click', () => guideDialog.close());
document.querySelector('#open-announcement').addEventListener('click', () => openAnnouncementDialog());
document.querySelector('#close-announcement').addEventListener('click', () => announcementDialog.close());
document.querySelector('#done-announcement').addEventListener('click', () => announcementDialog.close());
announcementContent.addEventListener('scroll', updateAnnouncementDismissControl, { passive: true });
announcementDismiss.addEventListener('change', async () => {
  if (!announcementDismiss.checked || announcementDismiss.disabled || !currentAnnouncement) return;
  try {
    currentAnnouncement = await window.toolbox.dismissAnnouncement(currentAnnouncement.contentId);
    announcementDot.hidden = true;
    announcementStatus.textContent = '已设置为本版本更新前不再自动显示。';
    updateAnnouncementDismissControl();
  } catch (error) {
    announcementDismiss.checked = false;
    announcementStatus.textContent = `设置失败：${error.message || '请稍后重试。'}`;
  }
});

function renderSources() {
  sourceItems.replaceChildren(...(sourceSettings?.sources || []).map((source) => {
    const row = document.createElement('div'); row.className = 'managed-category-row';
    const title = document.createElement('strong'); title.textContent = source.name;
    const use = document.createElement('button'); use.className = source.id === currentSourceId ? 'tool-button' : 'primary-button'; use.type = 'button'; use.textContent = source.id === currentSourceId ? '当前使用' : '切换';
    use.disabled = source.id === currentSourceId;
    use.addEventListener('click', async () => { await window.toolbox.switchSource(source.id); sourceSettings = await window.toolbox.listSources(); currentSourceId = source.id; await loadCurrentSource(); renderSources(); showToast(`已切换到「${source.name}」。`); });
    row.append(title, use);
    if (!source.isDefault) { const remove = document.createElement('button'); remove.className = 'delete-button'; remove.type = 'button'; remove.textContent = '删除'; remove.addEventListener('click', async () => { if (!window.confirm(`删除配置源「${source.name}」？其中的项目配置将被移除。`)) return; const result = await window.toolbox.deleteSource(source.id); sourceSettings = await window.toolbox.listSources(); currentSourceId = result.activeSourceId; await loadCurrentSource(); renderSources(); showToast('配置源已删除。'); }); row.append(remove); }
    return row;
  }));
}
document.querySelector('#manage-sources').addEventListener('click', async () => { setSettingsMenu(false); sourceSettings = await window.toolbox.listSources(); renderSources(); sourceDialog.showModal(); });
document.querySelector('#close-source-dialog').addEventListener('click', () => sourceDialog.close());
document.querySelector('#done-managing-sources').addEventListener('click', () => sourceDialog.close());
sourceForm.addEventListener('submit', async (event) => { event.preventDefault(); try { const source = await window.toolbox.createSource({ name: sourceNameInput.value.trim(), inheritDefault: sourceInheritInput.checked }); sourceNameInput.value = ''; sourceSettings = await window.toolbox.listSources(); renderSources(); showToast(`已新建配置源「${source.name}」。`); } catch (error) { showToast(`新建失败：${error.message || '请稍后重试。'}`); } });

document.querySelector('#import-item-to-source').addEventListener('click', () => {
  if (!activeCard || !sourceSettings) return;
  itemImportTarget.replaceChildren(...sourceSettings.sources.filter((source) => source.id !== currentSourceId).map((source) => Object.assign(document.createElement('option'), { value: source.id, textContent: source.name })));
  if (!itemImportTarget.options.length) return showToast('请先新建另一个配置源。');
  itemImportDialog.showModal();
});
document.querySelector('#close-item-import').addEventListener('click', () => itemImportDialog.close());
document.querySelector('#cancel-item-import').addEventListener('click', () => itemImportDialog.close());
itemImportForm.addEventListener('submit', async (event) => { event.preventDefault(); try { await window.toolbox.importItemToSource({ sourceId: currentSourceId, itemId: activeCard.dataset.id, targetSourceId: itemImportTarget.value }); itemImportDialog.close(); showToast('项目已复制到目标配置源。'); } catch (error) { showToast(`导入失败：${error.message || '请稍后重试。'}`); } });

function simpleCron() { const frequency = document.querySelector('#simple-frequency').value; const [hour, minute] = document.querySelector('#simple-time').value.split(':'); if (frequency === 'weekly') { const days = [...document.querySelectorAll('input[name="simple-day"]:checked')].map((input) => input.value).join(',') || '1'; return `${Number(minute)} ${Number(hour)} * * ${days}`; } if (frequency === 'monthly') return `${Number(minute)} ${Number(hour)} 1 * *`; return `${Number(minute)} ${Number(hour)} * * *`; }
function parseSimpleCron(cron) { const parts = String(cron || '').trim().split(/\s+/); if (parts.length !== 5 || !/^\d+$/.test(parts[0]) || !/^\d+$/.test(parts[1])) return null; const [minute, hour, day, month, weekday] = parts; if (day === '*' && month === '*' && weekday === '*') return { frequency: 'daily', time: `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`, days: [] }; if (day === '1' && month === '*' && weekday === '*') return { frequency: 'monthly', time: `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`, days: [] }; if (day === '*' && month === '*' && /^([0-6])(,[0-6])*$/.test(weekday)) return { frequency: 'weekly', time: `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`, days: weekday.split(',') }; return null; }
function applySimpleCron(cron) { const parsed = parseSimpleCron(cron); if (!parsed) return false; document.querySelector('#simple-frequency').value = parsed.frequency; document.querySelector('#simple-time').value = parsed.time; document.querySelectorAll('input[name="simple-day"]').forEach((input) => { input.checked = parsed.days.includes(input.value); }); return true; }
function updateSimpleSchedule() { const simple = document.querySelector('input[name="schedule-mode"]:checked').value === 'simple'; const frequency = document.querySelector('#simple-frequency').value; document.querySelector('#simple-schedule-fields').hidden = !simple; scheduleCron.readOnly = simple; if (simple && simpleScheduleDirty) scheduleCron.value = simpleCron(); document.querySelector('#simple-days-wrap').disabled = frequency !== 'weekly'; document.querySelector('#schedule-repeat-wrap').hidden = !document.querySelector('#schedule-repeat').checked; document.querySelector('#schedule-rule-preview').textContent = `将按 ${scheduleCron.value} 执行`; }
async function refreshSchedulePicker() { const items = await window.toolbox.listItems(scheduleSource.value); scheduleItemPicker.replaceChildren(...items.map((item) => Object.assign(document.createElement('option'), { value: item.id, textContent: item.name }))); }
function renderScheduleSteps() { scheduleSteps.replaceChildren(...editingScheduleSteps.map((step, index) => { const row = document.createElement('div'); row.className = 'schedule-step'; const name = document.createElement('strong'); name.textContent = step.name; const elevated = document.createElement('label'); elevated.textContent = '管理员启动'; const check = document.createElement('input'); check.type = 'checkbox'; check.checked = step.elevated; check.addEventListener('change', () => { step.elevated = check.checked; }); elevated.prepend(check); const delay = document.createElement('label'); delay.textContent = index === editingScheduleSteps.length - 1 ? '最后一项，无需等待' : '启动后等待 '; if (index !== editingScheduleSteps.length - 1) { const input = document.createElement('input'); input.type = 'number'; input.min = '0'; input.max = '3600'; input.value = String(step.delayAfterSeconds); input.addEventListener('input', () => { step.delayAfterSeconds = Number(input.value) || 0; }); delay.append(input, ' 秒'); } const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'delete-button'; remove.textContent = '删除'; remove.addEventListener('click', () => { editingScheduleSteps.splice(index, 1); renderScheduleSteps(); }); row.append(name, elevated, delay, remove); return row; })); }
async function openScheduleDialog() { setSettingsMenu(false); sourceSettings = await window.toolbox.listSources(); scheduleList = await window.toolbox.listSchedules(); scheduleSource.replaceChildren(...sourceSettings.sources.map((source) => Object.assign(document.createElement('option'), { value: source.id, textContent: source.name }))); editingScheduleId = null; editingScheduleSteps = []; simpleScheduleDirty = false; scheduleForm.reset(); scheduleSource.value = currentSourceId; document.querySelector('#schedule-enabled').checked = true; document.querySelector('#schedule-wake').checked = true; document.querySelector('#simple-time').value = '09:00'; updateSimpleSchedule(); await refreshSchedulePicker(); renderScheduleSteps(); renderScheduleList(); scheduleDialog.showModal(); }
function renderScheduleList() {
  scheduleItems.replaceChildren(...scheduleList.map((schedule) => {
    const row = document.createElement('div');
    row.className = 'managed-category-row schedule-saved-row';
    const text = document.createElement('strong');
    text.textContent = `${schedule.name} · ${schedule.cron}`;

    const enabled = document.createElement('input');
    enabled.type = 'checkbox';
    enabled.checked = schedule.enabled;
    const toggle = document.createElement('label');
    toggle.className = 'schedule-quick-toggle';
    toggle.title = '关闭后，该任务不会按时执行，也不会启动工具箱。';
    toggle.append(enabled, document.createTextNode(schedule.enabled ? '已启用' : '已暂停'));
    enabled.addEventListener('change', async () => {
      enabled.disabled = true;
      try {
        await window.toolbox.saveSchedule({ ...schedule, enabled: enabled.checked });
        scheduleList = await window.toolbox.listSchedules();
        renderScheduleList();
        showToast(enabled.checked ? '定时任务已启用。' : '定时任务已暂停。');
      } catch (error) {
        enabled.checked = !enabled.checked;
        showToast(`切换失败：${error.message || '请稍后重试。'}`);
      } finally {
        enabled.disabled = false;
      }
    });

    const edit = document.createElement('button');
    edit.type = 'button'; edit.className = 'tool-button'; edit.textContent = '编辑';
    edit.addEventListener('click', async () => {
      editingScheduleId = schedule.id;
      document.querySelector('#schedule-name').value = schedule.name;
      scheduleSource.value = schedule.sourceId;
      scheduleCron.value = schedule.cron;
      simpleScheduleDirty = false;
      document.querySelector(`input[name="schedule-mode"][value="${applySimpleCron(schedule.cron) ? 'simple' : 'cron'}"]`).checked = true;
      document.querySelector('#schedule-enabled').checked = schedule.enabled;
      document.querySelector('#schedule-wake').checked = Boolean(schedule.wakeToolbox);
      document.querySelector('#schedule-startup').checked = schedule.runOnStartup;
      document.querySelector('#schedule-repeat').checked = Boolean(schedule.repeatEveryMinutes);
      document.querySelector('#schedule-repeat-minutes').value = String(schedule.repeatEveryMinutes || 30);
      const itemMap = new Map((await window.toolbox.listItems(schedule.sourceId)).map((item) => [item.id, item]));
      editingScheduleSteps = schedule.steps.map((step) => ({ ...step, name: itemMap.get(step.itemId)?.name || '已删除的项目' }));
      updateSimpleSchedule(); await refreshSchedulePicker(); renderScheduleSteps();
    });
    const run = document.createElement('button');
    run.type = 'button'; run.className = 'primary-button'; run.textContent = '立即执行';
    run.addEventListener('click', () => window.toolbox.runSchedule(schedule.id).then(() => showToast('任务已加入执行队列。')));
    const remove = document.createElement('button');
    remove.type = 'button'; remove.className = 'delete-button'; remove.textContent = '删除';
    remove.addEventListener('click', async () => {
      if (!window.confirm(`删除定时任务「${schedule.name}」？`)) return;
      await window.toolbox.deleteSchedule(schedule.id);
      scheduleList = await window.toolbox.listSchedules(); renderScheduleList(); showToast('定时任务已删除。');
    });
    row.append(text, toggle, edit, run, remove);
    return row;
  }));
}
document.querySelector('#manage-schedules').addEventListener('click', () => openScheduleDialog().catch(() => showToast('定时任务读取失败。')));
document.querySelector('#manage-shortcuts').addEventListener('click', () => openShortcutDialog().catch((error) => showToast(`快捷键设置读取失败：${error.message || '请重试。'}`)));
document.querySelector('#close-shortcuts').addEventListener('click', () => shortcutDialog.close());
document.querySelector('#cancel-shortcuts').addEventListener('click', () => shortcutDialog.close());
shortcutSource.addEventListener('change', async () => { shortcutSettings.sourceId = shortcutSource.value; shortcutSettings.wheelLayout = await window.toolbox.getWheelLayout(shortcutSettings.sourceId); await loadShortcutItems(); });
shortcutEnabled.addEventListener('change', () => { shortcutSettings.enabled = shortcutEnabled.checked; });
wheelEnabled.addEventListener('change', () => { shortcutSettings.wheelEnabled = wheelEnabled.checked; });
wheelSize.addEventListener('input', () => { shortcutSettings.wheelSize = Number(wheelSize.value); renderWheelAppearance(); });
wheelOffsetX.addEventListener('input', () => { shortcutSettings.wheelOffsetX = Number(wheelOffsetX.value); renderWheelAppearance(); });
wheelOffsetY.addEventListener('input', () => { shortcutSettings.wheelOffsetY = Number(wheelOffsetY.value); renderWheelAppearance(); });
previewWheelButton.addEventListener('click', () => window.toolbox.previewWheel({ wheelSize: shortcutSettings.wheelSize, wheelAnchor: shortcutSettings.wheelAnchor, wheelOffsetX: shortcutSettings.wheelOffsetX, wheelOffsetY: shortcutSettings.wheelOffsetY }).catch((error) => showToast(`轮盘预览失败：${error.message || '请重试。'}`)));
wheelShortcut.addEventListener('click', () => openShortcutCapture('设置快捷轮盘唤起键', shortcutSettings.wheelShortcut, (value) => { shortcutSettings.wheelShortcut = value || ''; renderShortcutEditor(); }));
shortcutCaptureDialog.addEventListener('keydown', (event) => { const accelerator = eventToAccelerator(event); if (event.key === 'Escape' && !event.ctrlKey && !event.altKey && !event.shiftKey && !event.metaKey) { shortcutCaptureDialog.close(); return; } if (!accelerator) return; event.preventDefault(); const save = captureShortcutTarget; shortcutCaptureDialog.close(); captureShortcutTarget = null; save?.(accelerator); });
document.querySelector('#cancel-captured-shortcut').addEventListener('click', () => shortcutCaptureDialog.close());
document.querySelector('#clear-captured-shortcut').addEventListener('click', () => { const save = captureShortcutTarget; shortcutCaptureDialog.close(); captureShortcutTarget = null; save?.(''); });
shortcutCaptureDialog.addEventListener('close', () => { captureShortcutTarget = null; });
shortcutForm.addEventListener('submit', async (event) => { event.preventDefault(); try { const result = await window.toolbox.saveShortcuts(shortcutSettings); shortcutSettings = normalizeShortcutSettings(result.settings); await loadShortcutItems(); const errors = result.errors || []; showToast(errors.length ? `已保存，但有 ${errors.length} 个快捷键未注册：${errors[0]}` : '快捷键设置已保存并立即生效。'); } catch (error) { showToast(`保存失败：${error.message || '请检查快捷键。'}`); } });
document.querySelector('#close-schedule').addEventListener('click', () => scheduleDialog.close());
document.querySelector('#new-schedule').addEventListener('click', () => openScheduleDialog());
document.querySelectorAll('input[name="schedule-mode"], #schedule-repeat').forEach((input) => input.addEventListener('change', updateSimpleSchedule));
document.querySelectorAll('input[name="simple-day"], #simple-frequency, #simple-time').forEach((input) => input.addEventListener('change', () => { simpleScheduleDirty = true; updateSimpleSchedule(); }));
const scheduleEnabledInput = document.querySelector('#schedule-enabled');
scheduleEnabledInput.closest('label').title = '关闭后，所有按时启动与工具箱启动后执行的规则都会暂停。';
scheduleEnabledInput.closest('label').append('（关闭后不会按时执行）');
document.querySelector('#schedule-wake').addEventListener('change', (event) => {
  if (event.currentTarget.checked) scheduleEnabledInput.checked = true;
});
scheduleSource.addEventListener('change', () => refreshSchedulePicker());
document.querySelector('#add-schedule-step').addEventListener('click', async () => { const item = (await window.toolbox.listItems(scheduleSource.value)).find((entry) => entry.id === scheduleItemPicker.value); if (!item) return; editingScheduleSteps.push({ itemId: item.id, name: item.name, elevated: false, delayAfterSeconds: 10 }); renderScheduleSteps(); });
scheduleForm.addEventListener('submit', async (event) => { event.preventDefault(); try { if (document.querySelector('input[name="schedule-mode"]:checked').value === 'simple' && simpleScheduleDirty) updateSimpleSchedule(); await window.toolbox.saveSchedule({ id: editingScheduleId || undefined, name: document.querySelector('#schedule-name').value, sourceId: scheduleSource.value, cron: scheduleCron.value, enabled: document.querySelector('#schedule-enabled').checked, wakeToolbox: document.querySelector('#schedule-wake').checked, runOnStartup: document.querySelector('#schedule-startup').checked, repeatEveryMinutes: document.querySelector('#schedule-repeat').checked ? Number(document.querySelector('#schedule-repeat-minutes').value) : 0, steps: editingScheduleSteps.map(({ name, ...step }, index) => ({ ...step, delayAfterSeconds: index === editingScheduleSteps.length - 1 ? 0 : step.delayAfterSeconds })) }); scheduleList = await window.toolbox.listSchedules(); renderScheduleList(); showToast('定时任务已保存。'); } catch (error) { showToast(`保存失败：${error.message || '请检查规则。'}`); } });

refreshCategoryOptions();
rebuildSearchIndex();
updateCategoryCounts();
getRegisteredCards().forEach(updateCardSource);
window.toolbox?.getBackgroundSettings?.().then((settings) => { backgroundSettings = settings; applyBackground(settings.currentDataUrl); });
openAnnouncementDialog({ automatic: true }).catch(() => { announcementDot.hidden = true; });
initializeSources().catch(() => showToast('配置源初始化失败。'));
