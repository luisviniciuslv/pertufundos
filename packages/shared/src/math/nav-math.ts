import type { AssetHolding, ProportionalLiquidationLeg } from "../domain/types.js";

export const INITIAL_NAV_USD = 1.0;

const PRECISION_DECIMALS = 8;
const PRECISION_FACTOR = 10 ** PRECISION_DECIMALS;

export function roundFinancial(value: number, decimals: number = PRECISION_DECIMALS): number {
  if (!Number.isFinite(value)) {
    throw new Error(`Valor financeiro inválido: ${value}`);
  }
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

/**
 * Converte quantidade humana (ex: "125.5") para unidades inteiras on-chain (wei / smallest unit)
 * sem imprecisão de ponto flutuante IEEE-754.
 */
export function toRawUnits(amount: number | string, decimals: number): bigint {
  const normalized = typeof amount === "number" ? amount.toFixed(Math.min(decimals, 12)) : amount.trim();
  if (normalized.startsWith("-")) {
    throw new Error("Quantidade on-chain não pode ser negativa");
  }
  const [intPart = "0", fracPart = ""] = normalized.split(".");
  const paddedFrac = fracPart.slice(0, decimals).padEnd(decimals, "0");
  return BigInt(`${intPart}${paddedFrac}`);
}

/**
 * Converte unidades inteiras on-chain (BigInt/string) para número decimal normalizado.
 */
export function fromRawUnits(rawAmount: bigint | string, decimals: number): number {
  const raw = typeof rawAmount === "string" ? BigInt(rawAmount) : rawAmount;
  const divisor = 10n ** BigInt(decimals);
  const whole = raw / divisor;
  const remainder = raw % divisor;
  const fracStr = remainder.toString().padStart(decimals, "0").slice(0, 10);
  return Number(`${whole.toString()}.${fracStr}`);
}

/**
 * Cálculo do NAV vigente:
 * NAV = Patrimônio Total da Safe (USD) / Total de Cotas Emitidas
 * Caso o fundo ainda não possua cotas emitidas (Dia 1), retorna P0 = US$ 1,00.
 */
export function calculateNavPerShare(params: {
  totalPortfolioUsd: number;
  totalSharesIssued: number;
}): number {
  const { totalPortfolioUsd, totalSharesIssued } = params;
  if (totalSharesIssued <= 0) {
    return INITIAL_NAV_USD;
  }
  if (totalPortfolioUsd <= 0) {
    throw new Error("Patrimônio total não pode ser zero/negativo quando há cotas ativas");
  }
  return roundFinancial(totalPortfolioUsd / totalSharesIssued);
}

/**
 * Emissão de cotas em novo aporte:
 * Novas Cotas = Valor Aportado (USD) / NAV Vigente
 */
export function calculateSharesToIssue(params: {
  depositUsd: number;
  navPerShareUsd: number;
}): number {
  const { depositUsd, navPerShareUsd } = params;
  if (depositUsd <= 0) {
    throw new Error("Valor do aporte deve ser positivo");
  }
  if (navPerShareUsd <= 0) {
    throw new Error("NAV deve ser positivo");
  }
  return roundFinancial(depositUsd / navPerShareUsd);
}

/**
 * Valor bruto devido no resgate de cotas:
 * Valor a Receber (USD) = Cotas Resgatadas * NAV Vigente
 */
export function calculateRedemptionValueUsd(params: {
  sharesToRedeem: number;
  navPerShareUsd: number;
}): number {
  const { sharesToRedeem, navPerShareUsd } = params;
  if (sharesToRedeem <= 0) {
    throw new Error("Quantidade de cotas a resgatar deve ser positiva");
  }
  if (navPerShareUsd <= 0) {
    throw new Error("NAV deve ser positivo");
  }
  return roundFinancial(sharesToRedeem * navPerShareUsd, 6);
}

/**
 * Preço médio ponderado de aquisição por cota (para Imposto de Renda):
 * Novo PM = ((Cotas Atuais * PM Atual) + (Novas Cotas * NAV no Aporte)) / (Cotas Atuais + Novas Cotas)
 */
export function calculateUpdatedAverageCost(params: {
  currentShares: number;
  currentAvgCostUsd: number;
  addedShares: number;
  navAtDepositUsd: number;
}): number {
  const { currentShares, currentAvgCostUsd, addedShares, navAtDepositUsd } = params;
  const totalShares = currentShares + addedShares;
  if (totalShares <= 0) {
    return 0;
  }
  const previousCostBasis = currentShares * currentAvgCostUsd;
  const addedCostBasis = addedShares * navAtDepositUsd;
  return roundFinancial((previousCostBasis + addedCostBasis) / totalShares);
}

/**
 * Apuração de ganho/perda de capital no resgate (alienação de cotas):
 * Ganho de Capital (USD) = (NAV no Resgate - PM de Aquisição) * Cotas Resgatadas
 * Nota: Na venda parcial, o PM unitário das cotas remanescentes NÃO se altera (regra fiscal da RFB).
 */
export function calculateCapitalGainOnRedemption(params: {
  sharesRedeemed: number;
  redemptionNavUsd: number;
  avgCostPerShareUsd: number;
}): {
  grossProceedsUsd: number;
  costBasisDisposedUsd: number;
  realizedGainUsd: number;
} {
  const { sharesRedeemed, redemptionNavUsd, avgCostPerShareUsd } = params;
  const grossProceedsUsd = roundFinancial(sharesRedeemed * redemptionNavUsd, 6);
  const costBasisDisposedUsd = roundFinancial(sharesRedeemed * avgCostPerShareUsd, 6);
  const realizedGainUsd = roundFinancial(grossProceedsUsd - costBasisDisposedUsd, 6);
  return {
    grossProceedsUsd,
    costBasisDisposedUsd,
    realizedGainUsd,
  };
}

/**
 * Caso o saldo líquido de USDC na Safe não cubra um resgate, calcula a venda proporcional
 * das ações tokenizadas (Ondo Stocks) para levantar o déficit em USD sem distorcer os pesos da carteira.
 */
export function calculateProportionalSellPlan(params: {
  deficitUsd: number;
  holdings: readonly AssetHolding[];
  slippageBufferPercent?: number;
}): ProportionalLiquidationLeg[] {
  const { deficitUsd, holdings, slippageBufferPercent = 0.5 } = params;
  if (deficitUsd <= 0) {
    return [];
  }

  const stockHoldings = holdings.filter(
    (h) => h.category === "ONDO_STOCK" && h.marketValueUsd > 0 && h.unitPriceUsd > 0,
  );
  const totalStocksUsd = stockHoldings.reduce((acc, h) => acc + h.marketValueUsd, 0);

  if (totalStocksUsd + 0.01 < deficitUsd) {
    throw new Error(
      `Liquidez insuficiente nas ações tokenizadas (${totalStocksUsd.toFixed(2)} USD) para cobrir déficit de ${deficitUsd.toFixed(2)} USD`,
    );
  }

  const bufferMultiplier = 1 + slippageBufferPercent / 100;

  return stockHoldings.map((stock) => {
    const weight = stock.marketValueUsd / totalStocksUsd;
    const targetUsdWithBuffer = Math.min(stock.marketValueUsd, deficitUsd * weight * bufferMultiplier);
    const sellAmountTokens = Math.min(
      stock.balance,
      Math.floor((targetUsdWithBuffer / stock.unitPriceUsd) * PRECISION_FACTOR) / PRECISION_FACTOR,
    );

    return {
      symbol: stock.symbol,
      tokenAddress: stock.address,
      sellAmountTokens,
      estimatedProceedsUsd: roundFinancial(sellAmountTokens * stock.unitPriceUsd, 4),
    };
  });
}
