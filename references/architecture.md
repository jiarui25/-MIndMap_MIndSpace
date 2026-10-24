# MindSpace 架构与实现参考

> 配套 `assets/mindspace.html`。本文档面向需要**改造**而非单纯使用的场景。

## 1. 数据 Schema（localStorage key `mindspace.v1`）

```js
db = {
  boards: [
    {
      id, name, colorIdx, createdAt, updatedAt,
      rootId,
      view: { x, y, scale, fitted } | null,   // 画布视口状态，null 表示首开需 fit
      nodes: { [id]: { id, text, parent, side:'root'|'left'|'right',
                       colorIdx, collapsed, children:[id,...] } },
      notes: [ { id, text, color, x, y } ]      // 自由便签，世界坐标左上角
    }
  ],
  current: <boardId>
}
```

要点：
- 节点用**扁平 map + `children` 数组**存序，而非嵌套树。`parent` 字段用于快速查找祖先（判断拖拽合法性）。
- `side` 决定左右分栏；`colorIdx` 决定分支色。
- 撤销/重做：`history.undo/redo` 存 `{nodes, notes}` 的 JSON 快照（上限 90 步）。
- 布局坐标 `n._x / n._y` 是运行时算出来的，会随节点一起序列化进 `localStorage`（无害，下次布局会覆盖）。

## 2. 渲染管线（每帧 / 每次变更）

```
render()
 ├─ renderNodes()   建 DOM → 统一 offsetWidth/Height 填入 sizes Map
 ├─ computeLayout() 自研树布局算每个节点 _x/_y
 ├─ applyPositions() 设 transform
 ├─ renderEdges()    按 visibleNodes 生成贝塞尔 path
 ├─ renderNotes()    便签层
 └─ applySelection()
```

`visibleNodes()` 深度遍历，遇到 `collapsed` 节点即停止下钻。折叠时该节点显示 `children.length` 角标。

## 3. 布局算法（核心）

`computeLayout()`:
- `extent(n)`：子树高度。叶子 = 自身高；非叶子 = `max(自身高, Σ子extent + (k-1)*GAP_Y)`，用 `ext` Map 记忆化。
- `place(n, x, top)`：按 `x`（左/右取决于 `side`）放下 n，再递归放下子节点；子节点垂直方向居中于 n 所在块。
- 中心主题居中（自身宽高的一半置于原点），左右两侧分别成列，各自垂直居中。

常量：`NODE_GAP_X=66`（层级横向间距），`NODE_GAP_Y=18`（同级纵向间距）。

## 4. 视口与坐标换算

```js
world.style.transform = `translate(${x}px,${y}px) scale(${s})`;
toWorld(cx,cy) = { x:(cx-rect.left-x)/s, y:(cy-rect.top-y)/s }
zoomAt(factor, anchorX, anchorY): 以锚点（默认画布中心）保持像素位置不动地缩放
```

背景点阵：`background-size = step*s`、`background-position = x,y`（`step` 在缩放过小时 ×2 防止过密）。

## 5. 交互事件表

| 操作 | 触发 | 行为 |
|---|---|---|
| 平移画布 | 拖拽空白 / 按住空格拖拽 / 中键 | `view.x/y` 联动 |
| 缩放 | `⌘/Ctrl/Alt + 滚轮`（触控板捏合）/ 按钮 / `+ - 0` | `zoomAt` |
| 新建子节点 | 选中后 `Tab` 或工具条按钮 | `addChild` |
| 新建同级 | `Enter` / 按钮 | `addSibling`（根节点则转 addChild） |
| 编辑文字 | 双击 / `F2` / 右键→编辑 | `startEdit`（contenteditable，Enter 提交并建同级，Tab 建子，Esc 取消） |
| 删除 | `Delete`/`Backspace` | `deleteNode`/`deleteNote`（根节点不可删，提示改名） |
| 拖拽改层级 | 拖动节点到另一节点 | `reparent`（递归同步 side/colorIdx，禁止拖入自身子树） |
| 方向键 | 在节点间按空间最近方向跳转 | `navigate` |
| 折叠/展开 | 悬停节点出现圆钮点击 | `toggleCollapse` |
| 便签 | `N` / 双击空白 / 工具条 | `addNote`（contenteditable，白色占位「写点什么…」） |
| 适应画布 | `F` / 按钮 | `fitView` |
| 右键菜单 | 节点/便签右键 | 改色(8)/换边/折叠/复制/删除 |
| 导出 | `⌘⇧E` / 工具条 / 下拉 | `exportPNG`（Canvas 手绘）、`exportJSON`、`import` |
| 撤销/重做 | `⌘Z` / `⇧⌘Z` | `undo`/`redo` |

## 6. 导出 PNG（`exportPNG`）

- 用 `bbox(pad)` 取可见节点+便签的世界包围盒。
- Canvas 2 倍分辨率；先画背景点阵，再画连线（贝塞尔），再画便签，最后画节点（圆角矩形 + 阴影 + 文字）。
- **文字换行**：`wrapLines(text, fontCss, maxW)` 用隐藏 DOM `span` 实测字符宽度逐字累加，遇 `maxW` 换行；`maxW` 取 CSS 真实 max-width 减 padding（d0:246 / d1:218 / d2:209）。
- 字体字符串 `FONT_STACK = '-apple-system, ..., "PingFang SC", ...'`；d0 650/17px，d1 600/14.5px，d2 400/14px。

## 7. 常见改造指引

- **改配色**：`PALETTE` 8 个 `main` 色（节点填充/描边/连线均由 `hexA(main,a)` 派生）；便签 `NOTE_COLORS`。
- **改示例**：`sampleBoard()`。
- **加「完成」态**：`nodes[id].done`，渲染时画左侧小圆点，编辑无影响；可加 `filter` 视图。
- **加大纲面板**：在 `#sidebar` 增加切换，遍历 `visibleNodes()` 生成缩进 `<div>`，`onclick → select({type:'node',id}); ensureVisible(id)`。
- **加搜索**：`searchBoards` 已是画布列表搜索；节点搜索可遍历 `visibleNodes()` 过滤 `text.includes`。

## 8. 验证脚本（`scripts/qa.js`）

纯前端，用 `puppeteer-core` 驱动本地 Chrome：
1. 加载 HTML，清空 localStorage 后重载，校验初始化（节点数、连线数）。
2. **重叠检测**：所有可见节点 `getBoundingClientRect` 两两相交检测（容差 1.5px）——任何 `flipSide`/`reparent` 后都应为空。
3. 右键菜单 → 换色/换边。
4. 拖拽子树重挂 → 校验 `parent`/`side` 与子节点 `side` 一致。
5. 导出 PNG → 校验下载文件存在且体积正常。
6. 刷新 → 校验 `localStorage` 内容持久化。
7. 断言无 `pageerror` / `console.error`。
