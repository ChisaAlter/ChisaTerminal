# ChisaTerminal 全面优化修改计划

> **For agentic workers:** 推荐按 Phase 顺序执行；每个 Phase 可独立交付并通过验收。实现时可用 subagent-driven-development 或 executing-plans，任务以 checkbox 跟踪。

**Goal:** 将 ChisaTerminal 从「可用的强原型」提升为「可安心自用、可开源分发」的 Electron 终端：修安全与正确性缺陷、硬化工程门禁、清理仓库债务，并为 Agent 能力与跨平台打下基础。

**Architecture:** 保持现有 main / preload / renderer 三分层；优先收紧 IPC 与 Electron 安全基线，再统一命名与打包，最后扩展 Agent UI 与测试深度。不大规模重写业务逻辑。

**Tech Stack:** Electron（升级目标 LTS/受支持主线）· React 19 · Zustand · xterm · node-pty · Vite · Vitest · electron-builder · GitHub Actions（新增）

**依据:** 2026-07-13 全方面审查（73 tests 通过、tsc 通过；Electron 30 EOL、PTY 无所有权校验、browser 宽度持久化失效、1.8GB 产物堆积、无 README/CI 等）

**预估总工期:** 约 8–15 个有效人日（视 Electron 升级回归难度浮动）

---

## 0. 范围与非目标

### 范围内

| 域 | 内容 |
|----|------|
| 安全 | Electron 升级、sandbox、PTY 所有权、Hook token 收紧、打包依赖面 |
| 正确性 | Browser 宽度持久化、壁纸 URL 注入防护、IPC/storage 一致性 |
| 工程 | Git 初提交、.gitignore、CI、ESLint、README/LICENSE、构建脚本可移植 |
| 架构债 | Mux0→Chisa 命名迁移计划、preload 复用 constants、空 Agent 目录决策 |
| 质量 | 安全路径单测、E2E 加深、coverage 门禁（可选） |
| 产品 | Agent 状态 UI 最小闭环、跨平台 Hook 策略文档化 |

### 非目标（本计划不做）

- 完整 AI Agent 编排 / LLM 接入
- 一等公民 SSH 会话管理器（可留作后续里程碑）
- macOS 完整打包签名与公证（仅预留配置）
- UI 视觉大改版
- 迁移到 Tauri / 其他框架

### 成功标准（项目级）

1. `npm test` 全绿；主进程 + 渲染进程 `tsc --noEmit` 通过
2. Electron 升到受支持版本，核心路径（开终端、分屏、侧栏、壁纸、Hook）手工/E2E 可验收
3. PTY write/resize/close 无所有权时被拒绝；有对应单测
4. Browser 侧栏宽度重启后保持
5. 仓库：有 README、LICENSE、首次 commit；构建产物不进版本库；CI 在 PR 上跑 test+typecheck
6. 安装包不再整包无差别 `node_modules/**/*`（或等价生产依赖过滤）

---

## 1. 文件与责任地图

| 路径 | 责任 | 相关 Phase |
|------|------|------------|
| `package.json` | 脚本、依赖版本、engines | 0,1,3,4 |
| `electron-builder.yml` | 打包文件集、asarUnpack、输出目录 | 1,3 |
| `.gitignore` | 产物/缓存忽略 | 0 |
| `README.md` / `LICENSE` | 文档与协议 | 0 |
| `src/main/window.ts` | sandbox、CSP、webview 挂载 | 1,2 |
| `src/main/pty-ipc.ts` | PTY 所有权校验 | 2 |
| `src/main/ipc.ts` | storage 白名单、wallpaper 协议 | 2 |
| `src/main/hooks/HookServer.ts` | token/ACL  hardening | 2 |
| `src/main/pty/PtySession.ts` | env token 暴露策略 | 2 |
| `src/preload/index.ts` | API 面、通道常量复用 | 2,4 |
| `src/shared/constants.ts` | IPC 通道、storage keys | 2,4 |
| `src/renderer/stores/useBrowserStore.ts` | 宽度 key 与 settings 对齐 | 2 |
| `src/renderer/App.tsx` | 壁纸 CSS 安全 | 2 |
| `src/renderer/components/Agent/*` | Agent 状态 UI（或删除） | 5 |
| `test/unit/*` | 安全与回归单测 | 2,3 |
| `test/e2e/*` | 冒烟加深 | 3,5 |
| `.github/workflows/ci.yml` | CI | 3 |
| `eslint.config.js` | 静态检查 | 3 |
| `docs/superpowers/plans/*` | 本计划与执行记录 | — |

