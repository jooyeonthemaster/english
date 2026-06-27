// Split from question-quality.ts — shared helpers in core.ts, public API via index.ts barrel.
import { QuestionQualitySeverity, normalizeComparableText, normalizeText, summaryWritingComparableTokens } from "../../core";



// ---------------------------------------------------------------------------
// 핵심 표현 빈칸 (FILL_BLANK_KEY) — 빈칸 무결성 + 자음골격/언더스코어 난독 누설 게이트.
// AI 수정이 정확한 빈칸 마커(_____) 대신 자음골격(c_ns_n_nt)·단일밑줄로 정답을
// 숨기려다 학생 문장에 정답을 노출하는 결함을 막는다(현재 검증기 0개).
// ---------------------------------------------------------------------------
export function validateFillBlankKeyQuestion(
  question: Record<string, unknown>,
  _passage: string | undefined,
  add: (severity: QuestionQualitySeverity, code: string, message: string) => void,
) {
  const swb = normalizeText(question.sentenceWithBlank);
  // 빈 문자열이면 두 검사 모두 스킵(가드) — 다른 게이트가 누락을 다룬다.
  if (!swb) return;

  // (1) 빈칸 무결성: 밑줄 3개 이상(_____)이 없으면 자음골격/단일밑줄 난독으로 의심.
  if (!/_{3,}/.test(swb)) {
    add(
      "error",
      "fbk-missing-blank-marker",
      "sentenceWithBlank에 빈칸(_____ , 밑줄 3개 이상)이 없습니다. 자음골격/단일밑줄 난독화 대신 정확한 빈칸 마커를 쓰세요.",
    );
  }

  // (2) 자음골격/언더스코어 누설: 알파벳 사이의 _·중점·점·하이픈 1~2개를 제거해
  // 난독을 복원했을 때 정답 토큰열이 학생 문장에 통째로 나타나면 노출.
  // ⚠️ deobf 가 실제로 글자 사이 분리자를 제거했을 때(deobf !== swb)에만 비교한다.
  //   정상 _____(공백 둘러싸임, 알파벳 인접 없음)은 deobf 가 no-op 이므로, 정답 단어가
  //   문맥에 정상 등장하는 문장('Balance your _____ to balance life.')을 오탐하지 않는다.
  const deobf = swb.replace(/([A-Za-z])[_·.\-]{1,2}(?=[A-Za-z])/g, "$1");
  const ans = normalizeText(question.answer ?? question.correctAnswer);
  const ansTok = summaryWritingComparableTokens(normalizeComparableText(ans));
  if (
    deobf !== swb &&
    ansTok.length &&
    ` ${summaryWritingComparableTokens(normalizeComparableText(deobf)).join(" ")} `.includes(
      ` ${ansTok.join(" ")} `,
    )
  ) {
    add(
      "error",
      "fbk-answer-skeleton-leak",
      "정답이 자음골격/언더스코어로 학생 문장에 노출됩니다. 빈칸은 _____ 로만 두세요.",
    );
  }
}
