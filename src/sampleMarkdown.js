/**
 * 流式演示用示例 Markdown
 * 可从外部替换为接口返回的流式内容，或在 main.js 中传入自定义字符串。
 */
export const SAMPLE_MARKDOWN = `## 流式渲染示例

这是一段**流式**传入的 Markdown，会逐步转为 HTML 显示。

- 列表项 1
- 列表项 2

| 列A | 列B | 列C |
|-----|-----|-----|
| a1  | b1  | c1  |
| a2  | b2  | c2  |

![示例图片](https://res.ennew.com/image/png/95c7ffa1fb5ada138890c01b56cc0fb9.png?optimize=true)

\`行内代码\` 与 \`\`\` 代码块 \`\`\` 均支持。

下面是自定义锚点示例（会渲染成不同卡片）：

\`\`\`notice
这是一条通过自定义锚点渲染的通知卡片。
支持多行内容，getMarkdown 时会还原为 \`\`\`notice 围栏。
\`\`\`

\`\`\`react-card
这是 **React** 组件卡片的内容区。
同样支持 Hooks 与交互。
\`\`\`

\`\`\`vue-card
这是 **Vue 3** 组件卡片的内容区。
可写多行，支持交互（如下方按钮计数）。
\`\`\`

下面是 \`\`\`echarts\`\`\` 示例：饼图、柱状图、折线图会直接渲染成图表。

**饼图**

\`\`\`echarts
{
  "tooltip": { "trigger": "item" },
  "legend": { "orient": "vertical", "left": "left" },
  "series": [{
    "name": "占比",
    "type": "pie",
    "radius": "50%",
    "data": [
      { "value": 1048, "name": "搜索" },
      { "value": 735, "name": "直接访问" },
      { "value": 580, "name": "邮件" },
      { "value": 484, "name": "联盟广告" },
      { "value": 300, "name": "视频" }
    ],
    "emphasis": { "itemStyle": { "shadowBlur": 10, "shadowOffsetX": 0, "shadowColor": "rgba(0, 0, 0, 0.5)" } }
  }]
}
\`\`\`

**柱状图**（可加 title、color、backgroundColor、grid 等任意 ECharts 配置）

\`\`\`echarts
{
  "title": { "text": "周销量", "left": "center", "textStyle": { "fontSize": 16 } },
  "backgroundColor": "#fafafa",
  "color": ["#5470c6", "#91cc75"],
  "xAxis": { "type": "category", "data": ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] },
  "yAxis": { "type": "value" },
  "series": [{ "data": [120, 200, 150, 80, 70, 110, 130], "type": "bar", "itemStyle": { "borderRadius": [4, 4, 0, 0] } }]
}
\`\`\`

**折线图**

\`\`\`echarts
{
  "xAxis": { "type": "category", "boundaryGap": false, "data": ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] },
  "yAxis": { "type": "value" },
  "series": [
    { "name": "销量", "type": "line", "stack": "Total", "data": [120, 132, 101, 134, 90, 230, 210] },
    { "name": "成本", "type": "line", "stack": "Total", "data": [220, 182, 191, 234, 290, 330, 310] }
  ]
}
\`\`\`
`;
