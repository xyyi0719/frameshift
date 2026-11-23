# FRAMESHIFT — 需求与规格书

> **GitHub Game Off 2026 · 主题 SHIFT**
> 一句话：**每个生物都是一句话，而你只能挪动空格。**
>
> 本文件是唯一真源。A（核心模拟）与 B（界面与呈现）必须严格按本文件并行实现，
> 任何需要改动对方法域的地方，先停下来找负责人，不要在代码里"顺手改一下"。
>
> 版本：v1.0（契约冻结） · 目标：两关可玩、可继续加关

---

## 0. 文件所有权表（先看这张表，再看别的）

| 路径 | 所有者 | 说明 |
|---|---|---|
| `docs/SPEC.md` | **负责人** | 规格。只读。 |
| `index.html` | **负责人** | 已冻结。不要动。 |
| `package.json` / `tsconfig.json` / `vite.config.ts` | **负责人** | 已冻结。需要加依赖先说明。 |
| `src/core/types.ts` | **负责人（冻结）** | 全项目共享的类型契约。**任何人不许改**。 |
| `src/core/index.ts` | **A** | 公共出口。已存在，A 只允许**追加**导出。 |
| `src/core/codons.ts` | **A** | 密码表、零件查表。 |
| `src/core/decode.ts` | **A** | 解码。 |
| `src/core/phenotype.ts` | **A** | 表型推导。 |
| `src/core/edit.ts` | **A** | 编辑与预览。 |
| `src/core/diff.ts` | **A** | 编辑前后差异（驱动动画）。 |
| `src/core/judge.ts` | **A** | 闸门判定。 |
| `src/core/session.ts` | **A** | 会话状态机（序列 / 额度 / 撤销 / 事件）。 |
| `src/data/parts.ts` | **A** | 16 个零件的静态定义 + 英文文案。 |
| `src/levels/index.ts` / `level01.ts` / `level02.ts` | **A** | 关卡数据与注册表。 |
| `tests/core.spec.ts` | **A** | 单元测试（用例见附录 B，已算好）。 |
| `src/main.ts` | **B** | 应用入口（脚手架占位版，B 可整体重写）。 |
| `src/styles.css` | **B** | 主题与布局（脚手架占位版，B 可整体重写）。 |
| `src/ui/**` | **B** | 全部界面代码，随便建文件。 |

**铁律**
1. A 不许 import 任何 `src/ui/**`，也不许在 core 里碰 DOM。
2. B 不许 import `src/core/*` 里除 `src/core/index.ts` 之外的任何文件，不许重算生物学。
3. 两边都不许修改 `src/core/types.ts`、`index.html`、`package.json`、`tsconfig.json`。
4. 每完成一块就跑一次 `npx tsc --noEmit`，保持绿的。谁把编译搞红谁自己修。
5. 游戏内所有面向玩家的文字是**英文**；代码注释、文档是**中文**。

---

## 1. 游戏概念

### 1.1 Pitch

你是一条基因的编辑员。一条基因就是一条没有空格的长句，核糖体每三个字母念一个词，
念出来的词就是生物的零件：腿、翼、甲、眼、发光器……
你手上只有两把手术刀：**插一个字母**、**删一个字母**。这一刀下去，从这个点开始，
**后面所有字母的分组整体错位一格**——一句话被重新断句，生物当场变成另一个东西。

目标不是"改对字母"，而是**改对断句**。

### 1.2 为什么这就是 SHIFT

- 生物学上它就叫 **frameshift mutation**（移码突变）：插入/删除非 3 倍数个碱基，
  读框整体平移，下游全部氨基酸改变。主题词是字面意义上的 shift。
- 玩法上，shift 的是**视角**而不是内容：字符串几乎没变，变的是"从哪儿开始三个一组"。
  这跟"挪一个空格，一句话意思全变"是同一个笑话。
- 体验上，shift 必须是**看得见的位移**：一条带子在屏幕上整体滑一格，零件像翻牌一样
  逐个翻面，生物在几帧之内从"七条鳃的肉团"变成"三条腿的甲虫"。这是本作的核心奇观，
  不是数字变化，不是弹窗提示。

### 1.3 目标玩家与节奏

- 喜欢"发现规律"的解谜玩家（Baba Is You / Human Resource Machine / Opus Magnum 那类）。
- Game Off 评委：**30 秒内看懂在干什么，3 分钟内打通第一关，10 分钟内想继续玩**。
- 因此：第一关必须几乎不会失败（14 个解），第二关必须有一次"啊哈"（只有 2 个解）。

### 1.4 参考作品

| 作品 | 借什么 |
|---|---|
| *Baba Is You* | 规则本身就是谜题；玩家通过操纵规则获胜 |
| *Human Resource Machine* | 用极少的指令空间逼出"聪明解"，并给出 par |
| *Splice*（2012） | 基因拼接的视觉语言：把分子画成可触摸的物件 |
| *World of Goo* | 用极简程序化美术做出有生命的质感 |

### 1.5 基调与美术方向

深色实验室 / 荧光染色标本。没有外部美术资源，全部程序化绘制：
圆角胶囊身体 + 参数化附肢 + 一层柔光。配色是"荧光显微镜"：
A 琥珀、U 青、G 紫、C 玫瑰；零件沿用家族色。

---

## 2. 完整规则

### 2.1 密码表

四个字母：`A U G C`。每 3 个一组 = 一个密码子 = 一个零件。

**规律（玩家应该能自己发现）**

1. **第 1 个字母 = 家族**：`A` 感官/头 · `U` 肢体 · `G` 外壳 · `C` 内脏。
2. **第 3 个字母 = 变体**：`G` 基础型 · `A` 长/大型 · `C` 尖/刃型 · `U` 膜/鳍型。
3. **第 2 个字母是沉默位**：它不决定零件。`UUG` `UCG` `UGG` 都是腿。
   （这是"密码子有冗余"的简化；也是后期"替换"手术的免费位。）
4. **三个终止密码子 `UAA` `UAG` `UGA` 覆盖 U 家族**：它们本来按规律该是长腿/腿/长腿，
   但被终止语义抢走。所以 U 家族的腿只剩 `UUG` `UCG` `UGG` 三个。

**零件表（16 个）**

