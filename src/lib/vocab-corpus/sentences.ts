// ============================================================================
// vocab-corpus / 문장 분리 — 기출 단어 DB 전용 래퍼
//
// 왜 공유 splitIntoSentences 를 안 고치고 감싸는가:
//   src/lib/question-postprocess/sentence-splitter.ts 는 md-qgen(문장삽입·글의순서)·
//   question-sets·question-quality 가 공유하는 정본이다. 그 경계 규칙을 바꾸면
//   문항 생성 전반에 회귀가 번진다. 단어장 예문은 "사람이 읽는 인용문"이라 요구가
//   다르므로(따옴표 짝이 맞아야 한다, 약어에서 잘리면 안 된다) 소비처 로컬에서 후처리한다.
//
// 고치는 결함 ①  인용부호 경계 (2026-07-28 전수 실측, 4,537지문 / 34,676문장)
//   공유 분리기는 종결부호 뒤 닫는 따옴표를 다음 문장 선두로 흘린다.
//     원문  : "Art without commerce is a hobby." These words, ...
//     분리前 : ['"Art without commerce is a hobby.', '" These words, ...']
//     분리後 : ['"Art without commerce is a hobby."', 'These words, ...']
//   실측 영향: 큰따옴표 홀수개 문장 1,665건(4.80%), 따옴표로 시작하는 고아 문장 1,235건.
//
// 고치는 결함 ②  약어 절단 (2026-07-29 전수 실측, 4,537지문 / 30,139경계)
//   공유 분리기는 약어의 마침표를 문장 끝으로 오인한다.
//     원문  : He became unbeatable in the U.S. However, being number one in the U.S. didn't ...
//     분리前 : ['... in the U.', 'S.', 'However, being number one in the U.', "S. didn't ..."]
//     분리後 : ['... in the U.S.', "However, being number one in the U.S. didn't ..."]
//   원인: 공유 분리기의 단일문자 약어 검사(`/^[A-Z]$/.test(lastWord)`)가 **죽어 있다**
//         — lastWord 는 이미 `.toLowerCase()` 된 값이라 절대 매치되지 않는다.
//         그래도 그쪽을 고치면 문항 생성 전반이 흔들리므로 여기서 되붙인다.
//   실측 영향: 약어로 끝난 경계 246건 / 152지문. 그중 절단(오분리) 206건, 진짜 종결 40건.
//   게이트의 불변식(문장 재결합 = 원문)은 안 깨지므로 지금껏 조용했다. §6.1 상 예문이
//   문장 전체여야 하는 40단어 이하 문장에서 잘린 조각이 학생 카드 본문이 된다.
//
// 고치는 결함 ③  `Ph.D.` 절단 (2026-07-29 적대검수)
//   `Ph.` 는 `INITIAL`(한 글자) 에도 `DOTTED_CAPS`(전부 대문자) 에도 안 걸려 **두 패턴 사이로
//   빠졌다**. 대소문자 혼합 약어라서다. 코퍼스 4지문에서 절단됐고 그중 1건은 이미 배포돼
//   **번역이 잘린 조각을 창작으로 메웠다**:
//     en "…eventually earned his Ph."   ko "…결국 박사 학위를 취득했다."      ← 없는 `D.` 를 메움
//     en "D. from Cornell University in 1961."  ko "그 학위는 …받은 것이었다."  ← 없는 주어를 지어냄
//   게이트는 이걸 못 잡는다 — 재결합=원문도, example⊂문장도, §6.1 도 전부 통과한다.
//   → 규칙 ② 를 "잘린 조각"이 아니라 **되붙인 원래 토큰**으로 판정하게 고쳤다(`DOTTED_ABBREV`).
//
// 고치는 결함 ④  과잉 병합 — 진짜 문장 경계 파괴 (2026-07-29 적대검수)
//   규칙 ⑥ 이 인물 소개문의 「…에서 태어났다 + 지명 약어. 성(姓) + 동사…」 를 약어 수식으로 오인:
//     "Ann Bancroft was born in Minnesota, U.S. Bancroft grew up in rural Minnesota…"  (2문장→1문장)
//     "Charles Richard Drew was born in 1904 in Washington, D.C. Drew graduated from…" (2문장→1문장)
//   → `precededByComma` 가드로 갈랐다. **규칙은 측정으로 골랐다** — 근거는 그 함수 주석.
//
// 고치는 결함 ⑤  **반대 방향** — 진짜 문장 경계가 융합된다 (2026-07-29 적대검수)
//   ①~④ 는 전부 "너무 많이 갈랐다"였는데 이건 "안 갈랐다"다. 원인은 래퍼가 아니라
//   **공유 분리기**다(합성 프로브로 확정 — base 출력과 wrapper 출력이 동일했다):
//     · 전방탐색 `/^\s*(["']?\s*[A-Z]|$)/` 이 굽은 닫는따옴표 `”`·여는괄호 `(`·
//       곧은따옴표 2연속 `." "B`·여는 굽은따옴표 `“` 를 못 받는다
//     · 약어목록의 `jr`·`co` 가 `Jr.`/`Co.` 로 끝나는 진짜 종결까지 먹는다
//     · `U.S.?` `U.S..` 는 세 번째 약어검사에 걸려 종결이 무시된다
//   실장애:
//     `That's what we tell our children: "Haste makes waste." "Look before you leap."
//      "Stop and think." "Don't judge a book by its cover."`  → **네 문장이 하나로**
//   게이트는 원리상 못 잡는다 — 재결합=원문도, example⊂문장도 전부 통과한다.
//   → 래퍼가 **병합만** 하던 것을 고쳐 **분할**도 하게 했다(`splitFusedBoundaries`).
//     공유 분리기는 손대지 않는다(md-qgen·question-sets·question-quality 가 공유한다).
//
// 2026-07-29 전수 재계측(라운드 3): 융합 잔여 **0건** · 새 오분할 **0건** ·
//                        앞 라운드 약어 병합 **94/94 유지** · 무손실 4,537/4,537.
// ============================================================================

