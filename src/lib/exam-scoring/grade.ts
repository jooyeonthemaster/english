// ============================================================================
// 통합 시험 채점 — gradeAnswer(순수)
//
// AnswerSpec × StudentInput → GradeResult. AI 0콜 결정론.
// 불변식(설계문서 §6): 미입력=UNKNOWN 은 호출자가 처리(input null 이면 이 함수를
// 부르지 않는다). 불확실하면 NEEDS_REVIEW — 오채점보다 수동 검토가 낫다.
// 배점: CORRECT=points, WRONG=0, PARTIAL=[0,points] 클램프(만점 인플레·음수 방어).
// ============================================================================

import type {
  AnswerFieldSpec,
  AnswerSpec,
  FieldGradeResult,
  GradeResult,
  StudentInput,
} from "./types";
import {
  normalizeChoiceList,
  normalizeChoiceTokenExtended,
  normalizeText,
  round2,
  tokenizeWords,
} from "./normalize";

function correct(points: number): GradeResult {
  return { status: "CORRECT", earnedPoints: points };
}

function wrong(): GradeResult {
  return { status: "WRONG", earnedPoints: 0 };
}

function needsReview(): GradeResult {
  return { status: "NEEDS_REVIEW", earnedPoints: null };
}

// ── 텍스트 필드 1개 판정 ─────────────────────────────────────────────────────

type FieldVerdict = "CORRECT" | "WRONG" | "NEEDS_REVIEW";

function judgeTextField(
  field: AnswerFieldSpec,
  studentRaw: string,
  mode: AnswerSpec["textMode"],
): FieldVerdict {
  const student = normalizeText(studentRaw);
  if (student.length === 0) return "WRONG";

  // EXACT / VARIANTS: 정규화 후 허용 정답 중 하나와 일치
  const matched = field.answers.some((a) => normalizeText(a) === student);
  if (matched) return "CORRECT";
  if (mode !== "LEMMA") return "WRONG";

  // LEMMA: 필수 표제어가 전부 포함되면 표현 변형 가능성 — 사람 확인으로 강등.
  // 표제어 자체가 없으면 근거 부족 — 역시 사람 확인(오채점 방지 보수 원칙).
  const lemmas = field.lemmas ?? [];
  if (lemmas.length === 0) return "NEEDS_REVIEW";
  const tokens = new Set(tokenizeWords(studentRaw));
  return lemmas.every((l) => tokens.has(l)) ? "NEEDS_REVIEW" : "WRONG";
}

// ── 본체 ─────────────────────────────────────────────────────────────────────

/**
 * 학생 응답 1건을 채점한다. input 은 비-null 이어야 한다(미입력 UNKNOWN 은 호출자
 * 책임). 어떤 입력에도 throw 하지 않는다.
 */
export function gradeAnswer(spec: AnswerSpec, input: StudentInput): GradeResult {
  try {
    switch (spec.inputKind) {
      case "MANUAL_ONLY":
        return needsReview();

      case "SINGLE_CHOICE": {
        const chosen = normalizeChoiceTokenExtended(input.choice);
        if (chosen == null) return wrong();
        const answer = spec.correctChoices?.[0];
        if (answer == null) return needsReview();
        return chosen === answer ? correct(spec.points) : wrong();
      }

      case "MULTI_CHOICE": {
        const chosen = normalizeChoiceList(input.choices ?? input.choice);
        const answers = spec.correctChoices ?? [];
        if (answers.length === 0) return needsReview();
        if (chosen.length === 0) return wrong();

        const answerSet = new Set(answers);
        const hits = chosen.filter((c) => answerSet.has(c)).length;
        const extras = chosen.length - hits;
        const exact = hits === answers.length && extras === 0;
        if (exact) return correct(spec.points);

        if (spec.partialCredit) {
          // 비례 부분점수 — 초과 선택은 감점(적중−초과, 0 클램프)
          const effective = Math.max(0, hits - extras);
          const earned = round2(
            Math.max(0, Math.min(spec.points, (spec.points * effective) / answers.length)),
          );
          if (earned <= 0) return wrong();
          if (earned >= spec.points) return correct(spec.points);
          return { status: "PARTIAL", earnedPoints: earned };
        }
        return wrong();
      }

      case "TEXT_SINGLE":
      case "TEXT_MULTI": {
        const fields = spec.fields ?? [];
        if (fields.length === 0) return needsReview();
        const texts = input.texts ?? {};

        const verdicts = fields.map((f) => ({
          field: f,
          verdict: judgeTextField(f, texts[f.key] ?? "", spec.textMode),
        }));

        // 한 필드라도 판정 불가면 문항 전체를 사람 확인으로 — 부분 확정 점수가
        // 이후 수동 판정과 뒤섞여 이중 계산되는 것을 원천 차단한다.
        if (verdicts.some((v) => v.verdict === "NEEDS_REVIEW")) return needsReview();

        const per = spec.points / fields.length;
        const fieldResults: FieldGradeResult[] = verdicts.map((v) => ({
          key: v.field.key,
          correct: v.verdict === "CORRECT",
          earned: v.verdict === "CORRECT" ? round2(per) : 0,
        }));
        const correctCount = fieldResults.filter((f) => f.correct).length;

        if (correctCount === fields.length) {
          return { ...correct(spec.points), fieldResults };
        }
        if (correctCount === 0 || !spec.partialCredit) {
          return { ...wrong(), fieldResults };
        }
        const earned = round2(
          Math.max(0, Math.min(spec.points, (spec.points * correctCount) / fields.length)),
        );
        return { status: "PARTIAL", earnedPoints: earned, fieldResults };
      }

      default:
        return needsReview();
    }
  } catch {
    return needsReview();
  }
}