| 家族 | 变体(第3位) | 密码子（中间位 U/C/A/G） | 零件 | 英文名 | 属性 |
|---|---|---|---|---|---|
| A | G | AUG ACG AAG AGG | `head` | Head | sight +1 |
| A | C | AUC ACC AAC AGC | `eye` | Eye | sight +2 |
| A | A | AUA ACA AAA AGA | `horn` | Horn | spikes +2 |
| A | U | AUU ACU AAU AGU | `antenna` | Antenna | sight +1 |
| U | G | UUG UCG **UAG** UGG | `leg` | Leg | stride +2 |
| U | A | UUA UCA **UAA** **UGA** | `longleg` | Long Leg | stride +3 |
| U | C | UUC UCC UAC UGC | `claw` | Claw | stride +1, grip +2 |
| U | U | UUU UCU UAU UGU | `fin` | Fin | swim +2 |
| G | G | GUG GCG GAG GGG | `shell` | Shell | armor +2 |
| G | C | GUC GCC GAC GGC | `spike` | Spike | spikes +2 |
| G | A | GUA GCA GAA GGA | `crest` | Crest | armor +1 |
| G | U | GUU GCU GAU GGU | `wing` | Wing | flight +2 |
| C | G | CUG CCG CAG CGG | `glow` | Glow Organ | glow +2 |
| C | C | CUC CCC CAC CGC | `maw` | Maw | bite +2 |
| C | A | CUA CCA CAA CGA | `sac` | Air Sac | armor +1, swim +1 |
| C | U | CUU CCU CAU CGU | `gill` | Gill | swim +2 |

**终止密码子（不产生零件，翻译到此为止）**

| 密码子 | 英文名 | 备注 |
|---|---|---|
| `UAA` | Ochre | 按规律应是 Long Leg，被终止覆盖 |
| `UAG` | Amber | 按规律应是 Leg，被终止覆盖 |
| `UGA` | Opal | 按规律应是 Long Leg，被终止覆盖 |

> 注意 `AUG` 同时是**起始密码子**和 **Head** 零件。

### 2.2 序列读取算法（`decode` 的精确语义）

输入：字符串（任意大小写）。输出：`Gene`。

1. **规范化**：转大写。若含 `A/U/G/C` 以外的字符 → `issue='bad_char'`，`bases=[]`、
   `codons=[]`、`parts=[]`、`frameStart=0`、`startIndex=-1`、`stopIndex=-1`、
   `stopCodon=null`、`trailerStart=0`，直接返回。（防御性分支，正常流程不会发生。）
2. **空串** → `issue='empty'`，其余同上。
3. **找起点**：`startIndex = seq.indexOf('AUG')`。找不到 → `issue='no_start'`，
   `codons` 只包含 `role:'junk'` 的槽位（按 3 个一组从 0 切，最后一组不足 3 个标 `'partial'`），
   `parts=[]`，`frameStart=0`，`trailerStart=seq.length`。
4. **翻译**：从 `startIndex` 起，每 3 个碱基读一个槽位：
   - 第一个槽位 `role:'start'`，零件 `head`。
   - 遇到 `UAA/UAG/UGA` → 该槽位 `role:'stop'`，**不产生零件**，翻译结束，
     `stopIndex`/`stopCodon` 记下，`trailerStart = stopIndex + 3`。
   - 否则 → `role:'part'`，按 2.1 查表得零件。
   - 剩余碱基不足 3 个 → 该残片 `role:'partial'`，丢弃，不算零件，翻译结束。
5. **没有终止**：若读到序列末尾仍未遇终止 → `issue='no_stop'`。
   此时 `parts` **照常给出**（翻译跑到头），`trailerStart = seq.length`，`stopIndex=-1`。
   生物"没长完"，不允许起跑。
6. `startIndex` 之前的碱基 = `role:'junk'`（暗淡显示，**仍可编辑**）。
   `trailerStart` 之后的碱基 = `role:'trailer'`（暗淡显示，**仍可编辑**）。
7. **链内出现第二个 `AUG` 不重启翻译**，它只是又长出一个 `head`（多头生物）。
8. `frameStart = startIndex >= 0 ? startIndex : 0`。基因带上的分组**永远**按
   `frameStart` 起算；`codons` 数组是唯一权威，UI 不要自己 `i % 3`。

`Gene.parts[i].index === i`，顺序 = 读取顺序，从 `head` 开始。

### 2.3 三种手术的精确语义

设当前序列为 `s`（长度 `n`）。

| 手术 | 参数 | 结果 | 合法下标 | 读框影响 |
|---|---|---|---|---|
| `insert` | `index`, `base` | `s.slice(0,index) + base + s.slice(index)` | `0..n`（可插在末尾） | 此点**之后**所有分组右移 1 格（`shiftBy=+1`）。若插在 `frameStart` 之前，整个读框一起后移。 |
| `delete` | `index` | `s.slice(0,index) + s.slice(index+1)` | `0..n-1` | 此点**之后**所有分组左移 1 格（`shiftBy=-1`）。删掉 `AUG` 里的字母会让生物失去起点。 |
| `replace` | `index`, `base` | 把第 `index` 位换成 `base` | `0..n-1` | **不影响读框**（`shiftBy=0`），只影响包含它的那一个密码子（若换成同一个字母 → 拒绝 `no_change`）。 |

补充约定：

- 插入/删除**不要求**长度保持 3 的倍数。长度不是 3 的倍数本身不是错误，
  只是末尾残片被丢弃（可能因此 `no_stop`）。
- 任何编辑都允许让基因变得**非法**（丢起点、丢终止）。这是游戏的一部分，
  不是错误：UI 显示 `INVALID`，不许起跑，撤销免费。
- `insert` 不允许超过 `MAX_SEQUENCE_LENGTH = 64`，否则拒绝 `too_long`。
- 编辑永远只作用于 `Session` 内部的当前序列，**不修改 `Level.sequence`**。

### 2.4 编辑额度与撤销

- 每关有 `budget`（L1=2，L2=1），含义是**这一局净执行了几次编辑**，即 `history.length`。
- **撤销完全免费且不限次数**：`undo()` 把上一条编辑弹出、序列回滚、额度退还。
  所以额度约束的是"最终解法用几刀"，不是"你能试几次"——玩家可以随便试，按 U 撤回。
- `reset()` 回到关卡初始序列，清空 `history`、额度回满。
- 额度用尽时所有编辑返回 `{ok:false, reason:'no_budget'}`；此时仍可撤销。
- 没有"失败即结束"：非法基因只是不能跑。

### 2.5 表型推导（`phenotype` 的精确语义）

`stats` 九项全部存在，初值 0，把每个零件的 `definition.stats` 累加。

- `size` = 零件个数。
- `families` = 每个家族（A/U/G/C）的零件个数。
- `locomotion` 按顺序判定：
  1. `flight > 0 && stride > 0` → `'mixed'`
  2. `flight > 0` → `'fly'`
  3. `stride > 0` → `'walk'`
  4. `swim > 0` → `'swim'`
  5. 否则 `'none'`
- 基因 `no_stop` 时仍返回照常累加的表型（身体长了一半），但 `judge` 会判 `invalid`。
- 基因 `no_start` 时 `parts` 为空 → 九项全 0、`size=0`、`locomotion='none'`。

### 2.6 跑道判定（`judge` 的精确语义）

1. `gene.issue !== null` → `outcome:'invalid'`，`reason` 取 `'no_start' | 'no_stop'`，
   `gates: []`，`failedGateIndex: null`，`failAtX: 0`。（`bad_char`/`empty` 也归为 `no_start`。）
2. 否则按 `level.gates` 的**数组顺序**逐个判：
   - `mode:'all'`：所有 `requires` 都满足才算过。
   - `mode:'any'`：任意一条满足即算过。
   - 每个闸门都产出一条 `GateCheck`（`checks` 里逐条记录 actual/min/met）。