---

## 2. 依赖关系总览

```text
Phase 0 仓库卫生 ──┐
                   ├──► Phase 3 工程门禁（CI/Lint）
Phase 1 Electron升级 ──┤
                   │
Phase 2 安全+正确性 ───┼──► Phase 4 命名与打包精简 ──► Phase 5 产品深化
                   │
                   └──► （2 可与 1 并行，但 1 合并后需重跑 2 回归）
```

**推荐执行顺序:** 0 → 2（小修）→ 1（大升级）→ 3 → 4 → 5  
**理由:** 先修确定 bug 与仓库状态，再扛 Electron 大版本回归；CI 在升级后锁定基线。

---

## Phase 0 — 仓库卫生与基线冻结（0.5–1 天）

**目标:** 可追踪、可协作、磁盘干净；不改产品行为。

### Task 0.1: 收紧 `.gitignore` ✅

**Files:**
- Modify: `.gitignore`

- [x] **Step 1:** 扩展忽略规则，至少覆盖：

```gitignore
node_modules/
dist/
dist-build/
dist-build-*/
release/
release-*/
release2/
release3/
release4/
e2e-screenshots/
*.log
.DS_Store
Thumbs.db
${env.ELECTRON_CACHE}/
# ad-hoc 调试产物
test-flow-step*.png
test-screenshot-*.png
test-toggle-*.png
verify-sidebar.png
test-pixelate-*.cdp.mjs
# 本地评测/缓存
codex-candy-eval/**/run_*/
```

- [x] **Step 2:** 本地确认未跟踪的巨大目录不再误 `git add`（`git status` 干净于产物）

### Task 0.2: 清理磁盘产物（本地操作，不提交） ✅

- [x] 删除或移出工作区：`dist-build*`、`release*`、异常目录 ``${env.ELECTRON_CACHE}``
- [x] 保留单一输出目录策略：仅 `dist/`（编译）+ `dist-build/`（安装包），写入 README

**验收:** 工作区源码 + lockfile + 测试；无 GB 级构建目录被跟踪。

### Task 0.3: README + LICENSE ✅

**Files:**
- Create: `README.md`
- Create: `LICENSE`（MIT，与 `package.json` 一致）

- [x] README 最少章节（已覆盖简介/环境/命令/安全/结构）
- [ ] `package.json` 补 `author` 或 `repository` 字段（若有）— 留待 Phase 4.4

### Task 0.4: 首次 Git 基线提交 ✅

- [x] 确认无密钥/大文件
- [x] 初始 commit: `8c57a7d`（含 Phase 0 + Phase 2 修复）

**Phase 0 验收:**
- `git log -1` 有提交 ✅
- README/LICENSE 存在 ✅
- `npm test` 86 passed ✅

---

## Phase 1 — Electron 升级与运行时硬化（2–4 天）

**目标:** 离开 EOL Electron；尽量开启 sandbox；回归核心路径。

### Task 1.1: 选定目标版本并升级

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] 目标：**Electron 33+ 受支持线**（升级日查官方 release/support；若 34/35 LTS 可用则优先 LTS）
- [ ] 同步评估：`electron-builder` 大版本兼容（可能需 25+）
- [ ] `node-pty`、`@xterm/*` 与新 Electron ABI 兼容性检查
- [ ] 命令：

```bash
npm install electron@<target> --save-dev
npm run build
npm test
```

### Task 1.2: 主窗口 sandbox

**Files:**
- Modify: `src/main/window.ts`（`webPreferences.sandbox`）
- Modify: `src/preload/index.ts`（若 sandbox 下 API 行为变化）

- [ ] 将 `sandbox: false` 改为 `sandbox: true`
- [ ] 验证 preload 路径与 `contextBridge` 仍可用
- [ ] 若 `node-pty` 仅在主进程则通常无冲突；失败则记录阻塞原因并保持 false + 文档说明

### Task 1.3: 开发/生产路径回归清单（手工 + e2e）

| # | 场景 | 期望 |
|---|------|------|
| 1 | `npm run dev` 启动 | 窗口出现，无白屏 |
| 2 | 新建 tab / 关闭 tab | PTY 创建与销毁 |
| 3 | 垂直/水平分屏 | 双终端可用 |
| 4 | 终端输出/输入中文 | 正常 |
| 5 | Ctrl+Shift+P 命令面板 | 打开 |
| 6 | 设置改字体/主题 | 即时生效且持久化 |
| 7 | 壁纸开/关/像素化 | 不遮挡内容 |
| 8 | 侧栏打开 http URL | webview 加载；file:// 被拒 |
| 9 | PowerShell Hook | idle/finished 状态更新（Windows） |
| 10 | `npm run dist:win` | 可安装/可运行 |

