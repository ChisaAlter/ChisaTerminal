import { PtySession } from './PtySession.js'

export class PtyManager {
  private sessions: Map<string, PtySession> = new Map()

  createSession(
    id: string,
    cwd: string | undefined,
    onData: (data: string) => void,
    onExit: (exitCode: number) => void
  ): PtySession {
    const existing = this.sessions.get(id)
    if (existing) {
      existing.dispose()
      this.sessions.delete(id)
    }

    const session = new PtySession(id, cwd, onData, (exitCode) => {
      onExit(exitCode)
      this.sessions.delete(id)
    })

    this.sessions.set(id, session)
    return session
  }

  getSession(id: string): PtySession | undefined {
    return this.sessions.get(id)
  }

  write(id: string, data: string): void {
    const session = this.sessions.get(id)
    if (session) {
      session.write(data)
    }
  }

  resize(id: string, cols: number, rows: number): void {
    const session = this.sessions.get(id)
    if (session) {
      session.resize(cols, rows)
    }
  }

  closeSession(id: string): void {
    const session = this.sessions.get(id)
    if (session) {
      session.dispose()
      this.sessions.delete(id)
    }
  }

  closeAll(): void {
    for (const session of this.sessions.values()) {
      session.dispose()
    }
    this.sessions.clear()
  }

  getSessionCount(): number {
    return this.sessions.size
  }
}
