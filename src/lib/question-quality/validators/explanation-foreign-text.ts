// 해설 한국어 산문의 외국 문자 오염 결정형 게이트 (연구노트 O188/O189).
//
// 실측 근거: grok-4.5 생성 해설이 학생 표면까지 한자·영단어 짜깁기를 싣고 출하된
// 사례 2건 — "…뒤따른다고 连接한다"(중문 혼입), "…뜻이 들어 steals다"(영단어가
// 한국어 종결어미에 직접 접합). 추가로 DB 800문항 FP 스캔에서 구형 flash TITLE
// 문항의 일본어 가나 혼입("핵심 논지から 벗어난")도 적발 — grok 전유가 아닌
// 모델 공통 결함 클래스다. 셋 다 V4급(해설 텍스트 손상)인데 기존 결정형 게이트에
// 검사기가 없어 통과했다. 이 게이트는 LLM 콜 없이 정규식으로 인라인 차단한다.
//
// 검사 범위는 한국어 산문 필드(explanation·keyPoints·answerLogic·오답해설)뿐이다.
// 해설은 영어 지문·문법 용어를 정상적으로 인용하므로("be able to에 묶인 think와
// and로 연결") 라틴 문자 자체는 허용하고, 다음 두 패턴만 잡는다:
//   ① explanation-foreign-script (error): 한자·가나 등 비한글 CJK — 이 제품의
//      한국어 해설에 등장할 정당한 이유가 없다. 중문 구두점(、。) 포함.
//      단, 한글 직후 괄호 한자 병기("공(功)이")는 정당한 표기 관례라 사전 제거
//      (800문항 스캔의 유일 FP 클래스).
//   ② explanation-latin-jam (error): 소문자 라틴 어절 + 종결어미 "다" 직접 접합
//      ("steals다"). 정상 한국어는 자음 말음 외래어에 "이다"를 쓰므로("system이다")
//      "[a-z]다"는 생성 짜깁기에서만 나온다. 대문자 라벨("정답은 C다")은 제외.
//
// ※ 정규식은 new RegExp(문자열) 형태로 만든다 — 정규식 리터럴에 CJK 문자를 직접
//    쓰면 도구체인 NFC 정규화(실측: U+F900 → U+8C48)나 백슬래시 소실로 클래스가
//    오염될 수 있다. 회귀 테스트가 실측 오염 3건과 FP 클래스를 고정한다.
import {
  QuestionQualitySeverity,
  collectWrongOptionExplanations,
  normalizeText,
} from "../core";

// 히라가나(3041-3096)·가타카나(30A1-30FA)·CJK 통합한자(4E00-9FFF)·확장A(3400-4DBF)·
// 호환한자(F900-FAFF)·중문 구두점(3001·3002). 한글 음절(AC00-D7A3)은 미포함.
const FOREIGN_CJK_RE = new RegExp(
  "[ぁ-ゖァ-ヺ㐀-䶿一-鿿豈-﫿、。]",
);

// 공백/한글/여는 인용부호 뒤의 소문자 라틴 어절(2자+)에 종결어미 "다"(U+B2E4)가
// 직접 붙고 문장 경계가 따라오는 패턴. "and로"·"to에" 같은 정상 조사 접합은
// "다"가 아니므로 무발화.
const LATIN_JAM_RE = new RegExp(
  "(?:^|[\\s가-힣(\"'‘“])([a-z]{2,})다(?=[\\s.,·)!?\"'’”]|$)",
);

// 한글 직후 괄호 한자 병기("공(功)이", "서학(西學)") 사전 제거용. 괄호 없는 본문 내
// 한자("连接한다")·가나("논지から")는 그대로 남아 검출된다. 가나는 병기 관례가
// 없으므로 의도적으로 클래스에서 제외(괄호 안 가나도 검출 대상 유지).
const HANJA_ANNOTATION_RE = new RegExp(
  "([가-힣])\\(([㐀-䶿一-鿿豈-﫿]{1,8})\\)",
  "g",
);

function stripHanjaAnnotations(text: string): string {
  return text.replace(HANJA_ANNOTATION_RE, "$1");
}

function snippetAround(text: string, index: number): string {
  const start = Math.max(0, index - 12);
  return text.slice(start, Math.min(text.length, index + 28)).trim();
}

/** 검사 대상 한국어 산문 필드 수집 — 값이 없거나 비문자열이면 조용히 건너뛴다. */
function collectKoreanProseFields(
  question: Record<string, unknown>,
): Array<{ field: string; text: string }> {
  const fields: Array<{ field: string; text: string }> = [];
  const explanation = normalizeText(question.explanation);
  if (explanation) fields.push({ field: "explanation", text: explanation });
  const answerLogic = normalizeText(question.answerLogic);
  if (answerLogic) fields.push({ field: "answerLogic", text: answerLogic });
  if (Array.isArray(question.keyPoints)) {
    question.keyPoints.forEach((point, index) => {
      const text = normalizeText(point);
      if (text) fields.push({ field: `keyPoints[${index}]`, text });
    });
  }
  for (const [label, text] of collectWrongOptionExplanations(
    question.wrongOptionExplanations,
  )) {
    const normalized = normalizeText(text);
    if (normalized) {
      fields.push({ field: `wrongOptionExplanations[${label}]`, text: normalized });
    }
  }
  return fields;
}

/**
 * 전 유형 공통 훅(validateQuestionQuality)에서 호출된다. KO(국어) 유형은 한자
 * 병기가 정당할 수 있어 호출측에서 제외한다. 필드당 코드별 최초 1건만 보고해
 * 이슈 스팸을 막는다(어차피 error 1건이면 반려).
 */
export function validateExplanationForeignText(
  question: Record<string, unknown>,
  add: (severity: QuestionQualitySeverity, code: string, message: string) => void,
) {
  for (const { field, text: rawText } of collectKoreanProseFields(question)) {
    const text = stripHanjaAnnotations(rawText);
    const cjk = FOREIGN_CJK_RE.exec(text);
    if (cjk && cjk.index !== undefined) {
      add(
        "error",
        "explanation-foreign-script",
        `${field}에 한국어 해설에 올 수 없는 외국 문자("${cjk[0]}")가 섞였습니다: "…${snippetAround(text, cjk.index)}…"`,
      );
    }
    const jam = LATIN_JAM_RE.exec(text);
    if (jam && jam.index !== undefined) {
      add(
        "error",
        "explanation-latin-jam",
        `${field}에 영단어와 종결어미가 직접 접합된 짜깁기("${jam[1]}다")가 있습니다: "…${snippetAround(text, jam.index)}…"`,
      );
    }
  }
}
