import type { AssetHolding, EvmAddress, MemberPosition } from "@pertufundos/shared";
import { Coins, PieChart, Users } from "lucide-react";
import { InfoTip } from "@/components/InfoTip";
import { formatPercent, formatShares, formatUsd, shortenAddress } from "@/lib/formatters";

interface PortfolioHoldingsPanelProps {
  holdings: readonly AssetHolding[];
  members: readonly MemberPosition[];
  activeWallet: EvmAddress | undefined;
}

const CATEGORY_META = {
  ONDO_STOCK: {
    label: "Ação / ETF EUA",
    badgeClass: "bg-sky-500/15 text-sky-300 border-sky-500/25",
    barClass: "bg-sky-500",
  },
  CRYPTO: {
    label: "Cripto 24/7",
    badgeClass: "bg-amber-500/15 text-amber-300 border-amber-500/25",
    barClass: "bg-amber-400",
  },
  STABLECOIN: {
    label: "Caixa Dólar",
    badgeClass: "bg-emerald-500/15 text-emerald-300 border-emerald-500/25",
    barClass: "bg-emerald-500",
  },
} as const;

export function PortfolioHoldingsPanel({
  holdings,
  members,
  activeWallet,
}: PortfolioHoldingsPanelProps) {
  const totalAllocationByCategory = holdings.reduce(
    (acc, asset) => {
      acc[asset.category] += asset.allocationPercent;
      return acc;
    },
    { ONDO_STOCK: 0, CRYPTO: 0, STABLECOIN: 0 },
  );

  const sortedHoldings = [...holdings].sort((a, b) => b.marketValueUsd - a.marketValueUsd);
  const sortedMembers = [...members].sort((a, b) => b.currentValueUsd - a.currentValueUsd);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
      {/* Composição da Carteira Ondo Stocks + Cripto + USDC */}
      <div className="lg:col-span-7 rounded-2xl border border-slate-800 bg-slate-900/55 p-6 space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <PieChart className="h-4 w-4 text-emerald-400" />
              <h2 className="text-base font-semibold text-white">Onde o dinheiro está investido</h2>
            </div>
            <p className="mt-1 text-xs text-slate-400">
              Todos os ativos ficam guardados dentro do cofre Safe na rede BNB Smart Chain
            </p>
          </div>
        </div>

        {/* Barra visual de alocação por categoria */}
        <div className="rounded-xl border border-slate-800/80 bg-slate-950/60 p-3.5 space-y-2.5">
          <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-slate-800">
            {totalAllocationByCategory.ONDO_STOCK > 0 && (
              <div
                className="bg-sky-500 transition-all"
                style={{ width: `${totalAllocationByCategory.ONDO_STOCK}%` }}
                title={`Ações & ETFs EUA: ${totalAllocationByCategory.ONDO_STOCK.toFixed(1)}%`}
              />
            )}
            {totalAllocationByCategory.CRYPTO > 0 && (
              <div
                className="bg-amber-400 transition-all"
                style={{ width: `${totalAllocationByCategory.CRYPTO}%` }}
                title={`Cripto 24/7: ${totalAllocationByCategory.CRYPTO.toFixed(1)}%`}
              />
            )}
            {totalAllocationByCategory.STABLECOIN > 0 && (
              <div
                className="bg-emerald-500 transition-all"
                style={{ width: `${totalAllocationByCategory.STABLECOIN}%` }}
                title={`Caixa USDC: ${totalAllocationByCategory.STABLECOIN.toFixed(1)}%`}
              />
            )}
          </div>
          <div className="flex flex-wrap items-center gap-4 text-[11px] text-slate-300">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-sky-500" />
              Ações/ETFs EUA: <strong>{totalAllocationByCategory.ONDO_STOCK.toFixed(1)}%</strong>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-amber-400" />
              Cripto 24/7: <strong>{totalAllocationByCategory.CRYPTO.toFixed(1)}%</strong>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              Caixa Dólar (USDC):{" "}
              <strong>{totalAllocationByCategory.STABLECOIN.toFixed(1)}%</strong>
            </span>
          </div>
        </div>

        {sortedHoldings.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-800 p-8 text-center space-y-2">
            <Coins className="h-6 w-6 text-slate-500 mx-auto" />
            <p className="text-sm font-medium text-slate-300">O cofre ainda está vazio</p>
            <p className="text-xs text-slate-400">
              Faça o primeiro aporte na aba <strong>Aportes &amp; Cotistas</strong> para começar a
              investir.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-[11px] uppercase tracking-wide text-slate-400">
                  <th className="pb-3 font-medium">Ativo</th>
                  <th className="pb-3 font-medium text-right">Qtd.</th>
                  <th className="pb-3 font-medium text-right">
                    <span className="inline-flex items-center gap-1 justify-end">
                      Fator Ondo
                      <InfoTip text="Para ações Ondo, o multiplicador reflete dividendos americanos reinvestidos automaticamente no token. Para USDC e cripto, é sempre 1.0000x." />
                    </span>
                  </th>
                  <th className="pb-3 font-medium text-right">Preço (USD)</th>
                  <th className="pb-3 font-medium text-right">Total</th>
                  <th className="pb-3 font-medium text-right">Peso</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {sortedHoldings.map((asset) => {
                  const cat = CATEGORY_META[asset.category];
                  return (
                    <tr key={asset.symbol} className="hover:bg-slate-800/30 transition">
                      <td className="py-3.5 pr-3">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-white">{asset.symbol}</span>
                          <span
                            className={`rounded border px-1.5 py-0.5 text-[10px] font-medium ${cat.badgeClass}`}
                          >
                            {cat.label}
                          </span>
                        </div>
                        <div className="text-xs text-slate-400 mt-0.5">{asset.name}</div>
                      </td>
                      <td className="py-3.5 text-right font-mono text-xs text-slate-200 tabular-nums">
                        {asset.balance.toFixed(4)}
                      </td>
                      <td className="py-3.5 text-right font-mono text-xs text-emerald-400 tabular-nums">
                        {asset.sharesMultiplier.toFixed(4)}x
                      </td>
                      <td className="py-3.5 text-right font-mono text-xs text-slate-300 tabular-nums">
                        {formatUsd(asset.unitPriceUsd)}
                      </td>
                      <td className="py-3.5 text-right font-semibold text-white tabular-nums">
                        {formatUsd(asset.marketValueUsd)}
                      </td>
                      <td className="py-3.5 text-right">
                        <span className="inline-block rounded-md bg-slate-800 px-2 py-0.5 text-xs text-slate-200 tabular-nums">
                          {asset.allocationPercent.toFixed(1)}%
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Quadro de Cotistas (Cap Table dos Amigos) */}
      <div className="lg:col-span-5 rounded-2xl border border-slate-800 bg-slate-900/55 p-6 space-y-4">
        <div>
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-sky-400" />
            <h2 className="text-base font-semibold text-white">
              Fatia de Cada Amigo ({members.length})
            </h2>
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Cada participante tem seu saldo em cotas e custo médio individual para o IR
          </p>
        </div>

        {sortedMembers.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-800 p-8 text-center text-xs text-slate-400">
            Nenhum participante cadastrado ainda. Conecte sua carteira para entrar no clube!
          </div>
        ) : (
          <div className="space-y-3">
            {sortedMembers.map((member) => {
              const isSelf =
                Boolean(activeWallet) &&
                member.walletAddress.toLowerCase() === activeWallet?.toLowerCase();
              const initials = member.nickname.trim().slice(0, 2).toUpperCase() || "??";

              return (
                <div
                  key={member.id}
                  className={`rounded-xl border p-3.5 space-y-2.5 transition ${
                    isSelf
                      ? "border-emerald-500/40 bg-emerald-950/20"
                      : "border-slate-800/80 bg-slate-950/60"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                          isSelf
                            ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                            : "bg-slate-800 text-slate-200 border border-slate-700"
                        }`}
                      >
                        {initials}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-sm text-white truncate">
                            {member.nickname}
                          </span>
                          {isSelf && (
                            <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
                              Você
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] font-mono text-slate-400">
                          {shortenAddress(member.walletAddress)}
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="font-semibold text-sm text-white tabular-nums">
                        {formatUsd(member.currentValueUsd)}
                      </div>
                      <div
                        className={`text-xs font-medium tabular-nums ${
                          member.unrealizedGainUsd >= 0 ? "text-emerald-400" : "text-rose-400"
                        }`}
                      >
                        {formatPercent(member.unrealizedGainPercent)} (
                        {member.ownershipPercent.toFixed(1)}%)
                      </div>
                    </div>
                  </div>

                  {/* Barra de participação + detalhe */}
                  <div className="space-y-1.5">
                    <div className="h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          isSelf ? "bg-emerald-400" : "bg-sky-500/80"
                        }`}
                        style={{ width: `${Math.min(100, Math.max(2, member.ownershipPercent))}%` }}
                      />
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400 tabular-nums">
                      <span>{formatShares(member.sharesBalance)} cotas</span>
                      <span>Preço médio: US$ {member.avgCostPerShareUsd.toFixed(4)}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
