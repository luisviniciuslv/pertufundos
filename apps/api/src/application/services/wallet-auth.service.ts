import crypto from "node:crypto";
import {
  buildWalletLoginMessage,
  type AuthChallengeResponse,
  type AuthSessionResponse,
  type EvmAddress,
} from "@pertufundos/shared";
import { verifyMessage } from "viem";
import type { AppConfig } from "../../config/env.js";
import { UnauthorizedError } from "../../domain/errors.js";
import type { IFundRepository } from "../ports/fund-repository.port.js";

interface StoredChallenge {
  readonly walletAddress: EvmAddress;
  readonly nonce: string;
  readonly message: string;
  readonly expiresAtMs: number;
}

interface SessionTokenPayload {
  readonly sub: EvmAddress;
  readonly iat: number;
  readonly exp: number;
}

const CHALLENGE_TTL_MS = 5 * 60 * 1000; // 5 minutos
const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 horas
const MAX_ACTIVE_CHALLENGES = 1_000;

export class WalletAuthService {
  private readonly challenges = new Map<string, StoredChallenge>();

  constructor(
    private readonly config: AppConfig,
    private readonly repository: IFundRepository,
  ) {}

  createChallenge(walletAddress: EvmAddress): AuthChallengeResponse {
    this.pruneExpiredChallenges();
    if (this.challenges.size >= MAX_ACTIVE_CHALLENGES) {
      const oldestKey = this.challenges.keys().next().value;
      if (oldestKey) this.challenges.delete(oldestKey);
    }

    const normalized = walletAddress.toLowerCase() as EvmAddress;
    const nonce = crypto.randomBytes(16).toString("hex");
    const now = Date.now();
    const issuedAt = new Date(now).toISOString();
    const expiresAtMs = now + CHALLENGE_TTL_MS;
    const expiresAt = new Date(expiresAtMs).toISOString();

    const message = buildWalletLoginMessage({
      walletAddress: normalized,
      nonce,
      chainId: this.config.PRIMARY_CHAIN_ID,
      issuedAt,
      expiresAt,
    });

    this.challenges.set(normalized, {
      walletAddress: normalized,
      nonce,
      message,
      expiresAtMs,
    });

    return {
      walletAddress: normalized,
      nonce,
      message,
      expiresAt,
    };
  }

  async verifySignatureAndIssueSession(params: {
    walletAddress: EvmAddress;
    signature: `0x${string}`;
  }): Promise<AuthSessionResponse> {
    const normalized = params.walletAddress.toLowerCase() as EvmAddress;
    const challenge = this.challenges.get(normalized);

    if (!challenge || challenge.expiresAtMs < Date.now()) {
      this.challenges.delete(normalized);
      throw new UnauthorizedError(
        "Desafio de login expirado ou inexistente. Solicite uma nova assinatura.",
      );
    }

    // Nonce de uso único contra replay attacks
    this.challenges.delete(normalized);

    const isValid = await verifyMessage({
      address: normalized,
      message: challenge.message,
      signature: params.signature,
    }).catch(() => false);

    if (!isValid) {
      throw new UnauthorizedError("Assinatura criptográfica inválida para esta carteira.");
    }

    const now = Date.now();
    const exp = now + SESSION_TTL_MS;
    const token = this.signToken({
      sub: normalized,
      iat: now,
      exp,
    });

    const member = await this.repository.findMemberByWallet(normalized);

    return {
      token,
      walletAddress: normalized,
      member,
      expiresAt: new Date(exp).toISOString(),
    };
  }

  authenticateBearerHeader(authorizationHeader: string | undefined): EvmAddress {
    if (!authorizationHeader?.startsWith("Bearer ")) {
      throw new UnauthorizedError();
    }

    const rawToken = authorizationHeader.slice("Bearer ".length).trim();
    const [encodedPayload, providedSig] = rawToken.split(".");
    if (!encodedPayload || !providedSig) {
      throw new UnauthorizedError("Token de sessão malformado.");
    }

    const expectedSig = crypto
      .createHmac("sha256", this.config.AUTH_SESSION_SECRET)
      .update(encodedPayload, "utf8")
      .digest("base64url");

    const actualBuf = Buffer.from(providedSig, "utf8");
    const expectedBuf = Buffer.from(expectedSig, "utf8");

    if (
      actualBuf.length !== expectedBuf.length ||
      !crypto.timingSafeEqual(actualBuf, expectedBuf)
    ) {
      throw new UnauthorizedError("Assinatura do token de sessão inválida.");
    }

    const payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    ) as SessionTokenPayload;

    if (!payload.sub || payload.exp < Date.now()) {
      throw new UnauthorizedError("Sessão expirada. Assine novamente com sua carteira.");
    }

    return payload.sub.toLowerCase() as EvmAddress;
  }

  private signToken(payload: SessionTokenPayload): string {
    const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
    const sig = crypto
      .createHmac("sha256", this.config.AUTH_SESSION_SECRET)
      .update(encodedPayload, "utf8")
      .digest("base64url");
    return `${encodedPayload}.${sig}`;
  }

  private pruneExpiredChallenges(): void {
    const now = Date.now();
    for (const [wallet, challenge] of this.challenges.entries()) {
      if (challenge.expiresAtMs < now) {
        this.challenges.delete(wallet);
      }
    }
  }
}