- [ ] 跑 `npm run test:e2e` 与 `npm run test:ai-smoke`（需先 build）
- [ ] 记录 Electron 变更导致的 API 弃用（如 session/protocol 差异）并修

### Task 1.4: 全局 CSP / webview 再确认

**Files:**
- Review: `src/main/window.ts` CSP 与 `will-attach-webview`
- Review: `BrowserSidecar.tsx` 属性（`nodeintegration={false}` 等）

- [ ] prod CSP 仍无 `unsafe-eval`
- [ ] 新 Electron 下 `webviewTag` 是否仍推荐；若弃用则记入 Phase 5 迁移项（`<webview>` → `WebContentsView`）不阻塞本 Phase

**Phase 1 验收:**
- 依赖不再是 Electron 30
- 回归清单 1–10 通过（或明确 ticket）
- 测试全绿

---

## Phase 2 — 安全与正确性修复（1.5–2.5 天）

**目标:** 修审查中的确定缺陷；补硬测。优先于功能开发。

### Task 2.1: Browser 侧栏宽度持久化（确认 bug） ✅

**根因:** `useBrowserStore` 使用 `mux0.browserWidth.v1`，主进程 `ALLOWED_KEYS` 仅允许 settings/workspaces。

**采纳: 方案 A** — 宽度并入 `AppSettings.browserSidecarWidth`。

- [x] 实现宽度变更 → `updateSetting('browserSidecarWidth', w)`（300ms debounce）
- [x] 初始化从 settings 读取（loadSettings 同步到 browser store）
- [x] 单测：`browser-width.test.ts` clamp 280–900 / non-finite
- [ ] 手工：拖拽宽度 → 重启 → 宽度保持（待用户验收）

### Task 2.2: PTY IPC 所有权校验 ✅

**Files:**
- Create: `src/main/pty/ptyOwnership.ts`
- Modify: `src/main/pty-ipc.ts`
- Create: `test/unit/pty-ipc-ownership.test.ts`

- [x] `PTY.WRITE` / `RESIZE` / `CLOSE` 增加所有权检查
- [x] 修正 `findWebContentsForTerminal` 使用 `webContents.fromId`（原先误用 `BrowserWindow.fromId`）
- [x] 单测 7 条覆盖 track/untrack/clear

### Task 2.3: 壁纸 URL 渲染安全 ✅

- [x] `toSafeWallpaperCssUrl` 仅允许 `chisa-wallpaper:`
- [x] App 使用安全 CSS 值
- [x] 单测拒绝 http/file/注入字符

### Task 2.4: Hook token 暴露面收紧（增量）

**Files:**
- Modify: `src/main/pty/PtySession.ts`
- Modify: `hooks/powershell-hook.ps1`（若改 env 名需同步 hash）
- Modify: `src/main/pty/hookProfileIntegrity.ts` — 更新 `EXPECTED_HOOK_PROFILE_SHA256`
- Test: `test/unit/hook-profile-integrity.test.ts`、`HookServer.test.ts`

**策略（选一，默认 A）:**

| 方案 | 做法 | 代价 |
|------|------|------|
| A 文档+保持 | 文档标明 token 在会话 env 内；依赖 pipe+token 双因子 | 低 |
| B 降低寿命 | 每条 hook 消息后轮换 token（复杂，PS 侧难） | 高 |
| C 子进程专用 | 仅 hook profile 读 token，清理子进程 env | 中 |

- [ ] Phase 2 默认 **A + 注释/README 安全模型**；可选 C 若工期允许
- [ ] 若改 ps1：重算 SHA256 并更新常量与测试

### Task 2.5: Windows Named Pipe 说明/ACL（可选加固）

- [ ] 调研 Node `net.Server` listen named pipe 是否可设 security descriptor
- [ ] 若不可行：在 README 安全节说明「同用户进程可连 pipe，靠 token」

### Task 2.6: Storage 白名单与调用方一致性审计

**Files:**
- Grep 全库 `storage.set` / `storage.get` / `DEFAULT_*_KEY`
- Modify: 任何未在 `ALLOWED_KEYS` 的 key（Task 2.1 消除 browserWidth）

