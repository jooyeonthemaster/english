-- Global platform key-value settings (e.g. default signup credit grant).

CREATE TABLE IF NOT EXISTS "platform_settings" (
  "key"       TEXT PRIMARY KEY,
  "value"     TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
