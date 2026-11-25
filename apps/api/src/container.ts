import type { AppConfig } from "./config/env.js";
import type { IDexGateway } from "./application/ports/dex-gateway.port.js";
import type { IFundRepository } from "./application/ports/fund-repository.port.js";
import type { INotificationGateway } from "./application/ports/notification-gateway.port.js";
import type { IVaultReader } from "./application/ports/vault-reader.port.js";
import { AssetCatalogService } from "./application/services/asset-catalog.service.js";
import { DepositService } from "./application/services/deposit.service.js";
import { GovernanceService } from "./application/services/governance.service.js";
import { PortfolioValuationService } from "./application/services/portfolio-valuation.service.js";
import { TaxReportService } from "./application/services/tax-report.service.js";
import { WalletAuthService } from "./application/services/wallet-auth.service.js";
import { ViemVaultReader } from "./infrastructure/blockchain/viem-vault.reader.js";
import { OkxDexGateway } from "./infrastructure/dex/okx-dex.gateway.js";
import { WebhookNotificationGateway } from "./infrastructure/notifications/webhook-notification.gateway.js";
import { PostgresFundRepository } from "./infrastructure/persistence/postgres/postgres-fund.repository.js";
import { SqliteFundRepository } from "./infrastructure/persistence/sqlite/sqlite-fund.repository.js";

export interface AppContainer {
  readonly config: AppConfig;
  readonly repository: IFundRepository;
  readonly vaultReader: IVaultReader;
  readonly dexGateway: IDexGateway;
  readonly notifications: INotificationGateway;
  readonly walletAuthService: WalletAuthService;
  readonly assetCatalogService: AssetCatalogService;
  readonly valuationService: PortfolioValuationService;
  readonly depositService: DepositService;
  readonly governanceService: GovernanceService;
  readonly taxReportService: TaxReportService;
}

export function createContainer(
  config: AppConfig,
  overrides: Partial<{
    repository: IFundRepository;
    vaultReader: IVaultReader;
    dexGateway: IDexGateway;
    notifications: INotificationGateway;
  }> = {},
): AppContainer {
  const repository =
    overrides.repository ??
    (config.STORAGE_DRIVER === "postgres"
      ? new PostgresFundRepository({
          connectionString: config.DATABASE_URL,
          sslCertBase64: config.DATABASE_SSL_CERT_BASE64,
          sslCertPath: config.DATABASE_SSL_CERT_PATH,
        })
      : new SqliteFundRepository(config.SQLITE_PATH));

  const vaultReader = overrides.vaultReader ?? new ViemVaultReader(config, repository);
  const dexGateway = overrides.dexGateway ?? new OkxDexGateway(config);
  const notifications = overrides.notifications ?? new WebhookNotificationGateway(config);

  const walletAuthService = new WalletAuthService(config, repository);
  const assetCatalogService = new AssetCatalogService(repository, dexGateway, vaultReader);
  const valuationService = new PortfolioValuationService(
    config,
    repository,
    vaultReader,
    dexGateway,
  );
  const depositService = new DepositService(
    config,
    repository,
    valuationService,
    notifications,
  );
  const governanceService = new GovernanceService(
    config,
    repository,
    valuationService,
    assetCatalogService,
    dexGateway,
    notifications,
  );
  const taxReportService = new TaxReportService(repository, valuationService);

  return {
    config,
    repository,
    vaultReader,
    dexGateway,
    notifications,
    walletAuthService,
    assetCatalogService,
    valuationService,
    depositService,
    governanceService,
    taxReportService,
  };
}
