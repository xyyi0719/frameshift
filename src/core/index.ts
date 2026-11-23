/**
 * 核心层公共入口（A 负责）。
 * B 只从这里 import：类型、配置表、布局、属性、装配、战斗。
 * 内核没有任何 DOM / three 依赖。
 */

export * from './types';
export * from './synergies';
export * from './layout';
export * from './stats';
export * from './creature';
export * from './battle';

export { PART_DEFS, PART_BY_ID, PARTS_BY_SLOT } from '../data/parts';
