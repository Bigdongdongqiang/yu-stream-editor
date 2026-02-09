/**
 * Yu流式编辑器核心模块
 * - 基于 contenteditable + execCommand 的富文本编辑
 * - 支持流式 Markdown（appendStreamChunk）实时转 HTML
 * - 浮动工具栏：选中文字气泡栏、光标处插入栏、表格栏、图片栏
 * - 可配置 tooltips、hooks、只读/编辑模式，样式类统一前缀 yu-stream-editor
 * - 支持 ```echarts 代码块：JSON 配置直接渲染为 ECharts 图表
 */
import { marked } from 'marked';
import TurndownService from 'turndown';
import { tables as turndownPluginGfmTables } from 'turndown-plugin-gfm';
import * as echarts from 'echarts';

// Markdown 解析：启用 GFM、换行转 <br>
marked.setOptions({ gfm: true, breaks: true });

// ```echarts 代码块：chartRenderAsChart 为 false 时（流式过程）渲染为代码块，否则渲染为图表占位（各实例在 parse 前设置 marked.defaults.chartRenderAsChart）
marked.use({
    renderer: {
        code(code, infostring, escaped) {
            if (this.options.chartEnabled === false) return false;
            const lang = (infostring || '').trim().toLowerCase();
            if (lang === 'echarts' || lang === 'chart') {
                try {
                    const option = JSON.parse(code.trim());
                    const optionBase64 = btoa(unescape(encodeURIComponent(JSON.stringify(option))));
                    if (this.options.chartRenderAsChart === false) {
                        const pretty = JSON.stringify(option, null, 2);
                        const escapedCode = pretty.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                        return `<pre class="yu-stream-editor-echarts-pending" contenteditable="false" data-echarts-option="${optionBase64}"><code>${escapedCode}</code></pre>`;
                    }
                    return `<div class="yu-stream-editor-echarts-wrap" contenteditable="false" data-echarts-option="${optionBase64}"><span class="yu-stream-editor-echarts-data" style="display:none !important" data-echarts-option="${optionBase64}" aria-hidden="true"></span><div class="yu-stream-editor-echarts-container" style="width:100%;height:300px"></div></div>`;
                } catch (_) { /* 非合法 JSON 时按普通代码块显示 */ }
            }
            return false;
        }
    }
});

// HTML 转 Markdown 用（getMarkdown）
const turndownService = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });
turndownService.use(turndownPluginGfmTables); // 表格转为 GFM Markdown（| 列 | 列 | \n|---|---|）

// 流式过程中产生的 .yu-stream-editor-echarts-pending 导出为 ```echarts 代码块
turndownService.addRule('echartsPending', {
    filter: (node) => node.nodeName === 'PRE' && node.classList?.contains('yu-stream-editor-echarts-pending'),
    replacement: (_content, node) => {
        const optBase64 = node.getAttribute('data-echarts-option');
        if (!optBase64) return '';
        try {
            const opt = decodeURIComponent(escape(atob(optBase64)));
            return '\n\n```echarts\n' + opt + '\n```\n\n';
        } catch (_) { return ''; }
    }
});

// 气泡栏「字体」下拉选项
const FONT_OPTIONS = [
    { value: '', label: '默认' },
    { value: 'SimSun', label: '宋体' },
    { value: 'SimHei', label: '黑体' },
    { value: 'Microsoft YaHei', label: '微软雅黑' },
    { value: 'KaiTi', label: '楷体' },
    { value: 'FangSong', label: '仿宋' },
    { value: 'monospace', label: '等宽' },
];

// 气泡栏「字号」下拉选项（value 对应 font size 1–7）
const FONT_SIZE_OPTIONS = [
    { value: '1', label: '12px' },
    { value: '2', label: '14px' },
    { value: '3', label: '16px' },
    { value: '4', label: '18px' },
    { value: '5', label: '24px' },
    { value: '6', label: '32px' },
    { value: '7', label: '48px' },
];

// 表格栏「边框」下拉选项
const BORDER_OPTIONS = [
    { value: 'full', label: '完整边框' },
    { value: 'outer', label: '仅外框' },
    { value: 'none', label: '无边框' },
];

// 表格栏「对齐」下拉选项（表格整体左/中/右）
const ALIGN_OPTIONS = [
    { value: '', label: '默认' },
    { value: 'left', label: '居左' },
    { value: 'center', label: '居中' },
    { value: 'right', label: '居右' },
];

/**
 * 将 rgb(r,g,b) 转为 #rrggbb，用于颜色选择器与表格边框色同步。
 * 已是 # 开头或非 rgb 格式则原样返回或返回 null。
 */
function rgbToHex(rgb) {
    if (!rgb || rgb.startsWith('#')) return rgb;
    const m = rgb.match(/^rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/);
    if (!m) return null;
    const hex = (n) => parseInt(n, 10).toString(16).padStart(2, '0');
    return '#' + hex(m[1]) + hex(m[2]) + hex(m[3]);
}

/**
 * 创建 DOM 元素。
 * attrs：className、dataset、style(对象)、on* 事件；其余作为 setAttribute。
 * children：字符串会转为文本节点，否则作为子节点 append。
 */
function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => {
        if (k === 'className') node.className = v;
        else if (k === 'dataset') Object.assign(node.dataset, v);
        else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
        else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
        else if (v != null && v !== false) node.setAttribute(k === 'htmlFor' ? 'for' : k, v);
    });
    children.forEach((c) => node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c));
    return node;
}

/** 创建 <select>，options 为 { value, label }[]，用于字体/字号/边框/对齐等下拉框 */
function select(options, attrs = {}) {
    const s = el('select', attrs);
    options.forEach(({ value, label }) => s.appendChild(el('option', { value }, [label])));
    return s;
}

/** 默认 tooltip/placeholder 文案，可通过 new YuStreamEditor({ tooltips: { ... } }) 覆盖 */
const DEFAULT_TOOLTIPS = {
    editorPlaceholder: '在此输入或粘贴内容，也可使用工具栏格式化选中文字、修改表格样式。',
    imageWidth: '宽度（如 200px 或 50%）',
    imageHeight: '高度（如 100px，留空自动）',
    imageAlignLeft: '居左',
    imageAlignCenter: '居中',
    imageAlignRight: '居右',
    tableBorder: '表格边框',
    tableAlign: '单元格对齐',
    tableBorderColor: '边框颜色',
    tableAlignLeft: '居左',
    tableAlignCenter: '居中',
    tableAlignRight: '居右',
    tableAddRow: '下方插入行',
    tableDelRow: '删除当前行',
    tableAddCol: '右侧插入列',
    tableDelCol: '删除当前列',
    tableLabel: '表格',
    tableAlignLabel: '对齐',
    tableColorLabel: '边框色',
    bubbleFontName: '字体',
    bubbleFontSize: '字号',
    bubbleFontColor: '文字颜色',
    bubbleBold: '粗体',
    bubbleItalic: '斜体',
    bubbleUnderline: '下划线',
    bubbleH1: '一级标题',
    bubbleH2: '二级标题',
    bubbleH3: '三级标题',
    bubbleUl: '无序列表',
    bubbleOl: '有序列表',
    insertImage: '插入图片',
    insertLink: '插入链接',
    insertTable: '插入表格',
    insertHr: '分割线',
};

/** 插入栏默认工具 id 列表，可通过 options.tools.insert 覆盖顺序或隐藏某项 */
const DEFAULT_INSERT_TOOLS = ['image', 'link', 'table', 'hr'];

/**
 * Yu流式编辑器：DOM 由类内部生成，支持流式 Markdown、字体工具框、表格操作框。
 * @param {Object} options
 * @param {Object} [options.tooltips] - 覆盖默认 tooltip/placeholder，键见 DEFAULT_TOOLTIPS
 * @param {Object} [options.tools] - 工具栏可配置与扩展：insert(插入栏项及顺序)、insertExtra(插入栏扩展按钮)、bubbleExtra(气泡栏扩展按钮)
 * @param {string[]} [options.tools.insert] - 插入栏工具 id 及顺序，如 ['image','link','table','hr']，缺省四项全显示
 * @param {Array<{ id: string, label: string, title?: string, onClick: function(YuStreamEditor) }>} [options.tools.insertExtra] - 插入栏追加的自定义按钮
 * @param {Array<{ id: string, label: string, title?: string, onClick: function(YuStreamEditor) }>} [options.tools.bubbleExtra] - 气泡栏追加的自定义按钮
 * @param {Array<{ id: string, label: string, title?: string, onClick: function(YuStreamEditor) }>} [options.tools.tableExtra] - 表格栏追加的自定义按钮（选中表格时显示）
 * @param {Array<{ id: string, label: string, title?: string, onClick: function(YuStreamEditor) }>} [options.tools.imageExtra] - 图片栏追加的自定义按钮（选中图片时显示）
 * @param {function(Object): Promise<Object|null>} [options.dialog] - 自定义弹窗，替代内置 dialog；参数同 _showDialog 的 opts，返回 Promise<表单值对象|null>
 * @param {function(Event, YuStreamEditor): boolean|void} [options.onPaste] - 粘贴钩子；若返回 true 则由调用方处理粘贴（内部不再处理）
 * @param {Array<{ key: string, ctrlKey?: boolean, metaKey?: boolean, handler: function(YuStreamEditor) }} [options.shortcuts] - 自定义快捷键，与内置 Ctrl+B/I/U 一并生效
 * @param {Object} [options.hooks] - 钩子：onInit(editor)、onMount(editor)、beforeRender(editor)、afterRender(editor)、onFocus(editor)、onBlur(editor)、onChange(editor)
* @param {boolean} [options.chartEnabled=true] - 是否将 \`\`\`echarts 代码块渲染为图表；设为 false 时按普通代码块显示
   * @param {boolean} [options.readonly] - 是否只读（与 mode 二选一）
   * @param {'edit'|'readonly'} [options.mode] - 模式：'edit' 编辑模式，'readonly' 只读模式；优先于 options.readonly
 */
