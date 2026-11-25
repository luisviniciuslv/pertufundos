import type { Eip1193Provider } from "@safe-global/protocol-kit";
import type { EvmAddress, PreparedSafeBatch } from "@pertufundos/shared";
import { getAddress } from "viem";

const DEMO_SAFE_PLACEHOLDER = "0x1111111111111111111111111111111111111111";

let runtimeSafeApiKey = "";

export function setRuntimeSafeApiKey(apiKey?: string): void {
  const trimmed = apiKey?.trim();
  if (trimmed) {
    runtimeSafeApiKey = trimmed;
  }
}

async function initSafeKits(params: {
  provider: Eip1193Provider;
  signerAddress: EvmAddress;
  safeAddress: EvmAddress;
  chainId: number;
}) {
  const [{ default: Safe }, { default: SafeApiKit }, { OperationType }] = await Promise.all([
    import("@safe-global/protocol-kit"),
    import("@safe-global/api-kit"),
    import("@safe-global/types-kit"),
  ]);

  const checksumSigner = getAddress(params.signerAddress.toLowerCase()) as EvmAddress;
  const checksumSafe = getAddress(params.safeAddress.toLowerCase()) as EvmAddress;

  const protocolKit = await Safe.init({
    provider: params.provider,
    signer: checksumSigner,
    safeAddress: checksumSafe,
  });

  const safeApiKey = runtimeSafeApiKey || process.env.NEXT_PUBLIC_SAFE_API_KEY?.trim() || "";
  const apiKit = new SafeApiKit({
    chainId: BigInt(params.chainId),
    ...(safeApiKey ? { apiKey: safeApiKey } : {}),
  });

  return { protocolKit, apiKit, OperationType, checksumSigner, checksumSafe };
}

function randomHexHash(): string {
  return `0x${Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join("")}`;
}

/**
 * Cliente Browser-side para propor, confirmar e executar transações na fila da Safe Multisig.
 * Nenhuma chave privada jamais sai da carteira (Rabby / MetaMask) do usuário.
 */
export const safeMultisigClient = {
  isDemoSafe(safeAddress: string): boolean {
    return safeAddress.toLowerCase() === DEMO_SAFE_PLACEHOLDER;
  },

  async proposeBatchToSafe(params: {
    provider: Eip1193Provider | undefined;
    signerAddress: EvmAddress;
    batch: PreparedSafeBatch;
  }): Promise<{ safeTxHash: string; simulated: boolean }> {
    const { provider, signerAddress, batch } = params;

    if (this.isDemoSafe(batch.safeAddress) || !provider) {
      return { safeTxHash: randomHexHash(), simulated: true };
    }

    const { protocolKit, apiKit, OperationType, checksumSigner, checksumSafe } = await initSafeKits({
      provider,
      signerAddress,
      safeAddress: batch.safeAddress,
      chainId: batch.chainId,
    });

    const safeTransaction = await protocolKit.createTransaction({
      transactions: batch.transactions.map((tx) => ({
        to: tx.to,
        value: tx.value,
        data: tx.data,
        operation: tx.operation === 1 ? OperationType.DelegateCall : OperationType.Call,
      })),
    });

    const safeTxHash = await protocolKit.getTransactionHash(safeTransaction);
    const signature = await protocolKit.signHash(safeTxHash);

    await apiKit.proposeTransaction({
      safeAddress: checksumSafe,
      safeTransactionData: safeTransaction.data,
      safeTxHash,
      senderAddress: checksumSigner,
      senderSignature: signature.data,
      origin: "Pertufundos Collective Vault",
    });

    return { safeTxHash, simulated: false };
  },

  async confirmSafeTransaction(params: {
    provider: Eip1193Provider | undefined;
    signerAddress: EvmAddress;
    safeAddress: EvmAddress;
    chainId: number;
    safeTxHash: string;
  }): Promise<{ simulated: boolean }> {
    const { provider, signerAddress, safeAddress, chainId, safeTxHash } = params;
    if (this.isDemoSafe(safeAddress) || !provider) {
      return { simulated: true };
    }

    const { protocolKit, apiKit } = await initSafeKits({
      provider,
      signerAddress,
      safeAddress,
      chainId,
    });

    const signature = await protocolKit.signHash(safeTxHash);
    await apiKit.confirmTransaction(safeTxHash, signature.data);
    return { simulated: false };
  },

  async executeSafeTransaction(params: {
    provider: Eip1193Provider | undefined;
    signerAddress: EvmAddress;
    safeAddress: EvmAddress;
    chainId: number;
    safeTxHash: string;
  }): Promise<{ executionTxHash: string; simulated: boolean }> {
    const { provider, signerAddress, safeAddress, chainId, safeTxHash } = params;
    if (this.isDemoSafe(safeAddress) || !provider) {
      return { executionTxHash: randomHexHash(), simulated: true };
    }

    const { protocolKit, apiKit } = await initSafeKits({
      provider,
      signerAddress,
      safeAddress,
      chainId,
    });

    const multisigTx = await apiKit.getTransaction(safeTxHash);
    const execResult = await protocolKit.executeTransaction(multisigTx);

    return {
      executionTxHash: execResult.hash,
      simulated: false,
    };
  },
};
