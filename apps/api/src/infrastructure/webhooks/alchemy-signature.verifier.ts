import crypto from "node:crypto";
import { BNB_USDC_TOKEN, fromRawUnits, type EvmAddress } from "@pertufundos/shared";
import { z } from "zod";
import { UnauthorizedWebhookError } from "../../domain/errors.js";

const alchemyActivityItemSchema = z.object({
  hash: z.string(),
  category: z.string(),
  fromAddress: z.string(),
  toAddress: z.string(),
  value: z.number().optional(),
  asset: z.string().optional(),
  rawContract: z
    .object({
      value: z.string().optional(),
      address: z.string().optional(),
      decimal: z.string().optional(),
    })
    .optional(),
});

const alchemyWebhookPayloadSchema = z.object({
  id: z.string().optional(),
  type: z.string(),
  event: z.object({
    network: z.string().optional(),
    activity: z.array(alchemyActivityItemSchema),
  }),
});

export interface VerifiedUsdcDepositEvent {
  readonly txHash: string;
  readonly fromAddress: EvmAddress;
  readonly amountUsd: number;
}

/**
 * Valida a assinatura HMAC-SHA256 (`X-Alchemy-Signature`) sobre o corpo bruto exato da requisição
 * usando `crypto.timingSafeEqual` contra ataques de temporização.
 */
export function verifyAlchemyWebhookSignature(params: {
  rawBody: string;
  signatureHeader: string | undefined;
  signingKey: string;
}): void {
  const { rawBody, signatureHeader, signingKey } = params;
  if (!signingKey) {
    throw new UnauthorizedWebhookError(
      "ALCHEMY_WEBHOOK_SIGNING_KEY não configurada no servidor.",
    );
  }
  if (!signatureHeader) {
    throw new UnauthorizedWebhookError("Cabeçalho X-Alchemy-Signature ausente.");
  }

  const expectedHex = crypto
    .createHmac("sha256", signingKey)
    .update(rawBody, "utf8")
    .digest("hex");

  const actualBuf = Buffer.from(signatureHeader.trim(), "utf8");
  const expectedBuf = Buffer.from(expectedHex, "utf8");

  if (actualBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(actualBuf, expectedBuf)) {
    throw new UnauthorizedWebhookError("Assinatura X-Alchemy-Signature inválida.");
  }
}

/**
 * Filtra exclusivamente depósitos ERC-20 de USDC destinados ao endereço da Safe do grupo.
 */
export function extractSafeUsdcDeposits(params: {
  rawBody: string;
  safeAddress: EvmAddress;
}): VerifiedUsdcDepositEvent[] {
  const parsed = alchemyWebhookPayloadSchema.parse(JSON.parse(params.rawBody));
  const safeLower = params.safeAddress.toLowerCase();
  const usdcLower = BNB_USDC_TOKEN.address.toLowerCase();

  const deposits: VerifiedUsdcDepositEvent[] = [];

  for (const act of parsed.event.activity) {
    const isErc20 = act.category.toLowerCase() === "erc20";
    const isToSafe = act.toAddress.toLowerCase() === safeLower;
    const contractAddr = act.rawContract?.address?.toLowerCase();
    const isUsdc = contractAddr === usdcLower || act.asset?.toUpperCase() === "USDC";

    if (!isErc20 || !isToSafe || !isUsdc) continue;

    let amountUsd = act.value ?? 0;
    if (amountUsd <= 0 && act.rawContract?.value) {
      const decimals = act.rawContract.decimal ? parseInt(act.rawContract.decimal, 16) : BNB_USDC_TOKEN.decimals;
      amountUsd = fromRawUnits(BigInt(act.rawContract.value), decimals);
    }

    if (amountUsd > 0) {
      deposits.push({
        txHash: act.hash.toLowerCase(),
        fromAddress: act.fromAddress.toLowerCase() as EvmAddress,
        amountUsd,
      });
    }
  }

  return deposits;
}
