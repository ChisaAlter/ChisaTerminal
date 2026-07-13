# ChisaTerminal

现代化 Electron 终端模拟器：多工作区、标签、分屏、内嵌浏览器侧栏，以及 Windows PowerShell Hook（命令/cwd 状态上报）。

## 功能

- **终端**：xterm.js + node-pty，标签与垂直/水平分屏
- **工作区**：多工作区布局持久化（cwd 恢复）
- **浏览器侧栏**：按终端打开 http(s) 页面（沙箱 webview）
- **主题 / 壁纸 / 字体**：设置持久化到 `electron-store`
- **命令面板与快捷操作**：可注入带 `{cwd}` 占位符的命令
- **PowerShell Hook**（Windows）：通过 Named Pipe + 会话 token 上报 idle/running/finished
- **国际化**：简体中文 / English

## 环境要求

- Node.js **≥ 20**（推荐 22+）
- Windows 为主目标平台（Hook 仅 Windows PowerShell 完整支持）
- 构建安装包需要可用的 Visual C++ 构建工具（`node-pty` 原生模块）

## 开发

```bash
npm install
npm run dev
```

分进程开发：

```bash
npm run dev:renderer   # Vite
npm run dev:main       # tsc -w 主进程
```

## 构建与打包

```bash
npm run build          # renderer + main + preload
npm run pack           # 未打包目录（electron-builder --dir）
npm run dist:win       # Windows NSIS 安装包 → dist-build/
```

编译输出在 `dist/`；安装包输出在 `dist-build/`（均已 gitignore）。

## 测试

```bash
npm test               # unit + integration（Vitest）
npm run test:unit
npm run test:integration
npm run build && npm run test:e2e
npm run build && npm run test:ai-smoke
```

详见 [TESTING.md](./TESTING.md)。

## 安全模型（摘要）

- 渲染进程：`contextIsolation: true`，`nodeIntegration: false`
- Preload 仅暴露白名单 `electronAPI`
- 存储 key 白名单；壁纸 MIME/大小限制与自定义协议 `chisa-wallpaper://`
- Webview：挂载时强制 sandbox，禁止非 http(s) src
- PTY write/resize/close：校验调用方是否拥有该 `terminalId`
- Hook：会话随机 token + event 白名单；profile 文件 SHA-256 完整性校验

> Hook token 会注入终端环境变量（供 PowerShell profile 使用），同会话内进程可读。详见源码 `HookServer` / `PtySession`。

## 项目结构

```text
src/main/       # Electron 主进程（窗口、PTY、Hook、IPC）
src/preload/    # contextBridge
src/renderer/   # React UI
src/shared/     # 共享类型与常量
hooks/          # PowerShell hook profile
test/           # unit / integration / e2e
```

## 许可证

[MIT](./LICENSE)
