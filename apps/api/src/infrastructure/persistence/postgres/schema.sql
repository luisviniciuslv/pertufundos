-- =============================================================================
-- PERTUFUNDOS — Schema PostgreSQL de Produção
-- Tabelas: users, ledger_entries, nav_snapshots, proposals, proposal_votes
-- =============================================================================

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY,
  nickname VARCHAR(60) NOT NULL,
  wallet_address VARCHAR(42) NOT NULL UNIQUE,
  base_receive_address VARCHAR(42) NOT NULL,
  is_safe_owner BOOLEAN NOT NULL DEFAULT TRUE,
  shares_balance NUMERIC(28, 8) NOT NULL DEFAULT 0,
  avg_cost_per_share_usd NUMERIC(28, 8) NOT NULL DEFAULT 0,
  total_deposited_usd NUMERIC(28, 4) NOT NULL DEFAULT 0,
  total_redeemed_usd NUMERIC(28, 4) NOT NULL DEFAULT 0,
  realized_gain_usd NUMERIC(28, 4) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ledger_entries (
  id UUID PRIMARY KEY,
  member_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  type VARCHAR(20) NOT NULL CHECK (type IN ('DEPOSIT', 'REDEMPTION')),
  amount_usd NUMERIC(28, 4) NOT NULL,
  shares_delta NUMERIC(28, 8) NOT NULL,
  nav_at_execution_usd NUMERIC(28, 8) NOT NULL,
  avg_cost_after_usd NUMERIC(28, 8) NOT NULL,
  realized_gain_usd NUMERIC(28, 4) NOT NULL DEFAULT 0,
  tx_hash VARCHAR(66) NOT NULL UNIQUE,
  chain_id INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ledger_member_id ON ledger_entries(member_id);

CREATE TABLE IF NOT EXISTS nav_snapshots (
  id UUID PRIMARY KEY,
  trigger_event VARCHAR(120) NOT NULL,
  total_portfolio_usd NUMERIC(28, 4) NOT NULL,
  total_shares NUMERIC(28, 8) NOT NULL,
  nav_per_share_usd NUMERIC(28, 8) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS proposals (
  id UUID PRIMARY KEY,
  title VARCHAR(140) NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  type VARCHAR(30) NOT NULL CHECK (type IN ('BUY_ASSET', 'SELL_ASSET', 'REDEEM_SHARES')),
  status VARCHAR(30) NOT NULL CHECK (status IN ('OPEN', 'APPROVED', 'REJECTED', 'PROPOSED_ON_SAFE', 'EXECUTED', 'EXPIRED')),
  created_by_address VARCHAR(42) NOT NULL,
  asset_symbol VARCHAR(20) NOT NULL,
  amount NUMERIC(28, 8) NOT NULL,
  max_slippage_percent NUMERIC(8, 4) NOT NULL DEFAULT 0.5,
  recipient_base_address VARCHAR(42),
  required_approvals INTEGER NOT NULL,
  safe_tx_hash VARCHAR(66),
  execution_tx_hash VARCHAR(66),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS proposal_votes (
  id UUID PRIMARY KEY,
  proposal_id UUID NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  voter_address VARCHAR(42) NOT NULL,
  decision VARCHAR(15) NOT NULL CHECK (decision IN ('APPROVE', 'REJECT')),
  comment VARCHAR(300),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(proposal_id, voter_address)
);

CREATE TABLE IF NOT EXISTS custom_tokens (
  address VARCHAR(42) PRIMARY KEY,
  symbol VARCHAR(24) NOT NULL,
  name VARCHAR(120) NOT NULL,
  chain_id INTEGER NOT NULL,
  decimals INTEGER NOT NULL,
  category VARCHAR(20) NOT NULL CHECK (category IN ('STABLECOIN', 'ONDO_STOCK', 'CRYPTO')),
  logo_url TEXT,
  reference_price_usd NUMERIC(28, 8) NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