import { splitIntoSentences } from "@/lib/question-postprocess/sentence-splitter";

/**
 * 곧은 큰따옴표는 여는/닫는 구분이 없어 **직전 문장의 짝 상태로만** 판별한다.
 * 굽은 따옴표는 문자 자체가 방향을 갖는다.
 *   U+201C “ = 여는 → 절대 앞으로 당기지 않는다
 *   U+201D ” = 닫는 → 항상 당긴다
 * 작은따옴표는 축약형(don't, I'm)·소유격과 구분이 불가능하므로 **대상에서 제외**한다.
 * (2026-07-28 음성테스트에서 무조건 당기는 초안이 `She stayed."` 를 만들어 낸 뒤 도입한 규칙)
 */
const ALWAYS_CLOSING = "”"; // ”
const ALWAYS_OPENING = "“"; // “

/** 직전 문장이 따옴표를 열어놓고 닫지 않았는가(곧은 따옴표 홀수개). */
function hasUnclosedQuote(sentence: string): boolean {
  const straight = (sentence.match(/"/g) ?? []).length;
  const curlyOpen = (sentence.match(/“/g) ?? []).length;
  const curlyClose = (sentence.match(/”/g) ?? []).length;
  return straight % 2 === 1 || curlyOpen > curlyClose;
}

/**
 * 직전 문장이 **이미 따옴표로 닫혀 있는가.**
 *
 * `hasUnclosedQuote` 의 홀짝 셈은 **인용이 여러 문장에 걸치면 속는다**. 직전 문장이
 * 인용 중간에서 시작하면(여는따옴표가 더 앞 문장에 있다) 짝이 하나 모자란 것처럼 보인다:
 *   `Try them again."` ← 곧은따옴표 1개(홀수). 그런데 이미 `."` 로 닫혀 있다.
 *   다음 문장 `"I am wearing them…` 의 선두 따옴표는 **여는** 따옴표다.
 * 가드가 없으면 그걸 당겨 `Try them again.""` / `I am wearing them…` 을 만든다
 * (2026-07-29 결함 ⑤ 분할을 넣자 6자리에서 드러났다 — 분할 전에는 두 문장이 뭉쳐 있어
 *  이 자리 자체가 없었다).
 * 문장이 이미 닫는따옴표로 끝났으면 그 뒤에 닫는따옴표가 또 올 수 없다 — 그래서 막는다.
 */
function endsWithClosingQuote(sentence: string): boolean {
  return /["”'’]$/.test(sentence);
}

/**
 * 문장 선두로 흘러온 **닫는** 따옴표만 직전 문장 끝으로 되돌린다.
 * 무손실: 문자를 이동만 하고 추가·삭제하지 않는다.
 */
function reattachOrphanClosingQuotes(sentences: string[]): string[] {
  const out = [...sentences];
  for (let i = 1; i < out.length; i++) {
    const cur = out[i];
    if (cur.length === 0) continue;
    const head = cur[0];

    let isClosing: boolean;
    if (head === ALWAYS_CLOSING) isClosing = true;
    else if (head === ALWAYS_OPENING) isClosing = false;
    else if (head === '"') isClosing = !endsWithClosingQuote(out[i - 1]) && hasUnclosedQuote(out[i - 1]);
    else continue; // 작은따옴표·일반문자는 손대지 않는다

    if (!isClosing) continue;

    out[i - 1] = out[i - 1] + head;
    out[i] = cur.slice(1).trimStart();
  }
  return out.filter((s) => s.length > 0);
}

// ── 약어 절단 되붙이기 ────────────────────────────────────────────────────
//
// 설계 원칙: **넓게 잡으면 진짜 경계를 놓쳐 문장이 뭉쳐진다.** 그래서 규칙은
//   (a) 코퍼스에 실제로 나타나 절단을 일으킨 약어만 대상으로 하고,
//   (b) 다음 낱말이 "문장을 시작하는 기능어"면 절대 붙이지 않는다.
// 아래 목록은 추측이 아니라 4,537지문 전수 실측(§ 위 주석)에서 뽑은 것이다.

/** `J.` `U.` `S.` — 이름 이니셜 한 글자. */
const INITIAL = /^[A-Z]\.$/;
/** `U.S.` `D.C.` `B.C.` `A.D.` `L.A.` `P.E.` `U.S.A.` — 대문자 점열 약어. */
const DOTTED_CAPS = /^[A-Z](?:\.[A-Z])+\.$/;
/**
 * 점열 약어 **한 덩어리**(마디가 대소문자 혼합이어도 된다). `U.S.` `Ph.D.` `S.M.S.C.` `B.C.E.`
 *
 * `DOTTED_CAPS` 가 전부 대문자만 받아서 `Ph.D.` 가 `INITIAL`(한 글자) 과 그 사이로 빠졌다.
 * 2026-07-29 전수 재스캔 — 내부에 점을 가진 토큰은 코퍼스에 22종뿐이고, 대소문자 혼합은
 * `e.g.`(29회) `i.e.`(15회) `a.m.`(13) `p.m.`(7) `Ph.D.`(4) `U.S.'s`(1) `FactCheck.org`(1)
 * `www.patrol.com`(1) `U.S..`(1) 이 전부다. 그중 **분리기가 실제로 잘라낸 것은 `Ph.D.` 4회
 * (4지문) 뿐**이고 나머지는 절단 0건이다(라틴 약어는 규칙 ⑤, 시각 약어는 일부러 제외 — 아래).
 * 그래서 목록을 넓히지 않고 **형태**만 넓힌다.
 */
const DOTTED_ABBREV = /^[A-Z][a-z]{0,2}(?:\.[A-Z][a-z]{0,2})+\.$/;

/**
 * 시각 약어는 **문장을 정상적으로 끝낸다** — 실측 5건 전부가 진짜 종결이었다.
 *   "… at 11:30 a.m. Carol arrived a little early …"  ← 붙이면 두 문장이 뭉친다
 * 형태가 DOTTED_CAPS 와 겹치는 `A.M.`/`P.M.` 도 같이 막는다.
 */
const CLOCK = new Set(["a.m.", "p.m.", "A.M.", "P.M."]);

/** 문장을 끝낼 수 없는 라틴 약어. 실측: `(e.g. Christianity, …)` 1건 절단. */
const INLINE_LATIN = new Set(["e.g.", "i.e."]);

/**
 * 경칭. 실측에서 실제로 절단된 것은 `Mr.`(5) `Dr.`(2) `Mt.`(3) 뿐이다.
 * 셋 다 공유 분리기가 **앞 따옴표 때문에** 놓친 경우다(`"Mr.` → lastWord `"mr` → 목록 미스).
 * `Mrs.`(11회) `Ms.`(5회) 는 코퍼스에 있고 같은 조건에서 똑같이 깨지므로 함께 넣는다.
 * `St.`(12회) 는 Street/Saint 양의라 넣지 않았다 — 실측 절단 0건이라 넣을 근거도 없다.
 * `No.`(2회 절단) 는 **둘 다 진짜 종결**이었다("No. I bought something …") — 일부러 뺀다.
 */
const TITLES = new Set(["Mr.", "Mrs.", "Ms.", "Dr.", "Mt."]);

/**
 * 대문자로 시작해도 **문장을 여는 낱말**이면 이름이 아니다. 이 목록이 과잉수정을 막는 핵심이다.
 *   "… in the U.S. However, being number one …"   ← However 가 여기 있어 안 붙는다
 *   "… into World War I. In 1941, she was …"      ← In
 *   "… whiter than Brand X. Many have found …"    ← Many
 * 폐쇄부류(대명사·관사·전치사·접속사·조동사·수량사·의문사) + 문장부사만 담는다.
 * 실측 40건의 진짜 종결 뒤에 온 낱말이 전부 이 안에 있음을 확인했다.
 *
 * ⚠️ **여기에 인명·고유명사를 채워 넣지 마라.** 이 목록은 원리상 `U.S. Bancroft` 류를 못 막는다 —
 *    새 문장의 주어가 그 인물의 성(姓)이라 정의상 name-like 다. 그건 `precededByComma` 의 몫이다.
 */
const SENTENCE_STARTERS = new Set([
  // 대명사
  "i", "you", "he", "she", "it", "we", "they", "me", "him", "her", "us", "them",
  "my", "your", "his", "its", "our", "their", "mine", "yours", "hers", "ours", "theirs",
  "myself", "yourself", "himself", "herself", "itself", "ourselves", "themselves",
  // 한정사·수량사
  "the", "a", "an", "this", "that", "these", "those", "each", "every", "all", "both",
  "some", "any", "no", "none", "few", "many", "much", "most", "more", "less", "several",
  "other", "others", "another", "either", "neither", "such", "one", "two", "three",
  "first", "second", "next", "last", "same", "there", "here",
  // 동사·조동사
  "is", "are", "was", "were", "be", "been", "being", "am", "do", "does", "did",
  "have", "has", "had", "can", "could", "will", "would", "shall", "should",
  "may", "might", "must", "let",
  // 전치사·접속사
  "in", "on", "at", "by", "for", "from", "to", "with", "without", "within", "into",
  "onto", "over", "under", "above", "below", "between", "among", "during", "after",
  "before", "since", "until", "till", "through", "throughout", "against", "about",
  "across", "along", "around", "beyond", "despite", "toward", "towards", "upon",
  "and", "but", "or", "nor", "so", "yet", "if", "unless", "although", "though",
  "because", "while", "when", "whenever", "where", "wherever", "whereas", "as",
  "than", "once", "whether",
  // 의문사
  "what", "which", "who", "whom", "whose", "why", "how",
  // 문장부사·연결부사
  "however", "therefore", "thus", "hence", "moreover", "furthermore", "nevertheless",
  "nonetheless", "meanwhile", "instead", "consequently", "similarly", "likewise",
  "additionally", "also", "finally", "later", "then", "now", "today", "still",
  "indeed", "perhaps", "maybe", "certainly", "clearly", "obviously", "interestingly",
  "ironically", "especially", "generally", "usually", "often", "sometimes", "always",
  "never", "recently", "shortly", "soon", "eventually", "unfortunately", "fortunately",
  "surprisingly", "importantly", "actually", "again", "together", "overall", "rather",
  "just", "even", "only", "well", "yes", "unlike", "according",
]);

/** 여는/닫는 문장부호를 벗겨 약어 형태만 남긴다. 마침표는 **남긴다**(약어 판별의 핵심). */
function bareTail(token: string): string {
  return token.replace(/^[("'“‘[]+/, "").replace(/["'”’)\]]+$/, "");
}

/**
 * 토큰 내부 절단을 되붙였을 때 **원래 어떤 토큰이었는지** 복원한다.
 * 뒤따르는 쉼표·괄호까지 전부 벗겨야 `Ph.` + `D.,` 가 `Ph.D.` 로 보인다.
 */
function abbrevCore(token: string): string {
  return token.replace(/^[("'“‘[]+/, "").replace(/[^A-Za-z.]+$/, "");
}

/** 토큰에서 낱말 부분만 뽑는다. `Maugham,` → `Maugham`, `"In` → `In`, `Y.)` → `Y` */
function wordOf(token: string): string {
  return token.match(/[A-Za-z][A-Za-z'’-]*/)?.[0] ?? "";
}

/** 대문자로 시작하면서 문장을 여는 기능어가 **아닌** 낱말 = 이름·고유명사 후보. */
function isNameLike(token: string): boolean {
  const w = wordOf(token);
  if (!w || !/^[A-Z]/.test(w)) return false;
  return !SENTENCE_STARTERS.has(w.toLowerCase().split(/['’]/)[0]);
}

function isCapitalized(token: string): boolean {
  const w = wordOf(token);
  return w.length > 0 && /^[A-Z]/.test(w);
}

/**
 * 약어 **바로 앞 토큰이 쉼표로 끝나는가** — 규칙 ⑥ 의 과잉병합 차단선.
 *
 * 무엇을 가르는가: `U.S.` `D.C.` 뒤에 대문자 낱말이 오면 두 가지다.
 *   · **약어가 뒤를 수식** — `the U.S. Coast Guard` · `the U.S. Army conducted…` → 병합
 *   · **뒤가 새 문장의 주어** — `born in Minnesota, U.S. Bancroft grew up…` → 경계
 * `SENTENCE_STARTERS` 로는 **원리상 못 가른다**. 새 문장의 주어가 바로 그 인물의 성(姓)이라
 * 정의상 name-like 이기 때문이다(`Bancroft` `Drew`). 가드를 아무리 채워도 못 막는다.
 *
 * 쉼표가 가르는 이유: 쉼표 뒤의 약어는 지명 동격의 **꼬리**다(`Minnesota, U.S.` ·
 * `Washington, D.C.` · `Albany, Georgia, U.S.A.`). 명사구가 거기서 닫히므로 뒤 낱말을
 * 수식할 수 없다. 반대로 수식하는 약어 앞에는 언제나 한정사·전치사가 온다(`the U.S. …`,
 * `in L.A. …`, `with A.L. …`) — 쉼표가 올 자리가 아니다.
 *
 * **규칙은 추측이 아니라 측정으로 골랐다.** 코퍼스 4,537지문 전수에서 이 패턴
 * (`<대문자점열약어> <대문자낱말>`)이 나타나는 32곳을 전부 뽑아 육안으로 정답을 매기고
 * (MERGE 15 · BOUNDARY 17) 후보 규칙들을 그 정답집합에 돌렸다:
 *
 *   | 후보                                    | 정확도    | 틀린 곳 |
 *   |----------------------------------------|-----------|---------|
 *   | 뒤 낱말이 소문자면 병합                    | 17/32 53% | 수식 15건 전멸 |
 *   | 앞이 관사·전치사면 병합                    | 26/32 81% | `the U.S. However,` 류 6건 |
 *   | 뒤 낱말이 대문자 연속이면 병합              | 22/32 69% | `U.S. Congress.` 류 10건 |
 *   | (현행) name-like 면 병합                  | 30/32 94% | `U.S. Bancroft` · `D.C. Drew` |
 *   | + 뒤뒤가 정형동사면 경계                   | 30/32 94% | **`the U.S. Army conducted` 를 갈라 버린다** |
 *   | + 쉼표 차단 **및** 뒤뒤가 정형동사면 경계   | 31/32 97% | 같은 이유 |
 *   | **+ 쉼표 차단 (채택)**                    | **32/32** | — |
 *
 * 직관적으로 제일 그럴듯했던 "뒤뒤가 정형동사면 새 문장"은 `U.S. Army conducted a study`
 * 에서 깨진다. 측정하지 않았으면 결함을 하나 고치고 하나를 새로 만들었을 것이다.
 */
function precededByComma(beforeTail: string): boolean {
  return /,$/.test(beforeTail);
}

/**
 * `left` 와 `right` 사이의 경계가 **약어를 문장 끝으로 오인한 것**인가.
 * `gap` 은 원문에서 둘 사이에 있던 문자열(보통 공백 한 칸, 토큰 내부 절단이면 빈 문자열).
 */
function isAbbreviationCut(left: string, gap: string, right: string): boolean {
  // 닫는 따옴표로 시작하는 다음 문장은 인용부호 보정의 몫이다. 여기서 붙이면
  // `"92 is still an A." Gradually, …`(실측 1건) 처럼 진짜 경계를 뭉개 버린다.
  if (/^["'“”‘’]/.test(right)) return false;

  const leftToks = left.split(/\s+/).filter(Boolean);
  const rightToks = right.split(/\s+/).filter(Boolean);
  if (leftToks.length === 0 || rightToks.length === 0) return false;

  const tail = bareTail(leftToks[leftToks.length - 1]);
  if (!tail.endsWith(".")) return false; // `!` `?` 는 약어가 아니다
  const beforeTail = leftToks.length >= 2 ? leftToks[leftToks.length - 2] : "";
  const head = rightToks[0];
  const head2 = rightToks.length >= 2 ? rightToks[1] : "";

  // ① 한 글자짜리 "문장" — 영어 산문에서 성립하지 않는다. (`H. | Mephisto is a kind of …`)
  if (leftToks.length === 1 && INITIAL.test(tail)) return true;

  // ② 원문에 공백이 없던 자리를 잘랐다 = 토큰 내부 절단. 진짜 경계는 반드시 공백을 낀다.
  //    (`U.S.` 를 `U.` + `S.` 로 자른 115건이 전부 여기 해당한다)
  //
  //    판정은 **잘린 조각이 아니라 되붙인 원래 토큰**으로 한다. `Ph.` 조각만 보면
  //    `INITIAL`(한 글자)·`DOTTED_CAPS`(전부 대문자) 어디에도 안 걸려 빠져나갔다 —
  //    되붙이면 `Ph.D.` 라는 점열 약어임이 자명하다. (실장애: `earned his Ph.` / `D. from
  //    Cornell University in 1961.` 로 갈라져 배포됐고 번역이 잘린 조각을 창작으로 메웠다)
  if (gap.length === 0 && /^[A-Za-z]/.test(right)) {
    if (INITIAL.test(tail) || DOTTED_CAPS.test(tail)) return true;
    if (DOTTED_ABBREV.test(abbrevCore(tail + head))) return true;
  }

  // ③ 이니셜이 연달아 온다. (`J. | K. Rowling`, `A. | Y.`)
  if (INITIAL.test(tail) && INITIAL.test(bareTail(head))) return true;

  // ④ 이름 이니셜 + 성. 앞이 이름(대문자)이거나, 뒤가 대문자 두 낱말이면 사람 이름이다.
  //    (`Susan B. | Anthony`, `the J. | Walter Thompson`)  ← `to A. | Judgments of distance` 는
  //    앞이 소문자(to)이고 뒤 둘째가 소문자(of)라 걸리지 않는다.
  if (INITIAL.test(tail) && isNameLike(head) && (isCapitalized(beforeTail) || INITIAL.test(bareTail(beforeTail)) || isNameLike(head2))) {
    return true;
  }

  // ⑤ 문장을 끝낼 수 없는 라틴 약어.
  if (INLINE_LATIN.has(tail)) return true;

  // ⑥ 대문자 점열 약어 + 고유명사. (`U.S. | Coast Guard`) 시각 약어는 제외한다.
  //    **약어 바로 앞이 쉼표면 붙이지 않는다** — 근거는 아래 주석.
  if (DOTTED_CAPS.test(tail) && !CLOCK.has(tail) && isNameLike(head) && !precededByComma(beforeTail)) return true;

  // ⑦ 경칭 + 이름. (`"Mr. | Kissinger`, `Mt. | Halla`)
  if (TITLES.has(tail) && isNameLike(head)) return true;

  return false;
}

/**
 * 분리 결과를 원문 스팬으로 되짚는다. 공유 분리기는 문자를 **자르고 공백만 버리므로**
 * 각 문장은 원문의 연속 구간이다(4,537지문 전수에서 정렬 실패 0건).
 * 전제가 깨지면 null 을 돌려 약어 보정 자체를 포기한다.
 */
function alignToSource(passage: string, sentences: string[]): Array<[number, number]> | null {
  const spans: Array<[number, number]> = [];
  let pos = 0;
  for (const s of sentences) {
    while (pos < passage.length && /\s/.test(passage[pos])) pos++;
    if (!passage.startsWith(s, pos)) return null;
    spans.push([pos, pos + s.length]);
    pos += s.length;
  }
  return spans;
}

/**
 * 약어에서 잘린 경계를 되붙인다.
 * 이어붙일 때 `" "` 를 넣지 않고 **원문 구간을 그대로 잘라 쓴다** — 그래야 `U.S.` 가
 * `U. S.` 로 벌어지지 않는다(공백까지 원본과 동일).
 */
function rejoinAbbreviationCuts(passage: string, sentences: string[]): string[] {
  const spans = alignToSource(passage, sentences);
  if (!spans || spans.length === 0) return sentences;

  const out: string[] = [];
  let [start, end] = spans[0];
  for (let i = 1; i < sentences.length; i++) {
    const left = passage.slice(start, end);
    const gap = passage.slice(end, spans[i][0]);
    if (isAbbreviationCut(left, gap, sentences[i])) {
      end = spans[i][1];
      continue;
    }
    out.push(passage.slice(start, end));
    [start, end] = spans[i];
  }
  out.push(passage.slice(start, end));
  return out;
}

// ── 융합 경계 가르기 ──────────────────────────────────────────────────────
//
// 병합(위)과 **정확히 반대 방향**이다. 위는 "공유 분리기가 갈라 놓은 자리를 되붙일까?",
// 여기는 "공유 분리기가 안 가른 자리를 가를까?" 를 묻는다.
// 두 판정이 서로 싸우면 안 되므로 **같은 약어 지식을 공유**한다(아래 함수 참조).

/** 문장 안에서 종결부호 뒤에 붙어 그 문장에 남아야 하는 닫는 부호. */
const TRAILING_CLOSERS = /["'”’)\]]/;
/** 새 문장의 첫 글자가 될 수 있는 문자. 소문자로 시작하는 문장은 영어 산문에 없다. */
const SENTENCE_OPENERS = /[A-Z0-9"“'‘([]/;

/**
 * 경칭·라틴 약어 중 **분할 판정에서만** 쓰는 확장 목록.
 *
 * 병합 쪽 `TITLES` 에는 `St.` 가 없다(Street/Saint 양의라 근거 없이 넣지 않았다).
 * 그런데 분할 쪽에서는 사정이 정반대다 — 공유 분리기의 약어목록에 `st` 가 있어
 * **`St. Louis` 는 애초에 갈린 적이 없고**, 여기서 목록에 넣지 않으면 이번 분할이
 * 그걸 새로 갈라 버린다(측정: 규칙 E 가 `St.` 12건을 전부 오분할했다).
 * `vs.` `al.` 도 같은 이유다(`"jaw pain" vs. "chest pain"`, `Carpenter et al. (1998)`).
 *
 * ⚠️ 반대로 공유 분리기 약어목록의 `jr` `co` `etc` 는 **일부러 안 넣는다.**
 *    실측에서 그 자리는 전부 진짜 종결이었다(`Martin Luther King, Jr. If you consider…`
 *    `New York Telephone Co. The "Sensicall"…` `…lips, etc. Once you plug…` 14건 전건).
 */
const SPLIT_TITLES = new Set([...TITLES, "St.", "vs.", "Vs.", "al."]);

/**
 * `left`(현재 문장 시작 ~ 종결부호·닫는부호까지) 와 `right`(그 뒤 문장 후보) 사이의
 * 마침표가 **문장을 끝낸 게 아니라 약어의 일부**인가.
 *
 * **규칙은 추측이 아니라 측정으로 골랐다.** 4,537지문 전수에서 융합 후보 자리
 * (종결부호 + 닫는부호 + 공백 + 문장을 열 법한 글자, 그런데 안 갈린 곳)를 전부 뽑으면
 * **394곳**이고, 그 394곳을 육안으로 전건 판정했다(KEEP 189 · SPLIT 205 —
 * KEEP 중 94건은 앞 두 라운드가 만든 약어 병합이라 정답이 이미 확정돼 있다).
 * 후보 규칙들을 그 정답집합에 돌린 결과:
 *
 *   | 후보                                          | 정확도      | 융합잔여 | 새오분할 | 깨진 곳 |
 *   |----------------------------------------------|-------------|---------|---------|---------|
 *   | 보정 없음(공유 분리기 그대로)                    | 205/394 52% |   0     |  189    | 병합 94건 전멸 |
 *   | 앞토큰이 4자 이하면 KEEP (형태만)                | 328/394 83% |  66     |   0     | `way.` `time.` 류 |
 *   | 뒤 낱말이 name-like 면 KEEP                     | 314/394 80% |  76     |   4     | `Mike was so excited` 류 |
 *   | 공유 분리기 약어목록을 그대로 신뢰                | 377/394 96% |  14     |   3     | `etc.`11 `Jr.`2 `Co.`1 / `Mt.`3 |
 *   | 기존 래퍼 병합규칙 그대로                        | 380/394 96% |   0     |  14     | `St.`12 `al.` `vs.` |
 *   | + 경칭 확장(St./vs./al.)                        | 392/394 99% |   0     |   2     | `al. (1998)` · `vs. "chest pain"` |
 *   | **+ 경칭 뒤 인용부호·괄호 허용 (채택)**           | **394/394** | **0**   | **0**   | — |
 *   | (참고) + base 약어목록까지 전부 KEEP             | 393/394 99% |   1     |   0     | `hardness, etc. Complementary` |
 *
 * 탈락한 것 중 가장 그럴듯했던 "공유 분리기의 약어목록을 믿자"가 **양쪽으로** 틀렸다 —
 * `etc.`·`Jr.`·`Co.` 를 안 갈라 융합을 남기고, 목록에 없는 `Mt.` 를 갈라 병합을 깼다.
 * 정본이라고 해서 그 약어목록이 이 판정의 정답인 것은 아니다.
 */
function isAbbreviationBeforeSpace(left: string, right: string): boolean {
  const leftToks = left.split(/\s+/).filter(Boolean);
  const rightToks = right.split(/\s+/).filter(Boolean);
  if (leftToks.length === 0 || rightToks.length === 0) return false;

  const tail = bareTail(leftToks[leftToks.length - 1]);
  // `!` `?` 로 끝나면 약어가 아니다. `U.S.?`(실측 1건)·`U.S..`(1건)도 여기·아래에서 갈린다.
  if (!tail.endsWith(".")) return false;
  const beforeTail = leftToks.length >= 2 ? leftToks[leftToks.length - 2] : "";
  const head = rightToks[0];
  const head2 = rightToks.length >= 2 ? rightToks[1] : "";
  // 인용·괄호로 열리는 뒤쪽은 `isNameLike` 가 원리상 못 본다(`(1998)` `"chest`).
  const quotedHead = /^["'“”‘’(]/.test(right);

  // ① 문장 전체가 이니셜 한 토큰 — 영어 산문에서 성립하지 않는다. (`H. | Mephisto`)
  if (leftToks.length === 1 && INITIAL.test(tail)) return true;
  // ③ 이니셜 연속. (`J. | K. Rowling`)
  if (INITIAL.test(tail) && INITIAL.test(bareTail(head))) return true;
  // ④ 이름 이니셜 + 성.
  if (INITIAL.test(tail) && isNameLike(head) && (isCapitalized(beforeTail) || INITIAL.test(bareTail(beforeTail)) || isNameLike(head2))) {
    return true;
  }
  // ⑤ 문장을 끝낼 수 없는 라틴 약어.
  if (INLINE_LATIN.has(tail)) return true;
  // ⑥ 대문자 점열 약어 + 고유명사. 시각 약어 제외, 쉼표 뒤 제외(병합 쪽과 같은 근거).
  if (DOTTED_CAPS.test(tail) && !CLOCK.has(tail) && isNameLike(head) && !precededByComma(beforeTail)) return true;
  // ⑦ 경칭·라틴 약어 + 이름(또는 인용·괄호로 열리는 뒤쪽).
  if (SPLIT_TITLES.has(tail) && (isNameLike(head) || quotedHead)) return true;

  return false;
}

/**
 * 한 문장 안에 융합돼 있는 진짜 경계를 가른다.
 *
 * 무손실: 자르기만 하고 문자를 만들거나 지우지 않는다. 경계의 공백은 공유 분리기와
 * 똑같이 버린다(문장 사이 공백은 어차피 어느 문장에도 속하지 않는다).
 * 닫는 부호는 **왼쪽 문장에 붙인다** — 그래야 `…blink."` 처럼 따옴표 짝이 문장 안에서 닫힌다.
 */
function splitFusedBoundaries(passage: string, sentences: string[]): string[] {
  const spans = alignToSource(passage, sentences);
  if (!spans || spans.length === 0) return sentences;

  const out: string[] = [];
  for (const [sentStart, sentEnd] of spans) {
    let start = sentStart;
    let i = sentStart;
    while (i < sentEnd) {
      if (!".!?".includes(passage[i])) {
        i++;
        continue;
      }
      let j = i + 1;
      while (j < sentEnd && TRAILING_CLOSERS.test(passage[j])) j++;
      // 진짜 문장 경계는 반드시 공백을 낀다. 토큰 내부(`U.S.`)는 여기서 후보가 아니다.
      if (j >= sentEnd || !/\s/.test(passage[j])) {
        i++;
        continue;
      }
      let k = j;
      while (k < sentEnd && /\s/.test(passage[k])) k++;
      if (k >= sentEnd) break;
      if (!SENTENCE_OPENERS.test(passage[k])) {
        i = k;
        continue;
      }
      if (!isAbbreviationBeforeSpace(passage.slice(start, j), passage.slice(k, sentEnd))) {
        out.push(passage.slice(start, j));
        start = k;
      }
      i = k;
    }
    out.push(passage.slice(start, sentEnd));
  }
  return out.filter((s) => s.trim().length > 0);
}

/**
 * 단어장 예문용 문장 분리. 공유 분리기 결과에 ①약어 되붙이기 ②융합 경계 가르기
 * ③인용부호 경계 보정을 얹는다.
 *
 * **순서가 계약이다.** ①②는 원문 스팬 위에서 돌아야 하므로(문자를 옮기지 않는다)
 * 먼저이고, ③은 문자를 옮겨 정렬을 깨므로 마지막이다. ①이 ②보다 먼저인 이유는
 * ②의 판정이 "문장 안에서의 좌측 토큰"을 보기 때문 — 병합 전에는 `H.` 가 앞 문장에
 * 붙어 있어 단일토큰 신호가 사라진다(실측 `H. | Bays` 가 그렇게 깨졌다).
 *
 * 무손실 계약: `split(text).join(" ")` 의 비공백 문자열은 `text` 의 비공백
 * 문자열과 항상 같다. 위반 시 보정을 포기하고 원본 분리 결과를 그대로 돌려준다
 * (예문이 조금 못생기는 것 < 원문이 훼손되는 것).
 */
export function splitPassageIntoSentences(passage: string): string[] {
  const base = splitIntoSentences(passage);
  const rejoined = rejoinAbbreviationCuts(passage, base);
  const unfused = splitFusedBoundaries(passage, rejoined);
  const fixed = reattachOrphanClosingQuotes(unfused);
  const strip = (s: string) => s.replace(/\s+/g, "");
  return strip(fixed.join("")) === strip(base.join("")) ? fixed : base;
}
