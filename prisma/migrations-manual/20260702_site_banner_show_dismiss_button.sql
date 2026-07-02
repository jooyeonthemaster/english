-- Add per-banner toggle for the explicit "오늘 하루 보지 않기" dismiss button.
-- Existing banners default to showing it (prior behavior).

ALTER TABLE "site_banners"
  ADD COLUMN IF NOT EXISTS "show_dismiss_button" BOOLEAN NOT NULL DEFAULT true;
