import crypto from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import type { DatabaseSync as DatabaseSyncType } from "node:sqlite";
import type {
  EvmAddress,
  LedgerEntry,
  Member,
  NavSnapshot,
  Proposal,
  ProposalStatus,
  TokenMetadata,
  VoteDecision,
} from "@pertufundos/shared";
import { ConflictError, NotFoundError } from "../../../domain/errors.js";
import type {
  CreateMemberRecord,
  CreateProposalRecord,
  IFundRepository,
  RecordLedgerMutation,
} from "../../../application/ports/fund-repository.port.js";
import {
  mapCustomTokenRow,
  mapLedgerRow,
  mapMemberRow,
  mapProposalRow,
  mapSnapshotRow,
  mapVoteRow,
  type RawCustomTokenRow,
  type RawLedgerRow,
  type RawMemberRow,
  type RawProposalRow,
  type RawSnapshotRow,
  type RawVoteRow,
} from "../row-mappers.js";

const require = createRequire(import.meta.url);

export class SqliteFundRepository implements IFundRepository {
  private readonly db: DatabaseSyncType;

  constructor(dbFilePath: string) {
    const { DatabaseSync } = require("node:sqlite") as typeof import("node:sqlite");
    if (dbFilePath !== ":memory:") {
      fs.mkdirSync(path.dirname(path.resolve(dbFilePath)), { recursive: true });
    }
    this.db = new DatabaseSync(dbFilePath);
    this.initializeSchema();
  }

  // TODO: REMOVER RESET TEMPORÁRIO após confirmação do usuário
  async clearAllDataForReset(): Promise<void> {
    this.db.exec(`
      DELETE FROM proposal_votes;
      DELETE FROM proposals;
      DELETE FROM ledger_entries;
      DELETE FROM nav_snapshots;
      DELETE FROM users;
      DELETE FROM custom_tokens;
    `);
  }

  private initializeSchema(): void {
    this.db.exec(`
      PRAGMA foreign_keys = ON;

      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        nickname TEXT NOT NULL,
        wallet_address TEXT NOT NULL UNIQUE,
        base_receive_address TEXT NOT NULL,
        is_safe_owner INTEGER NOT NULL DEFAULT 1,
        shares_balance REAL NOT NULL DEFAULT 0,
        avg_cost_per_share_usd REAL NOT NULL DEFAULT 0,
        total_deposited_usd REAL NOT NULL DEFAULT 0,
        total_redeemed_usd REAL NOT NULL DEFAULT 0,
        realized_gain_usd REAL NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS ledger_entries (
        id TEXT PRIMARY KEY,
        member_id TEXT NOT NULL REFERENCES users(id),
        type TEXT NOT NULL,
        amount_usd REAL NOT NULL,
        shares_delta REAL NOT NULL,
        nav_at_execution_usd REAL NOT NULL,
        avg_cost_after_usd REAL NOT NULL,
        realized_gain_usd REAL NOT NULL DEFAULT 0,
        tx_hash TEXT NOT NULL UNIQUE,
        chain_id INTEGER NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS nav_snapshots (
        id TEXT PRIMARY KEY,
        trigger_event TEXT NOT NULL,
        total_portfolio_usd REAL NOT NULL,
        total_shares REAL NOT NULL,
        nav_per_share_usd REAL NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS proposals (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        type TEXT NOT NULL,
        status TEXT NOT NULL,
        created_by_address TEXT NOT NULL,
        asset_symbol TEXT NOT NULL,
        amount REAL NOT NULL,
        max_slippage_percent REAL NOT NULL DEFAULT 0.5,
        recipient_base_address TEXT,
        required_approvals INTEGER NOT NULL,
        safe_tx_hash TEXT,
        execution_tx_hash TEXT,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS proposal_votes (
        id TEXT PRIMARY KEY,
        proposal_id TEXT NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
        voter_address TEXT NOT NULL,
        decision TEXT NOT NULL,
        comment TEXT,
        created_at TEXT NOT NULL,
        UNIQUE(proposal_id, voter_address)
      );

      CREATE TABLE IF NOT EXISTS custom_tokens (
        address TEXT PRIMARY KEY,
        symbol TEXT NOT NULL,
        name TEXT NOT NULL,
        chain_id INTEGER NOT NULL,
        decimals INTEGER NOT NULL,
        category TEXT NOT NULL,
        logo_url TEXT,
        reference_price_usd REAL NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL
      );
    `);
  }