- [ ] 审计清单写入 PR 描述；保证无静默失败路径

**Phase 2 验收:**
- 新单测通过；原 73 测试不回归
- 宽度持久化手工通过
- 非 owner PTY 操作无效

---

## Phase 3 — 工程门禁（1–1.5 天）

**目标:** 自动化防止回退。

### Task 3.1: Typecheck 脚本

**Files:**
- Modify: `package.json` scripts

```json
{
  "scripts": {
    "typecheck": "tsc -p tsconfig.main.json --noEmit && tsc -p tsconfig.preload.json --noEmit && tsc -p tsconfig.json --noEmit",
    "test:ci": "npm run typecheck && npm run test"
  }
}
```

- [ ] 本地 `npm run test:ci` 通过

### Task 3.2: ESLint 基线

**Files:**
- Create: `eslint.config.js`（flat config）
- Modify: `package.json` devDependencies + `"lint": "eslint src test"`

- [ ] 规则：推荐 `@typescript-eslint` recommended；初期 **warn 为主**，不阻塞历史债
- [ ] 安全相关：禁止渲染进程 `eval`、警惕 `innerHTML`（若适用）
- [ ] `npm run lint` 可退出 0 或仅允许既有 warn

### Task 3.3: GitHub Actions CI

**Files:**
- Create: `.github/workflows/ci.yml`

```yaml
# 大纲
name: ci
on: [push, pull_request]
jobs:
  test:
    runs-on: windows-latest  # node-pty / 路径与主目标平台一致
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '22', cache: 'npm' }
      - run: npm ci
      - run: npm run test:ci
```

- [ ] 推送后 Actions 绿（需 remote）
- [ ] 文档：README 徽章可选

### Task 3.4: 可移植构建脚本

**Files:**
- Modify: `package.json` — `build:preload`、`dist:win:en`

- [ ] `build:preload` 改为 node 脚本（`scripts/build-preload.mjs`），去掉硬编码 PowerShell
- [ ] 删除或改写 `dist:win:en` 中 `c:/Ai/mux0_link` 硬路径；改为可选 env `ELECTRON_BUILD_WORKDIR`

### Task 3.5: 测试文档同步

**Files:**
- Modify: `TESTING.md` — 增加 `test:ci`、所有权测试、CI 说明

**Phase 3 验收:**
- `npm run test:ci` 本地通过
- CI workflow 文件齐全
- 无 Windows 专用不可移植脚本阻塞 Linux CI（若改 `ubuntu-latest` 需确认；默认 windows-latest）

---

## Phase 4 — 命名统一与打包精简（1–2 天）

**目标:** 降低心智负担；减小安装包与攻击面。

### Task 4.1: 命名迁移策略（兼容优先）

**原则:** 用户可见名 **ChisaTerminal**；内部 ID 分两步走。

| 类别 | 现状 | 目标 | 策略 |
|------|------|------|------|
| 产品名/窗口标题 | ChisaTerminal | 保持 | — |
| 存储 key | `mux0.settings.v1` 等 | `chisa.*` 或保持 | **读新旧双 key，写新 key**（迁移一次） |
| 环境变量 | `MUX0_*` | `CHISA_*` | 双读：`CHISA_HOOK_PIPE \|\| MUX0_HOOK_PIPE` |
| Pipe 名 | `mux0-hook-<pid>` | `chisa-hook-<pid>` | 可直接改（无跨版本 pipe 兼容需求） |
| dev flag | `MUX0_DEV` | `CHISA_DEV` | 双读 |

**Files:**
- Modify: `src/shared/constants.ts`
- Modify: `src/main/hooks/HookServer.ts`
- Modify: `src/main/pty/PtySession.ts`
- Modify: `hooks/powershell-hook.ps1` + hash
- Modify: `src/main/window.ts`、`useSettingsStore` 等

- [ ] 实现设置/工作区加载：`chisa.settings.v1` 优先，回退 `mux0.settings.v1`
- [ ] 保存只写新 key
- [ ] 文档「从 mux0 迁移」一小节

### Task 4.2: Preload 复用 IPC_CHANNELS

**Files:**
- Modify: `src/preload/index.ts` — import from `../shared/constants.js`（注意 preload 打包/tsc 路径）
- Verify: `tsconfig.preload.json` include shared

- [ ] 删除硬编码 `CH` 对象，避免通道漂移
- [ ] 构建后运行 app 冒烟

