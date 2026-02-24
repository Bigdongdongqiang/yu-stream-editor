/**
 * 自定义锚点示例：Vue 3 组件卡片
 * Markdown 中写 ```vue-card ... ``` 会渲染为该组件，支持响应式（示例：点击计数）
 */
import { createApp, ref, h } from 'vue';

function escapeHtml(s) {
    return (s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/\n/g, '<br>');
}

export default {
    id: 'vue-card',
    language: 'vue-card',
    render() {
        return '<div class="yu-vue-card-mount"></div>';
    },
    mount(el, source) {
        if (el._vueApp) {
            el._vueApp.unmount();
            el._vueApp = null;
        }
        el.innerHTML = '';
        const Component = {
            props: { source: { type: String, default: '' } },
            setup(props) {
                const count = ref(0);
                return () => h('div', { class: 'yu-vue-card' }, [
                    h('div', { class: 'yu-vue-card-header' }, [
                        h('span', { class: 'yu-vue-card-badge' }, 'Vue 3'),
                        h('span', { class: 'yu-vue-card-count' }, `点击 ${count.value}`),
                    ]),
                    h('div', {
                        class: 'yu-vue-card-body',
                        innerHTML: escapeHtml(props.source || '').trim() || '（无内容）',
                    }),
                    h('button', {
                        class: 'yu-vue-card-btn',
                        onClick: () => { count.value++; },
                    }, '点我 +1'),
                ]);
            },
        };
        const app = createApp(Component, { source });
        app.mount(el);
        el._vueApp = app;
    },
};
