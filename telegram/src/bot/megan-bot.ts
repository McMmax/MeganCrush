import { Bot, Context } from "grammy";
import { AccessControlMiddleware } from "../middleware/access-control-middleware";
import { AppConfig } from "../services/config-service";
import { MeganService } from "../services/megan-service";
import { formatErrorForUser } from "../utils/error-utils";
import { formatCrushOutput, splitForTelegram } from "../utils/message-utils";

export class MeganBot {
  private readonly bot: Bot<Context>;
  private readonly meganService: MeganService;
  private readonly config: AppConfig;

  constructor(config: AppConfig, meganService: MeganService, accessControl: AccessControlMiddleware) {
    this.config = config;
    this.meganService = meganService;
    this.bot = new Bot<Context>(config.telegramBotToken);
    this.bot.use(accessControl.getMiddleware());
    this.registerHandlers();
  }

  async start(): Promise<void> {
    await this.bot.start();
  }

  async stop(): Promise<void> {
    await this.bot.stop();
  }

  private registerHandlers(): void {
    this.bot.command("start", async (ctx) => {
      await ctx.reply(this.meganService.getWelcomeText());
    });

    this.bot.command("help", async (ctx) => {
      await ctx.reply(this.meganService.getHelpText());
    });

    this.bot.command("status", async (ctx) => {
      await ctx.reply(this.meganService.getStatusText());
    });

    this.bot.command("reset", async (ctx) => {
      const chatId = String(ctx.chat.id);
      await ctx.reply(this.meganService.resetChatSession(chatId));
    });

    this.bot.on("message:text", async (ctx) => {
      const chatId = String(ctx.chat.id);
      const text = ctx.message.text.trim();
      if (!text) {
        await ctx.reply("Empty message ignored.");
        return;
      }

      try {
        const result = await this.meganService.handleMessage(chatId, text);
        const header = [
          `Session: ${result.sessionId}`,
          `Duration: ${result.durationMs}ms`,
          `Timed out: ${result.timedOut ? "yes" : "no"}`
        ].join("\n");
        const body = formatCrushOutput(result.output, this.config.maxOutputChars);
        const messages = splitForTelegram(`${header}\n\n${body}`);

        for (const message of messages) {
          await ctx.reply(message);
        }
      } catch (error) {
        await ctx.reply(formatErrorForUser(error));
      }
    });

    this.bot.catch(async (error) => {
      const chat = error.ctx.chat;
      if (chat) {
        await error.ctx.reply(formatErrorForUser(error.error));
      }
    });
  }
}
