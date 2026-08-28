# 测试指南

本文档说明如何在 ChisaTerminal 项目中运行各类测试。

## 测试分层

项目将测试分为四层：

- **单元测试（unit）**：针对 `src/` 下的工具函数、store、React 组件，运行在 `jsdom` 环境。
- **集成测试（integration）**：针对 `test/integration/` 下的跨模块或需要真实 Node 环境的测试。
- **端到端测试（e2e）**：启动真实 Electron 应用，通过 Chrome DevTools Protocol（CDP）驱动 UI 并截图。
- **AI 冒烟测试（ai-smoke）**：在 E2E 基础上检查 Agent 状态栏等 AI 相关 UI。

## 前置依赖

- Node.js >= 20（推荐 22+，E2E 依赖原生 `WebSocket`）
- npm
- 运行 E2E 前需要先执行 `npm run build` 构建主进程与渲染进程

## 运行测试

### 单元测试

```bash
npm run test:unit
```

默认匹配 `src/**/*.test.ts`，使用 `jsdom` 环境。

### 集成测试

```bash
npm run test:integration
```

默认匹配 `test/integration/**/*.test.ts`，使用 `node` 环境。当前目录为空时也能空跑成功。

### 端到端测试

```bash
npm run build
npm run test:e2e
```

`test:e2e` 会通过 `tsx` 执行 `test/e2e/run-e2e.ts`，启动 Electron 后：

1. 等待 CDP 服务在 `127.0.0.1:9223` 就绪。
2. 连接到标题为 `ChisaTerminal` 的页面目标。
3. 校验页面标题、TabBar、`[data-testid="agent-status-bar"]`。
4. 新建标签、打开/关闭设置（Ctrl+,）、打开/关闭命令面板（Ctrl+Shift+P）。
5. 截图保存到 `e2e-screenshots/`。

### AI 冒烟测试

```bash
npm run build
npm run test:ai-smoke
```

检查 Agent 状态栏是否包含 `就绪`、`等待输入`、`运行中` 或 `错误` 等状态文本，并保存截图到 `e2e-screenshots/ai-smoke.png`。

### 全部测试

```bash
npm run test
```

依次运行 workspace 中配置的所有项目（unit + integration）。

### CI 门禁（本地等价）

```bash
node scripts/check-hook-profile.mjs   # hook profile SHA-256 完整性
npm run test:ci                       # typecheck + unit/integration
npm run lint                          # ESLint（--max-warnings 0，warning 也会阻塞）
npm run build                         # renderer + main + preload
```

## 测试基础设施

### 临时目录隔离

`test/setup-storage-isolation.ts` 会在每个测试文件运行前：

- 在 `os.tmpdir()` 下创建随机子目录。
- 覆盖 `XDG_CONFIG_HOME`、`LOCALAPPDATA`、`APPDATA` 等环境变量。
- 确保 `electron-store` 的配置文件不会污染开发环境。
- 测试结束后自动清理临时目录。

## 编写新测试

### 单元测试

在 `src/` 下创建 `*.test.ts` 文件，vitest 会自动识别。

### 集成测试

在 `test/integration/` 下创建 `*.test.ts` 文件。集成测试运行在 Node 环境，如需访问 `electron-store`，临时目录隔离已自动生效。

### E2E 测试

复用 `test/e2e/cdp-driver.ts` 中提供的工具函数：

```ts
import {
  launchElectron,
  connectCDP,
  evaluate,
  captureScreenshot,
} from './cdp-driver.js'

const proc = launchElectron({ entry: process.cwd() })
const client = await connectCDP()
await evaluate(client, 'document.title')
await captureScreenshot(client, 'my-test.png')
```
