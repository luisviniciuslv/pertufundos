import {
  BNB_USDC_TOKEN,
  BNB_VAULT_TOKENS,
  fromRawUnits,
  ONDO_STOCK_TOKENS,
  SUPPORTED_CHAINS,
  toRawUnits,
  type EvmAddress,
  type TokenMetadata,
} from "@pertufundos/shared";
import { createPublicClient, erc20Abi, formatUnits, getAddress, http, parseAbi, parseEventLogs } from "viem";
import { base, bsc } from "viem/chains";
import type { AppConfig } from "../../config/env.js";
import { DomainError, GuardrailError } from "../../domain/errors.js";
import type { IFundRepository } from "../../application/ports/fund-repository.port.js";
import type {
  IVaultReader,
  RawTokenSnapshot,
  VerifiedOnChainDeposit,
} from "../../application/ports/vault-reader.port.js";

const DEMO_SAFE_PLACEHOLDER = "0x1111111111111111111111111111111111111111";

/** Normaliza qualquer endereço 0x... para EIP-55 checksum válido exigido pelo `viem`. */
function toChecksumAddress(address: string): EvmAddress {
  try {
    return getAddress(address.toLowerCase());
  } catch {
    throw new DomainError(`Endereço EVM inválido: ${address}`, 400, "INVALID_EVM_ADDRESS");
  }
}

const ondoSharesOracleAbi = parseAbi([
  "function getSValueBatch(address[] assets) view returns (uint256[] sValues, bool[] paused)",
]);

const safeContractAbi = parseAbi([
  "function getOwners() view returns (address[])",
  "event ExecutionSuccess(bytes32 txHash, uint256 payment)",
]);

export class ViemVaultReader implements IVaultReader {
  private readonly publicClient;
  private readonly basePublicClient;

  constructor(
    private readonly config: AppConfig,
    private readonly repository: IFundRepository,
  ) {
    this.publicClient = createPublicClient({
      chain: bsc,
      transport: http(config.BSC_RPC_URL, { timeout: 10_000 }),
    });
    this.basePublicClient = createPublicClient({
      chain: base,
      transport: http(config.BASE_RPC_URL, { timeout: 10_000 }),
    });
  }

  isDemoSafe(safeAddress: EvmAddress): boolean {
    return safeAddress.toLowerCase() === DEMO_SAFE_PLACEHOLDER;
  }

  async readSafeOwners(safeAddress: EvmAddress): Promise<EvmAddress[]> {
    if (this.isDemoSafe(safeAddress)) {
      return [];
    }
    const checksumSafe = toChecksumAddress(safeAddress);
    try {
      const owners = await this.publicClient.readContract({
        address: checksumSafe,
        abi: safeContractAbi,
        functionName: "getOwners",
      });
      return owners.map((addr) => addr.toLowerCase() as EvmAddress);
    } catch {
      throw new DomainError(
        `O endereço SAFE_ADDRESS (${checksumSafe}) não é um contrato Safe Multisig na BNB Smart Chain (getOwners() falhou). Crie a Safe em app.safe.global (rede BNB Smart Chain) e configure o endereço do cofre em SAFE_ADDRESS e NEXT_PUBLIC_SAFE_ADDRESS.`,
        422,
        "INVALID_SAFE_CONTRACT",
      );
    }
  }

  async readTokenMetadataOnChain(tokenAddress: EvmAddress): Promise<{
    symbol: string;
    name: string;
    decimals: number;
  }> {
    const checksumAddress = toChecksumAddress(tokenAddress);
    try {
      const [symbol, name, decimals] = await Promise.all([
        this.publicClient.readContract({
          address: checksumAddress,
          abi: erc20Abi,
          functionName: "symbol",
        }),
        this.publicClient.readContract({
          address: checksumAddress,
          abi: erc20Abi,
          functionName: "name",
        }),
        this.publicClient.readContract({
          address: checksumAddress,
          abi: erc20Abi,
          functionName: "decimals",
        }),
      ]);
      return { symbol, name, decimals: Number(decimals) };
    } catch {
      throw new GuardrailError(
        `Não foi possível ler metadados ERC-20/BEP-20 do contrato ${tokenAddress} na BNB Chain. Verifique se o endereço está correto.`,
      );
    }
  }

