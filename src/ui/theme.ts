/**
 * 主题常量（B 负责）。
 * ---------------------------------------------------------------
 * 冷色实验室 + 高对比强调色。所有颜色/字号/尺寸集中在这里，
 * canvas 与 CSS 共用同一套语义色，避免两边漂移。
 */

import type { Base, Family } from '../core';

/** 语义色板。 */
export const COLORS = {
  bg: '#070b10',
  bgDeep: '#05080c',
  panel: '#0c141e',
  panel2: '#101c28',
  panel3: '#162534',
  panel4: '#1b2d3f',
  line: '#22384b',
  lineSoft: '#182838',
  ink: '#e9f2f8',
  inkSoft: '#b8c9d6',
  dim: '#7d92a4',
  faint: '#4b6172',
  ghost: '#355064',
  accent: '#5fe3c8',
  accentDim: '#2c8f80',
  amber: '#f2b24b',
  ok: '#68e28e',
  bad: '#ff6b7a',
  warn: '#ffc857',
  stageTop: '#0a1621',
  stageBottom: '#060c12',
  ground: '#28455c',
  groundDim: '#152838',
} as const;

/** 碱基 → 荧光染色。 */
export const BASE_COLORS: Readonly<Record<Base, string>> = {
  A: '#f2b24b',
  U: '#46c8b2',
  G: '#a58bf0',
  C: '#ef7d9b',
};

/** 家族色与首字母碱基色一致。 */
export const FAMILY_COLORS: Readonly<Record<Family, string>> = {
  A: BASE_COLORS.A,
  U: BASE_COLORS.U,
  G: BASE_COLORS.G,
  C: BASE_COLORS.C,
};


export const FONT_MONO =
  "ui-monospace, 'SFMono-Regular', 'JetBrains Mono', Menlo, Consolas, 'PingFang SC', 'Noto Sans SC', 'Microsoft YaHei', monospace";
export const FONT_UI =
  "'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, 'PingFang SC', 'Noto Sans SC', 'Microsoft YaHei', sans-serif";

/** 基因带尺寸。 */
export const RIBBON = {
  /** 碱基格 26×34（SPEC 4.2）。 */
  baseW: 26,
  baseH: 34,
  /** 同一密码子内碱基间隙。 */
  baseGap: 3,
  /** 密码子之间的分组间隙。 */
  codonGap: 14,
  padX: 22,
  /** 顶部读框标尺。 */
  rulerY: 16,
  /** 分组框上沿。 */
  boxY: 38,
  /** 碱基行上沿。 */
  baseY: 44,
  /** 零件图标中心。 */
  iconY: 112,
  iconSize: 40,
  labelY: 150,
  /** 画布逻辑高度。 */
  height: 172,
  /** 插入缝隙的可视宽度 / 命中宽度。 */
  gapW: 12,
  gapHit: 20,
} as const;

/** 舞台尺寸。 */
export const STAGE = {
  groundH: 74,
  startPad: 64,
  endPad: 78,
} as const;

/** 动画时长（毫秒）。 */
export const TIMING = {
  shift: 210,
  scan: 220,
  flipStagger: 55,
  flip: 160,
  insertDrop: 130,
  deleteFly: 150,
  partGrow: 320,
  gateHold: 430,
  failHold: 820,
  run: 4500,
} as const;

/** 发光的柔光系数（供 canvas shadowBlur 用）。 */
export const GLOW_BLUR = 12;
