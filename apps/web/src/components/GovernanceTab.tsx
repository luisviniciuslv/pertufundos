"use client";

import {
  buildSafeQueueUrl,
  CURATED_INVESTABLE_TOKENS,
  type EvmAddress,
  type MarketSessionStatus,
  type PreparedSafeBatch,
  type Proposal,
} from "@pertufundos/shared";
import { ChevronDown, CheckCircle2, ExternalLink, Play, Sparkles, ThumbsDown, ThumbsUp } from "lucide-react";
import { useState, type FormEvent } from "react";
import type { Eip1193Provider } from "@safe-global/protocol-kit";
import { useAccount } from "wagmi";
import { AssetPickerModal } from "@/components/AssetPickerModal";
import { fundApi } from "@/lib/api-client";
import { shortenAddress } from "@/lib/formatters";
import { safeMultisigClient } from "@/lib/safe-multisig.client";

interface GovernanceTabProps {
  safeAddress: EvmAddress;
  primaryChainId: number;
  activeWallet: EvmAddress | undefined;
  marketSession: MarketSessionStatus;
  proposals: readonly Proposal[];
  onRefresh: () => Promise<void>;
}

export function GovernanceTab({
  safeAddress,
  primaryChainId,
  activeWallet,
  marketSession,
  proposals,
  onRefresh,
}: GovernanceTabProps) {
  const { connector } = useAccount();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tradeType, setTradeType] = useState<"BUY_ASSET" | "SELL_ASSET">("BUY_ASSET");
  const [selectedAsset, setSelectedAsset] = useState<{
    symbol: string;
    name: string;
    address: EvmAddress;
    category: "ONDO_STOCK" | "CRYPTO" | "STABLECOIN";
  }>({
    symbol: CURATED_INVESTABLE_TOKENS[0]!.symbol,
    name: CURATED_INVESTABLE_TOKENS[0]!.name,
    address: CURATED_INVESTABLE_TOKENS[0]!.address,
    category: CURATED_INVESTABLE_TOKENS[0]!.category,
  });
  const [pickerOpen, setPickerOpen] = useState(false);
  const [amount, setAmount] = useState("500");
  const [maxSlippage, setMaxSlippage] = useState("0.5");
  const [forceOffHours, setForceOffHours] = useState(false);

  const [preparedBatches, setPreparedBatches] = useState<Record<string, PreparedSafeBatch>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function getBrowserProvider(): Promise<Eip1193Provider | undefined> {
    if (!connector) return undefined;
    return (await connector.getProvider()) as Eip1193Provider;
  }

  async function handleCreateProposal(e: FormEvent) {
    e.preventDefault();
    if (!activeWallet) {
      setError("Conecte sua carteira e assine o login gratuito como owner da Safe.");
      return;
    }
    setBusyId("create");
    setError(null);
    setMessage(null);
    try {
      await fundApi.createTradeProposal({
        title,
        description,
        type: tradeType,
        assetSymbol: selectedAsset.symbol,
        assetAddress: selectedAsset.address,
        amount: Number(amount),
        maxSlippagePercent: Number(maxSlippage),
        createdByAddress: activeWallet,
      });
      setTitle("");
      setDescription("");
      setMessage("Proposta criada e voto inicial computado!");
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao criar proposta.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleVote(proposalId: string, decision: "APPROVE" | "REJECT") {
    if (!activeWallet) {
      setError("Conecte sua carteira e assine o login gratuito no topo da tela para votar.");
      return;
    }
    setBusyId(proposalId);
    setError(null);
    try {
      await fundApi.castVote(proposalId, { voterAddress: activeWallet, decision });
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao registrar voto.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleGenerateOkxBatch(proposalId: string) {
    setBusyId(proposalId);
    setError(null);
    setMessage(null);
    try {
      const { batch } = await fundApi.prepareSafeBatch(proposalId, forceOffHours);
      setPreparedBatches((prev) => ({ ...prev, [proposalId]: batch }));
      setMessage(
        `Payload OKX DEX gerado com sucesso (${batch.transactions.length} transações atômicas prontas para a Safe).`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao gerar cotação OKX DEX.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleProposeToSafeQueue(proposal: Proposal) {
    if (!activeWallet) return;
    const batch = preparedBatches[proposal.id];
    if (!batch) {
      setError("Gere o payload OKX DEX primeiro.");
      return;
    }
    setBusyId(proposal.id);
    setError(null);
    try {
      const provider = await getBrowserProvider();
      const { safeTxHash, simulated } = await safeMultisigClient.proposeBatchToSafe({
        provider,
        signerAddress: activeWallet,
        batch,
      });
      await fundApi.linkSafeTx(proposal.id, {
        safeTxHash,
        proposerAddress: activeWallet,
      });
      setMessage(
        simulated
          ? `[Modo Demo] Transação enviada para fila simulada da Safe (${shortenAddress(safeTxHash)}).`
          : `Transação enviada para a fila oficial da Safe (${shortenAddress(safeTxHash)})!`,
      );
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao propor na Safe.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleExecuteOnSafe(proposal: Proposal) {
    if (!activeWallet) return;
    setBusyId(proposal.id);
    setError(null);
    try {
      const provider = await getBrowserProvider();
      const { executionTxHash } = await safeMultisigClient.executeSafeTransaction({
        provider,
        signerAddress: activeWallet,
        safeAddress,
        chainId: primaryChainId,
        safeTxHash:
          proposal.safeTxHash ??
          "0xcccc000000000000000000000000000000000000000000000000000000000001",
      });
      await fundApi.confirmExecution(proposal.id, {
        executionTxHash,
        executorAddress: activeWallet,
      });
      setMessage(`Execução confirmada! Hash: ${shortenAddress(executionTxHash)}.`);
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao executar transação.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      {!marketSession.isOpen && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-amber-200 flex flex-wrap items-center justify-between gap-3">
          <span>{marketSession.warningMessage}</span>
          <label className="inline-flex items-center gap-2 cursor-pointer font-medium">
            <input
              type="checkbox"
              checked={forceOffHours}
              onChange={(e) => setForceOffHours(e.target.checked)}
              className="rounded border-amber-500 bg-slate-900"
            />
            Permitir cotação fora do pregão (modo teste/urgência)
          </label>
        </div>
      )}

      {message && (
        <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm text-emerald-200">
          {message}
        </div>
      )}
      {error && (
        <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-4 text-sm text-rose-200">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Formulário de Nova Proposta */}
        <form
          onSubmit={handleCreateProposal}
          className="lg:col-span-4 rounded-2xl border border-slate-800 bg-slate-900/50 p-6 space-y-4 h-fit"
        >
          <h2 className="text-base font-semibold text-white">Nova Proposta de Trade (Off-chain)</h2>
          <p className="text-xs text-slate-400">
            O grupo vota primeiro sem gastar gás; o calldata da OKX DEX é gerado apenas na hora da
            assinatura na Safe para nunca expirar.
          </p>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setTradeType("BUY_ASSET")}
              className={`rounded-lg py-2 text-xs font-semibold border transition ${
                tradeType === "BUY_ASSET"
                  ? "border-emerald-500 bg-emerald-500/20 text-emerald-300"
                  : "border-slate-700 bg-slate-950 text-slate-400"
              }`}
            >
              Comprar Ativo
            </button>
            <button
              type="button"
              onClick={() => setTradeType("SELL_ASSET")}
              className={`rounded-lg py-2 text-xs font-semibold border transition ${
                tradeType === "SELL_ASSET"
                  ? "border-amber-500 bg-amber-500/20 text-amber-300"
                  : "border-slate-700 bg-slate-950 text-slate-400"
              }`}
            >
              Vender Ativo
            </button>
          </div>

          <div>
            <label className="block text-xs text-slate-300 mb-1">
              Ativo (Ações Ondo, Cripto 24/7 ou Contrato 0x...)
            </label>
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-left flex items-center justify-between hover:border-emerald-500/60 transition"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-white">{selectedAsset.symbol}</span>
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                      selectedAsset.category === "ONDO_STOCK"
                        ? "bg-sky-500/15 text-sky-300"
                        : "bg-amber-500/15 text-amber-300"
                    }`}
                  >
                    {selectedAsset.category === "ONDO_STOCK" ? "AÇÃO / ETF" : "CRIPTO 24/7"}
                  </span>
                </div>
                <div className="text-xs text-slate-400 truncate max-w-[220px]">
                  {selectedAsset.name}
                </div>
              </div>
              <ChevronDown className="h-4 w-4 text-slate-400" />
            </button>
          </div>

          <div>
            <label className="block text-xs text-slate-300 mb-1">
              {tradeType === "BUY_ASSET"
                ? "Valor em USDC a Investir"
                : `Qtd. de ${selectedAsset.symbol} a Vender`}
            </label>
            <input
              type="number"
              step="0.0001"
              min="0.0001"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2 text-sm text-white"
            />
          </div>

          <div>
            <label className="block text-xs text-slate-300 mb-1">Título da Proposta</label>
            <input
              type="text"
              required
              placeholder={`Ex: Comprar US$ ${amount} de ${selectedAsset.symbol}`}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2 text-sm text-white"
            />
          </div>

          <div>
            <label className="block text-xs text-slate-300 mb-1">Tese / Motivo (opcional)</label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Resumo para o grupo votar..."
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2 text-sm text-white"
            />
          </div>

          <div>
            <label className="block text-xs text-slate-300 mb-1">Slippage Máximo (%)</label>
            <input
              type="number"
              step="0.1"
              min="0.1"
              max="1.0"
              value={maxSlippage}
              onChange={(e) => setMaxSlippage(e.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2 text-sm text-white"
            />
          </div>

          <button
            type="submit"
            disabled={busyId === "create"}
            className="w-full rounded-xl bg-emerald-500 py-2.5 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-50 transition"
          >
            Abrir Votação do Grupo
          </button>
        </form>

        {/* Lista de Propostas e Execução Multisig */}
        <div className="lg:col-span-8 space-y-4">
          {proposals.map((proposal) => {
            const batch = preparedBatches[proposal.id];
            const progressPct = Math.min(
              100,
              Math.round((proposal.approvalsCount / proposal.requiredApprovals) * 100),
            );

            return (
              <div
                key={proposal.id}
                className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5 space-y-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="rounded-md bg-slate-800 px-2 py-0.5 text-xs font-semibold text-slate-200">
                        {proposal.type === "BUY_ASSET"
                          ? `COMPRA ${proposal.assetSymbol}`
                          : proposal.type === "SELL_ASSET"
                            ? `VENDA ${proposal.assetSymbol}`
                            : "RESGATE COTAS"}
                      </span>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          proposal.status === "EXECUTED"
                            ? "bg-emerald-500/20 text-emerald-300"
                            : proposal.status === "APPROVED" || proposal.status === "PROPOSED_ON_SAFE"
                              ? "bg-sky-500/20 text-sky-300"
                              : "bg-amber-500/20 text-amber-300"
                        }`}
                      >
                        {proposal.status}
                      </span>
                    </div>
                    <h3 className="mt-2 text-base font-semibold text-white">{proposal.title}</h3>
                    {proposal.description && (
                      <p className="mt-1 text-xs text-slate-400">{proposal.description}</p>
                    )}
                  </div>

                  <div className="text-right text-xs text-slate-400">
                    <div>Por {proposal.createdByNickname}</div>
                    <div className="font-semibold text-slate-200 mt-0.5">
                      Quórum: {proposal.approvalsCount}/{proposal.requiredApprovals} assinaturas
                    </div>
                  </div>
                </div>

                {/* Barra de Progresso de Votos */}
                <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 transition-all"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>

                {/* Chips de Votos dos Amigos */}
                <div className="flex flex-wrap gap-2">
                  {proposal.votes.map((v) => (
                    <span
                      key={v.id}
                      className={`rounded-lg border px-2.5 py-1 text-xs ${
                        v.decision === "APPROVE"
                          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                          : "border-rose-500/30 bg-rose-500/10 text-rose-300"
                      }`}
                    >
                      {v.decision === "APPROVE" ? "✓" : "✕"} {v.voterNickname}
                    </span>
                  ))}
                </div>

                {/* Payload OKX DEX Gerado */}
                {batch && (
                  <div className="rounded-xl border border-sky-500/30 bg-slate-950/90 p-4 text-xs space-y-2">
                    <div className="flex items-center justify-between text-sky-300 font-semibold">
                      <span>Batch MultiSend Gerado ({batch.transactions.length} etapas)</span>
                      {batch.quoteSummary && (
                        <span>
                          Price Impact: {batch.quoteSummary.priceImpactPercent.toFixed(2)}% •
                          Esperado: {batch.quoteSummary.expectedToAmount}{" "}
                          {batch.quoteSummary.toSymbol}
                        </span>
                      )}
                    </div>
                    <ul className="space-y-1 text-slate-300 list-disc list-inside">
                      {batch.transactions.map((tx, idx) => (
                        <li key={idx}>
                          {tx.description} (<code className="text-slate-400">{shortenAddress(tx.to)}</code>)
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Botões de Ação conforme estágio da Proposta */}
                {proposal.status !== "EXECUTED" && (
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    {(proposal.status === "OPEN" || proposal.status === "APPROVED") && (
                      <>
                        <button
                          onClick={() => handleVote(proposal.id, "APPROVE")}
                          disabled={busyId === proposal.id}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-3 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/25"
                        >
                          <ThumbsUp className="h-3.5 w-3.5" />
                          Aprovar
                        </button>
                        <button
                          onClick={() => handleVote(proposal.id, "REJECT")}
                          disabled={busyId === proposal.id}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-300 hover:bg-rose-500/20"
                        >
                          <ThumbsDown className="h-3.5 w-3.5" />
                          Rejeitar
                        </button>
                      </>
                    )}

                    {(proposal.status === "APPROVED" || proposal.status === "PROPOSED_ON_SAFE") && (
                      <button
                        onClick={() => handleGenerateOkxBatch(proposal.id)}
                        disabled={busyId === proposal.id}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-sky-500 px-3.5 py-1.5 text-xs font-semibold text-slate-950 hover:bg-sky-400"
                      >
                        <Sparkles className="h-3.5 w-3.5" />
                        1. Gerar Calldata OKX DEX
                      </button>
                    )}

                    {batch && proposal.status === "APPROVED" && (
                      <button
                        onClick={() => handleProposeToSafeQueue(proposal)}
                        disabled={busyId === proposal.id}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3.5 py-1.5 text-xs font-semibold text-slate-950 hover:bg-emerald-400"
                      >
                        <Play className="h-3.5 w-3.5" />
                        2. Propor na Fila da Safe
                      </button>
                    )}

                    {proposal.status === "PROPOSED_ON_SAFE" && (
                      <>
                        <button
                          onClick={() => handleExecuteOnSafe(proposal)}
                          disabled={busyId === proposal.id}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3.5 py-1.5 text-xs font-semibold text-slate-950 hover:bg-emerald-400"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Executar / Confirmar Liquidação
                        </button>
                        <a
                          href={buildSafeQueueUrl(safeAddress, primaryChainId)}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-slate-300 hover:text-emerald-400 ml-2"
                        >
                          Abrir Safe App Oficial
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <AssetPickerModal
        isOpen={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelectAsset={(asset) => setSelectedAsset(asset)}
      />
    </div>
  );
}
