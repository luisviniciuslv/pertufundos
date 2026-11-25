import type { Hono } from "hono";
import { loadConfig, type AppConfig } from "./config/env.js";
import { createContainer, type AppContainer } from "./container.js";
import { PostgresFundRepository } from "./infrastructure/persistence/postgres/postgres-fund.repository.js";
import { createHttpApp } from "./presentation/http/app.js";

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

  const app = createHttpApp(container);
  return { config, container, app };
}
