CREATE TABLE IF NOT EXISTS alerts (
  id UUID PRIMARY KEY,
  owner TEXT NOT NULL,
  created BIGINT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('processing', 'processed')),
  results JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS alerts_owner_created ON alerts (owner, created);