3. 第一个失败闸门 → `outcome:'fail'`，`reason:'gate_failed'`，
   `failedGateIndex` = 它的下标，`failAtX` = 它的 `at`。
4. 全部通过 → `outcome:'pass'`，`reason:'passed'`，`failedGateIndex:null`，`failAtX:1`。
5. 判定**只看表型**，永远不看序列字符串。同一个表型的不同写法都算通。

---

## 3. 两个测试关卡（数据已逐位验证）

> 下面所有零件链和属性都是按 2.1 / 2.2 手工推演并跑脚本核对过的。
> A 必须把它们逐字写进 `level01.ts` / `level02.ts`，并在 `tests/core.spec.ts` 里断言（见附录 B）。

### 3.1 关卡 1 · `l01` · **One Base Short**

| 字段 | 值 |
|---|---|
| `id` | `"l01"` |
| `number` | `1` |
| `name` | `"One Base Short"` |
| `species` | `"Gill Blob"` |
| `budget` | `2` |
| `ops` | `["insert","delete"]` |
| `parEdits` | `1` |
| `hudStats` | `["stride","swim","spikes"]` |

**初始序列（27 碱基）**

```
AUGCGUCGUCAGGGCCGACCUGAAUAG
```

**初始解码**

| # | 密码子 | 零件 | 说明 |
|---|---|---|---|
| 0 | AUG | head | 起点 |
| 1 | CGU | gill | |
| 2 | CGU | gill | |
| 3 | CAG | glow | |
| 4 | GGC | spike | |
| 5 | CGA | sac | |
| 6 | CCU | gill | |
| 7 | GAA | crest | |
| 8 | UAG | **stop** | 终止 |

- 属性：`sight 1 · swim 7 · glow 2 · spikes 2 · armor 2`，**`stride 0`，`flight 0`**。
- 状态：`ok`（合法），`stopIndex=24`，`trailerStart=27`。

**目标文案（英文，直接进数据）**

```
target: "IT CANNOT WALK. Seven gills, no legs — and the crack is dry."
intro:  "Specimen 011. It breathes through seven gills and owns no legs at all.
         The crack ahead is four metres of dry rock."
hint:   "One base is missing. The reading frame is off by one — slide it back."
```

**闸门**

| id | kind | at | mode | requires | label | hint |
|---|---|---|---|---|---|---|
| `crack` | `chasm` | `0.55` | `all` | `stride >= 4` | `"The Crack"` | `"4 m across. Swimming will not help."` |

**设计解（1 刀）**：在**下标 3**（第一个 `CGU` 之前）插入 `U`。

```
AUG UCG UCG UCA GGG CCG ACC UGA | AUAG
head  leg  leg  longleg shell glow eye | stop
```

- 属性：`stride 7 · armor 2 · glow 2 · sight 3`，`stopIndex=21`，`trailerStart=24`，
  末尾 4 个碱基 `AUAG` 变成不翻译的 `trailer`。
- 这就是"补回缺失的那个碱基"，分组整体右移一格，鳃翻成腿。

**其它可行解（共 14 个）**：`INS@2+G`、`INS@3+{A,G,C}`、`INS@4+{A,U,G,C}`、
`INS@5+{A,U,G,C}`、`INS@6+U`。除 `INS@3+U`（stride 7）外，其余都刚好 stride 5，
会带一个 `shell`/`glow`/`sac`/`maw`/`gill` 顶替第一个 `leg`。
**这是刻意的**：第一关要让人赢，`INS@3+U` 是"最漂亮的那个解"，不是唯一解。

**死路 / 陷阱**
- 27 个删除**全部**导致 `no_start`（删在 AUG 上）或 `no_stop`（删完终止就没了）。
  玩家第一次删会看到生物"化掉"，这是教学的一部分，撤销免费。
- 只在下标 ≥ 7 处插入救不了它：那些刀口凑不出足够多的腿（`stride` 仍 < 4）→ 撞沟失败。
- 把 `AUG` 换成别的（本关没解锁 replace，但未来关会）→ `no_start`。

### 3.2 关卡 2 · `l02` · **The Long Way Down**

| 字段 | 值 |
|---|---|
| `id` | `"l02"` |
| `number` | `2` |
| `name` | `"The Long Way Down"` |
| `species` | `"Bramble Fin"` |
| `budget` | `1` |
| `ops` | `["insert","delete"]` |
| `parEdits` | `1` |
| `hudStats` | `["flight","armor","swim"]` |

**初始序列（27 碱基）**

```
AUGGGCGAGUCUGGGUCUGUGACAUAA
```

**初始解码**

| # | 密码子 | 零件 |
|---|---|---|
| 0 | AUG | head |
| 1 | GGC | spike |
| 2 | GAG | shell |
| 3 | UCU | fin |
| 4 | GGG | shell |
| 5 | UCU | fin |
| 6 | GUG | shell |
| 7 | ACA | horn |
| 8 | UAA | **stop** |

- 属性：`sight 1 · spikes 4 · armor 6 · swim 4`，**`flight 0`，`stride 0`**。
- 状态：`ok`，`stopIndex=24`，`trailerStart=27`。

**目标文案**

```
target: "THE RAVINE IS TOO WIDE TO WALK. Nothing with six plates of armour gets airborne."
intro:  "Specimen 027. Armoured, spined, finned — and far too heavy to fly.
         The ravine does not care how well you swim."
hint:   "You cannot add your way out of this one. Remove a single base and read again."
```

**闸门**

| id | kind | at | mode | requires | label | hint |
|---|---|---|---|---|---|---|
| `ravine` | `chasm` | `0.60` | `all` | `flight >= 4` | `"The Ravine"` | `"6 m gap, far side higher. Wings only."` |

**设计解（1 刀）**：**删除下标 7**（第 3 个密码子 `GAG` 的第一个字母 `A`）。

```
AUGGGCGGUCUGGGUCUGUGACAUAA          (26 碱基)
AUG GGC GGU CUG GGU CUG UGA | CAUAA
head spike wing glow wing glow | stop(trailer)
```

- 属性：`flight 4 · spikes 2 · glow 4 · sight 1`，`stopIndex=18`，`trailerStart=21`。
- 整个下游被重新断句：`shell→wing`、`fin→glow`、`shell→wing`、`horn→glow`。
- 终止也换了：新终止 `UGA@18` 是**旧的 `GUG`（甲）的尾巴 + 旧 `ACA`（角）的头两个字母**拼出来的；
  旧的 `UAA@24` 被挤到后面，变成不翻译的 `trailer`（`CAUAA`）。
  ——连"读到哪儿停"都跟着移码一起挪，这是本关最想让人看见的一下。
- **"删掉一个字母，下游整段变成另一个东西"** 这一课就靠它。

**第二解**：删除下标 8（`GAG` 的第二个字母 `G`），得到 `...GAU...`（`GAU` = wing），
表型完全一致（`flight 4`），也算通。所以本关共 **2 个解**。

