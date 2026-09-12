-- 기존 사용자용. DB/계좌/원장 데이터 삭제 없이 컬럼과 인덱스만 추가한다.
-- 재실행 가능하며 이미 저장한 순서는 덮어쓰지 않는다.
BEGIN;
ALTER TABLE asset_account ADD COLUMN IF NOT EXISTS display_order integer NOT NULL DEFAULT 2147483647 CHECK (display_order >= 0);
ALTER TABLE payment_card ADD COLUMN IF NOT EXISTS display_order integer NOT NULL DEFAULT 2147483647 CHECK (display_order >= 0);
COMMENT ON COLUMN asset_account.display_order IS '유형별 사용자 지정 표시 순서. 신규 계좌는 마지막에 표시';
COMMENT ON COLUMN payment_card.display_order IS '사용자 지정 카드 표시 순서. 신규 카드는 마지막에 표시';
CREATE INDEX IF NOT EXISTS idx_asset_account_display_order ON asset_account(asset_type, display_order, id);
CREATE INDEX IF NOT EXISTS idx_payment_card_display_order ON payment_card(display_order, id);
COMMIT;
