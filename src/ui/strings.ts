/**
 * UI 文案（B 负责）。中文为主，结构上保留 en。
 * 暂不暴露切换；后续直接 setLang('en') 即可。
 */

export type Lang = 'zh' | 'en';
let lang: Lang = 'zh';

export const STR = {
  'app.title': { zh: '拼装小鸡', en: 'Build-a-Chick' },
  'app.subtitle': { zh: '装配实验 · M0', en: 'ASSEMBLY LAB · M0' },
  'app.tagline': { zh: '装上去，然后看它怎么打。', en: 'Bolt it on. Watch it fight.' },
  'sidebar.title': { zh: '零件库', en: 'PARTS BIN' },
  'sidebar.hint': { zh: '点击安装；按住拖到鸡身上的槽位环。', en: 'Click to install, or drag onto a slot ring.' },
  'sidebar.clear': { zh: '清空', en: 'CLEAR' },
  'sidebar.installed': { zh: '已装', en: 'INSTALLED' },
  'sidebar.empty': { zh: '还没装', en: 'EMPTY' },
  'sidebar.remove': { zh: '卸下', en: 'REMOVE' },
  'sidebar.add': { zh: '装上', en: 'ADD' },
  'sidebar.mass': { zh: '重 {n}', en: 'MASS {n}' },
  'sidebar.tier': { zh: '{n} 阶', en: 'T{n}' },
  'sidebar.parts': { zh: '{n} 件', en: '{n} PCS' },
  'stats.hp': { zh: '生命', en: 'HP' },
  'stats.atk': { zh: '攻击', en: 'ATK' },
  'stats.def': { zh: '防御', en: 'DEF' },
  'stats.spd': { zh: '速度', en: 'SPD' },
  'stats.mass': { zh: '重量', en: 'MASS' },
  'stats.capacity': { zh: '容量', en: 'CAP' },
  'slot.body': { zh: '躯干', en: 'BODY' },
  'slot.beak': { zh: '喙', en: 'BEAK' },
  'slot.legs': { zh: '腿', en: 'LEGS' },
  'slot.wings': { zh: '翼', en: 'WINGS' },
  'slot.tail': { zh: '尾', en: 'TAIL' },
  'slot.crest': { zh: '冠', en: 'CREST' },
  'slot.body.full': { zh: '躯干', en: 'BODY' },
  'slot.beak.full': { zh: '喙部', en: 'BEAK' },
  'slot.legs.full': { zh: '腿脚', en: 'LEGS' },
  'slot.wings.full': { zh: '翅膀', en: 'WINGS' },
  'slot.tail.full': { zh: '尾巴', en: 'TAIL' },
  'slot.crest.full': { zh: '头冠', en: 'CREST' },
  'ring.hint': { zh: '拖到这里', en: 'DROP HERE' },
  'button.fight': { zh: '开打', en: 'FIGHT' },
  'button.fighting': { zh: '战斗中', en: 'FIGHTING' },
  'button.perf': { zh: '性能', en: 'PERF' },
  'button.reset': { zh: '全部清空', en: 'CLEAR ALL' },
  'button.again': { zh: '再来一局', en: 'AGAIN' },
  'button.back': { zh: '回去改装', en: 'BACK TO LAB' },
  'button.close': { zh: '关闭', en: 'CLOSE' },
  'button.worstReset': { zh: '重置最差', en: 'RESET WORST' },
  'perf.title': { zh: '性能面板', en: 'PERFORMANCE' },
  'perf.fps': { zh: 'FPS', en: 'FPS' },
  'perf.calls': { zh: 'draw calls', en: 'DRAW CALLS' },
  'perf.tris': { zh: '三角面', en: 'TRIANGLES' },
  'perf.parts': { zh: '零件数', en: 'PARTS' },
  'perf.worst': { zh: '本次最差', en: 'WORST FRAME' },
  'perf.minFps': { zh: '最低 FPS', en: 'MIN FPS' },
  'perf.peakCalls': { zh: '峰值 calls', en: 'PEAK CALLS' },
  'perf.peakTris': { zh: '峰值三角面', en: 'PEAK TRIS' },
  'perf.stress': { zh: '压力测试', en: 'STRESS' },
  'perf.legs10': { zh: '+10 条腿', en: '+10 LEGS' },
  'perf.wings5': { zh: '+5 对翅膀', en: '+5 WING PAIRS' },
  'perf.clear': { zh: '清空', en: 'CLEAR' },
  'perf.hint': { zh: '打开面板后记录最差帧；不参与逻辑。', en: 'Worst frame is tracked while open.' },
  'battle.title': { zh: '训练场', en: 'TRAINING YARD' },
  'battle.player': { zh: '实验体', en: 'SPECIMEN' },
  'battle.enemy': { zh: '铁皮小兵', en: 'TIN SOLDIER' },
  'battle.auto': { zh: '自动战斗 · 30Hz', en: 'AUTO BATTLE · 30Hz' },
  'battle.start': { zh: '开打！', en: 'FIGHT!' },
  'battle.needBeak': { zh: '先装个喙，不然它没法攻击。', en: 'Install a beak first — it cannot attack.' },
  'battle.seconds': { zh: '{n} 秒', en: '{n}s' },
  'battle.win': { zh: '胜利', en: 'VICTORY' },
  'battle.lose': { zh: '败北', en: 'DEFEAT' },
  'battle.draw': { zh: '平局', en: 'DRAW' },
  'battle.resultTitle': { zh: '战斗结束', en: 'BATTLE OVER' },
  'battle.remaining': { zh: '剩余生命', en: 'HP LEFT' },
  'battle.duration': { zh: '用时', en: 'DURATION' },
  'battle.winner': { zh: '{name} 赢了', en: '{name} WINS' },
  'battle.noParts': { zh: '裸鸡上阵。', en: 'Naked chick deployed.' },
  'drag.ghost': { zh: '拖到对应槽位', en: 'DROP ON SLOT' },
  'drag.wrong': { zh: '这个零件不属于「{slot}」。', en: 'This part does not belong to {slot}.' },
  'toast.installed': { zh: '装上 {name}', en: 'Installed {name}' },
  'toast.removed': { zh: '卸下 {name}', en: 'Removed {name}' },
  'toast.cleared': { zh: '已清空 {slot}', en: 'Cleared {slot}' },
  'toast.tooMany': { zh: '零件到上限了（64）。', en: 'Part limit reached (64).' },
  'toast.error': { zh: '这个操作不行。', en: 'That edit is not allowed.' },
  'toast.stressLegs': { zh: '加载 10 条弹簧腿', en: 'Loading 10 spring legs' },
  'toast.stressWings': { zh: '加载 5 对羽翼', en: 'Loading 5 wing pairs' },
  'toast.clearAll': { zh: '已清空全部零件', en: 'All parts cleared' },
  'note.synergy': { zh: '协同', en: 'SYNERGY' },
  'footer.hint': { zh: '布局来自 core.layoutParts() · 渲染层只消费 PlacedPart', en: 'Layout: core.layoutParts() · renderer consumes PlacedPart only' },
  'common.count': { zh: '{n}', en: '{n}' },
  'common.off': { zh: '关', en: 'OFF' },
  'common.on': { zh: '开', en: 'ON' },
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
