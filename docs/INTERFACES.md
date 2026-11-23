# 接口定义 · Interfaces v0.1

> 配套 `docs/DESIGN.md`。本文回答两个问题：
> **A. 这个游戏的数据/系统接口怎么定？**（配置表、运行时类型、战斗协议）
> **B. 玩家与系统怎么交互？**（装配、战斗、结算的输入输出）
>
> 原则：**一切确定性、可序列化、可回放**。逻辑内核是纯函数，渲染层只读状态。

---

## 0. 总约定

| 项 | 约定 |
|---|---|
| 语言 | TypeScript，`strict`，无 `any` |
| 时间 | 逻辑 tick = 1/30 s，整数 tick 计数，不用浮点时间 |
| 数值 | 属性用整数；战斗内部用 1/1000 定点（避免跨端浮点误差） |
| 随机 | 种子 RNG（`xorshift128`），种子由战斗配置给定 |
| 序列化 | JSON；所有对外结构带 `v`（版本号），不兼容就升 `v` |
| 命名 | 配置表 `snake_case` 字段，运行时 `camelCase` |

---

## 1. 配置表（内容即数据）

### 1.1 `parts.json`

```ts
interface PartDef {
  id: string;                 // 'beak.sharp'，命名空间.变体
  name: { zh: string; en: string };
  desc: { zh: string; en: string };
  slot: SlotId;               // 'body' | 'beak' | 'legs' | 'wings' | 'tail' | 'crest'
  tier: 1 | 2 | 3;
  size: 1 | 2 | 3;            // 占用槽位容量
  mass: number;               // 整数，影响速度/起飞
  stats: Partial<Stats>;      // 增量，不是绝对值
  tags: string[];             // 'light' | 'jump' | 'armor' | 'fly' | 'poison' ...
  ability?: AbilityId;        // 战斗主动技
  art: ArtRef;                // 渲染 key + 锚点偏移，不含资源路径
  unlock: { level?: number; cost?: number };  // 解锁条件
}
type SlotId = 'body' | 'beak' | 'legs' | 'wings' | 'tail' | 'crest';
interface Stats { hp: number; atk: number; def: number; spd: number; }
```

### 1.2 `synergies.json`（组合规则）

> 不用 if-else 写死，用声明式规则。`when` 全部满足才触发。

```ts
interface SynergyRule {
  id: string;
  when: {
    tags?: string[];            // 必须同时具备的标签
    slots?: Partial<Record<SlotId, string>>;  // 槽位 → 部件 id 前缀
    maxMass?: number;           // 总重上限（用于"重甲不能飞"）
    minMass?: number;
  };
  effect:
    | { type: 'grantTag'; tag: string }
    | { type: 'statMul'; stat: keyof Stats; mul: number }
    | { type: 'statAdd'; stat: keyof Stats; add: number }
    | { type: 'unlockAbility'; ability: AbilityId };
  ui: { text: { zh: string; en: string }; tone: 'buff' | 'debuff' };
}
```

### 1.3 `levels.json`

```ts
interface LevelDef {
  id: string;                 // 'l01'
  name: { zh: string; en: string };
  stage: 1 | 2 | 3;           // 允许的成长阶段（决定可用槽位数）
  waves: WaveDef[];
  rewards: { parts?: string[]; feathers?: number; firstClear?: string[] };
  tips: { zh: string; en: string }[];
}
interface WaveDef { enemies: EnemySpawn[]; }
interface EnemySpawn { enemyId: string; count: number; delayTick: number; }
```

---

## 2. 运行时类型（逻辑内核对外）

### 2.1 生物

```ts
type SlotId = 'body' | 'beak' | 'legs' | 'wings' | 'tail' | 'crest';

interface PartInstance {
  defId: string;              // 指向 PartDef
  level: 1 | 2 | 3;           // 强化等级（影响 stats 倍率）
}

interface Creature {
  v: 1;
  id: string;                 // 玩家生物 id（本地 uuid）
  stage: 1 | 2 | 3;
  slots: Record<SlotId, PartInstance | null>;
  skin?: string;
}

/** 由 Creature + 配置表推导出来，不入库、可随时重算 */
interface CreatureStats {
  v: 1;
  hp: number; atk: number; def: number; spd: number;
  mass: number; capacity: number;
  tags: string[];             // 生效标签（零件 + 协同）
  abilities: AbilityId[];
  flags: { grounded: boolean; canGlide: boolean; overloaded: boolean };
}
```

