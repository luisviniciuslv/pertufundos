import crypto from "node:crypto";
import {
  BASE_USDC_TOKEN,
  BNB_USDC_TOKEN,
  CURATED_INVESTABLE_TOKENS,
  fromRawUnits,
  inferTokenCategory,
  SUPPORTED_CHAINS,
  toRawUnits,
  type BaseBridgeBundle,
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

const PRICE_CACHE_TTL_MS = 2 * 60 * 1000;
const OKX_MIN_REQUEST_INTERVAL_MS = 350;

export class OkxDexGateway implements IDexGateway {
  private cachedChainTokens: { expiresAt: number; items: TokenMetadata[] } | null = null;
  private readonly priceCache = new Map<string, { expiresAt: number; result: TokenPriceResult }>();
  private readonly inFlightPriceRequests = new Map<string, Promise<TokenPriceResult>>();
  private okxQueue: Promise<void> = Promise.resolve();
  private lastOkxRequestAt = 0;

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

    const cacheKey = token.address.toLowerCase();
    const cached = this.priceCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.result;
    }

    const existingInFlight = this.inFlightPriceRequests.get(cacheKey);
    if (existingInFlight) {
      return existingInFlight;
    }

    const requestPromise = (async (): Promise<TokenPriceResult> => {
      try {
        const oneUnitRaw = toRawUnits(1, token.decimals).toString();
        const quote = await this.requestOkx<{
          toTokenAmount?: string;
          routerResult?: {
            toTokenAmount?: string;
          };
        }>(
          "GET",
          "/api/v6/dex/aggregator/quote",
          {
            chainIndex: SUPPORTED_CHAINS.BNB.okxChainIndex,
            fromTokenAddress: token.address,
            toTokenAddress: BNB_USDC_TOKEN.address,
            amount: oneUnitRaw,
          },
          { quietApiCodes: ["82000"] },
        );

        const first = quote[0];
        const rawToAmount = first?.toTokenAmount ?? first?.routerResult?.toTokenAmount;
        if (!rawToAmount) {
          const fallback = { unitPriceUsd: token.referencePriceUsd, source: "FALLBACK_DEMO" as const };
          this.priceCache.set(cacheKey, {
            expiresAt: Date.now() + PRICE_CACHE_TTL_MS,
            result: fallback,
          });
          return fallback;
        }

        const live = {
          unitPriceUsd: fromRawUnits(rawToAmount, BNB_USDC_TOKEN.decimals),
          source: "OKX_LIVE" as const,
        };
        this.priceCache.set(cacheKey, {
          expiresAt: Date.now() + PRICE_CACHE_TTL_MS,
          result: live,
        });
        return live;
      } catch {
        const fallback = { unitPriceUsd: token.referencePriceUsd, source: "FALLBACK_DEMO" as const };
        this.priceCache.set(cacheKey, {
          expiresAt: Date.now() + 30_000,
          result: fallback,
        });
        return fallback;
      } finally {
        this.inFlightPriceRequests.delete(cacheKey);
      }
    })();

    this.inFlightPriceRequests.set(cacheKey, requestPromise);
    return requestPromise;
  }

  async buildSwapTransactions(params: {
    safeAddress: EvmAddress;
    fromToken: TokenMetadata;
    toToken: TokenMetadata;
    humanAmount: number;
    slippagePercent: number;
    currentAllowance?: bigint;
    getSourceAllowance?: (spenderAddress: EvmAddress) => Promise<bigint>;
  }): Promise<SwapBundleResult> {
    const rawAmount = toRawUnits(params.humanAmount, params.fromToken.decimals);

    if (!this.hasLiveCredentials) {
      return this.buildSimulatedSwapBundle(params, rawAmount);
    }

    // 1. Gera transação de Approve (OKX DEX v6 /approve-transaction) se allowance insuficiente
    const transactions: SafeMetaTx[] = [];
    const isNativeFromToken =
      params.fromToken.address.toLowerCase() === "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";

    if (!isNativeFromToken) {
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
      if (approveItem) {
        const spender = approveItem.dexContractAddress.toLowerCase() as EvmAddress;
        const effectiveAllowance = params.getSourceAllowance
          ? await params.getSourceAllowance(spender).catch(() => params.currentAllowance ?? 0n)
          : (params.currentAllowance ?? 0n);

        if (effectiveAllowance < rawAmount) {
          transactions.push({
            to: params.fromToken.address,
            value: "0",
            data: approveItem.data,
            operation: 0,
            description: `Aprovar ${params.humanAmount} ${params.fromToken.symbol} para o roteador OKX DEX`,
          });
        }
      }
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

    const { transactions } = await this.buildLiveCrossChainUsdcSwap({
      fromChain: SUPPORTED_CHAINS.BNB,
      toChain: SUPPORTED_CHAINS.BASE,
      fromToken: BNB_USDC_TOKEN,
      toToken: BASE_USDC_TOKEN,
      userWalletAddress: params.safeAddress,
      receiveAddress: params.recipientBaseAddress,
      usdcAmount: params.usdcAmount,
      slippagePercent: params.slippagePercent,
    });

    return transactions;
  }

  async buildCrossChainBaseToBscBridgeTransactions(params: {
    fromBaseAddress: EvmAddress;
    recipientBscAddress: EvmAddress;
    usdcAmount: number;
    slippagePercent: number;
    getBaseAllowance: (spenderAddress: EvmAddress) => Promise<bigint>;
  }): Promise<BaseBridgeBundle> {
    const rawBaseUsdcAmount = toRawUnits(params.usdcAmount, BASE_USDC_TOKEN.decimals);

    if (!this.hasLiveCredentials) {
      const approveCalldata = encodeFunctionData({
        abi: erc20Abi,
        functionName: "approve",
        args: [SIMULATED_OKX_ROUTER, rawBaseUsdcAmount],
      });
      const transferSimCalldata = encodeFunctionData({
        abi: erc20Abi,
        functionName: "transfer",
        args: [params.recipientBscAddress, rawBaseUsdcAmount],
      });

      return {
        chainId: SUPPORTED_CHAINS.BASE.id,
        destinationChainId: SUPPORTED_CHAINS.BNB.id,
        fromAddress: params.fromBaseAddress,
        recipientBscAddress: params.recipientBscAddress,
        amountUsdc: params.usdcAmount,
        expectedBscUsdc: params.usdcAmount,
        source: "SIMULATED",
        transactions: [
          {
            to: BASE_USDC_TOKEN.address,
            value: "0",
            data: approveCalldata,
            operation: 0,
            description: `[SIMULAÇÃO] Aprovar US$ ${params.usdcAmount.toFixed(2)} USDC (Base) para Bridge OKX`,
          },
          {
            to: SIMULATED_OKX_ROUTER,
            value: "0",
            data: transferSimCalldata,
            operation: 0,
            description: `[SIMULAÇÃO] Bridge OKX Cross-Chain: US$ ${params.usdcAmount.toFixed(2)} USDC (Base -> BNB Chain)`,
          },
        ],
      };
    }

    const { transactions, expectedOutAmount } = await this.buildLiveCrossChainUsdcSwap({
      fromChain: SUPPORTED_CHAINS.BASE,
      toChain: SUPPORTED_CHAINS.BNB,
      fromToken: BASE_USDC_TOKEN,
      toToken: BNB_USDC_TOKEN,
      userWalletAddress: params.fromBaseAddress,
      receiveAddress: params.recipientBscAddress,
      usdcAmount: params.usdcAmount,
      slippagePercent: params.slippagePercent,
      getSourceAllowance: params.getBaseAllowance,
    });

    return {
      chainId: SUPPORTED_CHAINS.BASE.id,
      destinationChainId: SUPPORTED_CHAINS.BNB.id,
      fromAddress: params.fromBaseAddress,
      recipientBscAddress: params.recipientBscAddress,
      amountUsdc: params.usdcAmount,
      expectedBscUsdc: expectedOutAmount,
      source: "OKX_LIVE",
      transactions,
    };
  }

  private async buildLiveCrossChainUsdcSwap(params: {
    fromChain: (typeof SUPPORTED_CHAINS)[keyof typeof SUPPORTED_CHAINS];
    toChain: (typeof SUPPORTED_CHAINS)[keyof typeof SUPPORTED_CHAINS];
    fromToken: TokenMetadata;
    toToken: TokenMetadata;
    userWalletAddress: EvmAddress;
    receiveAddress: EvmAddress;
    usdcAmount: number;
    slippagePercent: number;
    getSourceAllowance?: (spenderAddress: EvmAddress) => Promise<bigint>;
  }): Promise<{ transactions: SafeMetaTx[]; expectedOutAmount: number }> {
    const rawFromAmount = toRawUnits(params.usdcAmount, params.fromToken.decimals);
    const transactions: SafeMetaTx[] = [];

    const approveData = await this.requestOkx<{
      data: `0x${string}`;
      dexContractAddress: EvmAddress;
    }>("GET", "/api/v6/dex/aggregator/approve-transaction", {
      chainIndex: params.fromChain.okxChainIndex,
      tokenContractAddress: params.fromToken.address,
      approveAmount: rawFromAmount.toString(),
    });

    const approveItem = approveData[0];
    if (approveItem) {
      const spender = approveItem.dexContractAddress.toLowerCase() as EvmAddress;
      const currentAllowance = params.getSourceAllowance
        ? await params.getSourceAllowance(spender).catch(() => 0n)
        : 0n;
      if (currentAllowance < rawFromAmount) {
        transactions.push({
          to: params.fromToken.address,
          value: "0",
          data: approveItem.data,
          operation: 0,
          description: `Aprovar US$ ${params.usdcAmount.toFixed(2)} USDC (${params.fromChain.name}) para OKX Cross-Chain`,
        });
      }
    }

    const crossTx = await this.requestOkx<{
      routerResult?: {
        toTokenAmount?: string;
      };
      toTokenAmount?: string;
      tx: {
        to: EvmAddress;
        data: `0x${string}`;
        value: string;
      };
    }>("GET", "/api/v6/dex/cross-chain/swap", {
      fromChainIndex: params.fromChain.okxChainIndex,
      toChainIndex: params.toChain.okxChainIndex,
      fromTokenAddress: params.fromToken.address,
      toTokenAddress: params.toToken.address,
      amount: rawFromAmount.toString(),
      slippage: String(params.slippagePercent / 100),
      userWalletAddress: params.userWalletAddress,
      receiveAddress: params.receiveAddress,
    });

    const bridgeItem = crossTx[0];
    if (!bridgeItem?.tx) {
      throw new DomainError(
        `OKX Cross-Chain não encontrou rota ${params.fromChain.name} -> ${params.toChain.name} para este valor.`,
        422,
        "OKX_BRIDGE_NO_ROUTE",
      );
    }

    const rawExpectedTo = bridgeItem.routerResult?.toTokenAmount ?? bridgeItem.toTokenAmount;
    const expectedOutAmount = rawExpectedTo
      ? fromRawUnits(rawExpectedTo, params.toToken.decimals)
      : params.usdcAmount;

    const bridgeRouter = bridgeItem.tx.to.toLowerCase() as EvmAddress;
    transactions.push({
      to: bridgeRouter,
      value: bridgeItem.tx.value || "0",
      data: bridgeItem.tx.data,
      operation: 0,
      description: `Bridge OKX Cross-Chain: US$ ${params.usdcAmount.toFixed(2)} USDC (${params.fromChain.name} -> ${params.toChain.name})`,
    });

    return { transactions, expectedOutAmount };
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

  private enqueueOkxRequest<T>(task: () => Promise<T>): Promise<T> {
    const run = this.okxQueue.then(async () => {
      const waitMs = Math.max(0, OKX_MIN_REQUEST_INTERVAL_MS - (Date.now() - this.lastOkxRequestAt));
      if (waitMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, waitMs));
      }
      this.lastOkxRequestAt = Date.now();
      return task();
    });
    this.okxQueue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  /**
   * Assinatura oficial HMAC-SHA256 Base64 exigida pelo OKX Onchain OS (v5/v6)
   */
  private async requestOkx<T>(
    method: "GET" | "POST",
    requestPath: string,
    query: Record<string, string>,
    options: { quietApiCodes?: readonly string[]; retryCount?: number } = {},
  ): Promise<T[]> {
    return this.enqueueOkxRequest(async () => {
      const queryString = new URLSearchParams(query).toString();
      const fullPath = queryString ? `${requestPath}?${queryString}` : requestPath;

      const response = await this.fetchOkxRaw(method, fullPath);
      if (response.status === 429 && (options.retryCount ?? 0) < 1) {
        await new Promise((resolve) => setTimeout(resolve, 1200));
        this.lastOkxRequestAt = Date.now();
        const retryResponse = await this.fetchOkxRaw(method, fullPath);
        return this.parseOkxResponse<T>(retryResponse, requestPath, options);
      }

      return this.parseOkxResponse<T>(response, requestPath, options);
    });
  }

  private async fetchOkxRaw(method: "GET" | "POST", fullPath: string): Promise<Response> {
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

    return fetch(`${this.config.OKX_BASE_URL}${fullPath}`, {
      method,
      headers,
    });
  }

  private async parseOkxResponse<T>(
    response: Response,
    requestPath: string,
    options: { quietApiCodes?: readonly string[] },
  ): Promise<T[]> {
    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      let detail = errText;
      try {
        const parsedErr = JSON.parse(errText) as { msg?: string; message?: string; code?: string };
        detail = parsedErr.msg || parsedErr.message || errText;
      } catch {
        // Mantém texto bruto caso não seja JSON
      }
      console.error(`[OKX HTTP ${response.status}] ${requestPath}:`, detail);
      throw new DomainError(
        `Falha HTTP ${response.status} ao consultar OKX DEX (${requestPath})${detail ? `: ${detail}` : ""}`,
        422,
        "OKX_HTTP_ERROR",
      );
    }

    const payload = (await response.json()) as OkxApiResponse<T>;
    if (payload.code !== "0") {
      if (!options.quietApiCodes?.includes(payload.code)) {
        console.error(`[OKX API ${payload.code}] ${requestPath}:`, payload.msg);
      }
      throw new DomainError(
        `Erro OKX DEX [${payload.code}]: ${payload.msg}`,
        422,
        "OKX_API_ERROR",
      );
    }

    return payload.data;
  }
}