### Task 4.3: electron-builder 文件集

**Files:**
- Modify: `electron-builder.yml`

**目标配置方向:**

```yaml
files:
  - dist/**/*
  - hooks/**/*
  - package.json
  # 不要 node_modules/**/*
  # 依赖 electron-builder 依赖收集；必要时:
  # asarUnpack: [ "**/node-pty/**/*", "hooks/**/*" ]
asarUnpack:
  - hooks/**/*
  - "**/node-pty/**/*"
```

- [ ] `npm run pack` 后检查 `win-unpacked` 体积 vs 旧版
- [ ] 确认 node-pty native 可加载
- [ ] 确认 hook ps1 在 asar.unpacked 可读且 hash 仍匹配

### Task 4.4: package 元数据

- [ ] `description`、`author`、`repository`、`bugs` 补全
- [ ] `engines.node` 声明 `>=20`

**Phase 4 验收:**
- 旧配置能迁移加载
- 新包体积明显下降（记录前后 MB）
- 安装版核心功能可用

---

## Phase 5 — 产品与质量深化（2–4 天，可拆分）

**目标:** Agent 闭环与测试深度；不阻塞 P0–P4 发布。

### Task 5.1: Agent 组件决策

**二选一（执行前与产品确认）:**

| 选项 | 内容 |
|------|------|
| **A 最小 UI** | `components/Agent/AgentStatusBar.tsx` 展示 focused terminal 的 status/command/cwd |
| **B 删除空壳** | 删除空 `Agent/`；Agent store 保留给未来 |

**若选 A：**

- [ ] 在 `App.tsx` 底栏或 Sidebar 接入 `useAgentStore`
- [ ] i18n 键：就绪/运行中/等待输入/错误
- [ ] `test:ai-smoke` 断言真实 DOM（非仅截图）

### Task 5.2: 跨平台 Hook 策略

**Files:**
- Create: `docs/platform-hooks.md` 或 README 章节

- [ ] 明确：v1 Windows PowerShell first
- [ ] 预留：bash/zsh 用 DEBUG trap 或 prompt 命令的设计草案（不强制实现）
- [ ] 非 Windows 上隐藏无效 Agent 状态或显示「Hook 不可用」

### Task 5.3: E2E 加深

**Files:**
- Modify: `test/e2e/run-e2e.ts` 或拆 `test/e2e/scenarios/*.ts`
- Modify: `test/e2e/cdp-driver.ts`

最低新增场景：

1. 新建 tab 后 DOM 存在多个终端容器
2. 打开设置再关闭
3. 命令面板开关
4. （可选）搜索框打开

- [ ] Windows CI 可选 `workflow_dispatch` 跑 e2e（耗时，可不默认）

### Task 5.4: 覆盖率门禁（可选）

- [ ] `vitest` coverage thresholds：关键文件 `pty-ipc`、`HookServer`、`normalizeBrowserUrl` 行覆盖 ≥ 70%

### Task 5.5: 安全工具扫描（可选）

- [ ] 引入 `npm audit` 到 CI（allowlist 可控）
- [ ] 评估 Electronegativity 或类似 Electron 审计工具一次，结果归档 `docs/security-audit-YYYY-MM-DD.md`

### Task 5.6: 自动更新（可选，分发时）

- [ ] 若公开发布：评估 `electron-updater` + 签名；本 Phase 仅设计 ADR，不强制编码

**Phase 5 验收:**
- Agent 决策落地（有 UI 或已删除空目录）
- E2E 场景 ≥ 3 条稳定
- 文档反映 Windows-first

---

## 3. 任务优先级速查表

| ID | 任务 | 优先级 | 预估 | 依赖 |
|----|------|--------|------|------|
| 0.1–0.4 | 仓库卫生/README/commit | P0 | 0.5d | — |
| 2.1 | Browser 宽度 bug | P0 | 0.25d | — |
| 2.2 | PTY 所有权 | P0 | 0.5d | — |
| 2.3 | 壁纸 URL 安全 | P0 | 0.25d | — |
| 1.1–1.4 | Electron 升级+sandbox | P0 | 2–4d | 0 建议先完成 |
| 2.4–2.6 | Hook/审计 | P1 | 0.5d | 2.2 |
| 3.1–3.5 | CI/Lint/脚本 | P1 | 1d | 1 或 2 |
| 4.1–4.4 | 命名+打包 | P1 | 1–2d | 1,2 |
| 5.* | Agent/E2E/审计 | P2 | 2–4d | 3,4 |