  async listMembers(): Promise<Member[]> {
    const rows = this.db
      .prepare(`SELECT * FROM users ORDER BY created_at ASC`)
      .all() as unknown as RawMemberRow[];
    return rows.map(mapMemberRow);
  }

  async findMemberByWallet(walletAddress: EvmAddress): Promise<Member | null> {
    const row = this.db
      .prepare(`SELECT * FROM users WHERE LOWER(wallet_address) = LOWER(?) LIMIT 1`)
      .get(walletAddress) as unknown as RawMemberRow | undefined;
    return row ? mapMemberRow(row) : null;
  }

  async findMemberById(id: string): Promise<Member | null> {
    const row = this.db
      .prepare(`SELECT * FROM users WHERE id = ? LIMIT 1`)
      .get(id) as unknown as RawMemberRow | undefined;
    return row ? mapMemberRow(row) : null;
  }

  async createMember(input: CreateMemberRecord): Promise<Member> {
    const existing = await this.findMemberByWallet(input.walletAddress);
    if (existing) {
      throw new ConflictError(
        `Carteira ${input.walletAddress} já está cadastrada (${existing.nickname}).`,
      );
    }
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO users (id, nickname, wallet_address, base_receive_address, is_safe_owner, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.nickname,
        input.walletAddress.toLowerCase(),
        input.baseReceiveAddress.toLowerCase(),
        input.isSafeOwner ? 1 : 0,
        now,
      );
    return (await this.findMemberById(id))!;
  }

  async getTotalSharesIssued(): Promise<number> {
    const row = this.db
      .prepare(`SELECT COALESCE(SUM(shares_balance), 0) AS total FROM users`)
      .get() as { total: number };
    return Number(row?.total ?? 0);
  }

  async findLedgerEntryByTxHash(txHash: string): Promise<LedgerEntry | null> {
    const row = this.db
      .prepare(
        `SELECT l.*, u.nickname AS member_nickname, u.wallet_address AS member_wallet
         FROM ledger_entries l
         JOIN users u ON u.id = l.member_id
         WHERE LOWER(l.tx_hash) = LOWER(?)
         LIMIT 1`,
      )
      .get(txHash) as unknown as RawLedgerRow | undefined;
    return row ? mapLedgerRow(row) : null;
  }

  async listLedgerEntries(memberId?: string): Promise<LedgerEntry[]> {
    if (memberId) {
      const rows = this.db
        .prepare(
          `SELECT l.*, u.nickname AS member_nickname, u.wallet_address AS member_wallet
           FROM ledger_entries l
           JOIN users u ON u.id = l.member_id
           WHERE l.member_id = ?
           ORDER BY l.created_at DESC`,
        )
        .all(memberId) as unknown as RawLedgerRow[];
      return rows.map(mapLedgerRow);
    }

    const rows = this.db
      .prepare(
        `SELECT l.*, u.nickname AS member_nickname, u.wallet_address AS member_wallet
         FROM ledger_entries l
         JOIN users u ON u.id = l.member_id
         ORDER BY l.created_at DESC`,
      )
      .all() as unknown as RawLedgerRow[];
    return rows.map(mapLedgerRow);
  }

