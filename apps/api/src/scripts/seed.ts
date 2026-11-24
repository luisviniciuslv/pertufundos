import { loadConfig } from "../config/env.js";
import { createContainer } from "../container.js";
import { PostgresFundRepository } from "../infrastructure/persistence/postgres/postgres-fund.repository.js";
import { seedDemoGroupIfEmpty } from "./seed-helper.js";

async function run(): Promise<void> {
  const config = loadConfig();
  const container = createContainer(config);

  if (container.repository instanceof PostgresFundRepository) {
    await container.repository.runMigrations();
  }

  const seeded = await seedDemoGroupIfEmpty(container);
  console.log(
    seeded
      ? "✅ Dados iniciais de demonstração criados com sucesso!"
      : "ℹ️ Banco já possui participantes cadastrados; seed ignorado.",
  );
  await container.repository.close();
}

run().catch((err) => {
  console.error("Erro no seed:", err);
  process.exit(1);
});
