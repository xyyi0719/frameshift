/**
 * 中 / 英双语文案表（B 负责）。
 * ---------------------------------------------------------------
 * en 是唯一键真源，zh 必须完整覆盖；插值统一走 {name}，不要拼接语序。
 * 关卡 / 零件 / 闸门的数据在 core 与 levels 里，这里只按 id 提供译文，
 * UI 读取时统一通过 levelText / partLabel / gateText 等 helper 查表。
 */

import type { Family, Gate, Level, PartId, StatKey } from '../core';

export type Lang = 'en' | 'zh';

export const en = {
  /* 应用 */
  'app.title': 'FRAMESHIFT',
  'app.brand': 'FRAMESHIFT',
  'app.language': 'Language',
  'app.chooseLanguage': 'Choose language',

  /* 通用 */
  'common.next': 'NEXT',
  'common.reset': 'RESET',
  'common.undo': 'UNDO',
  'common.run': 'RUN',
  'common.retry': 'RETRY',
  'common.running': 'RUNNING',
  'common.cleared': 'CLEARED',
  'common.start': 'START',
  'common.stop': 'STOP',
  'common.all': 'ALL',
  'common.any': 'ANY',
  'common.close': 'Close',
  'common.escCancel': 'ESC TO CANCEL',
  'common.partFallback': 'PART',
  'common.noBonus': 'NO BONUS',

  /* HUD */
  'hud.target': 'TARGET',
  'hud.edits': 'EDITS',
  'hud.editsTitle': 'Edits left',
  'hud.undoTitle': 'Undo (Ctrl+Z)',
  'hud.resetTitle': 'Reset this specimen',
  'hud.insert': 'INSERT',
  'hud.delete': 'DELETE',
  'hud.replace': 'REPLACE',
  'hud.modeInsertTitle': 'INSERT tool',
  'hud.modeDeleteTitle': 'DELETE tool',
  'hud.modeReplaceTitle': 'REPLACE tool',
  'hud.modeLockedTitle': 'LOCKED in this specimen',
  'hud.toolsAria': 'Editing tools',
  'hud.statsAria': 'Creature stats',
  'hud.mute': 'Mute sound',
  'hud.unmute': 'Unmute sound',
  'hud.sound': 'Sound',
  'hud.legendToggle': 'Toggle codon table',
  'hud.legendAria': 'Toggle codon table',
  'hud.help': 'How to play',
  'hud.specimen': 'SPECIMEN {n}',

  /* 九项属性 */
  'stat.stride': 'STRIDE',
  'stat.flight': 'FLIGHT',
  'stat.swim': 'SWIM',
  'stat.armor': 'ARMOR',
  'stat.spikes': 'SPIKES',
  'stat.glow': 'GLOW',
  'stat.sight': 'SIGHT',
  'stat.grip': 'GRIP',
  'stat.bite': 'BITE',

  /* 基因带 */
  'ribbon.aria': 'Gene ribbon: editable sequence of codons',
  'ribbon.chooseBaseAria': 'Choose a base',
  'ribbon.modeInsert': 'INSERT · click a gap between bases',
  'ribbon.modeDelete': 'DELETE · click a base',
  'ribbon.modeReplace': 'REPLACE · click a base',
  'ribbon.modeLocked': 'EDITING LOCKED',
  'ribbon.modeSelect': 'SELECT A TOOL',
  'ribbon.pickerActive': 'PICK A BASE · ESC CANCEL',
  'ribbon.insertAt': 'INSERT AT {n}',
  'ribbon.replaceAt': 'REPLACE {n}',
  'ribbon.notAvailable': '{op} IS NOT AVAILABLE IN THIS SPECIMEN',
  'ribbon.live': 'THE TRACK IS LIVE — NO EDITING DURING A RUN',
  'ribbon.untranslated': 'UNTRANSLATED',
  'ribbon.dangling': 'DANGLING',
  'ribbon.scroll': 'SCROLL',
  'ribbon.pickerCancel': 'ESC TO CANCEL',
  'ribbon.keys.move': 'move',
  'ribbon.keys.insert': 'insert',
  'ribbon.keys.delete': 'delete',
  'ribbon.keys.replace': 'replace',
  'ribbon.keys.undo': 'undo',
  'ribbon.tip.partTitle': '{codon} · {label}',
  'ribbon.tip.stopTitle': '{codon} · STOP',
  'ribbon.tip.junkTitle': '{codon} · UNTRANSLATED',
  'ribbon.tip.partialTitle': '{codon} · DANGLING',
  'ribbon.tip.stopBody': 'Reading stops here.',
  'ribbon.tip.junkBody': 'Outside the reading frame. Still editable.',
  'ribbon.tip.partialBody': 'Too short to read. Dropped at the end.',
  'ribbon.tip.stopFooter': 'STOP',
  'ribbon.insertAria': 'Insert {base}',
  'ribbon.replaceAria': 'Replace {base}',

  /* 密码表 */
  'legend.title': 'CODON TABLE',
  'legend.subtitle': 'Every three bases read as one part.',
  'legend.parts': '{n} PARTS',
  'legend.searchPlaceholder': 'Search parts',
  'legend.searchAria': 'Search parts',
  'legend.noResults': 'No parts match.',
  'legend.family.A': 'SENSES',
  'legend.family.U': 'LIMBS',
  'legend.family.G': 'SHELL',
  'legend.family.C': 'ORGANS',
  'legend.stop': 'STOP',
  'legend.stopNote': 'Reading stops here. No part grows.',
  'legend.footnote': 'Hover a group on the ribbon to inspect it.',
  'legend.jarTitle': 'SPECIMEN JAR',
  'legend.jarEmpty': 'Nothing logged yet. Clear a track to keep a specimen.',
  'legend.jarAria': 'Logged specimens',

  /* 16 个零件（label / blurb） */
  'part.head.label': 'Head',
  'part.head.blurb': 'The first word read. Everything else follows it.',
  'part.eye.label': 'Eye',
  'part.eye.blurb': 'Wide and unblinking, tuned to the dark.',
  'part.horn.label': 'Horn',
  'part.horn.blurb': 'Bone pointed forward, for arguing with rocks.',
  'part.antenna.label': 'Antenna',
  'part.antenna.blurb': 'A thin feeler tasting the air ahead.',
  'part.leg.label': 'Leg',
  'part.leg.blurb': 'Two good steps, if the ground agrees.',
  'part.longleg.label': 'Long Leg',
  'part.longleg.blurb': 'Three steps at once, and a long reach.',
  'part.claw.label': 'Claw',
  'part.claw.blurb': 'One step, but it holds whatever it finds.',
  'part.fin.label': 'Fin',
  'part.fin.blurb': 'A soft paddle that prefers water to stone.',
  'part.shell.label': 'Shell',
  'part.shell.blurb': 'Layered plate, warm and very difficult to open.',
  'part.spike.label': 'Spike',
  'part.spike.blurb': 'A row of small warnings along the back.',
  'part.crest.label': 'Crest',
  'part.crest.blurb': 'A raised ridge, half display and half shield.',
  'part.wing.label': 'Wing',
  'part.wing.blurb': 'Two thin membranes that insist on height.',
  'part.glow.label': 'Glow Organ',
  'part.glow.blurb': 'A small lamp grown from living tissue.',
  'part.maw.label': 'Maw',
  'part.maw.blurb': 'A ring of teeth with no particular manners.',
  'part.sac.label': 'Air Sac',
  'part.sac.blurb': 'A pocket of air under a layer of hide.',
  'part.gill.label': 'Gill',
  'part.gill.blurb': 'Three wet slits, breathing the shallows.',

  /* 关卡文案（数据仍来自 levels，这里按 id 提供中英显示） */
  'level.l01.name': 'One Base Short',
  'level.l01.species': 'Gill Blob',
  'level.l01.target': 'IT CANNOT WALK. Seven gills, no legs — and the crack is dry.',
  'level.l01.intro':
    'Specimen 011. It breathes through seven gills and owns no legs at all. The crack ahead is four metres of dry rock.',
  'level.l01.hint': 'One base is missing. The reading frame is off by one — slide it back.',
  'level.l02.name': 'The Long Way Down',
  'level.l02.species': 'Bramble Fin',
  'level.l02.target':
    'THE RAVINE IS TOO WIDE TO WALK. Nothing with six plates of armour gets airborne.',
  'level.l02.intro':
    'Specimen 027. Armoured, spined, finned — and far too heavy to fly. The ravine does not care how well you swim.',
  'level.l02.hint': 'You cannot add your way out of this one. Remove a single base and read again.',

  /* 闸门 */
  'gate.crack.label': 'The Crack',
  'gate.crack.hint': '4 m across. Swimming will not help.',
  'gate.ravine.label': 'The Ravine',
  'gate.ravine.hint': '6 m gap, far side higher. Wings only.',

  /* 舞台 */
  'stage.aria': 'Side view track. The creature runs toward a gate and the finish flag.',
  'stage.start': 'START',
  'stage.finish': 'FINISH',
  'stage.running': 'RUNNING',
  'stage.observation': 'OBSERVATION BAY',
  'stage.track': 'TRACK 01',
  'stage.cleared': 'CLEARED',
  'stage.tooShort': 'TOO SHORT',
  'stage.requirement': '{mode} · {reqs}',

  /* 状态与提示 */
  'state.noStartStamp': 'NO START CODON',
  'state.noStopStamp': 'NO STOP CODON',
  'state.noStartExplain': 'NO START CODON — the ribosome has nothing to read.',
  'state.noStopExplain': 'NO STOP CODON — the creature never finishes growing.',
  'state.emptyExplain': 'NO BASES — there is nothing to read.',
  'state.badCharExplain': 'UNREADABLE BASE — the ribosome skips this sequence.',
  'state.hint': 'HINT — {hint}',
  'state.brief': 'SPECIMEN {n}',

  /* Toast */
  'toast.silent': 'THE MIDDLE BASE IS SILENT',
  'toast.untranslated': 'UNTRANSLATED REGION — NO PART CHANGED',
  'toast.noReadingFrame': 'NO READING FRAME',
  'toast.undone': 'UNDONE — UNDO IS FREE',
  'toast.specimenReset': 'SPECIMEN RESET',
  'toast.soundOff': 'SOUND OFF',
  'toast.soundOn': 'SOUND ON',
  'toast.alreadyCleared': 'SPECIMEN ALREADY CLEARED',
  'toast.clearedUseNext': 'SPECIMEN CLEARED — USE NEXT',
  'toast.noUndoRunning': 'NO UNDO WHILE RUNNING',
  'toast.noResetRunning': 'NO RESET WHILE RUNNING',
  'toast.nothingUndo': 'NOTHING TO UNDO',
  'toast.cannotDevelop': 'THE CREATURE CANNOT DEVELOP',
  'toast.lockedOp': 'TOOL LOCKED IN THIS SPECIMEN',
  'toast.noBudget': 'NO EDITS LEFT — UNDO IS FREE',
  'toast.outOfRange': 'OUT OF RANGE',
  'toast.invalidBase': 'NOT A VALID BASE',
  'toast.tooLong': 'SEQUENCE FULL — {n} BASES MAX',
  'toast.noChange': 'SAME BASE — NOTHING CHANGED',
  'toast.editRejected': 'EDIT REJECTED',
  'toast.level': 'L{n} — {name}',
  'debug.level': 'level',
  'debug.history': 'history',
  'debug.issue': 'issue',
  'debug.stats': 'stats',
  'debug.judge': 'judge',
  'debug.solution': 'solution',

  /* 结算卡片 */
  'result.kicker': 'SPECIMEN LOGGED',
  'result.dialogAria': 'Specimen logged',
  'result.levelLine': 'L{n} · {name}',
  'result.edits': '{used} / {par} EDITS',
  'result.statChip': '{value} {stat}',
  'result.chainStop': 'STOP {codon}',
  'result.next': 'NEXT · {name}',
  'result.allLogged': 'Every specimen in this build is logged.',
  'result.reset': 'RESET',

  /* 新手引导 */
  'guide.dialogAria': 'How to play',
  'guide.closeAria': 'Close guide',
  'guide.step': '{n} / 03',
  'guide.next': 'NEXT',
  'guide.done': 'GOT IT',
  'guide.runPill': 'RUN',
  'guide.step1.title': 'Every three bases are one part.',
  'guide.step1.body':
    'The ribbon is read three letters at a time. Each group becomes a body part.',
  'guide.step2.title': 'Add or remove one base. Everything downstream shifts.',
  'guide.step2.body':
    'One extra letter re-reads the whole sentence from that point on. Parts flip into different parts. This is the shift.',
  'guide.step3.title': 'Fix the frame. Then run the track.',
  'guide.step3.body':
    'Clear every gate to log the specimen. Edits are limited, undo is free, and the track never locks you out.',
} as const;

