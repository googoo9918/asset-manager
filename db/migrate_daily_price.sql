ALTER TABLE security_holding ADD COLUMN IF NOT EXISTS exchange_code varchar(20);
ALTER TABLE security_holding ADD COLUMN IF NOT EXISTS price_date date;
ALTER TABLE security_holding ADD COLUMN IF NOT EXISTS previous_price_date date;
ALTER TABLE security_holding ADD COLUMN IF NOT EXISTS previous_close numeric(24,8);
ALTER TABLE security_holding ADD COLUMN IF NOT EXISTS day_price numeric(24,8);
ALTER TABLE security_holding ADD COLUMN IF NOT EXISTS daily_return numeric(24,8);
ALTER TABLE security_holding ADD COLUMN IF NOT EXISTS price_fetched_at timestamptz;
COMMENT ON COLUMN security_holding.daily_return IS '前 거래일 종가 대비 시세일 가격 등락률(%); 수량·매입가·환율 제외';