  /**
   * Em produção, valida diretamente na blockchain (BNB Chain) que a transação:
   * 1) Foi minerada com sucesso (`status === 'success'`);
   * 2) Emitiu um log real `Transfer` no contrato oficial do USDC para o endereço da Safe;
   * 3) Extrai o valor exato transferido on-chain (nunca confiando em valores digitados no cliente).
   */
  async verifyUsdcDepositTx(params: {
    txHash: `0x${string}`;
    safeAddress: EvmAddress;
  }): Promise<VerifiedOnChainDeposit> {
    const receipt = await this.publicClient
      .getTransactionReceipt({ hash: params.txHash })
      .catch(() => null);

    if (!receipt || receipt.status !== "success") {
      throw new GuardrailError(
        "Transação não encontrada ou revertida na BNB Chain. Aguarde a confirmação do bloco.",
      );
    }

    const usdcLogs = receipt.logs.filter(
      (log) => log.address.toLowerCase() === BNB_USDC_TOKEN.address.toLowerCase(),
    );

    const transfers = parseEventLogs({
      abi: erc20Abi,
      eventName: "Transfer",
      logs: usdcLogs,
    });

    const matchingTransfer = transfers.find(
      (t) => t.args.to.toLowerCase() === params.safeAddress.toLowerCase() && t.args.value > 0n,
    );

    if (!matchingTransfer) {
      throw new GuardrailError(
        "Esta transação não contém uma transferência válida de USDC destinada ao cofre da Safe.",
      );
    }

    return {
      fromAddress: matchingTransfer.args.from.toLowerCase() as EvmAddress,
      amountUsd: fromRawUnits(matchingTransfer.args.value, BNB_USDC_TOKEN.decimals),
    };
  }

  /**
   * Em produção, comprova on-chain que a transação multisig executou com `ExecutionSuccess` na Safe.
   */
  async verifySafeExecutionTx(params: {
    txHash: `0x${string}`;
    safeAddress: EvmAddress;
  }): Promise<boolean> {
    if (this.isDemoSafe(params.safeAddress)) {
      return true;
    }

    const receipt = await this.publicClient
      .getTransactionReceipt({ hash: params.txHash })
      .catch(() => null);

    if (!receipt || receipt.status !== "success") {
      throw new GuardrailError(
        "A transação informada ainda não foi confirmada com sucesso na BNB Chain.",
      );
    }

    const safeLogs = receipt.logs.filter(
      (log) => log.address.toLowerCase() === params.safeAddress.toLowerCase(),
    );

    const execEvents = parseEventLogs({
      abi: safeContractAbi,
      eventName: "ExecutionSuccess",
      logs: safeLogs,
    });

    if (execEvents.length === 0) {
      throw new GuardrailError(
        "A transação informada não contém confirmação de execução (`ExecutionSuccess`) do contrato da Safe.",
      );
    }

    return true;
  }

  async readVaultBalances(
    safeAddress: EvmAddress,
    extraTokens: readonly TokenMetadata[] = [],
  ): Promise<RawTokenSnapshot[]> {
    const mergedMap = new Map<string, TokenMetadata>();
    for (const t of [...BNB_VAULT_TOKENS, ...extraTokens]) {
      mergedMap.set(t.address.toLowerCase(), t);
    }
    const allVaultTokens = [...mergedMap.values()];

    if (this.isDemoSafe(safeAddress)) {
      return this.buildSimulatedDemoBalances(allVaultTokens);
    }

    const checksumSafe = toChecksumAddress(safeAddress);
    const [balances, multipliers] = await Promise.all([
      Promise.all(
        allVaultTokens.map((token) =>
          this.publicClient.readContract({
            address: toChecksumAddress(token.address),
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [checksumSafe],
          }),
        ),
      ),
      this.readOndoMultipliers(allVaultTokens),
    ]);

    return allVaultTokens.map((token, idx) => ({
      token,
      rawBalance: balances[idx] ?? 0n,
      sharesMultiplier: multipliers.get(token.address.toLowerCase()) ?? 1.0,
    }));
  }

  async readAllowance(params: {
    tokenAddress: EvmAddress;
    ownerAddress: EvmAddress;
    spenderAddress: EvmAddress;
    chainId?: number;
  }): Promise<bigint> {
    if (this.isDemoSafe(params.ownerAddress)) {
      return 0n;
    }

    const client =
      params.chainId === SUPPORTED_CHAINS.BASE.id ? this.basePublicClient : this.publicClient;

    return client.readContract({
      address: toChecksumAddress(params.tokenAddress),
      abi: erc20Abi,
      functionName: "allowance",
      args: [toChecksumAddress(params.ownerAddress), toChecksumAddress(params.spenderAddress)],
    });
  }

