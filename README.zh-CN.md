# Wayfinder Viewer

[English](README.md) | 简体中文

轻量的本地 Wayfinder 决策地图查看器。将 GitHub Issues 中的决策、阻塞关系与讨论呈现在可交互画布中，并支持导出独立 HTML 快照。

## 项目背景与灵感

复杂项目的规划往往分散在多个议题中：哪些问题还没有确定、哪些决策依赖前置结论、哪些可以开始讨论，很难一眼看清。这个项目把这些关系汇集成地图，方便理解决策与目标之间的联系。

灵感来自 **Matt Pocock 的 [Wayfinder skill](https://github.com/mattpocock/skills/tree/main/skills/engineering/wayfinder)**，属于 [mattpocock/skills](https://github.com/mattpocock/skills) 项目。它以决策议题组成规划地图，用目标和未阻塞、未认领的问题推动规划。本项目为这一工作流在 GitHub 上的表达提供独立的可视化查看器，并非 Matt Pocock 或 GitHub 的官方产品。

## 纯 vibe coding 项目

**本项目是一个纯 vibe coding 项目。** 开发通过与 AI 编程代理的自然语言对话完成，由人提出需求、指导方向并检查结果。这是对开发方式的说明，不代表正确性保证或已通过安全审计。欢迎补充测试与贡献改进。

## 功能

- 可拖动、缩放的依赖图，支持搜索、状态和类型筛选、聚焦上下游关系。
- 查看决策正文、评论、地图说明，并跳转 GitHub。
- 基于 GitHub 原生子议题、阻塞关系和分派信息计算“可开始”列表。
- 切换仓库和地图、收起侧栏，以及手机尺寸下的列表视图。
- 本地快照缓存、手动刷新、自包含离线 HTML 导出。
- Python 标准库后端与原生 HTML/CSS/JavaScript，无需构建或安装第三方运行时包。

当前软件界面为简体中文。文档提供中英文版本，尚未提供英文界面。

## 快速开始

要求：Python 3.10+、[GitHub CLI](https://cli.github.com/)，以及有权读取目标仓库的 GitHub 账号。

1. 下载或克隆本仓库，在项目目录打开终端。
2. 登录并启动：

```sh
gh auth login
python3 server.py
```

浏览器自动打开 `http://127.0.0.1:8766`，随后填写自己的仓库（`owner/repo`）和地图议题编号。默认不绑定或读取任何个人仓库。macOS 也可以双击 `start.command`。

启动时指定地图：

```sh
python3 server.py --repo owner/repo --map 1 --port 8766
```

请将 `owner/repo` 和 `1` 替换为自己的仓库及地图编号。增加 `--no-browser` 可跳过自动打开浏览器；按 Ctrl+C 停止服务。

## 准备地图

在 GitHub 创建带 `wayfinder:map` 标签的父议题，将决策议题设为其**原生子议题**，再使用**原生阻塞关系**连接前置事项。仅在正文中添加链接或任务列表，不会建立这些关系。

决策类型标签可用 `wayfinder:research`、`wayfinder:prototype`、`wayfinder:grilling` 和 `wayfinder:task`。地图正文可采用 `## Destination`、`## Notes`、`## Decisions so far`、`## Not yet specified`、`## Out of scope` 分节。查看器只读取已有地图，不创建或修改议题。

## 使用方式

点击节点或列表项阅读问题与讨论；拖动画布平移、滚轮缩放。方向键平移，`+` / `-` 缩放，`0` 适应画布。“聚焦关联”显示所选决策的上下游链。点击顶部仓库按钮切换地图，也可以查找带 `wayfinder:map` 标签的议题。

有缓存时优先读取本地快照，否则从 GitHub 加载。点击刷新获取新状态；刷新失败保留之前的快照，部分读取失败会显示警告。

“导出 HTML”保存当前快照，无需启动服务即可独立打开，但不能刷新 GitHub。也可从命令行导出已缓存的地图：

```sh
python3 server.py --repo owner/repo --map 1 --export wayfinder-map.html
```

## 状态规则与边界

| 状态 | 含义 |
| --- | --- |
| 已关闭 | GitHub 议题已关闭，不自动推断验收通过或已形成有效决定。 |
| 可开始 | 议题开放、无人分派，且所有前置均已关闭。 |
| 被阻塞 | 至少一个前置事项仍开放。 |
| 已认领 | 议题开放、已分派且无开放前置，不表示 Agent 正在运行。 |
| 待核实 | 前置关系未完整读取，不推断为可开始。 |

仅加载地图的直接子议题及其直接前置关系。外部前置保留仓库身份与 GitHub 链接，不递归展开子议题的子议题。评论不被自动判定为正式结论。快照不是原子读取，若 GitHub 同时发生修改，可再次刷新核对。当前界面时间统一显示为 Asia/Shanghai。

## 隐私与部署范围

这是可公开分享源码的**本地桌面工具**，不是托管的多用户服务。仅监听 `127.0.0.1`，通过本机 `gh` 发起只读 GitHub 请求，不将认证令牌嵌入页面或导出文件。应在本机使用；尚未实现面向公网托管的身份认证。

`.cache/` 保存议题正文、关系、分派信息与评论。导出 HTML 同样包含快照数据；如果读取了私有仓库，导出文件也会包含其中的材料，分享前必须检查。缓存、导出 HTML、凭据文件与私人设计参考已加入 `.gitignore`。分享源码文件，不要直接分享整个工作目录。删除 `.cache/` 可清除本地快照。

从最新版本删除敏感文件**不会清除 Git 历史**。公开已有仓库前，应检查历史和发布附件，清理历史敏感内容或发布不带旧历史的干净源码副本；如曾泄露凭据，应更换凭据。

## 开发与贡献

```sh
python3 -m unittest discover -s tests -v
node --check web/app.js
```

Node.js 仅用于 JavaScript 语法检查。Python 测试覆盖状态计算、缺失及跨仓库依赖、分页、目标参数校验、失败时缓存保留和导出转义，不能替代真实 GitHub 联调与浏览器兼容性验证。

欢迎提交问题与 PR。请使用虚构示例，并在报告和截图中移除仓库私密内容、令牌及个人信息。详见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 开源协议

采用 [MIT 协议](LICENSE)。允许使用、修改、分发和商业使用，须保留版权及许可声明；软件不提供担保。灵感来源不代表官方背书，上游项目保留各自的许可。
