/**
 * i18n 护栏（B 负责）。
 * 只断言字典结构，不依赖 DOM；vitest 在 node 环境即可运行。
 */

import { describe, expect, it } from 'vitest';
import { en, format, zh, type MessageKey } from './i18n';

describe('i18n dictionaries', () => {
  it('en 与 zh 的键双向差集为空', () => {
    const enKeys = new Set(Object.keys(en));
    const zhKeys = new Set(Object.keys(zh));
    const missingInZh = [...enKeys].filter((key) => !zhKeys.has(key));
    const missingInEn = [...zhKeys].filter((key) => !enKeys.has(key));
    expect(missingInZh).toEqual([]);
    expect(missingInEn).toEqual([]);
  });

  it('没有空字符串或纯空白文案', () => {
    for (const dict of [en, zh]) {
      for (const [key, value] of Object.entries(dict)) {
        expect(value.trim(), key).not.toBe('');
      }
    }
  });

  it('插值保留数字与拉丁缩写，并支持缺省占位符', () => {
    expect(format('SPECIMEN {n}', { n: 11 })).toBe('SPECIMEN 11');
    expect(format('剩余 {n} 次编辑', { n: 2 })).toBe('剩余 2 次编辑');
    expect(format('L{n} · {name}', { n: 1, name: 'One Base Short' })).toBe(
      'L1 · One Base Short',
    );
    expect(format('missing {n}')).toBe('missing {n}');
  });

  it('语义键类型可被引用', () => {
    const key: MessageKey = 'common.run';
    expect(en[key]).toBe('RUN');
    expect(zh[key]).toBe('运行');
  });
});
