import type { SwitchChainMutateAsync } from "wagmi/query";
import type { Config } from "wagmi";

export class WalletTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WalletTimeoutError";
  }
}

export async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  timeoutMessage: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new WalletTimeoutError(timeoutMessage)), ms);
      }),
    ]);
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}

export async function ensureWalletChain(params: {
  currentChainId: number | undefined;
  targetChainId: number;
  targetChainLabel: string;
  connector?: {
    id?: string;
    getChainId?: () => Promise<number>;
  };
  switchChainAsync: SwitchChainMutateAsync<Config, unknown> | undefined;
}): Promise<void> {
  const { currentChainId, targetChainId, targetChainLabel, connector, switchChainAsync } = params;

  const liveChainId =
    typeof connector?.getChainId === "function"
      ? await withTimeout(
          connector.getChainId(),
          5_000,
          "Timeout ao consultar rede atual da carteira.",
        ).catch((err) => {
          console.warn("[Wallet] getChainId falhou/expirou; usando currentChainId:", currentChainId, err);
          return currentChainId;
        })
      : currentChainId;

  console.info("[Wallet] ensureWalletChain", {
    connectorId: connector?.id,
    currentChainId,
    liveChainId,
    targetChainId,
  });

  if (liveChainId === targetChainId || !switchChainAsync) {
    return;
  }

  try {
    await withTimeout(
      switchChainAsync({ chainId: targetChainId }),
      15_000,
      `Tempo esgotado ao trocar sua carteira para a rede ${targetChainLabel}. Selecione a rede ${targetChainLabel} manualmente na carteira e tente novamente.`,
    );
    console.info("[Wallet] Rede alterada com sucesso para", targetChainId);
  } catch (err) {
    if (err instanceof WalletTimeoutError && connector?.id === "walletConnect") {
      console.warn("[Wallet] switchChain expirou em WalletConnect; prosseguindo para prompt de transação.");
      return;
    }
    throw err;
  }
}
