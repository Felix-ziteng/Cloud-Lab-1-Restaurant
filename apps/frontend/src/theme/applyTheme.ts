import type { UiTheme } from '@restaurant/shared-types';

// 唯一负责把 uiTheme 写到 <html data-theme> 上的地方——CSS 那边 index.css 里
// :root[data-theme='warm'] 对应这个属性。前台切换主题、以及每个页面首次加载读到
// StoreConfig 时，都调用这个函数，不要各自去操作 document.documentElement。
export function applyTheme(theme: UiTheme) {
  document.documentElement.dataset.theme = theme;
}
