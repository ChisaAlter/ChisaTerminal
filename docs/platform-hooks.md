# Platform Hook Strategy

ChisaTerminal reports shell activity (cwd / command lifecycle) to the main process via a local **HookServer** (Named Pipe on Windows, Unix domain socket elsewhere). The renderer uses these events for Agent status, tab auto-naming, and cwd restore.

## Current support matrix

| Platform | Shell | Hook profile | Status events |
|----------|-------|--------------|---------------|
| **Windows** | PowerShell 5.1 (`System32\WindowsPowerShell\...`) | `hooks/powershell-hook.ps1` (SHA-256 verified) | `idle` / `running` / `finished` / `error` |
| macOS | `$SHELL` or `/bin/bash` | Not shipped | No automatic hook messages |
| Linux | `$SHELL` or `/bin/bash` | Not shipped | No automatic hook messages |

**Product stance (v1.x):** Windows PowerShell is first-class. Non-Windows users get a full terminal; Agent status stays **idle** unless a future hook is installed.

## Security model

1. **Session token** (`CHISA_HOOK_TOKEN` / legacy `MUX0_HOOK_TOKEN`) generated per app start.
2. Token is injected into the PTY environment so only that shell session can authenticate to the pipe.
3. HookServer validates token, `terminalId`, and event enum before forwarding to the renderer.
4. Token is **not** logged or sent to the renderer.
5. Same-user processes that can read the terminal env can still spoof status (see README security section).

## Environment variables

| Variable | Purpose |
|----------|---------|
| `CHISA_HOOK_PIPE` / `MUX0_HOOK_PIPE` | Pipe/socket path |
| `CHISA_HOOK_TOKEN` / `MUX0_HOOK_TOKEN` | Session auth token |
| `CHISA_TERMINAL_ID` / `MUX0_TERMINAL_ID` | Terminal id for messages |

PowerShell profile currently reads the `MUX0_*` names for compatibility; both are set by the main process.

## Future hooks (design sketch, not implemented)

### bash / zsh (prompt-based)

- Ship `hooks/posix-hook.sh` that wraps `PROMPT_COMMAND` / `precmd` to send JSON lines to the socket.
- Optional: trap `DEBUG` for “command start” (noisy; opt-in).
- Integrity: same SHA-256 fail-closed load pattern as PowerShell.

### pwsh 7+ on non-Windows

- Reuse PowerShell profile with socket client instead of NamedPipeClientStream when `CHISA_HOOK_PIPE` is a filesystem path.

## UI behaviour when hooks are unavailable

- Agent status bar remains visible with **idle / Ready**.
- No error dialog on non-Windows (HookServer may still start for future clients).
- Optional future: show `agent.hooks_unavailable` tooltip when platform ≠ win32.

## Testing

- Unit: `test/unit/HookServer.test.ts`, `hook-profile-integrity.test.ts`
- E2E: `data-testid="agent-status-bar"` must be present after launch (status text locale-dependent)
