# 阿洁的旅行工具箱

> 明日方舟相关网站与本地工具的可配置桌面入口。

阿洁的旅行工具箱（JaeTravelToolbox）是一个跨平台 Electron 桌面应用。它将网站、本地程序与文件夹统一收录为项目（Item），提供分类、搜索、收藏、配置源、导入导出、背景与图标管理等能力。

## 许可证

本仓库中由项目维护者提供的源代码采用 [Mozilla Public License 2.0](./LICENSE)（MPL-2.0）授权。

MPL-2.0 是按文件生效的弱 Copyleft 许可证：当你修改并分发本仓库受 MPL 覆盖的源文件时，须以 MPL-2.0 提供这些修改后的文件源代码；将本项目作为更大项目的一部分使用时，其他独立文件可使用不同许可证。

除非对应文件另有说明，本仓库不授予任何第三方名称、商标、角色形象、网站内容或未随源码提供之工具的权利。

## 仓库范围

`tools/` 是本地工具的放置目录，已被 `.gitignore` 排除，不会随本仓库提交。正式 Windows 安装包可在取得对应授权后携带首装工具副本；安装后会复制到用户数据目录，后续程序更新不会覆盖它。请自行确认你放入该目录的程序拥有合法的下载、使用及再分发授权。

运行时产生的项目数据、用户自定义图标、背景图、日志和配置也不会纳入版本控制。

## 功能概览

- 统一管理本地工具、文件夹与 HTTP/HTTPS 网站。
- 自定义分类、收藏、卡片图标与简介。
- 支持中文、拼音与英文的模糊搜索。
- 提供正常启动与 Windows 管理员权限启动。
- 配置源的创建、切换、继承、导入、导出与增量导入。
- 批量移动、复制或删除项目。
- 背景图片历史记录与自动清理未使用图片。
- 内置 Markdown 使用教程与公告占位；公告可选从官方 GitHub 地址拉取并在离线时回退本地内容。
- Windows NSIS 安装包的 GitHub Releases 检查、下载与重启安装更新能力。

## 本地开发

环境要求：Node.js 20 或更高版本，建议使用 Windows 进行 Electron 桌面功能测试。

```powershell
npm install
npm run dev
```

仅构建前端资源：

```powershell
npm run build
```

构建 Windows 安装包：

```powershell
npm run package:win
```

首次正式发布前，在 [`runtime-template/config/online-services.json`](runtime-template/config/online-services.json) 填入官方 GitHub 仓库的 `owner` 与 `repo`，并为发行包配置 Windows 代码签名。未填入仓库信息时，软件更新界面会安全地保持禁用状态。

## 项目结构

```text
apps/desktop/             Electron 主进程、预加载脚本与前端
runtime-template/         首次运行时初始化的默认运行时数据
docs/                     设计文档
scripts/                  打包脚本
tools/                    用户本地工具目录（不纳入 Git）
```

## 免责声明

工具箱所提供或收录的一切网站和本地工具仅供参考、学习与交流使用。请遵守适用的法律法规、平台规则及相关服务条款；禁止将本工具箱或其收录内容用于任何非法活动。我们反对任何利用本工具箱实施恶性活动的行为。
