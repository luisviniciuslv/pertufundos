import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import type {
  EvmAddress,
  LedgerEntry,
  Member,
  NavSnapshot,
  Proposal,
  ProposalStatus,
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
  mapLedgerRow,
  mapMemberRow,
  mapProposalRow,
  mapSnapshotRow,
  mapVoteRow,
  type RawLedgerRow,
  type RawMemberRow,
  type RawProposalRow,
  type RawSnapshotRow,
  type RawVoteRow,
} from "../row-mappers.js";

const { Pool } = pg;

export class PostgresFundRepository implements IFundRepository {
  private readonly pool: pg.Pool;

  constructor(connectionString: string) {
    this.pool = new Pool({ connectionString });
  }

  async runMigrations(): Promise<void> {
    const dirname = path.dirname(fileURLToPath(import.meta.url));
    const sqlPath = path.join(dirname, "schema.sql");
    const sql = await fs.readFile(sqlPath, "utf-8");
    await this.pool.query(sql);
  }

  async listMembers(): Promise<Member[]> {
    const { rows } = await this.pool.query<RawMemberRow>(
      `SELECT * FROM users ORDER BY created_at ASC`,
    );
    return rows.map(mapMemberRow);
  }

  async findMemberByWallet(walletAddress: EvmAddress): Promise<Member | null> {
    const { rows } = await this.pool.query<RawMemberRow>(
      `SELECT * FROM users WHERE LOWER(wallet_address) = LOWER($1) LIMIT 1`,
      [walletAddress],
    );
    return rows[0] ? mapMemberRow(rows[0]) : null;
  }

  async findMemberById(id: string): Promise<Member | null> {
    const { rows } = await this.pool.query<RawMemberRow>(
      `SELECT * FROM users WHERE id = $1 LIMIT 1`,
      [id],
    );
    return rows[0] ? mapMemberRow(rows[0]) : null;
  }