export type MessageKey = keyof typeof en;

export const zh: Record<MessageKey, string> = {
  'app.title': 'FRAMESHIFT · 移码',
  'app.brand': '移码',
  'app.language': '语言',
  'app.chooseLanguage': '选择语言',

  'common.next': '下一关',
  'common.reset': '重置',
  'common.undo': '撤销',
  'common.run': '运行',
  'common.retry': '重试',
  'common.running': '运行中',
  'common.cleared': '已通关',
  'common.start': '起点',
  'common.stop': '终止',
  'common.all': '全部',
  'common.any': '任一',
  'common.close': '关闭',
  'common.escCancel': 'ESC 取消',
  'common.partFallback': '零件',
  'common.noBonus': '无增益',

  'hud.target': '目标',
  'hud.edits': '编辑',
  'hud.editsTitle': '剩余编辑次数',
  'hud.undoTitle': '撤销（Ctrl+Z）',
  'hud.resetTitle': '重置本标本',
  'hud.insert': '插入',
  'hud.delete': '删除',
  'hud.replace': '替换',
  'hud.modeInsertTitle': '插入工具',
  'hud.modeDeleteTitle': '删除工具',
  'hud.modeReplaceTitle': '替换工具',
  'hud.modeLockedTitle': '本标本未解锁',
  'hud.toolsAria': '编辑工具',
  'hud.statsAria': '生物属性',
  'hud.mute': '静音',
  'hud.unmute': '取消静音',
  'hud.sound': '声音',
  'hud.legendToggle': '显示或隐藏密码表',
  'hud.legendAria': '显示或隐藏密码表',
  'hud.help': '玩法说明',
  'hud.specimen': '标本 {n}',

  'stat.stride': '步幅',
  'stat.flight': '飞行',
  'stat.swim': '游泳',
  'stat.armor': '护甲',
  'stat.spikes': '尖刺',
  'stat.glow': '发光',
  'stat.sight': '感知',
  'stat.grip': '抓握',
  'stat.bite': '咬合',

  'ribbon.aria': '基因带：可编辑的密码子序列',
  'ribbon.chooseBaseAria': '选择一个碱基',
  'ribbon.modeInsert': '插入 · 点击碱基之间的缝隙',
  'ribbon.modeDelete': '删除 · 点击一个碱基',
  'ribbon.modeReplace': '替换 · 点击一个碱基',
  'ribbon.modeLocked': '编辑已锁定',
  'ribbon.modeSelect': '选择一个工具',
  'ribbon.pickerActive': '选择碱基 · ESC 取消',
  'ribbon.insertAt': '在 {n} 处插入',
  'ribbon.replaceAt': '替换第 {n} 位',
  'ribbon.notAvailable': '{op}在本标本中不可用',
  'ribbon.live': '跑道运行中，不能编辑',
  'ribbon.untranslated': '未翻译',
  'ribbon.dangling': '悬空残片',
  'ribbon.scroll': '滚动',
  'ribbon.pickerCancel': 'ESC 取消',
  'ribbon.keys.move': '移动',
  'ribbon.keys.insert': '插入',
  'ribbon.keys.delete': '删除',
  'ribbon.keys.replace': '替换',
  'ribbon.keys.undo': '撤销',
  'ribbon.tip.partTitle': '{codon} · {label}',
  'ribbon.tip.stopTitle': '{codon} · 终止',
  'ribbon.tip.junkTitle': '{codon} · 未翻译',
  'ribbon.tip.partialTitle': '{codon} · 悬空残片',
  'ribbon.tip.stopBody': '读到此处为止。',
  'ribbon.tip.junkBody': '读框之外，仍然可以编辑。',
  'ribbon.tip.partialBody': '不足三个碱基，读不出零件。',
  'ribbon.tip.stopFooter': '终止',
  'ribbon.insertAria': '插入 {base}',
  'ribbon.replaceAria': '替换 {base}',

  'legend.title': '密码表',
  'legend.subtitle': '每三个碱基读成一个零件。',
  'legend.parts': '{n} 个零件',
  'legend.searchPlaceholder': '搜索零件',
  'legend.searchAria': '搜索零件',
  'legend.noResults': '没有匹配的零件。',
  'legend.family.A': '感官',
  'legend.family.U': '肢体',
  'legend.family.G': '外壳',
  'legend.family.C': '内脏',
  'legend.stop': '终止',
  'legend.stopNote': '读到此处为止，不再长出零件。',
  'legend.footnote': '把鼠标停在基因带的分组上可查看详情。',
  'legend.jarTitle': '标本罐',
  'legend.jarEmpty': '还没有标本。跑通一条跑道，把生物留在这里。',
  'legend.jarAria': '已记录的标本',

  'part.head.label': '头部',
  'part.head.blurb': '读出的第一个词，其余一切都跟着它。',
  'part.eye.label': '眼睛',
  'part.eye.blurb': '宽大而不眨眼，适应黑暗。',
  'part.horn.label': '角',
  'part.horn.blurb': '向前突出的骨质，用来和石头争论。',
  'part.antenna.label': '触角',
  'part.antenna.blurb': '一根细长的触须，品尝前方的空气。',
  'part.leg.label': '腿',
  'part.leg.blurb': '走两步没问题，只要地面同意。',
  'part.longleg.label': '长腿',
  'part.longleg.blurb': '一步顶三步，还能伸得很远。',
  'part.claw.label': '爪',
  'part.claw.blurb': '只能走一步，但抓住什么就不会松。',
  'part.fin.label': '鳍',
  'part.fin.blurb': '柔软的桨，更喜欢水而不是石头。',
  'part.shell.label': '甲壳',
  'part.shell.blurb': '层层叠叠的甲片，温暖且极难撬开。',
  'part.spike.label': '尖刺',
  'part.spike.blurb': '背上一排小小的警告。',
  'part.crest.label': '冠',
  'part.crest.blurb': '隆起的脊，一半是展示，一半是盾。',
  'part.wing.label': '翼',
  'part.wing.blurb': '两片薄薄的膜，执意要往高处去。',
  'part.glow.label': '发光器',
  'part.glow.blurb': '由活组织长出的一盏小灯。',
  'part.maw.label': '口器',
  'part.maw.blurb': '一圈没有什么礼貌的牙齿。',
  'part.sac.label': '气囊',
  'part.sac.blurb': '一层皮下面的一袋空气。',
  'part.gill.label': '鳃',
  'part.gill.blurb': '三道湿润的缝，呼吸浅滩。',

  'level.l01.name': '少了一个碱基',
  'level.l01.species': '鳃团',
  'level.l01.target': '它不会走路。七条鳃、没有腿——而裂缝是干的。',
  'level.l01.intro':
    '标本 011。它用七条鳃呼吸，一条腿也没有。前方的裂缝是四米宽的干岩。',
  'level.l01.hint': '少了一个碱基。读框错开了一位——把它推回去。',
  'level.l02.name': '漫长的下落',
  'level.l02.species': '荆棘鳍',
  'level.l02.target': '峡谷太宽，走不过去。六片甲壳的东西飞不起来。',
  'level.l02.intro':
    '标本 027。有甲、有刺、有鳍——但太重，飞不起来。峡谷不在乎你多会游泳。',
  'level.l02.hint': '这一关不能靠加碱基。删掉一个，再读一次。',

  'gate.crack.label': '裂缝',
  'gate.crack.hint': '四米宽。会游泳也没用。',
  'gate.ravine.label': '峡谷',
  'gate.ravine.hint': '六米宽的缺口，对面更高。只有翅膀能过去。',

  'stage.aria': '侧视跑道。生物向前跑向闸门和终点旗。',
  'stage.start': '起点',
  'stage.finish': '终点',
  'stage.running': '运行中',
  'stage.observation': '观察舱',
  'stage.track': '跑道 01',
  'stage.cleared': '通过',
  'stage.tooShort': '不够长',
  'stage.requirement': '{mode} · {reqs}',

  'state.noStartStamp': '没有起始密码子',
  'state.noStopStamp': '没有终止密码子',
  'state.noStartExplain': '没有起始密码子——核糖体没有可读的内容。',
  'state.noStopExplain': '没有终止密码子——生物永远长不完。',
  'state.emptyExplain': '没有碱基——没有可读的内容。',
  'state.badCharExplain': '无法识别的碱基——核糖体跳过了这段序列。',
  'state.hint': '提示——{hint}',
  'state.brief': '标本 {n}',

  'toast.silent': '中间的碱基是沉默位',
  'toast.untranslated': '非翻译区——没有零件改变',
  'toast.noReadingFrame': '没有可读的读框',
  'toast.undone': '已撤销——撤销是免费的',
  'toast.specimenReset': '标本已重置',
  'toast.soundOff': '声音已关闭',
  'toast.soundOn': '声音已开启',
  'toast.alreadyCleared': '标本已经通关',
  'toast.clearedUseNext': '标本已通关，请点下一关',
  'toast.noUndoRunning': '运行中不能撤销',
  'toast.noResetRunning': '运行中不能重置',
  'toast.nothingUndo': '没有可撤销的操作',
  'toast.cannotDevelop': '这只生物发育不起来',
  'toast.lockedOp': '该工具在本标本中未解锁',
  'toast.noBudget': '没有编辑次数了——撤销是免费的',
  'toast.outOfRange': '超出范围',
  'toast.invalidBase': '不是合法的碱基',
  'toast.tooLong': '序列已满——最多 {n} 个碱基',
  'toast.noChange': '同一个碱基——没有变化',
  'toast.editRejected': '编辑被拒绝',
  'toast.level': '第 {n} 关——{name}',
  'debug.level': '关卡',
  'debug.history': '历史',
  'debug.issue': '状态',
  'debug.stats': '属性',
  'debug.judge': '判定',
  'debug.solution': '解法',

  'result.kicker': '标本已记录',
  'result.dialogAria': '标本已记录',
  'result.levelLine': 'L{n} · {name}',
  'result.edits': '{used} / {par} 次编辑',
  'result.statChip': '{stat} {value}',
  'result.chainStop': '终止 {codon}',
  'result.next': '下一关 · {name}',
  'result.allLogged': '这个版本里的所有标本都已记录。',
  'result.reset': '重置',

  'guide.dialogAria': '玩法说明',
  'guide.closeAria': '关闭引导',
  'guide.step': '{n} / 03',
  'guide.next': '下一步',
  'guide.done': '开始',
  'guide.runPill': '运行',
  'guide.step1.title': '每三个碱基就是一个零件。',
  'guide.step1.body': '基因带每次读三个字母，每一组会长成一个身体零件。',
  'guide.step2.title': '插入或删除一个碱基，下游整段都会错位。',
  'guide.step2.body':
    '从那个点开始，整句话都会被重新断句。零件翻面变成别的零件。这就是 shift。',
  'guide.step3.title': '修好读框，然后让生物跑起来。',
  'guide.step3.body':
    '通过所有闸门就能记录标本。编辑次数有限，撤销免费，就算失败也能立刻重来。',
};

