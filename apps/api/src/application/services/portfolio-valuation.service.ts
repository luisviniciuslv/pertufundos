import {
  BNB_USDC_TOKEN,
  calculateNavPerShare,
  fromRawUnits,
  getUsMarketSessionStatus,
  INITIAL_NAV_USD,
  roundFinancial,
  type AssetHolding,
  type EvmAddress,
  type MemberPosition,
  type NavSnapshot,
  type PortfolioSummary,
} from "@pertufundos/shared";
import type { AppConfig } from "../../config/env.js";
import type { IDexGateway } from "../ports/dex-gateway.port.js";
import type { IFundRepository } from "../ports/fund-repository.port.js";
import type { IVaultReader } from "../ports/vault-reader.port.js";

export class PortfolioValuationService {
  constructor(
    private readonly config: AppConfig,
    private readonly repository: IFundRepository,
    private readonly vaultReader: IVaultReader,
    private readonly dexGateway: IDexGateway,
  ) {}

  /**
   * Calcula o estado completo do portfólio on-chain, o NAV por cota e a posição individual de cada cotista.
   * @param preDepositDeductionUsd Se um depósito já caiu na Safe on-chain antes da emissão das cotas,
   * deduz esse valor para apurar o NAV imediatamente anterior ao depósito (evitando autodiluir o aportador).
   */
  async getPortfolioSummary(preDepositDeductionUsd: number = 0): Promise<PortfolioSummary> {
    const customTokens = await this.repository.listCustomTokens();
    const [rawSnapshots, members] = await Promise.all([
      this.vaultReader.readVaultBalances(this.config.SAFE_ADDRESS, customTokens),
      this.repository.listMembers(),
    ]);

    const totalSharesIssued = roundFinancial(
      members.reduce((sum, m) => sum + m.sharesBalance, 0),
    );

    const pricedHoldings = await Promise.all(
      rawSnapshots.map(async (snap): Promise<Omit<AssetHolding, "allocationPercent">> => {
        const balance = fromRawUnits(snap.rawBalance, snap.token.decimals);
        const economicShares = roundFinancial(balance * snap.sharesMultiplier);

        const priceResult =
          snap.token.category === "STABLECOIN"
            ? { unitPriceUsd: 1.0, source: "OKX_LIVE" as const }
            : snap.rawBalance === 0n
              ? { unitPriceUsd: snap.token.referencePriceUsd, source: "FALLBACK_DEMO" as const }
              : await this.dexGateway.getUnitPriceUsd(snap.token);

        // Em Ondo Stocks na BNB Chain, se o preço DEX já é por token on-chain, usamos balance * unitPriceUsd;
        // exibimos economicShares (balance * sharesMultiplier) para transparência de dividendos reinvestidos.
        const marketValueUsd = roundFinancial(balance * priceResult.unitPriceUsd, 4);

        return {
          symbol: snap.token.symbol,
          name: snap.token.name,
          address: snap.token.address,
          category: snap.token.category,
          rawBalance: snap.rawBalance.toString(),
          decimals: snap.token.decimals,
          balance,
          sharesMultiplier: snap.sharesMultiplier,
          economicShares,
          unitPriceUsd: priceResult.unitPriceUsd,
          marketValueUsd,
          priceSource: priceResult.source,
        };
      }),
    );

    const rawPortfolioUsd = pricedHoldings.reduce((acc, h) => acc + h.marketValueUsd, 0);
    const effectivePortfolioUsd = Math.max(
      0,
      roundFinancial(rawPortfolioUsd - preDepositDeductionUsd, 4),
    );

    // Se o cofre real ainda está vazio mas já existem cotas em modo demo local, preserva NAV >= P0
    const navPerShareUsd =
      totalSharesIssued > 0 && effectivePortfolioUsd > 0
        ? calculateNavPerShare({
            totalPortfolioUsd: effectivePortfolioUsd,
            totalSharesIssued,
          })
        : INITIAL_NAV_USD;

    const holdings: AssetHolding[] = pricedHoldings.map((h) => ({
      ...h,
      allocationPercent:
        rawPortfolioUsd > 0 ? roundFinancial((h.marketValueUsd / rawPortfolioUsd) * 100, 2) : 0,
    }));

    const liquidUsdcBalance =
      holdings.find((h) => h.address.toLowerCase() === BNB_USDC_TOKEN.address.toLowerCase())
        ?.balance ?? 0;

    const memberPositions: MemberPosition[] = members.map((m) => {
      const ownershipPercent =
        totalSharesIssued > 0 ? roundFinancial((m.sharesBalance / totalSharesIssued) * 100, 4) : 0;
      const currentValueUsd = roundFinancial(m.sharesBalance * navPerShareUsd, 2);
      const costBasisUsd = m.sharesBalance * m.avgCostPerShareUsd;
      const unrealizedGainUsd = roundFinancial(currentValueUsd - costBasisUsd, 2);
      const unrealizedGainPercent =
        costBasisUsd > 0 ? roundFinancial((unrealizedGainUsd / costBasisUsd) * 100, 2) : 0;

      return {
        ...m,
        ownershipPercent,
        currentValueUsd,
        unrealizedGainUsd,
        unrealizedGainPercent,
      };
    });

    return {
      safeAddress: this.config.SAFE_ADDRESS,
      primaryChainId: this.config.PRIMARY_CHAIN_ID,
      exitChainId: this.config.EXIT_CHAIN_ID,
      safeThreshold: this.config.SAFE_THRESHOLD,
      navPerShareUsd,
      totalPortfolioUsd: effectivePortfolioUsd,
      totalSharesIssued,
      liquidUsdcBalance,
      holdings,
      members: memberPositions,
      marketSession: getUsMarketSessionStatus(),
      updatedAt: new Date().toISOString(),
    };
  }

  async recordNavSnapshot(triggerEvent: string): Promise<NavSnapshot> {
    const summary = await this.getPortfolioSummary();
    return this.repository.saveNavSnapshot({
      triggerEvent,
      totalPortfolioUsd: summary.totalPortfolioUsd,
      totalShares: summary.totalSharesIssued,
      navPerShareUsd: summary.navPerShareUsd,
    });
  }

  async getAllowanceForRouter(tokenAddress: EvmAddress, routerAddress: EvmAddress): Promise<bigint> {
    return this.vaultReader.readAllowance({
      tokenAddress,
      ownerAddress: this.config.SAFE_ADDRESS,
      spenderAddress: routerAddress,
    });
  }
}
