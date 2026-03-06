import { AppConfig } from "./config-service";
import { CrushResponse, CrushService } from "./crush-service";

export class MeganService {
  private readonly crushService: CrushService;
  private readonly config: AppConfig;

  constructor(crushService: CrushService, config: AppConfig) {
    this.crushService = crushService;
    this.config = config;
  }

  getWelcomeText(): string {
    return [
      "Megan Telegram bridge is active.",
      "Send any text and it will be forwarded to Crush.",
      "",
      "Commands:",
      "/help - show command list",
      "/reset - reset your Crush session",
      "/status - show service status"
    ].join("\n");
  }

  getHelpText(): string {
    return this.getWelcomeText();
  }

  getStatusText(): string {
    return [
      `Crush command: ${this.config.crushCommand} ${this.config.crushArgs.join(" ")}`.trim(),
      `Crush cwd: ${this.config.crushCwd}`,
      `Idle debounce: ${this.config.crushIdleDebounceMs}ms`,
      `Hard timeout: ${this.config.crushHardTimeoutMs}ms`,
      `Active sessions: ${this.crushService.getSessionCount()}`
    ].join("\n");
  }

  resetChatSession(chatId: string): string {
    const reset = this.crushService.resetSession(chatId);
    return reset ? "Session reset." : "No active session to reset.";
  }

  async handleMessage(chatId: string, text: string): Promise<CrushResponse> {
    return this.crushService.run(chatId, text);
  }
}
