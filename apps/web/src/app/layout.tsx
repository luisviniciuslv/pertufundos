import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Providers } from "@/components/Providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pertufundos — Clube Web3 de Ações Tokenizadas",
  description:
    "Cofre Multisig Safe + Ondo Tokenized Stocks via OKX DEX + Saque individual em Pix via P2P.me (Base)",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" className="dark">
      <body className="min-h-screen bg-slate-950 text-slate-100">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