  private async readOndoMultipliers(
    vaultTokens: readonly TokenMetadata[],
  ): Promise<Map<string, number>> {
    const result = new Map<string, number>();
    const oracleAddress = this.config.ONDO_SHARES_ORACLE_ADDRESS;
    if (!oracleAddress || !/^0x[a-fA-F0-9]{40}$/.test(oracleAddress)) {
      return result;
    }

    try {
      const stockAddresses = vaultTokens
        .filter((t) => t.category === "ONDO_STOCK")
        .map((t) => toChecksumAddress(t.address));
      if (stockAddresses.length === 0) return result;

      const [sValues] = await this.publicClient.readContract({
        address: toChecksumAddress(oracleAddress),
        abi: ondoSharesOracleAbi,
        functionName: "getSValueBatch",
        args: [stockAddresses],
      });

      stockAddresses.forEach((addr, idx) => {
        const rawVal = sValues[idx];
        if (rawVal && rawVal > 0n) {
          result.set(addr.toLowerCase(), Number(formatUnits(rawVal, 18)));
        }
      });
    } catch {
      // Caso o oráculo esteja indisponível temporariamente, preserva multiplicador 1.0 sem travar leitura
    }

    return result;
  }

  private async buildSimulatedDemoBalances(
    allVaultTokens: readonly TokenMetadata[],
  ): Promise<RawTokenSnapshot[]> {
    const [members, executedProposals] = await Promise.all([
      this.repository.listMembers(),
      this.repository.listProposals("EXECUTED"),
    ]);

    let usdcBalance = members.reduce(
      (acc, m) => acc + (m.totalDepositedUsd - m.totalRedeemedUsd),
      0,
    );

    const assetBalances = new Map<string, number>(
      allVaultTokens
        .filter((t) => t.category !== "STABLECOIN")
        .map((t) => [t.symbol.toLowerCase(), 0]),
    );

    for (const p of executedProposals) {
      const token = allVaultTokens.find(
        (t) => t.symbol.toLowerCase() === p.assetSymbol.toLowerCase(),
      );
      if (!token || token.category === "STABLECOIN") continue;
      const key = token.symbol.toLowerCase();
      if (p.type === "BUY_ASSET") {
        usdcBalance = Math.max(0, usdcBalance - p.amount);
        const boughtUnits = p.amount / token.referencePriceUsd;
        assetBalances.set(key, (assetBalances.get(key) ?? 0) + boughtUnits * 1.035);
      } else if (p.type === "SELL_ASSET") {
        const current = assetBalances.get(key) ?? 0;
        const sold = Math.min(current, p.amount);
        assetBalances.set(key, current - sold);
        usdcBalance += sold * token.referencePriceUsd;
      }
    }

    const demoMultipliers: Record<string, number> = {
      NVDAon: 1.0012,
      AAPLon: 1.0054,
      MSFTon: 1.0078,
      QQQon: 1.0041,
    };

    return allVaultTokens
      .filter((token) => {
        if (token.address.toLowerCase() === BNB_USDC_TOKEN.address.toLowerCase()) return true;
        const qty = assetBalances.get(token.symbol.toLowerCase()) ?? 0;
        // No modo demo, exibe os 4 ativos iniciais ou qualquer ativo que já possua saldo > 0
        return qty > 0 || ["NVDAon", "AAPLon", "MSFTon", "QQQon", "BTCB", "ETH"].includes(token.symbol);
      })
      .map((token) => {
        if (token.address.toLowerCase() === BNB_USDC_TOKEN.address.toLowerCase()) {
          return {
            token,
            rawBalance: toRawUnits(Math.max(0, usdcBalance), token.decimals),
            sharesMultiplier: 1.0,
          };
        }
        const qty = assetBalances.get(token.symbol.toLowerCase()) ?? 0;
        return {
          token,
          rawBalance: toRawUnits(Math.max(0, qty), token.decimals),
          sharesMultiplier: demoMultipliers[token.symbol] ?? 1.0,
        };
      });
  }
}
