import path from "node:path";
import dotenv from "dotenv";
import { z } from "zod";
import { evmAddressSchema, SUPPORTED_CHAINS } from "@pertufundos/shared";

// Carrega .env da raiz do monorepo ou local
dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });
dotenv.config();

const envSchema = z.object({
  STORAGE_DRIVER: z.enum(["sqlite", "postgres"]).default("sqlite"),
  SQLITE_PATH: z.string().default("./data/pertufundos.sqlite"),
  DATABASE_URL: z
    .string()
    .default("postgresql://pertufundos:pertufundos_secret@localhost:5432/pertufundos"),

  API_PORT: z.coerce.number().int().positive().default(4000),
  CORS_ORIGIN: z.string().default("http://localhost:3000"),
  AUTH_SESSION_SECRET: z
    .string()
    .min(16)
    .default("pertufundos_dev_session_hmac_secret_change_in_prod"),

  PRIMARY_CHAIN_ID: z.coerce.number().int().default(SUPPORTED_CHAINS.BNB.id),
  EXIT_CHAIN_ID: z.coerce.number().int().default(SUPPORTED_CHAINS.BASE.id),
  SAFE_ADDRESS: evmAddressSchema.default("0x1111111111111111111111111111111111111111"),
  SAFE_THRESHOLD: z.coerce.number().int().min(1).default(3),
  SAFE_API_KEY: z.string().optional(),

  BSC_RPC_URL: z.string().url().default(SUPPORTED_CHAINS.BNB.defaultRpcUrl),
  BASE_RPC_URL: z.string().url().default(SUPPORTED_CHAINS.BASE.defaultRpcUrl),
  ONDO_SHARES_ORACLE_ADDRESS: z.string().optional(),

  OKX_BASE_URL: z.string().url().default("https://web3.okx.com"),
  OKX_API_KEY: z.string().default(""),
  OKX_SECRET_KEY: z.string().default(""),
  OKX_API_PASSPHRASE: z.string().default(""),
  OKX_PROJECT_ID: z.string().default(""),

  MAX_SLIPPAGE_PERCENT: z.coerce.number().min(0.05).max(5).default(0.5),
  MAX_PRICE_IMPACT_PERCENT: z.coerce.number().min(0.1).max(10).default(1.5),
  ENFORCE_US_MARKET_HOURS: z
    .string()
    .default("true")
    .transform((v) => v.toLowerCase() === "true"),

  ALCHEMY_WEBHOOK_SIGNING_KEY: z.string().default(""),
  DISCORD_WEBHOOK_URL: z.string().default(""),
  TELEGRAM_BOT_TOKEN: z.string().default(""),
  TELEGRAM_CHAT_ID: z.string().default(""),
});

const INSECURE_KNOWN_SECRETS = new Set([
  "pertufundos_dev_session_hmac_secret_change_in_prod",
  "troque_por_uma_string_aleatoria_longa_em_producao_64_chars",
]);

const DEMO_SAFE_PLACEHOLDER = "0x1111111111111111111111111111111111111111";

export type AppConfig = z.infer<typeof envSchema>;

export function loadConfig(overrides: Partial<Record<string, string>> = {}): AppConfig {
  const merged = { ...process.env, ...overrides };
  const parsed = envSchema.parse(merged);

  const isRealSafeConfigured = parsed.SAFE_ADDRESS.toLowerCase() !== DEMO_SAFE_PLACEHOLDER;
  const isProdNodeEnv = merged.NODE_ENV === "production";

  if ((isRealSafeConfigured || isProdNodeEnv) && INSECURE_KNOWN_SECRETS.has(parsed.AUTH_SESSION_SECRET)) {
    throw new Error(
      "[SECURITY BLOCK] Em produção ou com uma Safe real configurada, você DEVE gerar um AUTH_SESSION_SECRET exclusivo no .env (rode: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\").",
    );
  }

  return parsed;
}
