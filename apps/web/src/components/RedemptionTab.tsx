"use client";

import {
  P2P_ME_CONFIG,
  type EvmAddress,
  type MemberPosition,
  type RedemptionPlan,
} from "@pertufundos/shared";
import { ArrowUpRight, Calculator, ExternalLink, Info, WalletCards } from "lucide-react";
import { useState, type FormEvent } from "react";
import { InfoTip } from "@/components/InfoTip";
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

  const parsedShares = Number(sharesInput) || 0;
  const liveEstimateUsd = parsedShares > 0 && navPerShareUsd > 0 ? parsedShares * navPerShareUsd : 0;

  function applyPercent(pct: number) {
    if (!activeMember || activeMember.sharesBalance <= 0) return;
    const raw = activeMember.sharesBalance * pct;
    const formatted = pct === 1 ? String(activeMember.sharesBalance) : raw.toFixed(4);
    setSharesInput(formatted);
    setPlan(null);
  }

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
        `Pedido de resgate aberto! Assim que o grupo aprovar e executar na aba Votações & Trades, cerca de US$ ${res.plan.grossPayoutUsd.toFixed(2)} chegarão na sua carteira na rede Base.`,
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
        className="lg:col-span-7 rounded-2xl border border-slate-800 bg-slate-900/55 p-6 space-y-5"
      >
        <div>
          <div className="flex items-center gap-2 text-white font-semibold">
            <WalletCards className="h-5 w-5 text-emerald-400" />
            <h2>Solicitar Resgate das Suas Cotas (Saída para seu Pix)</h2>
          </div>
          <p className="mt-1 text-xs text-slate-400 leading-relaxed">
            Você escolhe quantas cotas quer sacar. O valor correspondente em dólar (USDC) sai do
            cofre direto para a <strong>sua carteira na rede Base</strong>, pronto para virar Pix.
          </p>
        </div>

        {!activeMember && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 text-xs text-amber-200 flex items-start gap-2">
            <Info className="h-4 w-4 shrink-0 mt-0.5 text-amber-300" />
            <span>
              Conecte sua carteira e clique em <strong>Assinar Login</strong> no topo da página para
              ver suas cotas disponíveis e solicitar um resgate.
            </span>
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-3.5 text-xs text-rose-200">
            {error}
          </div>
        )}
        {successMsg && (
          <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-xs text-emerald-200 flex flex-wrap items-center justify-between gap-2">
            <span>{successMsg}</span>
            <button
              type="button"
              onClick={onNavigateToGovernance}
              className="rounded-lg bg-emerald-500/20 border border-emerald-500/40 px-3 py-1.5 font-semibold text-emerald-200 hover:bg-emerald-500/30 whitespace-nowrap transition"
            >
              Acompanhar em Votações &rarr;
            </button>
          </div>
        )}

        <div className="rounded-xl bg-slate-950/70 border border-slate-800 p-4 text-xs flex flex-wrap justify-between gap-3">
          <div>
            <span className="text-slate-400">Suas Cotas Disponíveis: </span>
            <strong className="text-white font-mono tabular-nums">
              {activeMember ? formatShares(activeMember.sharesBalance) : "0,0000"}
            </strong>
          </div>
          <div>
            <span className="text-slate-400">Preço Atual da Cota (NAV): </span>
            <strong className="text-emerald-400 font-mono tabular-nums">
              US$ {navPerShareUsd.toFixed(4)}
            </strong>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex flex-wrap justify-between items-center gap-2">
            <label className="text-xs font-medium text-slate-300">
              Quantas cotas deseja sacar?
            </label>
            {activeMember && activeMember.sharesBalance > 0 && (
              <div className="flex items-center gap-1.5">
                {[
                  { label: "25%", pct: 0.25 },
                  { label: "50%", pct: 0.5 },
                  { label: "75%", pct: 0.75 },
                  { label: "Tudo", pct: 1 },
                ].map((opt) => (
                  <button
                    key={opt.label}
                    type="button"
                    onClick={() => applyPercent(opt.pct)}
                    className="rounded-md border border-slate-700 bg-slate-800 px-2 py-0.5 text-[11px] font-medium text-slate-200 hover:border-emerald-500/50 hover:text-emerald-300 transition"
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <input
            type="number"
            step="0.0001"
            min="0.0001"
            required
            value={sharesInput}
            onChange={(e) => {
              setSharesInput(e.target.value);
              setPlan(null);
            }}
            className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white focus:border-emerald-500 focus:outline-none"
          />
          <p className="text-[11px] text-slate-400 tabular-nums">
            Estimativa bruta pelo NAV atual:{" "}
            <strong className="text-emerald-300">{formatUsd(liveEstimateUsd)}</strong> (clique em
            &ldquo;Simular Plano&rdquo; abaixo para ver os detalhes exatos)
          </p>
        </div>

        <div>
          <label className="inline-flex items-center gap-1 text-xs font-medium text-slate-300 mb-1">
            Carteira de destino na rede Base (opcional)
            <InfoTip text="Se deixar em branco, o USDC vai direto para o seu próprio endereço conectado (na rede Base)." />
          </label>
          <input
            type="text"
            placeholder={activeMember?.baseReceiveAddress ?? "Padrão: sua própria carteira (0x...)"}
            value={customBaseAddress}
            onChange={(e) => setCustomBaseAddress(e.target.value)}
            className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm font-mono text-white focus:border-emerald-500 focus:outline-none"
          />
        </div>

        {plan && (
          <div className="rounded-xl border border-emerald-500/30 bg-slate-950 p-4 text-xs space-y-2.5">
            <div className="font-semibold text-white">Resumo da Simulação do Seu Resgate</div>
            <div className="flex justify-between">
              <span className="text-slate-400">Valor Bruto a Receber na Base (USDC):</span>
              <strong className="text-emerald-400 text-sm tabular-nums">
                {formatUsd(plan.grossPayoutUsd)}
              </strong>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Custo Original das Cotas Baixado (para IR):</span>
              <span className="text-slate-200 tabular-nums">{formatUsd(plan.costBasisUsd)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Lucro/Prejuízo Realizado Estimado:</span>
              <span
                className={`font-semibold tabular-nums ${
                  plan.estimatedCapitalGainUsd >= 0 ? "text-emerald-400" : "text-rose-400"
                }`}
              >
                {formatUsd(plan.estimatedCapitalGainUsd)}
              </span>
            </div>
            {plan.liquidationLegs.length > 0 ? (
              <div className="pt-2.5 border-t border-slate-800">
                <p className="text-amber-300 font-medium mb-1">
                  O caixa livre em USDC não cobre todo o saque — o sistema venderá uma fração
                  proporcional dos ativos sem distorcer a carteira dos amigos:
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
            ) : (
              <div className="pt-2 border-t border-slate-800 text-emerald-300/90">
                Há caixa livre suficiente em USDC no cofre — não será necessário vender nenhuma ação!
              </div>
            )}
          </div>
        )}

        <div className="flex flex-wrap gap-3 pt-1">
          <button
            type="button"
            disabled={busy || !activeMember}
            onClick={handlePreview}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-xs font-semibold text-white hover:bg-slate-700 disabled:opacity-50 transition"
          >
            <Calculator className="h-4 w-4" />
            1. Simular Plano de Resgate
          </button>

          <button
            type="submit"
            disabled={busy || !activeMember}
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 px-5 py-2.5 text-xs font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-50 transition"
          >
            <ArrowUpRight className="h-4 w-4" />
            2. Enviar Pedido para o Grupo Aprovar
          </button>
        </div>
      </form>

      {/* Guia de Saque Individual P2P.me -> Pix */}
      <div className="lg:col-span-5 rounded-2xl border border-emerald-500/25 bg-emerald-950/15 p-6 space-y-5 h-fit">
        <div className="space-y-1.5">
          <h3 className="text-base font-semibold text-white">
            Como o dinheiro cai no seu Pix (sem envolver CPF de amigo)
          </h3>
          <p className="text-xs text-slate-300 leading-relaxed">
            Cada membro converte seus próprios dólares para Reais direto na sua conta bancária.
            Nenhum amigo precisa receber ou transferir dinheiro para você.
          </p>
        </div>

        <div className="space-y-2.5 text-xs">
          <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
            <div className="font-semibold text-emerald-300">1. Peça o resgate aqui</div>
            <p className="text-slate-400 mt-0.5">
              Simule e envie seu pedido para a fila de aprovação do grupo.
            </p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
            <div className="font-semibold text-emerald-300">2. Grupo assina na Safe</div>
            <p className="text-slate-400 mt-0.5">
              Os membros aprovam na aba Votações &amp; Trades e executam a transferência.
            </p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
            <div className="font-semibold text-emerald-300">3. Receba USDC na rede Base</div>
            <p className="text-slate-400 mt-0.5">
              O USDC chega automaticamente na sua carteira pessoal na rede Base.
            </p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
            <div className="font-semibold text-emerald-300">4. Converta em Pix no P2P.me</div>
            <p className="text-slate-400 mt-0.5">
              Abra o P2P.me com a mesma carteira e saque para sua chave Pix.
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-slate-800/80 bg-slate-950/50 p-3.5 space-y-1.5">
          <p className="text-[11px] font-semibold text-slate-200">Boas práticas no P2P.me:</p>
          <ul className="space-y-1 text-[11px] text-slate-400 list-disc list-inside">
            {P2P_ME_CONFIG.notes.map((note, idx) => (
              <li key={idx} className="leading-relaxed">
                {note}
              </li>
            ))}
          </ul>
        </div>

        <div className="pt-1 flex flex-col gap-2">
          <a
            href={P2P_ME_CONFIG.appUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-xs font-semibold text-slate-950 hover:bg-emerald-400 transition"
          >
            Abrir P2P.me (Rede Base &rarr; Pix)
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
          <a
            href={P2P_ME_CONFIG.docsUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-center gap-1 text-xs text-slate-400 hover:text-emerald-300"
          >
            Ver limites iniciais e Reputation Points (RP)
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>
    </div>
  );
}
