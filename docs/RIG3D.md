# 拼装小鸡 · 3D 视觉规格（RIG3D）v1.0

> 配套 `docs/DESIGN.md` §7.2.1 与 `docs/INTERFACES.md` §1.1 / §2.2。
> 只回答"怎么画"：鸡身、24 个零件、N 个零件的排布、材质描边、光照阴影、程序化动画、性能预算。
> 不写规则、不写 UI。
>
> 硬前提：Three.js r170 / WebGL2；**零模型文件**，几何全部 `BufferGeometry` 代码生成；
> 固定相机；卡通着色 + 描边；同一套代码要能进微信 / 抖音小游戏（主包 ≤ 4 MB）。

---

## 0. 单位与坐标

| 项 | 约定 |
|---|---|
| 长度 | **1 单位 = 1 分米（dm）**，成年鸡身长约 1.5–2.0 |
| 角度 | 文档里一律**度**；写进 Three.js 前再乘 `Math.PI/180` |
| 坐标 | **+x 前方**（鸡头朝 +x）、**+y 上**、**+z 右侧**（右手系，`x × y = z`） |
| 脚底 | 地面 `y = 0`，所有零件都以此为基准 |
| 机位 | 相机在 **+z 侧**看过来，所以屏幕右 = 世界 +x（鸡朝右跑） |

**三角面预算**：鸡身 ≤ **1200**、单件 ≤ **300**、24 件合计 ≤ **3.0k**（实测 1924）；描边壳会让 GPU 面数翻倍，但预算按**模型本身**算。
**构建约束**：① 建完 `toNonIndexed()` + `computeVertexNormals()`（硬边）；② 多部件用 `mergeGeometries` 合成**一个** `BufferGeometry`（一零件 = 一 draw call）；③ 禁用 `Math.random()`，噪声用 §2.2 的整数哈希；④ 几何进缓存只建一次（§8.3）。

---

## 1. 相机与场景基准

```ts
camera.fov = 35; camera.near = 0.5; camera.far = 40;
camera.position.set(3.8, 5.3, 6.6);
camera.lookAt(0, 1.15, 0);
```

换算：距离 8.67、**方位角 29.9°**（相对 +z 偏向 +x）、**俯角 28.6°**，合成视线与地平面约 40°——即设计文档"斜 45°"的落地值。视野在目标点处高 `2*8.67*tan(17.5°)=5.47` 单位，2.3 高的鸡占屏高约 **42%**。

| 场景项 | 值 |
|---|---|
| 背景 | 竖向渐变 `#D7EEF8`（上）→ `#BFE0EE`（下），用一个全屏 `Mesh(PlaneGeometry)` 或 `scene.background = Color('#CFE9F5')` |
| 雾 | `Fog('#CFE9F5', 12, 26)`，只为了让远处的跑道淡出 |
| 地面 | `CircleGeometry(14, 48)` 旋转 −90°，色 `#E7D9B4`，`MeshToonMaterial`（也吃光照，才有"地面"感） |
| 相机位移 | 只允许 `shake`（§7.6）与 ±0.15 单位的推近，不做自由旋转 |
| 抗锯齿 | `antialias: true`；DPR = `min(devicePixelRatio, 2)`（移动端上限 2） |

---

## 2. 鸡身（base rig）

### 2.1 骨架节点

鸡身是**一棵固定的节点树**（不是一个 mesh）；下列坐标均为**相对 rig 原点**，零件的 anchor 指向这些节点：

```
rig (Group)                    世界位置/朝向
├─ bodyCore (Mesh)             Sphere(10,7) 140 面，scale (0.42,0.46,0.38)，中心 (0,1.02,0)
├─ head (Group)                中心 (0.80,1.70,0)
│   ├─ headMesh (Mesh)         Sphere(12,8) 192 面，scale (0.40,0.38,0.36)
│   ├─ eyeR/eyeL (Group)       head 局部 (0.34,0.06,±0.215)；内含 eyeMesh Sphere(8,6) r0.075 色 #241B16 + glint Sphere(4,3) r0.026 白
│   ├─ beakAnchor              (1.14, 1.68, 0)
│   └─ crestAnchor             (0.78, 2.04, 0)
├─ tailStump (Mesh)            Cone(8,0.16,0.14) 16 面，(-0.58,1.12,0)，rotation.z = 90°
├─ wingAnchorR/L              (-0.02, 1.38, ±0.30)
├─ legAnchorR/L               ( 0.05, 0.68, ±0.24)
├─ bodyAnchor                 (0, 1.02, 0)
└─ blobShadow (Mesh)           y = 0.012（§6.3）
```