export type Dict = Record<MessageKey, string>;

export const DICTS: Readonly<Record<Lang, Dict>> = { en, zh };

const LANG_STORAGE_KEY = 'frameshift.lang.v1';
let currentLang: Lang = 'en';

export function isLang(value: unknown): value is Lang {
  return value === 'en' || value === 'zh';
}

export function getLanguage(): Lang {
  return currentLang;
}

function readStoredLang(): Lang | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(LANG_STORAGE_KEY);
    return isLang(raw) ? raw : null;
  } catch {
    return null;
  }
}

/** 浏览器语言推断：zh* → 中文，其余 → 英文。 */
export function detectLanguage(): Lang {
  try {
    if (typeof navigator !== 'undefined' && navigator.language) {
      return navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en';
    }
  } catch {
    /* 忽略 */
  }
  return 'en';
}

export function initLanguage(): Lang {
  const stored = readStoredLang();
  currentLang = stored ?? detectLanguage();
  // 首次按浏览器语言推断的结果也落盘，之后刷新保持一致。
  if (!stored) setLanguage(currentLang);
  return currentLang;
}

export function setLanguage(lang: Lang, persist = true): void {
  currentLang = lang;
  if (!persist) return;
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(LANG_STORAGE_KEY, lang);
  } catch {
    /* 隐私模式忽略 */
  }
}

