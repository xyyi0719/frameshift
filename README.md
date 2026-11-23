# 拼装小鸡 · Build-a-Chick

> 一只什么都没有的小鸡，靠你给它装上的零件去打架。

**M0 网页预览**：装配 + 一场自动战斗 + 性能面板。
在线试玩：https://8-138-133-118.sslip.io:8444/chick/

## 运行 / Run

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # 类型检查 + 构建到 dist/
npm test           # 核心逻辑单测
npm run typecheck  # 只做类型检查
```

## 当前能做什么（M0）

- **装配**：左侧 24 个零件按 6 个槽位分组，点击装入；也可把卡片拖到鸡身周围的槽位环上。
  一个槽位可以装任意多个（试试 10 条腿、5 对翅膀）。
- **战斗**：点「开打」自动对战铁皮小兵，30Hz 确定性模拟，结果可回放。
- **性能面板**：FPS / draw calls / 三角面 / 零件数，外带 `+10 条腿`、`+5 对翅膀` 压力按钮。

## 目录

```
src/core/     纯逻辑：挂点求解 layoutParts、属性推导、战斗模拟 simulate
src/data/     24 个零件配置表
src/render3d/ Three.js 场景、程序化几何、材质、装配动画
src/ui/       侧栏、槽位环、HUD、性能面板、战斗界面
tests/        核心逻辑单测
docs/         设计文档、接口定义、3D 规格
```

## 文档

- [docs/DESIGN.md](docs/DESIGN.md)：玩法、装配、战斗、PvP、平台与架构
- [docs/INTERFACES.md](docs/INTERFACES.md)：配置表、运行时类型、战斗协议、平台适配层
- [docs/RIG3D.md](docs/RIG3D.md)：3D 造型、材质、动画与性能预算
