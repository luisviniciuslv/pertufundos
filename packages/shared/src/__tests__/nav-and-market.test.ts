import { describe, expect, it } from "vitest";
import {
  BASE_USDC_TOKEN,
  BNB_USDC_TOKEN,
  calculateCapitalGainOnRedemption,
  calculateNavPerShare,
  calculateProportionalSellPlan,
  calculateRedemptionValueUsd,
  calculateSharesToIssue,
  calculateUpdatedAverageCost,
  fromRawUnits,
  getUsMarketSessionStatus,
  INITIAL_NAV_USD,
  toRawUnits,
} from "../index.js";

describe("NAV & Share Accounting Engine (@pertufundos/shared)", () => {
  it("starts at P0 = US$ 1.00 and prevents dilution when portfolio appreciates", () => {
    // Dia 1: Amigo A aporta US$ 1.000 com fundo zerado -> NAV = 1.00 -> 1.000 cotas
    const navDay1 = calculateNavPerShare({ totalPortfolioUsd: 0, totalSharesIssued: 0 });
    expect(navDay1).toBe(INITIAL_NAV_USD);

    const sharesFriendA = calculateSharesToIssue({ depositUsd: 1000, navPerShareUsd: navDay1 });
    expect(sharesFriendA).toBe(1000);

    // Carteira valoriza +25% (NVDAon sobe): Patrimônio = US$ 1.250 para 1.000 cotas -> NAV = US$ 1.25
    const navAfterGrowth = calculateNavPerShare({
      totalPortfolioUsd: 1250,
      totalSharesIssued: sharesFriendA,
    });
    expect(navAfterGrowth).toBe(1.25);

    // Amigo B entra depois com US$ 500 -> recebe 500 / 1.25 = 400 cotas (sem diluir o lucro de A!)
    const sharesFriendB = calculateSharesToIssue({
      depositUsd: 500,
      navPerShareUsd: navAfterGrowth,
    });
    expect(sharesFriendB).toBe(400);

    // Patrimônio pós-aporte = US$ 1.750 e cotas totais = 1.400 -> Amigo A continua valendo US$ 1.250!
    const totalShares = sharesFriendA + sharesFriendB;
    const navPostDeposit = calculateNavPerShare({
      totalPortfolioUsd: 1750,
      totalSharesIssued: totalShares,
    });
    expect(navPostDeposit).toBe(1.25);
    expect(
      calculateRedemptionValueUsd({ sharesToRedeem: sharesFriendA, navPerShareUsd: navPostDeposit }),
    ).toBe(1250);
  });

  it("computes weighted average cost and preserves unit cost on partial redemption (IRPF rule)", () => {
    // 1º aporte: 500 cotas a US$ 1.00
    const pm1 = calculateUpdatedAverageCost({
      currentShares: 0,
      currentAvgCostUsd: 0,
      addedShares: 500,
      navAtDepositUsd: 1.0,
    });
    expect(pm1).toBe(1.0);

    // 2º aporte: +500 cotas a US$ 1.50 -> PM ponderado = US$ 1.25
    const pm2 = calculateUpdatedAverageCost({
      currentShares: 500,
      currentAvgCostUsd: pm1,
      addedShares: 500,
      navAtDepositUsd: 1.5,
    });
    expect(pm2).toBe(1.25);

    // Resgate parcial de 400 cotas quando NAV = US$ 1.75 -> Ganho realizado = (1.75 - 1.25) * 400 = US$ 200
    const gain = calculateCapitalGainOnRedemption({
      sharesRedeemed: 400,
      redemptionNavUsd: 1.75,
      avgCostPerShareUsd: pm2,
    });
    expect(gain.grossProceedsUsd).toBe(700);
    expect(gain.costBasisDisposedUsd).toBe(500);
    expect(gain.realizedGainUsd).toBe(200);
  });

  it("normalizes BNB Chain 18-decimal USDC vs Base 6-decimal USDC accurately", () => {
    const rawBnb = toRawUnits("250.75", BNB_USDC_TOKEN.decimals);
    const rawBase = toRawUnits("250.75", BASE_USDC_TOKEN.decimals);

    expect(rawBnb).toBe(250750000000000000000n); // 18 decimals
    expect(rawBase).toBe(250750000n); // 6 decimals
    expect(fromRawUnits(rawBnb, BNB_USDC_TOKEN.decimals)).toBe(250.75);
    expect(fromRawUnits(rawBase, BASE_USDC_TOKEN.decimals)).toBe(250.75);
  });

  it("calculates proportional liquidation across Ondo Stocks when liquid USDC is insufficient", () => {
    const legs = calculateProportionalSellPlan({
      deficitUsd: 300,
      slippageBufferPercent: 0,
      holdings: [
        {
          symbol: "NVDAon",
          name: "NVIDIA",
          address: "0xa9ee28c80f960b889dfbd1902055218cba016f75",
          category: "ONDO_STOCK",
          rawBalance: "0",
          decimals: 18,
          balance: 4,
          sharesMultiplier: 1,
          economicShares: 4,
          unitPriceUsd: 150, // US$ 600 (60% das ações)
          marketValueUsd: 600,
          allocationPercent: 60,
          priceSource: "OKX_LIVE",
        },
        {
          symbol: "AAPLon",
          name: "Apple",
          address: "0x390a684EF9cADE28A7AD0DFa61AB1Eb3842618c4",
          category: "ONDO_STOCK",
          rawBalance: "0",
          decimals: 18,
          balance: 2,
          sharesMultiplier: 1,
          economicShares: 2,
          unitPriceUsd: 200, // US$ 400 (40% das ações)
          marketValueUsd: 400,
          allocationPercent: 40,
          priceSource: "OKX_LIVE",
        },
      ],
    });

    expect(legs).toHaveLength(2);
    // 60% de US$ 300 = US$ 180 em NVDAon (1.2 tokens) e 40% = US$ 120 em AAPLon (0.6 tokens)
    expect(legs[0]?.estimatedProceedsUsd).toBeCloseTo(180, 2);
    expect(legs[1]?.estimatedProceedsUsd).toBeCloseTo(120, 2);
  });

  it("evaluates US regular market hours (NYSE/Nasdaq 09:30-16:00 ET) accurately", () => {
    // Quarta-feira 15:00 UTC em Novembro = 10:00 EST (aberto!)
    const wednesdayOpen = new Date("2026-11-25T15:00:00.000Z");
    expect(getUsMarketSessionStatus(wednesdayOpen).isOpen).toBe(true);

    // Sábado -> fechado!
    const saturdayClosed = new Date("2026-11-28T15:00:00.000Z");
    expect(getUsMarketSessionStatus(saturdayClosed).isOpen).toBe(false);
  });
});
