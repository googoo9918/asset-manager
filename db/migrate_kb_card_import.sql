-- Safe to apply repeatedly. Source keys remain even if a ledger entry is edited or voided.
CREATE TABLE IF NOT EXISTS kb_benefit_tier_choice (
 card_id bigint NOT NULL REFERENCES payment_card(id) ON DELETE RESTRICT,
 month char(7) NOT NULL CHECK(month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
 data jsonb NOT NULL, revision bigint NOT NULL DEFAULT 1, updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(card_id,month)
);
CREATE TABLE IF NOT EXISTS kb_benefit_plan (
 card_id bigint NOT NULL REFERENCES payment_card(id) ON DELETE RESTRICT,
 effective_month char(7) NOT NULL CHECK(effective_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
 data jsonb NOT NULL, revision bigint NOT NULL DEFAULT 1, updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(card_id,effective_month)
);
CREATE TABLE IF NOT EXISTS kb_benefit_usage (
 card_id bigint NOT NULL REFERENCES payment_card(id) ON DELETE RESTRICT,
 month char(7) NOT NULL CHECK(month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
 data jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(card_id,month)
);
CREATE TABLE IF NOT EXISTS kb_benefit_report (
 card_id bigint NOT NULL REFERENCES payment_card(id) ON DELETE RESTRICT,
 month char(7) NOT NULL CHECK(month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
 data jsonb NOT NULL,
 revision bigint NOT NULL DEFAULT 1,
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(card_id,month)
);
CREATE TABLE IF NOT EXISTS kb_category_rule (
 merchant_key varchar(200) NOT NULL,
 industry_key varchar(200) NOT NULL,
 category_id bigint NOT NULL REFERENCES category(id) ON DELETE RESTRICT,
 PRIMARY KEY(merchant_key,industry_key)
);
CREATE TABLE IF NOT EXISTS kb_card_import (
 card_id bigint NOT NULL REFERENCES payment_card(id) ON DELETE RESTRICT,
 source_key varchar(64) NOT NULL,
 entry_id bigint NOT NULL REFERENCES ledger_entry(id) ON DELETE RESTRICT,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(card_id, source_key)
);
CREATE TABLE IF NOT EXISTS kb_card_mapping (
 source_card varchar(200) PRIMARY KEY,
 card_id bigint NOT NULL REFERENCES payment_card(id) ON DELETE RESTRICT,
 account_id bigint NOT NULL REFERENCES asset_account(id) ON DELETE RESTRICT,
 point_payment boolean NOT NULL DEFAULT false
);