**鸡身预算**：140 + 192 + 2×(96+24) + 16 = **588 面**（≤1200 ✓）。
bodyCore 之所以小：设定就是"一只什么都没有的小鸡"，**体积感来自 `body.*` 零件**，裸鸡本就是瘦骨架。

### 2.2 造型与扰动

- bodyCore / headMesh 都是 **UV 球**非均匀缩放成椭球；低多边形优先"少分段 + 硬边"，不要用 Icosahedron 细分（面数涨得比细节快）。
- **噪声扰动**（只给 bodyCore）：沿法线 `p += n * 0.060 * (hash01(i*7+1) - 0.5)`，`i` = 顶点下标；幅度 ±3%，去掉塑料感，**不能改变剪影**。

```ts
/** 整数哈希 → [0,1)，跨端逐位一致（不要用 Math.sin 版） */
function hash01(i: number): number {
  let x = (i * 374761393 + 668265263) >>> 0;
  x = ((x ^ (x >>> 13)) * 1274126177) >>> 0;
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}
```

### 2.3 朝向约定

- 所有"向前"的零件（喙）沿 **+x**；腿沿 **−y**；翅膀沿 **+z**；尾沿 **−x**。
- 零件几何**只在 +z 侧建一份**，左侧用镜像（§4.5），不要建两套。

---

## 3. 24 个零件的几何

`PartArt.geometry` 即下表第一列（与 `parts.ts` 的 24 个 id 一一对应，每槽 4 件）；每件由若干部件合并成一个 `BufferGeometry`，原点在锚点、朝向按 §2.3，「原型」对应设计提出的形态要求。

