import { ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { AppConfig } from "./config-service";
import { clampText, normalizeNewlines, stripAnsi } from "../utils/message-utils";

export interface CrushResponse {
  sessionId: string;
  output: string;
  durationMs: number;
  timedOut: boolean;
  exitCode: number | null;
}

interface CrushSession {
  id: string;
  chatId: string;
  process: ChildProcessWithoutNullStreams;
  queue: Promise<void>;
}

export class CrushService {
  private readonly sessions = new Map<string, CrushSession>();
  private readonly config: AppConfig;

  constructor(config: AppConfig) {
    this.config = config;
  }

  async run(chatId: string, input: string): Promise<CrushResponse> {
    const session = this.getOrCreateSession(chatId);
    const task = async (): Promise<CrushResponse> => this.executePrompt(session, input);
    return this.enqueue(session, task);
  }

  resetSession(chatId: string): boolean {
    const session = this.sessions.get(chatId);
    if (!session) {
      return false;
    }

    session.process.kill("SIGTERM");
    this.sessions.delete(chatId);
    return true;
  }

  getSessionCount(): number {
    return this.sessions.size;
  }

  shutdown(): void {
    for (const session of this.sessions.values()) {
      session.process.kill("SIGTERM");
    }
    this.sessions.clear();
  }

  private enqueue<T>(session: CrushSession, task: () => Promise<T>): Promise<T> {
    const result = session.queue.then(task, task);
    session.queue = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  }

  private getOrCreateSession(chatId: string): CrushSession {
    const existing = this.sessions.get(chatId);
    if (existing && !existing.process.killed) {
      return existing;
    }

    const created = this.spawnSession(chatId);
    this.sessions.set(chatId, created);
    return created;
  }

  private spawnSession(chatId: string): CrushSession {
    const child = spawn(this.config.crushCommand, this.config.crushArgs, {
      cwd: this.config.crushCwd,
      env: process.env,
      stdio: "pipe"
    });

    const session: CrushSession = {
      id: `chat-${chatId}`,
      chatId,
      process: child,
      queue: Promise.resolve()
    };

    child.on("exit", () => {
      const current = this.sessions.get(chatId);
      if (current?.id === session.id) {
        this.sessions.delete(chatId);
      }
    });

    return session;
  }

  private async executePrompt(session: CrushSession, input: string): Promise<CrushResponse> {
    const startedAt = Date.now();
    const processRef = session.process;

    if (processRef.killed || processRef.exitCode !== null) {
      this.sessions.delete(session.chatId);
      const replaced = this.getOrCreateSession(session.chatId);
      return this.executePrompt(replaced, input);
    }

    return new Promise<CrushResponse>((resolve, reject) => {
      let output = "";
      let idleTimer: NodeJS.Timeout | undefined;
      let hardTimer: NodeJS.Timeout | undefined;
      let done = false;
      let receivedAnyData = false;

      const cleanup = () => {
        if (idleTimer) {
          clearTimeout(idleTimer);
        }
        if (hardTimer) {
          clearTimeout(hardTimer);
        }
        processRef.stdout.off("data", onStdout);
        processRef.stderr.off("data", onStderr);
        processRef.off("error", onError);
        processRef.off("exit", onExit);
      };

      const complete = (timedOut: boolean) => {
        if (done) {
          return;
        }
        done = true;
        cleanup();
        resolve({
          sessionId: session.id,
          output: clampText(normalizeNewlines(stripAnsi(output.trim())), this.config.maxOutputChars),
          durationMs: Date.now() - startedAt,
          timedOut,
          exitCode: processRef.exitCode
        });
      };

      const onChunk = (chunk: Buffer, isStderr: boolean) => {
        receivedAnyData = true;
        const text = chunk.toString("utf8");
        output += isStderr ? `[stderr] ${text}` : text;
        if (idleTimer) {
          clearTimeout(idleTimer);
        }
        idleTimer = setTimeout(() => complete(false), this.config.crushIdleDebounceMs);
      };

      const onStdout = (chunk: Buffer) => onChunk(chunk, false);
      const onStderr = (chunk: Buffer) => onChunk(chunk, true);
      const onError = (error: Error) => {
        if (done) {
          return;
        }
        done = true;
        cleanup();
        reject(error);
      };
      const onExit = () => {
        if (done) {
          return;
        }
        if (!receivedAnyData) {
          output = output.length > 0 ? output : "Crush process exited without output.";
        }
        complete(false);
      };

      processRef.stdout.on("data", onStdout);
      processRef.stderr.on("data", onStderr);
      processRef.on("error", onError);
      processRef.on("exit", onExit);

      hardTimer = setTimeout(() => complete(true), this.config.crushHardTimeoutMs);

      try {
        processRef.stdin.write(`${input.trim()}\n`);
      } catch (error) {
        onError(error as Error);
      }
    });
  }
}
