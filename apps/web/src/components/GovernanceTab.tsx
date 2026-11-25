"use client";

import {
  buildExplorerTxUrl,
  buildSafeQueueUrl,
  CURATED_INVESTABLE_TOKENS,
  type EvmAddress,
  type MarketSessionStatus,
  type PreparedSafeBatch,
  type Proposal,
  type ProposalStatus,
} from "@pertufundos/shared";
import {
  CheckCircle2,
  ChevronDown,
  Clock,
  ExternalLink,
  PenLine,
  Play,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  Vote,
} from "lucide-react";
import { useState, type FormEvent } from "react";
import type { Eip1193Provider } from "@safe-global/protocol-kit";
import { useAccount, usePublicClient, useSwitchChain } from "wagmi";
import { AssetPickerModal } from "@/components/AssetPickerModal";
import { InfoTip } from "@/components/InfoTip";
import { fundApi } from "@/lib/api-client";
import { shortenAddress } from "@/lib/formatters";
import { safeMultisigClient } from "@/lib/safe-multisig.client";
import { ensureWalletChain } from "@/lib/wallet-helpers";

interface GovernanceTabProps {
  safeAddress: EvmAddress;
  primaryChainId: number;
  activeWallet: EvmAddress | undefined;
  marketSession: MarketSessionStatus;
  proposals: readonly Proposal[];
  onRefresh: () => Promise<void>;
}

const STATUS_UI: Record<ProposalStatus, { label: string; badgeClass: string; step: number }> = {
  OPEN: {
    label: "Em votação",
    badgeClass: "bg-amber-500/20 text-amber-300 border border-amber-500/30",
    step: 1,
  },
  APPROVED: {
    label: "Aprovada pelo grupo",
    badgeClass: "bg-sky-500/20 text-sky-300 border border-sky-500/30",
    step: 2,
  },
  PROPOSED_ON_SAFE: {
    label: "Na fila da Safe",
    badgeClass: "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30",
    step: 3,
  },
  EXECUTED: {
    label: "Executada",
    badgeClass: "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30",
    step: 4,
  },
  REJECTED: {
    label: "Rejeitada",
    badgeClass: "bg-rose-500/20 text-rose-300 border border-rose-500/30",
    step: 0,
  },
  EXPIRED: {
    label: "Expirada",
    badgeClass: "bg-slate-700/60 text-slate-300 border border-slate-600",
    step: 0,
  },
};

