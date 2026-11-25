import { serve } from "@hono/node-server";
import { initializeApiRuntime } from "./bootstrap.js";

async function bootstrap(): Promise<void> {
  const { config, app } = await initializeApiRuntime();

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
