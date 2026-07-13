# Mux0 PowerShell hook - 通过 Prompt 函数上报命令完成 + cwd + 退出码到主进程
# 通过环境变量 MUX0_TERMINAL_ID 和 MUX0_HOOK_PIPE 与主进程通信
# 设计取舍：不拦截 PSReadLine 的 Enter 键（避免破坏 Tab 补全），
#           只通过 Prompt 函数在每次提示符前上报，无法捕获"命令开始"事件

# 缓存 pipe 名（去除 \\.\pipe\ 前缀用于 NamedPipeClientStream 构造）
function Get-Mux0PipeName {
    if ($env:MUX0_HOOK_PIPE -match '^\\\\\.\\pipe\\(.+)$') {
        return $Matches[1]
    }
    return $env:MUX0_HOOK_PIPE
}

function Send-Mux0Hook {
    param(
        [string]$Event,
        [string]$Command = '',
        [int]$ExitCode = 0,
        [string]$Cwd = ''
    )
    if (-not $env:MUX0_HOOK_PIPE -or -not $env:MUX0_TERMINAL_ID) { return }

    $payload = @{
        terminalId = $env:MUX0_TERMINAL_ID
        event      = $Event
        agent      = 'powershell'
        at         = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
        command    = $Command
        exitCode   = $ExitCode
        cwd        = $Cwd
        token      = $env:MUX0_HOOK_TOKEN
    }
    try {
        $line = $payload | ConvertTo-Json -Compress -Depth 3
        $pipeName = Get-Mux0PipeName
        $pipe = New-Object System.IO.Pipes.NamedPipeClientStream(
            '.', $pipeName, [System.IO.Pipes.PipeDirection]::Out, [System.IO.Pipes.PipeOptions]::None
        )
        $pipe.Connect(200)
        $writer = New-Object System.IO.StreamWriter($pipe)
        $writer.WriteLine($line)
        $writer.Flush()
        $writer.Dispose()
        $pipe.Dispose()
    } catch {
        # 静默失败：hook 不能影响终端正常工作
    }
}

# 保存原始 Prompt
$originalPromptDef = (Get-Item Function:\Prompt -ErrorAction SilentlyContinue).Definition
if (-not $originalPromptDef) {
    $originalPromptDef = 'PS $($executionContext.SessionState.Path.CurrentLocation)$(''>' * ($nestedPromptLevel + 1)) '
}

# 状态变量：跟踪上次 Prompt 时是否处于"命令运行中"
$script:Mux0LastCommandRunning = $false
$script:Mux0LastCommandStart = [DateTime]::UtcNow

# 替换 Prompt：每次提示符前上报
function global:Prompt {
    try {
        $cwd = $executionContext.SessionState.Path.CurrentLocation.Path
        $exitCode = if ($LASTEXITCODE -ne $null) { $LASTEXITCODE } else { 0 }

        if ($script:Mux0LastCommandRunning) {
            # 命令刚结束
            $event = if ($exitCode -ne 0) { 'error' } else { 'finished' }
            Send-Mux0Hook -Event $event -ExitCode $exitCode -Cwd $cwd
            $script:Mux0LastCommandRunning = $false
        } else {
            # 无命令运行的提示符（首次启动 / cd 等）
            Send-Mux0Hook -Event 'idle' -Cwd $cwd
        }
    } catch {
        # hook 失败不影响 Prompt
    }

    # 调用原始 Prompt
    & ([scriptblock]::Create($originalPromptDef))
}

# 监听 Invoke-History 事件（PowerShell 5.1+ 在命令开始时触发）
# 这是更稳定的"命令开始"事件源，不影响 Tab 补全
try {
    # Get-EventSubscriber / Register-EngineEvent 在 PowerShell 5.1+ 可用
    # PowerShell 7+ 有 OnIdle / OnScriptBlockInvoke 等事件，但没有 PreCommand
    # 用 PowerShell 历史记录的 Invoke-History 后置钩子（PowerShell 7+ 的 PSReadLine 支持）
    if (Get-Module -ListAvailable -Name PSReadLine) {
        Import-Module PSReadLine -ErrorAction SilentlyContinue
        # Set-PSReadLineOption -EditMode Windows / Emacs / Vi
        # 用 AddToHistoryHandler 不行，需要在命令执行前钩子
        # 实际上 PSReadLine 没有可靠的 BeforeCommand 事件
        # 折中：在 AcceptLine 中标记"命令开始"，但不替换其行为
        $null = Set-PSReadLineKeyHandler -Chord Enter -ScriptBlock {
            $line = $null
            $cursor = 0
            [Microsoft.PowerShell.PSConsoleReadLine]::GetBufferState([ref]$line, [ref]$cursor)
            if (-not [string]::IsNullOrWhiteSpace($line)) {
                $script:Mux0LastCommandRunning = $true
                Send-Mux0Hook -Event 'running' -Command $line.Trim()
            }
            [Microsoft.PowerShell.PSConsoleReadLine]::AcceptLine()
        }.GetNewClosure() -ErrorAction SilentlyContinue
    }
} catch {
    # 拦截失败不影响 Prompt 路径
}

# 初始化上报
Send-Mux0Hook -Event 'idle' -Cwd (Get-Location).Path
