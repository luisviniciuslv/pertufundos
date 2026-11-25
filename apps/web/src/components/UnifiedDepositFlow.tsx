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
} from "@pertufundos/shared";
import {
  AlertTriangle,
  ArrowRightLeft,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  ExternalLink,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Wallet,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { erc20Abi, getAddress } from "viem";
import {
  usePublicClient,
  useSendTransaction,
  useSwitchChain,
  useWriteContract,
  type Connector,
} from "wagmi";
import { InfoTip } from "@/components/InfoTip";
import { fundApi } from "@/lib/api-client";
import { formatShares, shortenAddress } from "@/lib/formatters";
import { ensureWalletChain, WalletTimeoutError, withTimeout } from "@/lib/wallet-helpers";

export type FlowStepStatus =
  | "pending"
  | "in_progress"
  | "waiting_wallet"
  | "waiting_chain"
  | "done"
  | "skipped"
  | "error";

export interface FlowStepItem {
  id: string;
  title: string;
  subtitle: string;
  requiresWalletAction?: boolean;
  status: FlowStepStatus;
  txHash?: string;
  chainId?: number;
}

interface UnifiedDepositFlowProps {
  safeAddress: EvmAddress;
  navPerShareUsd: number;
  activeWallet: EvmAddress | undefined;
  walletForBalances: EvmAddress | undefined;
  isConnected: boolean;
  isDemo: boolean;
  currentChainId: number | undefined;
  connector: Connector | undefined;
  baseUsdcBalance: number;
  rawBaseUsdc: bigint | undefined;
  bscUsdcBalance: number;
  rawBscUsdc: bigint | undefined;
  baseEthHuman: number;
  baseEthWei: bigint | undefined;
  bscBnbHuman: number;
  bscBnbWei: bigint | undefined;
  onRefreshBalances: () => Promise<void>;
  onRefreshPortfolio: () => Promise<void>;
  onSuccess: (msg: string) => void;
  onError: (msg: string | null) => void;
  onSwitchToManualTab: () => void;
}

function roundDown2(value: number): number {
  return Math.floor(Math.max(0, value) * 100) / 100;
}

function formatElapsed(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function buildInitialSteps(needsBridge: boolean): FlowStepItem[] {
  if (!needsBridge) {
    return [
      {
        id: "prepare",
        title: "Validar saldo e simular na BNB Chain",
        subtitle: "Seu USDC já está na BNB Chain — não precisa fazer ponte.",
        status: "pending",
      },
      {
        id: "safe_transfer",
        title: "Transferir USDC para a Safe",
        subtitle: "Única confirmação na carteira (rede BNB Smart Chain).",
        requiresWalletAction: true,
        status: "pending",
      },
      {
        id: "record",
        title: "Emitir suas cotas no clube",
        subtitle: "Registra o aporte no livro-razão pelo NAV vigente.",
        status: "pending",
      },
    ];
  }

  return [
    {
      id: "prepare",
      title: "Preparar melhor rota Base → BNB Chain",
      subtitle: "Consulta cotação OKX DEX e valida taxas de gás.",
      status: "pending",
    },
    {
      id: "approve",
      title: "Autorizar USDC na rede Base (Approve)",
      subtitle: "1ª confirmação na carteira (pulada automaticamente se já autorizado).",
      requiresWalletAction: true,
      status: "pending",
    },
    {
      id: "bridge_send",
      title: "Enviar ponte Base → BNB Chain",
      subtitle: "Confirmação na carteira na rede Base.",
      requiresWalletAction: true,
      status: "pending",
    },
    {
      id: "bridge_wait",
      title: "Aguardar USDC chegar na BNB Chain",
      subtitle: "Automático (~1–2 min). Monitorando saldo na BNB Chain...",
      status: "pending",
    },
    {
      id: "safe_transfer",
      title: "Transferir USDC para a Safe",
      subtitle: "Última confirmação na carteira (rede BNB Smart Chain).",
      requiresWalletAction: true,
      status: "pending",
    },
    {
      id: "record",
      title: "Emitir suas cotas no clube",
      subtitle: "Registra o aporte no livro-razão pelo NAV vigente.",
      status: "pending",
    },
  ];
}

export function UnifiedDepositFlow({
  safeAddress,
  navPerShareUsd,
  activeWallet,
  walletForBalances,
  isConnected,
  isDemo,
  currentChainId,
  connector,
  baseUsdcBalance,
  rawBaseUsdc,
  bscUsdcBalance,
  rawBscUsdc,
  baseEthHuman,
  baseEthWei,
  bscBnbHuman,
  bscBnbWei,
  onRefreshBalances,
  onRefreshPortfolio,
  onSuccess,
  onError,
  onSwitchToManualTab,
}: UnifiedDepositFlowProps) {
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const { sendTransactionAsync } = useSendTransaction();
  const basePublicClient = usePublicClient({ chainId: SUPPORTED_CHAINS.BASE.id });
  const bscPublicClient = usePublicClient({ chainId: SUPPORTED_CHAINS.BNB.id });

  const totalWalletUsdc = roundDown2(baseUsdcBalance + bscUsdcBalance);
  const [amountInput, setAmountInput] = useState("100");
  const [copiedWallet, setCopiedWallet] = useState(false);
  const [running, setRunning] = useState(false);
  const [steps, setSteps] = useState<FlowStepItem[] | null>(null);
  const [waitElapsedSec, setWaitElapsedSec] = useState(0);
  const attemptRef = useRef(0);
  const initializedAmountRef = useRef(false);

  // Sugere automaticamente o saldo disponível da carteira na primeira carga
  useEffect(() => {
    if (initializedAmountRef.current) return;
    if (rawBaseUsdc === undefined && rawBscUsdc === undefined) return;
    if (totalWalletUsdc > 0) {
      setAmountInput(String(totalWalletUsdc));
      initializedAmountRef.current = true;
    }
  }, [rawBaseUsdc, rawBscUsdc, totalWalletUsdc]);

  const parsedAmount = Number(amountInput) || 0;
  const usedFromBsc = useMemo(
    () => Math.min(parsedAmount, roundDown2(bscUsdcBalance)),
    [parsedAmount, bscUsdcBalance],
  );
  const neededFromBase = useMemo(
    () => Math.max(0, Number((parsedAmount - usedFromBsc).toFixed(2))),
    [parsedAmount, usedFromBsc],
  );
  const needsBridge = neededFromBase > 0;
  const estimatedShares = navPerShareUsd > 0 ? parsedAmount / navPerShareUsd : 0;

  const previewSteps = useMemo(() => buildInitialSteps(needsBridge), [needsBridge]);
  const visibleSteps = steps ?? previewSteps;

  const activeWalletStep = visibleSteps.find((s) => s.status === "waiting_wallet");
  const activeChainStep = visibleSteps.find((s) => s.status === "waiting_chain");

  function updateStep(stepId: string, patch: Partial<FlowStepItem>) {
    setSteps((prev) => {
      if (!prev) return prev;
      return prev.map((step) => (step.id === stepId ? { ...step, ...patch } : step));
    });
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

  function handleCancelWait() {
    attemptRef.current += 1;
    setRunning(false);
    setWaitElapsedSec(0);
    setSteps((prev) =>
      prev
        ? prev.map((step) =>
            step.status === "in_progress" ||
            step.status === "waiting_wallet" ||
            step.status === "waiting_chain"
              ? { ...step, status: "error", subtitle: "Cancelado manualmente pelo usuário." }
              : step,
          )
        : prev,
    );
    onError("Fluxo cancelado manualmente. Confira sua carteira antes de tentar novamente.");
    console.warn("[UnifiedDeposit] Fluxo cancelado manualmente pelo usuário.");
  }

  async function handleStartUnifiedFlow(e: FormEvent) {
    e.preventDefault();
    onError(null);

    if (!activeWallet) {
      onError("Conecte sua carteira e clique em 'Assinar Login' no topo da página primeiro.");
      return;
    }
    if (parsedAmount <= 0) {
      onError("Informe um valor válido em USDC para trazer para o cofre.");
      return;
    }

    if (isConnected && !isDemo) {
      if (!connector) {
        onError("Sua carteira ainda está reconectando. Reconecte no topo e tente novamente.");
        return;
      }
      if (
        rawBaseUsdc !== undefined &&
        rawBscUsdc !== undefined &&
        parsedAmount > totalWalletUsdc + 0.01
      ) {
        onError(
          `Saldo insuficiente na carteira conectada: você tem ${totalWalletUsdc.toFixed(2)} USDC (${baseUsdcBalance.toFixed(2)} na Base + ${bscUsdcBalance.toFixed(2)} na BNB Chain), mas pediu ${parsedAmount.toFixed(2)} USDC.`,
        );
        return;
      }
      if (needsBridge && baseEthWei !== undefined && baseEthWei === 0n) {
        onError(
          "Você precisa de um pouco de ETH na rede Base (~US$ 0,10) para pagar o gás da ponte Base → BNB Chain.",
        );
        return;
      }
      if (bscBnbWei !== undefined && bscBnbWei === 0n) {
        onError(
          "Você está com 0 BNB na BNB Smart Chain para pagar o gás da transferência final para a Safe (~US$ 0,05). Envie um pouco de BNB antes (ou use a aba Passo a Passo Manual se quiser apenas fazer a ponte agora).",
        );
        return;
      }
    }

    const attemptId = ++attemptRef.current;
    const initialList = buildInitialSteps(needsBridge);
    setSteps(initialList);
    setRunning(true);
    setWaitElapsedSec(0);

    console.info("[UnifiedDeposit] Iniciando fluxo contínuo", {
      attemptId,
      activeWallet,
      parsedAmount,
      usedFromBsc,
      neededFromBase,
      needsBridge,
      isConnected,
      isDemo,
    });

    let currentStepId = "prepare";

    try {
      const checksumFrom = getAddress(activeWallet.toLowerCase()) as EvmAddress;
      const checksumSafe = getAddress(safeAddress.toLowerCase()) as EvmAddress;

      // Modo Demo / sem extensão conectada
      if (!isConnected || isDemo) {
        updateStep("prepare", { status: "in_progress" });
        await new Promise((r) => setTimeout(r, 450));
        if (attemptRef.current !== attemptId) return;
        updateStep("prepare", { status: "done", subtitle: "[Simulação] Rota validada." });

        if (needsBridge) {
          currentStepId = "approve";
          updateStep("approve", { status: "skipped", subtitle: "[Simulação] Approve dispensado." });
          currentStepId = "bridge_send";
          updateStep("bridge_send", {
            status: "done",
            subtitle: `[Simulação] Ponte de ${neededFromBase.toFixed(2)} USDC enviada.`,
          });
          currentStepId = "bridge_wait";
          updateStep("bridge_wait", {
            status: "done",
            subtitle: "[Simulação] USDC recebidos na BNB Chain.",
          });
        }

        currentStepId = "safe_transfer";
        const simHash = `0x${Array.from({ length: 64 }, () =>
          Math.floor(Math.random() * 16).toString(16),
        ).join("")}` as `0x${string}`;
        updateStep("safe_transfer", {
          status: "done",
          txHash: simHash,
          chainId: SUPPORTED_CHAINS.BNB.id,
          subtitle: `[Simulação] ${parsedAmount.toFixed(2)} USDC enviados para a Safe.`,
        });

        currentStepId = "record";
        updateStep("record", { status: "in_progress" });
        const res = await fundApi.recordDeposit({
          fromAddress: activeWallet,
          amountUsd: parsedAmount,
          txHash: simHash,
        });
        if (attemptRef.current !== attemptId) return;
        updateStep("record", {
          status: "done",
          subtitle: `+${formatShares(res.entry.sharesDelta)} cotas emitidas!`,
        });
        await onRefreshPortfolio();
        onSuccess(
          `Aporte simulado concluído! Você recebeu +${formatShares(res.entry.sharesDelta)} cotas ao preço de US$ ${res.entry.navAtExecutionUsd.toFixed(4)} por cota.`,
        );
        return;
      }

      // --- FLUXO REAL ON-CHAIN ---
      let rawDepositAmount = toRawUnits(parsedAmount, BNB_USDC_TOKEN.decimals);
      let depositUsdToRecord = parsedAmount;

      if (needsBridge) {
        currentStepId = "prepare";
        updateStep("prepare", {
          status: "in_progress",
          subtitle: `Buscando melhor rota OKX para trazer ${neededFromBase.toFixed(2)} USDC da Base...`,
        });

        // Snapshot exato do saldo na BNB Chain antes da ponte para detectar a chegada
        const beforeBscRaw = bscPublicClient
          ? await bscPublicClient.readContract({
              address: BNB_USDC_TOKEN.address,
              abi: erc20Abi,
              functionName: "balanceOf",
              args: [checksumFrom],
            })
          : (rawBscUsdc ?? 0n);

        const initialBridgeRes = await fundApi.prepareBaseBridge({
          fromAddress: activeWallet,
          amountUsdc: neededFromBase,
          slippagePercent: 2.0,
        });
        if (attemptRef.current !== attemptId) return;

        let activeBridge = initialBridgeRes.bridge;
        updateStep("prepare", {
          status: "done",
          subtitle: `Rota pronta! Estimativa na BNB Chain: ~${activeBridge.expectedBscUsdc.toFixed(2)} USDC.`,
        });

        // Garante carteira na Base para Approve + Bridge
        const sendAndConfirmBaseTx = async (
          stepId: string,
          tx: (typeof activeBridge.transactions)[number],
          walletMsg: string,
          waitMsg: string,
        ): Promise<`0x${string}`> => {
          const valueWei = BigInt(tx.value || "0");
          const isApproveTx = tx.to.toLowerCase() === BASE_USDC_TOKEN.address.toLowerCase();

          if (!isApproveTx) {
            if (baseEthWei !== undefined && baseEthWei <= valueWei) {
              const neededEth = Number(valueWei) / 1e18;
              throw new Error(
                `ETH insuficiente na Base para a taxa da bridge: exige ${neededEth.toFixed(5)} ETH, mas sua carteira tem ${baseEthHuman.toFixed(5)} ETH.`,
              );
            }
            if (basePublicClient) {
              try {
                await withTimeout(
                  basePublicClient.call({
                    account: checksumFrom,
                    to: tx.to,
                    data: tx.data,
                    value: valueWei,
                  }),
                  10_000,
                  "Timeout na simulação da ponte na rede Base.",
                );
              } catch (simErr) {
                if (!(simErr instanceof WalletTimeoutError)) {
                  const rawMsg =
                    simErr instanceof Error ? simErr.message.split("\n")[0] : "reversão na simulação";
                  throw new Error(`Simulação na Base falhou (${rawMsg}).`);
                }
              }
            }
          }

          updateStep(stepId, { status: "waiting_wallet", subtitle: walletMsg });
          await ensureWalletChain({
            currentChainId,
            targetChainId: SUPPORTED_CHAINS.BASE.id,
            targetChainLabel: "Base",
            connector,
            switchChainAsync,
          });
          if (attemptRef.current !== attemptId) return "0x";

          const hash = await sendTransactionAsync({
            to: tx.to,
            data: tx.data,
            value: valueWei,
            chainId: SUPPORTED_CHAINS.BASE.id,
          });
          if (attemptRef.current !== attemptId) return hash;

          updateStep(stepId, {
            status: "waiting_chain",
            subtitle: waitMsg,
            txHash: hash,
            chainId: SUPPORTED_CHAINS.BASE.id,
          });

          if (basePublicClient) {
            const receipt = await basePublicClient.waitForTransactionReceipt({
              hash,
              timeout: 120_000,
            });
            if (attemptRef.current !== attemptId) return hash;
            if (receipt.status !== "success") {
              throw new Error(
                `Transação na Base falhou (reverted). Veja no BaseScan: ${buildExplorerTxUrl(hash, SUPPORTED_CHAINS.BASE.id)}`,
              );
            }
          }
          return hash;
        };

        if (activeBridge.transactions.length === 1) {
          updateStep("approve", {
            status: "skipped",
            subtitle: "USDC já autorizado na Base — etapa pulada!",
          });
        } else {
          currentStepId = "approve";
          for (let pass = 0; pass < 2 && activeBridge.transactions.length > 1; pass++) {
            const approveTx = activeBridge.transactions[0]!;
            const approveHash = await sendAndConfirmBaseTx(
              "approve",
              approveTx,
              `Confirme na carteira (Approve USDC na Base): ${approveTx.description}`,
              "Aguardando confirmação do Approve na rede Base...",
            );
            if (attemptRef.current !== attemptId) return;

            updateStep("approve", {
              status: "in_progress",
              txHash: approveHash,
              chainId: SUPPORTED_CHAINS.BASE.id,
              subtitle: "Approve confirmado! Atualizando cotação da ponte...",
            });
            const refreshed = await fundApi.prepareBaseBridge({
              fromAddress: activeWallet,
              amountUsdc: neededFromBase,
              slippagePercent: 2.0,
            });
            if (attemptRef.current !== attemptId) return;
            activeBridge = refreshed.bridge;
          }
          updateStep("approve", {
            status: "done",
            subtitle: "USDC autorizado na rede Base.",
          });
        }

        const swapTx = activeBridge.transactions[activeBridge.transactions.length - 1];
        if (!swapTx) {
          throw new Error("A OKX não retornou a transação final da ponte.");
        }

        currentStepId = "bridge_send";
        const bridgeHash = await sendAndConfirmBaseTx(
          "bridge_send",
          swapTx,
          `Confirme na carteira para enviar ${neededFromBase.toFixed(2)} USDC da Base → BNB Chain`,
          "Confirmando envio da ponte na rede Base...",
        );
        if (attemptRef.current !== attemptId) return;

        updateStep("bridge_send", {
          status: "done",
          txHash: bridgeHash,
          chainId: SUPPORTED_CHAINS.BASE.id,
          subtitle: "Ponte enviada na rede Base!",
        });

        // Etapa 4: Aguardar saldo chegar na BNB Chain
        currentStepId = "bridge_wait";
        const expectedArrivalRaw = toRawUnits(activeBridge.expectedBscUsdc, BNB_USDC_TOKEN.decimals);
        const minDeltaRaw = expectedArrivalRaw > 10n ? (expectedArrivalRaw * 85n) / 100n : 1n;
        const startedWaitAt = Date.now();
        const maxWaitMs = 300_000; // 5 minutos
        let arrivedDeltaRaw = 0n;
        let currentBscRaw = beforeBscRaw;

        updateStep("bridge_wait", {
          status: "waiting_chain",
          subtitle: `Aguardando ~${activeBridge.expectedBscUsdc.toFixed(2)} USDC caírem na BNB Chain (00:00)...`,
        });

        while (Date.now() - startedWaitAt < maxWaitMs) {
          if (attemptRef.current !== attemptId) return;
          const elapsedSec = Math.floor((Date.now() - startedWaitAt) / 1000);
          setWaitElapsedSec(elapsedSec);
          updateStep("bridge_wait", {
            status: "waiting_chain",
            subtitle: `Aguardando ~${activeBridge.expectedBscUsdc.toFixed(2)} USDC caírem na BNB Chain (${formatElapsed(elapsedSec)})...`,
          });

          if (bscPublicClient) {
            try {
              currentBscRaw = await bscPublicClient.readContract({
                address: BNB_USDC_TOKEN.address,
                abi: erc20Abi,
                functionName: "balanceOf",
                args: [checksumFrom],
              });
              arrivedDeltaRaw = currentBscRaw > beforeBscRaw ? currentBscRaw - beforeBscRaw : 0n;
              if (arrivedDeltaRaw >= minDeltaRaw) {
                console.info("[UnifiedDeposit] Bridge detectada na BNB Chain!", {
                  beforeBscRaw: beforeBscRaw.toString(),
                  currentBscRaw: currentBscRaw.toString(),
                  arrivedDeltaRaw: arrivedDeltaRaw.toString(),
                });
                break;
              }
            } catch (pollErr) {
              console.warn("[UnifiedDeposit] Falha pontual ao consultar saldo BSC:", pollErr);
            }
          }

          await new Promise((r) => setTimeout(r, 4_000));
        }

        if (attemptRef.current !== attemptId) return;
        if (arrivedDeltaRaw < minDeltaRaw) {
          throw new Error(
            `A ponte foi enviada na Base (${shortenAddress(bridgeHash)}), mas após 5 minutos o USDC ainda não apareceu na BNB Chain. Assim que o saldo da BNB Chain atualizar acima, clique em iniciar novamente para enviar direto à Safe.`,
          );
        }

        const arrivedHuman = fromRawUnits(arrivedDeltaRaw, BNB_USDC_TOKEN.decimals);
        updateStep("bridge_wait", {
          status: "done",
          subtitle: `+${arrivedHuman.toFixed(2)} USDC chegaram na sua BNB Chain!`,
        });
        await onRefreshBalances();
        if (attemptRef.current !== attemptId) return;

        // Soma a parcela que já estava na BNB Chain (se houver) + o que chegou da ponte
        const usedFromBscRaw = toRawUnits(usedFromBsc, BNB_USDC_TOKEN.decimals);
        rawDepositAmount = usedFromBscRaw + arrivedDeltaRaw;
        if (rawDepositAmount > currentBscRaw) {
          rawDepositAmount = currentBscRaw;
        }
        depositUsdToRecord = fromRawUnits(rawDepositAmount, BNB_USDC_TOKEN.decimals);
      } else {
        // Sem ponte: apenas prepara e valida na BNB Chain
        currentStepId = "prepare";
        updateStep("prepare", {
          status: "in_progress",
          subtitle: `Validando saldo e simulando transferência de ${parsedAmount.toFixed(2)} USDC na BNB Chain...`,
        });
        if (bscPublicClient) {
          try {
            await withTimeout(
              bscPublicClient.simulateContract({
                account: checksumFrom,
                address: BNB_USDC_TOKEN.address,
                abi: erc20Abi,
                functionName: "transfer",
                args: [checksumSafe, rawDepositAmount],
              }),
              10_000,
              "Timeout na simulação RPC da BNB Chain.",
            );
          } catch (simErr) {
            if (!(simErr instanceof WalletTimeoutError)) {
              const rawMsg =
                simErr instanceof Error ? simErr.message.split("\n")[0] : "reversão na simulação";
              throw new Error(
                `Simulação na BNB Chain falhou (${rawMsg}). Verifique se há USDC e BNB para gás suficientes.`,
              );
            }
          }
          if (attemptRef.current !== attemptId) return;
        }
        updateStep("prepare", {
          status: "done",
          subtitle: `Saldo de ${parsedAmount.toFixed(2)} USDC validado na BNB Chain.`,
        });
      }

      // --- ETAPA FINAL ON-CHAIN: TRANSFERIR USDC PARA A SAFE (BNB CHAIN) ---
      currentStepId = "safe_transfer";
      updateStep("safe_transfer", {
        status: "waiting_wallet",
        subtitle: "Trocando carteira para BNB Smart Chain (confirme na carteira se aparecer)...",
      });
      await ensureWalletChain({
        currentChainId,
        targetChainId: SUPPORTED_CHAINS.BNB.id,
        targetChainLabel: "BNB Smart Chain",
        connector,
        switchChainAsync,
      });
      if (attemptRef.current !== attemptId) return;

      updateStep("safe_transfer", {
        status: "waiting_wallet",
        subtitle: `Confirme na sua carteira a transferência de ${depositUsdToRecord.toFixed(2)} USDC para a Safe.`,
      });
      console.info("[UnifiedDeposit] Enviando USDC para Safe", {
        from: checksumFrom,
        to: checksumSafe,
        rawDepositAmount: rawDepositAmount.toString(),
        depositUsdToRecord,
      });

      const depositHash = await writeContractAsync({
        account: checksumFrom,
        connector,
        address: BNB_USDC_TOKEN.address,
        abi: erc20Abi,
        functionName: "transfer",
        args: [checksumSafe, rawDepositAmount],
        chainId: SUPPORTED_CHAINS.BNB.id,
      });
      if (attemptRef.current !== attemptId) return;

      updateStep("safe_transfer", {
        status: "waiting_chain",
        txHash: depositHash,
        chainId: SUPPORTED_CHAINS.BNB.id,
        subtitle: "Transferência enviada! Aguardando confirmação na BNB Chain...",
      });

      if (bscPublicClient) {
        const receipt = await bscPublicClient.waitForTransactionReceipt({
          hash: depositHash,
          timeout: 90_000,
        });
        if (attemptRef.current !== attemptId) return;
        if (receipt.status !== "success") {
          throw new Error(
            `Transferência para a Safe falhou on-chain (reverted). Confira no BscScan: ${buildExplorerTxUrl(depositHash, SUPPORTED_CHAINS.BNB.id)}`,
          );
        }
      }

      updateStep("safe_transfer", {
        status: "done",
        txHash: depositHash,
        chainId: SUPPORTED_CHAINS.BNB.id,
        subtitle: `${depositUsdToRecord.toFixed(2)} USDC recebidos pela Safe!`,
      });

      // --- REGISTRAR NO BACKEND E EMITIR COTAS ---
      currentStepId = "record";
      updateStep("record", {
        status: "in_progress",
        subtitle: "Registrando comprovante on-chain e emitindo suas cotas...",
      });
      const res = await fundApi.recordDeposit({
        fromAddress: activeWallet,
        amountUsd: depositUsdToRecord,
        txHash: depositHash,
      });
      if (attemptRef.current !== attemptId) return;

      updateStep("record", {
        status: "done",
        subtitle: `+${formatShares(res.entry.sharesDelta)} cotas creditadas a US$ ${res.entry.navAtExecutionUsd.toFixed(4)}!`,
      });

      await Promise.all([onRefreshBalances(), onRefreshPortfolio()]);
      onSuccess(
        `Aporte completo! ${depositUsdToRecord.toFixed(2)} USDC transferidos para a Safe e +${formatShares(res.entry.sharesDelta)} cotas emitidas na sua conta.`,
      );
    } catch (err) {
      console.error("[UnifiedDeposit] Erro na etapa", currentStepId, err);
      const message = err instanceof Error ? err.message : "Erro ao processar aporte contínuo.";
      if (attemptRef.current === attemptId) {
        updateStep(currentStepId, { status: "error", subtitle: message });
        onError(message);
      }
    } finally {
      if (attemptRef.current === attemptId) {
        setRunning(false);
        setWaitElapsedSec(0);
      }
    }
  }

  return (
    <div className="rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 via-slate-900/75 to-sky-500/10 p-6 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/15 px-3 py-0.5 text-[11px] font-semibold text-emerald-300">
            <Sparkles className="h-3.5 w-3.5" />
            Fluxo Único Automático
          </div>
          <h2 className="text-lg font-bold text-white">
            Trazer USDC e Depositar na Safe em 1 Fluxo Contínuo
          </h2>
          <p className="text-xs text-slate-300 leading-relaxed max-w-2xl">
            Escolha quanto deseja aportar da sua carteira conectada. O app busca seus USDC na{" "}
            <strong>Base</strong> e/ou na <strong>BNB Chain</strong>, guia cada confirmação na
            carteira e emite suas cotas na hora.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <a
            href={P2P_ME_CONFIG.appUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-slate-800 transition"
          >
            Comprar USDC via Pix
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
          {walletForBalances && (
            <button
              type="button"
              disabled={running}
              onClick={() => void onRefreshBalances()}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-200 hover:bg-slate-800 disabled:opacity-50 transition"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Atualizar saldos
            </button>
          )}
        </div>
      </div>

      {/* Resumo dos saldos na carteira conectada */}
      {walletForBalances ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4 text-xs">
          <div className="rounded-xl border border-slate-800 bg-slate-950/85 p-3.5 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-slate-400 inline-flex items-center gap-1">
                Carteira Conectada
                <InfoTip text="Seu endereço 0x... é o mesmo na Base e na BNB Smart Chain." />
              </p>
              <p className="font-mono text-slate-100 truncate mt-0.5">
                {shortenAddress(walletForBalances)}
              </p>
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
            <p className="text-slate-400">Disponível na Base</p>
            <p className="font-mono text-base font-semibold text-sky-300 mt-0.5 tabular-nums">
              {baseUsdcBalance.toFixed(2)} USDC
            </p>
            <p className="text-[11px] text-slate-400 mt-1">
              Gás:{" "}
              <span className={baseEthHuman < 0.0003 ? "text-amber-300" : "text-emerald-300"}>
                {baseEthHuman.toFixed(5)} ETH
              </span>
            </p>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950/85 p-3.5">
            <p className="text-slate-400">Disponível na BNB Chain</p>
            <p className="font-mono text-base font-semibold text-emerald-300 mt-0.5 tabular-nums">
              {bscUsdcBalance.toFixed(2)} USDC
            </p>
            <p className="text-[11px] text-slate-400 mt-1">
              Gás:{" "}
              <span className={bscBnbHuman < 0.0002 ? "text-amber-300" : "text-emerald-300"}>
                {bscBnbHuman.toFixed(5)} BNB
              </span>
            </p>
          </div>

          <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/25 p-3.5">
            <p className="text-emerald-200/80">Total na Carteira</p>
            <p className="font-mono text-lg font-bold text-white mt-0.5 tabular-nums">
              {totalWalletUsdc.toFixed(2)} USDC
            </p>
            <p className="text-[11px] text-emerald-300/80 mt-1">
              Base + BNB Chain prontos p/ uso
            </p>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-slate-700 bg-slate-950/60 p-4 text-xs text-slate-300 flex items-center gap-2">
          <Wallet className="h-4 w-4 text-emerald-400 shrink-0" />
          <span>
            Conecte sua carteira e clique em <strong>Assinar Login</strong> no topo da página para
            ver seus saldos e iniciar o aporte em 1 fluxo.
          </span>
        </div>
      )}

      {/* Formulário + Stepper Lado a Lado */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <form
          onSubmit={handleStartUnifiedFlow}
          className="lg:col-span-5 rounded-2xl border border-slate-800 bg-slate-950/80 p-5 space-y-4 h-fit"
        >
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-slate-200">
                Quanto deseja colocar no cofre? (USDC)
              </label>
              {totalWalletUsdc > 0 && !running && (
                <button
                  type="button"
                  onClick={() => setAmountInput(String(totalWalletUsdc))}
                  className="text-[11px] font-medium text-emerald-400 hover:underline"
                >
                  Máximo ({totalWalletUsdc.toFixed(2)})
                </button>
              )}
            </div>

            <input
              type="number"
              step="0.01"
              min="1"
              required
              disabled={running}
              value={amountInput}
              onChange={(e) => {
                setAmountInput(e.target.value);
                if (steps) setSteps(null);
              }}
              className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-lg font-semibold font-mono text-white focus:border-emerald-500 focus:outline-none disabled:opacity-60"
            />

            {totalWalletUsdc > 0 && !running && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {[0.25, 0.5, 1].map((pct) => {
                  const val = roundDown2(totalWalletUsdc * pct);
                  if (val < 1) return null;
                  return (
                    <button
                      key={pct}
                      type="button"
                      onClick={() => {
                        setAmountInput(String(val));
                        if (steps) setSteps(null);
                      }}
                      className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1 text-[11px] text-slate-300 hover:border-emerald-500/50 hover:text-white transition"
                    >
                      {pct === 1 ? "Tudo" : `${pct * 100}%`} ({val.toFixed(2)})
                    </button>
                  );
                })}
                {bscUsdcBalance >= 1 && baseUsdcBalance >= 1 && (
                  <button
                    type="button"
                    onClick={() => {
                      setAmountInput(String(roundDown2(bscUsdcBalance)));
                      if (steps) setSteps(null);
                    }}
                    className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] text-emerald-300 hover:bg-emerald-500/20 transition"
                  >
                    Só BNB ({roundDown2(bscUsdcBalance).toFixed(2)})
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Origem dos fundos & previsão */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 text-xs space-y-2">
            <div className="flex justify-between text-slate-400">
              <span>Vai usar da BNB Chain (direto):</span>
              <span className="font-mono text-emerald-300 tabular-nums">
                {usedFromBsc.toFixed(2)} USDC
              </span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>Vai trazer da Base (ponte OKX):</span>
              <span className="font-mono text-sky-300 tabular-nums">
                {neededFromBase.toFixed(2)} USDC
              </span>
            </div>
            <div className="border-t border-slate-800 pt-2 flex justify-between text-slate-400">
              <span>Cotas estimadas (+NAV US$ {navPerShareUsd.toFixed(4)}):</span>
              <span className="font-mono font-semibold text-white tabular-nums">
                +{formatShares(estimatedShares)} cotas
              </span>
            </div>
          </div>

          {isConnected && !isDemo && bscBnbWei !== undefined && bscBnbWei === 0n && (
            <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-[11px] text-amber-200 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-300" />
              <div>
                <p className="font-semibold text-amber-100">Sem BNB para taxa de gás</p>
                <p className="mt-0.5 leading-relaxed">
                  Você precisa de ~US$ 0,05 em BNB na BNB Chain para enviar USDC à Safe. Se quiser
                  apenas fazer a ponte da Base por enquanto, use a{" "}
                  <button
                    type="button"
                    onClick={onSwitchToManualTab}
                    className="underline font-semibold text-amber-100"
                  >
                    aba Passo a Passo
                  </button>
                  .
                </p>
              </div>
            </div>
          )}

          {!running ? (
            <button
              type="submit"
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 py-3 text-sm font-bold text-slate-950 hover:bg-emerald-400 transition shadow-lg shadow-emerald-500/15"
            >
              <ArrowRightLeft className="h-4 w-4" />
              {isDemo
                ? "Simular Fluxo Completo (1 Clique)"
                : needsBridge
                  ? "Trazer da Base & Depositar na Safe"
                  : "Depositar na Safe Agora"}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleCancelWait}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-rose-500/40 bg-rose-500/10 py-3 text-sm font-semibold text-rose-200 hover:bg-rose-500/20 transition"
            >
              <XCircle className="h-4 w-4" />
              Cancelar espera
            </button>
          )}

          <p className="text-[11px] text-slate-400 flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
            <span>
              Destino: cofre Safe <code className="text-slate-300">{shortenAddress(safeAddress)}</code>
            </span>
          </p>
        </form>

        {/* Stepper visual bonitinho mostrando cada confirmação na carteira */}
        <div className="lg:col-span-7 rounded-2xl border border-slate-800 bg-slate-950/80 p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-white">
                {running
                  ? "Executando seu aporte passo a passo"
                  : steps
                    ? "Resumo da execução"
                    : "O que você vai confirmar na carteira"}
              </h3>
              <p className="text-xs text-slate-400">
                {needsBridge
                  ? "Fluxo contínuo Base → BNB Chain → Safe Multisig"
                  : "Fluxo direto na BNB Smart Chain → Safe Multisig"}
              </p>
            </div>
            <span className="rounded-full border border-slate-700 bg-slate-900 px-2.5 py-0.5 text-[11px] text-slate-300">
              {visibleSteps.filter((s) => s.requiresWalletAction).length} confirmação(ões) na carteira
            </span>
          </div>

          {activeWalletStep && (
            <div className="rounded-xl border border-amber-400/50 bg-amber-500/15 px-4 py-3 text-xs text-amber-100 flex items-center gap-3 animate-pulse">
              <Wallet className="h-5 w-5 text-amber-300 shrink-0" />
              <div>
                <p className="font-bold text-amber-200">
                  Sua vez! Confirme na extensão ou app da sua carteira
                </p>
                <p className="text-amber-100/90 mt-0.5">{activeWalletStep.subtitle}</p>
              </div>
            </div>
          )}

          {!activeWalletStep && activeChainStep && (
            <div className="rounded-xl border border-sky-400/40 bg-sky-500/10 px-4 py-3 text-xs text-sky-100 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <Loader2 className="h-4 w-4 animate-spin text-sky-300 shrink-0" />
                <div>
                  <p className="font-semibold text-sky-200">Processando na blockchain...</p>
                  <p className="text-sky-100/90 mt-0.5">{activeChainStep.subtitle}</p>
                </div>
              </div>
              {waitElapsedSec > 0 && (
                <span className="font-mono text-xs text-sky-300 shrink-0 inline-flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  {formatElapsed(waitElapsedSec)}
                </span>
              )}
            </div>
          )}

          <ol className="space-y-2.5">
            {visibleSteps.map((step, index) => {
              const isWallet = step.status === "waiting_wallet";
              const isWorking = step.status === "in_progress" || step.status === "waiting_chain";
              const isDone = step.status === "done";
              const isSkipped = step.status === "skipped";
              const isError = step.status === "error";

              return (
                <li
                  key={step.id}
                  className={`rounded-xl border p-3.5 transition ${
                    isWallet
                      ? "border-amber-400/60 bg-amber-500/10"
                      : isWorking
                        ? "border-sky-500/50 bg-sky-500/10"
                        : isDone
                          ? "border-emerald-500/40 bg-emerald-500/10"
                          : isError
                            ? "border-rose-500/50 bg-rose-500/10"
                            : "border-slate-800/90 bg-slate-900/50"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                        isDone
                          ? "bg-emerald-500 text-slate-950"
                          : isSkipped
                            ? "bg-slate-700 text-slate-300"
                            : isWallet
                              ? "bg-amber-400 text-slate-950"
                              : isWorking
                                ? "bg-sky-400 text-slate-950"
                                : isError
                                  ? "bg-rose-500 text-white"
                                  : "bg-slate-800 text-slate-400"
                      }`}
                    >
                      {isDone ? (
                        <CheckCircle2 className="h-4 w-4" />
                      ) : isWorking ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : isWallet ? (
                        <Wallet className="h-3.5 w-3.5" />
                      ) : isError ? (
                        <XCircle className="h-4 w-4" />
                      ) : (
                        index + 1
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span
                          className={`text-xs font-semibold ${
                            isDone
                              ? "text-emerald-200"
                              : isSkipped
                                ? "text-slate-400 line-through"
                                : isWallet
                                  ? "text-amber-200"
                                  : isError
                                    ? "text-rose-200"
                                    : "text-white"
                          }`}
                        >
                          {step.title}
                        </span>

                        {step.requiresWalletAction && !isDone && !isSkipped && (
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                              isWallet
                                ? "bg-amber-400 text-slate-950"
                                : "border border-amber-500/30 bg-amber-500/10 text-amber-300"
                            }`}
                          >
                            {isWallet ? "Confirme agora na carteira" : "Pede assinatura"}
                          </span>
                        )}
                      </div>

                      <p className="mt-1 text-[11px] text-slate-300/90 leading-relaxed">
                        {step.subtitle}
                      </p>

                      {step.txHash && step.chainId && (
                        <a
                          href={buildExplorerTxUrl(step.txHash, step.chainId)}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-1.5 inline-flex items-center gap-1 font-mono text-[11px] text-emerald-300 underline hover:text-emerald-200"
                        >
                          Ver transação ({shortenAddress(step.txHash)})
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </div>
  );
}
