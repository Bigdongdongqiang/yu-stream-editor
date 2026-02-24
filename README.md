# Yu流式编辑器

基于 contenteditable 的流式富文本编辑器：支持流式 Markdown 输入并实时转 HTML 渲染，**支持 ECharts 图表与自定义卡片（Vue/React 等）渲染**，同时提供字体/字号/颜色、表格样式、图片与链接等富文本能力。样式类均以 `yu-stream-editor` 为前缀，便于嵌入与主题隔离。

---

## 应用场景

- **大模型数据反显**：对接 LLM 流式接口（SSE、fetch 流等），将模型输出的 Markdown 逐段通过 `appendStreamChunk` 写入，实时解析并渲染；流式过程中图表、卡片、图片以「加载中…」占位，结束后一次性替换为图表与卡片，适合 **AI 对话回复、知识库问答、代码/报告生成** 等场景的展示与只读查看。
- **卡片展示与扩展**：通过 \`\`\`language + `anchors` 将模型或业务返回的**结构化内容**渲染为卡片，例如：**数据报表卡片**（\`\`\`echarts 直接出图）、**组件卡片**（Vue/React 挂载表格、表单、图表）、**Mermaid/PlantUML 流程图**、**自定义业务卡片**（订单、用户信息、推荐结果等）。`getMarkdown()` 可完整还原，便于编辑或再次提交。
- **富文本编辑与导出**：在编辑模式下支持字体、表格、图片、链接等排版；内容以 Markdown 进出，便于与后端或大模型接口统一格式，适用于 **文档编辑、富文本聊天输入、带格式的笔记/工单** 等。

---

## 功能概览

- **流式 Markdown**：内容以字符串或异步迭代器（如 fetch 流、SSE）逐段传入，实时解析并渲染到编辑区。流式过程中 **ECharts 图表、自定义卡片（锚点）、图片** 均以统一「加载中…」占位显示，避免每次 innerHTML 更新重复请求或重挂组件；在 `setReadonly(false)`（流式结束）时再统一替换为真实图表、卡片与图片。
- **卡片渲染**：通过 \`\`\`language 代码块 + `anchors` 配置，将指定语言块渲染为**不可编辑的卡片**；支持在 `mount` 中挂载 **Vue 3 / React** 等组件，实现交互式卡片（见「自定义锚点（卡片）」）。内置 \`\`\`echarts 独立渲染为图表；也可将 echarts 纳入锚点自行渲染。
- **选中文字工具栏**：选中后可修改字体、字号、颜色，以及粗体 / 斜体 / 下划线、标题、有序·无序列表。
- **光标插入工具栏**：无选区时显示「图片、链接、表格、分割线」等插入入口。
- **表格**：插入表格后支持边框样式（完整 / 仅外框 / 无）、对齐方式、边框颜色，以及增删行列；选中表格时有边框高亮。
- **图片**：选中图片后可设置宽高与对齐方式。
- **只读 / 最大字数**：支持只读模式与最大字数限制；可自定义 placeholder、所有按钮的 tooltip 及生命周期钩子。

---

## 快速开始

```bash
npm install
npm run dev
```

浏览器访问 http://localhost:5173 。点击「模拟流式」可观看示例 Markdown 逐字渲染。

---

## 基本使用

```js
import { YuStreamEditor } from './Editor.js';