---

## 4. 风险与缓解

| 风险 | 影响 | 缓解 |
|------|------|------|
| Electron 跨大版本破坏 node-pty / webview | 阻塞升级 | 分小步升版本；保留可回退 tag；pack 冒烟 |
| sandbox:true 导致 preload 失败 | 开发中断 | 特性开关 `CHISA_SANDBOX=0` 临时回退 |
| 存储 key 迁移丢配置 | 用户设置丢失 | 双读旧 key；迁移后写新 key；测试 fixture |
| Hook ps1 hash 忘记更新 | Hook 静默禁用 | 改 ps1 的 CI 检查 hash 匹配 |
| windows-only CI 成本 | 队列慢 | typecheck+unit 可先跑；e2e 手动 |
| 打包漏 native 模块 | 安装包不能开终端 | pack 后自动化启动 + session count 探测 |

---

## 5. 每 Phase 交付物清单

| Phase | 代码 | 文档 | 验证 |
|-------|------|------|------|
| 0 | .gitignore | README, LICENSE | git status, npm test |
| 1 | package.json, window.ts | 升级笔记（可选） | 回归表 1–10, e2e |
| 2 | pty-ipc, settings, App, tests | README 安全段 | 新单测 + 手工宽度 |
| 3 | eslint, ci.yml, scripts | TESTING.md | test:ci |
| 4 | constants, builder, preload | 迁移说明 | 包体积对比 |
| 5 | Agent UI 或删除 | platform-hooks | e2e 场景 |

---

## 6. 建议 Git 提交节奏（示例）

```text
chore: tighten gitignore and add README/LICENSE
fix: persist browser sidecar width via settings
fix(security): enforce PTY session ownership on IPC
fix(security): validate wallpaper URL before CSS use
chore(deps): upgrade electron to <ver>
fix(security): enable BrowserWindow sandbox
ci: add typecheck, eslint, and GitHub Actions
refactor: dual-read chisa/mux0 storage keys
build: slim electron-builder file set for node-pty
feat(ui): agent status bar for focused terminal
test(e2e): cover palette and settings smoke
```

---

## 7. 执行方式建议

1. **按 Phase 开 PR/分支**（`optimize/phase-0-hygiene` …），避免巨型 PR。  
2. 每个 Phase 结束跑：`npm run test:ci` + 相关手工清单。  
3. Phase 1（Electron）单独留出回归缓冲，不要与 UI 大改混提交。  
4. Phase 5 可与对外 1.1.0 发布解耦：P0–P4 即可打「安全加固版」。

### 版本号建议

| 里程碑 | 版本 | 含义 |
|--------|------|------|
| Phase 0–2 完成 | `1.0.1` | 修复 + 安全小版本 |
| Phase 1+3 完成 | `1.1.0` | 运行时升级 + CI |
| Phase 4 完成 | `1.2.0` | 打包/命名 |
| Phase 5 完成 | `1.3.0` | Agent UI / E2E |

---

## 8. 自检（计划覆盖审查项）

| 审查项 | 对应任务 |
|--------|----------|
| Electron EOL | 1.1 |
| sandbox false | 1.2 |
| PTY 无所有权 | 2.2 |
| browser 宽度失效 | 2.1 |
| 壁纸 CSS | 2.3 |
| Hook token / pipe | 2.4–2.5 |
| 整包 node_modules | 4.3 |
| Mux0 命名 | 4.1 |
| preload 硬编码通道 | 4.2 |
| 无 README/LICENSE/commit | 0.3–0.4 |
| 1.8GB 产物 | 0.1–0.2 |
| 无 CI/Lint | 3.* |
| 空 Agent 目录 | 5.1 |
| 测试深度 | 2.x tests, 5.3–5.4 |
| dist:win:en 硬路径 | 3.4 |
| 跨平台 Hook | 5.2 |

**占位符扫描:** 无 TBD 阻塞项；可选任务已标「可选」。

---

## 9. 立即开始的第一刀（Day 1 清单）

若只开一天，建议顺序：

1. Task 0.1–0.2（gitignore + 清产物）  
2. Task 2.1（browser 宽度）+ 测试  
3. Task 2.2（PTY 所有权）+ 测试  
4. Task 0.3 README 草稿  
5. Task 0.4 基线 commit  

当天结束应有：**可复现的修复提交 + 干净仓库**，再进入 Electron 升级。
