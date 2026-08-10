"use client";

export interface RestorationChange {
  before: string;
  after: string;
  type: string;
  reason: string;
}
export interface RestorationResult {
  restoredText: string;
  status: "RESTORED" | "PARTIAL" | "NO_RESTORATION_NEEDED" | "FAILED";
  changes: RestorationChange[];
  warnings: string[];
}