**死路 / 陷阱**
- 8 个删除（下标 19–26，从 `GUG` 的第二个字母一直到终止密码子本身）导致 `no_stop`：
  尾巴一被动，读到序列末尾都再没有停止信号。
- **0 个插入可行**：112 种单碱基插入没有任何一种能凑出 `flight ≥ 4`。
  这关就是要逼玩家理解"插入和删除是镜像的，但这一关只有删能救"。
- 删掉终止密码子里的任何字母（24/25/26）→ `no_stop`，直接不能起跑。
- 删掉 `head` 的开头会让序列失去唯一 `AUG`（`no_start`）。

### 3.3 关卡数据形态（给以后加关用）

关卡是**纯数据**（`Level` 接口，无函数）。加一关 = 新建 `src/levels/level03.ts`
＋ 在 `levels/index.ts` 的 `LEVELS` 数组里 push。UI 不做任何按关卡号的分支，
所有差异（序列、额度、闸门、HUD 属性、文案）都来自 `Level` 字段。
`level.solutionNote` 只给调试面板看，别显示给玩家。

---

## 4. 交互与视觉

### 4.1 主界面布局（桌面优先，最小可用 1024×680）

```
┌───────────────────────────────────────────────────────────────┬───────────────┐
│ HUD  L01 · One Base Short        TARGET: …          ◈◈  ⟲  ▶  │               │
├───────────────────────────────────────────────────────────────┤  CODON TABLE  │
│ GENE RIBBON                                                   │  常驻图例      │
│   ┌───┬───┬───┐ ┌───┬───┬───┐ …                               │  A  U  G  C   │
│   │A U G│ │C G U│                                             │  head leg …   │
│   └───┴───┴───┘ └───┴───┴───┘                                 │  …            │
│     head          gill                                        │  UAA UAG UGA  │
├───────────────────────────────────────────────────────────────┤               │
│ STAGE  （canvas：跑道 + 生物 + 闸门 + 终点旗）                    │               │
│                                                               │               │
└───────────────────────────────────────────────────────────────┴───────────────┘
```

- 三块区域：`#hud`（56px 定高）、`#gene-ribbon`（约 150px）、`#stage`（剩余高度）、
  `#legend`（固定 320px 右栏，独立滚动）。
- `#legend` **默认常开**（需求：常驻密码表）。窄屏（< 900px）时改为底部抽屉，
  但仍要默认展开——玩家需要随时查表。
- 基因带和舞台是两块 canvas（或一块覆盖全屏的 canvas）。
  HUD / 图例 / 气泡用 DOM（文字多、可滚动、易做无障碍）。

### 4.2 基因带（genotype → phenotype 的可视化）

**每一列 = 一个密码子**，纵向三段：

```
  ┌──────┐          ← 分组框（每 3 个碱基一个框，框之间 8px 间隔）
  │ A U G│          ← 碱基层：每个碱基 26×34，字母用家族色描边
  └──────┘
     │             ← 一条 10px 的竖线把密码子接到零件图标
   (head)           ← 零件小图标（48px 高）+ 英文名（10px，可选）
```

- 碱基单元格：宽 26，高 34，圆角 6，底部 2px 家族色；字母 18px 等宽字体。
  `A` 琥珀 `#f2b24b`、`U` 青 `#46c8b2`、`G` 紫 `#a58bf0`、`C` 玫瑰 `#ef7d9b`。
- 分组框：`codons[]` 驱动。`role:'start'` 用亮描边 + 上方 "START" 角标；
  `role:'stop'` 用红色描边 + "STOP" 角标 + 一个小剪刀/终止符号；
  `role:'part'` 普通描边。
- `role:'junk'` / `'trailer'`：不画分组框，碱基透明度 0.35，字母变灰，
  上方标一行 8px 的 `UNTRANSLATED`。**它们仍然可以点、可以编辑**。
- `role:'partial'`：只剩 1~2 个碱基的残片，画成虚线框 + 底部 "DANGLING" 小字。
- 零件图标下方连一条 1px 竖线，让"这三个字母 = 这个零件"在视觉上咬死。
- 顶部一条**读框标尺**：每 3 格一个刻度，标 `1 2 3 4 …`（密码子序号）。
  移码时这条尺子和分组框一起滑动——它是最直观的"帧"提示。
- 序列超过一屏：水平滚动（滚轮 + 拖拽），`scrollIntoView` 保证刚编辑的位置可见。

**颜色语义**：家族色贯穿"碱基 → 分组框 → 零件图标 → 生物身上的附肢"，
这样玩家能肉眼看出"这一段紫色的都是外壳家族"。

### 4.3 命中区与操作流

工具条在 HUD 右侧：`INSERT` / `DELETE` / `REPLACE`（未解锁置灰）/ `UNDO` / `RESET` / `RUN`。

| 模式 | 命中区 | 行为 |
|---|---|---|
| INSERT | 碱基之间的**缝隙**（宽 12，实际命中 18，含首尾） | 缝隙高亮；点击后弹出 4 字母选择器（A/U/G/C，18px 按钮，出现在缝隙正上方）；点字母即提交。 |
| DELETE | 单个碱基单元格 | 悬停变红并上浮 2px；点击**立即**删除（不二次确认，因为撤销免费），并弹出发光的 `UNDO` 提示。 |
| REPLACE | 单个碱基单元格 | 悬停变黄；点击后弹出 4 字母选择器，选字母即提交。 |
| 任意模式 | 分组框（密码子） | 悬停显示 tooltip：密码子、零件英文名、属性 `+2 stride`。只读，不修改。 |

- **拖拽**（增强，非必须但推荐）：图例里的零件/字母托盘可以拖到缝隙上完成插入；
  拖到碱基上完成替换。拖拽与点击走同一套 `Session` 调用，不许有第二套逻辑。
- 键盘：`←/→` 移动光标，`I`/`D`/`R` 切模式，`1..4`/`A U G C` 直接落字母，
  `Backspace` 删除光标处，`Ctrl+Z`/`U` 撤销，`Enter` 起跑，`Esc` 关弹层。
- 光标（一个 2px 竖线 + 呼吸光）始终存在，鼠标点击会移动它。
- 所有编辑走 `Session.insert/remove/replace`；UI **不许**直接改字符串。

### 4.4 移码动画分镜（核心体验，必须做对）

**A. 插入（最典型的 shift）**

