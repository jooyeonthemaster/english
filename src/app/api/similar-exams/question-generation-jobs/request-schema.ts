import { z } from "zod";

// 한 페이지 이미지 base64. 클라는 5MB 바이너리(≈6.7MB base64)로 캡되지만, 직접 호출
// 대비 서버에서도 상한을 둬 본문 버퍼링/행 비대화를 막는다(약 9MB 바이너리 ≈ 12MB base64).
const MAX_IMAGE_BASE64_LEN = 12_000_000;

const imageSchema = z.object({
  data: z.string().min(1).max(MAX_IMAGE_BASE64_LEN), // base64
  mediaType: z.enum(["image/jpeg", "image/png", "image/webp"]).default("image/jpeg"),
});

export const questionGenerationJobBodySchema = z.object({
  // 클라이언트 등록 시도 추적용. DB에는 저장하지 않고 서버 로그/응답 상관관계에만 사용한다.
  clientRequestId: z.string().trim().min(1).max(80).optional(),
  // 참조 원본 문항 — 한 페이지(이미지 1장 또는 1페이지 PDF)만.
  images: z.array(imageSchema).min(1).max(1),
  // 현재 활성 플로우는 사용자 수동 크롭이다. 기존 자동 bbox/crop 보강 코드는 보존하되 분석 단계에서 우회한다.
  manualCrop: z.literal(true).optional().default(true),
  // 동형을 입힐 지문(from-drafts 로 등록된 passageId). M×N 생성이므로 1개 이상 필수.
  passageIds: z.array(z.string().trim().min(1).max(80)).min(1).max(100),
  gradeInfo: z.string().trim().max(40).optional(),
});

export type QuestionGenerationJobBody = z.infer<
  typeof questionGenerationJobBodySchema
>;