| id | 原型 | 原语与参数（单位 dm，原点在锚点、朝向见 §2.3） | 面 | 材质 |
|---|---|---|---|---|
| `body.basic` | 绒球 | `Sphere(12,9)` 缩放 (0.72,0.66,0.62)，中心 (0,0.02,0)，顶 ±0.04 噪声 | 216 | feather |
| `body.plump` | 胖 | `Sphere(12,9)` 缩放 (0.84,0.78,0.76)，底面下移 0.06 成垂腹 | 216 | feather |
| `body.slim` | 瘦 | `Sphere(10,8)` 缩放 (0.50,0.82,0.46)，`rotation.z = −6°` | 160 | feather |
| `body.tough` | 甲壳 | `Icosahedron(1,1)` 缩放 (0.80,0.72,0.68)，不扰动 | 80 | metal |
| `beak.short` | 喙囊 | `Cone(6,r0.13,h0.20)` 沿 +x + 下囊 `Sphere(8,5) r0.09` 于 (0.10,−0.06,0) | 92 | bone |
| `beak.sharp` | 尖 | `Cone(6,r0.085,h0.34)`，尖端再前移 0.02 | 12 | bone |
| `beak.long` | 长钩 | 两段 `Cone(6)`：h0.26 直出 + h0.22 绕 z 下转 28° | 24 | bone |
| `beak.hammer` | 锤 | `Cone(6,r0.09,h0.16)` + `Box(0.26,0.18,0.16)` 于 x=0.20 | 24 | bone |
| `legs.runner` | 细长 | 大腿 `Cyl(6,r0.045/0.035,h0.34)` + 膝 `Sph(6,4)r0.05` + 胫 `Cyl(6,0.035/0.03,0.30)` + 脚 `Box(0.14,0.04,0.10)` + 3 趾 `Cone(4,r0.02,h0.07)` | 132 | bone |
| `legs.stub` | 粗壮 | 同 runner 但 r0.09/0.075、h0.24+0.22，脚 `Box(0.18,0.05,0.14)`，2 趾 | 124 | bone |
| `legs.spring` | 弹簧 | 螺旋 `CatmullRom` 4 圈（r0.09→0.05，y0→−0.52）+ `Tube(28,r0.028,4)` + 脚 `Box(0.13,0.04,0.09)` | 236 | bone |
| `legs.claw` | 爪 | 胫 `Cyl(6,0.05/0.04,0.46)` + 3 爪 `Cone(5,r0.03,h0.16)`（前/侧/后 ±32°） | 54 | bone |
| `wings.feather` | 羽翼 | 3 片 `Box(0.06,0.02,0.30)` 沿 z 排开、逐片下压 12° + 根 `Sph(8,5)r0.09` | 116 | feather |
| `wings.glide` | 翼膜 | 自定义 8 面扇：前缘 (0,0,0.05)→(0,0,0.85)，后缘 (−0.26,−0.02,0.62)(−0.30,−0.05,0.34)(−0.18,0,0.12) + 前缘 `Cyl(4,r0.03,0.82)` | 24 | feather |
| `wings.bat` | 蝠翼 | 膜 6 面（后缘到 −0.42）+ 3 指骨 `Cyl(4,r0.022,0.42~0.62)` + 肘 `Sph(6,4)r0.05` | 102 | skin |
| `wings.armor` | 甲翼 | 3 片 `Box(0.34,0.04,0.22)` 沿 z 每 0.22 叠一层、逐层下压 8° | 36 | metal |
| `tail.fan` | 扇 | 5 片 `Plane(0.34,0.22)` 绕 x 呈 −35°~+35°，双面 | 10 | feather |
| `tail.spike` | 刺锤 | 柄 `Cyl(6,0.05/0.07,0.34)` + `Icosa(0.16,0)` + 6×`Cone(4,r0.025,h0.14)` | 92 | bone |
| `tail.whip` | 鞭 | 3 段 `Cyl(5)` 0.22/0.18/0.14，链式绕 z 下弯 20°/30° | 60 | skin |
| `tail.balance` | 羽簇 | 4 片 `Plane(0.12,0.30)` 绕 x ±28°，中心 −6° | 8 | feather |
| `crest.spike` | 棘 | 4 片 `Cone(3,r0.06,h0.22)` 沿 x 排开、逐片 −14° | 24 | bone |
| `crest.crown` | 王冠 | `Cyl(8,r0.16,h0.10,open)` + 5×`Cone(4,r0.035,h0.12)` 均布环顶 | 52 | metal |
| `crest.plume` | 羽饰 | 3 片 `Plane(0.06,0.34)` 前后错开 0.05、绕 z ±15° | 6 | feather |
| `crest.horn` | 角 | 2×`Cone(6,r0.05,h0.34)` 分列 ±0.07，外倾 22°、后倾 15° | 24 | bone |

**合计 1924 面**（body 672 / beak 152 / legs 546 / wings 278 / tail 170 / crest 106；单件 ≤300 ✓，24 件 ≤3.0k ✓）。补充约定：

- **腿是刚性件**：几何里已把膝弯做死，运行时只在髋部旋转（§7.3），不做二级关节。
- **翼/尾是薄片**：`PlaneGeometry` 一律 `side: DoubleSide` 并加进描边壳；其余用 `FrontSide`。
- 所有 id 的 `art.scale` 已在 `parts.ts` 里给好（0.85–1.15），几何**按 1.0 建**，缩放交给 layout。

---

## 4. `layoutParts()`：N 个零件怎么排

> 输入 `PartInstance[]`，输出 `PlacedPart[]`；**纯函数、无随机、同输入同输出**。
> 槽位按 `body → beak → legs → wings → tail → crest` 固定顺序、槽内按数组顺序处理；输出下标即稳定 id（动画相位靠它）。

### 4.1 组合公式（对所有槽位统一）