| 时间 | 事件 |
|---|---|
| 0ms | 点击字母。新碱基在缝隙处**落下**：scale 0.4→1，120ms，带一圈琥珀色冲击环。 |
| 0–220ms | 接缝**右侧所有碱基**向**右**平移 1 个格宽（28px），`cubic-bezier(.2,.9,.2,1)`。分组框、读框标尺同步平移。 |
| 120ms | 接缝处扫过一条 2px 的亮青色扫描线（垂直，从碱基行顶部扫到底部，200ms），标记"从这里开始错位"。 |
| 220ms 起 | 零件瀑布：从第一个变化的零件开始，**每个错开 55ms**，每个做 160ms 的翻牌（`scaleY 1→0`，换图，`0→1`），旧零件图标同时淡出。齿轮声/翻牌声每翻一个响一下。 |
| 220ms 起 | 舞台上的生物同步重排：接缝之后的附肢"脱落 → 飘到新位置 → 长回去"，身体胶囊长度用弹簧过渡（180ms 过冲 6%）。 |
| 结束时 | 所有分组框闪一下；若基因变非法，走 4.7 的 INVALID 流程。 |

**B. 删除**：被删碱基 `scale→0` 并在 90ms 内飞向 HUD 的垃圾桶图标；右侧碱基左移一格；
其余同插入（扫描线方向相反，颜色偏红）。翻牌顺序仍然是从接缝向右。

**C. 替换**：完全没有横向位移。只有一个零件翻牌（160ms）+ 碱基字母交叉淡入 90ms。
如果换的是沉默位（第 2 个字母），零件**不会**变——必须也翻一下牌再翻回来，
让玩家看见"什么都没发生"，并弹一条 toast：`THE MIDDLE BASE IS SILENT`。

**性能要求**：动画期间不要重排 DOM；canvas 每帧重绘，`requestAnimationFrame` 驱动，
时间轴用"开始时间 + 缓动函数"算，不要用 `setTimeout` 串。

### 4.5 生物绘制（全部程序化）

- **身体**：一条圆角胶囊，长度 `60 + 14 * partCount`（px，随关卡缩放），
  高度 34；青灰色渐变 + 内发光。`locomotion` 决定身体的姿态：
  `walk` 贴地、`fly` 抬高 40px 并轻微上下浮动、`swim` 半透明 + 水波、`none` 趴在地上蠕动。
- **零件**：按 `Phenotype.parts` 顺序沿背线（或腹线）挂上去。
  规则：头/眼/触角/角 → 前端；腿/爪/鳍 → 腹侧；甲/刺/冠/翼 → 背侧；发光器/口器/鳃/气囊 → 尾段。
  每个零件 12–28px，用 `Path2D` 画（三角、圆弧、折线即可），描边用家族色，内部 20% 透明填充。
  细节参考：
  - `leg` 两段折线 + 圆脚；`longleg` 三段更长；`claw` 三个小尖；`fin` 半椭圆；
  - `shell` 三段圆弧甲片；`spike` 一排 3 个三角；`crest` 锯齿；`wing` 两片弧；
  - `glow` 实心圆 + 径向渐变光晕（呼吸脉动）；`maw` 带齿弧；`gill` 三条竖缝；`sac` 圆鼓包。
- **生命感**：待机时有 1.2s 周期的轻微呼吸；编辑后 0.4s 内做一次"抖"。
  眼睛（若有 `eye`）跟着鼠标转。
- 尺寸必须自适应舞台：`scale = min(stageW/900, stageH/300)`，不要写死。

### 4.6 跑道与判定反馈

- 舞台地面一条 3px 的地平线，右侧一面小旗 = 终点。
- 闸门画在 `x = gate.at * trackWidth`：`chasm` 画成地面断口 + 深渊渐变；
  `thorn` 画尖刺墙；`dark` 画黑幕；`water` 画水波。闸门上方挂一个小牌，写 `label`。
- `RUN` 后：生物用 4.5s 从左跑到右（`walk` 有颠簸，`fly` 有滑翔弧线）。
- 跑到 `gate.at` 时**停 0.4s**，闸门上方弹出判定：
  - 通过：绿色 `✓ stride 7 / 4`，闸门碎裂/落下，继续跑。
  - 失败：红色 `✗ stride 0 / 4`，生物做出对应的失败动作
    （chasm：掉下去；thorn：被弹回；dark：原地转圈；water：沉下去），
    屏幕轻微震动（3px，180ms），0.8s 后浮出 `level.hint`。
- 通过全部闸门：生物到终点，旗子展开，弹出 `SPECIMEN LOGGED` 卡片
  （显示物种名、基因串、零件链、用了几刀 vs par），底部 `NEXT` 按钮。
- `RUN` 期间禁用编辑（或允许排队？——**禁用**，简单可靠）。

### 4.7 状态与文案

| 状态 | 触发 | UI |
|---|---|---|
| `READY` | 基因合法、未跑 | 生物待机；RUN 可用 |
| `INVALID_NO_START` | `issue==='no_start'` | 生物化成一团烟雾；基因带左侧出现红色印章 `NO START CODON`；RUN 置灰 |
| `INVALID_NO_STOP` | `issue==='no_stop'` | 生物只长出前半身，尾部是断口；印章 `NO STOP CODON`；RUN 置灰 |
| `RUNNING` | 点了 RUN | 编辑禁用，HUD 显示进度 |
| `FAILED` | `outcome==='fail'` | 失败动作 + `hint`；按钮变成 `RETRY`（不重置序列） |
| `PASSED` | `outcome==='pass'` | 结算卡片 + `NEXT` |
| 弹层 | 选字母 | 4 个字母按钮，键盘 1–4 可选 |

固定英文短句（B 直接用，别自己造）：`INSERT` `DELETE` `REPLACE` `UNDO` `RESET`
`RUN` `RETRY` `NEXT` `NO START CODON` `NO STOP CODON` `THE MIDDLE BASE IS SILENT`
`SPECIMEN LOGGED` `LOCKED`。

### 4.8 音效（可选，做了加分）

WebAudio 现场合成，不加载任何文件：插入 = 短促方波 440→660Hz（60ms）；
删除 = 660→330Hz；翻牌 = 极短的噪声 click；失败 = 低频锯齿下滑；通过 = 三音上行琶音。
必须有全局静音按钮，默认开。

### 4.9 响应式与移动端

- ≥ 1024px：两栏（舞台 + 右侧图例）。
- < 1024px：图例变成底部抽屉（默认展开，可收起），HUD 折成两行。
- 触摸：所有点击目标 ≥ 40px；基因带支持横向拖动；不做双指缩放。
- **验收底线**：手机尺寸下能用手指完成"插入一个碱基并通关第一关"。

---

## 5. 技术方案

### 5.1 选型

| 层 | 选择 | 理由 |
|---|---|---|
| 构建 | **Vite 5 + TypeScript 5（strict）** | 零配置、毫秒级 HMR；`base:'./'` 直接丢 itch.io。 |
| 渲染 | **Canvas 2D（原生）** | 这个游戏本质是"字符串 → 密码子 → 零件 → 几十个矢量小图形"，没有物理、没有精灵图集、没有场景图。Canvas 2D 足够，且能精确控制"整段滑一格"的逐帧位移。 |
| DOM | 原生 DOM + CSS | HUD、图例、弹层是文字密集型，用 DOM 排版比 canvas 省事、还能选中/滚动/无障碍。 |
| 状态 | 一个 `Session` 类 + 订阅回调 | 全局只有一份可变状态；A 拥有它，B 只调用方法。不需要 Redux 之类。 |
| 测试 | **Vitest** | A 的解码/判定必须能被断言，否则两关"可通关"只是口头承诺。用例已算好（附录 B）。 |

