"use client";

import type { EvmAddress, MemberTaxSummary } from "@pertufundos/shared";
import { Download, FileSpreadsheet, KeyRound, Lock } from "lucide-react";
import { useEffect, useState } from "react";
import { fundApi } from "@/lib/api-client";
import { formatShares, formatUsd } from "@/lib/formatters";

interface TaxReportTabProps {
  authenticatedWallet: EvmAddress | undefined;
  onRequestSignIn: () => void;
}

export function TaxReportTab({ authenticatedWallet, onRequestSignIn }: TaxReportTabProps) {
  const [summary, setSummary] = useState<MemberTaxSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authenticatedWallet) {
      setSummary(null);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    fundApi
      .getTaxSummary(authenticatedWallet)
      .then((res) => setSummary(res.summary))
      .catch((err) => {
        setSummary(null);
        setError(err instanceof Error ? err.message : "Erro ao carregar dados fiscais.");
      })
      .finally(() => setLoading(false));
  }, [authenticatedWallet]);

  async function handleExportMyCsv() {
    setDownloading(true);
    setError(null);
    try {
      await fundApi.downloadMyTaxCsv();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao exportar CSV.");
    } finally {
      setDownloading(false);
    }
  }

  if (!authenticatedWallet) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-8 text-center space-y-4 max-w-xl mx-auto">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
          <Lock className="h-6 w-6" />
        </div>
        <h2 className="text-lg font-bold text-white">Relatório de Imposto de Renda Protegido</h2>
        <p className="text-xs text-slate-400 leading-relaxed">
          Por privacidade fiscal, cada participante acessa e exporta exclusivamente os dados da sua
          própria carteira mediante assinatura criptográfica gratuita (EIP-191). Nenhum outro membro
          consegue baixar o seu CSV de IRPF/GCAP.
        </p>
        <button
          onClick={onRequestSignIn}
          className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-5 py-2.5 text-xs font-semibold text-slate-950 hover:bg-emerald-400 transition"
        >
          <KeyRound className="h-4 w-4" />
          Conectar e Assinar com Minha Carteira
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-white font-semibold">
            <FileSpreadsheet className="h-5 w-5 text-emerald-400" />
            <h2>Meu Relatório Fiscal Individual (IRPF — Bens e Direitos & GCAP)</h2>
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Acesso exclusivo autenticado pela sua assinatura criptográfica.
          </p>
        </div>

        <button
          onClick={() => void handleExportMyCsv()}
          disabled={downloading || !summary}
          className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-50 transition"
        >
          <Download className="h-3.5 w-3.5" />
          {downloading ? "Gerando CSV..." : "Exportar Meu CSV (IRPF)"}
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-4 text-xs text-rose-200">
          {error}
        </div>
      )}

      {loading && <p className="text-sm text-slate-400">Carregando seus dados fiscais...</p>}

      {summary && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
              <span className="text-xs text-slate-400">
                Custo Total de Aquisição (Ficha Bens e Direitos)
              </span>
              <p className="mt-2 text-xl font-bold text-white">
                {formatUsd(summary.totalAcquisitionCostUsd)}
              </p>
              <p className="mt-1 text-xs text-slate-400">
                {formatShares(summary.endingSharesBalance)} cotas em carteira
              </p>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
              <span className="text-xs text-slate-400">Valor Atual de Mercado</span>
              <p className="mt-2 text-xl font-bold text-white">
                {formatUsd(summary.currentMarketValueUsd)}
              </p>
              <p className="mt-1 text-xs text-slate-400">
                PM Unitário: US$ {summary.member.avgCostPerShareUsd.toFixed(4)}
              </p>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
              <span className="text-xs text-slate-400">
                Ganho de Capital Realizado Acumulado (Resgates)
              </span>
              <p
                className={`mt-2 text-xl font-bold ${
                  summary.totalRealizedGainUsd >= 0 ? "text-emerald-400" : "text-rose-400"
                }`}
              >
                {formatUsd(summary.totalRealizedGainUsd)}
              </p>
              <p className="mt-1 text-xs text-slate-400">
                Apurado apenas na alienação/resgate de cotas
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-xs uppercase text-slate-400">
                  <th className="pb-3">Data</th>
                  <th className="pb-3">Operação</th>
                  <th className="pb-3 text-right">Valor (USD)</th>
                  <th className="pb-3 text-right">Cotas</th>
                  <th className="pb-3 text-right">PM Após (USD)</th>
                  <th className="pb-3 text-right">Custo Baixado</th>
                  <th className="pb-3 text-right">Ganho Realizado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {summary.entries.map((row, idx) => (
                  <tr key={idx}>
                    <td className="py-3 text-xs text-slate-400">
                      {new Date(row.dateIso).toLocaleDateString("pt-BR")}
                    </td>
                    <td className="py-3 text-xs font-semibold text-white">{row.operationType}</td>
                    <td className="py-3 text-right font-mono text-xs">
                      {formatUsd(row.amountUsd)}
                    </td>
                    <td className="py-3 text-right font-mono text-xs">
                      {formatShares(row.sharesDelta)}
                    </td>
                    <td className="py-3 text-right font-mono text-xs text-slate-300">
                      US$ {row.avgCostPerShareAfterUsd.toFixed(4)}
                    </td>
                    <td className="py-3 text-right font-mono text-xs text-slate-300">
                      {formatUsd(row.costBasisDisposedUsd)}
                    </td>
                    <td
                      className={`py-3 text-right font-mono text-xs font-semibold ${
                        row.realizedCapitalGainUsd >= 0 ? "text-emerald-400" : "text-rose-400"
                      }`}
                    >
                      {formatUsd(row.realizedCapitalGainUsd)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
