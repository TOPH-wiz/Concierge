
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS app_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (
        role IN ('corporate', 'proxy', 'admin')
    ),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (
        status IN ('pending', 'active', 'suspended', 'rejected')
    ),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS corporate_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE
        REFERENCES app_users(id) ON DELETE RESTRICT,
    company_name TEXT NOT NULL,
    country_code CHAR(2) NOT NULL,
    billing_currency CHAR(3) NOT NULL DEFAULT 'USD',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS proxy_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE
        REFERENCES app_users(id) ON DELETE RESTRICT,
    country_code CHAR(2) NOT NULL,
    city TEXT NOT NULL,
    verification_status TEXT NOT NULL DEFAULT 'pending'
        CHECK (
            verification_status IN (
                'pending', 'verified', 'rejected', 'expired'
            )
        ),
    availability_status TEXT NOT NULL DEFAULT 'offline'
        CHECK (
            availability_status IN (
                'offline', 'available', 'busy', 'suspended'
            )
        ),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS corporate_wallets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    corporate_id UUID NOT NULL
        REFERENCES corporate_profiles(id) ON DELETE RESTRICT,
    currency CHAR(3) NOT NULL,
    available_balance NUMERIC(19,4) NOT NULL DEFAULT 0
        CHECK (available_balance >= 0),
    reserved_balance NUMERIC(19,4) NOT NULL DEFAULT 0
        CHECK (reserved_balance >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (corporate_id, currency)
);

CREATE TABLE IF NOT EXISTS tasks_core (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    corporate_id UUID NOT NULL
        REFERENCES corporate_profiles(id) ON DELETE RESTRICT,
    assigned_proxy_id UUID
        REFERENCES proxy_profiles(id) ON DELETE RESTRICT,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    country_code CHAR(2) NOT NULL,
    city TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'requested'
        CHECK (
            status IN (
                'requested', 'funded', 'assigned',
                'in_progress', 'completed',
                'cancelled', 'disputed'
            )
        ),
    currency CHAR(3) NOT NULL,
    budget_amount NUMERIC(19,4) NOT NULL
        CHECK (budget_amount > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS task_milestones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL
        REFERENCES tasks_core(id) ON DELETE RESTRICT,
    sequence_no INTEGER NOT NULL CHECK (sequence_no > 0),
    title TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (
            status IN (
                'pending', 'in_progress', 'submitted',
                'approved', 'rejected'
            )
        ),
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (task_id, sequence_no)
);

CREATE TABLE IF NOT EXISTS escrow_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL
        REFERENCES tasks_core(id) ON DELETE RESTRICT,
    entry_type TEXT NOT NULL
        CHECK (
            entry_type IN (
                'reserve', 'release', 'refund', 'fee', 'adjustment'
            )
        ),
    amount NUMERIC(19,4) NOT NULL CHECK (amount > 0),
    currency CHAR(3) NOT NULL,
    idempotency_key TEXT NOT NULL UNIQUE,
    reference TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS telemetry_alert_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL
        REFERENCES tasks_core(id) ON DELETE RESTRICT,
    severity TEXT NOT NULL
        CHECK (
            severity IN (
                'NOMINAL_GREEN',
                'RISK_ALERT_AMBER',
                'SLA_BREACH_CRITICAL_RED'
            )
        ),
    message TEXT NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_user_id UUID
        REFERENCES app_users(id) ON DELETE RESTRICT,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id UUID,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tasks_corporate_created
    ON tasks_core (corporate_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tasks_proxy_status
    ON tasks_core (assigned_proxy_id, status);

CREATE INDEX IF NOT EXISTS idx_audit_events_created
    ON audit_events (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_telemetry_task_created
    ON telemetry_alert_logs (task_id, created_at DESC);
