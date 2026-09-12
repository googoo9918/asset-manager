BEGIN;
INSERT INTO category(name,transaction_type,parent_id,active,system_code) VALUES
 ('급여','INCOME',NULL,true,'SALARY_ROOT'),('투자수입','INCOME',NULL,true,'INVEST_ROOT'),
 ('생활비','EXPENSE',NULL,true,'LIVING_ROOT'),('금융비용','EXPENSE',NULL,true,'FINANCE_ROOT') ON CONFLICT DO NOTHING;
INSERT INTO category(name,transaction_type,parent_id,active,system_code)
SELECT '배당금','INCOME',id,true,'DIVIDEND' FROM category WHERE system_code='INVEST_ROOT' ON CONFLICT DO NOTHING;
INSERT INTO category(name,transaction_type,parent_id,active,system_code)
SELECT '대출이자','EXPENSE',id,true,'LOAN_INTEREST' FROM category WHERE system_code='FINANCE_ROOT' ON CONFLICT DO NOTHING;
INSERT INTO category(name,transaction_type,parent_id,active,system_code)
SELECT '중도상환수수료','EXPENSE',id,true,'LOAN_FEE' FROM category WHERE system_code='FINANCE_ROOT' ON CONFLICT DO NOTHING;
COMMIT;
