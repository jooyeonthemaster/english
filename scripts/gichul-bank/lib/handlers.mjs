// 기출 문제 은행 빌더 — 유형별 결정론 핸들러.
// 계약 정본: docs/gichul-question-bank-spec.md §3.1 (정찰 렌즈 1 확정: buildGeneratedQuestionText 동형 직렬화)
// 각 핸들러는 { subType, direction, questionText, options, correctAnswer, structuredData, passageContent, issues[] } 를 돌려준다.
// issues 가 비어 있지 않으면 status=pending(함대 수리 대상). 절대 추측으로 채우지 않는다 — 못 찾으면 issue 를 남긴다.
import { BLANK, CIRC, alignToCorpus, findInText, findInTextCI, hasHangul, norm, similarity, splitSentences, tidy, tokenIndex, wordCount } from "./text.mjs";
import { splitChoices, splitStem } from "./origin.mjs";
import {
  CANON, ORDER_PERMS, ORDER_SEQ, SUBTYPE_OF, footnoteTail, grammarAnswer, grammarMarker, grammarOptions, insertAnswer, insertOptions,
  irrelevantAnswer, irrelevantOptions, joinParts, mcAnswer, mcOptions, orderOptions, summaryOptions, vocabMarker,
} from "./serialize.mjs";

const ORACLE_MIN = 0.965;
/** 출력이 코퍼스 본문에서 나오는 유형(출처 지문·빈칸·함축·요약)은 오라클이 「같은 지문인가」 확인용이라 문턱을 낮춘다 */
const ORACLE_SOFT = 0.94;

/** 발문 상용어 — 자간 공백으로 쪼개진 글자를 다시 붙일 때만 쓴다("가 장"→"가장") */
const DIRECTION_WORDS = ["다음", "가장", "적절한", "적절하지", "밑줄", "부분", "들어갈", "말로", "바로", "순서로", "흐름으로", "문장이", "관계", "요약하고자", "일치하는", "일치하지", "않는", "고르시오", "것은", "글에서", "의미하는", "뜻하는", "가리키는", "필자가", "주장하는", "내용과", "내용을", "제목으로", "주제로", "요지로"];

/** 발문 확정 — 인쇄본 발문이 한글이고 물음/명령으로 끝나면 채택, 아니면 CANON */
function resolveDirection(stemText, typeGroup, issues) {
  const s = tidy(stemText || "").replace(/\s*\[\d점\]\s*/g, " ").replace(/\s*\d{1,2}\.\s*$/g, "").trim();
  // 구형 학평 PDF 는 발문의 띄어쓰기가 통째로 빠진다("다음글의요지로가장적절한것은?") — 표준 발문이 있는 유형은 CANON 으로 대체
  if (s && hasHangul(s) && !/\s/.test(s.replace(/\[\d점\]/, "")) && CANON[typeGroup]) return CANON[typeGroup];
  // PDF 자간이 글자 사이 공백으로 풀린 발문("가 다 음 글에서", "가 장 적절한" — 검수 실측 3건): 공백을 다 지우면 표준 발문과
  // 같으면 CANON, 아니면 발문 상용어만 이어 붙인다(단어 사전 밖은 손대지 않는다).
  const squashed = s.replace(/\s+/g, "");
  if (CANON[typeGroup] && squashed === CANON[typeGroup].replace(/\s+/g, "")) return CANON[typeGroup];
  const glued = DIRECTION_WORDS.reduce((acc, w) => acc.replace(new RegExp(w.split("").join("\\s?"), "g"), w), s);
  if (glued !== s) return resolveDirection(glued, typeGroup, issues);
  if (s && hasHangul(s) && /[?？]$|시오\.?$|것은\?$/.test(s)) return s;
  if (s && hasHangul(s)) { issues.push(`발문 종결 이상: ${s.slice(0, 60)}`); return s; }
  return CANON[typeGroup] || "";
}

/** 원형 슬라이스에서 {direction, body(lines), choices} 를 뽑는다 */
function parseSlice(slice, typeGroup, issues, { expectChoices = true } = {}) {
  if (!slice) { issues.push("원형 슬라이스 없음"); return { direction: CANON[typeGroup] || "", body: [], choices: null }; }
  const { direction: stem, body } = splitStem(slice.cleaned.lines);
  const direction = resolveDirection(stem, typeGroup, issues);
  if (!expectChoices) return { direction, body, choices: null };
  const { choices, bodyLines } = splitChoices(body);
  return { direction, body: bodyLines, choices };
}

function bodyText(lines) {
  // 줄 결합(하이픈 결합은 추출기가 처리) + 공백 접기
  return tidy(lines.join(" "));
}

function checkChoices(choices, fallback, issues) {
  let ch = choices;
  if (!ch || ch.length !== 5) {
    const fb = (fallback || []).map((c) => tidy(String(c).split("\n")[0]));
    if (fb.length === 5 && fb.every(Boolean)) { ch = fb; issues.push("선지: problems.json 폴백 사용"); }
    else { issues.push(`선지 5개 미확보(${ch ? ch.length : 0})`); return null; }
  }
  if (ch.some((c) => !c || c.length > 260)) issues.push("선지 길이 이상");
  return ch;
}

function oracle(rawPassage, corpusText, issues, label = "본문", min = ORACLE_MIN) {
  const sim = similarity(rawPassage, corpusText);
  if (sim < min) issues.push(`${label} 오라클 불일치 sim=${sim.toFixed(3)}`);
  return sim;
}

/** 정답 번호 — 드라이버가 형(型) 일치 공식 정답표로 확정한 ctx.answer 를 우선, 없으면 코퍼스 answer */
function answerNum(p, qNum, ctx) {
  if (ctx && Number.isInteger(ctx.answer)) return ctx.answer;
  const a = p.answer;
  if (typeof a === "number") return a;
  if (a && typeof a === "object") return Number(a[String(qNum)]);
  return NaN;
}


/**
 * 코퍼스 꼬리 절단 감지(기지의 코퍼스 결손 3.99% — RC-1 각주 컷): 원형 본문이 코퍼스보다 6단어 이상 길고
 * 코퍼스가 원형의 접두와 같으면 절단으로 본다. 그러면 출력 본문의 정본을 원형(PDF)으로 바꾼다.
 */
