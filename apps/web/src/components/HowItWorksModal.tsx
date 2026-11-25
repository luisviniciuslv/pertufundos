"use client";

import {
  ArrowRight,
  BookOpen,
  Coins,
  FileSpreadsheet,
  Lock,
  ShieldCheck,
  Vote,
  WalletCards,
  X,
} from "lucide-react";
import { useEffect } from "react";
import { createPortal } from "react-dom";

interface HowItWorksModalProps {
  isOpen: boolean;
  onClose: () => void;
  safeThreshold: number;
  membersCount: number;
}

export function HowItWorksModal({
  isOpen,
  onClose,
  safeThreshold,
  membersCount,
}: HowItWorksModalProps) {
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isOpen, onClose]);

  if (!isOpen || typeof document === "undefined") return null;

  const quorumLabel = `${safeThreshold} de ${Math.max(membersCount, safeThreshold)}`;

  return createPortal(
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-sm p-4 overflow-y-auto"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-3xl max-h-[88vh] overflow-y-auto rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-800 bg-slate-900/95 backdrop-blur px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
              <BookOpen className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Como funciona o Pertufundos?</h2>
              <p className="text-xs text-slate-400">
                Guia rápido do nosso clube coletivo — sem jargões e sem risco de CPF único
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar guia"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-6 space-y-6 text-xs text-slate-300 leading-relaxed">
          {/* Ideia central */}
          <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-4 space-y-2">
            <div className="flex items-center gap-2 font-semibold text-emerald-300 text-sm">
              <ShieldCheck className="h-4 w-4" />
              <span>A ideia central em 20 segundos</span>
            </div>
            <p>
              Em vez de mandar dinheiro para a conta bancária ou corretora de um único amigo, o
              grupo guarda tudo em um <strong>cofre compartilhado na blockchain (Safe Multisig)</strong>.
              Nenhuma movimentação acontece sozinha: é preciso aprovação de{" "}
              <strong>{quorumLabel} assinaturas</strong> dos membros. Cada amigo entra e sai pelo
              valor justo da cota (<strong>NAV</strong>), sem diluir ninguém.
            </p>
          </div>

          {/* 4 passos */}
          <div>
            <h3 className="text-sm font-semibold text-white mb-3">
              Sua jornada no clube em 4 passos
            </h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 space-y-1.5">
                <div className="flex items-center gap-2 font-semibold text-white">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-300 text-[11px] font-bold">
                    1
                  </span>
                  <Coins className="h-4 w-4 text-sky-400" />
                  <span>Aporte (Pix &rarr; USDC &rarr; Safe)</span>
                </div>
                <p className="text-slate-400">
                  Você compra <strong>USDC</strong> via Pix (P2P.me ou Picnic na rede Base), traz
                  para a <strong>BNB Chain</strong> em 1 clique aqui no painel e deposita na Safe. O
                  sistema emite suas cotas automaticamente pelo valor do dia.
                </p>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 space-y-1.5">
                <div className="flex items-center gap-2 font-semibold text-white">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-300 text-[11px] font-bold">
                    2
                  </span>
                  <Vote className="h-4 w-4 text-emerald-400" />
                  <span>Votação &amp; Compra de Ativos</span>
                </div>
                <p className="text-slate-400">
                  Qualquer amigo sugere comprar ou vender ações dos EUA (<code>NVDAon</code>,{" "}
                  <code>AAPLon</code>, <code>QQQon</code>) ou cripto (<code>BTCB</code>,{" "}
                  <code>ETH</code>). O grupo vota de graça e, após o quórum, assina na Safe.
                </p>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 space-y-1.5">
                <div className="flex items-center gap-2 font-semibold text-white">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-300 text-[11px] font-bold">
                    3
                  </span>
                  <WalletCards className="h-4 w-4 text-amber-400" />
                  <span>Resgate direto para seu Pix</span>
                </div>
                <p className="text-slate-400">
                  Quer sacar? Você escolhe quantas cotas resgatar. Após aprovação do grupo, o USDC
                  cai na sua carteira pessoal na rede <strong>Base</strong> e você converte para{" "}
                  <strong>Pix no seu CPF</strong> pelo P2P.me.
                </p>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 space-y-1.5">
                <div className="flex items-center gap-2 font-semibold text-white">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-300 text-[11px] font-bold">
                    4
                  </span>
                  <FileSpreadsheet className="h-4 w-4 text-violet-400" />
                  <span>Imposto de Renda Individual</span>
                </div>
                <p className="text-slate-400">
                  O painel calcula seu preço médio e ganho de capital realizado. Só você —
                  autenticado com sua carteira — consegue visualizar e baixar o seu CSV de IRPF.
                </p>
              </div>
            </div>
          </div>

          {/* Por que 2 redes */}
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-2.5">
            <h3 className="text-sm font-semibold text-white">
              Por que usamos duas redes (BNB Chain e Base)?
            </h3>
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 text-xs">
              <div className="flex-1 rounded-lg border border-amber-500/25 bg-amber-500/5 p-3">
                <div className="font-semibold text-amber-300">BNB Smart Chain (Onde investimos)</div>
                <p className="mt-1 text-slate-400">
                  Onde fica o cofre Safe, o caixa em USDC e onde negociamos as ações Ondo e criptos
                  com taxas de centavos.
                </p>
              </div>
              <ArrowRight className="hidden sm:block h-4 w-4 text-slate-500 shrink-0" />
              <div className="flex-1 rounded-lg border border-sky-500/25 bg-sky-500/5 p-3">
                <div className="font-semibold text-sky-300">Rede Base (Entrada &amp; Saída Pix)</div>
                <p className="mt-1 text-slate-400">
                  Onde você compra USDC via Pix (P2P.me / Picnic) e onde recebe seu saque para
                  converter de volta para Pix. Seu endereço <code>0x...</code> é o mesmo nas duas!
                </p>
              </div>
            </div>
          </div>

          {/* Glossário rápido */}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <div className="rounded-lg border border-slate-800/80 bg-slate-950/50 p-3">
              <div className="font-semibold text-white">O que é Cota (NAV)?</div>
              <p className="mt-1 text-slate-400">
                É o preço de cada pedacinho do clube: patrimônio total dividido pelo número de
                cotas. Garante justiça entre quem entra antes e depois.
              </p>
            </div>
            <div className="rounded-lg border border-slate-800/80 bg-slate-950/50 p-3">
              <div className="font-semibold text-white">O que é Assinar Login?</div>
              <p className="mt-1 text-slate-400">
                Uma assinatura gratuita (sem taxa de gás) que prova que você é dono da sua carteira.
                Substitui e-mail e senha.
              </p>
            </div>
            <div className="rounded-lg border border-slate-800/80 bg-slate-950/50 p-3">
              <div className="font-semibold text-white flex items-center gap-1">
                <Lock className="h-3.5 w-3.5 text-emerald-400" />
                Segurança Total
              </div>
              <p className="mt-1 text-slate-400">
                O servidor nunca guarda chaves privadas nem senhas. Nunca digite suas 12 palavras em
                site algum.
              </p>
            </div>
          </div>
        </div>

        <div className="border-t border-slate-800 px-6 py-3.5 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-emerald-500 px-5 py-2 text-xs font-semibold text-slate-950 hover:bg-emerald-400 transition"
          >
            Entendi, voltar ao painel
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