export class YuStreamEditor {
    constructor(options = {}) {
        // ---------- 容器与配置 ----------
        this.container = options.container ?? document.getElementById('app');
        this.options = options;
        this.tooltips = { ...DEFAULT_TOOLTIPS, ...(options.tooltips || {}) };
        // 工具栏配置：插入栏顺序、各栏扩展按钮
        this.toolConfig = {
            insert: options.tools?.insert ?? DEFAULT_INSERT_TOOLS.slice(),
            insertExtra: options.tools?.insertExtra ?? [],
            bubbleExtra: options.tools?.bubbleExtra ?? [],
            tableExtra: options.tools?.tableExtra ?? [],
            imageExtra: options.tools?.imageExtra ?? [],
        };
        this.hooks = options.hooks || {};
        this.maxLength = options.maxLength ?? 0;
        this.pastePlainText = options.pastePlainText ?? false;
        this.chartEnabled = options.chartEnabled !== false;  // 是否将 ```echarts 渲染为图表，默认 true

        // ---------- 内部状态 ----------
        this.streamBuffer = '';           // 流式 Markdown 累积缓冲
        this.savedRange = null;           // 点击工具栏前保存的选区
        this.tableToolbarCurrentTable = null;
        this.imageToolbarCurrentImage = null;
        this._lastClickedImage = null;     // 用于点击图片后仍能识别当前图片

        // 只读由 options.mode / options.readonly 或 setMode() / setReadonly() 设置
        const modeOpt = options.mode;
        this._isReadonly = modeOpt !== undefined
            ? modeOpt === 'readonly'
            : !!options.readonly;

        // 预绑定供 addEventListener 使用，避免重复创建函数
        this._boundSaveSelection = this.saveSelection.bind(this);
        this._boundUpdateBubble = this.updateBubbleToolbar.bind(this);
        this._boundUpdateTable = this.updateTableToolbar.bind(this);
        this._scrollRafId = null;
        this._boundSyncToolbarsOnScroll = () => {
            if (this._scrollRafId != null) return;
            this._scrollRafId = requestAnimationFrame(() => {
                this._scrollRafId = null;
                this.updateBubbleToolbar();
                this.updateInsertToolbar();
                this.updateTableToolbar();
                this.updateImageToolbar();
            });
        };

        // ---------- 渲染与挂载流程 ----------
        if (this.container) {
            this._callHook('beforeRender');
            this.render();                  // 清空容器并创建编辑区 + 各工具栏 DOM
            this._callHook('afterRender');
            this.mount();                   // 绑定选区、工具栏、粘贴、快捷键、钩子等
            this._callHook('onMount');
            if (this._isReadonly) this.setReadonly(true);
            this._callHook('onInit');
        }
    }

    /** 调用配置的钩子，若存在则执行 hooks[name](this, ...args) */
    _callHook(name, ...args) {
        const fn = this.hooks[name];
        if (typeof fn === 'function') fn(this, ...args);
    }

    /** 显示弹窗：若配置了 options.dialog 则调用之，否则使用内置 _showDialog */
    _showDialogOrCustom(opts) {
        if (typeof this.options.dialog === 'function') return this.options.dialog(opts);
        return this._showDialog(opts);
    }

