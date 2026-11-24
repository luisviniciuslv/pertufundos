import type { AppConfig } from "../../config/env.js";
import type {
  INotificationGateway,
  NotificationEvent,
} from "../../application/ports/notification-gateway.port.js";

export class WebhookNotificationGateway implements INotificationGateway {
  constructor(private readonly config: AppConfig) {}

  async notifyGroup(event: NotificationEvent): Promise<void> {
    const tasks: Promise<unknown>[] = [];

    if (this.config.DISCORD_WEBHOOK_URL) {
      tasks.push(this.sendDiscord(event));
    }
    if (this.config.TELEGRAM_BOT_TOKEN && this.config.TELEGRAM_CHAT_ID) {
      tasks.push(this.sendTelegram(event));
    }

    if (tasks.length > 0) {
      await Promise.allSettled(tasks);
    }
  }

  private async sendDiscord(event: NotificationEvent): Promise<void> {
    await fetch(this.config.DISCORD_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        embeds: [
          {
            title: event.title,
            description: event.message,
            url: event.actionUrl,
            color: 0x10b981,
            fields: event.fields?.map((f) => ({
              name: f.label,
              value: f.value,
              inline: true,
            })),
            timestamp: new Date().toISOString(),
          },
        ],
      }),
    });
  }

  private async sendTelegram(event: NotificationEvent): Promise<void> {
    const lines = [
      `*${event.title}*`,
      event.message,
      ...(event.fields?.map((f) => `• *${f.label}:* ${f.value}`) ?? []),
      ...(event.actionUrl ? [`[Abrir Link](${event.actionUrl})`] : []),
    ];

    const url = `https://api.telegram.org/bot${this.config.TELEGRAM_BOT_TOKEN}/sendMessage`;
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: this.config.TELEGRAM_CHAT_ID,
        text: lines.join("\n"),
        parse_mode: "Markdown",
      }),
    });
  }
}
