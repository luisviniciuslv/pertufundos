import type { Hono } from "hono";
import { loadConfig, type AppConfig } from "./config/env.js";
import { createContainer, type AppContainer } from "./container.js";
import { PostgresFundRepository } from "./infrastructure/persistence/postgres/postgres-fund.repository.js";
import { createHttpApp } from "./presentation/http/app.js";
import { seedDemoGroupIfEmpty } from "./scripts/seed-helper.js";

export interface ApiRuntime {
  readonly config: AppConfig;
  readonly container: AppContainer;
  readonly app: Hono;
}

export async function initializeApiRuntime(): Promise<ApiRuntime> {
  const config = loadConfig();
  const container = createContainer(config);

  if (container.repository instanceof PostgresFundRepository) {
    await container.repository.runMigrations();
  }

  if (
    config.SEED_DEMO_ON_EMPTY ||
    (config.STORAGE_DRIVER === "sqlite" &&
      config.SAFE_ADDRESS === "0x1111111111111111111111111111111111111111")
  ) {
    await seedDemoGroupIfEmpty(container);
  }

  const app = createHttpApp(container);
  return { config, container, app };
}
