"use client";

import type { EvmAddress, MemberTaxSummary } from "@pertufundos/shared";
import { Download, FileSpreadsheet, HelpCircle, KeyRound, Lock } from "lucide-react";
import { useEffect, useState } from "react";
import { InfoTip } from "@/components/InfoTip";
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
      <div className="rounded-2xl border border-slate-800 bg-slate-900/55 p-8 text-center space-y-4 max-w-xl mx-auto">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
          <Lock className="h-6 w-6" />
        </div>
        <h2 className="text-lg font-bold text-white">Seu Relatório de Imposto de Renda é Privado</h2>
        <p className="text-xs text-slate-300 leading-relaxed">
          Para proteger sua privacidade financeira, apenas a sua carteira — após clicar em{" "}
          <strong>Assinar Login Grátis</strong> — consegue visualizar os seus valores e baixar o
          seu arquivo CSV de Imposto de Renda. Nenhum outro membro do grupo tem acesso ao seu
          relatório.
        </p>
        <button
          type="button"
          onClick={onRequestSignIn}
          className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-5 py-2.5 text-xs font-semibold text-slate-950 hover:bg-emerald-400 transition"
        >
          <KeyRound className="h-4 w-4" />
          Conectar e Assinar Login Grátis
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/55 p-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-white font-semibold">
            <FileSpreadsheet className="h-5 w-5 text-emerald-400" />
            <h2>Meu Relatório para Imposto de Renda (IRPF)</h2>
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Histórico calculado automaticamente pelo seu preço médio de entrada — visível apenas para
            você.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void handleExportMyCsv()}
          disabled={downloading || !summary}
          className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 px-4 py-2.5 text-xs font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-50 transition"
        >
          <Download className="h-3.5 w-3.5" />
          {downloading ? "Gerando arquivo..." : "Baixar Planilha CSV (IRPF)"}
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
            <div className="rounded-2xl border border-slate-800 bg-slate-900/55 p-5">
              <span className="inline-flex items-center gap-1.5 text-xs text-slate-400">
                Quanto Você Já Investiu (Custo de Aquisição)
                <InfoTip text="É o valor usado na ficha 'Bens e Direitos' do IRPF em 31/12 (convertido para Reais pelo dólar da data de cada aporte, nunca pelo valor de mercado)." />
              </span>
              <p className="mt-2 text-xl font-bold text-white tabular-nums">
                {formatUsd(summary.totalAcquisitionCostUsd)}
              </p>
              <p className="mt-1 text-xs text-slate-400 tabular-nums">
                {formatShares(summary.endingSharesBalance)} cotas em carteira hoje
              </p>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900/55 p-5">
              <span className="inline-flex items-center gap-1.5 text-xs text-slate-400">
                Quanto Vale Hoje (Referência de Mercado)
                <InfoTip text="Valor atual das suas cotas pelo NAV de hoje. Serve apenas para acompanhamento; você não paga imposto sobre valorização não sacada." />
              </span>
              <p className="mt-2 text-xl font-bold text-white tabular-nums">
                {formatUsd(summary.currentMarketValueUsd)}
              </p>
              <p className="mt-1 text-xs text-slate-400 tabular-nums">
                Seu preço médio: US$ {summary.member.avgCostPerShareUsd.toFixed(4)} / cota
              </p>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900/55 p-5">
              <span className="inline-flex items-center gap-1.5 text-xs text-slate-400">
                Lucro / Prejuízo Realizado (Saque/Resgate)
                <InfoTip text="Apurado apenas quando você resgata cotas. É a diferença entre o valor recebido no resgate e o custo médio das cotas baixadas." />
              </span>
              <p
                className={`mt-2 text-xl font-bold tabular-nums ${
                  summary.totalRealizedGainUsd >= 0 ? "text-emerald-400" : "text-rose-400"
                }`}
              >
                {formatUsd(summary.totalRealizedGainUsd)}
              </p>
              <p className="mt-1 text-xs text-slate-400">
                Calculado apenas quando você resgata cotas
              </p>
            </div>
          </div>

          {/* Guia explicativo simples para IRPF */}
          <div className="rounded-2xl border border-slate-800/90 bg-slate-950/60 p-5 space-y-2 text-xs text-slate-300 leading-relaxed">
            <div className="flex items-center gap-2 font-semibold text-white">
              <HelpCircle className="h-4 w-4 text-emerald-400" />
              <span>Como usar este relatório na declaração anual (IRPF)</span>
            </div>
            <ul className="space-y-1 text-slate-400 list-disc list-inside">
              <li>
                <strong>Ficha Bens e Direitos (31/12):</strong> declare pelo{" "}
                <strong>Custo de Aquisição</strong> convertido em Reais na data de cada aporte (não
                pelo valor de mercado).
              </li>
              <li>
                <strong>Resgates / Lucro:</strong> o ganho de capital só é apurado quando você faz um
                resgate, já calculado automaticamente na coluna <em>Ganho Realizado</em>.
              </li>
              <li>
                <strong>Dica:</strong> baixe o <strong>CSV</strong> acima e envie para seu contador
                conferir o enquadramento vigente (Lei 14.754 / IN RFB para ativos no exterior).
              </li>
            </ul>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/55 p-6 overflow-x-auto">
            {summary.entries.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400">
                Você ainda não possui aportes ou resgates registrados nesta carteira.
              </div>
            ) : (
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-800 text-[11px] uppercase tracking-wide text-slate-400">
                    <th className="pb-3">Data</th>
                    <th className="pb-3">Operação</th>
                    <th className="pb-3 text-right">Valor (USD)</th>
                    <th className="pb-3 text-right">Cotas</th>
                    <th className="pb-3 text-right">Preço Médio Após</th>
                    <th className="pb-3 text-right">Custo Baixado</th>
                    <th className="pb-3 text-right">Ganho Realizado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {summary.entries.map((row, idx) => (
                    <tr key={idx} className="hover:bg-slate-800/25 transition">
                      <td className="py-3 text-xs text-slate-400 whitespace-nowrap">
                        {new Date(row.dateIso).toLocaleDateString("pt-BR")}
                      </td>
                      <td className="py-3 text-xs">
                        <span
                          className={`rounded-md px-2 py-0.5 font-semibold ${
                            row.operationType === "DEPOSIT"
                              ? "bg-emerald-500/15 text-emerald-300"
                              : "bg-amber-500/15 text-amber-300"
                          }`}
                        >
                          {row.operationType === "DEPOSIT" ? "Aporte" : "Resgate"}
                        </span>
                      </td>
                      <td className="py-3 text-right font-mono text-xs tabular-nums">
                        {formatUsd(row.amountUsd)}
                      </td>
                      <td className="py-3 text-right font-mono text-xs tabular-nums">
                        {formatShares(row.sharesDelta)}
                      </td>
                      <td className="py-3 text-right font-mono text-xs text-slate-300 tabular-nums">
                        US$ {row.avgCostPerShareAfterUsd.toFixed(4)}
                      </td>
                      <td className="py-3 text-right font-mono text-xs text-slate-300 tabular-nums">
                        {formatUsd(row.costBasisDisposedUsd)}
                      </td>
                      <td
                        className={`py-3 text-right font-mono text-xs font-semibold tabular-nums ${
                          row.realizedCapitalGainUsd >= 0 ? "text-emerald-400" : "text-rose-400"
                        }`}
                      >
                        {formatUsd(row.realizedCapitalGainUsd)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}
