# FRAMESHIFT

> 每个生物都是一句话，而你只能挪动空格。
> Every organism is a sentence. You may only move the spaces.

GitHub Game Off 2026 · 主题 **SHIFT** · 一个关于「读框」的基因编辑解谜游戏。

## 运行 / Run

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # 类型检查 + 静态构建到 dist/
npm run preview    # 预览 dist/
npm test           # 核心规则单元测试
npx tsc --noEmit   # 只做类型检查
```

## 操作 / Controls

- 鼠标：`INSERT` 模式下点击碱基之间的缝隙插入；`DELETE` 模式点击碱基删除。
- 键盘：`←/→` 移动光标，`I` / `D` / `R` 切换插入/删除/替换，`1–4` 或 `A U G C` 落字母。
- `Backspace` 删除光标处碱基；`Ctrl+Z` 免费撤销；`Enter` 起跑；`Esc` 关闭弹层。
- 编辑额度有限，但撤销不限次数；非法基因可以随时改回来。
- 语言：点右上角 `EN | 中文` 实时切换，不丢当前编辑与标本罐，并会记住选择。
- 默认跟随浏览器语言：`zh*` → 中文，否则英文。

## 玩法 / How to play

- 每三个碱基读成一个密码子，长成一个身体零件：腿、翼、甲、鳃、发光器……
- 第一关 *One Base Short*：七条鳃、没有腿，补回一个缺失的碱基，让生物走过裂口。
- 第二关 *The Long Way Down*：甲太厚飞不起来，删掉一个碱基，让整条下游重新断句。
- 点击 `RUN` 让生物跑过闸门；每个闸门只检查表型，不检查序列写法。通关后标本入罐。

## 为什么是 SHIFT / Why SHIFT

一句话几乎没变，变的是「从哪儿开始三个一组」。插入或删除一个碱基，
读框整体平移一格，下游所有词被重新断句，生物当场变成另一个东西。
移码在生物学里就叫 frameshift mutation；在屏幕上是整条带子滑一格、零件逐个翻面。
这正是「挪一个空格，整句话意思全变」的同一个笑话。

## 目录 / Structure

```
src/core/   生物学规则：解码、表型、编辑、差异、判定、Session（A）
src/data/   16 个零件定义与文案
src/levels/ 两关的纯数据
src/ui/     呈现层：基因带、生物、跑道、HUD、图例、音效（B）
src/main.ts 应用入口 · src/styles.css 主题与布局
tests/      核心规则单元测试
```

**core 负责生物学与判定，ui 只负责把状态画出来。** 没有外部图片/字体/音频，
所有生物、字母和音效都是程序化生成的。规则细节见 `docs/SPEC.md`。

## 自动部署 / Deploy

推送到 `main` 即由 GitHub Actions 构建、跑单测、再把 `dist/` 同步到阿里云：

- 线上试玩：**https://8-138-133-118.sslip.io:8444/frameshift/**
- 流水线：`.github/workflows/deploy.yml`（构建 → `npm test` → rsync → 冒烟测试）
- 服务器：静态目录 `/var/www/frameshift/`，nginx 挂在 `/frameshift/` 子路径，由独立的 `deploy` 用户用密钥写入

## 参赛 / Game Off

本作是 **GitHub Game Off 2026** 的参赛作品，主题为 **SHIFT**。

> 更多评测说明、制作笔记与更新日志将在此补充。
