import crypto from "node:crypto";
import {
  BASE_USDC_TOKEN,
  BNB_USDC_TOKEN,
  CURATED_INVESTABLE_TOKENS,
  fromRawUnits,
  inferTokenCategory,
  SUPPORTED_CHAINS,
  toRawUnits,
  type DexQuoteSummary,
  type EvmAddress,
  type SafeMetaTx,
  type TokenMetadata,
} from "@pertufundos/shared";
import { encodeFunctionData, erc20Abi } from "viem";
import type { AppConfig } from "../../config/env.js";
import { DomainError } from "../../domain/errors.js";
import type {
  IDexGateway,
  SwapBundleResult,
  TokenPriceResult,
} from "../../application/ports/dex-gateway.port.js";

const SIMULATED_OKX_ROUTER: EvmAddress = "0x1111111254fb6c44bac0bed2854e76f90643097d";

interface OkxApiResponse<T> {
  code: string;
  msg: string;
  data: T[];
}

const SIMULATED_EXTRA_OKX_TOKENS: readonly TokenMetadata[] = [
  {
    symbol: "SOL",
    name: "Solana (BNB Chain Peg)",
    address: "0x570a5d26f7765ecb712c0924e4de545b89fd43df",
    chainId: SUPPORTED_CHAINS.BNB.id,
    decimals: 18,
    category: "CRYPTO",
    referencePriceUsd: 192.0,
  },
  {
    symbol: "LINK",
    name: "Chainlink Token",
    address: "0xf8a0bf9cf54bb92f17374d9e9a321e6a111a51bd",
    chainId: SUPPORTED_CHAINS.BNB.id,
    decimals: 18,
    category: "CRYPTO",
    referencePriceUsd: 18.4,
  },
  {
    symbol: "AAVE",
    name: "Aave Token (BNB Chain)",
    address: "0xfb6115445bff7b52feb98650c87f44907e58f802",
    chainId: SUPPORTED_CHAINS.BNB.id,
    decimals: 18,
    category: "CRYPTO",
    referencePriceUsd: 265.0,
  },
  {
    symbol: "UNI",
    name: "Uniswap (BNB Chain)",
    address: "0xbf5140a22578168fd562dccf235e5d43a02ce9b1",
    chainId: SUPPORTED_CHAINS.BNB.id,
    decimals: 18,
    category: "CRYPTO",
    referencePriceUsd: 11.8,
  },
  {
    symbol: "XRP",
    name: "XRP (BNB Chain Peg)",
    address: "0x1d2f0da169ceb9fc7b3144628db156f3f6c60dbe",
    chainId: SUPPORTED_CHAINS.BNB.id,
    decimals: 18,
    category: "CRYPTO",
    referencePriceUsd: 2.35,
  },
];

export class OkxDexGateway implements IDexGateway {
  private cachedChainTokens: { expiresAt: number; items: TokenMetadata[] } | null = null;

  constructor(private readonly config: AppConfig) {}

  private get hasLiveCredentials(): boolean {
    return Boolean(
      this.config.OKX_API_KEY &&
        this.config.OKX_SECRET_KEY &&
        this.config.OKX_API_PASSPHRASE,
    );
  }

  async listAllChainTokens(): Promise<TokenMetadata[]> {
    if (this.cachedChainTokens && this.cachedChainTokens.expiresAt > Date.now()) {
      return this.cachedChainTokens.items;
    }

    if (!this.hasLiveCredentials) {
      return [...CURATED_INVESTABLE_TOKENS, ...SIMULATED_EXTRA_OKX_TOKENS];
    }

    try {
      const data = await this.requestOkx<{
        decimals: string;
        tokenContractAddress: string;
        tokenLogoUrl?: string;
        tokenName: string;
        tokenSymbol: string;
      }>("GET", "/api/v6/dex/aggregator/all-tokens", {
        chainIndex: SUPPORTED_CHAINS.BNB.okxChainIndex,
      });

      const items: TokenMetadata[] = data
        .filter((item) => /^0x[a-fA-F0-9]{40}$/.test(item.tokenContractAddress))
        .map((item) => ({
          symbol: item.tokenSymbol,
          name: item.tokenName,
          address: item.tokenContractAddress.toLowerCase() as EvmAddress,
          chainId: SUPPORTED_CHAINS.BNB.id,
          decimals: Number(item.decimals) || 18,
          category: inferTokenCategory(item.tokenSymbol, item.tokenName),
          logoUrl: item.tokenLogoUrl,
          referencePriceUsd: 1.0,
        }));

      this.cachedChainTokens = {
        expiresAt: Date.now() + 15 * 60 * 1000,
        items,
      };
      return items;
    } catch {
      return [...CURATED_INVESTABLE_TOKENS, ...SIMULATED_EXTRA_OKX_TOKENS];
    }
  }