export function GovernanceTab({
  safeAddress,
  primaryChainId,
  activeWallet,
  marketSession,
  proposals,
  onRefresh,
}: GovernanceTabProps) {
  const { connector, chainId } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const bscPublicClient = usePublicClient({ chainId: primaryChainId });

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

  async function ensurePrimaryChain(): Promise<void> {
    await ensureWalletChain({
      currentChainId: chainId,
      targetChainId: primaryChainId,
      targetChainLabel: "BNB Smart Chain",
      connector,
      switchChainAsync,
    });
  }

  async function handleCreateProposal(e: FormEvent) {
    e.preventDefault();
    if (!activeWallet) {
      setError("Conecte sua carteira e clique em 'Assinar Login' no topo da página para propor.");
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
      setMessage("Proposta aberta e seu voto inicial já foi contabilizado!");
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao criar proposta.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleVote(proposalId: string, decision: "APPROVE" | "REJECT") {
    if (!activeWallet) {
      setError("Conecte sua carteira e clique em 'Assinar Login' no topo da tela para votar.");
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
        `Cotação da OKX pronta (${batch.transactions.length} etapas). Agora clique em "2. Enviar para Fila da Safe".`,
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
      setError("Busque a cotação atualizada na OKX primeiro (Passo 1).");
      return;
    }
    setBusyId(proposal.id);
    setError(null);
    setMessage(null);
    try {
      await ensurePrimaryChain();
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
          ? `[Modo Demo] Ordem enviada para a fila simulada da Safe (${shortenAddress(safeTxHash)}).`
          : `Ordem enviada para a fila oficial da Safe (${shortenAddress(safeTxHash)})! Os demais membros já podem assinar.`,
      );
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao propor na Safe.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleConfirmOnSafe(proposal: Proposal) {
    if (!activeWallet || !proposal.safeTxHash) return;
    setBusyId(proposal.id);
    setError(null);
    setMessage(null);
    try {
      await ensurePrimaryChain();
      const provider = await getBrowserProvider();
      const { simulated } = await safeMultisigClient.confirmSafeTransaction({
        provider,
        signerAddress: activeWallet,
        safeAddress,
        chainId: primaryChainId,
        safeTxHash: proposal.safeTxHash,
      });
      setMessage(
        simulated
          ? `[Modo Demo] Assinatura na Safe simulada para ${shortenAddress(proposal.safeTxHash)}.`
          : `Sua assinatura foi registrada na Safe (${shortenAddress(proposal.safeTxHash)})! Assim que atingir o quórum, basta clicar em Executar.`,
      );
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao assinar transação na Safe.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleExecuteOnSafe(proposal: Proposal) {
    if (!activeWallet) return;
    setBusyId(proposal.id);
    setError(null);
    setMessage(null);
    try {
      await ensurePrimaryChain();
      const provider = await getBrowserProvider();
      const { executionTxHash, simulated } = await safeMultisigClient.executeSafeTransaction({
        provider,
        signerAddress: activeWallet,
        safeAddress,
        chainId: primaryChainId,
        safeTxHash:
          proposal.safeTxHash ??
          "0xcccc000000000000000000000000000000000000000000000000000000000001",
      });
      if (!simulated && bscPublicClient) {
        setMessage("Ordem enviada para a BNB Chain. Aguardando confirmação da rede...");
        const receipt = await bscPublicClient.waitForTransactionReceipt({
          hash: executionTxHash as `0x${string}`,
          timeout: 120_000,
        });
        if (receipt.status !== "success") {
          throw new Error(
            `A execução na Safe falhou on-chain na BNB Chain (status: reverted). Confira em ${buildExplorerTxUrl(executionTxHash, primaryChainId)}`,
          );
        }
      }
      await fundApi.confirmExecution(proposal.id, {
        executionTxHash,
        executorAddress: activeWallet,
      });
      setMessage(`Ordem executada com sucesso na blockchain! Hash: ${shortenAddress(executionTxHash)}.`);
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao executar transação.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* Guia resumido do fluxo de decisão */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h2 className="text-sm font-semibold text-white flex items-center gap-2">
            <Vote className="h-4 w-4 text-emerald-400" />
            Como o grupo decide e executa uma compra ou venda
          </h2>
          <span className="text-[11px] text-slate-400">
            Votar é gratuito • Apenas a execução final gasta centavos de BNB
          </span>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-4 text-xs">
          <div className="rounded-xl bg-slate-950/70 border border-slate-800/80 px-3 py-2.5">
            <div className="font-semibold text-emerald-300">1. Sugerir &amp; Votar</div>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Um amigo cria a proposta e os membros votam de graça.
            </p>
          </div>
          <div className="rounded-xl bg-slate-950/70 border border-slate-800/80 px-3 py-2.5">
            <div className="font-semibold text-sky-300">2. Buscar Preço (OKX)</div>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Após aprovada, geramos a rota com o melhor preço na hora.
            </p>
          </div>
          <div className="rounded-xl bg-slate-950/70 border border-slate-800/80 px-3 py-2.5">
            <div className="font-semibold text-indigo-300">3. Assinar na Safe</div>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Os donos da Safe assinam na fila oficial do cofre.
            </p>
          </div>
          <div className="rounded-xl bg-slate-950/70 border border-slate-800/80 px-3 py-2.5">
            <div className="font-semibold text-white">4. Executar Ordem</div>
            <p className="text-[11px] text-slate-400 mt-0.5">
              O último assinante executa e o saldo do cofre já atualiza.
            </p>
          </div>
        </div>
      </div>

      {!marketSession.isOpen && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-amber-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-2 max-w-2xl">
            <Clock className="h-4 w-4 shrink-0 mt-0.5 text-amber-300" />
            <div>
              <p className="font-semibold text-amber-100">Bolsa dos EUA fechada agora</p>
              <p className="mt-0.5 text-amber-200/90">
                {marketSession.warningMessage} (Criptomoedas como BTCB, ETH e PAXG funcionam 24/7
                normalmente.)
              </p>
            </div>
          </div>
          <label className="inline-flex items-center gap-2 cursor-pointer font-medium bg-slate-950/50 border border-amber-500/30 rounded-lg px-3 py-1.5">
            <input
              type="checkbox"
              checked={forceOffHours}
              onChange={(e) => setForceOffHours(e.target.checked)}
              className="rounded border-amber-500 bg-slate-900"
            />
            Liberar cotação fora do horário (teste/urgência)
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
          className="lg:col-span-4 rounded-2xl border border-slate-800 bg-slate-900/55 p-6 space-y-4 h-fit"
        >
          <div>
            <h2 className="text-base font-semibold text-white">Sugerir Compra ou Venda</h2>
            <p className="mt-1 text-xs text-slate-400">
              Abra uma votação para o grupo decidir. O preço só é travado na hora de assinar na
              Safe.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setTradeType("BUY_ASSET")}
              className={`rounded-xl py-2.5 text-xs font-semibold border transition ${
                tradeType === "BUY_ASSET"
                  ? "border-emerald-500 bg-emerald-500/20 text-emerald-300"
                  : "border-slate-700 bg-slate-950 text-slate-400 hover:text-slate-200"
              }`}
            >
              Comprar Ativo
            </button>
            <button
              type="button"
              onClick={() => setTradeType("SELL_ASSET")}
              className={`rounded-xl py-2.5 text-xs font-semibold border transition ${
                tradeType === "SELL_ASSET"
                  ? "border-amber-500 bg-amber-500/20 text-amber-300"
                  : "border-slate-700 bg-slate-950 text-slate-400 hover:text-slate-200"
              }`}
            >
              Vender Ativo
            </button>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Qual ativo deseja {tradeType === "BUY_ASSET" ? "comprar" : "vender"}?
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
                    {selectedAsset.category === "ONDO_STOCK" ? "AÇÃO / ETF EUA" : "CRIPTO 24/7"}
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
            <label className="block text-xs font-medium text-slate-300 mb-1">
              {tradeType === "BUY_ASSET"
                ? "Quanto investir do caixa (em USDC)"
                : `Quantidade de ${selectedAsset.symbol} para vender`}
            </label>
            <input
              type="number"
              step="0.0001"
              min="0.0001"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white focus:border-emerald-500 focus:outline-none"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-medium text-slate-300">Título da Proposta</label>
              <button
                type="button"
                onClick={() =>
                  setTitle(
                    tradeType === "BUY_ASSET"
                      ? `Comprar US$ ${amount || "0"} de ${selectedAsset.symbol}`
                      : `Vender ${amount || "0"} ${selectedAsset.symbol}`,
                  )
                }
                className="text-[11px] text-emerald-400 hover:underline"
              >
                Preencher automático
              </button>
            </div>
            <input
              type="text"
              required
              placeholder={`Ex: Comprar US$ ${amount} de ${selectedAsset.symbol}`}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white focus:border-emerald-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Por que fazer essa operação? (opcional)
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Explique sua ideia para os outros amigos votarem..."
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="inline-flex items-center gap-1 text-xs font-medium text-slate-300">
                Tolerância de variação de preço (Slippage %)
                <InfoTip text="Diferença máxima aceita entre a cotação exibida e o preço final na blockchain. Se passar disso, a ordem é protegida e cancelada." />
              </label>
              <div className="flex gap-1">
                {["0.3", "0.5", "1.0"].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setMaxSlippage(preset)}
                    className={`rounded px-1.5 py-0.5 text-[10px] font-medium border ${
                      maxSlippage === preset
                        ? "border-emerald-500/50 bg-emerald-500/20 text-emerald-300"
                        : "border-slate-700 bg-slate-900 text-slate-400 hover:text-white"
                    }`}
                  >
                    {preset}%
                  </button>
                ))}
              </div>
            </div>
            <input
              type="number"
              step="0.1"
              min="0.1"
              max="1.0"
              value={maxSlippage}
              onChange={(e) => setMaxSlippage(e.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
            />
          </div>

          <button
            type="submit"
            disabled={busyId === "create"}
            className="w-full rounded-xl bg-emerald-500 py-2.5 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-50 transition"
          >
            {busyId === "create" ? "Abrindo votação..." : "Abrir Votação do Grupo"}
          </button>
        </form>

        {/* Lista de Propostas e Execução Multisig */}
        <div className="lg:col-span-8 space-y-4">
          {proposals.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-900/30 p-10 text-center space-y-2">
              <Vote className="h-7 w-7 text-slate-500 mx-auto" />
              <p className="text-sm font-semibold text-slate-200">
                Nenhuma proposta criada ainda
              </p>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                Use o formulário ao lado para sugerir a compra de uma ação americana (como{" "}
                <code>NVDAon</code> ou <code>QQQon</code>) ou criptomoeda para o grupo votar.
              </p>
            </div>
          ) : (
            proposals.map((proposal) => {
              const batch = preparedBatches[proposal.id];
              const statusMeta = STATUS_UI[proposal.status];
              const progressPct = Math.min(
                100,
                Math.round((proposal.approvalsCount / proposal.requiredApprovals) * 100),
              );
              const myVote = activeWallet
                ? proposal.votes.find(
                    (v) => v.voterAddress.toLowerCase() === activeWallet.toLowerCase(),
                  )
                : undefined;
              const isTerminal =
                proposal.status === "EXECUTED" ||
                proposal.status === "REJECTED" ||
                proposal.status === "EXPIRED";

              return (
                <div
                  key={proposal.id}
                  className="rounded-2xl border border-slate-800 bg-slate-900/55 p-5 space-y-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-md bg-slate-800 px-2 py-0.5 text-xs font-semibold text-slate-200">
                          {proposal.type === "BUY_ASSET"
                            ? `COMPRA • ${proposal.assetSymbol}`
                            : proposal.type === "SELL_ASSET"
                              ? `VENDA • ${proposal.assetSymbol}`
                              : "RESGATE DE COTAS"}
                        </span>
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusMeta.badgeClass}`}
                        >
                          {statusMeta.label}
                        </span>
                        {myVote && (
                          <span className="rounded-full bg-slate-800 px-2.5 py-0.5 text-[11px] text-slate-300">
                            Você votou: {myVote.decision === "APPROVE" ? "A favor" : "Contra"}
                          </span>
                        )}
                      </div>
                      <h3 className="mt-2 text-base font-semibold text-white">{proposal.title}</h3>
                      {proposal.description && (
                        <p className="mt-1 text-xs text-slate-400 leading-relaxed">
                          {proposal.description}
                        </p>
                      )}
                    </div>

                    <div className="text-right text-xs text-slate-400">
                      <div>Sugerido por {proposal.createdByNickname}</div>
                      <div className="font-semibold text-slate-200 mt-0.5 tabular-nums">
                        Votos a favor: {proposal.approvalsCount}/{proposal.requiredApprovals}
                      </div>
                    </div>
                  </div>

                  {/* Mini pipeline de estágio para propostas ativas */}
                  {statusMeta.step > 0 && (
                    <div className="grid grid-cols-4 gap-1.5 text-[10px]">
                      {[
                        { step: 1, label: "1. Votação" },
                        { step: 2, label: "2. Preço OKX" },
                        { step: 3, label: "3. Fila Safe" },
                        { step: 4, label: "4. Executada" },
                      ].map((stage) => {
                        const done = statusMeta.step >= stage.step;
                        return (
                          <div
                            key={stage.step}
                            className={`rounded-lg px-2 py-1 text-center font-medium border ${
                              done
                                ? "border-emerald-500/35 bg-emerald-500/10 text-emerald-300"
                                : "border-slate-800 bg-slate-950/60 text-slate-500"
                            }`}
                          >
                            {stage.label}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Barra de Progresso de Votos */}
                  <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 transition-all"
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>

                  {/* Chips de Votos dos Amigos */}
                  {proposal.votes.length > 0 && (
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
                  )}

                  {/* Payload OKX DEX Gerado */}
                  {batch && (
                    <div className="rounded-xl border border-sky-500/30 bg-slate-950/90 p-4 text-xs space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-sky-300 font-semibold">
                        <span>Ordem OKX Montada ({batch.transactions.length} etapas seguras)</span>
                        {batch.quoteSummary && (
                          <span className="tabular-nums">
                            Impacto no preço: {batch.quoteSummary.priceImpactPercent.toFixed(2)}% •
                            Recebe aprox.: {batch.quoteSummary.expectedToAmount}{" "}
                            {batch.quoteSummary.toSymbol}
                          </span>
                        )}
                      </div>
                      <ul className="space-y-1 text-slate-300 list-disc list-inside">
                        {batch.transactions.map((tx, idx) => (
                          <li key={idx}>
                            {tx.description} (
                            <code className="text-slate-400">{shortenAddress(tx.to)}</code>)
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Link de transação já executada */}
                  {proposal.status === "EXECUTED" && proposal.executionTxHash && (
                    <div className="flex items-center justify-between rounded-xl border border-emerald-500/25 bg-emerald-500/5 px-3.5 py-2 text-xs text-emerald-300">
                      <span>Liquidado na blockchain com sucesso</span>
                      <a
                        href={buildExplorerTxUrl(proposal.executionTxHash, primaryChainId)}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 font-mono underline hover:text-emerald-200"
                      >
                        Ver no BscScan ({shortenAddress(proposal.executionTxHash)})
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  )}

                  {/* Botões de Ação conforme estágio da Proposta */}
                  {!isTerminal && (
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      {(proposal.status === "OPEN" || proposal.status === "APPROVED") && (
                        <>
                          <button
                            type="button"
                            onClick={() => handleVote(proposal.id, "APPROVE")}
                            disabled={busyId === proposal.id}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-3 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/25 disabled:opacity-50 transition"
                          >
                            <ThumbsUp className="h-3.5 w-3.5" />
                            Aprovar (Grátis)
                          </button>
                          <button
                            type="button"
                            onClick={() => handleVote(proposal.id, "REJECT")}
                            disabled={busyId === proposal.id}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-300 hover:bg-rose-500/20 disabled:opacity-50 transition"
                          >
                            <ThumbsDown className="h-3.5 w-3.5" />
                            Rejeitar
                          </button>
                        </>
                      )}

                      {(proposal.status === "APPROVED" || proposal.status === "PROPOSED_ON_SAFE") && (
                        <button
                          type="button"
                          onClick={() => handleGenerateOkxBatch(proposal.id)}
                          disabled={busyId === proposal.id}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-sky-500 px-3.5 py-1.5 text-xs font-semibold text-slate-950 hover:bg-sky-400 disabled:opacity-50 transition"
                        >
                          <Sparkles className="h-3.5 w-3.5" />
                          1. Buscar Preço Atual (OKX)
                        </button>
                      )}

                      {batch && proposal.status === "APPROVED" && (
                        <button
                          type="button"
                          onClick={() => handleProposeToSafeQueue(proposal)}
                          disabled={busyId === proposal.id}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3.5 py-1.5 text-xs font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-50 transition"
                        >
                          <Play className="h-3.5 w-3.5" />
                          2. Enviar para Fila da Safe
                        </button>
                      )}

                      {proposal.status === "PROPOSED_ON_SAFE" && (
                        <>
                          {proposal.safeTxHash && (
                            <button
                              type="button"
                              onClick={() => handleConfirmOnSafe(proposal)}
                              disabled={busyId === proposal.id}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-3.5 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/25 disabled:opacity-50 transition"
                            >
                              <PenLine className="h-3.5 w-3.5" />
                              Assinar na Safe
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleExecuteOnSafe(proposal)}
                            disabled={busyId === proposal.id}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3.5 py-1.5 text-xs font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-50 transition"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Executar Ordem na Rede
                          </button>
                          <a
                            href={buildSafeQueueUrl(safeAddress, primaryChainId)}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-slate-300 hover:text-emerald-400 ml-2"
                          >
                            Ver fila no app da Safe
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
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