```ts
const DEG = Math.PI / 180;

// 1) 每个槽位先用 §4.2 的公式算出基准变换 (x,y,z) / baseRot / baseScale
// 2) 再把零件自己的 art.offset / rotation / scale 叠上去：
pos   = (x, y, z) + R(baseRot) * (art.offset * baseScale);
rot   = baseRot + art.rotation;              // 度，逐分量相加
scale = baseScale * art.scale;
```

`R(baseRot)` 只作用于 `art.offset`（offset 在零件局部系解释）；`rotation` 一律**度**，渲染层转弧度。
**下表的 `scale` 都是 `baseScale`**，`art.scale` 由上面这条公式统一乘上，不要乘两遍。

另外两个全局量（每帧不变，只在换装时算一次）：

```
girth = clamp(1 + 0.45 * (art.scale(body[0]) - 1), 0.75, 1.45)   // 没有 body 时 = 1.0
cap(N) = min(N, 64)                                              // 与 EditErrorCode 'too_many' 对齐
```

### 4.2 逐槽位闭式解

单位：位置 dm、角度 度。`i` = 槽内下标（0 起），`N` = 该槽总数。

**`body`**（向后堆叠，逐个变小）

```
scale = max(0.55, 1 - 0.12*i)
x = -0.12 - 0.52*i        y = 1.02 + 0.015*i        z = 0
rot = (0, 0, 0)
```

**`beak`**（集中在前端，沿 y 错开 + 轻微缩放）

```
dy    = N <= 3 ? 0.115 : max(0.055, 0.30 / (N - 1))
x = 1.14 + 0.03*i         y = 1.68 - i*dy           z = (i % 2 ? 1 : -1) * 0.02
yaw   = (i - (N - 1) / 2) * 4                       // 度，左右微张
rot   = (0, yaw, 0)
scale = max(0.60, 1 - 0.08*i)
```

**`legs`**（左右交替 + 间距压缩 + 每 3 对叠一层）

```
r     = floor(i / 2)                                // 第几对
side  = i % 2 ? -1 : +1                             // +1 = 右(+z)
P     = ceil(N / 2)                                 // 对数
dx    = min(0.34, 1.10 / max(1, P - 1))             // 关键：条数越多越挤
x     = 0.05 + ((P - 1) / 2 - r) * dx
layer = floor(r / 3)                                // 第 4 对开始进第二层
y     = 0.68 - 0.17 * layer
z     = side * (0.24 + 0.06 * layer) * girth
rot   = (-side * (4 + 2 * layer), 0, 0)             // 绕 x 向外撇
scale = max(0.72, 1 - 0.03 * (N - 2)) * (1 - 0.05 * layer)
```

10 条腿（N=10）的实算：`P=5, dx=0.275`，x 依次 **+0.60 / +0.325 / +0.05 / −0.225 / −0.50**（每对左右各一），
r=0..2 在 layer 0（y=0.68, z=±0.24），r=3..4 在 layer 1（y=0.51, z=±0.30）。
**6 条腿以内不会出现第二层**（layer 恒为 0），这是刻意的阈值。

**`wings`**（每对沿背部逐层升高、外扩、后掠、缩小）

```
q     = floor(i / 2)
side  = i % 2 ? -1 : +1
x = -0.02 - 0.07*q        y = 1.38 + 0.13*q        z = side * (0.30 + 0.11*q)
rot   = (-side * (14 + 7*q), side * (-6 - 3*q), 0)  // 绕 x 上抬 + 绕 y 后掠
scale = max(0.55, 1 - 0.10*q)
```

5 对翼（N=10）：y = **1.38 / 1.51 / 1.64 / 1.77 / 1.90**，z = **±0.30 / 0.41 / 0.52 / 0.63 / 0.74**，
scale 递减到 0.60。层间不会互相穿插，从 45° 看是一叠"羽毛扇"。

**`tail`**（竖直扇形展开）

```
spread = min(16, 64 / max(1, N - 1))                // 度
ang    = (i - (N - 1) / 2) * spread
x = -0.58 - 0.02*i        y = 1.12 + 0.03*i        z = 0
rot = (0, 0, ang)                                   // 绕 z：竖直扇，斜视图下最易读
scale = max(0.70, 1 - 0.06*i)
```

