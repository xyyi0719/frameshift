/**
 * 关卡注册表（A 负责）。
 * 加一关 = 新建 levelNN.ts，然后在 LEVELS 里按 number 顺序追加。
 * UI 不按关卡号分支，所有差异都来自 Level 字段。
 */

import type { Level } from '../core/types';
import { LEVEL_01 } from './level01';
import { LEVEL_02 } from './level02';

/** 游戏的全部关卡，按 number 升序。 */
export const LEVELS: readonly Level[] = [LEVEL_01, LEVEL_02];

export function levelById(id: string): Level | undefined {
  return LEVELS.find((level) => level.id === id);
}

export function levelAt(index: number): Level | undefined {
  if (!Number.isInteger(index) || index < 0 || index >= LEVELS.length) {
    return undefined;
  }
  return LEVELS[index];
}

export { LEVEL_01, LEVEL_02 };
