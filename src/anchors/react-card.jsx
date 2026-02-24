/**
 * 自定义锚点示例：React 组件卡片
 * Markdown 中写 ```react-card ... ``` 会渲染为该组件，支持 Hooks（示例：点击计数）
 */
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';

function escapeHtml(s) {
    return (s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/\n/g, '<br>');
}

function ReactCard({ source }) {
    const [count, setCount] = useState(0);
    const text = (source || '').trim() ? escapeHtml(source).trim() : '（无内容）';
    return (
        <div className="yu-react-card">
            <div className="yu-react-card-header">
                <span className="yu-react-card-badge">React</span>
                <span className="yu-react-card-count">点击 {count}</span>
            </div>
            <div className="yu-react-card-body" dangerouslySetInnerHTML={{ __html: text }} />
            <button type="button" className="yu-react-card-btn" onClick={() => setCount((c) => c + 1)}>
                点我 +1
            </button>
        </div>
    );
}

export default {
    id: 'react-card',
    language: 'react-card',
    render() {
        return '<div class="yu-react-card-mount"></div>';
    },
    mount(el, source) {
        if (el._reactRoot) {
            el._reactRoot.render(React.createElement(ReactCard, { source }));
            return;
        }
        el.innerHTML = '';
        const root = createRoot(el);
        root.render(React.createElement(ReactCard, { source }));
        el._reactRoot = root;
    },
};