/** {name} 插值。缺参数时保留占位符，方便发现漏传。 */
export function format(template: string, params?: Readonly<Record<string, string | number>>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = params[key];
    return value === undefined ? match : String(value);
  });
}

export function t(key: MessageKey, params?: Readonly<Record<string, string | number>>): string {
  const dict = DICTS[currentLang] ?? en;
  return format(dict[key] ?? en[key], params);
}

/* ==========================================================================
 * 数据对象 → 译文
 * ========================================================================== */

const LEVEL_KEYS: Readonly<Record<string, { name: MessageKey; species: MessageKey; target: MessageKey; intro: MessageKey; hint: MessageKey }>> = {
  l01: {
    name: 'level.l01.name',
    species: 'level.l01.species',
    target: 'level.l01.target',
    intro: 'level.l01.intro',
    hint: 'level.l01.hint',
  },
  l02: {
    name: 'level.l02.name',
    species: 'level.l02.species',
    target: 'level.l02.target',
    intro: 'level.l02.intro',
    hint: 'level.l02.hint',
  },
};


export function levelName(level: Level): string {
  const key = LEVEL_KEYS[level.id]?.name;
  return key ? t(key) : level.name;
}

export function levelSpecies(level: Level): string {
  const key = LEVEL_KEYS[level.id]?.species;
  return key ? t(key) : level.species;
}

