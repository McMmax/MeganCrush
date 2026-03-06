import dotenv from "dotenv";

dotenv.config();

export interface AppConfig {
  telegramBotToken: string;
  allowedTelegramUserIds: Set<number>;
  crushCommand: string;
  crushArgs: string[];
  crushCwd: string;
  crushIdleDebounceMs: number;
  crushHardTimeoutMs: number;
  maxOutputChars: number;
  logLevel: string;
}

function parseInteger(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }

  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    throw new Error(`Invalid ${name}: expected positive integer, got "${raw}"`);
  }

  return parsed;
}

function parseUserIdSet(raw: string | undefined): Set<number> {
  if (!raw || raw.trim().length === 0) {
    return new Set<number>();
  }

  const values = raw
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map((part) => Number.parseInt(part, 10));

  if (values.some((value) => Number.isNaN(value))) {
    throw new Error("ALLOWED_TELEGRAM_USER_IDS must be a comma-separated list of integers");
  }

  return new Set<number>(values);
}

function splitArgs(raw: string | undefined): string[] {
  if (!raw || raw.trim().length === 0) {
    return [];
  }

  return raw.trim().split(/\s+/g);
}

export class ConfigService {
  private readonly config: AppConfig;

  constructor() {
    const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
    if (!telegramBotToken) {
      throw new Error("Missing TELEGRAM_BOT_TOKEN");
    }

    this.config = {
      telegramBotToken,
      allowedTelegramUserIds: parseUserIdSet(process.env.ALLOWED_TELEGRAM_USER_IDS),
      crushCommand: process.env.CRUSH_COMMAND?.trim() || "crush",
      crushArgs: splitArgs(process.env.CRUSH_ARGS),
      crushCwd: process.env.CRUSH_CWD?.trim() || process.cwd(),
      crushIdleDebounceMs: parseInteger("CRUSH_IDLE_DEBOUNCE_MS", 1200),
      crushHardTimeoutMs: parseInteger("CRUSH_HARD_TIMEOUT_MS", 300000),
      maxOutputChars: parseInteger("MAX_OUTPUT_CHARS", 12000),
      logLevel: process.env.LOG_LEVEL?.trim() || "info"
    };
  }

  getAll(): AppConfig {
    return this.config;
  }
}