  async getUnitPriceUsd(token: TokenMetadata): Promise<TokenPriceResult> {
    if (token.category === "STABLECOIN") {
      return { unitPriceUsd: 1.0, source: "OKX_LIVE" };
    }

    if (!this.hasLiveCredentials) {
      return { unitPriceUsd: token.referencePriceUsd, source: "FALLBACK_DEMO" };
    }

    try {
      const oneUnitRaw = toRawUnits(1, token.decimals).toString();
      const quote = await this.requestOkx<{
        toTokenAmount: string;
      }>("GET", "/api/v6/dex/aggregator/quote", {
        chainIndex: SUPPORTED_CHAINS.BNB.okxChainIndex,
        fromTokenAddress: token.address,
        toTokenAddress: BNB_USDC_TOKEN.address,
        amount: oneUnitRaw,
      });

      const first = quote[0];
      if (!first?.toTokenAmount) {
        return { unitPriceUsd: token.referencePriceUsd, source: "FALLBACK_DEMO" };
      }
      return {
        unitPriceUsd: fromRawUnits(first.toTokenAmount, BNB_USDC_TOKEN.decimals),
        source: "OKX_LIVE",
      };
    } catch {
      return { unitPriceUsd: token.referencePriceUsd, source: "FALLBACK_DEMO" };
    }
  }

  async buildSwapTransactions(params: {
    safeAddress: EvmAddress;
    fromToken: TokenMetadata;
    toToken: TokenMetadata;
    humanAmount: number;
    slippagePercent: number;
    currentAllowance: bigint;
  }): Promise<SwapBundleResult> {
    const rawAmount = toRawUnits(params.humanAmount, params.fromToken.decimals);

    if (!this.hasLiveCredentials) {
      return this.buildSimulatedSwapBundle(params, rawAmount);
    }

    // 1. Gera transação de Approve (OKX DEX v6 /approve-transaction) se allowance insuficiente
    const transactions: SafeMetaTx[] = [];
    const approveData = await this.requestOkx<{
      data: `0x${string}`;
      dexContractAddress: EvmAddress;
      gasLimit: string;
    }>("GET", "/api/v6/dex/aggregator/approve-transaction", {
      chainIndex: SUPPORTED_CHAINS.BNB.okxChainIndex,
      tokenContractAddress: params.fromToken.address,
      approveAmount: rawAmount.toString(),
    });

    const approveItem = approveData[0];
    if (approveItem && params.currentAllowance < rawAmount) {
      transactions.push({
        to: params.fromToken.address,
        value: "0",
        data: approveItem.data,
        operation: 0,
        description: `Aprovar ${params.humanAmount} ${params.fromToken.symbol} para o roteador OKX DEX`,
      });
    }

    // 2. Gera calldata do Swap (OKX DEX v6 /swap)
    const swapData = await this.requestOkx<{
      routerResult: {
        toTokenAmount: string;
        priceImpactPercent: string;
        estimateGasFee: string;
      };
      tx: {
        to: EvmAddress;
        data: `0x${string}`;
        value: string;
        gas: string;
      };
    }>("GET", "/api/v6/dex/aggregator/swap", {
      chainIndex: SUPPORTED_CHAINS.BNB.okxChainIndex,
      fromTokenAddress: params.fromToken.address,
      toTokenAddress: params.toToken.address,
      amount: rawAmount.toString(),
      slippagePercent: String(params.slippagePercent),
      userWalletAddress: params.safeAddress,
    });

    const swapItem = swapData[0];
    if (!swapItem) {
      throw new DomainError("OKX DEX não retornou rota válida para o swap.", 502, "OKX_EMPTY_ROUTE");
    }

    transactions.push({
      to: swapItem.tx.to.toLowerCase() as EvmAddress,
      value: swapItem.tx.value || "0",
      data: swapItem.tx.data,
      operation: 0,
      description: `Swap OKX DEX: ${params.humanAmount} ${params.fromToken.symbol} -> ${params.toToken.symbol}`,
    });

    const expectedToHuman = fromRawUnits(
      swapItem.routerResult.toTokenAmount,
      params.toToken.decimals,
    );

    const quote: DexQuoteSummary = {
      fromSymbol: params.fromToken.symbol,
      toSymbol: params.toToken.symbol,
      fromAmount: String(params.humanAmount),
      expectedToAmount: expectedToHuman.toFixed(6),
      priceImpactPercent: Number(swapItem.routerResult.priceImpactPercent ?? 0),
      slippagePercent: params.slippagePercent,
      estimatedGas: swapItem.tx.gas ?? swapItem.routerResult.estimateGasFee ?? "250000",
      routerAddress: swapItem.tx.to.toLowerCase() as EvmAddress,
      source: "OKX_LIVE",
    };

    return { transactions, quote };
  }

