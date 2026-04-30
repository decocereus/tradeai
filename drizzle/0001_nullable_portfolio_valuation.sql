ALTER TABLE "portfolio_positions"
  ALTER COLUMN "last_traded_price" DROP NOT NULL,
  ALTER COLUMN "close_price" DROP NOT NULL,
  ALTER COLUMN "market_value" DROP NOT NULL,
  ALTER COLUMN "pnl_absolute" DROP NOT NULL,
  ALTER COLUMN "pnl_percent" DROP NOT NULL;
