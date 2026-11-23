/**
 * 核心模块公共入口（A 负责）。
 * ---------------------------------------------------------------
 * 约定：B 只从 '../core' 导入运行时 API 与全部类型。
 * `export * from './types'` 是已有契约，不许删；其余按 docs/SPEC.md 6.2 追加。
 * 另外把 16 个零件定义从 data/parts 转出来，图例/美术不必绕过 core 去深导入。
 */

export * from './types';
export * from './codons';
export * from './decode';
export * from './phenotype';
export * from './edit';
export * from './diff';
export * from './judge';
export * from './session';

export { PART_DEFS, PART_BY_ID } from '../data/parts';
