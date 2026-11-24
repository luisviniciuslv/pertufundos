import type { EvmAddress, Member } from "./types.js";

export interface AuthChallengeResponse {
  readonly walletAddress: EvmAddress;
  readonly nonce: string;
  readonly message: string;
  readonly expiresAt: string;
}

export interface AuthSessionResponse {
  readonly token: string;
  readonly walletAddress: EvmAddress;
  readonly member: Member | null;
  readonly expiresAt: string;
}

export function buildWalletLoginMessage(params: {
  walletAddress: EvmAddress;
  nonce: string;
  chainId: number;
  issuedAt: string;
  expiresAt: string;
}): string {
  return [
    "Pertufundos — Autenticação Criptográfica (Sem Custo de Gás)",
    "",
    "Ao assinar esta mensagem, você comprova ser o titular exclusivo desta carteira para votar, propor operações e acessar seu relatório individual de Imposto de Renda.",
    "",
    `Carteira: ${params.walletAddress.toLowerCase()}`,
    `Chain ID Principal: ${params.chainId}`,
    `Nonce Único: ${params.nonce}`,
    `Emitido em: ${params.issuedAt}`,
    `Expira em: ${params.expiresAt}`,
  ].join("\n");
}