**接口约定**：`stats` 永远由纯函数 `deriveStats(creature, parts, synergies)` 得出，**不存盘**——避免改了配置表后旧存档数值错乱。

### 2.2 战斗

```ts
interface BattleConfig {
  v: 1;
  seed: number;               // uint32
  tickRate: 30;
  maxTicks: 1800;             // 60 秒
  arena: { width: number };   // 逻辑单位，非像素
  left: BattleSide;
  right: BattleSide;
}
interface BattleSide {
  creatureId: string;
  stats: CreatureStats;
  spawnX: number;             // 逻辑坐标
}

/** 玩家输入：只有这一类，且必须可重放 */
interface BattleCommand {
  tick: number;
  side: 'left' | 'right';
  type: 'ability';
  slot: SlotId;
}

/** 战斗产生的表现事件，渲染层消费 */
type BattleEvent =
  | { tick: number; type: 'move'; side: Side; x: number }
  | { tick: number; type: 'attack'; side: Side; target: Side; damage: number; crit: boolean }
  | { tick: number; type: 'ability'; side: Side; ability: AbilityId; slot: SlotId }
  | { tick: number; type: 'die'; side: Side }
  | { tick: number; type: 'end'; winner: Side | 'draw'; reason: 'hp' | 'timeout' };

interface BattleResult {
  v: 1;
  winner: 'left' | 'right' | 'draw';
  ticks: number;
  remainingHp: { left: number; right: number };
  events: BattleEvent[];
  hash: string;               // 状态哈希，用于校验/回放一致性
}
```

**核心接口**：

```ts
// 纯函数，同输入必同输出，无副作用
function simulate(cfg: BattleConfig, cmds: BattleCommand[]): BattleResult;
```

这一条撑起四件事：本地 PvE、回放、异步 PvP、服务端校验。

---

## 3. 玩家交互接口（UI ↔ 内核）

UI 不直接改数据，只发**意图**，内核返回新状态或错误码：

```ts
// 装配
type EditIntent =
  | { type: 'equip'; slot: SlotId; defId: string }
  | { type: 'unequip'; slot: SlotId }
  | { type: 'upgrade'; slot: SlotId }
  | { type: 'changeSkin'; skin: string };

type EditResult =
  | { ok: true; creature: Creature; stats: CreatureStats; notes: SynergyNote[] }
  | { ok: false; code: EditErrorCode; detail?: string };

type EditErrorCode =
  | 'slot_locked'      // 阶段未解锁
  | 'slot_occupied'    // 需要先卸下
  | 'size_exceeded'    // 尺寸超容量
  | 'not_owned'        // 未解锁该部件
  | 'incompatible';    // 规则禁止
```

**交互流**：

1. **拖拽装配**：从部件栏拖到鸡身上的高亮槽位 → `equip`。放不下时槽位显示红色描边 + 一句人话（"这条腿太大了，换个短的"）。
2. **实时反馈**：每次 `equip` 成功，右上角属性条做 300ms 数字滚动，新获得的标签以 chip 弹出（`+ 滑翔`）。
3. **冲突提示**：`notes` 里带 `tone:'debuff'` 的条目用红色 chip，并在小鸡身上显示"翼已收起"。
4. **进入战斗**：`startBattle(creature, levelId)` 由内核生成 `BattleConfig`（含种子），UI 只负责播放 `BattleResult.events`。

---

## 4. 渲染层接口（可替换后端）

渲染只做两件事：**画** 和 **播事件**。

```ts
interface CreatureView {
  setCreature(c: Creature, s: CreatureStats): void;   // 换装/换阶段
  playEdit(prev: Creature, next: Creature): void;     // 装配动画（部件飞入、弹出）
  update(t: number): void;                            // 待机呼吸、眨眼
}

interface BattleView {
  load(cfg: BattleConfig, stats: { left: CreatureStats; right: CreatureStats }): void;
  play(events: BattleEvent[], speed?: 1 | 2): Promise<void>;
  setPaused(p: boolean): void;
}
```

