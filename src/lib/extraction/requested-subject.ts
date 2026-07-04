// ============================================================================
// 잡 명시 요청 과목(ExtractionJob.metadata.subject) 판독 — 단일 소스.
//
// 과목 전파 계약(ISO-8): 승급 Passage.subject='KOREAN' 은 **잡 생성 시
// metadata.subject 로 명시된 요청 과목**에서만 유래한다. OCR 헤더/파일명
// 파서 추정(parseSourceMeta → SourceMaterial.subject)은 표시 메타로만 남고
// Passage 전파에 쓰이지 않는다 — '국어 영역' 표지가 섞인 통합 기출이나
// "외국어영역"(구 수능 영어) 파일명이 KOREAN 으로 오판정돼 영어 승급 지문이
// 영어 표면(buildPassageSubjectScopeWhere 가 KOREAN 제외)에서 소리 없이
// 사라지는 회귀를 차단한다.
//
// 소비처:
//   - src/trigger/_lib/extraction-finalize/source-material.ts
//     (SourceMaterial.subject 기록 — requested ?? parsed ?? "ENGLISH")
//   - src/app/api/extraction/jobs/[jobId]/commit/_lib/create-or-reuse-passage.ts
//   - src/lib/extraction/promote-m1-drafts.ts
//     (둘 다 Passage 전파 게이트 — 잡 명시 subject 만 신뢰)
//
// 국어 라우트 잡은 생성 시 metadata.subject="KOREAN" 을 항상 기록하고 preview
// 업데이트에서도 보존한다(create-job.ts) — 국어 버티컬 기능 손실 0.
// ============================================================================

/** 잡 생성 시 metadata 에 기록된 요청 과목("KOREAN")을 읽는다. 그 외/부재 → null. */
export function readRequestedSubject(metadata: unknown): "KOREAN" | null {
  if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
    if ((metadata as Record<string, unknown>).subject === "KOREAN") {
      return "KOREAN";
    }
  }
  return null;
}