  async applyLedgerMutation(mutation: RecordLedgerMutation): Promise<LedgerEntry> {
    this.db.exec("BEGIN TRANSACTION");
    try {
      const entryId = crypto.randomUUID();
      const now = new Date().toISOString();
      const depAdd = mutation.type === "DEPOSIT" ? mutation.amountUsd : 0;
      const redAdd = mutation.type === "REDEMPTION" ? mutation.amountUsd : 0;

      this.db
        .prepare(
          `UPDATE users
           SET shares_balance = ?,
               avg_cost_per_share_usd = ?,
               total_deposited_usd = total_deposited_usd + ?,
               total_redeemed_usd = total_redeemed_usd + ?,
               realized_gain_usd = realized_gain_usd + ?
           WHERE id = ?`,
        )
        .run(
          mutation.newSharesBalance,
          mutation.newAvgCostUsd,
          depAdd,
          redAdd,
          mutation.realizedGainDeltaUsd,
          mutation.memberId,
        );

      this.db
        .prepare(
          `INSERT INTO ledger_entries (
             id, member_id, type, amount_usd, shares_delta, nav_at_execution_usd,
             avg_cost_after_usd, realized_gain_usd, tx_hash, chain_id, created_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          entryId,
          mutation.memberId,
          mutation.type,
          mutation.amountUsd,
          mutation.sharesDelta,
          mutation.navAtExecutionUsd,
          mutation.newAvgCostUsd,
          mutation.realizedGainDeltaUsd,
          mutation.txHash.toLowerCase(),
          mutation.chainId,
          now,
        );

      this.db.exec("COMMIT");
      return (await this.findLedgerEntryByTxHash(mutation.txHash))!;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  async saveNavSnapshot(snapshot: Omit<NavSnapshot, "id" | "createdAt">): Promise<NavSnapshot> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO nav_snapshots (id, trigger_event, total_portfolio_usd, total_shares, nav_per_share_usd, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        snapshot.triggerEvent,
        snapshot.totalPortfolioUsd,
        snapshot.totalShares,
        snapshot.navPerShareUsd,
        now,
      );

    const row = this.db
      .prepare(`SELECT * FROM nav_snapshots WHERE id = ?`)
      .get(id) as unknown as RawSnapshotRow;
    return mapSnapshotRow(row);
  }

  async listNavSnapshots(limit: number = 30): Promise<NavSnapshot[]> {
    const rows = this.db
      .prepare(`SELECT * FROM nav_snapshots ORDER BY created_at DESC LIMIT ?`)
      .all(limit) as unknown as RawSnapshotRow[];
    return rows.map(mapSnapshotRow);
  }

  async createProposal(input: CreateProposalRecord): Promise<Proposal> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO proposals (
           id, title, description, type, status, created_by_address, asset_symbol,
           amount, max_slippage_percent, recipient_base_address, required_approvals, created_at, expires_at
         ) VALUES (?, ?, ?, ?, 'OPEN', ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.title,
        input.description,
        input.type,
        input.createdByAddress.toLowerCase(),
        input.assetSymbol,
        input.amount,
        input.maxSlippagePercent,
        input.recipientBaseAddress?.toLowerCase() ?? null,
        input.requiredApprovals,
        now,
        input.expiresAt,
      );
    return (await this.findProposalById(id))!;
  }

  async findProposalById(id: string): Promise<Proposal | null> {
    const row = this.db
      .prepare(
        `SELECT p.*, u.nickname AS created_by_nickname
         FROM proposals p
         LEFT JOIN users u ON LOWER(u.wallet_address) = LOWER(p.created_by_address)
         WHERE p.id = ? LIMIT 1`,
      )
      .get(id) as unknown as RawProposalRow | undefined;
    if (!row) return null;
    const votes = this.getVotesForProposal(id);
    return mapProposalRow(row, votes);
  }

  async listProposals(status?: ProposalStatus): Promise<Proposal[]> {
    const rows = (
      status
        ? this.db
            .prepare(
              `SELECT p.*, u.nickname AS created_by_nickname
               FROM proposals p
               LEFT JOIN users u ON LOWER(u.wallet_address) = LOWER(p.created_by_address)
               WHERE p.status = ?
               ORDER BY p.created_at DESC`,
            )
            .all(status)
        : this.db
            .prepare(
              `SELECT p.*, u.nickname AS created_by_nickname
               FROM proposals p
               LEFT JOIN users u ON LOWER(u.wallet_address) = LOWER(p.created_by_address)
               ORDER BY p.created_at DESC`,
            )
            .all()
    ) as unknown as RawProposalRow[];

    return rows.map((row) => mapProposalRow(row, this.getVotesForProposal(row.id)));
  }

  async upsertVoteAndRefreshStatus(params: {
    proposalId: string;
    voterAddress: EvmAddress;
    decision: VoteDecision;
    comment?: string;
  }): Promise<Proposal> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO proposal_votes (id, proposal_id, voter_address, decision, comment, created_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(proposal_id, voter_address)
         DO UPDATE SET decision = excluded.decision, comment = excluded.comment, created_at = excluded.created_at`,
      )
      .run(
        id,
        params.proposalId,
        params.voterAddress.toLowerCase(),
        params.decision,
        params.comment ?? null,
        now,
      );

    const current = await this.findProposalById(params.proposalId);
    if (!current) throw new NotFoundError("Proposta não encontrada.");

    let nextStatus = current.status;
    if (current.status === "OPEN" || current.status === "APPROVED") {
      nextStatus = current.approvalsCount >= current.requiredApprovals ? "APPROVED" : "OPEN";
    }

    if (nextStatus !== current.status) {
      this.db
        .prepare(`UPDATE proposals SET status = ? WHERE id = ?`)
        .run(nextStatus, params.proposalId);
      return (await this.findProposalById(params.proposalId))!;
    }
    return current;
  }

  async markProposalSafeLinked(proposalId: string, safeTxHash: string): Promise<Proposal> {
    this.db
      .prepare(`UPDATE proposals SET status = 'PROPOSED_ON_SAFE', safe_tx_hash = ? WHERE id = ?`)
      .run(safeTxHash, proposalId);
    const updated = await this.findProposalById(proposalId);
    if (!updated) throw new NotFoundError("Proposta não encontrada.");
    return updated;
  }

  async markProposalExecuted(proposalId: string, executionTxHash: string): Promise<Proposal> {
    this.db
      .prepare(`UPDATE proposals SET status = 'EXECUTED', execution_tx_hash = ? WHERE id = ?`)
      .run(executionTxHash, proposalId);
    const updated = await this.findProposalById(proposalId);
    if (!updated) throw new NotFoundError("Proposta não encontrada.");
    return updated;
  }

  async listCustomTokens(): Promise<TokenMetadata[]> {
    const rows = this.db
      .prepare(`SELECT * FROM custom_tokens ORDER BY symbol ASC`)
      .all() as unknown as RawCustomTokenRow[];
    return rows.map(mapCustomTokenRow);
  }

  async upsertCustomToken(token: TokenMetadata): Promise<TokenMetadata> {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO custom_tokens (address, symbol, name, chain_id, decimals, category, logo_url, reference_price_usd, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(address) DO UPDATE SET
           symbol = excluded.symbol,
           name = excluded.name,
           decimals = excluded.decimals,
           category = excluded.category,
           logo_url = COALESCE(excluded.logo_url, custom_tokens.logo_url)`,
      )
      .run(
        token.address.toLowerCase(),
        token.symbol,
        token.name,
        token.chainId,
        token.decimals,
        token.category,
        token.logoUrl ?? null,
        token.referencePriceUsd,
        now,
      );
    const row = this.db
      .prepare(`SELECT * FROM custom_tokens WHERE address = ?`)
      .get(token.address.toLowerCase()) as unknown as RawCustomTokenRow;
    return mapCustomTokenRow(row);
  }

  async close(): Promise<void> {
    this.db.close();
  }

  private getVotesForProposal(proposalId: string) {
    const rows = this.db
      .prepare(
        `SELECT v.*, u.nickname AS voter_nickname
         FROM proposal_votes v
         LEFT JOIN users u ON LOWER(u.wallet_address) = LOWER(v.voter_address)
         WHERE v.proposal_id = ?
         ORDER BY v.created_at ASC`,
      )
      .all(proposalId) as unknown as RawVoteRow[];
    return rows.map(mapVoteRow);
  }
}