  async buildCrossChainUsdcExitTransactions(params: {
    safeAddress: EvmAddress;
    recipientBaseAddress: EvmAddress;
    usdcAmount: number;
    slippagePercent: number;
  }): Promise<SafeMetaTx[]> {
    const rawBnbUsdcAmount = toRawUnits(params.usdcAmount, BNB_USDC_TOKEN.decimals);

    if (!this.hasLiveCredentials) {
      const approveCalldata = encodeFunctionData({
        abi: erc20Abi,
        functionName: "approve",
        args: [SIMULATED_OKX_ROUTER, rawBnbUsdcAmount],
      });
      const transferSimCalldata = encodeFunctionData({
        abi: erc20Abi,
        functionName: "transfer",
        args: [params.recipientBaseAddress, rawBnbUsdcAmount],
      });

      return [
        {
          to: BNB_USDC_TOKEN.address,
          value: "0",
          data: approveCalldata,
          operation: 0,
          description: `[SIMULAÇÃO] Aprovar US$ ${params.usdcAmount.toFixed(2)} USDC (BNB Chain) para Bridge OKX`,
        },
        {
          to: SIMULATED_OKX_ROUTER,
          value: "0",
          data: transferSimCalldata,
          operation: 0,
          description: `[SIMULAÇÃO] Bridge Cross-Chain USDC (BNB Chain -> Base) para ${params.recipientBaseAddress}`,
        },
      ];
    }

    const crossTx = await this.requestOkx<{
      tx: {
        to: EvmAddress;
        data: `0x${string}`;
        value: string;
      };
    }>("GET", "/api/v5/dex/cross-chain/build-tx", {
      fromChainId: SUPPORTED_CHAINS.BNB.okxChainIndex,
      toChainId: SUPPORTED_CHAINS.BASE.okxChainIndex,
      fromTokenAddress: BNB_USDC_TOKEN.address,
      toTokenAddress: BASE_USDC_TOKEN.address,
      amount: rawBnbUsdcAmount.toString(),
      slippage: String(params.slippagePercent / 100),
      userWalletAddress: params.safeAddress,
      receiveAddress: params.recipientBaseAddress,
    });

    const bridgeItem = crossTx[0];
    if (!bridgeItem) {
      throw new DomainError(
        "OKX Cross-Chain Bridge não encontrou rota BNB -> Base para este valor.",
        502,
        "OKX_BRIDGE_NO_ROUTE",
      );
    }

    const bridgeRouter = bridgeItem.tx.to.toLowerCase() as EvmAddress;
    const approveCalldata = encodeFunctionData({
      abi: erc20Abi,
      functionName: "approve",
      args: [bridgeRouter, rawBnbUsdcAmount],
    });

    return [
      {
        to: BNB_USDC_TOKEN.address,
        value: "0",
        data: approveCalldata,
        operation: 0,
        description: `Aprovar US$ ${params.usdcAmount.toFixed(2)} USDC para OKX Cross-Chain Router`,
      },
      {
        to: bridgeRouter,
        value: bridgeItem.tx.value || "0",
        data: bridgeItem.tx.data,
        operation: 0,
        description: `Bridge OKX Cross-Chain: US$ ${params.usdcAmount.toFixed(2)} USDC -> Base (${params.recipientBaseAddress})`,
      },
    ];
  }