function detectTruncation(rawPassage, corpusText, minHeadSim = 0.95) {
  const cleaned = tidy(String(rawPassage || "").replace(/[\p{Co}䂞↓⇓]/gu, " "));
  const rawT = tokenIndex(cleaned), corT = tokenIndex(corpusText);
  if (corT.length < 40 || rawT.length < corT.length + 6) return null;
  // 절단은 꼬리 한두 문장 결손이다 — 원형이 코퍼스의 1.4배+20단어를 넘으면 다른 지문/요약문이 섞인 것(실측: 내용일치 446w vs ~200w)
  if (rawT.length > corT.length * 1.4 + 20) return null;
  // 대체본에 한글·요약 빈칸 라벨이 남아 있으면 발문/요약문 오염 → 대체 거부
  if (hasHangul(cleaned) || /\(A\)|\(B\)/.test(cleaned)) return null;
  // 대체본은 문장 끝으로 마감해야 한다 — 조각("…want to")은 스트림 순서가 꼬인 것(요약 박스가 본문 꼬리 앞에 끼어듦)
  if (!/[.!?]["”’)\]]*$/.test(cleaned)) return null;
  const head = cleaned.slice(0, rawT[Math.min(corT.length, rawT.length) - 1].end);
  if (similarity(head, corpusText) < minHeadSim) return null;
  return { extraWords: rawT.length - corT.length, override: cleaned };
}

/**
 * 요약문 지문 박스(원형에 그려진 사각형, 60단어 이상, 코퍼스와 머리 일치) — 각주 줄을 뗀 본문. 박스는 지문 정본이라
 * 절단 판정 머리 유사도를 0.93 까지 허용한다(2015 학평 하이픈 차이 실측 0.939). 없으면 null. 반환 {b:{text}}.
 */
function summaryPassageBox(boxes, corpusText) {
  // 박스 텍스트는 줄이 합쳐져 각주가 본문 꼬리에 인라인으로 붙는다("…freely.” * tolerance: 관용 ** supervised: 감독받는")
  // → 각주 머리(`* word: 한글`)부터 줄 끝까지 떼고, 각주만 있는 줄은 버린다
  const stripFoot = (l) => l.replace(/\s*[*＊]{1,3}\s*[A-Za-z][^:\n]{0,40}:\s*[가-힣][\s\S]*$/, "");
  return (boxes || [])
    .map((b) => ({ ...b, text: String(b.text || "").split("\n").map(stripFoot).filter((l) => l.trim() && !/^\s*[*＊]\s*[A-Za-z]/.test(l)).join("\n") }))
    .filter((b) => wordCount(b.text) >= 60 && !/\(A\)[\s\S]*\(B\)/.test(b.text))
    .map((b) => ({ b, sim: similarity(tidy(b.text).split(/\s+/).slice(0, 40).join(" "), corpusText.split(/\s+/).slice(0, 40).join(" ")) }))
    .filter((x) => x.sim >= 0.9)
    .sort((x, y) => wordCount(y.b.text) - wordCount(x.b.text))[0] || null;
}

// ── 1. 출처 지문 유형(주장/요지/주제/제목/내용일치) ─────────────────────────────
export function handleSource(ctx) {
  const { p, q, slice, typeGroup, qNum } = ctx;
  const issues = [];
  const { direction, body, choices } = parseSlice(slice, typeGroup, issues);
  const raw = bodyText(body);
  const trunc = detectTruncation(raw, p.text);
  if (trunc) issues.push(`NOTE:corpus-truncated(+${trunc.extraWords}w) — 원형 본문으로 대체`);
  else oracle(raw, p.text, issues, "본문", ORACLE_SOFT);
  const ch = checkChoices(choices, q?.choices, issues);
  const ans = answerNum(p, qNum, ctx);
  const subType = SUBTYPE_OF[typeGroup];
  const sd = { _typeId: subType, direction, options: ch ? mcOptions(ch) : [], correctAnswer: mcAnswer(ans) };
  if (subType === "CONTENT_MATCH") sd.matchType = /않는|일치하지/.test(direction) ? "불일치" : "일치";
  return {
    subType, direction, questionText: direction, options: sd.options, correctAnswer: sd.correctAnswer,
    structuredData: sd, passageContent: trunc ? trunc.override : p.text, passageContentOverride: trunc ? trunc.override : null, issues,
  };
}

// ── 2. 빈칸추론 ───────────────────────────────────────────────────────────────
export function handleBlank(ctx) {
  const { p, q, slice, typeGroup, qNum } = ctx;
  const issues = [];
  const { direction, body, choices } = parseSlice(slice, typeGroup, issues);
  const ch = checkChoices(choices, q?.choices, issues);
  const ans = answerNum(p, qNum, ctx);
  if (!ch) return fail("BLANK_INFERENCE", direction, issues);
  const fill = ch[ans - 1];
  // 이중 빈칸((A),(B) 짝 선지) 은 1차 미지원
  if (/[…·]{2,}|\s-\s/.test(fill) && /\(A\)/.test(bodyText(body))) { issues.push("UNSUPPORTED:double-blank"); return fail("BLANK_INFERENCE", direction, issues); }
  // 코퍼스 꼬리 절단이면 코퍼스 기반 치환을 쓰지 않는다 → 아래 PDF 빈칸선 경로로 보낸다
  const truncB = detectTruncation(bodyText(body).replace(/_{3,}/g, " "), p.text);
  if (truncB) issues.push(`NOTE:corpus-truncated(+${truncB.extraWords}w) — 원형 본문으로 대체`);
  let hit = truncB ? null : findInTextCI(p.text, fill);
  if (!hit && !truncB) {
    // 정답구 끝 구두점/따옴표 차이 완화
    const alt = fill.replace(/[.?!]$/, "");
    hit = alt !== fill ? findInTextCI(p.text, alt) : null;
  }
  if (!hit) {
    // 코퍼스가 다른 형(型)의 정답으로 복원된 경우(2016~2021 수능 짝수형 실측) — PDF 원형의 빈칸 자리(좌우 이웃 단어)로 직접 조판한다
    const b = (slice?.blanks || []).find((x) => (x.after || x.afterPrev) && !hasHangul(x.after || x.afterPrev || ""));
    const rawP = bodyText(body);
    if (b) {
      const after = tidy(b.after || b.afterPrev);
      const before = b.before ? tidy(b.before) : null;
      const ai = findInText(rawP, after);
      if (ai) {
        const pos = ai.end;
        const rest = rawP.slice(pos);
        const bi = before ? findInText(rest, before) : null;
        const gapEnd = bi ? pos + bi.start : pos;
        const passageWithBlank = tidy(rawP.slice(0, pos) + " " + BLANK + " " + rawP.slice(gapEnd)).replace(/\s+([.,;:!?])/g, "$1").replace(/_{6,}/g, BLANK);
        if (!truncB) issues.push("NOTE:blank-from-pdf-gap(코퍼스 복원과 정답 불일치)");
        const fn = footnoteTail(slice?.cleaned.footnotes);
        const pw = fn ? `${passageWithBlank}\n\n${fn}` : passageWithBlank;
        const sd = { _typeId: "BLANK_INFERENCE", direction, originalExpression: fill, passageWithBlank: pw, options: mcOptions(ch), correctAnswer: mcAnswer(ans), blankAnswerMode: "SOURCE_EXACT" };
        return { subType: "BLANK_INFERENCE", direction, questionText: joinParts(direction, pw), options: sd.options, correctAnswer: sd.correctAnswer, structuredData: sd, passageContent: p.text, issues };
      }
    }
    // 구형 PDF: 빈칸이 밑줄 문자열("________")로 인쇄됨 — 그대로 BLANK 로 치환
    if (/_{4,}/.test(rawP)) {
      const passageWithBlank = tidy(rawP.replace(/\s*_{4,}\s*/g, ` ${BLANK} `)).replace(/\s+([.,;:!?])/g, "$1");
      if ((passageWithBlank.match(/_{3,}/g) || []).length === 1) {
        const fn = footnoteTail(slice?.cleaned.footnotes);
        const pw = fn ? `${passageWithBlank}\n\n${fn}` : passageWithBlank;
        const sd = { _typeId: "BLANK_INFERENCE", direction, originalExpression: fill, passageWithBlank: pw, options: mcOptions(ch), correctAnswer: mcAnswer(ans), blankAnswerMode: "SOURCE_EXACT" };
        issues.push("NOTE:blank-from-underscore");
        return { subType: "BLANK_INFERENCE", direction, questionText: joinParts(direction, pw), options: sd.options, correctAnswer: sd.correctAnswer, structuredData: sd, passageContent: p.text, issues };
      }
    }
    issues.push(`빈칸 정답구 미발견: ${fill.slice(0, 50)}`); return fail("BLANK_INFERENCE", direction, issues);
  }
  if (hit.count > 1) {
    // 원형 blanks 의 좌측 이웃 단어로 좁힌다
    const b = (slice?.blanks || []).find((x) => x.after || x.afterPrev);
    const after = b ? norm(b.after || b.afterPrev) : null;
    let chosen = null;
    if (after) {
      let from = 0, cand;
      while ((cand = findInTextCI(p.text.slice(from), fill))) {
        const abs = { start: cand.start + from, end: cand.end + from };
        const before = norm(p.text.slice(Math.max(0, abs.start - 80), abs.start));
        if (before.endsWith(after) || before.endsWith(after.replace(/[.,;:]$/, ""))) { chosen = abs; break; }
        from = abs.end;
      }
    }
    if (!chosen) { issues.push(`빈칸 정답구 ${hit.count}회 출현 — 위치 모호`); return fail("BLANK_INFERENCE", direction, issues); }
    hit = chosen;
  }
  const passageWithBlank = tidy(p.text.slice(0, hit.start) + " " + BLANK + " " + p.text.slice(hit.end)).replace(/\s+([.,;:!?])/g, "$1");
  // 오라클: 원형 본문(빈칸 자리는 공백) ≈ 빈칸 지문(빈칸 제거)
  oracle(bodyText(body), passageWithBlank.replace(BLANK, " "), issues, "본문", ORACLE_SOFT);
  const fn = footnoteTail(slice?.cleaned.footnotes);
  const pw = fn ? `${passageWithBlank}\n\n${fn}` : passageWithBlank;
  const sd = { _typeId: "BLANK_INFERENCE", direction, originalExpression: fill, passageWithBlank: pw, options: mcOptions(ch), correctAnswer: mcAnswer(ans), blankAnswerMode: "SOURCE_EXACT" };
  return { subType: "BLANK_INFERENCE", direction, questionText: joinParts(direction, pw), options: sd.options, correctAnswer: sd.correctAnswer, structuredData: sd, passageContent: p.text, issues };
}

// ── 3. 함축의미 ───────────────────────────────────────────────────────────────
export function handleImplied(ctx) {
  const { p, q, slice, typeGroup, qNum } = ctx;
  const issues = [];
  const { direction, body, choices } = parseSlice(slice, typeGroup, issues);
  const ch = checkChoices(choices, q?.choices, issues);
  const ans = answerNum(p, qNum, ctx);
  if (!ch) return fail("IMPLIED_MEANING", direction, issues);
  let phrase = null;
  const m = direction.match(/밑줄 친 (.+?)\s*[이가]\s*(?:다음 글에서\s*)?(?:의미|함축)/);
  if (m) phrase = tidy(m[1]);
  // 원형 밑줄(발문 밑줄 제외 — 한글) 로 보정
  const ul = (slice?.underlines || []).filter((u) => !hasHangul(u.words) && u.words.length > 3 && !/^[①-⑧]/.test(u.words));
  if (!phrase && ul.length) phrase = tidy(ul.sort((a, b) => b.words.length - a.words.length)[0].words);
  if (!phrase) { issues.push("밑줄구 미상"); return fail("IMPLIED_MEANING", direction, issues); }
  const rawI = bodyText(body);
  const truncI = detectTruncation(rawI, p.text);
  const baseI = truncI ? rawI : p.text;
  if (truncI) issues.push(`NOTE:corpus-truncated(+${truncI.extraWords}w) — 원형 본문으로 대체`);
  let hit = findInTextCI(baseI, phrase);
  if (!hit && ul.length) { const alt = tidy(ul.sort((a, b) => b.words.length - a.words.length)[0].words); hit = findInTextCI(baseI, alt); if (hit) phrase = alt; }
  if (!hit) { issues.push(`밑줄구 본문 미발견: ${phrase}`); return fail("IMPLIED_MEANING", direction, issues); }
  if (hit.count > 1) issues.push(`NOTE:밑줄구 ${hit.count}회 출현(첫 번째 채택)`);
  const found = baseI.slice(hit.start, hit.end);
  const passageWithUnderline = baseI.slice(0, hit.start) + `__${found}__` + baseI.slice(hit.end);
  if (!truncI) oracle(rawI, p.text, issues, "본문", ORACLE_SOFT);
  const fn = footnoteTail(slice?.cleaned.footnotes);
  const pw = fn ? `${passageWithUnderline}\n\n${fn}` : passageWithUnderline;
  const sd = { _typeId: "IMPLIED_MEANING", direction, underlinedExpression: found, passageWithUnderline: pw, options: mcOptions(ch), correctAnswer: mcAnswer(ans) };
  return { subType: "IMPLIED_MEANING", direction, questionText: joinParts(direction, pw), options: sd.options, correctAnswer: sd.correctAnswer, structuredData: sd, passageContent: p.text, issues };
}

// ── 4. 문장삽입 ───────────────────────────────────────────────────────────────
const INSERT_MARK_RE = /\(\s*([①-⑧])\s*\)/g;

export function handleInsert(ctx) {
  const { p, recon, slice, typeGroup, qNum } = ctx;
  const issues = [];
  const { direction, body } = parseSlice(slice, typeGroup, issues, { expectChoices: false });
  const ans = answerNum(p, qNum, ctx);
  let raw = bodyText(body);
  // 주어진 문장 = 본문 앞머리 1~4문장 접두 중 하나. 후보 채점: 박스 텍스트 유사도 ≥0.85 → recon.insertedSentence 유사도 → (아래 코퍼스 오라클)
  let given = "";
  {
    const boxTxt = slice?.boxes?.length ? tidy(slice.boxes.map((b) => b.text).join(" ")) : "";
    const reconTxt = recon?.insertedSentence ? tidy(recon.insertedSentence) : "";
    const sents = splitSentences(raw.replace(INSERT_MARK_RE, " "));
    let best = null;
    for (let n = 1; n <= Math.min(4, sents.length - 1); n++) {
      const g = tidy(sents.slice(0, n).join(" "));
      const sc = Math.max(boxTxt ? similarity(g, boxTxt) : 0, reconTxt ? similarity(g, reconTxt) : 0);
      if (sc >= 0.85 && (!best || sc > best.sc)) best = { g, sc };
    }
    if (best) given = best.g;
    else if (reconTxt && findInText(raw, reconTxt)) given = reconTxt;
  }
  // 원형 본문에서 주어진 문장 제거(박스 텍스트가 스트림에도 포함돼 있다)
  const stripGiven = (txt, g) => {
    const h = findInText(txt, g);
    return h ? tidy(txt.slice(0, h.start) + " " + txt.slice(h.end)) : null;
  };
  // 본문 = 주어진 문장(앞머리 n 문장)을 뺀 나머지 — 텍스트 검색 제거가 아니라 **문장 인덱스**로 자른다
  // (검색 제거는 하이픈/인용부호 차이로 실패해 주어진 문장이 본문 머리에 중복 남던 결함 — 검증 함대 실측)
  let bodyRaw = raw;
  if (given) {
    const sentsM = splitSentences(raw); // 마커 보존 분할 — 주어진 문장에는 마커가 없다
    const nGiven = Math.max(1, splitSentences(given).length);
    const head = tidy(sentsM.slice(0, nGiven).join(" ").replace(INSERT_MARK_RE, " "));
    if (similarity(head, given) >= 0.9) bodyRaw = tidy(sentsM.slice(nGiven).join(" "));
    else {
      const aligned = alignToCorpus(given, raw);
      const st = stripGiven(raw, given) ?? (aligned ? stripGiven(raw, aligned) : null);
      if (st) bodyRaw = st; else issues.push("주어진 문장이 원형 본문에서 미발견(박스 추출 불일치)");
    }
  }
  // 구형 "( )\n①" — 표식 분리형: 단독 마커 토큰을 걷고 "( )" 를 순서대로 채운다
  let markers = [...bodyRaw.matchAll(INSERT_MARK_RE)].map((m) => m[1]);
  if (markers.length < 4) {
    const bare = [...bodyRaw.matchAll(/(?:^|\s)([①-⑧])(?=\s|$)/g)].map((m) => m[1]);
    const gaps = (bodyRaw.match(/\(\s*\)/g) || []).length;
    if (gaps >= 4 && bare.length >= gaps) {
      let i = 0;
      bodyRaw = bodyRaw.replace(/(?:^|\s)[①-⑧](?=\s|$)/g, " ");
      bodyRaw = bodyRaw.replace(/\(\s*\)/g, () => `(${bare[i++]})`);
      markers = [...bodyRaw.matchAll(INSERT_MARK_RE)].map((m) => m[1]);
    }
  }
  if (!given) {
    // 본문 앞머리 1~3문장을 후보로: 후보 g 제거 후 마커 제거본 ≈ 코퍼스(g 삽입본)
    const sents = splitSentences(bodyRaw.replace(INSERT_MARK_RE, " "));
    for (let n = 1; n <= 3 && !given; n++) {
      const g = tidy(sents.slice(0, n).join(" "));
      const rest = tidy(sents.slice(n).join(" "));
      const h = findInText(p.text, g);
      if (!h) continue;
      const corpusMinus = tidy(p.text.slice(0, h.start) + " " + p.text.slice(h.end));
      if (similarity(corpusMinus, rest) >= ORACLE_MIN) { given = g; bodyRaw = stripGiven(bodyRaw, g) ?? bodyRaw; }
    }
    if (!given) { issues.push("주어진 문장 미상"); return fail("SENTENCE_INSERT", direction, issues); }
    markers = [...bodyRaw.matchAll(INSERT_MARK_RE)].map((m) => m[1]);
  }
  if (markers.length < 5 || markers.length > 8 || markers.join("") !== CIRC.slice(0, markers.length).join("")) {
    issues.push(`삽입 마커 이상: ${markers.join("")}`); return fail("SENTENCE_INSERT", direction, issues);
  }
  const passageWithMarkers = tidy(bodyRaw.replace(INSERT_MARK_RE, " $1 ")).replace(/\s+([.,;:!?])/g, "$1");
  // 오라클: 정답 자리에 주어진 문장을 넣고 마커 제거 ≈ 코퍼스
  const restored = tidy(passageWithMarkers.replace(CIRC[ans - 1], ` ${given} `).replace(/[①-⑧]/g, " "));
  oracle(restored, p.text, issues, "삽입 복원");
  if (findInText(passageWithMarkers, given)) issues.push("주어진 문장이 본문에 잔존");
  const fn = footnoteTail(slice?.cleaned.footnotes);
  const pw = fn ? `${passageWithMarkers}\n\n${fn}` : passageWithMarkers;
  const opts = insertOptions(markers.length);
  const sd = { _typeId: "SENTENCE_INSERT", direction, givenSentence: given, passageWithMarkers: pw, options: opts, correctAnswer: insertAnswer(ans) };
  return { subType: "SENTENCE_INSERT", direction, questionText: joinParts(direction, `[주어진 문장] ${given}`, pw), options: opts, correctAnswer: sd.correctAnswer, structuredData: sd, passageContent: p.text, issues };
}


/** 인쇄 순열 파서 — "① (A) - (C) - (B) ② …" 또는 격자 "(A) (C) (B) (B) (A) (C) / ① － － ② － －" 를 5순열 ["ACB",…] 로 */
function parseOrderPerms(text) {
  if (!text) return null;
  const t = String(text).replace(/\n/g, " ");
  const out = [];
  const re = /([①-⑤])\s*\(?([A-C])\)?\s*[-－–]?\s*\(?([A-C])\)?\s*[-－–]?\s*\(?([A-C])\)?/g;
  let m;
  while ((m = re.exec(t))) { const k = CIRC.indexOf(m[1]); if (k >= 0 && !out[k]) out[k] = m[2] + m[3] + m[4]; }
  // ⚠ 희소 배열의 every 는 빈 슬롯을 건너뛴다(2027 6월 37 실측: [ACB, <empty>, BCA, …] 가 통과해 null 선지가 새어 나갔다) — 채워서 검사
  const dense = Array.from({ length: 5 }, (_, i) => out[i]);
  if (dense.every((x) => typeof x === "string") && new Set(dense).size === 5 && dense.every((x) => new Set(x).size === 3)) return dense;
  const labels = [...t.matchAll(/\(([A-C])\)/g)].map((x) => x[1]);
  const markers = [...t.matchAll(/[①-⑤]/g)].map((x) => x[0]);
  if (labels.length === 15 && markers.length === 5 && markers.join("") === "①②③④⑤") {
    const perms = [];
    for (let i = 0; i < 5; i++) perms.push(labels.slice(i * 3, i * 3 + 3).join(""));
    if (new Set(perms).size === 5 && perms.every((x) => new Set(x).size === 3)) return perms;
  }
  return null;
}

// ── 5. 글의순서 ───────────────────────────────────────────────────────────────
export function handleOrder(ctx) {
  const { p, slice, typeGroup, qNum } = ctx;
  const issues = [];
  const { direction, body } = parseSlice(slice, typeGroup, issues, { expectChoices: false });
  const ans = answerNum(p, qNum, ctx);
  // 라벨 줄 분할: "(A) ..." 줄 머리 또는 단독 "(A)"
  const segs = { A: [], B: [], C: [] };
  let cur = null;
  const givenLines = [];
  for (const ln of body) {
    // 선지 격자 시작: "① (A) - (C) - (B)" / "(B) (A) (C)"(격자 머리) / "① － －" — 여기서 단락 수집 종료
    if (/^\s*[①-⑤]/.test(ln) || /^\s*\(?[A-C]\)?\s*[-－–]\s*\(?[A-C]\)?/.test(ln) || /^\s*(\([A-C]\)\s*){2,}$/.test(ln)) break;
    const m = ln.match(/^\s*\(([A-C])\)\s*(.*)$/);
    if (m) { cur = m[1]; if (m[2]) segs[cur].push(m[2]); continue; }
    if (cur) segs[cur].push(ln); else givenLines.push(ln);
  }
  const A = tidy(segs.A.join(" ")), B = tidy(segs.B.join(" ")), C = tidy(segs.C.join(" "));
  // 주어진 글: 스트림 줄(발문 뒤~(A) 앞)이 정본 — 학평 PDF 는 박스가 줄 단위 조각으로 잡혀 문장이 빠진다(2025 9월 고1 37 실측)
  let given = tidy(givenLines.join(" "));
  if (!given && slice?.boxes?.length) given = tidy(slice.boxes.map((b) => b.text).join(" "));
  if (!A || !B || !C) { issues.push("순서 단락 (A)(B)(C) 미확보"); return fail("SENTENCE_ORDER", direction, issues); }
  if (!given) { issues.push("주어진 글 미확보"); return fail("SENTENCE_ORDER", direction, issues); }
  // 인쇄 선지 순열(구형은 표준 5순열과 다르다 — 2011 9월 실측 ①(A)-(B)-(C) …). wtext → problems.json → 표준(modern 한정)
  const printedPerms = parseOrderPerms(slice?.wtext) || parseOrderPerms((ctx.q?.choices || []).join(" ")) || null;
  let perms = printedPerms;
  if (!perms) {
    if (ctx.p.era === "modern") perms = ORDER_PERMS.map((t) => t.replace(/[()\-]/g, ""));
    else { issues.push("순서 선지 순열 미확인(구형)"); return fail("SENTENCE_ORDER", direction, issues); }
  }
  const seq = perms[ans - 1];
  if (!seq) { issues.push(`순서 정답 ${ans} 미상`); return fail("SENTENCE_ORDER", direction, issues); }
  const restored = tidy([given, ...seq.split("").map((k) => ({ A, B, C })[k])].join(" "));
  oracle(restored, p.text, issues, "순서 복원");
  const fn = footnoteTail(slice?.cleaned.footnotes);
  // paragraphs[].text 는 순수 단락(스펙 §3.1) — 각주는 questionText 꼬리에만 빈 줄로 붙인다(렌더러가 별도 줄 세그먼트로 뗀다)
  const paragraphs = [{ label: "(A)", text: A }, { label: "(B)", text: B }, { label: "(C)", text: C }];
  const opts = perms.map((pm, i) => ({ label: String(i + 1), text: pm.split("").map((k) => `(${k})`).join("-") }));
  const sd = { _typeId: "SENTENCE_ORDER", direction, givenSentence: given, paragraphs, options: opts, correctAnswer: mcAnswer(ans) };
  const qt = joinParts(direction, `[주어진 문장] ${given}`, paragraphs.map((x) => `${x.label} ${x.text}`).join("\n"), fn || "");
  return { subType: "SENTENCE_ORDER", direction, questionText: qt, options: opts, correctAnswer: sd.correctAnswer, structuredData: sd, passageContent: p.text, issues };
}

// ── 6. 무관한 문장 ─────────────────────────────────────────────────────────────
export function handleIrrelevant(ctx) {
  const { p, recon, slice, typeGroup, qNum } = ctx;
  const issues = [];
  const { direction, body } = parseSlice(slice, typeGroup, issues, { expectChoices: false });
  const ans = answerNum(p, qNum, ctx);
  const raw = bodyText(body);
  const parts = raw.split(/\s*([①-⑤])\s*/);
  // parts: [intro, ①, s1, ②, s2, ...]
  if (parts.length < 11) { issues.push(`무관 마커 부족(${(parts.length - 1) / 2})`); return fail("IRRELEVANT", direction, issues); }
  const intro = tidy(parts[0]);
  const sentences = [];
  for (let i = 1; i < parts.length; i += 2) {
    if (parts[i] !== CIRC[(i - 1) / 2]) { issues.push(`무관 마커 순서 이상 ${parts[i]}`); return fail("IRRELEVANT", direction, issues); }
    sentences.push(tidy(parts[i + 1] || ""));
  }
  // ⑤ 뒤에 무표시 꼬리 문장이 따라올 수 있다 — 코퍼스 대조로 분리
  let tail = "";
  const kept = () => tidy([intro, ...sentences.filter((_, i) => i !== ans - 1), tail].join(" "));
  let sim = similarity(kept(), p.text);
  if (sim < ORACLE_MIN) {
    const s5 = splitSentences(sentences[4]);
    for (let k = 1; k < s5.length; k++) {
      const cand5 = tidy(s5.slice(0, k).join(" ")), candTail = tidy(s5.slice(k).join(" "));
      const trial = tidy([intro, ...sentences.slice(0, 4), cand5, tail].filter((_, i) => i !== ans - 1 + 1 || ans !== 5).join(" "));
      void trial;
      const save = sentences[4];
      sentences[4] = cand5; tail = candTail;
      const s2 = similarity(kept(), p.text);
      if (s2 >= ORACLE_MIN) { sim = s2; break; }
      sentences[4] = save; tail = "";
    }
  }
  if (sim < ORACLE_MIN) issues.push(`무관 복원 오라클 불일치 sim=${sim.toFixed(3)}`);
  if (recon?.removedSentence && similarity(recon.removedSentence, sentences[ans - 1]) < 0.9) issues.push("정답 문장이 recon.removedSentence 와 불일치");
  const passageWithNumbers = tidy([intro, ...sentences.map((s, i) => `${CIRC[i]} __${s}__`), tail].join(" "));
  const fn = footnoteTail(slice?.cleaned.footnotes);
  const pw = fn ? `${passageWithNumbers}\n\n${fn}` : passageWithNumbers;
  const opts = irrelevantOptions();
  const sd = { _typeId: "IRRELEVANT", direction, passageWithNumbers: pw, sentences, irrelevantIndex: ans - 1, options: opts, correctAnswer: irrelevantAnswer(ans) };
  return { subType: "IRRELEVANT", direction, questionText: joinParts(direction, pw), options: opts, correctAnswer: sd.correctAnswer, structuredData: sd, passageContent: p.text, issues };
}

// ── 7. 요약문 ──────────────────────────────────────────────────────────────────

/** wtext 에서 요약 문장 블록 추출 — 지문 끝(코퍼스 마지막 3토큰) 다음 줄부터 선지(①) 전까지, (A)(B) 헤더·각주·한글 줄 제외 */
function summaryFromWtext(wtext, corpusText) {
  if (!wtext) return null;
  const wl = String(wtext).split("\n");
  const tail = tokenIndex(corpusText).slice(-3).map((t) => t.n).join("");
  const normLine = (l) => tokenIndex(l).map((t) => t.n).join("");
  let end = -1;
  for (let i = 0; i < wl.length; i++) if (tail && normLine(wl[i]).includes(tail)) end = i;
  const isChoice = (l) => /[①-⑤]/.test(l);
  const isHeader = (l) => /^\s*(\(A\)\s*\(B\)\s*)+$/.test(l.trim());
  const skip = (l) => hasHangul(l) || /^\s*[*＊]/.test(l) || /^\s*[󰀻↓⇓]\s*$/.test(l) || isHeader(l) || /^\s*\d{1,2}\s*$/.test(l) || !/[A-Za-z]/.test(l);
  const iA = wl.findIndex((l, i) => (end < 0 || i > end) && /\(A\)/.test(l) && !isChoice(l) && !isHeader(l));
  if (iA < 0) return null;
  let start = end >= 0 ? end + 1 : iA;
  if (end < 0) { while (start - 1 >= 0 && start > iA - 3 && !skip(wl[start - 1]) && !isChoice(wl[start - 1])) start--; }
  const acc = [];
  for (let j = start; j < wl.length && j < start + 8; j++) {
    const l = wl[j];
    if (isChoice(l)) break;
    if (skip(l)) continue;
    acc.push(l.replace(/^[󰀻↓⇓]\s*/, ""));
    if (j >= iA && /\(B\)/.test(acc.join(" ")) && /[.!?]["”’]?\s*$/.test(l)) break;
  }
  const txt = tidy(acc.join(" "));
  if (!/\(A\)/.test(txt) || !/\(B\)/.test(txt)) return null;
  return txt;
}

/** 요약 선지 격자 파서 — 단어 띠 텍스트(wtext)에서 "① a …… b ② c …… d" 를 5쌍으로. 세로 1열·가로 2열 격자 모두 대응. */
function parseSummaryPairs(wtext) {
  const t = String(wtext || "").replace(/\n/g, " ");
  // 선지 격자 시작: 헤더 "(A) (B)" 이후 첫 ① — 헤더가 없으면 마지막 ①②③④⑤ 창
  const pairs = [];
  const re = /([①-⑤])\s*([^①-⑤]+?)\s*(?:…+|‥+|⋯+|\.{3,}|·{3,}|-{2,}|—)\s*([^①-⑤]+?)(?=\s*[①-⑤]|\s*$)/g;
  let m;
  while ((m = re.exec(t))) {
    const k = CIRC.indexOf(m[1]);
    const a = tidy(m[2]).replace(/^\(A\)\s*\(B\)\s*/, ""), b = tidy(m[3]).replace(/\s*\(A\)\s*\(B\).*$/, "");
    if (k >= 0 && a && b && !hasHangul(a) && !hasHangul(b) && a.length < 60 && b.length < 60) pairs[k] = [a, b];
  }
  return pairs.length === 5 && pairs.every(Boolean) ? pairs : null;
}

export function handleSummary(ctx) {
  const { p, q, slice, typeGroup, qNum } = ctx;
  const issues = [];
  const { direction, body, choices } = parseSlice(slice, typeGroup, issues);
  const ans = answerNum(p, qNum, ctx);
  // 실패(pending→함대 수리)로 빠져도 지문 절단 대체본은 초안에 실어 둔다 — 수리본은 구조만 채우고 지문 대체본은 초안 값을 잇는다
  const earlyBoxPick = summaryPassageBox(slice?.boxes || [], p.text);
  const earlyTrunc = earlyBoxPick ? detectTruncation(tidy(earlyBoxPick.b.text), p.text, 0.93) : null;
  const failS = (...a) => ({ ...fail(...a), passageContentOverride: earlyTrunc ? earlyTrunc.override : null });
  // 선지: 단어 띠 격자 파서 우선 → 줄 기반 선지 → problems.json 폴백
  let pairs = parseSummaryPairs(slice?.wtext);
  if (!pairs) {
    const ch = choices && choices.length === 5 && choices.every((c) => /…|‥|⋯|\.{2,}|·{2,}|-{2,}|—|―/.test(c)) ? choices : (q?.choices || []).map((c) => String(c).trim());
    const pp = ch.map((c) => c.split(/\s*(?:…+|‥+|⋯+|\.{2,}|·{2,}|-{2,}|—|―|\n)\s*/).map(tidy).filter(Boolean));
    if (pp.length === 5 && pp.every((pr) => pr.length === 2)) { pairs = pp; issues.push("NOTE:요약 선지: 줄 기반/폴백 파싱"); }
  }
  if (!pairs) { issues.push("요약 선지 짝 분해 실패"); return failS("SUMMARY_COMPLETE_MC", direction, issues); }
  // 요약 문장 = (A)·(B) 를 품은 박스(단어 띠 우선) 또는 본문 꼬리
  const boxes = slice?.boxes || [];
  // 요약 문장 = 단어 띠 줄 중 「지문 끝 다음 줄 ~ 선지 시작 전」 블록(각주·헤더·한글 줄 제외). 박스는 학평에서 줄 단위로
  // 조각나 첫 줄/끝 단어를 떨어뜨리므로(검증 함대 실측 6건) 보조로만 쓴다.
  let summary = summaryFromWtext(slice?.wtext, p.text);
  let sumBox = null;
  if (!summary) {
    sumBox = boxes.find((b) => /\(A\)/.test(b.text) && /\(B\)/.test(b.text)) || null;
    if (sumBox) { summary = tidy(sumBox.text); issues.push("NOTE:summary-from-box"); }
  }
  if (!summary) { issues.push("요약 문장 미확보"); return failS("SUMMARY_COMPLETE_MC", direction, issues); }
  summary = summary.replace(/^[󰀻↓⇓]\s*/, "").replace(/\s*\(A\)\s*\(B\)\s*(\(A\)\s*\(B\))?\s*$/, "").trim();
  // (A)/(B) 자리 검증 — 단어 띠(wtext) 조립은 줄 경계에서 라벨이 한 단어 앞/뒤로 밀린다(전수 렌더 검수 실측 9건:
  // "older (A) adults become … and their goals" ← 인쇄는 "older adults … and (A) their goals"). 요약 박스(원형 사각형)가 있고
  // 라벨을 뺀 단어열이 같으면 박스 자구(인쇄 배치)를 정본으로 쓴다.
  {
    const wordsOf = (t) => tidy(String(t).replace(/\(A\)|\(B\)/g, " ")).split(" ").filter(Boolean).join(" ");
    const abBox = boxes.find((b) => /\(A\)/.test(b.text) && /\(B\)/.test(b.text) && wordCount(b.text) <= 60);
    if (abBox) {
      const bt = tidy(String(abBox.text).replace(/\n/g, " ")).replace(/^[󰀻↓⇓]\s*/, "");
      if (bt !== summary && wordsOf(bt) === wordsOf(summary)) { summary = bt; issues.push("NOTE:summary-label-from-box"); }
    }
  }
  if (!/\(A\)/.test(summary) || !/\(B\)/.test(summary)) issues.push("요약 문장에 (A)/(B) 부재");
  // 본문 오라클: 지문(큰 박스 또는 본문에서 요약문 제거)
  // 지문 = 요약문 앞까지. replace(summary) 는 줄바꿈/공백 차이로 자주 빗나가 요약문이 본문에 남았다(대체본 오염 19건 실측)
  // → 정규화 탐색(findInText)으로 요약문 머리 5단어 자리를 찾아 그 앞에서 자른다. 한글 줄(발문 흘러넘침)은 먼저 버린다.
  // 지문 본체: 원형에 지문 박스(60단어 이상, 코퍼스와 머리 일치)가 있으면 그 박스가 정본이다 — 스트림 줄 조립은 요약 박스가
  // 지문 앞/중간에 끼어들어 머리 유사도가 깨지고, 그러면 절단 감지(detectTruncation)가 무력해진다(요약 절단 미복원 다수 실측).
  const passBox = earlyBoxPick; // summaryPassageBox — 각주 줄·인라인 각주 꼬리를 뗀 지문 박스(없으면 null)
  let passRaw = passBox ? tidy(passBox.b.text) : bodyText(body.filter((l) => !hasHangul(l)));
  // 요약문 = (A)/(B) 를 품은 첫 문장 — 그 문장부터 뒤는 지문이 아니다(머리 5단어 앵커는 "a(n) (A)" 류에서 빗나간다)
  // 요약 박스는 스트림에서 지문 앞·중간·뒤 어디든 올 수 있다(앞에서 자르면 요약문 117건이 백지가 됐다) → 문장 단위로 걸러낸다
  // 화살표 글리프(󰀻)가 마침표와 대문자 사이에 끼면 문장 분리기가 지문 끝 문장과 요약문을 한 문장으로 붙인다 → 글리프를 먼저 지운다
  const sents = splitSentences(tidy(passRaw.replace(/[\p{Co}䂞↓⇓]/gu, " ")));
  const kept = sents.filter((t) => !/\(A\)|\(B\)/.test(t));
  passRaw = kept.length < sents.length ? kept.join(" ") : passRaw.replace(summary, " ");
  passRaw = tidy(passRaw.replace(/\s*\(A\)\s*\(B\)\s*/g, " ").replace(/[\p{Co}䂞↓⇓]/gu, " "));
  const truncS = detectTruncation(passRaw, p.text, passBox ? 0.93 : 0.95);
  if (truncS) issues.push(`NOTE:corpus-truncated(+${truncS.extraWords}w) — 원형 본문으로 대체`);
  else oracle(passRaw, p.text, issues, "본문", ORACLE_SOFT);
  if (!Number.isInteger(ans)) { issues.push("UNSUPPORTED:no-answer"); return failS("SUMMARY_COMPLETE_MC", direction, issues); }
  if (!pairs[ans - 1]) { issues.push(`요약 정답 ${ans} 범위 밖`); return failS("SUMMARY_COMPLETE_MC", direction, issues); }
  const [a, b] = pairs[ans - 1];
  const opts = summaryOptions(pairs);
  const sd = { _typeId: "SUMMARY_COMPLETE_MC", direction, summaryWithBlanks: summary, options: opts, correctAnswer: mcAnswer(ans), blanks: [{ label: "(A)", answer: a }, { label: "(B)", answer: b }] };
  return { subType: "SUMMARY_COMPLETE_MC", direction, questionText: joinParts(direction, `↓\n${summary}`), options: opts, correctAnswer: sd.correctAnswer, structuredData: sd, passageContent: truncS ? truncS.override : p.text, passageContentOverride: truncS ? truncS.override : null, issues };
}


/** 구형 네모 선택형((A) it / that · [A] · 발문 「네모 안에서」) — 1차 미지원(GRAMMAR_CHOICE_COMBO 매핑은 2차) */
function isBoxChoice(direction, raw) {
  if (/네모/.test(direction.replace(/\s/g, ""))) return true;
  if (/\[A\]|\(A\)\s*\[/.test(raw)) return true;
  const slots = raw.match(/\([A-C]\)\s*[A-Za-z'’-]+(?:\s+[A-Za-z'’-]+){0,3}\s*\/\s*[A-Za-z'’-]+/g) || [];
  return slots.length >= 2;
}

// ── 8. 어법 / 어휘(밑줄 5) ──────────────────────────────────────────────────────
/** 원형 밑줄 → 마커별 스팬 5개. 마커는 words 머리(①word) 또는 prev(①) 로 온다. 줄바꿈 이어짐은 병합. */
function markerSpans(slice, issues) {
  const uls = (slice?.underlines || []).filter((u) => !hasHangul(u.words) || /^[①-⑤]/.test(u.words));
  uls.sort((a, b) => a.page - b.page || a.col - b.col || a.y - b.y || a.x0 - b.x0);
  const spans = []; // {k, text, y, page, col, x1}
  for (const u of uls) {
    let words = tidy(u.words);
    let k = -1;
    const m = words.match(/^([①-⑤])\s*(.*)$/);
    if (m) { k = CIRC.indexOf(m[1]); words = m[2]; }
    else if (u.prev && CIRC.includes(u.prev.trim())) k = CIRC.indexOf(u.prev.trim());
    else if (u.prev && /^[①-⑤]$/.test(u.prev.trim().slice(-1)) && u.prev.trim().length === 1) k = CIRC.indexOf(u.prev.trim());
    if (k >= 0) { spans.push({ k, text: words, page: u.page, col: u.col, y: u.y, x1: u.x1 }); continue; }
    // 마커 없는 밑줄: 직전 스팬의 다음 줄 이어짐이면 병합
    const last = spans[spans.length - 1];
    if (last && last.page === u.page && last.col === u.col && u.y - last.y > 8 && u.y - last.y < 26 && words) {
      last.text = tidy(last.text + " " + words); last.y = u.y;
    }
  }
  const byK = new Map();
  for (const s of spans) if (!byK.has(s.k)) byK.set(s.k, s.text.replace(/[.,;:!?”’"']+$/g, ""));
  const out = [0, 1, 2, 3, 4].map((k) => byK.get(k) || null);
  if (out.some((x) => !x)) issues.push(`밑줄 스팬 미확보: ${out.map((x, i) => (x ? "" : CIRC[i])).join("")}`);
  return out;
}

function bakeMarkers(raw, spans, labelOf, issues) {
  let text = raw;
  const found = [];
  for (let k = 0; k < 5; k++) {
    const sp = spans[k];
    if (!sp) { found.push(null); continue; }
    const re = new RegExp(`${CIRC[k]}\\s*`);
    const mi = text.search(re);
    if (mi < 0) { issues.push(`본문에 마커 ${CIRC[k]} 없음`); found.push(null); continue; }
    const after = text.slice(mi).replace(re, "");
    const h = findInText(after, sp);
    if (!h || h.start > 3) { issues.push(`마커 ${CIRC[k]} 뒤 스팬 불일치: ${sp}`); found.push(null); continue; }
    const surface = after.slice(h.start, h.end);
    text = text.slice(0, mi) + `__${labelOf(k)} ${surface}__` + after.slice(h.end);
    found.push(surface);
  }
  // 밑줄 토큰 앞뒤 공백 정돈: "voice,__(A) seeming__to" → "voice, __(A) seeming__ to" (구두점 앞은 붙인다)
  let t = tidy(text)
    .replace(/(\S)__\(/g, "$1 __(")
    .replace(/__(?=[A-Za-z0-9“‘"'(])/g, "__ ")
    .replace(/__\s+\(/g, "__(")
    .replace(/\s{2,}/g, " ");
  return { text: t, found };
}

/** 마커 k 의 전후 ±6단어(마커를 벗긴 본문 기준) — 렌더러 findWithSurroundingContext 가 첫 출현이 아닌 그 자리를 잡게 한다 */
function surroundingOf(baked, k, labelCls) {
  const re = new RegExp("__\\(" + labelCls + "\\) ([^_]+)__", "g");
  let m, idx = 0, hit = null;
  while ((m = re.exec(baked))) { if (idx === k) { hit = m; break; } idx++; }
  if (!hit) return null;
  const strip = (t) => t.replace(/__\([A-Ea-e]\) ([^_]+)__/g, "$1");
  const before = strip(baked.slice(0, hit.index)).split(/\s+/).filter(Boolean).slice(-6).join(" ");
  const after = strip(baked.slice(hit.index + hit[0].length)).split(/\s+/).filter(Boolean).slice(0, 6).join(" ");
  return tidy(`${before} ${hit[1]} ${after}`);
}

export function handleGrammar(ctx) {
  const { p, recon, slice, typeGroup, qNum } = ctx;
  const issues = [];
  const { direction, body } = parseSlice(slice, typeGroup, issues, { expectChoices: false });
  const ans = answerNum(p, qNum, ctx);
  const raw = bodyText(body);
  if (isBoxChoice(direction, raw)) { issues.push("UNSUPPORTED:box-choice"); return fail("GRAMMAR_ERROR", direction, issues); }
  const spans = markerSpans(slice, issues);
  if (spans.some((s) => !s)) return fail("GRAMMAR_ERROR", direction, issues);
  const { text: baked, found } = bakeMarkers(raw, spans, grammarMarker, issues);
  if (found.some((f) => !f)) return fail("GRAMMAR_ERROR", direction, issues);
  // 정답 스팬의 교정형: 평가원 recon.correction.to / 학평 plantedError.original
  const printed = found[ans - 1];
  let corrected = null;
  if (recon?.correction && recon.correction.to && !recon.correction.boxChoice) corrected = tidy(recon.correction.to);
  else if (p.plantedError?.original && p.plantedError?.planted && similarity(p.plantedError.planted, printed) > 0.6) corrected = tidy(printed.replace(p.plantedError.planted, p.plantedError.original));
  // 오라클: 마커 제거 본문 vs 코퍼스(교정형) — 정답 스팬만 다를 수 있다
  const plain = tidy(baked.replace(/__\([A-E]\) ([^_]+)__/g, "$1"));
  const withCorr = corrected ? plain.replace(printed, corrected) : plain;
  const sim = similarity(withCorr, p.text);
  if (sim < ORACLE_MIN) issues.push(`어법 오라클 불일치 sim=${sim.toFixed(3)}${corrected ? "" : " (교정형 미상)"}`);
  const fn = footnoteTail(slice?.cleaned.footnotes);
  const pw = fn ? `${baked}\n\n${fn}` : baked;
  const options = grammarOptions(found);
  const markedExpressions = found.map((f, i) => ({
    label: grammarMarker(i), expression: i === ans - 1 && corrected ? corrected : f, isError: i === ans - 1,
    ...(i === ans - 1 ? { errorExpression: f, ...(corrected ? { correction: corrected } : {}) } : {}),
    ...(surroundingOf(baked, i, "[A-E]") ? { surroundingText: surroundingOf(baked, i, "[A-E]") } : {}),
  }));
  const sd = { _typeId: "GRAMMAR_ERROR", direction, passageWithMarkers: pw, markedExpressions, options, correctAnswer: grammarAnswer(ans), correctAnswers: [grammarAnswer(ans)] };
  return { subType: "GRAMMAR_ERROR", direction, questionText: joinParts(direction, pw), options, correctAnswer: sd.correctAnswer, structuredData: sd, passageContent: p.text, issues, meta: { corrected } };
}

export function handleVocab(ctx) {
  const { p, slice, typeGroup, qNum } = ctx;
  const issues = [];
  const { direction, body } = parseSlice(slice, typeGroup, issues, { expectChoices: false });
  const ans = answerNum(p, qNum, ctx);
  const raw = bodyText(body);
  if (isBoxChoice(direction, raw)) { issues.push("UNSUPPORTED:box-choice"); return fail("VOCAB_CHOICE", direction, issues); }
  const spans = markerSpans(slice, issues);
  if (spans.some((s) => !s)) return fail("VOCAB_CHOICE", direction, issues);
  const { text: baked, found } = bakeMarkers(raw, spans, vocabMarker, issues);
  if (found.some((f) => !f)) return fail("VOCAB_CHOICE", direction, issues);
  const plain = tidy(baked.replace(/__\([a-e]\) ([^_]+)__/g, "$1"));
  oracle(plain, p.text, issues, "어휘 본문");
  const fn = footnoteTail(slice?.cleaned.footnotes);
  const pw = fn ? `${baked}\n\n${fn}` : baked;
  const better = p.plantedError?.original || null;
  const options = found.map((f, i) => ({ label: String(i + 1), text: f }));
  const markedWords = found.map((f, i) => ({ label: vocabMarker(i), word: f, originalWord: f, substituteWord: f, isInappropriate: i === ans - 1, ...(i === ans - 1 && better ? { betterWord: better } : {}), ...(surroundingOf(baked, i, "[a-e]") ? { surroundingText: surroundingOf(baked, i, "[a-e]") } : {}) }));
  const sd = { _typeId: "VOCAB_CHOICE", direction, passageWithMarkers: pw, markedWords, options, correctAnswer: mcAnswer(ans), vocabDisplayMode: "SOURCE_EXACT" };
  return { subType: "VOCAB_CHOICE", direction, questionText: joinParts(direction, pw), options, correctAnswer: sd.correctAnswer, structuredData: sd, passageContent: p.text, issues };
}

function fail(subType, direction, issues) {
  return { subType, direction, questionText: "", options: [], correctAnswer: "", structuredData: {}, passageContent: "", issues };
}

export const HANDLERS = {
  "주장": handleSource, "요지": handleSource, "주제": handleSource, "제목": handleSource, "내용일치": handleSource,
  "빈칸추론": handleBlank, "함축의미": handleImplied, "문장삽입": handleInsert, "글의순서": handleOrder,
  "무관한문장": handleIrrelevant, "요약문": handleSummary, "어법": handleGrammar, "어휘": handleVocab,
};

export { wordCount };
