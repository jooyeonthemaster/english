// ============================================================================
// KO 학생 디지털 응시 표시 텍스트 (KO-LEAK-2) — startExam/getExamResult 전용
// ============================================================================
// 학생 응시 경로(src/actions/exam-taking.ts)는 questionText 하나만 내려보내는
// 얇은 파이프인데, DB questionText 는 serializeKoQuestion(지문 미동봉 정책 —
// question-generation-persistence.ts)이라 KO 지문 동봉 유형이 '윗글' 없이
// 출제된다(㉠ 지시 발문 + ㉠ 없는 화면 = 풀이 불성립).
//
// 이 모듈은 KO 게이트 하에서 Passage 관계의 원문으로 레지스트리 모듈의
// toRenderModel 을 재구성해(마커 병합·유형별 렌더 정책 — 예: KO_NS_CLOZE 의
// <보기> 마스킹 — 이 모델 계층에서 자동 상속) 학생 안전 표시 텍스트를 만든다.
//   포함: 마킹 지문 파트(+출처·각주) + 발문 + 【보기】 + 【자료】(자체자료) + 【조건】
//   절대 미포함: 선지(options 컬럼 전용)·정답·해설·evidence·answerSheet
//     — 본문 직렬화는 serializeKoQuestion(render-model.ts) 재사용으로 강제.
// 실패 시(비 KO·미등록 유형·structuredData 결손·조립 예외) 저장된 questionText
// 로 비파괴 강등한다. 영어 문항은 이 모듈을 아예 타지 않는다(호출측 KO 게이트).
// ============================================================================

import { getKoTypeModule, isKoQuestionType } from "./registry";
import { serializeKoQuestion, type KoRenderModel } from "./core/render-model";

export interface KoStudentExamQuestionLike {
  subType: string | null;
  questionText: string;
  structuredData?: unknown;
  passage?: { content?: string | null } | null;
}

/**
 * structuredData 는 prisma Json(객체) 또는 JSON 문자열 양쪽을 수용 (ko-paper-adapter 와 동일 규약).
 * 직접수정(발문 자유편집)이 남기는 `{_manualEditedFlat:true}` 스텁·비봉투 객체는 null 로
 * 강등해야 교사 수정 questionText 폴백이 발동한다 — 안 거르면 스텁이 발문 없는 모델로
 * 조립되고 지문만 있는 combined 가 폴백을 가려 학생 화면에서 발문이 소실된다
 * (ko-paper-adapter isKoEnvelope 미러).
 */
function isKoEnvelope(data: Record<string, unknown>): boolean {
  if (data._manualEditedFlat === true) return false;
  if (typeof data.direction === "string") return true;
  return typeof data._typeId === "string" && data._typeId.startsWith("KO_");
}

function readStructuredData(raw: unknown): Record<string, unknown> | null {
  if (!raw) return null;
  if (typeof raw === "object" && !Array.isArray(raw)) {
    const record = raw as Record<string, unknown>;
    return isKoEnvelope(record) ? record : null;
  }
  if (typeof raw !== "string") return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) &&
      isKoEnvelope(parsed as Record<string, unknown>)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** 지문 파트 평문화 — (가) 라벨 + 마킹 본문(밑줄 __ __ 유지) + 출처 + *각주. */
function serializeKoPassageParts(model: KoRenderModel): string {
  const parts = model.passage?.parts ?? [];
  const blocks: string[] = [];
  for (const part of parts) {
    if (!part.text || !part.text.trim()) continue;
    const lines: string[] = [part.label ? `${part.label} ${part.text}` : part.text];
    if (part.sourceLine) lines.push(part.sourceLine);
    for (const f of part.footnotes ?? []) lines.push(`*${f.term}: ${f.gloss}`);
    blocks.push(lines.join("\n"));
  }
  return blocks.join("\n\n");
}

/**
 * KO 문항의 학생 응시 화면용 questionText 를 조립한다.
 * 지문(마커 병합) → 발문 → 【보기】 → 【조건】 순. 정답류는 구조적으로 미포함.
 */
export function buildKoStudentExamText(question: KoStudentExamQuestionLike): string {
  const fallback = question.questionText || "";
  const subType = question.subType;
  if (!isKoQuestionType(subType)) return fallback;
  const mod = getKoTypeModule(subType);
  if (!mod) return fallback;
  const structuredData = readStructuredData(question.structuredData);
  if (!structuredData) return fallback;
  try {
    const model = mod.toRenderModel(structuredData, {
      passage: question.passage?.content || "",
    });
    // serializeKoQuestion = 발문+【보기】+【자료】+【조건】만 — 선지·정답·해설 절대 미포함.
    const body = serializeKoQuestion(model);
    const passageText = serializeKoPassageParts(model);
    const combined = [passageText, body]
      .filter((s) => s.trim().length > 0)
      .join("\n\n")
      .trim();
    return combined || fallback;
  } catch {
    return fallback; // 렌더모델 조립 실패 → 저장본 폴백 (조용한 크래시 금지)
  }
}
