import { isKoAnalysisSection } from "./ko-schema";

/**
 * 저장된 학습지 보고서(JSON)가 PRIME_KO(국어) 보고서인지 런타임 판별한다.
 *
 * 판별 기준(둘 중 하나면 KO):
 *  1. 루트 `subject === "KOREAN"` 리터럴 — ko-schema 가 파서 단에서 박아 두는 판별자.
 *  2. 섹션 kind 가 KO 유니온(ko-passage 등) — 구버전/부분 데이터가 subject 를 잃어도 판별.
 *
 * 영어 보고서에는 subject 필드가 없고 KO kind 섹션도 없으므로 항상 false —
 * 이 게이트를 쓰는 표면(편집기 팔레트·미리보기 파싱)의 영어 경로는 무회귀다.
 */
export function isKoAnalysisReportShape(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const v = value as { subject?: unknown; sections?: unknown };
  if (v.subject === "KOREAN") return true;
  if (!Array.isArray(v.sections)) return false;
  return v.sections.some(
    (s) =>
      !!s &&
      typeof s === "object" &&
      isKoAnalysisSection(s as { kind: string }),
  );
}