const container = document.getElementById('editor-container');
const editor = new YuStreamEditor({ container });
```

编辑器 DOM 由类内部生成并挂载到 `container` 中。

---

## 配置项

`new YuStreamEditor(options)` 支持的 `options` 字段：

| 选项 | 类型 | 说明 |
|------|------|------|
| `container` | `HTMLElement` | 挂载编辑器的容器，必填（或回退到 `#app`） |
| `tooltips` | `Object` | 覆盖默认 tooltip / placeholder 文案，键见下方「Tooltip 配置」 |
| `hooks` | `Object` | 生命周期与事件钩子，键见下方「钩子」 |
| `maxLength` | `number` | 最大字数（纯文本，0 表示不限制） |
| `pastePlainText` | `boolean` | 粘贴时是否转为纯文本（默认 `false`） |
| `chartEnabled` | `boolean` | 是否将 \`\`\`echarts 渲染为图表（默认 `true`）。设为 `false` 时按普通代码块显示，不渲染 ECharts。可运行时修改 `editor.chartEnabled`。 |
| `anchors` | `Array` | 自定义锚点（卡片），见下方「自定义锚点（卡片）」：将指定 \`\`\`language 围栏替换为不可编辑卡片，getMarkdown 时还原。 |
| `readonly` | `boolean` | 是否只读（默认 `false`），与 `mode` 二选一即可 |
| `mode` | `'edit' \| 'readonly'` | 模式：`'edit'` 编辑模式，`'readonly'` 只读模式；优先于 `readonly` |
| `tools` | `Object` | 工具栏可配置与扩展，见下方「工具栏 tools」 |

### 工具栏可配置与扩展（tools）

- **可配置**：插入栏（光标处）工具项及顺序由 `tools.insert` 控制，为 id 数组，如 `['image','link','table','hr']`。缺省为四项全显示；可调顺序或去掉某项（如只要 `['link','table']`）。
- **可扩展**：通过 `tools.insertExtra`、`tools.bubbleExtra`、`tools.tableExtra`、`tools.imageExtra` 在插入栏、气泡栏、表格栏、图片栏末尾追加自定义按钮，每项为 `{ id, label, title?, onClick(editor) }`，点击时调用 `onClick(editor)`。

内置插入栏 id：`image`、`link`、`table`、`hr`（可从 `Editor.js` 导入 `DEFAULT_INSERT_TOOLS` 查看）。

### 自定义锚点（卡片渲染）

通过 `options.anchors` 可配置「锚点」即**卡片渲染**：当 Markdown 中出现 \`\`\`language 围栏且 `language` 与某项的 `language` 匹配时，用该项的 `render(代码块源码)` 返回的 HTML 替换为**不可编辑**的卡片；`getMarkdown()` 时会还原为 \`\`\`language\n...\n\`\`\`，保证往返一致。

每项配置：`{ id: string, language: string, render: (source: string) => string | { html: string }, mount?: (element: HTMLElement, source: string) => void }`。`render` 返回 HTML 字符串或 `{ html }`，用于初次渲染卡片占位；可选 `mount(卡片根元素, 源码)` 在节点插入 DOM 后调用，可在该容器内挂载 **Vue / React** 等组件，实现交互式卡片。

**Vue / React 卡片示例**：`render` 返回一个空占位 div，在 `mount(el, source)` 里对 `el` 挂载组件即可。项目内提供 `src/anchors/vue-card.js`、`src/anchors/react-card.jsx` 示例，可直接作为 `anchors` 项引入。

```js
// Vue 3 卡片示例（需在页面引入 Vue；也可直接使用 src/anchors/vue-card.js）
anchors: [{
  id: 'vue-card',
  language: 'vue-card',
  render() { return '<div class="vue-card-mount"></div>'; },
  mount(el, source) {
    el.innerHTML = '';
    const app = Vue.createApp({ template: '<div class="my-vue-card">' + source + '</div>' });
    app.mount(el);
  },
}]

// React 18 卡片示例（需在页面引入 React、ReactDOM；也可直接使用 src/anchors/react-card.jsx）
anchors: [{
  id: 'react-card',
  language: 'react-card',
  render() { return '<div class="react-card-mount"></div>'; },
  mount(el, source) {
    el.innerHTML = '';
    const root = ReactDOM.createRoot(el);
    root.render(React.createElement('div', { className: 'my-react-card' }, source));
  },
}]
```

示例（仅 HTML 的卡片，如自定义 mermaid）：

```js
const editor = new YuStreamEditor({
  container: document.getElementById('editor-container'),
  anchors: [
    { id: 'mermaid', language: 'mermaid', render(source) { return '<div class="my-mermaid-card">' + source + '</div>'; } },
  ],
});
```

内置的 \`\`\`echarts 图表块逻辑独立于 anchors；若希望 echarts 也走锚点（卡片）流程，可设 `chartEnabled: false` 并添加 `{ id: 'echarts', language: 'echarts', render: ... }` 自行渲染。

示例：

```js
import { YuStreamEditor, DEFAULT_INSERT_TOOLS } from './Editor.js';