**`crest`**（沿头顶前后错开 + 确定性抖动）

```
h = hash01(i * 17 + 3)                              // §2.2，0..1
x = 0.78 - 0.11*i        y = 2.04 + 0.03*h        z = 0
rot = (0, 0, (h - 0.5) * 10)                        // ±5°
scale = (0.92 + 0.16 * h) * max(0.70, 1 - 0.05*i)
```

> 设计文档里"冠有随机但有种子"就落在这个 `hash01` 上：它不是每帧随机，
> 而是**只跟下标有关**的常数，换装前后同一件永远同一个歪法。

### 4.3 多件同槽的处理原则

| 槽位 | 策略 | 理由 |
|---|---|---|
| body | 向后**堆叠** + 递减缩放 | 视觉上像体节变长，且不会挡住头 |
| beak | 沿 y **错开** + 递减缩放 | 合并会丢动画与辨识度；错开能看出"装了三张嘴" |
| legs | 左右**交替** + 间距压缩 + 分层 | 保证任意条数都落地、不重叠 |
| wings | 层叠**外扩** + 后掠 | 越多的翼越像展开的羽扇，不糊成一团 |
| tail | **扇形**展开 | 侧后方看过去最有体积 |
| crest | 沿头顶**排队** + 抖动 | 冠是装饰，成排比堆叠好看 |

**统一兜底**：`scale ≥ 0.55`；`|z| ≤ 1.2`；同槽超过 12 件只做等比压缩，不再加层。**已知简化**：legs/wings/tail/beak 的锚点固定在 base rig 上，body 链只向后长——4 个 body 时尾巴会长在“腰”上，M0 接受。

### 4.4 镜像（左半身）

`side = -1` 时**不建第二套几何**，走这条规则：

```
pos.z = -pos.z
rot.x = -rot.x          // 绕 x 的旋转在镜像后取反
rot.y = -rot.y          // 绕 y 的旋转在镜像后取反
rot.z =  rot.z          // 绕 z 的旋转镜像后不变（对 M=diag(1,1,-1) 可验证）
geometry = 镜像版（顶点 z 取反 + 三角形绕序反转），构建期缓存
instanceKey = `${geometry}|${material}|L`
```

不用负缩放：负行列式翻转绕序，背面剔除会把零件剔没；构建期翻转几何零成本。`PartArt.mirrored` 在 M0 全为 `false`（左右由 `i` 奇偶决定）。

---

## 5. 材质与描边

### 5.1 卡通三段色阶

```ts
// 3×1 灰度阶梯 + NearestFilter → 硬边三段
const bands = new Uint8Array([128,128,128,255, 192,192,192,255, 255,255,255,255]);
const gradientMap = new THREE.DataTexture(bands, 3, 1, THREE.RGBAFormat);
gradientMap.minFilter = gradientMap.magFilter = THREE.NearestFilter;
gradientMap.generateMipmaps = false; gradientMap.needsUpdate = true;
```

| 材质 key | 颜色 | 用于 |
|---|---|---|
| `feather` | `#FFD24A` | 鸡身、羽翼、羽尾、羽冠 |
| `bone` | `#F1DCB0` | 喙、腿、角、棘、爪 |
| `metal` | `#A9BCCD` | 甲壳、甲翼、王冠、锤 |
| `skin` | `#F2B9A0` | 蝠翼膜、鞭尾 |

```ts
new THREE.MeshToonMaterial({
  color, gradientMap,
  flatShading: true,      // 低多边形必须有硬边
  side: THREE.FrontSide,     // 薄片件（PlaneGeometry：羽/膜/尾扇）单独用 THREE.DoubleSide
});
```

- `renderer.outputColorSpace = SRGBColorSpace`、`toneMapping = NoToneMapping`（卡通色不能被 ACES 压灰）；不要用 `emissive`，受击闪白走 §7.6。

### 5.2 描边：反向法线壳（选它）

