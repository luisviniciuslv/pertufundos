"use client";

import {
  P2P_ME_CONFIG,
  type EvmAddress,
  type MemberPosition,
  type RedemptionPlan,
} from "@pertufundos/shared";
import { ArrowUpRight, Calculator, ExternalLink, WalletCards } from "lucide-react";
import { useState, type FormEvent } from "react";
import { fundApi } from "@/lib/api-client";
import { formatShares, formatUsd } from "@/lib/formatters";

interface RedemptionTabProps {
  activeMember: MemberPosition | undefined;
  navPerShareUsd: number;
  onRefresh: () => Promise<void>;
  onNavigateToGovernance: () => void;
}

export function RedemptionTab({
  activeMember,
  navPerShareUsd,
  onRefresh,
  onNavigateToGovernance,
}: RedemptionTabProps) {
  const [sharesInput, setSharesInput] = useState("100");
  const [customBaseAddress, setCustomBaseAddress] = useState("");
  const [plan, setPlan] = useState<RedemptionPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  async function handlePreview() {
    if (!activeMember) return;
    setBusy(true);
    setError(null);
    try {
      const { plan: simulated } = await fundApi.previewRedemption({
        memberWallet: activeMember.walletAddress,
        sharesToRedeem: Number(sharesInput),
        receiveBaseAddress: (customBaseAddress.trim() || undefined) as EvmAddress | undefined,
        maxSlippagePercent: 0.5,
      });
      setPlan(simulated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao simular resgate.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSubmitRedemption(e: FormEvent) {
    e.preventDefault();
    if (!activeMember) return;
    setBusy(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await fundApi.createRedemptionProposal({
        memberWallet: activeMember.walletAddress,
        sharesToRedeem: Number(sharesInput),
        receiveBaseAddress: (customBaseAddress.trim() || undefined) as EvmAddress | undefined,
        maxSlippagePercent: 0.5,
      });
      setPlan(res.plan);
      setSuccessMsg(
        `Pedido de resgate criado! Assim que o grupo aprovar na aba Governança, US$ ${res.plan.grossPayoutUsd.toFixed(2)} chegarão na sua carteira na rede Base.`,
      );
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao solicitar resgate.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
      <form
        onSubmit={handleSubmitRedemption}
        className="lg:col-span-7 rounded-2xl border border-slate-800 bg-slate-900/50 p-6 space-y-4"
      >
        <div className="flex items-center gap-2 text-white font-semibold">
          <WalletCards className="h-5 w-5 text-emerald-400" />
          <h2>Solicitar Resgate Individual (Saída para Rede Base)</h2>
        </div>

        {error && (
          <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-3.5 text-xs text-rose-200">
            {error}
          </div>
        )}
        {successMsg && (
          <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3.5 text-xs text-emerald-200 flex items-center justify-between gap-2">
            <span>{successMsg}</span>
            <button
              type="button"
              onClick={onNavigateToGovernance}
              className="underline font-semibold whitespace-nowrap"
            >
              Ir para Governança →
            </button>
          </div>
        )}

        <div className="rounded-xl bg-slate-950/70 border border-slate-800 p-4 text-xs flex flex-wrap justify-between gap-2">
          <div>
            <span className="text-slate-400">Suas Cotas Disponíveis: </span>
            <strong className="text-white font-mono">
              {activeMember ? formatShares(activeMember.sharesBalance) : "0,0000"}
            </strong>
          </div>
          <div>
            <span className="text-slate-400">NAV Vigente: </span>
            <strong className="text-emerald-400 font-mono">US$ {navPerShareUsd.toFixed(4)}</strong>
          </div>
        </div>

        <div>
          <div className="flex justify-between items-center mb-1">
            <label className="text-xs font-medium text-slate-300">
              Quantidade de Cotas a Resgatar
            </label>
            {activeMember && activeMember.sharesBalance > 0 && (
              <button
                type="button"
                onClick={() => setSharesInput(String(activeMember.sharesBalance))}
                className="text-xs text-emerald-400 hover:underline"
              >
                Usar Máximo ({formatShares(activeMember.sharesBalance)})
              </button>
            )}
          </div>
          <input
            type="number"
            step="0.0001"
            min="0.0001"
            required
            value={sharesInput}
            onChange={(e) => setSharesInput(e.target.value)}
            className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-300 mb-1">
            Carteira de Destino na Rede Base (opcional — padrão: sua própria carteira)
          </label>
          <input
            type="text"
            placeholder={activeMember?.baseReceiveAddress ?? "0x..."}
            value={customBaseAddress}
            onChange={(e) => setCustomBaseAddress(e.target.value)}
            className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm font-mono text-white"
          />
        </div>

        {plan && (
          <div className="rounded-xl border border-slate-700 bg-slate-950 p-4 text-xs space-y-2">
            <div className="flex justify-between">
              <span className="text-slate-400">Valor Bruto a Receber na Base (USDC):</span>
              <strong className="text-emerald-400 text-sm">{formatUsd(plan.grossPayoutUsd)}</strong>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Custo de Aquisição Baixado (IR):</span>
              <span className="text-slate-200">{formatUsd(plan.costBasisUsd)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Ganho/Perda de Capital Estimado:</span>
              <span
                className={
                  plan.estimatedCapitalGainUsd >= 0 ? "text-emerald-400" : "text-rose-400"
                }
              >
                {formatUsd(plan.estimatedCapitalGainUsd)}
              </span>
            </div>
            {plan.liquidationLegs.length > 0 && (
              <div className="pt-2 border-t border-slate-800">
                <p className="text-amber-300 font-medium mb-1">
                  Caixa livre insuficiente: o sistema montará venda proporcional automática via OKX
                  DEX:
                </p>
                <ul className="list-disc list-inside text-slate-300 space-y-0.5">
                  {plan.liquidationLegs.map((leg) => (
                    <li key={leg.symbol}>
                      Vender {leg.sellAmountTokens.toFixed(6)} {leg.symbol} (~
                      {formatUsd(leg.estimatedProceedsUsd)})
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <div className="flex flex-wrap gap-3 pt-1">
          <button
            type="button"
            disabled={busy || !activeMember}
            onClick={handlePreview}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-xs font-semibold text-white hover:bg-slate-700"
          >
            <Calculator className="h-4 w-4" />
            Simular Plano de Resgate
          </button>

          <button
            type="submit"
            disabled={busy || !activeMember}
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 px-5 py-2.5 text-xs font-semibold text-slate-950 hover:bg-emerald-400"
          >
            <ArrowUpRight className="h-4 w-4" />
            Criar Proposta de Resgate na Safe
          </button>
        </div>
      </form>

      {/* Guia de Saque Individual P2P.me -> Pix */}
      <div className="lg:col-span-5 rounded-2xl border border-emerald-500/25 bg-emerald-950/15 p-6 space-y-4 h-fit">
        <h3 className="text-base font-semibold text-white">
          Como Converter seu USDC (Base) para Pix no P2P.me
        </h3>
        <p className="text-xs text-slate-300 leading-relaxed">
          Cada participante saca diretamente da sua própria carteira Web3 na{" "}
          <strong>rede Base</strong> para o Pix do seu próprio CPF — nenhum amigo precisa passar
          dinheiro pela conta bancária pessoal pelo grupo!
        </p>

        <ol className="space-y-2.5 text-xs text-slate-300 list-decimal list-inside">
          {P2P_ME_CONFIG.notes.map((note, idx) => (
            <li key={idx} className="leading-relaxed">
              {note}
            </li>
          ))}
        </ol>

        <div className="pt-2 flex flex-col gap-2">
          <a
            href={P2P_ME_CONFIG.appUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-xs font-semibold text-slate-950 hover:bg-emerald-400 transition"
          >
            Abrir Aplicativo P2P.me (Rede Base → Pix)
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
          <a
            href={P2P_ME_CONFIG.docsUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-center gap-1 text-xs text-slate-400 hover:text-emerald-300"
          >
            Ler Documentação de Limites e Reputation Points (RP)
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>
    </div>
  );
}
