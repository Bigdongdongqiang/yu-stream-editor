/**
 * 入口与演示逻辑
 * - 创建 YuStreamEditor 并挂载到 #editor-container
 * - 模拟流式按钮：调用 runStreamDemo(editor, SAMPLE_MARKDOWN)
 * - 清空按钮：editor.clear()
 * - 将 appendStreamChunk、resetStream、getMarkdown、getHtml 挂到 window 便于控制台调试
 */
import { YuStreamEditor } from './Editor.js';
import { SAMPLE_MARKDOWN } from './sampleMarkdown.js';

/**
 * 流式渲染：支持字符串模拟或异步迭代器。执行过程中编辑器只读，结束后恢复。
 * @param {YuStreamEditor} editor - 编辑器实例
 * @param {string | AsyncIterable<string>} source - 字符串则按块模拟；AsyncIterable 则逐 chunk 追加
 * @param {{ chunkSize?: number, delayMs?: number }} [options] - chunkSize 块长度，delayMs 块间延迟(ms)，仅 source 为 string 时有效
 */
async function runStreamDemo(editor, source, options = {}) {
    if (!editor?.appendStreamChunk) return;
    const wasReadonly = editor.getMode() === 'readonly';
    editor.setReadonly(true);
    editor.resetStream();
    const chunkSize = options.chunkSize ?? 2;
    const delayMs = options.delayMs ?? 25;
    try {
        if (typeof source === 'string') {
            for (let i = 0; i < source.length; i += chunkSize) {
                editor.appendStreamChunk(source.slice(i, i + chunkSize));
                await new Promise((r) => setTimeout(r, delayMs));
            }
        } else if (source && typeof source[Symbol.asyncIterator] === 'function') {
            for await (const chunk of source) {
                if (typeof chunk === 'string') editor.appendStreamChunk(chunk);
            }
        }
        editor.notifyChange();
    } finally {
        editor.setReadonly(wasReadonly);
    }
}

const editorContainer = document.getElementById('editor-container');

// YuStreamEditor 实例化时支持的全部选项（以下为完整列表，按需传入）
const editorOptions = {
    container: editorContainer,                    // HTMLElement，必填，挂载编辑器的容器（缺省回退到 #app）
    tooltips: {},                                 // Object，覆盖默认 tooltip/placeholder，键见 Editor.js 的 DEFAULT_TOOLTIPS（如 editorPlaceholder、imageWidth、tableBorder 等）
    tools: {
        insert: ['image', 'link', 'table', 'hr'], // string[]，插入栏工具 id 及顺序
        insertExtra: [],                           // Array<{ id, label, title?, onClick(ed) }>，插入栏扩展按钮
        bubbleExtra: [],                            // Array<{ id, label, title?, onClick(ed) }>，气泡栏扩展按钮
        tableExtra: [],                             // Array<{ id, label, title?, onClick(ed) }>，表格栏扩展按钮（选中表格时显示）
        imageExtra: [],                             // Array<{ id, label, title?, onClick(ed) }>，图片栏扩展按钮（选中图片时显示）
    },
    dialog: undefined,                             // function(opts): Promise<Object|null>，自定义弹窗，替代内置 dialog
    onPaste: undefined,                            // function(e, editor): boolean|void，粘贴钩子，返回 true 时由调用方处理
    shortcuts: [],                                 // Array<{ key, ctrlKey?, metaKey?, handler(editor) }>，自定义快捷键
    hooks: {},                                     // Object，钩子：onInit、onMount、beforeRender、afterRender、onFocus、onBlur、onChange
    maxLength: 0,                                  // number，最大字数（0 表示不限制）
    pastePlainText: false,                         // boolean，粘贴时是否转为纯文本
    chartEnabled: true,                            // boolean，是否将 ```echarts 渲染为图表（false 时按代码块显示）
    readonly: false,                               // boolean，是否只读（与 mode 二选一）
    mode: 'edit',                                 // 'edit' | 'readonly'，模式，优先于 readonly
};

const editor = new YuStreamEditor(editorOptions);

const streamDemoBtn = document.getElementById('streamDemo');
const clearBtn = document.getElementById('clearEditor');
const getMarkdownBtn = document.getElementById('getMarkdown');
const getHtmlBtn = document.getElementById('getHtml');
const applyMarkdownBtn = document.getElementById('applyMarkdown');
const applyHtmlBtn = document.getElementById('applyHtml');
const markdownInputEl = document.getElementById('markdown-input');
const htmlInputEl = document.getElementById('html-input');

function applyMarkdownToEditor() {
    if (!markdownInputEl) return;
    const md = markdownInputEl.value.trim();
    editor.setMarkdown(md || '');
}

function applyHtmlToEditor() {
    if (!htmlInputEl) return;
    const html = htmlInputEl.value.trim();
    editor.setHtml(html || '');
}

if (streamDemoBtn) {
    streamDemoBtn.addEventListener('click', async () => {
        streamDemoBtn.disabled = true;
        await runStreamDemo(editor, SAMPLE_MARKDOWN);
        streamDemoBtn.disabled = false;
    });
}
if (clearBtn) {
    clearBtn.addEventListener('click', () => editor.clear());
}
if (getMarkdownBtn) {
    getMarkdownBtn.addEventListener('click', async () => {
        const md = editor.getMarkdown();
        if (markdownInputEl) markdownInputEl.value = md;
        try {
            console.log('Markdown:', md);
            await navigator.clipboard.writeText(md);
            alert('已复制 Markdown 到剪贴板');
        } catch {
            console.log('Markdown:\n', md);
            alert('已输出到控制台（复制失败时）');
        }
    });
}
if (getHtmlBtn) {
    getHtmlBtn.addEventListener('click', async () => {
        const html = editor.getHtml();
        if (htmlInputEl) htmlInputEl.value = html;
        try {
            await navigator.clipboard.writeText(html);
            alert('已复制 HTML 到剪贴板（图表已转为 base64 图片）');
        } catch {
            console.log('HTML:\n', html);
            alert('已输出到控制台（复制失败时）');
        }
    });
}
if (applyHtmlBtn) {
    applyHtmlBtn.addEventListener('click', () => applyHtmlToEditor());
}
if (applyMarkdownBtn) {
    applyMarkdownBtn.addEventListener('click', () => applyMarkdownToEditor());
}
if (markdownInputEl) {
    let applyMarkdownTimer;
    markdownInputEl.addEventListener('input', () => {
        clearTimeout(applyMarkdownTimer);
        applyMarkdownTimer = setTimeout(() => applyMarkdownToEditor(), 600);
    });
}
window.appendStreamChunk = (chunk) => editor.appendStreamChunk(chunk);
window.resetStream = () => editor.resetStream();
window.getStreamBuffer = () => editor.getStreamBuffer();
window.getMarkdown = () => editor.getMarkdown();
window.getHtml = () => editor.getHtml();

export { editor, YuStreamEditor, runStreamDemo };
