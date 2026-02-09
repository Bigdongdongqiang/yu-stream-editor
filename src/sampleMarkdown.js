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

![示例图片](https://gimg2.baidu.com/image_search/src=http%3A%2F%2Fimage109.360doc.com%2FDownloadImg%2F2025%2F04%2F0321%2F296122601_4_20250403090445718&refer=http%3A%2F%2Fimage109.360doc.com&app=2002&size=f9999,10000&q=a80&n=0&g=0n&fmt=auto?sec=1773207427&t=fa4dbd80a12cb1ca14eb71dc5d097588)

\`行内代码\` 与 \`\`\` 代码块 \`\`\` 均支持。

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
