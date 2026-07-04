// ============================================================================
// buildKoPlanningPrompt — 국어 문항 배분 플래닝 프롬프트 (STEP1)
// ============================================================================
// 영어 buildPlanningPrompt 와 동일 역할의 KO 판. 지문 갈래에 적용 가능한
// 유형 메뉴를 레지스트리에서 도출해 제시하고, 수능 세트 슬롯 관행(카탈로그 §3)
// 을 배분 규칙으로 준다. generate-questions-auto/route.ts 의 KO 게이트가 사용.
// ============================================================================

import { KO_TYPE_REGISTRY } from "../registry";
import type { KoPassageKind } from "../core/passage-meta";
import { KO_PASSAGE_KIND_LABELS } from "../core/passage-meta";

export interface KoPlanningPromptInput {
  schoolType?: string;
  gradeInfo?: string;
  count: number;
  passageContent: string;
  teacherIntentBlock?: string;
  analysisContext?: string;
  customPrompt?: string;
  diffLabel: string;
  passageKind?: KoPassageKind | null;
}

function typeMenuFor(passageKind: KoPassageKind | null | undefined): string {
  const groups = new Map<string, string[]>();
  for (const mod of Object.values(KO_TYPE_REGISTRY)) {
    const { meta } = mod;
    if (
      passageKind &&
      meta.passageKinds.length &&
      !meta.passageKinds.includes(passageKind) &&
      !(passageKind === "MIXED" && meta.passageKinds.some((k) => k !== "GRAMMAR_CONCEPT"))
    ) {
      continue;
    }
    const list = groups.get(meta.uiGroup) ?? [];
    list.push(`${meta.typeId}(${meta.label} — ${meta.setSlot})`);
    groups.set(meta.uiGroup, list);
  }
  return [...groups.entries()]
    .map(([group, items]) => `${group}: ${items.join(", ")}`)
    .join("\n");
}

export function buildKoPlanningPrompt({
  schoolType = "",
  gradeInfo = "",
  count,
  passageContent,
  teacherIntentBlock,
  analysisContext,
  customPrompt,
  diffLabel,
  passageKind,
}: KoPlanningPromptInput): string {
  const analysisBlock = analysisContext?.trim()
    ? analysisContext
    : "없음. 원문 지문과 교사 주석만으로 계획하십시오.";
  const kindLabel = passageKind ? KO_PASSAGE_KIND_LABELS[passageKind] : "미지정(지문에서 판정)";

  return `당신은 한국 고등학교 국어 시험 출제 계획 전문가입니다. 대상: ${[schoolType, gradeInfo].filter(Boolean).join(" ") || "고등학생"}.

지문을 읽고 정확히 ${count}개의 문항 출제 계획을 세우십시오.

## 지문 (갈래: ${kindLabel})
${passageContent}
${teacherIntentBlock?.trim() ? `\n\n## 교사 주석\n${teacherIntentBlock}` : ""}

## 저장된 지문 분석
${analysisBlock}

## 사용 가능한 문항 유형
${typeMenuFor(passageKind)}

## 계획 규칙
- 실제 수능 세트 슬롯 관행을 따르십시오: 도입 슬롯(내용 이해·표현/서술상 특징) → 중간 슬롯(추론·마커·개념 비교) → <보기> 적용/감상(3점급) → 어휘(해당 시 마지막).
- 같은 유형에 3문항 초과 배분 금지(교사가 명시 요청한 경우 예외).
- 각 계획의 targetPoint 는 지문에 실재하는 구절·개념·인물·관계를 구체적으로 인용해야 합니다.
- 갈래에 맞지 않는 유형 배분 금지 (예: 운문 지문에 서술상 특징).
- 난이도: ${diffLabel}.
${customPrompt?.trim() ? `\n## 교사 지시사항\n${customPrompt}` : ""}

계획 JSON 만 반환하십시오.`;
}
