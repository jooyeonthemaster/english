// ============================================================================
// 국어 지문 세트 — 멤버 생성 프롬프트 블록 (예약 금지 목록 + 재생성 피드백)
// ============================================================================
// 세트 멤버는 기존 단일문항 KO 생성 경로(runQuestionGeneration → buildKoGenerationPrompt,
// OpenRouter)를 그대로 재사용하고, 이 모듈의 블록을 customPrompt 에 덧붙여
// "이전 멤버들의 (a) 마커 패밀리·스팬 (b) 정답 근거 문장" 재사용을 금지한다.
// 순수 문자열 조립 — AI/DB import 0.
// ============================================================================

import type { KoMarker, KoMarkerFamily } from "../core/markers";
import type { KoSetLeakageConflict } from "./leakage";

const FAMILY_LABELS: Record<KoMarkerFamily, string> = {
  KOR_CIRCLED: "㉠ 계열(한글 원문자)",
  LATIN_CIRCLED: "ⓐ 계열(라틴 원문자)",
  RANGE_BRACKET: "[A] 블록",
};

function compact(value: unknown, max = 70): string {
  const text = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  if (!text) return "";
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** 앞 멤버 1개의 예약 정보 — 생성 완료 후 수집해 다음 멤버 프롬프트에 주입한다. */
export interface KoReservedMemberInfo {
  index: number; // 0-기반 orderInSet
  typeId: string;
  label: string;
  markers: KoMarker[];
  /** 정답 근거 구절(evidence[].spanText — 지문 verbatim). */
  evidenceSpans: string[];
  /** 정답 요약(선지 텍스트/모범답안 압축) — 노출 금지 대상. */
  answerSummary: string;
}

export function buildKoSetMemberPromptBlock(args: {
  presetLabel: string;
  slotIndex: number; // 0-기반
  slotCount: number;
  allowedFamilies: KoMarkerFamily[];
  forbiddenFamilies: KoMarkerFamily[];
  reserved: KoReservedMemberInfo[];
}): string {
  const { presetLabel, slotIndex, slotCount, allowedFamilies, forbiddenFamilies, reserved } =
    args;

  const lines: string[] = [
    `## 국어 지문 세트 공동 출제 규칙 (${presetLabel} — ${slotIndex + 1}/${slotCount}번째 문항)`,
    "이 문항은 같은 지문을 공유하는 세트의 한 문항이다. 시험지에는 지문이 1회만 인쇄되고, 모든 문항의 마킹(㉠/ⓐ/[A])이 그 한 지문 위에 함께 표시된다.",
  ];

  if (allowedFamilies.length > 0) {
    lines.push(
      `- 지문 마킹이 필요하면 반드시 ${allowedFamilies
        .map((f) => FAMILY_LABELS[f])
        .join(", ")} 만 사용할 것.`,
    );
  } else {
    lines.push(
      "- 이 문항은 지문 마킹(㉠/ⓐ/[A]) 없이 출제할 것 — 마킹 패밀리가 모두 다른 문항에 예약되어 있다. 발문에서 대상을 지시할 때는 작은따옴표 인용을 사용할 것.",
    );
  }
  if (forbiddenFamilies.length > 0) {
    lines.push(
      `- 다음 마킹 패밀리는 다른 문항이 예약했으므로 절대 사용 금지: ${forbiddenFamilies
        .map((f) => FAMILY_LABELS[f])
        .join(", ")}.`,
    );
  }

  if (reserved.length > 0) {
    lines.push("", "### 이미 출제된 문항의 예약 목록(재사용 금지)");
    for (const info of reserved.slice(0, 8)) {
      const markerParts = info.markers
        .slice(0, 6)
        .map((m) => `${m.label} "${compact(m.spanText, 40)}"`)
        .join(", ");
      const evidenceParts = info.evidenceSpans
        .slice(0, 4)
        .map((s) => `"${compact(s, 50)}"`)
        .join(", ");
      const answer = compact(info.answerSummary, 60);
      lines.push(
        `- #${info.index + 1} ${info.label}(${info.typeId})` +
          (markerParts ? ` / 마킹: ${markerParts}` : "") +
          (evidenceParts ? ` / 정답 근거: ${evidenceParts}` : "") +
          (answer ? ` / 정답: "${answer}"` : ""),
      );
    }
    lines.push(
      "",
      "### 예약 목록에 대한 필수 규칙",
      "- 예약된 마킹 구절을 다시 마킹하거나, 예약된 마킹과 같은 문장 안의 구절을 마킹하지 말 것.",
      "- 예약된 정답 근거 문장·정답 표현을 이 문항의 발문·<보기>·선지·해설에 연속 6어절 이상 그대로 인용하지 말 것.",
      "- 이 문항의 정답 근거는 예약 목록과 다른 문장에서 선택할 것(자연스러운 첫 후보가 겹치면 다른 유효한 근거를 고를 것).",
    );
  }

  return lines.join("\n");
}

/** 누수스캔 blocking 후 해당 멤버 재생성 시 덧붙이는 피드백 블록. */
export function buildKoSetRetryPromptBlock(args: {
  conflicts: KoSetLeakageConflict[];
}): string {
  const lines = [
    "## 세트 검수 재생성 지시",
    "직전 생성 결과가 세트 결정론 검수에서 반려되었다. 아래 충돌을 반드시 해소해 다시 출제할 것.",
    "",
    "반려 사유:",
  ];
  const items = args.conflicts.slice(0, 6).map((c) => `- ${c.reason}`);
  lines.push(...(items.length ? items : ["- (사유 요약 없음 — 예약 목록 규칙을 전부 준수할 것)"]));
  lines.push(
    "",
    "- 마킹 위치·근거 문장·정답 표현을 이전 시도와 다르게 선택할 것.",
    "- 예약 목록 규칙(마커 패밀리·근거 문장·정답 인용 금지)을 다시 확인할 것.",
  );
  return lines.join("\n");
}

/** customPrompt 병합 — 사용자 지시가 있으면 앞에 둔다(영어 세트 관행 미러). */
export function appendKoSetPrompt(
  customPrompt: string | undefined,
  block: string,
): string {
  const base = customPrompt?.trim();
  if (!block.trim()) return base ?? "";
  return base ? `${base}\n\n${block}` : block;
}