  private buildSimulatedSwapBundle(
    params: {
      safeAddress: EvmAddress;
      fromToken: TokenMetadata;
      toToken: TokenMetadata;
      humanAmount: number;
      slippagePercent: number;
    },
    rawAmount: bigint,
  ): SwapBundleResult {
    const expectedOut =
      (params.humanAmount * params.fromToken.referencePriceUsd) /
      params.toToken.referencePriceUsd;

    const approveCalldata = encodeFunctionData({
      abi: erc20Abi,
      functionName: "approve",
      args: [SIMULATED_OKX_ROUTER, rawAmount],
    });

    // Calldata determinístico válido para testes de assinatura no Safe SDK sem chaves OKX
    const swapDummyData = encodeFunctionData({
      abi: erc20Abi,
      functionName: "transfer",
      args: [params.safeAddress, 0n],
    });

    return {
      transactions: [
        {
          to: params.fromToken.address,
          value: "0",
          data: approveCalldata,
          operation: 0,
          description: `[SIMULAÇÃO] Approve ${params.humanAmount} ${params.fromToken.symbol} -> OKX Router`,
        },
        {
          to: SIMULATED_OKX_ROUTER,
          value: "0",
          data: swapDummyData,
          operation: 0,
          description: `[SIMULAÇÃO] Swap ${params.humanAmount} ${params.fromToken.symbol} -> ~${expectedOut.toFixed(4)} ${params.toToken.symbol}`,
        },
      ],
      quote: {
        fromSymbol: params.fromToken.symbol,
        toSymbol: params.toToken.symbol,
        fromAmount: String(params.humanAmount),
        expectedToAmount: expectedOut.toFixed(6),
        priceImpactPercent: 0.14,
        slippagePercent: params.slippagePercent,
        estimatedGas: "215000",
        routerAddress: SIMULATED_OKX_ROUTER,
        source: "SIMULATED",
      },
    };
  }

  /**
   * Assinatura oficial HMAC-SHA256 Base64 exigida pelo OKX Onchain OS (v5/v6)
   */
  private async requestOkx<T>(
    method: "GET" | "POST",
    requestPath: string,
    query: Record<string, string>,
  ): Promise<T[]> {
    const queryString = new URLSearchParams(query).toString();
    const fullPath = queryString ? `${requestPath}?${queryString}` : requestPath;
    const timestamp = new Date().toISOString();
    const prehash = `${timestamp}${method}${fullPath}`;

    const signature = crypto
      .createHmac("sha256", this.config.OKX_SECRET_KEY)
      .update(prehash)
      .digest("base64");

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "OK-ACCESS-KEY": this.config.OKX_API_KEY,
      "OK-ACCESS-SIGN": signature,
      "OK-ACCESS-TIMESTAMP": timestamp,
      "OK-ACCESS-PASSPHRASE": this.config.OKX_API_PASSPHRASE,
    };

    if (this.config.OKX_PROJECT_ID) {
      headers["OK-ACCESS-PROJECT"] = this.config.OKX_PROJECT_ID;
    }

    const response = await fetch(`${this.config.OKX_BASE_URL}${fullPath}`, {
      method,
      headers,
    });

    if (!response.ok) {
      throw new DomainError(
        `Falha HTTP ${response.status} ao consultar OKX DEX (${requestPath})`,
        502,
        "OKX_HTTP_ERROR",
      );
    }

    const payload = (await response.json()) as OkxApiResponse<T>;
    if (payload.code !== "0") {
      throw new DomainError(
        `Erro OKX DEX [${payload.code}]: ${payload.msg}`,
        502,
        "OKX_API_ERROR",
      );
    }

    return payload.data;
  }
}
