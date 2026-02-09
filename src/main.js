/**
 * 入口与演示逻辑
 * - 创建 YuStreamEditor 并挂载到 #editor-container
 * - 模拟流式按钮：调用 runStreamDemo(editor, SAMPLE_MARKDOWN)
 * - 清空按钮：editor.clear()
 * - 将 appendStreamChunk、resetStream、getHtml、getMarkdown 挂到 window 便于控制台调试
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
const editor = new YuStreamEditor({ container: editorContainer });

const streamDemoBtn = document.getElementById('streamDemo');
const clearBtn = document.getElementById('clearEditor');
const getMarkdownBtn = document.getElementById('getMarkdown');
const getHtmlBtn = document.getElementById('getHtml');
const applyMarkdownBtn = document.getElementById('applyMarkdown');
const markdownInputEl = document.getElementById('markdown-input');

function applyMarkdownToEditor() {
    if (!markdownInputEl) return;
    const md = markdownInputEl.value.trim();
    editor.setMarkdown(md || '');
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
if (getHtmlBtn) {
    getHtmlBtn.addEventListener('click', async () => {
        const html = editor.getHtml();
        try {
            await navigator.clipboard.writeText(html);
            alert('已复制 HTML 到剪贴板');
        } catch {
            console.log('HTML:\n', html);
            alert('已输出到控制台（复制失败时）');
        }
    });
}

window.appendStreamChunk = (chunk) => editor.appendStreamChunk(chunk);
window.resetStream = () => editor.resetStream();
window.getStreamBuffer = () => editor.getStreamBuffer();
window.getHtml = () => editor.getHtml();
window.getMarkdown = () => editor.getMarkdown();

export { editor, YuStreamEditor, runStreamDemo };
