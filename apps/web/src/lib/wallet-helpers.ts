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
  connectorId: string | undefined;
  switchChainAsync: SwitchChainMutateAsync<Config, unknown> | undefined;
}): Promise<void> {
  const { currentChainId, targetChainId, targetChainLabel, connectorId, switchChainAsync } =
    params;

  if (currentChainId === targetChainId || !switchChainAsync) {
    return;
  }

  try {
    await withTimeout(
      switchChainAsync({ chainId: targetChainId }),
      12_000,
      `Tempo esgotado ao trocar sua carteira para a rede ${targetChainLabel}. Selecione a rede ${targetChainLabel} manualmente na carteira e tente novamente.`,
    );
  } catch (err) {
    // Em sessões WalletConnect, muitos apps móveis já operam na rede ou ignoram wallet_switchEthereumChain sem emitir chainChanged
    if (err instanceof WalletTimeoutError && connectorId === "walletConnect") {
      return;
    }
    throw err;
  }
}
