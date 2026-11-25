import { z } from "zod";
import type { EvmAddress } from "./types.js";

export const evmAddressSchema = z
  .string()
  .trim()
  .regex(/^0x[a-fA-F0-9]{40}$/, "Endereço EVM inválido (esperado formato 0x... com 40 caracteres hex)")
  .transform((addr) => addr.toLowerCase() as EvmAddress);

export const requestAuthChallengeSchema = z.object({
  walletAddress: evmAddressSchema,
});

export const verifyAuthSignatureSchema = z.object({
  walletAddress: evmAddressSchema,
  signature: z
    .string()
    .trim()
    .regex(/^0x[a-fA-F0-9]+$/, "Assinatura criptográfica inválida"),
});

export const registerMemberSchema = z.object({
  nickname: z.string().trim().min(2, "Apelido deve ter ao menos 2 caracteres").max(40),
  walletAddress: evmAddressSchema,
  baseReceiveAddress: evmAddressSchema.optional(),
  isSafeOwner: z.boolean().default(true),
});

export const recordDepositSchema = z.object({
  fromAddress: evmAddressSchema,
  amountUsd: z.number().positive("Valor do aporte deve ser maior que zero").max(10_000_000),
  txHash: z
    .string()
    .trim()
    .regex(/^0x[a-fA-F0-9]{64}$/, "Hash de transação inválido"),
});

export const prepareBaseBridgeSchema = z.object({
  fromAddress: evmAddressSchema,
  amountUsdc: z.number().positive("Valor em USDC deve ser maior que zero").max(1_000_000),
  slippagePercent: z.number().min(0.1).max(3.0).default(1.0),
});

export const createTradeProposalSchema = z.object({
  title: z.string().trim().min(4, "Título muito curto").max(120),
  description: z.string().trim().max(1000).default(""),
  type: z.enum(["BUY_ASSET", "SELL_ASSET"]),
  assetSymbol: z.string().trim().min(1, "Símbolo do ativo é obrigatório").max(24),
  assetAddress: evmAddressSchema.optional(),
  amount: z.number().positive("Quantidade/valor deve ser positivo"),
  maxSlippagePercent: z.number().min(0.1).max(2.0).default(0.5),
  createdByAddress: evmAddressSchema,
});

export const trackCustomAssetSchema = z.object({
  address: evmAddressSchema,
  category: z.enum(["ONDO_STOCK", "CRYPTO"]).optional(),
});

export const createRedemptionSchema = z.object({
  memberWallet: evmAddressSchema,
  sharesToRedeem: z.number().positive("Quantidade de cotas deve ser maior que zero"),
  receiveBaseAddress: evmAddressSchema.optional(),
  maxSlippagePercent: z.number().min(0.1).max(2.0).default(0.5),
});

export const castVoteSchema = z.object({
  voterAddress: evmAddressSchema,
  decision: z.enum(["APPROVE", "REJECT"]),
  comment: z.string().trim().max(280).optional(),
});

export const linkSafeTxSchema = z.object({
  safeTxHash: z
    .string()
    .trim()
    .regex(/^0x[a-fA-F0-9]{64}$/, "safeTxHash inválido"),
  proposerAddress: evmAddressSchema,
});

export const confirmExecutionSchema = z.object({
  executionTxHash: z
    .string()
    .trim()
    .regex(/^0x[a-fA-F0-9]{64}$/, "executionTxHash inválido"),
  executorAddress: evmAddressSchema.optional(),
});

export type RegisterMemberInput = z.infer<typeof registerMemberSchema>;
export type RecordDepositInput = z.infer<typeof recordDepositSchema>;
export type PrepareBaseBridgeInput = z.infer<typeof prepareBaseBridgeSchema>;
export type CreateTradeProposalInput = z.infer<typeof createTradeProposalSchema>;
export type CreateRedemptionInput = z.infer<typeof createRedemptionSchema>;
export type CastVoteInput = z.infer<typeof castVoteSchema>;
export type LinkSafeTxInput = z.infer<typeof linkSafeTxSchema>;
export type ConfirmExecutionInput = z.infer<typeof confirmExecutionSchema>;
export type RequestAuthChallengeInput = z.infer<typeof requestAuthChallengeSchema>;
export type VerifyAuthSignatureInput = z.infer<typeof verifyAuthSignatureSchema>;
export type TrackCustomAssetInput = z.infer<typeof trackCustomAssetSchema>;
