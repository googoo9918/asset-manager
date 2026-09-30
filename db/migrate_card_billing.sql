ALTER TABLE payment_card ADD COLUMN IF NOT EXISTS billing_closing_day integer CHECK(billing_closing_day BETWEEN 1 AND 31);
ALTER TABLE payment_card ADD COLUMN IF NOT EXISTS billing_month_offset integer CHECK(billing_month_offset BETWEEN 0 AND 2);
ALTER TABLE initial_installment ADD COLUMN IF NOT EXISTS source_entry_id bigint REFERENCES ledger_entry(id);
CREATE UNIQUE INDEX IF NOT EXISTS initial_installment_source_entry_unique ON initial_installment(source_entry_id) WHERE source_entry_id IS NOT NULL;
