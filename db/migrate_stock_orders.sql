CREATE TABLE IF NOT EXISTS stock_order (
 id varchar(36) PRIMARY KEY,
 account_id bigint NOT NULL REFERENCES asset_account(id),
 account_name varchar(100) NOT NULL, owner_code varchar(20) NOT NULL,
 account_binding varchar(64) NOT NULL,
 environment varchar(10) NOT NULL CHECK(environment IN ('REAL','DEMO')),
 exchange varchar(10) NOT NULL CHECK(exchange IN ('KRX','NASD','NYSE','AMEX')),
 symbol varchar(20) NOT NULL, side varchar(4) NOT NULL CHECK(side IN ('BUY','SELL')),
 order_type varchar(10) NOT NULL CHECK(order_type IN ('LIMIT','CURRENT','MARKET')),
 quantity numeric(9,0) NOT NULL CHECK(quantity>0), price numeric(24,4) NOT NULL CHECK(price>=0),
 quote_price numeric(24,8), quoted_at timestamptz, expires_at timestamptz NOT NULL,
 order_date date NOT NULL,
 status varchar(20) NOT NULL CHECK(status IN ('PREVIEW','SENDING','ACCEPTED','PARTIAL','FILLED','REJECTED','UNKNOWN','CANCEL_SENDING','CANCEL_PENDING','CANCEL_UNKNOWN','CANCELLED')),
 broker_order_id varchar(40), broker_branch varchar(40), cancel_order_id varchar(40),
 filled_quantity numeric(9,0) NOT NULL DEFAULT 0, remaining_quantity numeric(9,0) NOT NULL,
 average_fill_price numeric(24,8), message varchar(500), version integer NOT NULL DEFAULT 0,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_stock_order_account ON stock_order(account_id,created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS ix_stock_order_broker_identity ON stock_order(account_id,environment,exchange,order_date,broker_order_id) WHERE broker_order_id IS NOT NULL;
