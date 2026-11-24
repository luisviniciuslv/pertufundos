import type { AssetHolding, MemberPosition } from "@pertufundos/shared";
import { formatPercent, formatShares, formatUsd, shortenAddress } from "@/lib/formatters";

interface PortfolioHoldingsPanelProps {
  holdings: readonly AssetHolding[];
  members: readonly MemberPosition[];
}

export function PortfolioHoldingsPanel({ holdings, members }: PortfolioHoldingsPanelProps) {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
      {/* Composição da Carteira Ondo Stocks + USDC */}
      <div className="lg:col-span-7 rounded-2xl border border-slate-800 bg-slate-900/50 p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold text-white">Ativos sob Custódia na Safe</h2>
            <p className="text-xs text-slate-400">
              Ações tokenizadas Ondo Global Markets (BNB Chain) + Caixa em USDC
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-xs uppercase text-slate-400">
                <th className="pb-3 font-medium">Ativo</th>
                <th className="pb-3 font-medium text-right">Saldo Token</th>
                <th className="pb-3 font-medium text-right">Mult. Ondo</th>
                <th className="pb-3 font-medium text-right">Preço (USD)</th>
                <th className="pb-3 font-medium text-right">Valor</th>
                <th className="pb-3 font-medium text-right">Peso</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {holdings.map((asset) => (
                <tr key={asset.symbol} className="hover:bg-slate-800/30">
                  <td className="py-3.5">
                    <div className="font-semibold text-white">{asset.symbol}</div>
                    <div className="text-xs text-slate-400">{asset.name}</div>
                  </td>
                  <td className="py-3.5 text-right font-mono text-xs text-slate-200">
                    {asset.balance.toFixed(4)}
                  </td>
                  <td className="py-3.5 text-right font-mono text-xs text-emerald-400">
                    {asset.sharesMultiplier.toFixed(4)}x
                  </td>
                  <td className="py-3.5 text-right font-mono text-xs text-slate-300">
                    {formatUsd(asset.unitPriceUsd)}
                  </td>
                  <td className="py-3.5 text-right font-semibold text-white">
                    {formatUsd(asset.marketValueUsd)}
                  </td>
                  <td className="py-3.5 text-right">
                    <span className="inline-block rounded-md bg-slate-800 px-2 py-0.5 text-xs text-slate-200">
                      {asset.allocationPercent.toFixed(1)}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Quadro de Cotistas (Cap Table dos Amigos) */}
      <div className="lg:col-span-5 rounded-2xl border border-slate-800 bg-slate-900/50 p-6">
        <div className="mb-4">
          <h2 className="text-base font-semibold text-white">Quadro de Cotistas (Ledger NAV)</h2>
          <p className="text-xs text-slate-400">
            Participação proporcional e lucro latente individual
          </p>
        </div>

        <div className="space-y-3">
          {members.map((member) => (
            <div
              key={member.id}
              className="rounded-xl border border-slate-800/80 bg-slate-950/60 p-3.5 flex items-center justify-between gap-3"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm text-white">{member.nickname}</span>
                  <span className="text-xs font-mono text-slate-400">
                    {shortenAddress(member.walletAddress)}
                  </span>
                </div>
                <div className="mt-1 text-xs text-slate-400">
                  {formatShares(member.sharesBalance)} cotas • PM US${" "}
                  {member.avgCostPerShareUsd.toFixed(4)}
                </div>
              </div>

              <div className="text-right">
                <div className="font-semibold text-sm text-white">
                  {formatUsd(member.currentValueUsd)}
                </div>
                <div
                  className={`text-xs font-medium ${
                    member.unrealizedGainUsd >= 0 ? "text-emerald-400" : "text-rose-400"
                  }`}
                >
                  {formatPercent(member.unrealizedGainPercent)} ({member.ownershipPercent.toFixed(1)}%)
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
