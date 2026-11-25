"use client";

import {
  BASE_USDC_TOKEN,
  BNB_USDC_TOKEN,
  buildExplorerTxUrl,
  fromRawUnits,
  P2P_ME_CONFIG,
  SUPPORTED_CHAINS,
  toRawUnits,
  type EvmAddress,
  type LedgerEntry,
  type MemberPosition,
} from "@pertufundos/shared";
import {
  ArrowDownLeft,
  ArrowRightLeft,
  Check,
  Copy,
  ExternalLink,
  PlusCircle,
  RefreshCw,
  ShieldCheck,
  UserPlus,
} from "lucide-react";
import { useRef, useState, type FormEvent } from "react";
import { erc20Abi } from "viem";
import {
  useAccount,
  useBalance,
  usePublicClient,
  useReadContract,
  useSendTransaction,
  useSwitchChain,
  useWriteContract,
} from "wagmi";
import { InfoTip } from "@/components/InfoTip";
import { fundApi } from "@/lib/api-client";
import { formatShares, formatUsd, shortenAddress } from "@/lib/formatters";
import { safeMultisigClient } from "@/lib/safe-multisig.client";
import { ensureWalletChain } from "@/lib/wallet-helpers";

interface DepositTabProps {
  safeAddress: EvmAddress;
  navPerShareUsd: number;
  activeWallet: EvmAddress | undefined;
  members: readonly MemberPosition[];
  ledgerEntries: readonly LedgerEntry[];
  onRefresh: () => Promise<void>;
}