    /**
     * 显示表单弹窗（原生 <dialog>），返回 Promise<表单值对象 | null>，取消或关闭为 null。
     * @param {{ title: string, fields: Array<{ name: string, label: string, type?: string, placeholder?: string, value?: string }>, confirmText?: string, cancelText?: string }} opts
     */
    _showDialog(opts) {
        const { title, fields, confirmText = '确定', cancelText = '取消' } = opts;
        const dialog = document.createElement('dialog');
        dialog.className = 'yu-stream-editor-dialog';
        const form = document.createElement('form');
        form.method = 'dialog';

        // 标题
        const titleEl = document.createElement('div');
        titleEl.className = 'yu-stream-editor-dialog-title';
        titleEl.textContent = title;
        form.appendChild(titleEl);

        // 表单项：每个 field 一个 label + input
        const body = document.createElement('div');
        body.className = 'yu-stream-editor-dialog-body';
        fields.forEach((f) => {
            const label = document.createElement('label');
            label.className = 'yu-stream-editor-dialog-label';
            label.textContent = f.label;
            const input = document.createElement('input');
            input.type = f.type || 'text';
            input.name = f.name;
            if (f.placeholder) input.placeholder = f.placeholder;
            if (f.value != null) input.value = f.value;
            input.className = 'yu-stream-editor-dialog-input';
            body.appendChild(label);
            body.appendChild(input);
        });
        form.appendChild(body);

        // 底部按钮：取消 + 确定
        const actions = document.createElement('div');
        actions.className = 'yu-stream-editor-dialog-actions';
        const submitBtn = document.createElement('button');
        submitBtn.type = 'submit';
        submitBtn.className = 'yu-stream-editor-dialog-btn yu-stream-editor-dialog-btn-primary';
        submitBtn.textContent = confirmText;
        const cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.className = 'yu-stream-editor-dialog-btn';
        cancelBtn.textContent = cancelText;
        cancelBtn.addEventListener('click', () => dialog.close('cancel'));
        actions.appendChild(cancelBtn);
        actions.appendChild(submitBtn);
        form.appendChild(actions);
        dialog.appendChild(form);
        document.body.appendChild(dialog);

        // Promise：关闭时根据 returnValue 收集表单值或 resolve(null)
        return new Promise((resolve) => {
            const done = (result) => {
                dialog.remove();
                resolve(result);
            };
            dialog.addEventListener('close', () => {
                if (dialog.returnValue === 'confirm') {
                    const data = {};
                    fields.forEach((f) => {
                        const input = form.querySelector(`[name="${f.name}"]`);
                        if (input) data[f.name] = input.value ?? '';
                    });
                    done(data);
                } else {
                    done(null);
                }
            });
            dialog.addEventListener('cancel', (e) => { e.preventDefault(); done(null); });
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                dialog.returnValue = 'confirm';
                dialog.close('confirm');
            });
            dialog.showModal();
        });
    }

    /** 清空容器并渲染编辑区 DOM（编辑区 + 各浮动工具栏），由 constructor 调用 */
    render() {
        this.container.innerHTML = '';
        const editorWrap = this._createEditorWrap();
        this.container.append(editorWrap);
    }

    /**
     * 创建编辑区包裹节点：contenteditable 编辑区 + 四个浮动工具栏（表格/图片/插入/气泡）。
     * 工具栏初始为隐藏，由 update*Toolbar 根据选区显示并定位。
     */
    _createEditorWrap() {
        const editor = el('div', {
            className: 'yu-stream-editor-editor',
            contenteditable: 'true',
            dataset: { placeholder: this.tooltips.editorPlaceholder },
        });

        const tableToolbar = this._createTableToolbar();
        const bubbleToolbar = this._createBubbleToolbar();
        const imageToolbar = this._createImageToolbar();
        const insertToolbar = this._createInsertToolbar();

        this.editor = editor;
        this.tableToolbar = tableToolbar;
        this.bubbleToolbar = bubbleToolbar;
        this.imageToolbar = imageToolbar;
        this.insertToolbar = insertToolbar;

        const wrap = el('div', { className: 'yu-stream-editor-editor-wrap' }, [editor, tableToolbar, imageToolbar, insertToolbar, bubbleToolbar]);
        return wrap;
    }

    /**
     * 创建选中图片时的浮动工具栏：宽度/高度输入框、居左/居中/居右按钮，末尾追加 imageExtra 自定义按钮。
     */
    _createImageToolbar() {
        const t = this.tooltips;
        const label = (text) => el('span', { className: 'yu-stream-editor-image-toolbar-label' }, [text]);

        const imageToolbarWidth = el('input', { type: 'text', className: 'yu-stream-editor-image-toolbar-width', placeholder: '宽度', title: t.imageWidth });
        const imageToolbarHeight = el('input', { type: 'text', className: 'yu-stream-editor-image-toolbar-height', placeholder: '高度', title: t.imageHeight });
        const imageToolbarAlignLeft = el('button', { type: 'button', className: 'yu-stream-editor-image-toolbar-align-left', title: t.imageAlignLeft }, ['居左']);
        const imageToolbarAlignCenter = el('button', { type: 'button', className: 'yu-stream-editor-image-toolbar-align-center', title: t.imageAlignCenter }, ['居中']);
        const imageToolbarAlignRight = el('button', { type: 'button', className: 'yu-stream-editor-image-toolbar-align-right', title: t.imageAlignRight }, ['居右']);

        this.imageToolbarWidth = imageToolbarWidth;
        this.imageToolbarHeight = imageToolbarHeight;
        this.imageToolbarAlignLeft = imageToolbarAlignLeft;
        this.imageToolbarAlignCenter = imageToolbarAlignCenter;
        this.imageToolbarAlignRight = imageToolbarAlignRight;

        const alignBtns = el('div', { className: 'yu-stream-editor-image-toolbar-align-btns' }, [
            imageToolbarAlignLeft,
            imageToolbarAlignCenter,
            imageToolbarAlignRight,
        ]);

        this._imageExtraButtons = [];
        const imageChildren = [
            label('图片'),
            label('宽度'), imageToolbarWidth,
            label('高度'), imageToolbarHeight,
            label('对齐'), alignBtns,
        ];
        for (const item of this.toolConfig.imageExtra) {
            const btn = el('button', { type: 'button', className: 'yu-stream-editor-image-toolbar-extra', title: item.title ?? '' }, [item.label]);
            this._imageExtraButtons.push({ el: btn, onClick: item.onClick });
            imageChildren.push(btn);
        }
        return el('div', { className: 'yu-stream-editor-image-toolbar', 'aria-hidden': 'true' }, imageChildren);
    }

    /**
     * 创建选中表格时的浮动工具栏：边框类型、对齐、边框色、居左/中/右、+行/-行/+列/-列，末尾追加 tableExtra 自定义按钮。
     */
    _createTableToolbar() {
        const t = this.tooltips;
        const tableToolbarBorder = select(BORDER_OPTIONS, { title: t.tableBorder });
        const tableToolbarAlign = select(ALIGN_OPTIONS, { title: t.tableAlign });
        const tableToolbarBorderColor = el('input', { type: 'color', value: '#cccccc', title: t.tableBorderColor });
        const tableToolbarAlignLeftBtn = el('button', { type: 'button', title: t.tableAlignLeft }, ['居左']);
        const tableToolbarAlignCenterBtn = el('button', { type: 'button', title: t.tableAlignCenter }, ['居中']);
        const tableToolbarAlignRightBtn = el('button', { type: 'button', title: t.tableAlignRight }, ['居右']);

        this.tableToolbarBorder = tableToolbarBorder;
        this.tableToolbarAlign = tableToolbarAlign;
        this.tableToolbarBorderColor = tableToolbarBorderColor;
        this.tableToolbarAlignLeftBtn = tableToolbarAlignLeftBtn;
        this.tableToolbarAlignCenterBtn = tableToolbarAlignCenterBtn;
        this.tableToolbarAlignRightBtn = tableToolbarAlignRightBtn;

        const alignBtns = el('div', { className: 'yu-stream-editor-table-toolbar-align-btns' }, [
            tableToolbarAlignLeftBtn,
            tableToolbarAlignCenterBtn,
            tableToolbarAlignRightBtn,
        ]);

        const addRowBtn = el('button', { type: 'button', title: t.tableAddRow }, ['+行']);
        const delRowBtn = el('button', { type: 'button', title: t.tableDelRow }, ['-行']);
        const addColBtn = el('button', { type: 'button', title: t.tableAddCol }, ['+列']);
        const delColBtn = el('button', { type: 'button', title: t.tableDelCol }, ['-列']);
        this._tableAddRowBtn = addRowBtn;
        this._tableDelRowBtn = delRowBtn;
        this._tableAddColBtn = addColBtn;
        this._tableDelColBtn = delColBtn;

        this._tableExtraButtons = [];
        const barChildren = [
            el('span', { className: 'yu-stream-editor-table-toolbar-label' }, [t.tableLabel]),
            tableToolbarBorder,
            el('span', { className: 'yu-stream-editor-table-toolbar-label' }, [t.tableAlignLabel]),
            tableToolbarAlign,
            alignBtns,
            el('label', { className: 'yu-stream-editor-table-toolbar-color-label' }, [t.tableColorLabel]),
            tableToolbarBorderColor,
            el('span', { className: 'yu-stream-editor-table-toolbar-sep' }),
            addRowBtn, delRowBtn, addColBtn, delColBtn,
        ];
        for (const item of this.toolConfig.tableExtra) {
            barChildren.push(el('span', { className: 'yu-stream-editor-table-toolbar-sep' }));
            const btn = el('button', { type: 'button', title: item.title ?? '' }, [item.label]);
            this._tableExtraButtons.push({ el: btn, onClick: item.onClick });
            barChildren.push(btn);
        }
        return el('div', { className: 'yu-stream-editor-table-toolbar', 'aria-hidden': 'true' }, barChildren);
    }

    /**
     * 创建选中文字时的气泡工具栏：字体/字号/颜色、B/I/U、H1/H2/H3、无序/有序列表，末尾追加 bubbleExtra 自定义按钮。
     */
    _createBubbleToolbar() {
        const t = this.tooltips;
        const bubbleFontName = select(FONT_OPTIONS, { className: 'yu-stream-editor-bubble-font-name', title: t.bubbleFontName });
        const bubbleFontSize = select(FONT_SIZE_OPTIONS, { className: 'yu-stream-editor-bubble-font-size', title: t.bubbleFontSize });
        const bubbleFontColor = el('input', { type: 'color', className: 'yu-stream-editor-bubble-font-color', value: '#000000', title: t.bubbleFontColor });
        const bubbleBoldBtn = el('button', { type: 'button', className: 'yu-stream-editor-bubble-bold', title: t.bubbleBold }, ['B']);
        const bubbleItalicBtn = el('button', { type: 'button', className: 'yu-stream-editor-bubble-italic', title: t.bubbleItalic }, ['I']);
        const bubbleUnderlineBtn = el('button', { type: 'button', className: 'yu-stream-editor-bubble-underline', title: t.bubbleUnderline }, ['U']);
        const sep = () => el('span', { className: 'yu-stream-editor-bubble-toolbar-sep' });
        const h1Btn = el('button', { type: 'button', className: 'yu-stream-editor-bubble-extra-btn', title: t.bubbleH1 }, ['H1']);
        const h2Btn = el('button', { type: 'button', className: 'yu-stream-editor-bubble-extra-btn', title: t.bubbleH2 }, ['H2']);
        const h3Btn = el('button', { type: 'button', className: 'yu-stream-editor-bubble-extra-btn', title: t.bubbleH3 }, ['H3']);
        const ulBtn = el('button', { type: 'button', className: 'yu-stream-editor-bubble-extra-btn', title: t.bubbleUl }, ['无序']);
        const olBtn = el('button', { type: 'button', className: 'yu-stream-editor-bubble-extra-btn', title: t.bubbleOl }, ['有序']);

        this.bubbleFontName = bubbleFontName;
        this.bubbleFontSize = bubbleFontSize;
        this.bubbleFontColor = bubbleFontColor;
        this.bubbleBoldBtn = bubbleBoldBtn;
        this.bubbleItalicBtn = bubbleItalicBtn;
        this.bubbleUnderlineBtn = bubbleUnderlineBtn;
        this._bubbleH1Btn = h1Btn;
        this._bubbleH2Btn = h2Btn;
        this._bubbleH3Btn = h3Btn;
        this._bubbleUlBtn = ulBtn;
        this._bubbleOlBtn = olBtn;

        this._bubbleExtraButtons = [];
        const bubbleChildren = [
            bubbleFontName, bubbleFontSize, bubbleFontColor,
            bubbleBoldBtn, bubbleItalicBtn, bubbleUnderlineBtn, sep(),
            h1Btn, h2Btn, h3Btn, sep(),
            ulBtn, olBtn,
        ];
        for (const item of this.toolConfig.bubbleExtra) {
            const btn = el('button', { type: 'button', className: 'yu-stream-editor-bubble-extra-btn', title: item.title ?? '' }, [item.label]);
            this._bubbleExtraButtons.push({ el: btn, onClick: item.onClick });
            bubbleChildren.push(sep());
            bubbleChildren.push(btn);
        }
        return el('div', { className: 'yu-stream-editor-bubble-toolbar', 'aria-hidden': 'true' }, bubbleChildren);
    }

    /**
     * 创建光标处插入工具栏：按 toolConfig.insert 顺序创建内置按钮（图片/链接/表格/分割线），再追加 insertExtra 自定义按钮。
     */
    _createInsertToolbar() {
        const t = this.tooltips;
        const labels = { image: '图片', link: '链接', table: '表格', hr: '分割线' };
        const titles = { image: t.insertImage, link: t.insertLink, table: t.insertTable, hr: t.insertHr };
        const children = [];
        for (const id of this.toolConfig.insert) {
            if (!labels[id]) continue;
            const btn = el('button', { type: 'button', className: 'yu-stream-editor-insert-toolbar-btn', title: titles[id] }, [labels[id]]);
            if (id === 'image') this._insertImgBtn = btn;
            else if (id === 'link') this._insertLinkBtn = btn;
            else if (id === 'table') this._insertTableBtn = btn;
            else if (id === 'hr') this._insertHrBtn = btn;
            children.push(btn);
        }
        this._insertExtraButtons = [];
        for (const item of this.toolConfig.insertExtra) {
            const btn = el('button', { type: 'button', className: 'yu-stream-editor-insert-toolbar-btn', title: item.title ?? '' }, [item.label]);
            this._insertExtraButtons.push({ el: btn, onClick: item.onClick });
            children.push(btn);
        }
        return el('div', { className: 'yu-stream-editor-insert-toolbar', 'aria-hidden': 'true' }, children);
    }

    /**
     * 绑定所有事件：选区保存、各工具栏点击、选区变化同步工具栏、粘贴/输入、快捷键、焦点/resize/点击外部隐藏工具栏。
     * 由 constructor 在 render 之后调用。
     */
    mount() {
        this._bindEditorSelection();   // 编辑区内 mouseup/keyup 保存选区，selectionchange/keyup/mouseup 同步工具栏
        this._bindBubbleToolbar();
        this._bindInsertToolbar();
        this._bindTableToolbar();
        this._bindImageToolbar();
        this._bindSelectionChange();  // 全局 selectionchange + 编辑区 mouseup/click/keyup 更新四个工具栏显示
        this._bindPasteAndInput();
        this._bindKeyboard();
        this._bindHooks();            // onFocus/onBlur、resize 隐藏工具栏、点击编辑区/工具栏外隐藏
    }

    /** 绑定焦点钩子、窗口 resize 隐藏所有工具栏、滚动时重定位工具栏、点击编辑区或任意工具栏外时隐藏所有工具栏 */
    _bindHooks() {
        if (!this.editor) return;
        this.editor.addEventListener('focus', () => this._callHook('onFocus'));
        this.editor.addEventListener('blur', () => this._callHook('onBlur'));
        window.addEventListener('resize', () => this._hideAllToolbars());
        window.addEventListener('scroll', this._boundSyncToolbarsOnScroll, true);
        this.container?.addEventListener?.('scroll', this._boundSyncToolbarsOnScroll, true);
        this.editor?.parentElement?.addEventListener?.('scroll', this._boundSyncToolbarsOnScroll, true);
        document.addEventListener('click', (e) => {
            const t = e.target;
            if (this.editor?.contains(t)) return;
            if (this.bubbleToolbar?.contains(t)) return;
            if (this.insertToolbar?.contains(t)) return;
            if (this.tableToolbar?.contains(t)) return;
            if (this.imageToolbar?.contains(t)) return;
            this._hideAllToolbars();
        });
    }

    /**
     * 绑定粘贴与 input。
     * 粘贴：若 options.onPaste 返回 true 则仅 preventDefault 由外部处理；否则若 pastePlainText 则转为纯文本插入。
     * input：更新字数、若超 maxLength 则执行一次 undo。
     */
    _bindPasteAndInput() {
        if (!this.editor) return;
        this.editor.addEventListener('paste', (e) => {
            if (typeof this.options.onPaste === 'function' && this.options.onPaste(e, this) === true) {
                e.preventDefault();
                return;
            }
            if (this.pastePlainText) {
                e.preventDefault();
                const text = (e.clipboardData?.getData('text/plain') || '').replace(/\n/g, '<br>');
                document.execCommand('insertHTML', false, text);
                this._updateWordCount();
            }
        });
        this.editor.addEventListener('input', () => {
            this._updateWordCount();
            if (this.maxLength > 0 && this.getWordCount() > this.maxLength) {
                const sel = window.getSelection();
                if (sel && sel.rangeCount > 0) document.execCommand('undo', false, null);
            }
        });
    }

    /**
     * 绑定快捷键：Ctrl/Cmd+B/I/U 粗体/斜体/下划线；options.shortcuts 中匹配 key 与 ctrlKey 后执行 handler(editor)。
     */
    _bindKeyboard() {
        this.editor?.addEventListener('keydown', (e) => {
            if (e.ctrlKey || e.metaKey) {
                if (e.key === 'b') { e.preventDefault(); this.exec('bold'); return; }
                if (e.key === 'i') { e.preventDefault(); this.exec('italic'); return; }
                if (e.key === 'u') { e.preventDefault(); this.exec('underline'); return; }
            }
            const list = this.options.shortcuts;
            if (Array.isArray(list)) {
                const mod = e.ctrlKey || e.metaKey;
                for (const s of list) {
                    if (s.key !== e.key) continue;
                    if (s.ctrlKey !== undefined && s.ctrlKey !== mod) continue;
                    e.preventDefault();
                    if (typeof s.handler === 'function') s.handler(this);
                    return;
                }
            }
        });
    }

    /** 在指定容器内查找 .yu-stream-editor-echarts-wrap，逐个用 ECharts 渲染（每帧挂一个，避免等全部挂完才一起出来） */
    _mountEchartsInElement(container) {
        if (!container || typeof echarts === 'undefined') return;
        const wraps = Array.from(container.querySelectorAll('.yu-stream-editor-echarts-wrap'));
        const mountOne = (index) => {
            if (index >= wraps.length) return;
            const wrap = wraps[index];
            const optBase64 = wrap.getAttribute('data-echarts-option') || wrap.querySelector('.yu-stream-editor-echarts-data')?.getAttribute('data-echarts-option');
            if (!optBase64) { scheduleNext(index + 1); return; }
            let option;
            try {
                const optStr = decodeURIComponent(escape(atob(optBase64)));
                option = JSON.parse(optStr);
            } catch (_) {
                scheduleNext(index + 1);
                return;
            }
            const chartEl = wrap.querySelector('.yu-stream-editor-echarts-container');
            if (!chartEl) { scheduleNext(index + 1); return; }
            try {
                const chart = echarts.init(chartEl);
                chart.setOption(option);
                wrap._echartsInstance = chart;
            } catch (_) { }
            scheduleNext(index + 1);
        };
        const scheduleNext = (nextIndex) => {
            if (nextIndex < wraps.length) requestAnimationFrame(() => mountOne(nextIndex));
        };
        if (wraps.length > 0) mountOne(0);
    }

    /** 将一段 Markdown 解析为 HTML 并追加到编辑器末尾，不替换已有内容。用于非流式一次性追加。 */
    appendMarkdownAsHtml(md) {
        if (!md || !md.trim() || !this.editor) return;
        marked.defaults.chartEnabled = this.chartEnabled;
        marked.defaults.chartRenderAsChart = true;
        const html = marked.parse(md.trim());
        const frag = document.createRange().createContextualFragment(html);
        this.editor.appendChild(frag);
        this._mountEchartsInElement(this.editor);
    }

    /** 通知内容已变更（触发 onChange 钩子、更新字数），供外部在流式结束或程序化修改内容后调用 */
    notifyChange() {
        this._updateWordCount();
    }

    /** 隐藏所有浮动工具栏并移除表格 is-selected，用于清空、resize、点击外部等场景 */
    _hideAllToolbars() {
        [this.bubbleToolbar, this.insertToolbar, this.tableToolbar, this.imageToolbar].forEach((bar) => {
            if (bar) {
                bar.classList.remove('is-visible');
                bar.setAttribute('aria-hidden', 'true');
            }
        });
        this.tableToolbarCurrentTable = null;
        this.imageToolbarCurrentImage = null;
        this.editor?.querySelectorAll?.('table').forEach((t) => t.classList.remove('is-selected'));
    }

    /** 清空编辑器 HTML、流式缓冲，并隐藏所有浮动工具栏 */
    clear() {
        this._hideAllToolbars();
        if (this.editor) this.editor.innerHTML = '';
        this.streamBuffer = '';
        this._updateWordCount();
    }

    /** 将 chunk 追加到流式缓冲并整体重新用 Markdown 解析渲染编辑器内容（流式接口逐段返回时使用）。流式过程中 \`\`\`echarts 先以代码块显示，结束后再替换为图表。 */
    appendStreamChunk(chunk) {
        if (typeof chunk !== 'string' || !this.editor) return;
        this.streamBuffer += chunk;
        try {
            marked.defaults.chartEnabled = this.chartEnabled;
            marked.defaults.chartRenderAsChart = (this.getMode() !== 'readonly');
            this.editor.innerHTML = marked.parse(this.streamBuffer);
            if (this.getMode() !== 'readonly') this._mountEchartsInElement(this.editor);
        } catch (_) { }
    }

    /** 仅清空流式缓冲，不修改编辑器 DOM */
    resetStream() {
        this.streamBuffer = '';
    }

    /** 返回当前流式缓冲的完整 Markdown 字符串 */
    getStreamBuffer() {
        return this.streamBuffer;
    }

    /** 返回编辑器当前内容的 HTML 字符串；其中的 ECharts 图表会转为图片（data URL）嵌入 */
    getHtml() {
        if (!this.editor) return '';
        return this._serializeEditorHtmlWithChartsAsImages(this.editor);
    }

    /** 使用 Turndown 将编辑器 HTML 转为 Markdown；其中的 ECharts 图表会先转为图片再导出为 ![图表](data:image/...) */
    getMarkdown() {
        if (!this.editor) return '';
        try {
            const html = this._serializeEditorHtmlWithChartsAsImages(this.editor);
            return turndownService.turndown(html).trim();
        } catch (_) {
            return '';
        }
    }

    /** 从图表 wrap 节点获取当前渲染图为 data URL（优先 ECharts getDataURL，否则取 canvas.toDataURL） */
    _getChartDataUrl(wrap) {
        try {
            const chart = wrap._echartsInstance;
            if (chart && typeof chart.getDataURL === 'function') return chart.getDataURL({ type: 'png', pixelRatio: 2 });
            const container = wrap.querySelector('.yu-stream-editor-echarts-container');
            const canvas = container?.querySelector('canvas');
            if (canvas) return canvas.toDataURL('image/png');
        } catch (_) { }
        return '';
    }

    /** 序列化编辑区为 HTML，遇到 ECharts 图表块时用 <img src="data:image/..."> 替换，供 getHtml/getMarkdown 使用 */
    _serializeEditorHtmlWithChartsAsImages(node) {
        if (node.nodeType === Node.TEXT_NODE) {
            return node.textContent.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        }
        if (node.nodeType !== Node.ELEMENT_NODE) return '';
        const el = node;
        const hasContainerAsDirectChild = Array.from(el.children).some((c) => c.classList?.contains('yu-stream-editor-echarts-container'));
        const isChartWrap = el.classList?.contains('yu-stream-editor-echarts-wrap') ||
            (hasContainerAsDirectChild && (el.getAttribute('data-echarts-option') || el.querySelector('.yu-stream-editor-echarts-data')));
        if (isChartWrap) {
            const dataUrl = this._getChartDataUrl(el);
            if (dataUrl) return '<img src="' + dataUrl.replace(/"/g, '&quot;') + '" alt="图表" class="yu-stream-editor-echarts-export-img">';
            return '<p>[图表未渲染]</p>';
        }
        const tag = el.nodeName.toLowerCase();
        const voidTags = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
        let out = '<' + tag;
        for (const a of el.attributes) {
            const v = (a.value || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            out += ' ' + a.name + '="' + v + '"';
        }
        out += '>';
        if (voidTags.has(tag)) return out;
        for (let i = 0; i < el.childNodes.length; i++) {
            out += this._serializeEditorHtmlWithChartsAsImages(el.childNodes[i]);
        }
        out += '</' + tag + '>';
        return out;
    }

    /** 设置编辑器内容为指定 HTML 并触发字数更新 */
    setHtml(html) {
        if (!this.editor) return;
        this.editor.innerHTML = typeof html === 'string' ? html : '';
        this._updateWordCount();
    }

    /** 将 Markdown 解析为 HTML 后设为编辑器内容；解析失败时原样作为 HTML 设置 */
    setMarkdown(md) {
        if (!this.editor || typeof md !== 'string') return;
        try {
            marked.defaults.chartEnabled = this.chartEnabled;
            marked.defaults.chartRenderAsChart = true;
            this.editor.innerHTML = marked.parse(md);
            this._mountEchartsInElement(this.editor);
        } catch (_) {
            this.editor.innerHTML = md;
        }
        this._updateWordCount();
    }

    /** 在光标处插入图片：url 必填，width/height 可选（如 200px、50%） */
    insertImage(url, width = '', height = '') {
        if (!url?.trim() || !this.editor) return;
        this.editor.focus();
        this.restoreSelection();
        const img = document.createElement('img');
        img.src = url.trim();
        if (width) img.style.width = width;
        if (height) img.style.height = height;
        img.style.display = 'block';
        document.execCommand('insertHTML', false, img.outerHTML);
        this._updateWordCount();
    }

    /** 插入链接：若有选区则将选区设为该链接，否则在光标处插入带文字的超链接 */
    insertLink(url, text) {
        if (!url?.trim() || !this.editor) return;
        this.editor.focus();
        this.restoreSelection();
        const sel = window.getSelection();
        const hasRange = sel && sel.rangeCount > 0 && !sel.isCollapsed;
        const label = (text != null && String(text).trim()) ? String(text).trim() : url.trim();
        if (hasRange) document.execCommand('createLink', false, url.trim());
        else document.execCommand('insertHTML', false, '<a href="' + url.trim().replace(/"/g, '&quot;') + '" target="_blank" rel="noopener">' + label.replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</a>');
        this._updateWordCount();
    }

    /** 在光标处插入 rows×cols 表格，表头一行，其余为 tbody */
    insertTable(rows = 3, cols = 3) {
        if (!this.editor) return;
        this.editor.focus();
        this.restoreSelection();
        let html = '<table><thead><tr>';
        for (let c = 0; c < cols; c++) html += '<th></th>';
        html += '</tr></thead><tbody>';
        for (let r = 1; r < rows; r++) {
            html += '<tr>';
            for (let c = 0; c < cols; c++) html += '<td></td>';
            html += '</tr>';
        }
        html += '</tbody></table>';
        document.execCommand('insertHTML', false, html);
        this._updateWordCount();
    }

    /** 在光标处插入水平分割线 <hr> */
    insertHr() {
        if (!this.editor) return;
        this.editor.focus();
        this.restoreSelection();
        document.execCommand('insertHorizontalRule', false, null);
        this._updateWordCount();
    }

    /** 执行一次撤销 */
    undo() {
        if (this.editor) {
            this.editor.focus();
            document.execCommand('undo', false, null);
        }
    }

    /** 执行一次重做 */
    redo() {
        if (this.editor) {
            this.editor.focus();
            document.execCommand('redo', false, null);
        }
    }

    /** 将当前选区设为标题，level 为 1/2/3 对应 h1/h2/h3 */
    setHeading(level) {
        if (!this.editor || level < 1 || level > 3) return;
        this.editor.focus();
        this.restoreSelection();
        document.execCommand('formatBlock', false, 'h' + level);
    }

    /** 字数统计：编辑区纯文本去掉空白后的长度 */
    getWordCount() {
        if (!this.editor) return 0;
        return (this.editor.innerText || '').replace(/\s/g, '').length;
    }

    /** 内部方法：触发 onChange 钩子，在内容变更或 setHtml/insert 等后调用 */
    _updateWordCount() {
        this._callHook('onChange');
    }

    /** 设置只读或可编辑：只读时 contentEditable='false'，并隐藏所有浮动工具栏；恢复可编辑时把流式过程中产生的 .yu-stream-editor-echarts-pending 代码块替换为图表并挂载。 */
    setReadonly(readonly) {
        this._isReadonly = !!readonly;
        if (this.editor) this.editor.contentEditable = this._isReadonly ? 'false' : 'true';
        if (this._isReadonly) {
            this._hideAllToolbars();
        } else {
            this._replacePendingChartsWithCharts();
            this._mountEchartsInElement(this.editor);
        }
    }

    /** 将流式过程中渲染的 .yu-stream-editor-echarts-pending 代码块替换为图表占位 div，供随后 _mountEchartsInElement 挂载 */
    _replacePendingChartsWithCharts() {
        if (!this.editor) return;
        this.editor.querySelectorAll('.yu-stream-editor-echarts-pending').forEach((pre) => {
            const optBase64 = pre.getAttribute('data-echarts-option');
            if (!optBase64) return;
            const wrap = document.createElement('div');
            wrap.className = 'yu-stream-editor-echarts-wrap';
            wrap.setAttribute('contenteditable', 'false');
            wrap.setAttribute('data-echarts-option', optBase64);
            const span = document.createElement('span');
            span.className = 'yu-stream-editor-echarts-data';
            span.style.cssText = 'display:none !important';
            span.setAttribute('aria-hidden', 'true');
            span.setAttribute('data-echarts-option', optBase64);
            const container = document.createElement('div');
            container.className = 'yu-stream-editor-echarts-container';
            container.style.cssText = 'width:100%;height:300px';
            wrap.appendChild(span);
            wrap.appendChild(container);
            pre.parentNode.replaceChild(wrap, pre);
        });
    }

    /** 只读属性 getter/setter，与 setReadonly 一致 */
    get readonly() {
        return this._isReadonly;
    }
    set readonly(v) {
        this.setReadonly(!!v);
    }

    /** 返回当前模式：'edit' 或 'readonly' */
    getMode() {
        return this._isReadonly ? 'readonly' : 'edit';
    }

    /** 设置模式：'edit' 可编辑，'readonly' 只读 */
    setMode(mode) {
        this.setReadonly(mode === 'readonly');
    }

    /** 在只读与可编辑之间切换 */
    toggleReadonly() {
        this.setReadonly(!this._isReadonly);
    }

    /** 将当前 getHtml() 内容导出为 content.html 并触发浏览器下载 */
    exportHtml() {
        const html = this.getHtml();
        const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'content.html';
        a.click();
        URL.revokeObjectURL(a.href);
    }

    /** 将当前 getMarkdown() 内容导出为 content.md 并触发浏览器下载 */
    exportMarkdown() {
        const md = this.getMarkdown();
        const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'content.md';
        a.click();
        URL.revokeObjectURL(a.href);
    }

    /** 判断当前选区是否完全在编辑区内（anchor 与 focus 节点均在 editor 内） */
    isSelectionInEditor() {
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return false;
        return this.editor.contains(sel.anchorNode) && this.editor.contains(sel.focusNode);
    }

    /** 将当前选区克隆到 savedRange，供点击工具栏后 restoreSelection 恢复（避免失焦丢失选区） */
    saveSelection() {
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return;
        if (!this.isSelectionInEditor()) return;
        this.savedRange = sel.getRangeAt(0).cloneRange();
    }

    /** 把 savedRange 恢复到当前 Selection，成功返回 true；无 savedRange 返回 false */
    restoreSelection() {
        if (!this.savedRange) return false;
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(this.savedRange);
        return true;
    }

    /** 执行格式命令：先 focus 编辑器、恢复选区，再 document.execCommand(cmd, false, value) */
    exec(cmd, value = null) {
        if (!this.editor) return;
        this.editor.focus();
        this.restoreSelection();
        document.execCommand(cmd, false, value);
    }

    /** 在编辑区上绑定：mouseup/keyup 时保存选区；selectionchange/keyup/mouseup 时调用 syncToolbar 同步气泡栏控件状态 */
    _bindEditorSelection() {
        if (!this.editor) return;
        this.editor.addEventListener('mouseup', this._boundSaveSelection);
        this.editor.addEventListener('keyup', this._boundSaveSelection);
        this.editor.addEventListener('selectionchange', () => this.syncToolbar());
        this.editor.addEventListener('keyup', () => this.syncToolbar());
        this.editor.addEventListener('mouseup', () => this.syncToolbar());
    }

    /** 根据当前选区所在节点同步气泡工具栏中字体名、字号、颜色的显示值（FONT 标签与 style.color） */
    syncToolbar() {
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return;
        let el = sel.anchorNode?.nodeType === Node.ELEMENT_NODE ? sel.anchorNode : sel.anchorNode?.parentElement;
        while (el && el !== this.editor) {
            if (el.tagName === 'FONT' && el.face && this.bubbleFontName) this.bubbleFontName.value = el.face || '';
            if (el.tagName === 'FONT' && el.size && this.bubbleFontSize) this.bubbleFontSize.value = String(el.size) || '3';
            if (el.style?.color) {
                const hex = rgbToHex(el.style.color);
                if (hex && this.bubbleFontColor) this.bubbleFontColor.value = hex;
            }
            el = el.parentElement;
        }
    }

    /**
     * 绑定气泡工具栏：字体/字号/颜色 mousedown 保存选区，change/input 执行 fontName/fontSize/foreColor；B/I/U、H1–H3、无序/有序列表 mousedown 保存选区、click 执行对应命令；bubbleExtra 按钮 mousedown 保存选区、click 调用 onClick(editor)。
     */
    _bindBubbleToolbar() {
        [this.bubbleFontName, this.bubbleFontSize, this.bubbleFontColor].forEach((el) => {
            el?.addEventListener('mousedown', this._boundSaveSelection);
        });
        [this.bubbleBoldBtn, this.bubbleItalicBtn, this.bubbleUnderlineBtn].forEach((el) => {
            el?.addEventListener('mousedown', (e) => { e.preventDefault(); this.saveSelection(); });
        });
        this.bubbleFontName?.addEventListener('change', () => this.exec('fontName', this.bubbleFontName?.value || ''));
        this.bubbleFontSize?.addEventListener('change', () => this.exec('fontSize', this.bubbleFontSize?.value || '3'));
        this.bubbleFontColor?.addEventListener('input', () => this.exec('foreColor', this.bubbleFontColor?.value));
        this.bubbleBoldBtn?.addEventListener('click', () => this.exec('bold'));
        this.bubbleItalicBtn?.addEventListener('click', () => this.exec('italic'));
        this.bubbleUnderlineBtn?.addEventListener('click', () => this.exec('underline'));
        this._bubbleH1Btn?.addEventListener('click', (e) => { e.preventDefault(); this.saveSelection(); this.setHeading(1); });
        this._bubbleH2Btn?.addEventListener('click', (e) => { e.preventDefault(); this.saveSelection(); this.setHeading(2); });
        this._bubbleH3Btn?.addEventListener('click', (e) => { e.preventDefault(); this.saveSelection(); this.setHeading(3); });
        this._bubbleUlBtn?.addEventListener('click', (e) => { e.preventDefault(); this.saveSelection(); this.editor?.focus(); this.restoreSelection(); document.execCommand('insertUnorderedList', false, null); this._updateWordCount(); });
        this._bubbleOlBtn?.addEventListener('click', (e) => { e.preventDefault(); this.saveSelection(); this.editor?.focus(); this.restoreSelection(); document.execCommand('insertOrderedList', false, null); this._updateWordCount(); });
        for (const { el: btn, onClick } of this._bubbleExtraButtons || []) {
            btn.addEventListener('mousedown', (e) => { e.preventDefault(); this.saveSelection(); });
            btn.addEventListener('click', (e) => { e.preventDefault(); if (typeof onClick === 'function') onClick(this); });
        }
    }

    /**
     * 绑定插入工具栏：图片/链接/表格 mousedown 保存选区、click 调 _showDialogOrCustom 后插入；分割线 click 直接 insertHr；insertExtra 按钮 mousedown 保存选区、click 调用 onClick(editor)。
     */
    _bindInsertToolbar() {
        const mousedownSave = (e) => { e.preventDefault(); this.saveSelection(); };
        this._insertImgBtn?.addEventListener('mousedown', mousedownSave);
        this._insertLinkBtn?.addEventListener('mousedown', mousedownSave);
        this._insertTableBtn?.addEventListener('mousedown', mousedownSave);
        this._insertHrBtn?.addEventListener('mousedown', mousedownSave);
        this._insertImgBtn?.addEventListener('click', async () => {
            const data = await this._showDialogOrCustom({
                title: '插入图片',
                fields: [{ name: 'url', label: '图片地址（URL）', placeholder: 'https://...' }],
            });
            if (data?.url?.trim()) this.insertImage(data.url.trim());
        });
        this._insertLinkBtn?.addEventListener('click', async () => {
            const data = await this._showDialogOrCustom({
                title: '插入链接',
                fields: [
                    { name: 'url', label: '链接地址', placeholder: 'https://...' },
                    { name: 'text', label: '链接文字（留空使用地址）', placeholder: '' },
                ],
            });
            if (!data?.url?.trim()) return;
            this.editor?.focus();
            this.restoreSelection();
            const label = (data.text != null && String(data.text).trim()) ? String(data.text).trim() : data.url.trim();
            document.execCommand('insertHTML', false, '<a href="' + data.url.trim().replace(/"/g, '&quot;') + '" target="_blank" rel="noopener">' + label.replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</a>');
            this._updateWordCount();
        });
        this._insertTableBtn?.addEventListener('click', async () => {
            const data = await this._showDialogOrCustom({
                title: '插入表格',
                fields: [
                    { name: 'rows', label: '行数', value: '3', placeholder: '3' },
                    { name: 'cols', label: '列数', value: '3', placeholder: '3' },
                ],
            });
            if (data) {
                const rows = parseInt(data.rows || '3', 10) || 3;
                const cols = parseInt(data.cols || '3', 10) || 3;
                this.insertTable(rows, cols);
            }
        });
        this._insertHrBtn?.addEventListener('click', () => this.insertHr());
        for (const { el: btn, onClick } of this._insertExtraButtons || []) {
            btn.addEventListener('mousedown', mousedownSave);
            btn.addEventListener('click', () => typeof onClick === 'function' && onClick(this));
        }
    }

    /**
     * 根据当前选区显示或隐藏气泡工具栏：选中图片、无选区、选区不在编辑区或选区折叠时隐藏；否则定位到选区上方中央并 syncToolbar。
     */
    updateBubbleToolbar() {
        if (!this.bubbleToolbar) return;
        if (this.getMode() === 'readonly') {
            this.bubbleToolbar.classList.remove('is-visible');
            this.bubbleToolbar.setAttribute('aria-hidden', 'true');
            return;
        }
        if (this.bubbleToolbar.contains(document.activeElement)) return;
        if (this.getSelectedImage()) {
            this.bubbleToolbar.classList.remove('is-visible');
            this.bubbleToolbar.setAttribute('aria-hidden', 'true');
            return;
        }
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) {
            this.bubbleToolbar.classList.remove('is-visible');
            this.bubbleToolbar.setAttribute('aria-hidden', 'true');
            return;
        }
        if (!this.isSelectionInEditor() || sel.isCollapsed) {
            this.bubbleToolbar.classList.remove('is-visible');
            this.bubbleToolbar.setAttribute('aria-hidden', 'true');
            return;
        }
        const range = sel.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        const gap = 8;
        const bubbleHeight = 42;
        let top = rect.top - bubbleHeight - gap;
        const left = rect.left + rect.width / 2;
        if (top < 8) top = rect.bottom + gap;
        this.bubbleToolbar.style.top = `${top}px`;
        this.bubbleToolbar.style.left = `${left}px`;
        this.bubbleToolbar.style.transform = 'translateX(-50%)';
        this.bubbleToolbar.classList.add('is-visible');
        this.bubbleToolbar.setAttribute('aria-hidden', 'false');
        this.syncToolbar();
    }

    /**
     * 仅当光标在编辑区内、选区折叠、且未选中表格/图片时显示插入工具栏，并定位到光标上方中央（用 _getCaretRect 取光标位置）。
     */
    updateInsertToolbar() {
        if (!this.insertToolbar) return;
        if (this.getMode() === 'readonly') {
            this.insertToolbar.classList.remove('is-visible');
            this.insertToolbar.setAttribute('aria-hidden', 'true');
            return;
        }
        if (this.insertToolbar.contains(document.activeElement)) return;
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0 || !this.isSelectionInEditor()) {
            this.insertToolbar.classList.remove('is-visible');
            this.insertToolbar.setAttribute('aria-hidden', 'true');
            return;
        }
        if (!sel.isCollapsed || this.getSelectedTable() || this.getSelectedImage()) {
            this.insertToolbar.classList.remove('is-visible');
            this.insertToolbar.setAttribute('aria-hidden', 'true');
            return;
        }
        const range = sel.getRangeAt(0);
        const rect = this._getCaretRect(range);
        if (!rect) {
            this.insertToolbar.classList.remove('is-visible');
            this.insertToolbar.setAttribute('aria-hidden', 'true');
            return;
        }
        const gap = 8;
        const barHeight = 36;
        let top = rect.top - barHeight - gap;
        const left = rect.left + rect.width / 2;
        if (top < 8) top = rect.bottom + gap;
        this.insertToolbar.style.top = `${top}px`;
        this.insertToolbar.style.left = `${left}px`;
        this.insertToolbar.style.transform = 'translateX(-50%)';
        this.insertToolbar.classList.add('is-visible');
        this.insertToolbar.setAttribute('aria-hidden', 'false');
    }

    /**
     * 获取折叠选区（光标）处的视觉矩形，换行时也能得到正确位置。
     * 优先用 range.getClientRects() 最后一项；无效则用 getBoundingClientRect；再无效则插入临时零宽 span 测坐标后恢复选区。
     */
    _getCaretRect(range) {
        if (!range.collapsed) return null;
        const rects = range.getClientRects();
        if (rects.length > 0) {
            const r = rects[rects.length - 1];
            if (r.width > 0 || r.height > 0) return r;
            if (r.top !== 0 || r.left !== 0) return r;
        }
        const br = range.getBoundingClientRect();
        if (br.height > 0 && (br.left !== 0 || br.top !== 0)) return br;
        const span = document.createElement('span');
        span.textContent = '\u200b';
        span.style.position = 'absolute';
        span.style.visibility = 'hidden';
        span.style.pointerEvents = 'none';
        try {
            range.insertNode(span);
            const parent = span.parentNode;
            const index = parent ? Array.from(parent.childNodes).indexOf(span) : -1;
            const sr = span.getBoundingClientRect();
            parent?.removeChild(span);
            if (parent && index >= 0) {
                range.setStart(parent, index);
                range.collapse(true);
            }
            return sr;
        } catch (e) {
            span.parentNode?.removeChild(span);
            return null;
        }
    }

    /** 若当前选区或光标的 anchor 在表格内，返回包含该节点的 table 元素，否则 null */
    getSelectedTable() {
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return null;
        let node = sel.anchorNode?.nodeType === Node.ELEMENT_NODE ? sel.anchorNode : sel.anchorNode?.parentElement;
        while (node && node !== this.editor) {
            if (node.tagName === 'TABLE') return node;
            node = node.parentElement;
        }
        return null;
    }

    /**
     * 若当前选区内包含图片或光标在图片上，返回该 img；否则若上次点击的是编辑区内的图片则返回该 img；都没有则 null。
     */
    getSelectedImage() {
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0) {
            for (const n of [sel.anchorNode, sel.focusNode]) {
                let node = n?.nodeType === Node.ELEMENT_NODE ? n : n?.parentElement;
                while (node && node !== this.editor) {
                    if (node.tagName === 'IMG') return node;
                    node = node.parentElement;
                }
            }
            const range = sel.getRangeAt(0);
            const start = range.startContainer?.nodeType === Node.ELEMENT_NODE ? range.startContainer : range.startContainer?.parentElement;
            let node = start;
            while (node && node !== this.editor) {
                if (node.tagName === 'IMG') return node;
                node = node.parentElement;
            }
        }
        if (this._lastClickedImage && this.editor?.contains(this._lastClickedImage)) return this._lastClickedImage;
        return null;
    }

    /**
     * 绑定图片工具栏：宽高输入框 change/blur 时应用宽高与对齐到当前图片；居左/中/右按钮设置 data-align 并应用；imageExtra 按钮 mousedown 保存选区、click 调用 onClick(editor)。
     */
    _bindImageToolbar() {
        // 把工具栏上的宽高、data-align 应用到当前选中图片的 style
        const applyImageStyle = () => {
            const img = this.imageToolbarCurrentImage || this.getSelectedImage();
            if (!img) return;
            const w = this.imageToolbarWidth?.value?.trim();
            const h = this.imageToolbarHeight?.value?.trim();
            if (w !== undefined) img.style.width = w || '';
            if (h !== undefined) img.style.height = h || '';
            const align = img.getAttribute('data-align') || '';
            img.style.display = 'block';
            img.style.marginLeft = align === 'right' ? 'auto' : '0';
            img.style.marginRight = align === 'left' ? 'auto' : align === 'center' ? 'auto' : '0';
        };

        const setImageAlignAndApply = (align) => {
            const img = this.imageToolbarCurrentImage || this.getSelectedImage();
            if (img) img.setAttribute('data-align', align);
            [this.imageToolbarAlignLeft, this.imageToolbarAlignCenter, this.imageToolbarAlignRight].forEach((btn) => btn?.classList.remove('is-active'));
            if (align === 'left') this.imageToolbarAlignLeft?.classList.add('is-active');
            else if (align === 'center') this.imageToolbarAlignCenter?.classList.add('is-active');
            else if (align === 'right') this.imageToolbarAlignRight?.classList.add('is-active');
            applyImageStyle();
        };

        this.imageToolbarWidth?.addEventListener('change', applyImageStyle);
        this.imageToolbarWidth?.addEventListener('blur', applyImageStyle);
        this.imageToolbarHeight?.addEventListener('change', applyImageStyle);
        this.imageToolbarHeight?.addEventListener('blur', applyImageStyle);
        this.imageToolbarAlignLeft?.addEventListener('click', () => setImageAlignAndApply('left'));
        this.imageToolbarAlignCenter?.addEventListener('click', () => setImageAlignAndApply('center'));
        this.imageToolbarAlignRight?.addEventListener('click', () => setImageAlignAndApply('right'));

        (this._imageExtraButtons || []).forEach(({ el: btn, onClick }) => {
            btn?.addEventListener('mousedown', (e) => { e.preventDefault(); this.saveSelection(); });
            btn?.addEventListener('click', () => { if (typeof onClick === 'function') onClick(this); });
        });
    }

    /** 有选中图片时显示图片工具栏并定位到图片上方中央，同步宽高与对齐状态；无选中则隐藏 */
    updateImageToolbar() {
        if (!this.imageToolbar) return;
        if (this.getMode() === 'readonly') {
            this.imageToolbar.classList.remove('is-visible');
            this.imageToolbar.setAttribute('aria-hidden', 'true');
            this.imageToolbarCurrentImage = null;
            return;
        }
        if (this.imageToolbar.contains(document.activeElement)) return;
        const img = this.getSelectedImage();
        if (!img) {
            this.imageToolbar.classList.remove('is-visible');
            this.imageToolbar.setAttribute('aria-hidden', 'true');
            this.imageToolbarCurrentImage = null;
            return;
        }
        this.imageToolbarCurrentImage = img;
        this.imageToolbarWidth.value = img.style.width || '';
        this.imageToolbarHeight.value = img.style.height || '';
        const align = img.getAttribute('data-align') || '';
        [this.imageToolbarAlignLeft, this.imageToolbarAlignCenter, this.imageToolbarAlignRight].forEach((btn) => btn?.classList.remove('is-active'));
        if (align === 'left') this.imageToolbarAlignLeft?.classList.add('is-active');
        else if (align === 'center') this.imageToolbarAlignCenter?.classList.add('is-active');
        else if (align === 'right') this.imageToolbarAlignRight?.classList.add('is-active');
        const rect = img.getBoundingClientRect();
        const gap = 8;
        const toolbarHeight = 44;
        let top = rect.top - toolbarHeight - gap;
        if (top < 8) top = rect.bottom + gap;
        this.imageToolbar.style.top = `${top}px`;
        this.imageToolbar.style.left = `${rect.left + rect.width / 2}px`;
        this.imageToolbar.style.transform = 'translateX(-50%)';
        this.imageToolbar.classList.add('is-visible');
        this.imageToolbar.setAttribute('aria-hidden', 'false');
    }

    /** 将边框类型（data-border、className）、对齐（data-align）、边框色应用到 table 及其 th/td */
    applyTableStyleTo(table, border, align, color) {
        if (!table) return;
        table.setAttribute('data-border', border);
        table.className = border + '-border';
        if (align) table.setAttribute('data-align', align);
        else table.removeAttribute('data-align');
        table.style.borderColor = color;
        table.querySelectorAll('th, td').forEach((cell) => (cell.style.borderColor = color));
    }

    /**
     * 绑定表格工具栏：边框/对齐/颜色控件 change 或 input 时应用样式；居左/中/右按钮同步并应用；+行/-行/+列/-列 mousedown 保存选区、click 执行增删；tableExtra 按钮同理；编辑区 click 时 updateTableToolbar。
     */
    _bindTableToolbar() {
        const applyFromTableToolbar = () => {
            const table = this.tableToolbarCurrentTable || this.getSelectedTable();
            if (!table) return;
            this.applyTableStyleTo(table, this.tableToolbarBorder?.value ?? 'full', this.tableToolbarAlign?.value ?? '', this.tableToolbarBorderColor?.value ?? '#cccccc');
        };

        const setTableAlignAndApply = (align) => {
            if (this.tableToolbarAlign) this.tableToolbarAlign.value = align;
            [this.tableToolbarAlignLeftBtn, this.tableToolbarAlignCenterBtn, this.tableToolbarAlignRightBtn].forEach((btn) => btn?.classList.remove('is-active'));
            if (align === 'left') this.tableToolbarAlignLeftBtn?.classList.add('is-active');
            else if (align === 'center') this.tableToolbarAlignCenterBtn?.classList.add('is-active');
            else if (align === 'right') this.tableToolbarAlignRightBtn?.classList.add('is-active');
            applyFromTableToolbar();
        };

        this.tableToolbarBorder?.addEventListener('change', applyFromTableToolbar);
        this.tableToolbarAlign?.addEventListener('change', () => setTableAlignAndApply(this.tableToolbarAlign.value));
        this.tableToolbarBorderColor?.addEventListener('input', applyFromTableToolbar);
        this.tableToolbarAlignLeftBtn?.addEventListener('click', () => setTableAlignAndApply('left'));
        this.tableToolbarAlignCenterBtn?.addEventListener('click', () => setTableAlignAndApply('center'));
        this.tableToolbarAlignRightBtn?.addEventListener('click', () => setTableAlignAndApply('right'));

        const tableOp = (fn) => () => fn();
        this._tableAddRowBtn?.addEventListener('mousedown', (e) => { e.preventDefault(); this.saveSelection(); });
        this._tableAddRowBtn?.addEventListener('click', tableOp(() => this._tableInsertRow()));
        this._tableDelRowBtn?.addEventListener('mousedown', (e) => { e.preventDefault(); this.saveSelection(); });
        this._tableDelRowBtn?.addEventListener('click', tableOp(() => this._tableDeleteRow()));
        this._tableAddColBtn?.addEventListener('mousedown', (e) => { e.preventDefault(); this.saveSelection(); });
        this._tableAddColBtn?.addEventListener('click', tableOp(() => this._tableInsertCol()));
        this._tableDelColBtn?.addEventListener('mousedown', (e) => { e.preventDefault(); this.saveSelection(); });
        this._tableDelColBtn?.addEventListener('click', tableOp(() => this._tableDeleteCol()));

        (this._tableExtraButtons || []).forEach(({ el: btn, onClick }) => {
            btn?.addEventListener('mousedown', (e) => { e.preventDefault(); this.saveSelection(); });
            btn?.addEventListener('click', tableOp(() => { if (typeof onClick === 'function') onClick(this); }));
        });

        this.editor?.addEventListener('click', () => this.updateTableToolbar());
    }

    /** 若当前选区在表格内，从 anchor 向上找 td/th 并返回，否则 null（用于增删行列时确定操作位置） */
    _getSelectedCell() {
        const table = this.getSelectedTable();
        if (!table) return null;
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return null;
        let node = sel.anchorNode?.nodeType === Node.ELEMENT_NODE ? sel.anchorNode : sel.anchorNode?.parentElement;
        while (node && node !== this.editor) {
            if (node.tagName === 'TD' || node.tagName === 'TH') return node;
            node = node.parentElement;
        }
        return null;
    }

    /** 将选区置于指定单元格内并 focus 编辑器，用于增删行列后保持焦点在表格内 */
    _setSelectionInCell(cell) {
        if (!cell || !this.editor) return;
        this.editor.focus();
        const sel = window.getSelection();
        if (!sel) return;
        const range = document.createRange();
        range.selectNodeContents(cell);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
    }

    /** 在当前选中单元格所在行下方插入一行（列数同当前行），光标移到新行首格并刷新表格栏 */
    _tableInsertRow() {
        const cell = this._getSelectedCell();
        if (!cell) return;
        const tr = cell.closest('tr');
        const table = cell.closest('table');
        if (!tr || !table) return;
        const colCount = tr.cells.length;
        const newTr = document.createElement('tr');
        for (let i = 0; i < colCount; i++) {
            const td = document.createElement('td');
            td.innerHTML = '<br>';
            newTr.appendChild(td);
        }
        tr.parentNode.insertBefore(newTr, tr.nextSibling);
        this._setSelectionInCell(newTr.cells[0]);
        this.updateTableToolbar();
    }

    /** 删除当前选中单元格所在行（至少保留一行），光标移到原索引行首格并刷新表格栏 */
    _tableDeleteRow() {
        const cell = this._getSelectedCell();
        if (!cell) return;
        const tr = cell.closest('tr');
        const table = cell.closest('table');
        if (!tr || !table) return;
        const rows = Array.from(table.querySelectorAll('tr'));
        if (rows.length <= 1) return;
        const rowIndex = rows.indexOf(tr);
        tr.remove();
        const nextRows = table.querySelectorAll('tr');
        const targetRow = rowIndex < nextRows.length ? nextRows[rowIndex] : nextRows[nextRows.length - 1];
        if (targetRow?.cells?.length) this._setSelectionInCell(targetRow.cells[0]);
        this.updateTableToolbar();
    }

    /** 在当前选中单元格右侧插入一列（每行插入一个 th 或 td），光标移到新列同行的单元格并刷新表格栏 */
    _tableInsertCol() {
        const cell = this._getSelectedCell();
        if (!cell) return;
        const tr = cell.closest('tr');
        const table = cell.closest('table');
        if (!tr || !table) return;
        const cellIndex = Array.from(tr.cells).indexOf(cell);
        table.querySelectorAll('tr').forEach((row) => {
            const newCell = row.querySelector('th') ? document.createElement('th') : document.createElement('td');
            newCell.innerHTML = '<br>';
            const ref = row.cells[cellIndex + 1] || null;
            row.insertBefore(newCell, ref);
        });
        const newCell = tr.cells[cellIndex + 1];
        if (newCell) this._setSelectionInCell(newCell);
        this.updateTableToolbar();
    }

    /** 删除当前选中单元格所在列（至少保留一列），光标移到同行前一列或当前列并刷新表格栏 */
    _tableDeleteCol() {
        const cell = this._getSelectedCell();
        if (!cell) return;
        const tr = cell.closest('tr');
        const table = cell.closest('table');
        if (!tr || !table) return;
        const cellIndex = Array.from(tr.cells).indexOf(cell);
        const colCount = tr.cells.length;
        if (colCount <= 1) return;
        table.querySelectorAll('tr').forEach(row => {
            if (row.cells[cellIndex]) row.cells[cellIndex].remove();
        });
        const targetCell = tr.cells[cellIndex] || tr.cells[cellIndex - 1];
        if (targetCell) this._setSelectionInCell(targetCell);
        this.updateTableToolbar();
    }

    /**
     * 仅当光标在表格内且选区折叠时显示表格工具栏：先清除所有表格 is-selected，再给当前表格加 is-selected、同步边框/对齐/颜色控件、定位到表格上方中央；否则隐藏。
     */
    updateTableToolbar() {
        const sel = window.getSelection();
        if (!this.tableToolbar) return;
        if (this.getMode() === 'readonly') {
            this.tableToolbar.classList.remove('is-visible');
            this.tableToolbar.setAttribute('aria-hidden', 'true');
            this.tableToolbarCurrentTable = null;
            return;
        }
        if (this.tableToolbar.contains(document.activeElement)) return;
        if (this.getSelectedImage()) {
            this.tableToolbar.classList.remove('is-visible');
            this.tableToolbar.setAttribute('aria-hidden', 'true');
            this.tableToolbarCurrentTable = null;
            return;
        }
        const table = this.getSelectedTable();
        this.editor?.querySelectorAll?.('table').forEach((t) => t.classList.remove('is-selected'));
        if (!table || (sel && !sel.isCollapsed)) {
            this.tableToolbar.classList.remove('is-visible');
            this.tableToolbar.setAttribute('aria-hidden', 'true');
            this.tableToolbarCurrentTable = null;
            return;
        }
        this.tableToolbarCurrentTable = table;
        table.classList.add('is-selected');
        this.tableToolbarBorder.value = table.getAttribute('data-border') || 'full';
        const align = table.getAttribute('data-align') || '';
        this.tableToolbarAlign.value = align;
        [this.tableToolbarAlignLeftBtn, this.tableToolbarAlignCenterBtn, this.tableToolbarAlignRightBtn].forEach((btn) => btn?.classList.remove('is-active'));
        if (align === 'left') this.tableToolbarAlignLeftBtn?.classList.add('is-active');
        else if (align === 'center') this.tableToolbarAlignCenterBtn?.classList.add('is-active');
        else if (align === 'right') this.tableToolbarAlignRightBtn?.classList.add('is-active');
        const bc = table.style.borderColor || getComputedStyle(table).borderColor;
        if (bc && this.tableToolbarBorderColor) this.tableToolbarBorderColor.value = rgbToHex(bc) || '#cccccc';
        const rect = table.getBoundingClientRect();
        const gap = 8;
        const toolbarHeight = 44;
        let top = rect.top - toolbarHeight - gap;
        if (top < 8) top = rect.bottom + gap;
        this.tableToolbar.style.top = `${top}px`;
        this.tableToolbar.style.left = `${rect.left + rect.width / 2}px`;
        this.tableToolbar.style.transform = 'translateX(-50%)';
        this.tableToolbar.classList.add('is-visible');
        this.tableToolbar.setAttribute('aria-hidden', 'false');
    }

    /**
     * 绑定选区与编辑区事件以统一更新四个浮动工具栏：全局 selectionchange 时保存选区（若在编辑区内）并刷新四栏；编辑区 mouseup/click 时记录 _lastClickedImage（点击图片时）并刷新四栏；keyup 时清空 _lastClickedImage 并刷新四栏。
     */
    _bindSelectionChange() {
        document.addEventListener('selectionchange', () => {
            if (this.isSelectionInEditor()) this.saveSelection();
            this.updateBubbleToolbar();
            this.updateInsertToolbar();
            this.updateTableToolbar();
            this.updateImageToolbar();
        });
        this.editor?.addEventListener('mouseup', (e) => {
            if (e.target?.tagName === 'IMG') this._lastClickedImage = e.target;
            else this._lastClickedImage = null;
            this.updateBubbleToolbar();
            this.updateInsertToolbar();
            this.updateTableToolbar();
            this.updateImageToolbar();
        });
        this.editor?.addEventListener('click', (e) => {
            if (e.target?.tagName === 'IMG') this._lastClickedImage = e.target;
            else this._lastClickedImage = null;
            this.updateBubbleToolbar();
            this.updateInsertToolbar();
            this.updateTableToolbar();
            this.updateImageToolbar();
        });
        this.editor?.addEventListener('keyup', () => {
            this._lastClickedImage = null;
            this.updateBubbleToolbar();
            this.updateInsertToolbar();
            this.updateTableToolbar();
            this.updateImageToolbar();
        });
    }
}

export { DEFAULT_TOOLTIPS, DEFAULT_INSERT_TOOLS };
