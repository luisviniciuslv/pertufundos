import { loadConfig } from "../config/env.js";
import { PostgresFundRepository } from "../infrastructure/persistence/postgres/postgres-fund.repository.js";
import { SqliteFundRepository } from "../infrastructure/persistence/sqlite/sqlite-fund.repository.js";

async function migrate(): Promise<void> {
  const config = loadConfig();
  if (config.STORAGE_DRIVER === "postgres") {
    const repo = new PostgresFundRepository({
      connectionString: config.DATABASE_URL,
      sslCertBase64: config.DATABASE_SSL_CERT_BASE64,
      sslCertPath: config.DATABASE_SSL_CERT_PATH,
    });
    await repo.runMigrations();
    await repo.close();
    console.log("✅ Migrations PostgreSQL aplicadas com sucesso.");
  } else {
    const repo = new SqliteFundRepository(config.SQLITE_PATH);
    await repo.close();
    console.log(`✅ Banco SQLite inicializado em ${config.SQLITE_PATH}.`);
  }
}

migrate().catch((err) => {
  console.error("Erro na migration:", err);
  process.exit(1);
});