export function DepositTab({
  safeAddress,
  navPerShareUsd,
  activeWallet,
  ledgerEntries,
  onRefresh,
}: DepositTabProps) {
  const { address: connectedAddress, chainId: currentChainId, connector, isConnected } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const { sendTransactionAsync } = useSendTransaction();
  const basePublicClient = usePublicClient({ chainId: SUPPORTED_CHAINS.BASE.id });
  const bscPublicClient = usePublicClient({ chainId: SUPPORTED_CHAINS.BNB.id });

  const walletForBalances = activeWallet ?? (connectedAddress?.toLowerCase() as EvmAddress | undefined);
  const { data: rawBaseUsdc, refetch: refetchBaseUsdc } = useReadContract({
    address: BASE_USDC_TOKEN.address,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: walletForBalances ? [walletForBalances] : undefined,
    chainId: SUPPORTED_CHAINS.BASE.id,
    query: { enabled: Boolean(walletForBalances) },
  });
  const { data: rawBscUsdc, refetch: refetchBscUsdc } = useReadContract({
    address: BNB_USDC_TOKEN.address,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: walletForBalances ? [walletForBalances] : undefined,
    chainId: SUPPORTED_CHAINS.BNB.id,
    query: { enabled: Boolean(walletForBalances) },
  });
  const { data: baseEthBalance } = useBalance({
    address: walletForBalances,
    chainId: SUPPORTED_CHAINS.BASE.id,
    query: { enabled: Boolean(walletForBalances) },
  });

  const baseUsdcBalance = rawBaseUsdc !== undefined ? fromRawUnits(rawBaseUsdc, BASE_USDC_TOKEN.decimals) : 0;
  const bscUsdcBalance = rawBscUsdc !== undefined ? fromRawUnits(rawBscUsdc, BNB_USDC_TOKEN.decimals) : 0;
  const baseEthHuman = baseEthBalance ? Number(baseEthBalance.formatted) : 0;

  const [amountUsd, setAmountUsd] = useState("500");
  const [bridgeAmountUsd, setBridgeAmountUsd] = useState("100");
  const [bridgeTxHash, setBridgeTxHash] = useState<string | null>(null);
  const [copiedWallet, setCopiedWallet] = useState(false);
  const [copiedSafe, setCopiedSafe] = useState(false);
  const [newNickname, setNewNickname] = useState("");
  const [newWallet, setNewWallet] = useState("");
  const [busy, setBusy] = useState(false);
  const [bridgeBusy, setBridgeBusy] = useState(false);
  const [bridgeStep, setBridgeStep] = useState<string | null>(null);
  const bridgeAttemptRef = useRef(0);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const parsedAmount = Number(amountUsd) || 0;
  const estimatedNewShares = navPerShareUsd > 0 ? parsedAmount / navPerShareUsd : 0;
  const isDemo = safeMultisigClient.isDemoSafe(safeAddress);

  async function refreshWalletBalances() {
    await Promise.all([refetchBaseUsdc(), refetchBscUsdc()]);
  }

  async function handleCopyWallet() {
    if (!walletForBalances) return;
    try {
      await navigator.clipboard.writeText(walletForBalances);
      setCopiedWallet(true);
      setTimeout(() => setCopiedWallet(false), 2000);
    } catch {
      // Ignora caso clipboard não esteja disponível
    }
  }

  async function handleCopySafe() {
    try {
      await navigator.clipboard.writeText(safeAddress);
      setCopiedSafe(true);
      setTimeout(() => setCopiedSafe(false), 2000);
    } catch {
      // Ignora caso clipboard não esteja disponível
    }
  }

  async function handleBridgeBaseToBsc(e: FormEvent) {
    e.preventDefault();
    if (!activeWallet) {
      setError("Conecte sua carteira e clique em 'Assinar Login' no topo da página primeiro.");
      return;
    }

    const amount = Number(bridgeAmountUsd) || 0;
    if (amount <= 0) {
      setError("Informe um valor válido em USDC para trazer da rede Base.");
      return;
    }

    if (isConnected && !isDemo) {
      if (rawBaseUsdc !== undefined && amount > baseUsdcBalance) {
        setError(
          `Saldo insuficiente na rede Base: você possui ${baseUsdcBalance.toFixed(2)} USDC na Base, mas tentou enviar ${amount.toFixed(2)} USDC.`,
        );
        return;
      }
      if (baseEthBalance !== undefined && baseEthBalance.value === 0n) {
        setError(
          "Você precisa de um pouco de ETH na rede Base (~US$ 0,05) para pagar a taxa de gás da bridge.",
        );
        return;
      }
    }

    const attemptId = ++bridgeAttemptRef.current;
    setBridgeBusy(true);
    setBridgeStep("1/4 Preparando rota na OKX...");
    setError(null);
    setFeedback(null);
    setBridgeTxHash(null);

    try {
      const initial = await fundApi.prepareBaseBridge({
        fromAddress: activeWallet,
        amountUsdc: amount,
        slippagePercent: 2.0,
      });
      if (bridgeAttemptRef.current !== attemptId) return;

      let activeBridge = initial.bridge;
      if (!isConnected || isDemo) {
        setFeedback(
          `[SIMULAÇÃO] Rota OKX preparada para ${amount.toFixed(2)} USDC (Base -> BNB Chain, ${activeBridge.transactions.length} transações).`,
        );
        return;
      }

      setBridgeStep("2/4 Trocando carteira para a rede Base...");
      await ensureWalletChain({
        currentChainId,
        targetChainId: SUPPORTED_CHAINS.BASE.id,
        targetChainLabel: "Base",
        connector,
        switchChainAsync,
      });
      if (bridgeAttemptRef.current !== attemptId) return;

      const sendAndConfirmBaseTx = async (
        tx: (typeof activeBridge.transactions)[number],
        stepLabel: string,
        waitLabel: string,
      ): Promise<`0x${string}`> => {
        const valueWei = BigInt(tx.value || "0");
        const isApproveTx = tx.to.toLowerCase() === BASE_USDC_TOKEN.address.toLowerCase();

        if (!isApproveTx) {
          if (baseEthBalance !== undefined && baseEthBalance.value <= valueWei) {
            const neededEth = Number(valueWei) / 1e18;
            throw new Error(
              `ETH insuficiente na Base para pagar a taxa da bridge: a rota OKX exige ${neededEth.toFixed(5)} ETH de taxa cross-chain + gás, mas sua carteira tem ${baseEthHuman.toFixed(5)} ETH.`,
            );
          }

          if (basePublicClient) {
            try {
              await basePublicClient.call({
                account: activeWallet,
                to: tx.to,
                data: tx.data,
                value: valueWei,
              });
            } catch (simErr) {
              const rawMsg =
                simErr instanceof Error ? simErr.message.split("\n")[0] : "reversão na simulação";
              const neededEth = Number(valueWei) / 1e18;
              throw new Error(
                `Simulação na rede Base detectou que a bridge iria falhar on-chain (${rawMsg}). [contrato: ${tx.to}, tx.value=${neededEth.toFixed(5)} ETH, seu ETH=${baseEthHuman.toFixed(5)} ETH]`,
              );
            }
          }
        }

        setBridgeStep(stepLabel);
        const hash = await sendTransactionAsync({
          to: tx.to,
          data: tx.data,
          value: valueWei,
          chainId: SUPPORTED_CHAINS.BASE.id,
        });
        if (bridgeAttemptRef.current !== attemptId) return hash;
        setBridgeTxHash(hash);

        if (basePublicClient) {
          setBridgeStep(waitLabel);
          const receipt = await basePublicClient.waitForTransactionReceipt({
            hash,
            timeout: 120_000,
          });
          if (bridgeAttemptRef.current !== attemptId) return hash;
          if (receipt.status !== "success") {
            throw new Error(
              `A transação falhou on-chain na rede Base (status: reverted). Confira o motivo no BaseScan: ${buildExplorerTxUrl(hash, SUPPORTED_CHAINS.BASE.id)}`,
            );
          }
        }
        return hash;
      };

      let lastHash: `0x${string}` | undefined;
      for (let pass = 0; pass < 2 && activeBridge.transactions.length > 1; pass++) {
        const approveTx = activeBridge.transactions[0]!;
        lastHash = await sendAndConfirmBaseTx(
          approveTx,
          `3/4 Confirme na sua carteira (Approve USDC): ${approveTx.description}`,
          "3/4 Aguardando confirmação do Approve na rede Base...",
        );
        if (bridgeAttemptRef.current !== attemptId) return;

        // Rebusca calldata da bridge com allowance já minerada para evitar cotação vencida
        setBridgeStep("3/4 Atualizando cotação fresca da bridge após Approve...");
        const refreshed = await fundApi.prepareBaseBridge({
          fromAddress: activeWallet,
          amountUsdc: amount,
          slippagePercent: 2.0,
        });
        if (bridgeAttemptRef.current !== attemptId) return;
        activeBridge = refreshed.bridge;
      }

      const swapTx = activeBridge.transactions[activeBridge.transactions.length - 1];
      if (!swapTx) {
        throw new Error("A OKX não retornou a transação final de bridge.");
      }

      lastHash = await sendAndConfirmBaseTx(
        swapTx,
        `3/4 Confirme na sua carteira (${activeBridge.transactions.length === 1 ? "Bridge" : "2/2 — Enviar Bridge"}): ${swapTx.description}`,
        "4/4 Aguardando confirmação da bridge na rede Base...",
      );
      if (bridgeAttemptRef.current !== attemptId) return;

      if (lastHash) {
        setBridgeTxHash(lastHash);
      }
      await refreshWalletBalances();
      setAmountUsd(String(Number(activeBridge.expectedBscUsdc.toFixed(2))));
      setFeedback(
        `Bridge confirmada na Base! Aguarde cerca de 1–2 minutos para ~${activeBridge.expectedBscUsdc.toFixed(2)} USDC aparecerem na sua BNB Chain e depois clique em "Enviar USDC para a Safe".`,
      );
    } catch (err) {
      if (bridgeAttemptRef.current === attemptId) {
        setError(err instanceof Error ? err.message : "Erro ao enviar bridge da rede Base.");
      }
    } finally {
      if (bridgeAttemptRef.current === attemptId) {
        setBridgeBusy(false);
        setBridgeStep(null);
      }
    }
  }

  async function handleDeposit(e: FormEvent) {
    e.preventDefault();
    if (!activeWallet) {
      setError("Conecte sua carteira e clique em 'Assinar Login' no topo da página primeiro.");
      return;
    }
    if (parsedAmount <= 0) {
      setError("Informe um valor válido em USDC para depositar na Safe.");
      return;
    }
    if (isConnected && !isDemo && rawBscUsdc !== undefined && parsedAmount > bscUsdcBalance) {
      setError(
        `Saldo insuficiente na BNB Chain: você possui ${bscUsdcBalance.toFixed(2)} USDC na BNB Chain, mas tentou transferir ${parsedAmount.toFixed(2)} USDC.`,
      );
      return;
    }
    setBusy(true);
    setError(null);
    setFeedback(null);

    try {
      let txHash: `0x${string}`;
      if (isConnected && !isDemo) {
        await ensureWalletChain({
          currentChainId,
          targetChainId: SUPPORTED_CHAINS.BNB.id,
          targetChainLabel: "BNB Smart Chain",
          connector,
          switchChainAsync,
        });
        // Transferência real ERC-20 de USDC na BNB Chain (18 decimais!) para o endereço da Safe
        const rawAmount = toRawUnits(parsedAmount, BNB_USDC_TOKEN.decimals);
        txHash = await writeContractAsync({
          address: BNB_USDC_TOKEN.address,
          abi: erc20Abi,
          functionName: "transfer",
          args: [safeAddress, rawAmount],
          chainId: SUPPORTED_CHAINS.BNB.id,
        });
        if (bscPublicClient) {
          const receipt = await bscPublicClient.waitForTransactionReceipt({
            hash: txHash,
            timeout: 120_000,
          });
          if (receipt.status !== "success") {
            throw new Error(
              `A transferência de USDC falhou on-chain na BNB Chain (status: reverted). Confira no BscScan: ${buildExplorerTxUrl(txHash, SUPPORTED_CHAINS.BNB.id)}`,
            );
          }
        }
      } else {
        const rand = Array.from({ length: 64 }, () =>
          Math.floor(Math.random() * 16).toString(16),
        ).join("");
        txHash = `0x${rand}`;
      }

      const res = await fundApi.recordDeposit({
        fromAddress: activeWallet,
        amountUsd: parsedAmount,
        txHash,
      });

      await refreshWalletBalances();
      setFeedback(
        `Aporte registrado com sucesso! Você recebeu +${formatShares(res.entry.sharesDelta)} cotas ao preço de US$ ${res.entry.navAtExecutionUsd.toFixed(4)} por cota.`,
      );
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao processar aporte.");
    } finally {
      setBusy(false);
    }
  }

  async function handleRegisterFriend(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setFeedback(null);
    try {
      const { member } = await fundApi.registerMember({
        nickname: newNickname,
        walletAddress: newWallet as EvmAddress,
        isSafeOwner: true,
      });
      setNewNickname("");
      setNewWallet("");
      setFeedback(`${member.nickname} foi cadastrado(a) no clube com sucesso!`);
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao cadastrar participante.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {feedback && (
        <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm text-emerald-200">
          {feedback}
        </div>
      )}
      {error && (
        <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-4 text-sm text-rose-200">
          {error}
        </div>
      )}

      {/* Passo a passo visual do aporte */}
      <div className="rounded-2xl border border-sky-500/30 bg-sky-500/5 p-6 space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-white font-semibold">
              <ArrowRightLeft className="h-5 w-5 text-sky-400" />
              <h2>Como colocar dinheiro no clube (via Pix em 3 passos)</h2>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed max-w-3xl">
              Não precisa usar corretora no CPF do grupo. Você transforma Reais (Pix) em{" "}
              <strong>USDC na rede Base</strong>, traz esse USDC para a{" "}
              <strong>BNB Chain</strong> em 1 clique aqui e deposita direto no cofre Safe.{" "}
              <span className="text-sky-300">
                (Já tem USDC na BNB Chain? Pule direto para o Passo 3 abaixo!)
              </span>
            </p>
          </div>
          {walletForBalances && (
            <button
              type="button"
              onClick={() => void refreshWalletBalances()}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800 transition"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Atualizar meus saldos
            </button>
          )}
        </div>

        {/* Mini mapa dos 3 passos */}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3 text-xs">
          <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3.5 space-y-1">
            <div className="font-semibold text-sky-300">Passo 1 • Comprar USDC via Pix</div>
            <p className="text-slate-400 leading-relaxed">
              Compre <strong>USDC na rede Base</strong> pelo{" "}
              <a
                href={P2P_ME_CONFIG.appUrl}
                target="_blank"
                rel="noreferrer"
                className="text-sky-300 underline"
              >
                P2P.me
              </a>{" "}
              ou envie da sua conta <strong>Picnic (rede Base)</strong> para o seu endereço ao lado.
            </p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3.5 space-y-1">
            <div className="font-semibold text-sky-300">Passo 2 • Trazer para BNB Chain</div>
            <p className="text-slate-400 leading-relaxed">
              O cofre do clube opera na BNB Chain (taxas de centavos). Use o botão{" "}
              <strong>Trazer p/ BNB Chain</strong> abaixo para mover seus USDC entre as duas redes.
            </p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3.5 space-y-1">
            <div className="font-semibold text-emerald-300">Passo 3 • Depositar na Safe</div>
            <p className="text-slate-400 leading-relaxed">
              Com o USDC na BNB Chain, envie para o cofre no card{" "}
              <strong>Enviar USDC para a Safe</strong>. Suas cotas são emitidas na hora!
            </p>
          </div>
        </div>

        {/* Cartões de saldo da carteira conectada */}
        {walletForBalances ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3 text-xs">
            <div className="rounded-xl border border-slate-800 bg-slate-950/85 p-3.5 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-slate-400 inline-flex items-center gap-1">
                  Seu Endereço (Base e BNB)
                  <InfoTip text="Seu endereço 0x... é idêntico na rede Base e na BNB Smart Chain." />
                </p>
                <p className="font-mono text-slate-100 truncate mt-0.5">{walletForBalances}</p>
              </div>
              <button
                type="button"
                onClick={() => void handleCopyWallet()}
                className="shrink-0 rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-slate-200 hover:bg-slate-700 inline-flex items-center gap-1"
              >
                {copiedWallet ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-400" />
                    Copiado
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    Copiar
                  </>
                )}
              </button>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950/85 p-3.5">
              <p className="text-slate-400">Saldo na Rede Base (para trazer)</p>
              <p className="font-mono text-base font-semibold text-sky-300 mt-0.5 tabular-nums">
                {baseUsdcBalance.toFixed(2)} USDC
              </p>
              <p className="text-[11px] text-slate-400 mt-1">
                Taxa de gás (ETH na Base):{" "}
                <span className={baseEthHuman < 0.0003 ? "text-amber-300" : "text-emerald-300"}>
                  {baseEthHuman.toFixed(5)} ETH
                </span>
                {baseEthHuman < 0.0003 && " — deixe ~US$ 1 em ETH na Base para a bridge"}
              </p>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950/85 p-3.5">
              <p className="text-slate-400">Saldo na BNB Chain (pronto p/ Safe)</p>
              <p className="font-mono text-base font-semibold text-emerald-300 mt-0.5 tabular-nums">
                {bscUsdcBalance.toFixed(2)} USDC
              </p>
              <p className="text-[11px] text-slate-400 mt-1">
                Pronto para depositar no Passo 3 abaixo
              </p>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-700 bg-slate-950/60 p-4 text-xs text-slate-300">
            Conecte sua carteira no topo da página para ver automaticamente seus saldos de USDC na
            rede Base e na BNB Chain.
          </div>
        )}

        <form onSubmit={handleBridgeBaseToBsc} className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[200px]">
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium text-slate-300">
                Quanto trazer da Base para a BNB Chain (USDC)
              </label>
              {baseUsdcBalance > 0 && (
                <button
                  type="button"
                  onClick={() => setBridgeAmountUsd(String(Math.floor(baseUsdcBalance * 100) / 100))}
                  className="text-[11px] text-sky-400 hover:underline"
                >
                  Usar tudo ({baseUsdcBalance.toFixed(2)})
                </button>
              )}
            </div>
            <input
              type="number"
              step="0.01"
              min="1"
              required
              value={bridgeAmountUsd}
              onChange={(e) => setBridgeAmountUsd(e.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white focus:border-sky-500 focus:outline-none"
            />
            {isConnected &&
              !isDemo &&
              rawBaseUsdc !== undefined &&
              (Number(bridgeAmountUsd) || 0) > baseUsdcBalance && (
                <p className="mt-1 text-[11px] text-amber-300">
                  Valor acima do seu saldo atual na Base ({baseUsdcBalance.toFixed(2)} USDC).
                </p>
              )}
          </div>

          <a
            href={P2P_ME_CONFIG.appUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm font-medium text-slate-200 hover:bg-slate-700 transition"
          >
            1. Comprar via Pix (P2P.me)
            <ExternalLink className="h-3.5 w-3.5" />
          </a>

          <button
            type="submit"
            disabled={bridgeBusy}
            className="inline-flex items-center gap-2 rounded-xl bg-sky-500 px-5 py-2.5 text-sm font-semibold text-slate-950 hover:bg-sky-400 disabled:opacity-50 transition"
          >
            <ArrowRightLeft className="h-4 w-4" />
            {bridgeBusy ? "Fazendo Bridge..." : "2. Trazer p/ BNB Chain (OKX)"}
          </button>
        </form>

        {bridgeBusy && bridgeStep && (
          <div className="rounded-xl border border-sky-500/30 bg-sky-500/10 px-3.5 py-2.5 text-xs text-sky-200 flex flex-wrap items-center justify-between gap-2">
            <span>{bridgeStep}</span>
            <button
              type="button"
              onClick={() => {
                bridgeAttemptRef.current += 1;
                setBridgeBusy(false);
                setBridgeStep(null);
                setError("Envio da bridge cancelado manualmente.");
              }}
              className="rounded-lg border border-sky-400/40 bg-slate-900/70 px-2.5 py-1 text-[11px] font-medium text-sky-200 hover:bg-slate-800 transition"
            >
              Cancelar espera
            </button>
          </div>
        )}

        {bridgeTxHash && (
          <div className="text-xs text-sky-300 flex items-center gap-2">
            <span>Transação enviada na Base:</span>
            <a
              href={buildExplorerTxUrl(bridgeTxHash, SUPPORTED_CHAINS.BASE.id)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 font-mono underline hover:text-sky-200"
            >
              {shortenAddress(bridgeTxHash)}
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Passo 3: Formulário de Aporte em USDC */}
        <form
          onSubmit={handleDeposit}
          className="rounded-2xl border border-slate-800 bg-slate-900/55 p-6 space-y-4"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-white font-semibold">
              <PlusCircle className="h-5 w-5 text-emerald-400" />
              <h2>Passo 3 • Enviar USDC para a Safe (BNB Chain)</h2>
            </div>
            <span className="rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-0.5 text-[11px] font-medium text-emerald-300">
              Gera Cotas
            </span>
          </div>

          <p className="text-xs text-slate-400 leading-relaxed">
            Ao transferir <strong>USDC (BNB Chain)</strong> para o cofre do grupo, nosso monitor
            automático (Alchemy) detecta o depósito e emite suas cotas na hora pelo preço vigente
            (NAV). Você também pode transferir direto pela carteira para{" "}
            <button
              type="button"
              onClick={() => void handleCopySafe()}
              className="inline-flex items-center gap-1 font-mono text-slate-200 underline decoration-dotted hover:text-emerald-300"
            >
              {shortenAddress(safeAddress)}
              {copiedSafe ? (
                <Check className="h-3 w-3 text-emerald-400" />
              ) : (
                <Copy className="h-3 w-3" />
              )}
            </button>
            .
          </p>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-medium text-slate-300">
                Valor do Aporte (USDC na BNB Chain)
              </label>
              {bscUsdcBalance > 0 && (
                <button
                  type="button"
                  onClick={() => setAmountUsd(String(Math.floor(bscUsdcBalance * 100) / 100))}
                  className="text-[11px] text-emerald-400 hover:underline"
                >
                  Usar saldo máximo ({bscUsdcBalance.toFixed(2)})
                </button>
              )}
            </div>
            <input
              type="number"
              step="0.01"
              min="1"
              required
              value={amountUsd}
              onChange={(e) => setAmountUsd(e.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white focus:border-emerald-500 focus:outline-none"
            />
          </div>

          <div className="rounded-xl bg-slate-950/80 border border-slate-800 p-4 text-xs space-y-2">
            <div className="flex justify-between text-slate-400">
              <span>Preço Atual da Cota (NAV):</span>
              <span className="font-mono text-slate-200 tabular-nums">
                US$ {navPerShareUsd.toFixed(4)}
              </span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>Cotas que você vai receber:</span>
              <span className="font-mono font-semibold text-emerald-400 tabular-nums">
                +{formatShares(estimatedNewShares)} cotas
              </span>
            </div>
          </div>

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-xl bg-emerald-500 py-2.5 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-50 transition"
          >
            {busy
              ? "Processando..."
              : isDemo
                ? "Simular Depósito & Receber Cotas"
                : "Transferir USDC para a Safe"}
          </button>
        </form>

        {/* Cadastro de Novo Amigo */}
        <form
          onSubmit={handleRegisterFriend}
          className="rounded-2xl border border-slate-800 bg-slate-900/55 p-6 space-y-4 flex flex-col justify-between"
        >
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-white font-semibold">
              <UserPlus className="h-5 w-5 text-sky-400" />
              <h2>Adicionar um Amigo ao Clube</h2>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Cada amigo pode entrar sozinho ao conectar e assinar com a própria carteira no topo da
              tela. Se quiser pré-cadastrar alguém agora, informe o apelido e o endereço da carteira
              pessoal dele (já incluída como <em>owner</em> na Safe).
            </p>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Nome / Apelido do Amigo
              </label>
              <input
                type="text"
                required
                placeholder="Ex: Bruno"
                value={newNickname}
                onChange={(e) => setNewNickname(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white focus:border-emerald-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Endereço da Carteira Pessoal (0x...)
              </label>
              <input
                type="text"
                required
                placeholder="0x..."
                value={newWallet}
                onChange={(e) => setNewWallet(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm font-mono text-white focus:border-emerald-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="space-y-3 pt-2">
            <div className="rounded-xl border border-slate-800/80 bg-slate-950/60 p-3 text-[11px] text-slate-400 flex items-start gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
              <span>
                Em produção, o servidor valida diretamente no contrato da Safe se o endereço faz
                parte dos donos do cofre.
              </span>
            </div>

            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-xl border border-slate-700 bg-slate-800 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50 transition"
            >
              Cadastrar Participante
            </button>
          </div>
        </form>
      </div>

      {/* Histórico Completo do Ledger */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/55 p-6">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-2">
            <ArrowDownLeft className="h-5 w-5 text-emerald-400" />
            <div>
              <h3 className="text-base font-semibold text-white">
                Histórico de Entradas e Saídas (Livro-Razão)
              </h3>
              <p className="text-xs text-slate-400">
                Cada aporte ou resgate fica registrado com data, valor da cota do dia e link na
                blockchain
              </p>
            </div>
          </div>
        </div>

        {ledgerEntries.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-800 p-8 text-center text-xs text-slate-400">
            Nenhum aporte ou resgate registrado ainda. Quando alguém enviar USDC para a Safe, o
            registro aparecerá aqui.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-[11px] uppercase tracking-wide text-slate-400">
                  <th className="pb-3">Data</th>
                  <th className="pb-3">Participante</th>
                  <th className="pb-3">Tipo</th>
                  <th className="pb-3 text-right">Valor (USD)</th>
                  <th className="pb-3 text-right">Cotas</th>
                  <th className="pb-3 text-right">Preço da Cota</th>
                  <th className="pb-3 text-right">Comprovante</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {ledgerEntries.map((entry) => (
                  <tr key={entry.id} className="hover:bg-slate-800/25 transition">
                    <td className="py-3 text-xs text-slate-400 whitespace-nowrap">
                      {new Date(entry.createdAt).toLocaleString("pt-BR")}
                    </td>
                    <td className="py-3 font-medium text-white">{entry.memberNickname}</td>
                    <td className="py-3">
                      <span
                        className={`rounded-md px-2 py-0.5 text-xs font-medium ${
                          entry.type === "DEPOSIT"
                            ? "bg-emerald-500/15 text-emerald-300"
                            : "bg-amber-500/15 text-amber-300"
                        }`}
                      >
                        {entry.type === "DEPOSIT" ? "Aporte" : "Resgate"}
                      </span>
                    </td>
                    <td className="py-3 text-right font-mono text-xs text-white tabular-nums">
                      {formatUsd(entry.amountUsd)}
                    </td>
                    <td
                      className={`py-3 text-right font-mono text-xs font-semibold tabular-nums ${
                        entry.sharesDelta >= 0 ? "text-emerald-400" : "text-amber-400"
                      }`}
                    >
                      {entry.sharesDelta >= 0 ? "+" : ""}
                      {formatShares(entry.sharesDelta)}
                    </td>
                    <td className="py-3 text-right font-mono text-xs text-slate-300 tabular-nums">
                      US$ {entry.navAtExecutionUsd.toFixed(4)}
                    </td>
                    <td className="py-3 text-right">
                      <a
                        href={buildExplorerTxUrl(entry.txHash, entry.chainId)}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-emerald-400 hover:underline font-mono"
                      >
                        {shortenAddress(entry.txHash)}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
