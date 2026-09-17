# AngelinaTravelToolbox 设计说明

## 1. 产品定位

阿洁的旅行工具箱（AngelinaTravelToolbox）是一个本地优先的《明日方舟》工具入口管理器。它统一管理本地程序、文件夹、资料和网站；用户可以维护分类、图标、简介、收藏、启动方式与排序。当前发行版优先支持 Windows，工程本身采用可扩展的跨平台桌面架构。

## 2. 技术架构

- 桌面端：Electron + Vite + 原生 HTML/CSS/JavaScript。
- Main Process：受控访问文件系统、启动目标、配置读写、图片托管、导入导出、Windows 定时任务。
- Preload：仅暴露明确的 IPC 接口；渲染层不直接访问 Node.js 或系统 API。
- Renderer：原生 DOM、响应式卡片布局与弹窗交互。
- 未来在线服务：在账号、同步、分享和在线目录确有需要时，再引入 Node.js + TypeScript + NestJS + PostgreSQL；本地 JSON 始终可独立运行。

## 3. 数据与目录

每个项目独立保存为 `items/<source-id>/<ulid>.json`：

```json
{
  "image": "static/images/custom/recruitment.ico",
  "name": "公开招募计算器",
  "target": "tools/recruitment/RecruitmentTool.exe",
  "description": "快速筛选标签组合。",
  "category": "公开招募",
  "favorite": false,
  "advancedLaunchEnabled": false,
  "commandLaunches": [
    { "id": "ULID", "name": "调试模式", "command": "tools/recruitment/RecruitmentTool.exe --debug" }
  ]
}
```

- `target` 与 `image` 的相对路径均以工具箱根目录为基准；`http` / `https` 目标识别为网站，其他目标识别为本地工具。
- `category` 是用户定义的中文名称，也是分类 ID；名称不可重复。“全部”“收藏”为虚拟分类，不写入分类文件，也不可删除。
- `advancedLaunchEnabled` 仅适用于本地工具。开启后，卡片显示“启动 + 高级启动”；高级菜单有管理员启动以及最多 20 条具名 CMD 命令。
- `commandLaunches` 中的命令通过 `cmd.exe /d /s /c` 在工具箱根目录执行。前端仅提交命令 ID；主进程会重新读取当前项目并校验命令后才执行。

运行目录：

```text
AngelinaTravelToolbox/
├─ AngelinaTravelToolbox.exe
├─ items/<source-id>/
├─ static/images/{builtin,custom}/
├─ tools/
├─ config/
│  ├─ sources.json
│  ├─ background.json
│  ├─ schedules.json
│  └─ sources/<source-id>/{categories.json,item-order.json}
└─ logs/
```

源码工程保持英文目录：`apps/desktop/electron` 为主进程与 preload，`apps/desktop/renderer` 为界面，`runtime-template` 是首次运行模板，`docs` 存放设计资料。

## 4. 安装版运行时与更新

便携版继续以工具箱根目录作为运行时数据根目录。NSIS 安装版则将 `config/`、`items/`、`static/`、`logs/` 与用户侧 `tools/` 放到 Electron 的用户数据目录；安装目录仅保留程序与内置基线资源。

首次安装时，内置 `tools/` 会复制到用户数据目录。后续程序更新只更新应用本体和安装目录的基线资源，不自动覆盖该用户侧工具副本、配置源、图标、背景或定时任务。

程序更新使用 NSIS 与 `electron-updater`：仅在正式安装版中检查官方 GitHub Releases；用户可检查、下载并重启安装，也可选择启动时检查、自动下载及退出时安装。网络错误不会阻塞使用，完整安装包始终是手动修复兜底。

公告由 Markdown 驱动：应用内置占位文件保证离线可展示；配置官方 HTTPS 公告地址后，主进程以 ETag 缓存拉取远程版本，失败时回退缓存或内置文件。公告与配置源无关。

## 5. 交互与持久化

- 顶部提供导入、导出、分类管理、添加项目；设置菜单提供配置源、背景、批量管理、定时启动与使用教程。
- 左侧为可隐藏分类栏；项目卡片是正方形，简介区域独立滚动。
- 卡片空白区域支持拖拽排序；顺序写入当前配置源的 `item-order.json`，并包含在导入导出内。
- 新建/更换图标、背景时会将文件复制到 `static/images/custom/`。旧文件没有任何项目或背景引用后自动清理；背景历史最多保留 10 张。
- 配置源可切换、新建、删除；新建可继承默认配置源。项目复制、批量移动、批量复制均在当前配置源内持久化。
- 定时任务以清单形式保存，可用简易规则或五段 Cron；需要唤醒工具箱的任务同步到 Windows 任务计划程序。

## 5. 配置迁移

`.attconfig` 是标准 ZIP 配置包，导出一个配置源的项目、分类、收藏、排序、自定义图片和 manifest，不包含主程序、工具程序或日志。导入默认采用增量方式，作为新的配置源加入；也支持合并或覆盖当前自定义配置源。高级启动设置与自定义命令随项目保留，但导入过程不会自动执行任何目标或命令。

## 7. 当前边界

本项目只负责管理与启动用户配置的入口；不会更新、修改或打包用户自行添加的工具。管理员启动和自定义 CMD 命令具有系统权限风险，仅应配置来自可信来源的命令。