| 方案 | 做法 | 代价 | 结论 |
|---|---|---|---|
| **反向法线壳** | 复制几何，顶点沿**焊接后的平滑法线**外扩 `w`，`side: BackSide`，纯色 `#2E2119` | 面数 ×2、每几何 +1 draw call | **采用**，厚度可控、任意 DPR 下都是 1.5–2 px |
| `EdgesGeometry` + `LineSegments` | 只画夹角 > 20° 的边 | 三角面很少，但线宽恒为 1px，低 DPR 下发虚 | 只用于 `metal` 件的"硬边高光"补充 |

关键细节：**外扩必须用焊接后的平滑法线** —— 低多边形是硬边（同位置多法线），按面法线外扩会在棱上裂开出现黑缝。做法：

```ts
const welded = BufferGeometryUtils.mergeVertices(geo, 1e-4);
welded.computeVertexNormals();                 // 平滑法线
const pos = welded.attributes.position, nor = welded.attributes.normal;
for (let i = 0; i < pos.count; i++) {
  pos.setXYZ(i,
    pos.getX(i) + nor.getX(i) * w,
    pos.getY(i) + nor.getY(i) * w,
    pos.getZ(i) + nor.getZ(i) * w);
}
```

宽度 `w = clamp(0.28 × 零件最小半径, 0.006, 0.020)`：鸡身/翼 0.018、喙/冠/爪 0.010、触角类 0.006。材质 `MeshBasicMaterial`（不受光）、`depthWrite: true`。

---

## 6. 光照与阴影

### 6.1 三盏灯（固定，不随相机）

| 灯 | 类型 | 颜色 | 强度 | 位置 / 方向 |
|---|---|---|---|---|
| 主光 | `DirectionalLight` | `#FFF2DC` | **1.05** | (4.5, 7.0, 5.5) → 目标 (0,1,0) |
| 补光 | `DirectionalLight` | `#AFC9FF` | **0.30** | (−5.0, 3.0, −4.0) → 目标 (0,1,0) |
| 环境 | `HemisphereLight` | 天 `#DFF3FF` / 地 `#C9B07A` | **0.40** | — |

主光从左上前方（方位 39°、俯角 40°）；冷色补光从后下方打，在边缘拉一条冷边。三盏灯全部 `castShadow = false`。

### 6.2 为什么不用 shadow map

额外的深度 pass ≈ 场景几何再渲染一遍（draw call **+40%~60%**）；1024² 深度图 ≈ 4 MB 显存 + PCF 采样；阴影痤疮还会与硬边描边互相打架。低多边形卡通用 blob 的收益压倒性更好。

### 6.3 贴地 blob 阴影（怎么做）

```ts
const tex = radialShadowTexture();   // 64×64 径向渐变 rgba(0,0,0,.55) → 透明
const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0.38 });
const blob = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
blob.rotation.x = -Math.PI / 2; blob.position.y = 0.012; blob.renderOrder = 1;
```

- 尺寸：`blob.scale.set(1.55 * girth, 1, 0.95 * girth)`，随 `girth` 与起跳高度变化
  （离地越高越淡：`opacity = 0.38 * clamp(1 - height/1.2, 0.25, 1)`）。
- 一个 quad、两个三角、一次 draw call，**这就是全部阴影成本**。

---

## 7. 程序化动画（无骨骼）

全部由 `update(t)` 驱动，`t` 单位秒，**不依赖帧数**；不分配新对象（复用临时 `Vector3/Euler`）。

### 7.1 呼吸（所有生物）

```
s = sin(2π t / 2.8)
rig.scale.set(1 - 0.008*s, 1 + 0.016*s, 1 - 0.008*s)   // 以脚底为锚点；与 §7.6 的 punch 相乘，不要覆盖
head.position.y = 1.70 + 0.012*sin(2π t / 2.8 + 0.6)   // 头慢半拍
```

### 7.2 眨眼

```
const bp = t % 4.2;
const blink = bp > 4.05 ? Math.sin((bp - 4.05) / 0.15 * Math.PI) : 0;
eyeMesh.scale.y = 1 - 0.92 * blink;      // 眼白压扁成一条线，瞳孔跟着压
```

### 7.3 迈步（10 条腿也协调）

