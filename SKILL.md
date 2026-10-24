---
name: mindspace
description: "从零生成一个 MURAL 风格的「无限画布 + 思维导图」单文件网页应用：中心主题双侧自动布局、拖拽节点改层级、便签自由摆放、多画布列表、PNG/JSON 导出、本地自动保存。当用户要做一个可日常使用的画布工具、思维导图、脑图、卡片墙、灵感板、白板，或提到「无限画布 / 仿 MURAL / 节点导图 / 便签贴」时使用。关键词：思维导图、脑图、无限画布、MURAL、白板、画布应用、节点卡片、便签、灵感收集、mindmap、infinite canvas。"
agent_created: true
---

# MindSpace —— 无限画布思维导图生成器

## 何时使用

用户想要一个**可以日常使用**的画布型工具：思维导图、脑图、灵感板、卡片墙、轻量白板。
最典型的诉求：「仿 MURAL 做一个思维导图网页应用，要有列表、无限画布、好看、好用」。

交付目标：**单个 HTML 文件**，零依赖、零构建、双击即用、离线可用，数据存浏览器 `localStorage`。

## 交付物

- 一个 `.html` 文件（见 `assets/mindspace.html`，已验证可运行的参考实现）。
- 优先**直接复用 / 扩展该模板**，不要从零重写——关键坑位已在模板里规避，重写极易回退。

## 架构（3 句话讲清）

1. **视口变换**：一个 `#world` 容器用 `transform: translate(x,y) scale(s)` 承载全部内容；平移改 `x,y`，缩放改 `s` 并以光标为锚点（先算世界坐标再换算）。
2. **节点 = DOM，连线 = SVG `<path>` 贝塞尔曲线**。节点是绝对定位的 div，连线层 `overflow:visible`，与节点共用世界坐标。
3. **布局 = 自研简化版 Reingold-Tilford**：先 `offsetWidth/offsetHeight` **实测**每个节点尺寸，再按「中心主题居中、左右两侧各成一列、子节点垂直排布 + 间隔」递归计算坐标。

详细数据 schema、交互清单、CSS/算法见 `references/architecture.md`。

## 已踩坑清单（务必先读，重写必犯）

1. **绝对定位节点在 `width:0` 的容器里会按单字宽度收缩** → 节点必须 `width:max-content; max-width:240px`，靠 `max-width` 触发换行，否则宽度只剩几像素。
2. **连线层不能放在 `left:-50000px` 的大 SVG 里**（需配套 `<g transform>` 补偿）→ 直接 `width:1px; height:1px; overflow:visible`，path 用世界坐标即可。
3. **翻转/拖拽改层级时，必须整棵子树同步 `side` 和 `colorIdx`**（递归），否则子节点留在原地、叠加到根节点上方造成重叠。
4. **导出 PNG 的文字换行宽度要用 CSS 真实 max-width（290/250/240 减 padding），不能用实测盒宽** → 否则短文本被误断行。换行测量用隐藏 DOM `span` 实测字体宽度，保证与屏幕一致。
5. **编辑态（contenteditable）下，点击/拖拽其他节点会触发 `render()` 重建 DOM** → 必须重新 `querySelector` 取元素引用，否则拖拽的是已脱离文档的旧元素。
6. **`pointerdown` 不要 `preventDefault()`**（会废掉双击编辑）；用 CSS `user-select:none` 屏蔽选区即可。单击不应触发整树重绘（也会破坏双击）。

## 工作流（生成 / 改造时遵循）

1. 若用户没有现成文件：复制 `assets/mindspace.html` 到工作区，再按需改造。
2. 改造方向（按性价比）：
   - **换主题色**：改 `:root` 变量与 `PALETTE` 数组（8 色，渲染时按层级取色）。
   - **改默认示例内容**：改 `sampleBoard()`。
   - **加节点字段**（如「完成状态」复选框）：在 `B.nodes[id]` 加字段，渲染时画圆点，布局不受影响。
   - **加全局大纲面板**：在 `render()` 后遍历 `visibleNodes()` 生成缩进列表，点击 `select()` + `ensureVisible()`。
3. 改完用 `scripts/qa.js` 跑浏览器回归（重叠检测、导出、持久化），确认无控制台报错。

## 验证

```bash
# CHROME_PATH 默认指向 /Applications/Google Chrome.app；用 puppeteer-core 驱动
node scripts/qa.js /path/to/mindspace.html
```

QA 会校验：节点之间零重叠、翻转分支后子节点随侧移动、拖拽重挂子树、PNG 成功下载、刷新后内容持久化。脚本依赖 `puppeteer-core`（在 WorkBuddy 的 node workspace 里已装）。

## 边界

- 纯前端，不上传任何数据。若用户需要云端多人协作，需另接后端（参见 cloud-service / 发布为应用 等能力），不在本 skill 范围。
- 桌面优先；移动端触摸事件未做专项适配。