  async createMember(input: CreateMemberRecord): Promise<Member> {
    const existing = await this.findMemberByWallet(input.walletAddress);
    if (existing) {
      throw new ConflictError(`Carteira ${input.walletAddress} já está cadastrada (${existing.nickname}).`);
    }
    const id = crypto.randomUUID();
    const { rows } = await this.pool.query<RawMemberRow>(
      `INSERT INTO users (id, nickname, wallet_address, base_receive_address, is_safe_owner)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        id,
        input.nickname,
        input.walletAddress.toLowerCase(),
        input.baseReceiveAddress.toLowerCase(),
        input.isSafeOwner,
      ],
    );
    return mapMemberRow(rows[0]!);
  }

  async getTotalSharesIssued(): Promise<number> {
    const { rows } = await this.pool.query<{ total: string | null }>(
      `SELECT COALESCE(SUM(shares_balance), 0) AS total FROM users`,
    );
    return Number(rows[0]?.total ?? 0);
  }

  async findLedgerEntryByTxHash(txHash: string): Promise<LedgerEntry | null> {
    const { rows } = await this.pool.query<RawLedgerRow>(
      `SELECT l.*, u.nickname AS member_nickname, u.wallet_address AS member_wallet
       FROM ledger_entries l
       JOIN users u ON u.id = l.member_id
       WHERE LOWER(l.tx_hash) = LOWER($1)
       LIMIT 1`,
      [txHash],
    );
    return rows[0] ? mapLedgerRow(rows[0]) : null;
  }

  async listLedgerEntries(memberId?: string): Promise<LedgerEntry[]> {
    if (memberId) {
      const { rows } = await this.pool.query<RawLedgerRow>(
        `SELECT l.*, u.nickname AS member_nickname, u.wallet_address AS member_wallet
         FROM ledger_entries l
         JOIN users u ON u.id = l.member_id
         WHERE l.member_id = $1
         ORDER BY l.created_at DESC`,
        [memberId],
      );
      return rows.map(mapLedgerRow);
    }

    const { rows } = await this.pool.query<RawLedgerRow>(
      `SELECT l.*, u.nickname AS member_nickname, u.wallet_address AS member_wallet
       FROM ledger_entries l
       JOIN users u ON u.id = l.member_id
       ORDER BY l.created_at DESC`,
    );
    return rows.map(mapLedgerRow);
  }

  async applyLedgerMutation(mutation: RecordLedgerMutation): Promise<LedgerEntry> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const entryId = crypto.randomUUID();
      const depAdd = mutation.type === "DEPOSIT" ? mutation.amountUsd : 0;
      const redAdd = mutation.type === "REDEMPTION" ? mutation.amountUsd : 0;

      await client.query(
        `UPDATE users
         SET shares_balance = $1,
             avg_cost_per_share_usd = $2,
             total_deposited_usd = total_deposited_usd + $3,
             total_redeemed_usd = total_redeemed_usd + $4,
             realized_gain_usd = realized_gain_usd + $5
         WHERE id = $6`,
        [
          mutation.newSharesBalance,
          mutation.newAvgCostUsd,
          depAdd,
          redAdd,
          mutation.realizedGainDeltaUsd,
          mutation.memberId,
        ],
      );

      await client.query(
        `INSERT INTO ledger_entries (
           id, member_id, type, amount_usd, shares_delta, nav_at_execution_usd,
           avg_cost_after_usd, realized_gain_usd, tx_hash, chain_id
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
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
        ],
      );

      const { rows } = await client.query<RawLedgerRow>(
        `SELECT l.*, u.nickname AS member_nickname, u.wallet_address AS member_wallet
         FROM ledger_entries l
         JOIN users u ON u.id = l.member_id
         WHERE l.id = $1`,
        [entryId],
      );

      await client.query("COMMIT");
      return mapLedgerRow(rows[0]!);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async saveNavSnapshot(snapshot: Omit<NavSnapshot, "id" | "createdAt">): Promise<NavSnapshot> {
    const id = crypto.randomUUID();
    const { rows } = await this.pool.query<RawSnapshotRow>(
      `INSERT INTO nav_snapshots (id, trigger_event, total_portfolio_usd, total_shares, nav_per_share_usd)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        id,
        snapshot.triggerEvent,
        snapshot.totalPortfolioUsd,
        snapshot.totalShares,
        snapshot.navPerShareUsd,
      ],
    );
    return mapSnapshotRow(rows[0]!);
  }

  async listNavSnapshots(limit: number = 30): Promise<NavSnapshot[]> {
    const { rows } = await this.pool.query<RawSnapshotRow>(
      `SELECT * FROM nav_snapshots ORDER BY created_at DESC LIMIT $1`,
      [limit],
    );
    return rows.map(mapSnapshotRow);
  }

  async createProposal(input: CreateProposalRecord): Promise<Proposal> {
    const id = crypto.randomUUID();
    await this.pool.query(
      `INSERT INTO proposals (
         id, title, description, type, status, created_by_address, asset_symbol,
         amount, max_slippage_percent, recipient_base_address, required_approvals, expires_at
       ) VALUES ($1, $2, $3, $4, 'OPEN', $5, $6, $7, $8, $9, $10, $11)`,
      [
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
        input.expiresAt,
      ],
    );
    const created = await this.findProposalById(id);
    return created!;
  }

  async findProposalById(id: string): Promise<Proposal | null> {
    const { rows } = await this.pool.query<RawProposalRow>(
      `SELECT p.*, u.nickname AS created_by_nickname
       FROM proposals p
       LEFT JOIN users u ON LOWER(u.wallet_address) = LOWER(p.created_by_address)
       WHERE p.id = $1 LIMIT 1`,
      [id],
    );
    if (!rows[0]) return null;
    const votes = await this.getVotesForProposal(id);
    return mapProposalRow(rows[0], votes);
  }

  async listProposals(status?: ProposalStatus): Promise<Proposal[]> {
    const params: unknown[] = [];
    const whereClause = status ? (params.push(status), `WHERE p.status = $1`) : "";
    const { rows } = await this.pool.query<RawProposalRow>(
      `SELECT p.*, u.nickname AS created_by_nickname
       FROM proposals p
       LEFT JOIN users u ON LOWER(u.wallet_address) = LOWER(p.created_by_address)
       ${whereClause}
       ORDER BY p.created_at DESC`,
      params,
    );

    return Promise.all(
      rows.map(async (row) => {
        const votes = await this.getVotesForProposal(row.id);
        return mapProposalRow(row, votes);
      }),
    );
  }

  async upsertVoteAndRefreshStatus(params: {
    proposalId: string;
    voterAddress: EvmAddress;
    decision: VoteDecision;
    comment?: string;
  }): Promise<Proposal> {
    const id = crypto.randomUUID();
    await this.pool.query(
      `INSERT INTO proposal_votes (id, proposal_id, voter_address, decision, comment)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (proposal_id, voter_address)
       DO UPDATE SET decision = EXCLUDED.decision, comment = EXCLUDED.comment, created_at = NOW()`,
      [id, params.proposalId, params.voterAddress.toLowerCase(), params.decision, params.comment ?? null],
    );

    const current = await this.findProposalById(params.proposalId);
    if (!current) throw new NotFoundError("Proposta não encontrada.");

    let nextStatus = current.status;
    if (current.status === "OPEN" || current.status === "APPROVED") {
      nextStatus = current.approvalsCount >= current.requiredApprovals ? "APPROVED" : "OPEN";
    }

    if (nextStatus !== current.status) {
      await this.pool.query(`UPDATE proposals SET status = $1 WHERE id = $2`, [
        nextStatus,
        params.proposalId,
      ]);
      return (await this.findProposalById(params.proposalId))!;
    }

    return current;
  }

  async markProposalSafeLinked(proposalId: string, safeTxHash: string): Promise<Proposal> {
    await this.pool.query(
      `UPDATE proposals SET status = 'PROPOSED_ON_SAFE', safe_tx_hash = $1 WHERE id = $2`,
      [safeTxHash, proposalId],
    );
    const updated = await this.findProposalById(proposalId);
    if (!updated) throw new NotFoundError("Proposta não encontrada.");
    return updated;
  }

  async markProposalExecuted(proposalId: string, executionTxHash: string): Promise<Proposal> {
    await this.pool.query(
      `UPDATE proposals SET status = 'EXECUTED', execution_tx_hash = $1 WHERE id = $2`,
      [executionTxHash, proposalId],
    );
    const updated = await this.findProposalById(proposalId);
    if (!updated) throw new NotFoundError("Proposta não encontrada.");
    return updated;
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  private async getVotesForProposal(proposalId: string) {
    const { rows } = await this.pool.query<RawVoteRow>(
      `SELECT v.*, u.nickname AS voter_nickname
       FROM proposal_votes v
       LEFT JOIN users u ON LOWER(u.wallet_address) = LOWER(v.voter_address)
       WHERE v.proposal_id = $1
       ORDER BY v.created_at ASC`,
      [proposalId],
    );
    return rows.map(mapVoteRow);
  }
}