腿是刚性件，**只在髋部转**（绕 z 轴前后摆；绕 x 的外撇角已在 layout 里定死）。

```
T     = 0.70 s                                    // 步态周期
φ_i   = frac(0.5*i + 0.08*floor(i/2))             // 由 layout 下标决定，见 §4.2
swing = 20° * sin(2π (t/T - φ_i))                 // 绕 z，正值 = 向前
bob   = 0.022 * sin(4π t/T + 0.4)                 // 身体上下：一个周期起伏两次
rig.position.y = groundY + bob
```

- 10 条腿的 φ 依次是 **0 / .50 / .08 / .58 / .16 / .66 / .24 / .74 / .32 / .82**，
  相邻两条永远差半拍，整体走出一条从左到右的波——**看起来像蜈蚣在走，而不是原地抖**。
- 相位只跟槽内下标 `i` 有关：换装不会"跳相"，卸掉零件后其余腿保持原相对相位，不会突然同步。
- 腾空时 `swing × 0.3`、`bob = 0`。
- **欧拉顺序坑**：外撇（绕 x）和摆动（绕 z）不要塞进同一个欧拉角，用一个 `hip` 节点装外撇、其子节点装摆动。

### 7.4 扇翼

```
T_w   = 0.55 s（待机） / 0.30 s（战斗/腾空）
amp   = 8°（待机） / 26°（战斗）
flap  = -(8° + amp * sin(2π t / T_w))             // 绕 x（翼根上下扇）
第 q 层的相位滞后 = 0.05*q 秒：sin(2π (t - 0.05q) / T_w)
```

左右两侧：扇动是绕 x，按 §4.4 的规则**左侧取反**（`flapL = -flapR`）；腿的前后摆是绕 z，镜像后**不变**，左右同号。

### 7.5 尾巴 / 冠 / 喙的次要动作

```
tail.rotation.y  = 4°  * sin(2π t / 3.1 + i * 0.3)     // 左右摆
crest.rotation.z = 1.5° * sin(2π t / 2.2 + i * 0.5)    // 被风吹的晃
beak.rotation.z  = 1.2° * sin(2π t / 5.0)              // 极慢的呼吸式张合
```

### 7.6 受击抖动

收到 `hit` 事件时记录 `t0`，之后：

```
Δ = t - t0
shake  = 0.06 * exp(-9*Δ) * sin(52*Δ)          // 世界单位，作用在 rig.position.x / z
punch  = 1 + 0.08 * exp(-14*Δ)                 // 整体 scale 脉冲
flash  = clamp(1 - Δ/0.12, 0, 1)               // 白色 Sprite 透明度
```

Δ > 0.5 s 归零。全部在 `update` 里算，禁止 `setTimeout`。

---

## 8. 性能预算

目标：**1280×720 / DPR 1 时 60 fps**，移动端 DPR ≤ 2 时 **≥ 50 fps**。

### 8.1 上限

| 指标 | 桌面 | 移动 | 说明 |
|---|---|---|---|
| draw call | ≤ 80 | ≤ 60 | 含描边壳；实际常规配置只有 25 |
| 三角面 | ≤ 60k | ≤ 30k | 实际全场 < 12k |
| 材质实例 | ≤ 16 | ≤ 16 | 4 材质 × 2（本体/描边）足够 |
| 每帧新建对象 | 0 | 0 | 临时向量模块级复用 |

### 8.2 批量：`InstancedMesh`

- 分组键就用 `PlacedPart.instanceKey = `${geometry}|${material}|${'R'|'L'}``。
- 同一 key 的所有零件 → **一个 `InstancedMesh`**（几何 = 该 key 的缓存几何，`count = n`）。
- 描边壳同法：第二个 `InstancedMesh` 共用同一批矩阵，只换材质。
- 每帧只更新**会动**的实例（腿/翼/尾/冠），静态件（body、beak）只在换装时写一次：

```ts
mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
mesh.frustumCulled = false;          // 实例散开时包围球不准，直接关掉
```

- 摆动矩阵 = `rig.matrixWorld × hipMatrix × restMatrix`；10 条腿 = 10 次 `compose`，开销可忽略。