### 5.2 明确不引入的东西

- **不引入 Phaser / Pixi / Three**：没有物理、没有粒子系统、没有 Tilemap；
  引引擎只会让 bundle 变大、把简单问题复杂化。
- **不引入 React/Vue**：界面只有 5 个区域，DOM 手写更短。
- **不引入外部字体/图片/音频**：比赛规则与需求都要求程序化；系统等宽字体栈足够。
- **不引入后端/存档服务**：bestiary 若要存，用 `localStorage`。

### 5.3 目录

见第 6 章的文件树。`npm run dev` 起开发服务器，`npm run build` 产出 `dist/`，
`npx tsc --noEmit` 做类型门禁，`npm test` 跑 A 的单元测试。

---

## 6. 模块契约（最重要的一章）

### 6.1 文件树与所有权

```
game/
├── index.html                 [负责人·冻结]
├── package.json               [负责人·冻结]
├── tsconfig.json              [负责人·冻结]
├── vite.config.ts             [负责人·冻结]
├── docs/SPEC.md               [负责人]
├── src/
│   ├── main.ts                [B] 应用入口 / 装配
│   ├── styles.css             [B] 主题与布局
│   ├── core/
│   │   ├── types.ts           [负责人·冻结]  ← 全项目唯一类型真源
│   │   ├── index.ts           [A] 公共出口（只许追加导出）
│   │   ├── codons.ts          [A] 64 项密码表 + 查表
│   │   ├── decode.ts          [A] 解码
│   │   ├── phenotype.ts       [A] 表型推导
│   │   ├── edit.ts            [A] 编辑 / 预览
│   │   ├── diff.ts            [A] 前后差异
│   │   ├── judge.ts           [A] 闸门判定
│   │   └── session.ts         [A] 状态机
│   ├── data/
│   │   └── parts.ts           [A] 16 个零件的静态定义 + 英文文案
│   ├── levels/
│   │   ├── index.ts           [A] LEVELS 注册表
│   │   ├── level01.ts         [A]
│   │   └── level02.ts         [A]
│   └── ui/                    [B] 全部界面代码，文件自定
│       ├── theme.ts           颜色 / 字体 / 尺寸常量
│       ├── parts-art.ts       16 个零件的程序化绘制（switch PartId）
│       ├── creature.ts        把 Phenotype 拼成一只生物
│       ├── ribbon.ts          基因带 canvas + 命中测试
│       ├── stage.ts           跑道 canvas（闸门、终点、跑步动画）
│       ├── legend.ts          密码表图例（DOM）
│       ├── hud.ts             HUD（DOM）
│       ├── anim.ts            缓动 / 时间轴 / 翻牌
│       └── audio.ts           WebAudio 合成音（可选）
└── tests/
    └── core.spec.ts           [A] 单元测试（用例见附录 B）
```

**导入规则（违反 = 冲突）**
- A 只写 `src/core/**`、`src/data/**`、`src/levels/**`、`tests/**`。
  A **不许** import `src/ui/**`，不许碰 DOM，不许碰 `main.ts`。
- B 只能从 `src/core/index.ts`（`'../core'`）和 `src/levels/index.ts`（`'../levels'`）导入。
  B **不许** import `core/decode.ts` 这类内部文件，也**不许**自己实现解码/属性计算。
- 两边都以 `types.ts` 为唯一类型来源；`import type` 从 `'../core'` 拿即可。

**并行启动顺序（避免互相卡住）**
1. A 的**第一笔提交**必须把 8 个 core 文件都建出来（函数体可以先 `throw new Error('TODO')`），
   并在 `core/index.ts` 里补齐导出。这样 B 立刻能编译。
2. B 的第一笔提交先做 `theme.ts` + `parts-art.ts` + `creature.ts`，
   用**手写的 fixture 表型**（自己 new 一个 `Phenotype` 对象）驱动，完全不依赖 A 的运行时。
3. B 做交互时再 `new Session(LEVELS[0])`。

### 6.2 公共 API 精确签名

`src/data/parts.ts`（A）

```ts
import type { PartDefinition, PartId } from '../core/types';

/** 正好 16 个。顺序固定：A 家族 4 个(head,eye,horn,antenna)、
 *  U 家族 4 个(leg,longleg,claw,fin)、G 家族 4 个(shell,spike,crest,wing)、
 *  C 家族 4 个(glow,maw,sac,gill)。图例按这个顺序排，不要乱。 */
export const PART_DEFS: readonly PartDefinition[];

export const PART_BY_ID: Readonly<Record<PartId, PartDefinition>>;
```

文案要求：`label` 用标题式英文（`"Long Leg"`, `"Glow Organ"`）；`blurb` 一句 8~12 词的风味描述。

`src/core/codons.ts`（A）

```ts
import type { Codon, PartDefinition, PartId } from './types';

/** 恰好 64 个键（4^3），值是 PartDefinition 或字符串 'stop'。 */
export const CODON_TABLE: Readonly<Record<Codon, PartDefinition | 'stop'>>;

/** 查表。输入不是 3 个合法字母时抛 RangeError（内部用，外部别乱传）。 */
export function codonToPart(codon: Codon): PartDefinition | 'stop';

/** 取零件定义。id 非法时抛 RangeError（理论上不会发生）。 */
export function partDef(id: PartId): PartDefinition;
```

`src/core/decode.ts`（A）

```ts
import type { Gene } from './types';

/** 纯函数、永不抛异常、无副作用。语义见 2.2。时间复杂度 O(n)，n ≤ 64。 */
export function decode(seq: string): Gene;
```

额外保证（B 依赖它们）：
- `gene.parts[i].index === i`
- `gene.codons` 覆盖整条序列（每个碱基恰好属于一个槽位，`start` 升序，区间不重叠）
- 若 `issue === null`，则 `parts.length >= 1` 且 `parts[0].id === 'head'`
- `gene.codons` 里 `role:'stop'` 至多一个，`role:'start'` 至多一个

`src/core/phenotype.ts`（A）

```ts
import type { Gene, Phenotype } from './types';

/** 纯函数。九项 stats 全部存在（不会有 undefined）。语义见 2.5。 */
export function phenotype(gene: Gene): Phenotype;
```

`src/core/edit.ts`（A）

```ts
import type { EditRequest, Gene, Phenotype } from './types';

/** 纯函数：返回编辑后的字符串。**不做合法性/额度检查**（那是 Session 的事）。
 *  越界或非法 base 抛 RangeError。 */
export function applyEdit(seq: string, req: EditRequest): string;

/** 预览（鼠标悬停时画幽灵碱基用）：不修改任何状态。
 *  请求非法（越界/坏字母/same-base 的 replace）时返回 null，绝不抛。 */
export function previewEdit(
  seq: string,
  req: EditRequest,
): { seq: string; gene: Gene; phenotype: Phenotype } | null;
```