Web 用 Canvas 2D 实现；小游戏端换成原生 Canvas 实现；若未来迁 Cocos，换一套实现即可，逻辑内核不动。

---

## 5. 平台适配层

同一套游戏要跑 Web / 微信 / 抖音，平台差异收敛到一个接口：

```ts
interface Platform {
  kind: 'web' | 'wechat' | 'douyin';

  storage: {
    get<T>(key: string): Promise<T | null>;
    set<T>(key: string, value: T): Promise<void>;
  };

  audio: { play(id: string, loop?: boolean): void; stop(id: string): void; muted: boolean };

  input: {
    onPointer(handler: (e: { x: number; y: number; phase: 'down'|'move'|'up' }) => void): void;
  };

  // 以下能力在小游戏端才有，Web 端用 mock
  login(): Promise<{ openId: string }>;
  share(payload: { title: string; imageUrl?: string; query?: string }): Promise<void>;
  ads?: { showRewarded(): Promise<{ ok: boolean }> };
  iap?: { purchase(sku: string): Promise<{ ok: boolean }> };
  vibrate?(type: 'light' | 'heavy'): void;
}
```

约束：
- **逻辑内核不 import 这个接口**，只有 UI/引导层用。
- Web 端 `login` 返回本地随机 id，保证同一套流程能跑通。

---

## 6. PvP 协议

### 6.1 异步（M2）

```
POST /api/ghost        { snapshot: CreatureSnapshot, seed, levelId }  → { ghostId }
GET  /api/ghost/random { levelId }                                    → { ghostId, snapshot, seed }
POST /api/battle/result{ ghostId, result: BattleResult, cmds }         → { rank, verified }
```

- 服务端只做**重放校验**（同 seed + 同 cmds 必得同 hash），不跑实时。
- `CreatureSnapshot = { v, creature, stats, skin }`，**只读**，注入前校验数值上限，防作弊。

### 6.2 实时（M3）

```
POST /api/room/create   → { roomId }
POST /api/room/join     { roomId } → { members, seed }
WS   /ws/room/{id}      握手 → ready → tick 包（30Hz 或状态同步）
```

| 消息 | 方向 | 内容 |
|---|---|---|
| `ready` | C→S | `{ creatureSnapshot }` |
| `start` | S→C | `{ seed, startTick }` |
| `cmd` | C→S | `BattleCommand` |
| `snapshot` | S→C | `{ tick, checksum, state }`（每 30 tick） |
| `end` | S→C | `{ winner, resultHash }` |

校验：客户端每 30 tick 上报 `checksum`，与权威值不一致即回滚重放；连续 3 次不一致判负。

---

## 7. 存档

```ts
interface SaveData {
  v: 1;
  playerId: string;
  unlockedParts: string[];
  feathers: number;
  stage: 1 | 2 | 3;
  creature: Creature;         // 当前装配
  clearedLevels: Record<string, { stars: number; bestTicks?: number }>;
  settings: { lang: 'zh' | 'en'; muted: boolean };
}
```

- 本地优先，登录后与云端**按 `updatedAt` 取新**，不做复杂合并（单机为主）。
- `creature` 存的是部件 id 与等级，**不存 stats**（见 §2.1）。

---

## 8. 版本与兼容

- 所有对外结构带 `v`。
- 配置表改数值不需要升版本；**增删字段/改语义**必须升 `v` 并提供迁移函数 `migrateSave(old): SaveData`。
- 战斗回放跨版本不保证可重放——`BattleResult` 记录 `contentVersion`（配置表指纹），版本不符直接判"不可校验"。

---

## 9. 待定项（等设计问答落定后补）

- [ ] 是否存在"战中成长"（战斗中长出新零件）→ 若有，`BattleEvent` 需新增 `grow` 事件
- [ ] 是否需要多生物编队（当前是单只）
- [ ] PvP 是否排位/赛季
- [ ] 皮肤系统是否进 M1
