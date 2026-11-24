import type { EvmAddress, TokenMetadata } from "@pertufundos/shared";

export interface RawTokenSnapshot {
  readonly token: TokenMetadata;
  readonly rawBalance: bigint;
  /** Multiplicador Ondo (sValue) retornado pelo SyntheticSharesOracle (1.0 se padrão/USDC) */
  readonly sharesMultiplier: number;
}

export interface VerifiedOnChainDeposit {
  readonly fromAddress: EvmAddress;
  readonly amountUsd: number;
}

export interface IVaultReader {
  isDemoSafe(safeAddress: EvmAddress): boolean;
  readVaultBalances(safeAddress: EvmAddress): Promise<RawTokenSnapshot[]>;
  readSafeOwners(safeAddress: EvmAddress): Promise<EvmAddress[]>;
  verifyUsdcDepositTx(params: {
    txHash: `0x${string}`;
    safeAddress: EvmAddress;
  }): Promise<VerifiedOnChainDeposit>;
  verifySafeExecutionTx(params: {
    txHash: `0x${string}`;
    safeAddress: EvmAddress;
  }): Promise<boolean>;
  readAllowance(params: {
    tokenAddress: EvmAddress;
    ownerAddress: EvmAddress;
    spenderAddress: EvmAddress;
  }): Promise<bigint>;
}
