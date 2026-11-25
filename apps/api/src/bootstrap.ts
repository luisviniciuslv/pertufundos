import type { Hono } from "hono";
import { loadConfig, type AppConfig } from "./config/env.js";
import { createContainer, type AppContainer } from "./container.js";
import { PostgresFundRepository } from "./infrastructure/persistence/postgres/postgres-fund.repository.js";
import { SqliteFundRepository } from "./infrastructure/persistence/sqlite/sqlite-fund.repository.js";
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

  // TODO: REMOVER RESET TEMPORÁRIO após confirmação do usuário (e restaurar seedDemoGroupIfEmpty se necessário)
  if (
    container.repository instanceof PostgresFundRepository ||
    container.repository instanceof SqliteFundRepository
  ) {
    await container.repository.clearAllDataForReset();
    const remainingMembers = await container.repository.listMembers();
    console.log(
      `🧹 [RESET TEMPORÁRIO] Banco de dados limpo na inicialização! (driver=${config.STORAGE_DRIVER}, safe=${config.SAFE_ADDRESS}, seedDemoOnEmpty=${config.SEED_DEMO_ON_EMPTY}, users_restantes=${remainingMembers.length})`,
    );
    if (config.SEED_DEMO_ON_EMPTY) {
      console.warn(
        "⚠️ [RESET TEMPORÁRIO] SEED_DEMO_ON_EMPTY=true foi ignorado nesta limpeza. Defina SEED_DEMO_ON_EMPTY=false antes de remover o código de limpeza!",
      );
    }
  }

  const app = createHttpApp(container);
  return { config, container, app };
}
