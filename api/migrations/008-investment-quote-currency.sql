-- The account currency is the holding unit (for example SHARE or BTC). Market
-- prices and purchase costs need a separate currency so EUR-listed securities
-- are not incorrectly treated as USD.
ALTER TABLE accounts ADD COLUMN quote_currency TEXT;
