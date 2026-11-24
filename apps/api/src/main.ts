import { serve } from "@hono/node-server";
import { loadConfig } from "./config/env.js";
import { createContainer } from "./container.js";
import { PostgresFundRepository } from "./infrastructure/persistence/postgres/postgres-fund.repository.js";
import { createHttpApp } from "./presentation/http/app.js";
import { seedDemoGroupIfEmpty } from "./scripts/seed-helper.js";

async function bootstrap(): Promise<void> {
  const config = loadConfig();
  const container = createContainer(config);

  if (container.repository instanceof PostgresFundRepository) {
    await container.repository.runMigrations();
  } else if (config.SAFE_ADDRESS === "0x1111111111111111111111111111111111111111") {
    // Em modo local demo (SQLite + Safe placeholder), garante dados prontos na primeira execução
    await seedDemoGroupIfEmpty(container);
  }

  const app = createHttpApp(container);

  serve(
    {
      fetch: app.fetch,
      port: config.API_PORT,
    },
    (info) => {
      console.log(
        `🚀 Pertufundos API rodando em http://localhost:${info.port}/api/v1 (driver=${config.STORAGE_DRIVER})`,
      );
    },
  );
}

bootstrap().catch((err) => {
  console.error("Falha fatal ao iniciar API:", err);
  process.exit(1);
});
