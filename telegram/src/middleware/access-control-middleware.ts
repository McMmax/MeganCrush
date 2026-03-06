import { Context, MiddlewareFn } from "grammy";
import { AppConfig } from "../services/config-service";

export class AccessControlMiddleware {
  private readonly allowedUserIds: Set<number>;

  constructor(config: AppConfig) {
    this.allowedUserIds = config.allowedTelegramUserIds;
  }

  getMiddleware(): MiddlewareFn<Context> {
    return async (ctx, next) => {
      if (this.allowedUserIds.size === 0) {
        await next();
        return;
      }

      const userId = ctx.from?.id;
      if (!userId || !this.allowedUserIds.has(userId)) {
        if (ctx.chat) {
          await ctx.reply("Access denied.");
        }
        return;
      }

      await next();
    };
  }
}
