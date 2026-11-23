/**
 * 应用入口（B 负责）。
 * 只做挂载：布局与游戏逻辑都在 src/ui/ 里。
 */

import './styles.css';
import { App } from './ui/app';

const root = document.querySelector<HTMLDivElement>('#app');
if (!root) throw new Error('#app not found');

new App(root);

console.info('[frameshift] ready');
