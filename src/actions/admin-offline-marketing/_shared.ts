// 오프라인 홍보 관리 server actions — 공용 타입/검증/헬퍼.
// 구조: 홍보(캠페인) 1개 → 파일(에셋) N개.

import { z } from "zod";

export type ActionFail = { success: false; error: string };
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export type ActionResult<T extends object = {}> =
  | ({ success: true } & T)
  | ActionFail;

export function fail(error: string): ActionFail {
  return { success: false, error };
}

/** 홍보에 속한 파일 DTO. */
export interface OfflineMarketingAssetDto {
  id: string;
  campaignId: string;
  title: string;
  description: string | null;
  fileUrl: string;
  fileName: string;
  fileSize: number;
  pageCount: number | null;
  sortOrder: number;
  createdAt: string;
}

/** 홍보(캠페인) DTO — 파일 목록 포함. */
export interface OfflineMarketingCampaignDto {
  id: string;
  title: string;
  description: string | null;
  category: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  assets: OfflineMarketingAssetDto[];
}

// ─── 홍보(캠페인) 입력 ────────────────────────────────────────────────────────
export const campaignInputSchema = z.object({
  title: z.string().trim().min(1, "홍보 이름을 입력하세요").max(150),
  description: z.string().trim().max(1000).nullish(),
  category: z.string().trim().min(1).max(60).default("기타"),
  isActive: z.boolean().default(true),
});

// ─── 파일(에셋) 등록 입력 — 업로드 완료 후 메타데이터 저장 ─────────────────────
export const assetInputSchema = z.object({
  campaignId: z.string().trim().min(1, "홍보를 찾을 수 없습니다"),
  title: z.string().trim().min(1, "파일 이름을 입력하세요").max(150),
  description: z.string().trim().max(1000).nullish(),
  storagePath: z.string().trim().min(1, "업로드 경로가 없습니다"),
  fileName: z.string().trim().min(1).max(255),
  fileSize: z.number().int().min(0).default(0),
  pageCount: z.number().int().min(0).nullish(),
});

// ─── 파일(에셋) 메타 수정 ─────────────────────────────────────────────────────
export const assetEditSchema = z.object({
  title: z.string().trim().min(1, "파일 이름을 입력하세요").max(150),
  description: z.string().trim().max(1000).nullish(),
});

export type CampaignInput = z.infer<typeof campaignInputSchema>;
export type AssetInput = z.infer<typeof assetInputSchema>;
export type AssetEdit = z.infer<typeof assetEditSchema>;