const editor = new YuStreamEditor({
  container: document.getElementById('editor-container'),
  tools: {
    insert: ['link', 'table', 'image'],  // 调整顺序并隐藏分割线
    insertExtra: [
      { id: 'custom', label: '自定义', title: '自定义操作', onClick(ed) { /* 使用 ed.getMarkdown()、ed.setMarkdown()、ed.exec() 等 */ } },
    ],
    bubbleExtra: [
      { id: 'strike', label: '删除线', onClick(ed) { ed.exec('strikeThrough'); } },
    ],
    tableExtra: [],
    imageExtra: [],
  },
});
```

### 更多扩展点

- **`options.dialog`**：自定义弹窗。若传入函数 `(opts) => Promise<Record<string, string> | null>`，插入图片/链接/表格时将调用该函数替代内置 `<dialog>`，`opts` 含 `title`、`fields`、`confirmText`、`cancelText`，返回表单值对象或 `null`（取消）。
- **`options.onPaste`**：自定义粘贴。`(e, editor) => boolean | void`，返回 `true` 时由调用方处理粘贴，内部不再执行默认逻辑。
- **`options.shortcuts`**：自定义快捷键。数组项为 `{ key, ctrlKey?, handler(editor) }`，与内置 Ctrl/Cmd+B/I/U 一起生效；`ctrlKey: true` 表示需要 Ctrl 或 Cmd 按下。

### Tooltip 配置

通过 `options.tooltips` 覆盖部分或全部提示文案，未传入的键使用默认值。可从 `Editor.js` 导入 `DEFAULT_TOOLTIPS` 查看全部 key：

```js
import { YuStreamEditor, DEFAULT_TOOLTIPS } from './Editor.js';

