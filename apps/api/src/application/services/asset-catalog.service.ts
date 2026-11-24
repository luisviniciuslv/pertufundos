import {
  BNB_USDC_TOKEN,
  CURATED_INVESTABLE_TOKENS,
  inferTokenCategory,
  SUPPORTED_CHAINS,
  type CatalogAsset,
  type EvmAddress,
  type TokenCategory,
  type TokenMetadata,
} from "@pertufundos/shared";
import { ValidationError } from "../../domain/errors.js";
import type { IDexGateway } from "../ports/dex-gateway.port.js";
import type { IFundRepository } from "../ports/fund-repository.port.js";
import type { IVaultReader } from "../ports/vault-reader.port.js";

export class AssetCatalogService {
  constructor(
    private readonly repository: IFundRepository,
    private readonly dexGateway: IDexGateway,
    private readonly vaultReader: IVaultReader,
  ) {}

  async listAvailableAssets(params: {
    searchQuery?: string;
    category?: "ALL" | "ONDO_STOCK" | "CRYPTO";
    limit?: number;
  } = {}): Promise<CatalogAsset[]> {
    const { searchQuery = "", category = "ALL", limit = 150 } = params;
    const [customTokens, okxTokens] = await Promise.all([
      this.repository.listCustomTokens(),
      this.dexGateway.listAllChainTokens(),
    ]);

    const byAddress = new Map<string, CatalogAsset>();

    for (const curated of CURATED_INVESTABLE_TOKENS) {
      byAddress.set(curated.address.toLowerCase(), {
        ...curated,
        isTrackedInVault: true,
        source: "CURATED",
      });
    }

    for (const custom of customTokens) {
      if (custom.address.toLowerCase() === BNB_USDC_TOKEN.address.toLowerCase()) continue;
      if (!byAddress.has(custom.address.toLowerCase())) {
        byAddress.set(custom.address.toLowerCase(), {
          ...custom,
          isTrackedInVault: true,
          source: "CUSTOM_TRACKED",
        });
      }
    }

    for (const okx of okxTokens) {
      const addr = okx.address.toLowerCase();
      if (addr === BNB_USDC_TOKEN.address.toLowerCase() || okx.category === "STABLECOIN") continue;
      const existing = byAddress.get(addr);
      if (existing) {
        if (!existing.logoUrl && okx.logoUrl) {
          byAddress.set(addr, { ...existing, logoUrl: okx.logoUrl });
        }
      } else {
        byAddress.set(addr, {
          ...okx,
          isTrackedInVault: false,
          source: "OKX_DEX_LIST",
        });
      }
    }

    const q = searchQuery.trim().toLowerCase();
    const filtered = [...byAddress.values()].filter((asset) => {
      if (category !== "ALL" && asset.category !== category) return false;
      if (!q) return true;
      return (
        asset.symbol.toLowerCase().includes(q) ||
        asset.name.toLowerCase().includes(q) ||
        asset.address.toLowerCase() === q
      );
    });

    return filtered.slice(0, limit);
  }

  /**
   * Importa qualquer contrato ERC-20/BEP-20 diretamente pelo endereço 0x... informado no frontend:
   * busca metadados (symbol, name, decimals) na OKX DEX ou diretamente no bloco via Viem!
   */
  async importAndTrackAssetByAddress(params: {
    address: EvmAddress;
    categoryOverride?: "ONDO_STOCK" | "CRYPTO";
  }): Promise<TokenMetadata> {
    const normalizedAddr = params.address.toLowerCase() as EvmAddress;
    if (normalizedAddr === BNB_USDC_TOKEN.address.toLowerCase()) {
      throw new ValidationError("USDC já é a moeda-caixa padrão do fundo.");
    }

    const catalog = await this.listAvailableAssets({ searchQuery: normalizedAddr, limit: 5 });
    const knownInCatalog = catalog.find((t) => t.address.toLowerCase() === normalizedAddr);

    if (knownInCatalog) {
      const updated: TokenMetadata = {
        ...knownInCatalog,
        category: params.categoryOverride ?? knownInCatalog.category,
      };
      return this.repository.upsertCustomToken(updated);
    }

    const onChainMeta = await this.vaultReader.readTokenMetadataOnChain(normalizedAddr);
    const inferredCategory: TokenCategory =
      params.categoryOverride ?? inferTokenCategory(onChainMeta.symbol, onChainMeta.name);

    const customToken: TokenMetadata = {
      symbol: onChainMeta.symbol,
      name: onChainMeta.name,
      address: normalizedAddr,
      chainId: SUPPORTED_CHAINS.BNB.id,
      decimals: onChainMeta.decimals,
      category: inferredCategory === "STABLECOIN" ? "CRYPTO" : inferredCategory,
      referencePriceUsd: 10.0,
    };

    return this.repository.upsertCustomToken(customToken);
  }

  /**
   * Resolve um ativo escolhido em proposta de compra/venda (e garante que passe a ser rastreado no cofre).
   */
  async resolveAndEnsureTracked(params: {
    symbol: string;
    address?: EvmAddress;
  }): Promise<TokenMetadata> {
    const curatedMatch = CURATED_INVESTABLE_TOKENS.find((t) =>
      params.address
        ? t.address.toLowerCase() === params.address.toLowerCase()
        : t.symbol.toLowerCase() === params.symbol.toLowerCase(),
    );
    if (curatedMatch) return curatedMatch;

    const customTokens = await this.repository.listCustomTokens();
    const customMatch = customTokens.find((t) =>
      params.address
        ? t.address.toLowerCase() === params.address.toLowerCase()
        : t.symbol.toLowerCase() === params.symbol.toLowerCase(),
    );
    if (customMatch) return customMatch;

    const okxTokens = await this.dexGateway.listAllChainTokens();
    const okxMatch = okxTokens.find((t) =>
      params.address
        ? t.address.toLowerCase() === params.address.toLowerCase()
        : t.symbol.toLowerCase() === params.symbol.toLowerCase(),
    );
    if (okxMatch) {
      return this.repository.upsertCustomToken(okxMatch);
    }

    if (params.address) {
      return this.importAndTrackAssetByAddress({ address: params.address });
    }

    throw new ValidationError(
      `Ativo "${params.symbol}" não encontrado no catálogo. Selecione da lista OKX DEX ou cole o endereço 0x... do contrato.`,
    );
  }
}
