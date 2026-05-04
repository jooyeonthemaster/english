// ============================================================================
// LEGACY plain-text segmentation — regex patterns and constants.
// Extracted verbatim from segmentation.ts during mechanical split.
// ============================================================================

/** Range marker: `[1~3]`, `[1 ～ 5]`, `[20-24]`, `[20∼24]` — all tilde variants. */
export const RANGE_MARKER = /\[\s*(\d+)\s*[-~～∼]\s*(\d+)\s*\]/;

/**
 * Korean instruction markers — all variants that appear in real Korean exams.
 *
 * Covers:
 * - "다음 글을 읽고 물음에 답하시오" (shared-passage style, 수능/모평)
 * - "다음 글의 주제/제목/요지/목적/어조/분위기로 가장 적절한 것은?"
 * - "다음 글에서 필자가 주장하는 바로 가장 적절한 것은?"
 * - "다음 글의 내용과 일치하는/하지 않는 것은?"
 * - "다음 빈칸에 들어갈 말로 가장 적절한 것은?"
 * - "다음 글의 밑줄 친 부분의 의미로 가장 적절한 것은?"
 * - "위 글의 ..." 변형
 * - "(A), (B), (C)의 ..." 변형
 */
export const KR_INSTRUCTION =
  /(?:다음|위)\s*(?:글|문장|문단|지문|대화)(?:을|의|에서|에|과|와)?\s*(?:읽고|주제|제목|요지|목적|어조|분위기|심경|내용|핵심|특징|교훈|요점|이해|필자|빈칸|밑줄|선후|순서|흐름|이어질|이어지는|들어갈|일치|가리키|지칭|해석|적절한|가장)/;

/** English instruction marker — multiple phrasings. */
export const EN_INSTRUCTION =
  /(?:Read\s+the\s+(?:following\s+)?(?:passage|text|paragraph|article|dialogue)|(?:Which|What|Where|When|Why|How|Who)\s+(?:of\s+)?the\s+following|Choose\s+the\s+(?:best|most\s+appropriate)|According\s+to\s+(?:the\s+)?(?:passage|text|author)|The\s+(?:passage|author|writer)\s+)/i;

/** Single-item question header: `18.`, `19.`, `1)`, `(1)`. */
export const QUESTION_NUMBER_RE = /^\s*\(?(\d{1,3})[).]\s*/;

/** Choice line starts — ①~⑨ glyphs. */
export const CHOICE_LINE_RE = /^\s*([①②③④⑤⑥⑦⑧⑨])/;
export const CIRCLED_INDEX: Record<string, number> = {
  "①": 1, "②": 2, "③": 3, "④": 4, "⑤": 5, "⑥": 6, "⑦": 7, "⑧": 8, "⑨": 9,
};

/**
 * Exam-paper header patterns — the first few lines of page 1 often carry
 * metadata (교재명, 학교명, 학년, 교시, 과목코드, 시행년도/회차 등) AND notice
 * text (답안 작성법, 배점 안내, 선택형/서술형 문항 수 안내). These should be
 * stripped from the "지문 1" bucket so it's not polluted.
 *
 * Patterns cover:
 *   - 교재명 / 단원 / 시행년도 / 학기 / 학교
 *   - 교시 / 과목코드 / 과정(문이과) / 과목명
 *   - 답안 유의사항 bullets (◦ ㅇ ○ • ▸ 등 다양한 불릿 접두)
 *   - 성명/학번/반 기재란 + [마스킹] placeholder
 *   - 날짜 ("12월 19일(월)") / 쪽번호 / 시험 본 가운데 타이틀
 */
export const HEADER_PATTERNS: RegExp[] = [
  // 교재명 / 출처 표시
  /(?:리딩파워|리딩튜터|리딩릴레이|해커스|빠바|천일문|그래머존|워드마스터|수능특강|수능완성|수능특강[^가-힣]*|EBS)/,
  /(?:Ch(?:apter)?\.?\s*\d|Unit\s*\d|제?\s*\d+\s*(?:강|과|단원|회))/,
  /(?:외부지문|유형완성|유형독해|기출문제|교과서|모의고사|내신|학평|모평)\s*[:：]/,
  /(?:완전\s*새로운\s*지문)/, // "리딩파워(유형완성)(ch.3) 완전 새로운 지문"

  // 시험 메타
  /\d{4}\s*학년도/,
  /(?:\d\s*학기|1학기|2학기)/,
  /(?:중학교|고등학교|초등학교)/,
  /제?\s*\d+\s*교시/,
  /과목\s*코드/,
  /(?:공통\s*과정|인문[·\s]*사회|자연[·\s]*이공)/,
  /^\s*(?:영\s*어|국\s*어|수\s*학|사\s*회|과\s*학)\s*(?:I{1,3}|Ⅰ{1,3}|1|2|II|III)?\s*$/,

  // 답안 유의사항 bullets — 불릿 접두어(ㅇ ◦ ○ • ▸ ▪ ∘ — -) 허용
  /^\s*[\u3147\u25E6\u25CB\u2022\u25B8\u25AA\u2218\u26AC\-—]\s*(?:답안지|문항에|선택형|서술형|문제지면|배점|답\s*을|위\s*사항|수험|다음\s*사항)/,
  /^\s*(?:답안지에|문항에\s*따라|선택형|서술형|문제지면)/,
  /^\s*[\u3147\u25E6\u25CB\u2022]\s+\S/, // Any bullet-prefixed short notice line (broad catch)

  // 수험자 기재란
  /^\s*(?:학번|성명|이름|수험번호|반\s*번호|과\s*정)\s*[\[:：]/,
  /\[마스킹\]/, // 강력한 헤더 신호 — 어디에 있어도 헤더/메타

  // 날짜·쪽번호
  /^\s*\d{1,2}\s*월\s*\d{1,2}\s*일?\s*\(/,
  /^\s*[-–—]\s*\d+\s*[-–—]\s*$/,
  /^\s*\d{1,3}\s*$/,

  // 시험지 한국어 타이틀(보통 영역제목, 지문이 아닌 시험지 본 가운데 표기)
  /^\s*[가-힣A-Za-z0-9\s·,&]+의\s*(?:주의력|영향|변화|방법|관계|중요성)(?:에\s*미치는)?.*$/,
];

/** Content-validator patterns — a bucket that matches these heavily is
 *  almost certainly non-passage (notice / header leftover) and should be
 *  dropped after segmentation. */
export const BULLET_NOTICE_RE = /^\s*[\u3147\u25E6\u25CB\u2022\u25B8\u25AA\u2218\u26AC]\s+/;
export const PROSE_SENTENCE_END_RE = /[.!?]\s*$/;

/** Terminal punctuation test — does this end-of-line close a thought? */
export const END_SENTENCE_RE = /[.!?"'"'」』\])}]\s*$/;
