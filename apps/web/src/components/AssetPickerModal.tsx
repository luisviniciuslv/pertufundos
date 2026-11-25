"use client";

import type { CatalogAsset, EvmAddress } from "@pertufundos/shared";
import { PlusCircle, Search, X } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { fundApi } from "@/lib/api-client";
import { shortenAddress } from "@/lib/formatters";

interface AssetPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectAsset: (asset: {
    symbol: string;
    name: string;
    address: EvmAddress;
    category: "ONDO_STOCK" | "CRYPTO" | "STABLECOIN";
  }) => void;
}

export function AssetPickerModal({ isOpen, onClose, onSelectAsset }: AssetPickerModalProps) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<"ALL" | "ONDO_STOCK" | "CRYPTO">("ALL");
  const [assets, setAssets] = useState<CatalogAsset[]>([]);
  const [loading, setLoading] = useState(false);

  const [customAddress, setCustomAddress] = useState("");
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    setError(null);
    const timer = setTimeout(() => {
      fundApi
        .getAssetsCatalog({ q: query, category })
        .then((res) => setAssets(res.assets))
        .catch((err) =>
          setError(err instanceof Error ? err.message : "Erro ao consultar catálogo de ativos."),
        )
        .finally(() => setLoading(false));
    }, 180);

    return () => clearTimeout(timer);
  }, [isOpen, query, category]);

  if (!isOpen) return null;

  async function handleImportByContract(e: FormEvent) {
    e.preventDefault();
    setImporting(true);
    setError(null);
    try {
      const { asset } = await fundApi.trackCustomAsset({
        address: customAddress.trim() as EvmAddress,
      });
      setCustomAddress("");
      onSelectAsset({
        symbol: asset.symbol,
        name: asset.name,
        address: asset.address,
        category: asset.category,
      });
      onClose();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Não foi possível importar o contrato (verifique se assinou o login como membro).",
      );
    } finally {
      setImporting(false);
    }
  }

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
      >
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <div>
            <h3 className="text-base font-bold text-white">Escolher Ativo para Investir</h3>
            <p className="text-xs text-slate-400">
              Ações e ETFs dos EUA (Ondo), Criptomoedas 24/7, Ouro ou qualquer token na BNB Chain
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar seletor de ativos"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-4 space-y-3 border-b border-slate-800">
          {/* Busca em tempo real */}
          <div className="relative">
            <Search className="h-4 w-4 text-slate-400 absolute left-3.5 top-3" />
            <input
              type="text"
              autoFocus
              placeholder="Buscar por código ou nome (ex: NVDAon, AAPLon, BTCB, ETH, Ouro...)"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 pl-10 pr-4 py-2.5 text-xs text-white focus:border-emerald-500 focus:outline-none"
            />
          </div>

          {/* Filtros de Categoria */}
          <div className="flex flex-wrap gap-2">
            {(
              [
                { id: "ALL", label: "Todos os Ativos" },
                { id: "ONDO_STOCK", label: "Ações & ETFs EUA (Ondo)" },
                { id: "CRYPTO", label: "Cripto & Ouro (24/7)" },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setCategory(tab.id)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  category === tab.id
                    ? "bg-emerald-500 text-slate-950"
                    : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {error && (
            <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-2.5 text-xs text-rose-200">
              {error}
            </div>
          )}
        </div>

        {/* Lista Rolável de Ativos */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-800/60">
          {loading ? (
            <div className="p-8 text-center text-xs text-slate-400">
              Carregando ativos disponíveis na OKX DEX...
            </div>
          ) : assets.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400 leading-relaxed">
              Nenhum ativo encontrado para &ldquo;{query}&rdquo;. Se você tiver o endereço do
              contrato na BNB Chain (<code>0x...</code>), cole no campo abaixo para adicionar!
            </div>
          ) : (
            assets.map((asset) => (
              <button
                key={asset.address}
                type="button"
                onClick={() => {
                  onSelectAsset(asset);
                  onClose();
                }}
                className="w-full px-5 py-3 flex items-center justify-between hover:bg-slate-800/50 transition text-left"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-white">{asset.symbol}</span>
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                        asset.category === "ONDO_STOCK"
                          ? "bg-sky-500/15 text-sky-300"
                          : "bg-amber-500/15 text-amber-300"
                      }`}
                    >
                      {asset.category === "ONDO_STOCK" ? "AÇÃO / ETF EUA" : "CRIPTO 24/7"}
                    </span>
                  </div>
                  <div className="text-xs text-slate-400">{asset.name}</div>
                </div>

                <div className="text-right text-xs font-mono text-slate-400">
                  {shortenAddress(asset.address)}
                </div>
              </button>
            ))
          )}
        </div>

        {/* Importador Universal por Endereço de Contrato 0x... */}
        <form
          onSubmit={handleImportByContract}
          className="border-t border-slate-800 bg-slate-950/90 p-4 space-y-2"
        >
          <p className="text-[11px] text-slate-400">
            Não encontrou o token na lista? Cole o endereço do contrato na BNB Chain:
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              required
              placeholder="0x... (contrato BEP-20)"
              value={customAddress}
              onChange={(e) => setCustomAddress(e.target.value)}
              className="flex-1 min-w-[220px] rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-mono text-white focus:border-emerald-500 focus:outline-none"
            />
            <button
              type="submit"
              disabled={importing}
              className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-3.5 py-2 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/25 disabled:opacity-50"
            >
              <PlusCircle className="h-3.5 w-3.5" />
              {importing ? "Lendo Contrato..." : "Importar Token"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