`src/core/diff.ts`（A）

```ts
import type { Edit, Gene, GeneDiff } from './types';

/** 纯函数。按零件序号对齐 before/after，算出每个位置是 kept/flipped/appeared/vanished；
 *  firstChange = 第一个非 kept 的下标（没有则 -1）。
 *  seam/shiftBy 直接按 edit 推：insert→(+1, edit.index)，delete→(-1, edit.index)，
 *  replace→(0, edit.index)。
 *  纯替换沉默位（第 2 个字母）时 partChanges 全是 kept、firstChange=-1，
 *  但 validityChanged 仍可能为 false——B 要据此播"什么都没变"的特殊动画。 */
export function diffGenes(before: Gene, after: Gene, edit: Edit): GeneDiff;
```

`src/core/judge.ts`（A）

```ts
import type { Gene, Judgement, Level, Phenotype } from './types';

/** 纯函数。语义见 2.6。绝不抛异常，gene 非法也返回结构化结果。 */
export function judge(level: Level, gene: Gene, phenotype: Phenotype): Judgement;
```

`src/core/session.ts`（A）

```ts
import type {
  Base, Edit, EditRejection, EditRequest, EditResult, Gene, Judgement,
  Level, Phenotype, SessionEvent, Unsubscribe,
} from './types';

export class Session {
  constructor(level: Level);

  /** 构造函数传进来的关卡（只读）。 */
  readonly level: Level;

  /** 当前序列（永远是合法大写 A/U/G/C）。 */
  get seq(): string;
  /** 当前解码结果，编辑后同步更新。 */
  get gene(): Gene;
  /** 当前表型。 */
  get phenotype(): Phenotype;
  /** 剩余额度 = level.budget - budgetUsed。 */
  get budgetLeft(): number;
  get budgetUsed(): number;
  /** 撤销栈非空。 */
  get canUndo(): boolean;
  /** 已发生的编辑（时间顺序，只读）。 */
  get history(): readonly Edit[];

  /** 试探：不会改变状态。返回 null 表示可以执行，否则返回拒绝原因。
   *  拒绝判定顺序固定：locked_op → no_budget → index_out_of_range
   *  → invalid_base → no_change → too_long。 */
  canEdit(req: EditRequest): EditRejection | null;

  /** 执行编辑。失败返回 {ok:false, reason}，成功时：
   *   seq 更新、history.push、budgetUsed++、同步 emit 'edit' 事件、
   *   返回新的 gene/phenotype/budgetUsed。永不抛异常。 */
  edit(req: EditRequest): EditResult;

  /** 便捷包装，等价于 edit({op:'insert',index,base}) 等。 */
  insert(index: number, base: Base): EditResult;
  remove(index: number): EditResult;
  replace(index: number, base: Base): EditResult;

  /** 撤销一步：回滚序列、弹出 history、budgetUsed--、emit 'undo'。
   *  没有可撤销时返回 false（不抛）。 */
  undo(): boolean;

  /** 回到关卡初始状态，清空 history，emit 'reset'。 */
  reset(): void;

  /** 用当前状态判定是否过关（等价于 judge(level, gene, phenotype)）。 */
  judge(): Judgement;

  /** 订阅状态变化。返回取消函数。同一监听器重复订阅会被忽略。
   *  事件在状态更新之后同步派发；回调里再调用 Session 方法是被禁止的（B 不要这么干）。 */
  subscribe(listener: (event: SessionEvent) => void): Unsubscribe;
}
```

`src/levels/index.ts`（A）

```ts
import type { Level } from '../core/types';

/** 游戏的全部关卡，按 number 升序。第一版正好 2 个。 */
export const LEVELS: readonly Level[];

export function levelById(id: string): Level | undefined;
export function levelAt(index: number): Level | undefined;
```

`src/core/index.ts`（A）最终形态

```ts
export * from './types';          // 已存在，别删
export * from './codons';
export * from './decode';
export * from './phenotype';
export * from './edit';
export * from './diff';
export * from './judge';
export * from './session';
```

### 6.3 错误处理约定

| 场景 | 约定 |
|---|---|
| 用户操作非法（越界/没额度/未解锁） | **不抛**，返回 `EditResult { ok:false, reason }` |
| `decode` 遇到任何输入 | **不抛**，用 `Gene.issue` 表达 |
| `judge` 遇到非法基因 | **不抛**，返回 `outcome:'invalid'` |
| `codonToPart` / `partDef` / `applyEdit` 的编程错误 | 抛 `RangeError`，消息里带出错的值 |
| UI 层 | 任何 `EditResult.ok === false` 都要给用户一句可读反馈（toast），不许静默吞掉 |

### 6.4 B 必须实现的渲染契约

- `parts-art.ts` 必须对 `PartId` 做**穷尽 switch**，并在 default 里写
  `const _never: never = id;`，这样以后加零件会编译报错。
- 生物必须完全由 `Phenotype.parts` 驱动，**任何按关卡号写死的形状都是 bug**
  （除了关卡主题色可以不同）。
- 基因带必须完全由 `Gene.codons` 驱动，不许用 `i % 3` 自己分组。
- 所有英文文案来自 `Level` / `PartDefinition`，除 4.7 列出的固定按钮词外不许硬编码生物学术语。

---

## 7. 验收标准

> 全部满足才算"这一版做完了"。负责人验收时按顺序跑。

| # | 项目 | 判定方式 |
|---|---|---|
| 1 | 可运行 | `npm install && npm run dev`，打开页面无白屏 |
| 2 | 类型 | `npx tsc --noEmit` 零错误 |
| 3 | 构建 | `npm run build` 成功；`npm run preview` 打开与 dev 表现一致 |
| 4 | 单测 | `npm test` 全绿，且包含附录 B 的关卡用例 |
| 5 | 第一关可通 | 只用手点（不用控制台）在 ≤2 刀内通关；`INS@3+U` 必过 |
| 6 | 第二关可通 | 只用手点在 ≤1 刀内通关；`DEL@7` 与 `DEL@8` 必过 |
| 7 | 存在死路 | L1 的 27 种删除都救不了；L2 的 112 种插入都救不了（测试里断言） |
| 8 | 非法态 | 删掉 `AUG` 或终止后页面不崩、给英文提示、RUN 置灰、可撤销 |
| 9 | 移码可见 | 插入/删除后能看到整段向右/左滑一格 + 零件逐个翻面（录屏自检） |
| 10 | 额度 | 用完后 UI 显示禁用；撤销后额度恢复；`reset` 回满 |
| 11 | 移动端 | 375×667 视口下，手指能完成"插入一个碱基 + 通关第一关" |
| 12 | 控制台 | 无 error、无未捕获 rejection、无 404 |
| 13 | 资源 | `dist/` 里没有图片/音频/字体文件；`grep -r "http" dist` 无外链 |
| 14 | 文案 | 游戏内没有中文；没有 `TODO`/`Lorem` 漏在界面上 |

---

