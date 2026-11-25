/**
 * UI 文案（电脑端 HTML · 第 1 关 Demo）
 */

export type Lang = 'zh' | 'en';
let lang: Lang = 'zh';

export const STR = {
  'app.title': { zh: '拼装小鸡', en: 'Build-a-Chick' },
  'app.subtitle': { zh: '第 1 关 · 肉鸽拼装 DEMO', en: 'STAGE 1 · ROGUELIKE DEMO' },
  'sidebar.title': { zh: '零件库', en: 'PARTS BIN' },
  'sidebar.hint': { zh: '点击装配/叠阶（最高 3 阶）；躯干最多融合 3 种拼色。', en: 'Click to equip/upgrade (max Lv.3). Torso fuses up to 3.' },
  'sidebar.clear': { zh: '清空', en: 'CLEAR' },
  'sidebar.remove': { zh: '降阶/卸下', en: 'DOWNGRADE' },
  'sidebar.add': { zh: '装上/叠阶', en: 'EQUIP / UPGRADE' },
  'sidebar.mass': { zh: '重 {n}', en: 'MASS {n}' },
  'stats.hp': { zh: '生命', en: 'HP' },
  'stats.atk': { zh: '攻击', en: 'ATK' },
  'stats.def': { zh: '防御', en: 'DEF' },
  'stats.spd': { zh: '速度', en: 'SPD' },
  'stats.mass': { zh: '负重', en: 'MASS' },
  'slot.body': { zh: '躯干', en: 'BODY' },
  'slot.beak': { zh: '口部', en: 'MOUTH' },
  'slot.legs': { zh: '腿', en: 'LEGS' },
  'slot.wings': { zh: '侧肢', en: 'LIMBS' },
  'slot.tail': { zh: '尾', en: 'TAIL' },
  'slot.crest': { zh: '头顶', en: 'HEAD' },
  'slot.body.full': { zh: '躯干（3拼色）', en: 'BODY (3-FUSE)' },
  'slot.beak.full': { zh: '口部 / 嘴', en: 'MOUTH' },
  'slot.legs.full': { zh: '腿部（1对）', en: 'LEGS (PAIR)' },
  'slot.wings.full': { zh: '侧肢（翼/臂）', en: 'LIMBS (WINGS/ARMS)' },
  'slot.tail.full': { zh: '尾部', en: 'TAIL' },
  'slot.crest.full': { zh: '头顶器官', en: 'CREST' },
  'ring.hint': { zh: '拖入装配', en: 'DROP HERE' },
  'button.fight': { zh: '出战第 1 关', en: 'PLAY STAGE 1' },
  'button.fighting': { zh: '闯关中', en: 'IN STAGE' },
  'button.perf': { zh: '性能', en: 'PERF' },
  'button.reset': { zh: '清空', en: 'CLEAR' },
  'button.undo': { zh: '撤销', en: 'UNDO' },
  'button.catalog': { zh: '动物图鉴', en: 'ANIMALS' },
  'button.presets': { zh: '方案', en: 'PRESETS' },
  'button.again': { zh: '重新挑战', en: 'RETRY' },
  'button.back': { zh: '回装配台', en: 'BACK TO LAB' },
  'button.worstReset': { zh: '重置最差', en: 'RESET WORST' },
  'perf.title': { zh: '性能面板', en: 'PERFORMANCE' },
  'perf.fps': { zh: 'FPS', en: 'FPS' },
  'perf.calls': { zh: 'draw calls', en: 'DRAW CALLS' },
  'perf.tris': { zh: '三角面', en: 'TRIANGLES' },
  'perf.parts': { zh: '已装件', en: 'PARTS' },
  'perf.worst': { zh: '本次最差', en: 'WORST FRAME' },
  'perf.minFps': { zh: '最低 FPS', en: 'MIN FPS' },
  'perf.peakCalls': { zh: '峰值 calls', en: 'PEAK CALLS' },
  'perf.peakTris': { zh: '峰值三角面', en: 'PEAK TRIS' },
  'perf.stress': { zh: '快速试装', en: 'QUICK PRESET' },
  'perf.legs10': { zh: '试装反甲铁龟', en: 'THORN TURTLE' },
  'perf.wings5': { zh: '试装火箭头槌', en: 'ROCKET HEADBUTT' },
  'perf.clear': { zh: '清空', en: 'CLEAR' },
  'perf.hint': { zh: '打开面板后记录最差帧；不参与战斗逻辑。', en: 'Worst frame is tracked while open.' },
  'battle.player': { zh: '你的小鸡', en: 'YOUR CHICK' },
  'battle.enemy': { zh: '关卡动物', en: 'ENEMY' },
  'battle.auto': { zh: '键盘操控 · A/D移动 · Space跳跃 · J攻击 · K特技', en: 'A/D Move · Space Jump · J Attack · K Special' },
  'battle.win': { zh: '击败！', en: 'VICTORY!' },
  'battle.lose': { zh: '挑战失败', en: 'DEFEAT' },
  'battle.draw': { zh: '平局', en: 'DRAW' },
  'battle.resultTitle': { zh: '战斗结算', en: 'BATTLE RESULT' },
  'battle.duration': { zh: '用时', en: 'TIME' },
  'drag.ghost': { zh: '拖到对应槽位', en: 'DROP ON SLOT' },
  'drag.wrong': { zh: '这个零件属于「{slot}」部位。', en: 'This part belongs to {slot}.' },
  'toast.installed': { zh: '装上 {name}', en: 'Equipped {name}' },
  'toast.upgraded': { zh: '{name} 叠强升至 Lv.{lv}！', en: '{name} upgraded to Lv.{lv}!' },
  'toast.fused': { zh: '躯干融合拼色：{name}（{n}/3）', en: 'Torso fused: {name} ({n}/3)' },
  'toast.replaced': { zh: '切换为 {name}', en: 'Switched to {name}' },
  'toast.removed': { zh: '卸下 {name}', en: 'Removed {name}' },
  'toast.downgraded': { zh: '{name} 降至 Lv.{lv}', en: '{name} downgraded to Lv.{lv}' },
  'toast.cleared': { zh: '已清空 {slot}', en: 'Cleared {slot}' },
  'toast.maxLevel': { zh: '{name} 已达满阶 Lv.3！', en: '{name} is already max Lv.3!' },
  'toast.fusionFull': { zh: '躯干最多融合 3 种拼色，请先拆掉一个。', en: 'Torso max 3 fusions. Remove one first.' },
  'toast.error': { zh: '该操作不可执行。', en: 'Action not allowed.' },
  'toast.clearAll': { zh: '已清空全部零件', en: 'All parts cleared' },
  'toast.undo': { zh: '已撤销上一步操作', en: 'Undid last change' },
  'note.synergy': { zh: '特殊组合', en: 'COMBOS' },
} as const;

export type StrKey = keyof typeof STR;

export function t(key: StrKey, vars?: Record<string, string | number>): string {
  const entry = STR[key] as { zh: string; en: string };
  let out = entry[lang] ?? entry.zh;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) out = out.replaceAll(`{${k}}`, String(v));
  }
  return out;
}

export function setLang(next: Lang): void {
  lang = next;
  document.documentElement.lang = next === 'zh' ? 'zh-CN' : 'en';
}

export function getLang(): Lang {
  return lang;
}
