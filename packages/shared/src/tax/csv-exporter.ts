import type { LedgerEntry, Member, MemberTaxSummary, TaxReportRow } from "../domain/types.js";
import { roundFinancial } from "../math/nav-math.js";

export function buildMemberTaxSummary(params: {
  member: Member;
  entries: readonly LedgerEntry[];
  currentNavUsd: number;
}): MemberTaxSummary {
  const { member, entries, currentNavUsd } = params;

  const sorted = [...entries].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );

  const rows: TaxReportRow[] = sorted.map((entry) => {
    const isRedemption = entry.type === "REDEMPTION";
    const sharesAbs = Math.abs(entry.sharesDelta);
    const costBasisDisposedUsd = isRedemption
      ? roundFinancial(sharesAbs * entry.avgCostAfterUsd, 6)
      : 0;

    return {
      dateIso: entry.createdAt,
      memberNickname: entry.memberNickname,
      walletAddress: entry.memberWallet,
      operationType: entry.type,
      amountUsd: entry.amountUsd,
      sharesDelta: entry.sharesDelta,
      navPerShareUsd: entry.navAtExecutionUsd,
      avgCostPerShareAfterUsd: entry.avgCostAfterUsd,
      costBasisDisposedUsd,
      realizedCapitalGainUsd: entry.realizedGainUsd,
      txHash: entry.txHash,
    };
  });

  const totalAcquisitionCostUsd = roundFinancial(
    member.sharesBalance * member.avgCostPerShareUsd,
    2,
  );
  const currentMarketValueUsd = roundFinancial(member.sharesBalance * currentNavUsd, 2);

  return {
    member,
    currentNavUsd,
    endingSharesBalance: member.sharesBalance,
    totalAcquisitionCostUsd,
    currentMarketValueUsd,
    totalRealizedGainUsd: roundFinancial(member.realizedGainUsd, 2),
    entries: rows,
  };
}

export function serializeTaxRowsToCsv(rows: readonly TaxReportRow[]): string {
  const headers = [
    "Data_UTC",
    "Participante",
    "Carteira_EVM",
    "Tipo_Operacao",
    "Valor_USD",
    "Variacao_Cotas",
    "NAV_Unitario_USD",
    "Preco_Medio_Cota_USD",
    "Custo_Aquisicao_Baixado_USD",
    "Ganho_Capital_Realizado_USD",
    "Tx_Hash",
  ];

  const escapeCsv = (val: string | number): string => {
    const text = String(val);
    if (text.includes(",") || text.includes('"') || text.includes("\n")) {
      return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
  };

  const lines = rows.map((r) =>
    [
      r.dateIso,
      r.memberNickname,
      r.walletAddress,
      r.operationType,
      r.amountUsd.toFixed(2),
      r.sharesDelta.toFixed(8),
      r.navPerShareUsd.toFixed(8),
      r.avgCostPerShareAfterUsd.toFixed(8),
      r.costBasisDisposedUsd.toFixed(2),
      r.realizedCapitalGainUsd.toFixed(2),
      r.txHash,
    ]
      .map(escapeCsv)
      .join(","),
  );

  return [headers.join(","), ...lines].join("\n");
}
