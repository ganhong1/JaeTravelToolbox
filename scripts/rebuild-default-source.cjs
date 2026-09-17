const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const { ZipArchive } = require('archiver');
const unzipper = require('unzipper');

const root = path.resolve(__dirname, '..');
const archivePath = path.join(root, 'runtime-template', 'config', 'default-source.attconfig');
const iconPath = path.join(root, '开发临时用资源库', 'icon.png');
const itemId = '01M1Q0B3NA3M34SVR3T0000000';
const imageName = '01M1Q0BENA0MEASUREICON001.png';
const itemPath = `items/${itemId}.json`;
const legacyItemPath = 'items/01M1Q0B3NA3M34SVR3T000000.json';
const roadmarkIconPath = path.join(root, '开发临时用资源库', 'logo-white.B_WyLRsV.png');
const roadmarkItemId = '01M1Q0R04DM4RKB4RCH1V30000';
const roadmarkImageName = '01M1Q0R04DROADMARKWIKI001.png';
const roadmarkItemPath = `items/${roadmarkItemId}.json`;
const item = {
  image: `static/images/custom/${imageName}`,
  name: '贝娜的量角器',
  target: 'tools/贝娜的量角器/贝娜的量角器.exe',
  description: '《贝娜的量角器》注意事项及声明\n1.《贝娜的量角器》为分析工具与翻译工具，旨在为普通玩家提供阅读机制和算法的渠道，其中不包含也没有任何计划包含编辑功能，亦不支持任何与“私服”相关的项目。我们坚决反对一切私服行为。\n2.目前贝娜的量角器中出现的数值大多均为默认数据，详细数据可能受给定黑板的制约。\n3.明日方舟体量庞大且杂乱，而贝娜仍处于早期版本，Node翻译与藏品机制的翻译仍需大量人力工作量，如果希望帮助此项目，欢迎提交pr。\n4.若启动后发现无法下载数据/下载数据缓慢，请尝试开启梯子。',
  category: '',
  favorite: false
};
const roadmarkItem = {
  image: `static/images/custom/${roadmarkImageName}`,
  name: '路标档案馆wiki',
  target: 'https://www.lubiao.wiki/',
  description: '路标档案馆是一个公开的明日方舟集成战略/卫戍协议研究的社区项目。专注于对集成战略/卫戍协议等模式的历史数据进行统计留档、再进行分析得出结论。该网站为路标档案馆维护的wiki，里面保存了其可公开的研究数据成果，包括集成战略藏品池、经验表等。',
  category: '',
  favorite: false
};

async function build() {
  const source = await fs.readFile(archivePath);
  const directory = await unzipper.Open.buffer(source);
  const entries = new Map(directory.files.filter((entry) => entry.type === 'File').map((entry) => [entry.path, entry]));
  const items = [...entries.keys()].filter((name) => /^items\/[0-9A-HJKMNP-TV-Z]{26}\.json$/i.test(name));
  const manifest = JSON.parse((await entries.get('manifest.json').buffer()).toString('utf8'));
  manifest.exportedAt = new Date().toISOString();
  manifest.itemCount = items.length + (items.includes(itemPath) ? 0 : 1) + (items.includes(roadmarkItemPath) ? 0 : 1);
  const itemOrder = [...new Set([...items.filter((name) => name !== legacyItemPath).map((name) => path.basename(name, '.json')), itemId, roadmarkItemId])];

  const temporaryPath = `${archivePath}.${crypto.randomUUID()}.tmp`;
  const output = require('fs').createWriteStream(temporaryPath);
  const archive = new ZipArchive({ zlib: { level: 9 } });
  await new Promise((resolve, reject) => {
    output.on('close', resolve); output.on('error', reject); archive.on('error', reject);
    archive.pipe(output);
    for (const [name, entry] of entries) {
      if (name === 'manifest.json' || name === 'item-order.json' || name === itemPath || name === roadmarkItemPath || name === legacyItemPath || name === `images/${imageName}` || name === `images/${roadmarkImageName}`) continue;
      archive.append(entry.stream(), { name });
    }
    archive.append(JSON.stringify(manifest, null, 2), { name: 'manifest.json' });
    archive.append(JSON.stringify({ version: 1, order: itemOrder }, null, 2), { name: 'item-order.json' });
    archive.append(JSON.stringify(item, null, 2), { name: itemPath });
    archive.file(iconPath, { name: `images/${imageName}` });
    archive.append(JSON.stringify(roadmarkItem, null, 2), { name: roadmarkItemPath });
    archive.file(roadmarkIconPath, { name: `images/${roadmarkImageName}` });
    archive.finalize();
  });
  await fs.rename(temporaryPath, archivePath);
  console.log(`已更新默认配置源：${item.name}、${roadmarkItem.name}`);
}

build().catch((error) => { console.error(error); process.exitCode = 1; });
