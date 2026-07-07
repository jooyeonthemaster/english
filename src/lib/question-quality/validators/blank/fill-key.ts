// Split from question-quality.ts — shared helpers in core.ts, public API via index.ts barrel.
import { QuestionQualitySeverity, normalizeComparableText, normalizeText, summaryWritingComparableTokens } from "../../core";



// ---------------------------------------------------------------------------
// 핵심 표현 빈칸 (FILL_BLANK_KEY) — 빈칸 무결성 + 자음골격/언더스코어 난독 누설 게이트.
// AI 수정이 정확한 빈칸 마커(_____) 대신 자음골격(c_ns_n_nt)·단일밑줄로 정답을
// 숨기려다 학생 문장에 정답을 노출하는 결함을 막는다(현재 검증기 0개).
// ---------------------------------------------------------------------------
export function validateFillBlankKeyQuestion(
  question: Record<string, unknown>,
  passage: string | undefined,
  add: (severity: QuestionQualitySeverity, code: string, message: string) => void,
) {
  const swb = normalizeText(question.sentenceWithBlank);
  // 학생에게 실제 렌더되는 빈칸 본문: passageWithBlank(전체 지문) 우선, 없으면 단문.
  const rendered = normalizeText(question.passageWithBlank) || swb;

  // (0) 빈칸 개수 무결성: FILL_BLANK_KEY 는 단일 정답(answer) 1개를 묻는 유형이다.
  //   렌더 본문에 빈칸(_{3,})이 2개 이상이면 한 정답에 빈칸이 여러 개라 학생이 혼란하고
  //   채점이 갈린다(실측 Q28: "for-___ companies" + "driven by ___" 둘 다 정답 profit).
  if (rendered) {
    const blankCount = (rendered.match(/_{3,}/g) ?? []).length;
    if (blankCount > 1) {
      add(
        "error",
        "fbk-multiple-blanks",
        `FILL_BLANK_KEY 본문에 빈칸이 ${blankCount}개입니다 — 단일 정답 유형이므로 빈칸은 정확히 1개여야 합니다.`,
      );
    }
  }

  // (0b) 정답 잔존 누수: 후처리가 정답의 첫 등장만 빈칸 처리하므로, 정답이 지문 내 다른
  //   위치에 비-빈칸 verbatim 으로 남으면 학생이 그대로 읽는다(본문 답 노출). 렌더 본문에
  //   정답 어구가 단어경계로 그대로 나타나면 누수. 흔한 단일어 오탐을 피해 다토큰은 error,
  //   단일 내용어는 warning.
  {
    const ansRaw = normalizeText(question.answer ?? question.correctAnswer);
    const ansTokens = summaryWritingComparableTokens(normalizeComparableText(ansRaw));
    if (rendered && ansRaw && ansTokens.length) {
      const escaped = ansRaw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
      const residual = new RegExp(`(^|[^A-Za-z])${escaped}([^A-Za-z]|$)`, "i").test(rendered);
      if (residual) {
        const multiToken = ansTokens.length >= 2;
        add(
          multiToken ? "error" : "warning",
          "fbk-answer-residual-leak",
          `정답("${ansRaw}")이 빈칸 처리되지 않고 본문에 그대로 남아 노출됩니다. 정답이 지문에 여러 번 나오면 모두 빈칸으로 처리하거나, 유일하게 등장하는 표현을 고르세요.`,
        );
      }
    }
  }

  // (0c) 발문-정답 단어 수 모순 (wave4: fbk-direction-word-count-mismatch): 발문이
  //   "한 단어로/두 단어로/N단어로" 같은 기계 검증 가능한 단어 수를 명시했는데
  //   정답 단어 수가 어긋나면 채점 불능급 모순 — 베이스라인 실측: 발문 "한 단어로
  //   쓰시오" + 정답 "were considered colors"(3단어). 이내/이하·이상 한정어는
  //   부등식, 무한정어는 등식으로 판정하고, 수량 표현이 없으면 침묵한다.
  {
    const direction = normalizeText(question.direction);
    const ansForCount = normalizeText(question.answer ?? question.correctAnswer);
    const answerWordCount = ansForCount
      .split(/\s+/)
      .filter((token) => /[A-Za-z]/.test(token)).length;
    if (direction && answerWordCount > 0) {
      const KOREAN_NUMERALS: Record<string, number> = { 한: 1, 두: 2, 세: 3, 네: 4, 다섯: 5 };
      const match = direction.match(/(?:([한두세네]|다섯)|(\d+))\s*(?:개의\s*)?단어/);
      if (match) {
        const target = match[2] ? Number(match[2]) : KOREAN_NUMERALS[match[1]];
        const tail = direction.slice(
          (match.index ?? 0) + match[0].length,
          (match.index ?? 0) + match[0].length + 6,
        );
        const within = /이내|이하/.test(tail);
        const atLeast = /이상/.test(tail);
        const violated = within
          ? answerWordCount > target
          : atLeast
            ? answerWordCount < target
            : answerWordCount !== target;
        if (Number.isFinite(target) && violated) {
          add(
            "error",
            "fbk-direction-word-count-mismatch",
            `발문이 "${match[0]}" 조건을 명시했지만 정답("${ansForCount}")은 ${answerWordCount}단어입니다 — 발문 조건과 정답이 모순됩니다. 정답 단어 수에 맞는 발문을 쓰거나 조건에 맞는 표현을 고르세요.`,
          );
        }
      }
    }
  }

  // 빈 문자열이면 아래 두 검사는 스킵(가드) — 다른 게이트가 누락을 다룬다.
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

  // (3) 프레임 보존 (wave2: fbk-frame-altered): 유형 계약상 sentenceWithBlank 는
  //   "빈칸을 제외하고 원문 그대로"·answer 는 "원문 verbatim"이다. 빈칸에 answer 를
  //   되끼운 복원문이 원문에 존재하지 않으면 프레임이 변형된 것 — 베이스라인 실측
  //   (runIndex 41/42): "before they ___"+"to be considered colors"(비문 프레임),
  //   "before they could ___"+창작 정답. 복원 불일치 = 정답 무효/어법 파손급이라 차단.
  //   빈칸 2개는 fbk-multiple-blanks 가 이미 차단하므로 단일 빈칸에서만 검사한다.
  if (passage && ans && /_{3,}/.test(swb)) {
    const blankMarkerCount = (swb.match(/_{3,}/g) ?? []).length;
    if (blankMarkerCount === 1) {
      const restoredRaw = swb.replace(/\s*_{3,}\s*/g, () => ` ${ans} `);
      const restored = normalizeComparableText(restoredRaw)
        .replace(/\s+([.,;:!?])/g, "$1")
        .replace(/^[."'“”‘’…]+|[."'“”‘’…]+$/g, "")
        .replace(/^\.{2,}\s*|\s*\.{2,}$/g, "")
        .trim();
      const passageComparable = normalizeComparableText(passage);
      if (restored.length >= 20 && !passageComparable.includes(restored)) {
        add(
          "error",
          "fbk-frame-altered",
          `빈칸에 정답("${ans}")을 되끼운 문장이 원문에 없습니다 — 빈칸 삽입이 원문 어형/구문을 변형했습니다. sentenceWithBlank 는 원문 문장에서 정답 스팬만 _____ 로 바꾼 것이어야 합니다.`,
        );
      }
    }
  }
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