### 8.3 几何缓存

```ts
const cache = new Map<string, { geo: BufferGeometry; hull: BufferGeometry }>();
// key = geometryKey（24 个）+ 镜像版 '|L'；首次使用时构建。24 件 ≈ 1924 面 ≈ 5.8k 顶点 ≈ 0.25 MB 显存（含描边壳约 0.5 MB）
```

- 构建耗时：24 件全建约 **12–25 ms**（一次性，放在 loading 里）。
- 换装时**不重建**几何，只重算矩阵；颜色靠材质，不靠几何。

### 8.4 极端配置预估

| 配置 | 三角面（含壳） | draw call | 结论 |
|---|---|---|---|
| 裸鸡（无零件） | 1.2k | 10 | 只有 base rig + 地面 + 阴影 |
| 标准一套（身/喙/腿对/翼对/尾/冠） | 2.7k | 25 | 主力形态 |
| **10 条腿 + 1 喙** | 5.9k | 15 | 腿同 id → 左右各 1 个 instanced（+壳） |
| **10 条腿 + 5 对翼（同 id）+ 全套** | 8.3k | 25 | 目标压力场景，桌面 60fps 无压力 |
| 24 件各带一个（8 种腿/翼方向全开） | 5.0k | 70 | 最坏 draw call 场景，仍在预算内 |

结论：**draw call 由"不同 id 的数量"决定，与零件总数无关**——10 条腿不会比 2 条腿多几个 draw call，只多 8 次矩阵更新。

---

## 9. 验收自检（肉眼可判）

1. **体积感**：转动相机 ±10°，两条腿的遮挡关系会变（近腿挡远腿），描边始终 1.5–2 px 且均匀、无断口。
2. **10 条腿**：`legs.spring × 10` 能看到 **5 个 x 位置 × 左右 × 2 层**，无腿穿地（脚底 ≥ −0.02）、无两条腿重合（间距 ≥ 0.12）。
3. **三段色阶**：鸡身上只能数出 **3 个亮度台阶**；出现平滑渐变说明 `gradientMap` 被 mipmap 或线性采样糊掉了。
4. **活着**：静置 10 秒能数到 **2 次眨眼、3 次呼吸起伏**；5 对翼的扇动有明显先后（不同步）。
5. **性能**：10 条腿 + 5 对翼时 **draw call ≤ 30、三角面 ≤ 12k、帧时间 ≤ 16.6 ms**；连续换装 10 次无帧时间尖刺（说明没在每次重建几何）。

---

## 10. 与 `PartArt` / `PlacedPart` 的对接

| 字段 | 谁用 | 约定 |
|---|---|---|
| `PartArt.geometry` | 几何工厂 | 等于 `parts.ts` 的 id（如 `legs.spring`），24 个 key 见 §3 |
| `PartArt.material` | 材质工厂 | 只能是 `skin/metal/feather/bone`，映射见 §5.1 |
| `PartArt.anchor` | `layoutParts` | 决定用哪一组 §4.2 公式；等于 `slot` |
| `PartArt.offset` | `layoutParts` | 在零件局部系里，乘 `baseScale` 后加到锚点 |
| `PartArt.rotation` | `layoutParts` | **度**，与 base 角逐分量相加 |
| `PartArt.scale` | `layoutParts` | 乘到 `baseScale` 上 |
| `PartArt.mirrored` | 预留 | M0 全 false；左右由 `i` 奇偶决定 |
| `PlacedPart.position` | 渲染 | 世界坐标（相对 rig 原点） |
| `PlacedPart.rotation` | 渲染 | **度**（与 PartArt 一致），渲染层转弧度 |
| `PlacedPart.scale` | 渲染 | 均匀缩放，不写进矩阵的负号 |
| `PlacedPart.instanceKey` | 批处理 | `` `${geometry}\|${material}\|${R或L}` `` |

**渲染层唯一要做的换算**：`matrix.compose(position, quatFromEulerDeg(rotation), scale)`。
除此之外不再做任何布局计算——这是 `DESIGN.md` §2.5 "渲染层不做布局"的落点。
