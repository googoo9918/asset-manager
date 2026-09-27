ALTER TABLE planned_occurrence ADD COLUMN IF NOT EXISTS payment_group_id bigint REFERENCES planned_occurrence(id);
CREATE INDEX IF NOT EXISTS ix_planned_occurrence_payment_group ON planned_occurrence(payment_group_id);
COMMENT ON COLUMN planned_occurrence.payment_group_id IS '계좌별 카드대금 합산 출금 이력; 카드별 금액은 임의 배분하지 않음';