## 8. 非目标（这一版明确不做）

1. **不做自由文本编辑**：不能粘贴一整条序列，也不能直接敲字母改全串；只有三种手术。
2. **不做物理**：生物不是刚体，没有布娃娃、没有碰撞物理；跑动是脚本动画。
3. **不做存档/云同步**：bestiary 最多用 `localStorage` 存一个 id 列表，不做账号。
4. **不做多语言**：只有英文 UI；中文只出现在文档和注释里。
5. **不做音频文件**：要么 WebAudio 现场合成，要么没有声音。
6. **不做关卡编辑器 UI**：加关就是加一个 `.ts` 文件。
7. **不做第三关 / replace 教学关**：`replace` 的类型和 Session 支持要有，但没有关卡用它。
8. **不做成就、排行榜、分享图**。
9. **不做精细响应式**：能玩、不重叠、能点就行，不追平板/横屏的各种断点。
10. **不做撤销历史面板**：只有线性 undo/redo-ish（本版只有 undo）。
11. **不做本地化文案长度自适应**：英文固定，不再考虑德语长词。
12. **不做无障碍朗读全文**：只保证按钮有 `aria-label`、canvas 有 `role="img"` + 描述。

---

## 附录 A · 一页速查

```
起始：AUG（同时是 head 零件）
终止：UAA / UAG / UGA（覆盖 U 家族）
第1位 = 家族   A 感官 | U 肢体 | G 外壳 | C 内脏
第3位 = 变体   G 基础 | A 长 | C 尖 | U 膜
第2位 = 沉默（不影响零件）

腿 U?G=2步幅  长腿 U?A=3步幅  爪 U?C=1步幅+2抓握  鳍足 U?U=2泳
甲 G?G=2护甲  刺 G?C=2尖刺    冠 G?A=1护甲        翼 G?U=2升力
头 A?G=1感知  眼 A?C=2感知    角 A?A=2尖刺        触角 A?U=1感知
发光 C?G=2发光 口器 C?C=2咬合  气囊 C?A=1护甲+1泳  鳃 C?U=2泳
```

## 附录 B · `tests/core.spec.ts` 的用例清单（数值已核对）

A 必须至少覆盖下面这些（可以再多）：

```ts
// ---- 基础解码 ----
decode('')                       // issue 'empty'
decode('XYZ')                    // issue 'bad_char'
decode('AUG')                    // issue 'no_stop', parts = [head]
decode('AUGUAA')                 // issue null, parts=[head], stopCodon 'UAA', stopIndex 3
decode('CCC')                    // issue 'no_start', parts = []
decode('UUGUCGUGG')              // 三个都是 leg（沉默位）
CODON_TABLE 键数量 === 64
codonToPart('UAG') === 'stop'
codonToPart('UCA').id === 'longleg'

// ---- 关卡 1 初始 ----
const l1 = LEVELS[0];
l1.sequence === 'AUGCGUCGUCAGGGCCGACCUGAAUAG'
const g0 = decode(l1.sequence);
g0.issue === null; g0.stopCodon === 'UAG'; g0.stopIndex === 24; g0.trailerStart === 27;
g0.parts.map(p => p.id) === ['head','gill','gill','glow','spike','sac','gill','crest']
const p0 = phenotype(g0);
p0.stats.stride === 0; p0.stats.swim === 7; p0.stats.armor === 2;
p0.stats.spikes === 2; p0.stats.glow === 2; p0.stats.sight === 1;
judge(l1, g0, p0).outcome === 'fail'

// ---- 关卡 1 设计解 ----
new Session(l1).insert(3, 'U') 成功后：
  seq === 'AUGUCGUCGUCAGGGCCGACCUGAAUAG'
  gene.stopCodon === 'UGA'; gene.stopIndex === 21; gene.trailerStart === 24;
  gene.seq.slice(gene.trailerStart) === 'AUAG'   // 末尾不翻译区
  parts === ['head','leg','leg','longleg','shell','glow','eye']
  stats.stride === 7; stats.sight === 3
  session.judge().outcome === 'pass'; failAtX === 1

// ---- 关卡 1 死路 ----
对 l1.sequence 的 27 种删除，decode 结果的 issue 一律是 'no_start' 或 'no_stop'
（即：删一刀永远救不了第一关）

// ---- 关卡 2 初始 ----
const l2 = LEVELS[1];
l2.sequence === 'AUGGGCGAGUCUGGGUCUGUGACAUAA'
g0.parts.map(p=>p.id) === ['head','spike','shell','fin','shell','fin','shell','horn']
p0.stats.flight === 0; p0.stats.armor === 6; p0.stats.spikes === 4; p0.stats.swim === 4
judge(l2, g0, p0).outcome === 'fail'

// ---- 关卡 2 设计解 ----
new Session(l2).remove(7) 成功后：
  seq === 'AUGGGCGGUCUGGGUCUGUGACAUAA'
  gene.stopCodon === 'UGA'; gene.stopIndex === 18
  parts === ['head','spike','wing','glow','wing','glow']
  stats.flight === 4
  judge(...).outcome === 'pass'
// 第二解
new Session(l2).remove(8) 也 pass

// ---- 关卡 2 死路 ----
对 l2.sequence 的 112 种单碱基插入，没有任何一种能让 judge 返回 'pass'

// ---- 编辑语义 ----
replace 同一个字母 → { ok:false, reason:'no_change' }
budget 用完后再 insert → { ok:false, reason:'no_budget' }
undo() 之后 budgetUsed 回到 0，seq 回到初始
insert 到 index === seq.length 合法；index > seq.length → 'index_out_of_range'
解锁列表里没有 'replace' 的关卡调用 replace → 'locked_op'

// ---- diff ----
对 l1 的 insert(3,'U')：
  diff.shiftBy === 1; diff.seam === 3; diff.firstChange === 1;
  partChanges[0].kind === 'kept'（head 没变）
```

## 附录 C · 调试手段（不强制）

- `?debug=1` 时在右下角显示一个半透明小面板：当前 stats 九项、`judge()` 的 JSON、
  `level.solutionNote`、`history.length`。
- 快捷键 `Shift+R` 重载当前关卡。
- 开发期 console 输出可以留，但发布前 `console.info` 只保留启动那一行。

## 附录 D · 交接检查单

**A 交活前**
- [ ] 8 个 core 文件 + data/parts + levels 全部有实现，`core/index.ts` 导出齐
- [ ] `npx tsc --noEmit` 绿
- [ ] `npm test` 绿，附录 B 的用例都在
- [ ] 没有 import 任何 `ui/`
- [ ] 所有函数都是纯的（除 Session 的方法），无 `Date.now()` / 随机数（判定必须确定性）

**B 交活前**
- [ ] 两关都能只用鼠标/手指通关
- [ ] 插入/删除时能看见整段滑动 + 零件翻牌
- [ ] 非法态有英文提示、RUN 置灰、撤销可用
- [ ] 375px 宽能玩
- [ ] 没有硬编码生物学术语
- [ ] 控制台干净