const editor = new YuStreamEditor({
  container: document.getElementById('editor-container'),
  tooltips: {
    editorPlaceholder: '请输入内容…',
    insertImage: '插入图片',
    insertTable: '插入表格',
    bubbleBold: '粗体',
    tableAddRow: '下方插入行',
    // 其他 key 见 DEFAULT_TOOLTIPS
  },
});
```

常用 key：`editorPlaceholder`、`insertImage`、`insertLink`、`insertTable`、`insertHr`、`bubbleFontName`、`bubbleFontSize`、`bubbleBold`、`bubbleItalic`、`bubbleUnderline`、`bubbleH1`～`bubbleH3`、`bubbleUl`、`bubbleOl`；表格相关 `tableBorder`、`tableAlign`、`tableAddRow`、`tableDelRow`、`tableAddCol`、`tableDelCol` 等；图片相关 `imageWidth`、`imageHeight`、`imageAlignLeft` / `Center` / `Right`。

### 钩子（hooks）

通过 `options.hooks` 在关键时机执行自定义逻辑，每个钩子会收到 `(editor)`（当前编辑器实例）：

| 钩子 | 调用时机 |
|------|----------|
| `beforeRender(editor)` | 清空 container 之前 |
| `afterRender(editor)` | 编辑区 DOM 插入 container 之后、事件绑定之前 |
| `onMount(editor)` | 事件绑定完成之后 |
| `onInit(editor)` | 初始化全部完成（只读等设置也已应用） |
| `onFocus(editor)` | 编辑区获得焦点 |
| `onBlur(editor)` | 编辑区失去焦点 |
| `onChange(editor)` | 内容变更（输入、粘贴、插入等） |

示例：

```js
const editor = new YuStreamEditor({
  container: document.getElementById('editor-container'),
  hooks: {
    onInit(editor) {
      console.log('编辑器就绪');
    },
    onFocus(editor) {
      console.log('获得焦点');
    },
    onChange(editor) {
      console.log('内容变更', editor.getMarkdown());
    },
  },
});
```

---

## API 摘要

### 内容与流式

| 方法 | 说明 |
|------|------|
| `getMarkdown()` | 将当前内容转为 Markdown 字符串；**导出为 Markdown 时，图表以 \`\`\`echarts 代码块形式保留，自定义卡片以 \`\`\`language 围栏保留，可正常渲染** |
| `setMarkdown(md)` | 将 Markdown 解析为 HTML 并写入编辑器 |
| `appendStreamChunk(chunk)` | 追加一段 Markdown 到流式缓冲并重新解析渲染（用于流式接口逐段返回） |
| `notifyChange()` | 通知内容已变更（触发 onChange 钩子），流式结束或程序化改内容后可由外部调用 |
| `resetStream()` | 清空流式缓冲（不清空编辑器 DOM） |
| `getStreamBuffer()` | 获取当前流式缓冲内容 |
| `clear()` | 清空编辑器内容并清空流式缓冲 |

### 插入与编辑

| 方法 | 说明 |
|------|------|
| `insertImage(url, width?, height?)` | 在光标处插入图片 |
| `insertLink(url, text?)` | 插入链接（有选区则把选区设为链接） |
| `insertTable(rows?, cols?)` | 在光标处插入表格（默认 3×3） |
| `insertHr()` | 插入分割线 |
| `undo()` / `redo()` | 撤销 / 重做 |
| `setHeading(level)` | 将选区设为标题（1～3） |

### 状态与只读

| 方法 | 说明 |
|------|------|
| `getWordCount()` | 获取纯文本字数（去空白） |
| `getMode()` | 返回当前模式：`'edit'` 或 `'readonly'` |
| `setMode(mode)` | 设置模式：`setMode('edit')` 编辑模式，`setMode('readonly')` 只读模式 |
| `setReadonly(flag)` | 设置 / 取消只读（与 `setMode('readonly'/'edit')` 等价） |
| `readonly` | 可读写的只读状态属性（`true` / `false`） |

---

## 流式用法示例

流式渲染由 `runStreamDemo(editor, source, options?)` 提供（定义在 `src/main.js`），执行过程中编辑器会变为只读，结束后恢复原状态。

**1. 字符串模拟（逐字/逐块）**

```js
// runStreamDemo 定义在 main.js，或从 main.js 导出后使用
await runStreamDemo(editor, '## 标题\n\n一段**加粗**文字。');
await runStreamDemo(editor, markdownString, { chunkSize: 3, delayMs: 50 });
```

**2. 真实流式接口（AsyncIterable）**

```js
async function* streamFromFetch() {
  const res = await fetch('/api/stream');
  const reader = res.body.pipeThrough(new TextDecoderStream())[Symbol.asyncIterator]();
  for await (const chunk of reader) yield chunk;
}
await runStreamDemo(editor, streamFromFetch());
```

**3. 手动逐段追加**

```js
editor.resetStream();
for (const chunk of someChunks) {
  editor.appendStreamChunk(chunk);
}
editor.notifyChange();
```

---

## ECharts 图表与生成提示词

编辑器支持在 Markdown 中使用 **\`\`\`echarts** 代码块，内容为 [ECharts option](https://echarts.apache.org/zh/option.html) 的 **JSON**，会渲染为图表。流式过程中与自定义锚点、图片一样，以统一「加载中…」占位展示，在 `setReadonly(false)` 时再替换为图表并挂载。

### 格式要求

- 代码块语言为 `echarts` 或 `chart`
- 内容必须是合法的 **JSON**（ECharts 的 option 对象），不支持 JavaScript 代码

示例（代码块语言写 `echarts`，内容为纯 JSON）：

````markdown
```echarts
{
  "xAxis": { "type": "category", "data": ["Mon", "Tue", "Wed"] },
  "yAxis": { "type": "value" },
  "series": [{ "data": [120, 200, 150], "type": "bar" }]
}
```
````

### 生成图表的提示词示例

给大模型或接口的提示词可参考下面，便于直接生成可渲染的 \`\`\`echarts 内容：

**通用说明（可放在系统提示或文档里）：**

> 在 Markdown 中插入图表时，请使用 \`\`\`echarts 代码块，块内只写 **一行合法 JSON**（或格式化多行），为 ECharts 的 option。不要写 JavaScript，不要写 \`option =\` 或 \`var option\`，只写纯 JSON 对象。例如柱状图：\`\`\`echarts\n{"xAxis":{"type":"category","data":["A","B","C"]},"yAxis":{"type":"value"},"series":[{"data":[10,20,15],"type":"bar"}]}\n\`\`\`

**按图表类型的提示词示例：**

| 需求 | 提示词示例 |
|------|------------|
| 饼图 | 请用 Markdown 写一段，包含一个 **饼图**。使用 \`\`\`echarts 代码块，内容为 ECharts option 的 **纯 JSON**，包含 `series: [{ type: "pie", data: [{ value, name }, ...] }]`，可加 `tooltip`、`legend`。 |
| 柱状图 | 请用 Markdown 写一段，包含一个 **柱状图**。使用 \`\`\`echarts 代码块，内容为 ECharts option 的 **纯 JSON**，包含 `xAxis: { type: "category", data: [...] }`、`yAxis: { type: "value" }`、`series: [{ type: "bar", data: [...] }]`。 |
| 折线图 | 请用 Markdown 写一段，包含一个 **折线图**。使用 \`\`\`echarts 代码块，内容为 ECharts option 的 **纯 JSON**，包含 `xAxis`、`yAxis`、`series: [{ type: "line", data: [...] }]`，可设 `xAxis.boundaryGap: false`。 |
| 多系列 | 在 \`\`\`echarts 的 JSON 里，`series` 写多个对象，例如两个折线：`"series": [{ "name": "销量", "type": "line", "data": [...] }, { "name": "成本", "type": "line", "data": [...] }]`。 |

**强调输出格式（避免模型输出成 JS）：**

> 输出时 \`\`\`echarts 代码块里**只能是 JSON 对象**，不要出现 \`option =\`、\`var\`、\`;\` 或注释。键名用英文双引号，例如：\`"series": [{"type": "bar", "data": [1,2,3]}]\`。

配置项 `chartEnabled` 为 `false` 时，\`\`\`echarts 会按普通代码块显示，不渲染成图表。

### 导出说明

- **导出为 Markdown**（`getMarkdown()`）：图表以 **\`\`\`echarts 代码块** 形式保留，**自定义卡片（锚点）** 以 **\`\`\`language** 围栏保留，图片以 **\![alt](url)** 语法保留；流式未结束时的占位节点也会被正确导出为对应 Markdown 语法。编辑器**仅支持 Markdown 的获取与设置**（`getMarkdown()` / `setMarkdown(md)`），不再提供 HTML 导出接口。

---

## 更新日志

### 近期修改（流式占位与内容 API 收敛）

- **流式占位统一**：流式输入时，\`\`\`echarts 图表、**自定义卡片（锚点）**（\`\`\`language）、以及 Markdown 图片 \`![alt](url)\` 不再边流式边渲染，而是先输出统一「加载中…」占位；在调用 `setReadonly(false)`（流式结束）时再一次性替换为真实 ECharts 图表、卡片与 \<img\>，避免每次 innerHTML 更新导致图表重挂、卡片重挂、图片重复加载。
- **移除 HTML 接口**：删除 `getHtml()`、`setHtml(html)` 及与之相关的图表转 base64 图片等逻辑；内容进出仅通过 `getMarkdown()` / `setMarkdown(md)`，保证以 Markdown 为单一数据源。
- **图片占位**：流式过程中的图片以占位节点（\`.yu-stream-editor-image-placeholder\`）展示，`getMarkdown()` 会将其正确导出为 \`![alt](url)\`。

---

## 样式与类名

所有编辑器相关样式类均以 `yu-stream-editor` 开头（如 `yu-stream-editor-editor`、`yu-stream-editor-bubble-toolbar`、`yu-stream-editor-insert-toolbar` 等），便于在页面中限定作用域，避免与宿主样式冲突。主题与布局可在 `main.css` 或业务样式里覆盖。

---

## 技术栈

- [Vite](https://vitejs.dev/) 构建
- [marked](https://github.com/markedjs/marked) Markdown 解析
- [turndown](https://github.com/mixmark-io/turndown) HTML 转 Markdown
- 原生 `contenteditable` + `execCommand` 实现富文本与表格操作

---

## 开发说明

- 示例 Markdown 在 `src/sampleMarkdown.js`，可按需替换或从接口获取。
- 卡片渲染示例：`src/anchors/vue-card.js`（Vue 3）、`src/anchors/react-card.jsx`（React 18），可在 `main.js` 中作为 `anchors` 传入编辑器。
- 本仓库将「模拟流式」按钮的文案简化为「模拟流式」；流式 API（`appendStreamChunk`、`resetStream`、`getStreamBuffer`）与 `getMarkdown` 在示例中挂到 `window` 上，便于控制台调试或外部脚本调用。



https://github.com/user-attachments/assets/52d7b07c-aa62-4cff-9cbc-d6f0fac44ead


