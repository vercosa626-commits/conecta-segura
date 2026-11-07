CREATE TABLE alerts (id TEXT PRIMARY KEY NOT NULL, owner TEXT NOT NULL, created INTEGER NOT NULL, status TEXT NOT NULL, results TEXT NOT NULL);
--> statement-breakpoint
CREATE INDEX alerts_owner_created ON alerts(owner, created);