export function levelTarget(level: Level): string {
  const key = LEVEL_KEYS[level.id]?.target;
  return key ? t(key) : level.target;
}

export function levelIntro(level: Level): string {
  const key = LEVEL_KEYS[level.id]?.intro;
  return key ? t(key) : level.intro;
}

export function levelHint(level: Level): string {
  const key = LEVEL_KEYS[level.id]?.hint;
  return key ? t(key) : level.hint;
}

export function gateLabel(gate: Gate): string {
  const key = `gate.${gate.id}.label` as MessageKey;
  return key in en ? t(key) : gate.label;
}

export function gateHint(gate: Gate): string {
  const key = `gate.${gate.id}.hint` as MessageKey;
  return key in en ? t(key) : gate.hint;
}

export function partLabel(id: PartId): string {
  const key = `part.${id}.label` as MessageKey;
  return key in en ? t(key) : id;
}

export function partBlurb(id: PartId): string {
  const key = `part.${id}.blurb` as MessageKey;
  return key in en ? t(key) : '';
}

export function statLabel(key: StatKey): string {
  return t(`stat.${key}` as MessageKey);
}

export function familyLabel(family: Family): string {
  return t(`legend.family.${family}` as MessageKey);
}

/** 英文全大写视觉，中文保持原样。 */
export function displayUpper(text: string): string {
  return currentLang === 'en' ? text.toUpperCase() : text;
}

/** 仅测试/调试用：检查某键是否存在。 */
export function hasMessage(key: string): key is MessageKey {
  return key in en;
}
