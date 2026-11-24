import {
  BNB_USDC_TOKEN,
  BNB_VAULT_TOKENS,
  fromRawUnits,
  ONDO_STOCK_TOKENS,
  toRawUnits,
  type EvmAddress,
} from "@pertufundos/shared";
import { createPublicClient, erc20Abi, formatUnits, http, parseAbi, parseEventLogs } from "viem";
import { bsc } from "viem/chains";
import type { AppConfig } from "../../config/env.js";
import { GuardrailError } from "../../domain/errors.js";
import type { IFundRepository } from "../../application/ports/fund-repository.port.js";
import type {
  IVaultReader,
  RawTokenSnapshot,
  VerifiedOnChainDeposit,
} from "../../application/ports/vault-reader.port.js";

const DEMO_SAFE_PLACEHOLDER = "0x1111111111111111111111111111111111111111";

const ondoSharesOracleAbi = parseAbi([
  "function getSValueBatch(address[] assets) view returns (uint256[] sValues, bool[] paused)",
]);

const safeContractAbi = parseAbi([
  "function getOwners() view returns (address[])",
  "event ExecutionSuccess(bytes32 txHash, uint256 payment)",
]);

export class ViemVaultReader implements IVaultReader {
  private readonly publicClient;

  constructor(
    private readonly config: AppConfig,
    private readonly repository: IFundRepository,
  ) {
    this.publicClient = createPublicClient({
      chain: bsc,
      transport: http(config.BSC_RPC_URL, { timeout: 10_000 }),
    });
  }

  isDemoSafe(safeAddress: EvmAddress): boolean {
    return safeAddress.toLowerCase() === DEMO_SAFE_PLACEHOLDER;
  }

  async readSafeOwners(safeAddress: EvmAddress): Promise<EvmAddress[]> {
    if (this.isDemoSafe(safeAddress)) {
      return [];
    }
    const owners = await this.publicClient.readContract({
      address: safeAddress,
      abi: safeContractAbi,
      functionName: "getOwners",
    });
    return owners.map((addr) => addr.toLowerCase() as EvmAddress);
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

  async readVaultBalances(safeAddress: EvmAddress): Promise<RawTokenSnapshot[]> {
    if (this.isDemoSafe(safeAddress)) {
      return this.buildSimulatedDemoBalances();
    }

    const [balances, multipliers] = await Promise.all([
      Promise.all(
        BNB_VAULT_TOKENS.map((token) =>
          this.publicClient.readContract({
            address: token.address,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [safeAddress],
          }),
        ),
      ),
      this.readOndoMultipliers(),
    ]);

    return BNB_VAULT_TOKENS.map((token, idx) => ({
      token,
      rawBalance: balances[idx] ?? 0n,
      sharesMultiplier: multipliers.get(token.address.toLowerCase()) ?? 1.0,
    }));
  }

  async readAllowance(params: {
    tokenAddress: EvmAddress;
    ownerAddress: EvmAddress;
    spenderAddress: EvmAddress;
  }): Promise<bigint> {
    if (this.isDemoSafe(params.ownerAddress)) {
      return 0n;
    }

    return this.publicClient.readContract({
      address: params.tokenAddress,
      abi: erc20Abi,
      functionName: "allowance",
      args: [params.ownerAddress, params.spenderAddress],
    });
  }

  private async readOndoMultipliers(): Promise<Map<string, number>> {
    const result = new Map<string, number>();
    const oracleAddress = this.config.ONDO_SHARES_ORACLE_ADDRESS;
    if (!oracleAddress || !/^0x[a-fA-F0-9]{40}$/.test(oracleAddress)) {
      return result;
    }

    try {
      const stockAddresses = ONDO_STOCK_TOKENS.map((t) => t.address);
      const [sValues] = await this.publicClient.readContract({
        address: oracleAddress as EvmAddress,
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

  private async buildSimulatedDemoBalances(): Promise<RawTokenSnapshot[]> {
    const [members, executedProposals] = await Promise.all([
      this.repository.listMembers(),
      this.repository.listProposals("EXECUTED"),
    ]);

    let usdcBalance = members.reduce(
      (acc, m) => acc + (m.totalDepositedUsd - m.totalRedeemedUsd),
      0,
    );

    const stockBalances = new Map<string, number>(
      ONDO_STOCK_TOKENS.map((t) => [t.symbol, 0]),
    );

    for (const p of executedProposals) {
      const token = ONDO_STOCK_TOKENS.find((t) => t.symbol === p.assetSymbol);
      if (!token) continue;
      if (p.type === "BUY_ASSET") {
        usdcBalance = Math.max(0, usdcBalance - p.amount);
        const boughtUnits = p.amount / token.referencePriceUsd;
        stockBalances.set(token.symbol, (stockBalances.get(token.symbol) ?? 0) + boughtUnits * 1.035);
      } else if (p.type === "SELL_ASSET") {
        const current = stockBalances.get(token.symbol) ?? 0;
        const sold = Math.min(current, p.amount);
        stockBalances.set(token.symbol, current - sold);
        usdcBalance += sold * token.referencePriceUsd;
      }
    }

    const demoMultipliers: Record<string, number> = {
      NVDAon: 1.0012,
      AAPLon: 1.0054,
      MSFTon: 1.0078,
      QQQon: 1.0041,
    };

    return BNB_VAULT_TOKENS.map((token) => {
      if (token.address.toLowerCase() === BNB_USDC_TOKEN.address.toLowerCase()) {
        return {
          token,
          rawBalance: toRawUnits(Math.max(0, usdcBalance), token.decimals),
          sharesMultiplier: 1.0,
        };
      }
      const qty = stockBalances.get(token.symbol) ?? 0;
      return {
        token,
        rawBalance: toRawUnits(Math.max(0, qty), token.decimals),
        sharesMultiplier: demoMultipliers[token.symbol] ?? 1.0,
      };
    });
  }
}
