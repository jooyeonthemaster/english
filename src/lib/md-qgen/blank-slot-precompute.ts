// ============================================================================
// 빈칸 KILLER 자리 사전계산 (26-08-20, O231 — 사용자 승인 캠페인)
//
// 배경: 프롬프트·2콜 파이프라인 7접근이 전부 r1 을 못 이겼다(O228~O230). 공통
// 사인 = 모델이 스스로 자리를 감사하게 하면 맹점이 옮겨갈 뿐이다. 반면 상한
// 프로브(명장 설계)가 이긴 방식은 언제나 "재진술 지도를 먼저 그리고 깨끗한
// 자리를 고르는" 것이었다 — 그 지도를 0원 결정형 코드로 그려서 모델에게
// **입력으로 강제**한다(교사 포인트 기전과 동형: 자기검열이 아니라 입력 제약).
//
// 알고리즘(순수 휴리스틱, LLM 0콜):
//   1. 문장 분해(게이트와 동일한 종결부호 규칙) → 절 분해(;:— 및 ", + 접속사").
//   2. 내용어 추출(불용어 제거·경량 어간, 3문장 이상 출현 전역어는 변별력이
//      없으므로 에코 계산에서 제외).
//   3. 절마다 **인접 에코**(같은 문장의 다른 절 + 앞뒤 문장과의 비전역 내용어
//      겹침 — 겹칠수록 빈칸을 뚫어도 옆에서 답이 샌다)와 **원거리 근거**(2문장
//      이상 떨어진 문장과의 겹침 — 이게 있어야 결합 추론으로 정답이 도출된다)를
//      계산한다.
//   4. 후보 = 첫 문장 제외·내용어 4개 이상·인접 에코 ≤2·원거리 근거 ≥1,
//      (에코 asc, 근거 desc, 중반부 선호) 정렬 상위 N. 에코 어휘 목록은
//      "오답에 심어라" 지시로 동봉한다(상한 프로브 승자 설계의 이중 활용).
//
// 킬스위치: 호출측(md-stream)에서 env QGEN_BLANK_SLOT_PRECOMP=off.
// ============================================================================

const STOPWORDS = new Set([
  "the", "and", "but", "for", "with", "that", "this", "these", "those", "from",
  "into", "onto", "over", "under", "about", "than", "then", "when", "while",
  "have", "has", "had", "was", "were", "are", "will", "would", "could", "should",
  "their", "there", "they", "them", "its", "his", "her", "our", "your", "not",
  "you", "may", "might", "can", "must", "been", "being", "what", "which", "who",
  "how", "why", "where", "all", "any", "some", "more", "most", "much", "many",
  "such", "also", "just", "even", "only", "very", "too", "let", "say", "says",
  "said", "one", "two", "own", "other", "another", "each", "because", "instead",
  "though", "although", "however", "therefore", "thus", "yet", "does", "did",
  "doing", "don", "isn", "aren", "won", "way", "ways", "thing", "things",
]);

/** 경량 어간 — 굴절(needs↔need)에 더해 파생(guidance↔guided, persuasion↔persuade
 * 계열)까지 흡수한다. 26-08-20 R1 패널 실측: guided↔guidance 를 못 잡아 등위
 * 후행절 누설 자리(PP11)가 후보로 나갔다 — 파생 접미사층 추가. */
function stem(w: string): string {
  let s = w;
  // 파생 접미사(명사화·형용사화) 먼저 벗긴다.
  for (const suf of ["ance", "ence", "ation", "tion", "sion", "ment", "ness", "ally", "able", "ible", "ive", "ity"]) {
    if (s.length > suf.length + 3 && s.endsWith(suf)) { s = s.slice(0, -suf.length); break; }
  }
  if (s.length > 5 && s.endsWith("ing")) s = s.slice(0, -3);
  else if (s.length > 4 && s.endsWith("ied")) s = s.slice(0, -3) + "y";
  else if (s.length > 4 && s.endsWith("ed")) s = s.slice(0, -2);
  else if (s.length > 4 && s.endsWith("es")) s = s.slice(0, -2);
  else if (s.length > 3 && s.endsWith("s")) s = s.slice(0, -1);
  if (s.length > 4 && s.endsWith("e")) s = s.slice(0, -1); // persuade↔persuasion 수렴
  return s;
}

function contentTokens(text: string): string[] {
  return (text.toLowerCase().match(/[a-z][a-z'-]{2,}/g) ?? [])
    .filter((w) => !STOPWORDS.has(w))
    .map(stem)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w));
}

export function splitSentences(passage: string): string[] {
  return (passage.match(/[^.!?]+[.!?]+["”’']?/g) ?? [passage]).map((s) => s.trim()).filter(Boolean);
}

/** 절 분해 — ;:— 경계 및 ", + 등위/종속 접속사" 경계. 12단어 상한(빈칸원문 규격)에
 * 맞춰 과대 절은 " that " 에서 한 번 더 쪼갠다. */
export function splitClauses(sentence: string): string[] {
  let parts = sentence
    .split(/(?<=[;:—–])\s*|,\s+(?=(?:and|but|or|so|yet|because|which|who|that|when|while|instead|rather)\b)/i)
    .map((p) => p.trim())
    .filter(Boolean);
  const out: string[] = [];
  for (const p of parts) {
    if (p.split(/\s+/).length > 16) {
      const sub = p.split(/\s+(?=that\s)/i).map((x) => x.trim()).filter(Boolean);
      out.push(...(sub.length > 1 ? sub : [p]));
    } else out.push(p);
  }
  return out.filter((c) => c.length > 0);
}

export interface BlankSlotCandidate {
  sentenceIndex: number;
  clause: string;
  /** 인접(같은 문장 다른 절·앞뒤 문장)과 겹치는 비전역 내용어 — 오답 미끼 재료 */
  echoWords: string[];
  /** 원거리(2문장+) 근거 문장 번호(1-기반) */
  supportSentences: number[];
}

export interface BlankSlotAnalysis {
  sentences: string[];
  candidates: BlankSlotCandidate[];
  /** 에코 최악 절(참고·금지 안내용) */
  worst: Array<{ sentenceIndex: number; clause: string; echoWords: string[] }>;
}

export function analyzeBlankSlots(passage: string, maxCandidates = 3): BlankSlotAnalysis {
  const sentences = splitSentences(passage);
  const n = sentences.length;
  const sentTokens = sentences.map((s) => new Set(contentTokens(s)));
  // 전역어: 3문장 이상 출현(짧은 지문은 40% 이상) — 주제어라 변별력 없음.
  const df = new Map<string, number>();
  for (const toks of sentTokens) for (const t of toks) df.set(t, (df.get(t) ?? 0) + 1);
  const globalThreshold = Math.max(3, Math.ceil(n * 0.4));
  const isGlobal = (t: string) => (df.get(t) ?? 0) >= globalThreshold;

  const scored: Array<BlankSlotCandidate & { echoCount: number; support: number }> = [];
  for (let i = 0; i < n; i++) {
    if (i === 0) continue; // 첫 문장 금지(기존 규격)
    const clauses = splitClauses(sentences[i]);
    for (const clause of clauses) {
      const cToks = contentTokens(clause).filter((t) => !isGlobal(t));
      if (new Set(cToks).size < 4) continue; // 내용 밀도 미달
      const wc = clause.split(/\s+/).length;
      if (wc < 5 || wc > 20) continue; // 절은 '권역' 추천 — 빈칸원문(12단어)은 절 안 구간이므로 20까지 허용(C2 S4 19단어 실측)
      // 인접 이웃 = 같은 문장의 나머지 + 앞뒤 문장
      const rest = sentences[i].replace(clause, " ");
      const neighborText = [rest, sentences[i - 1] ?? "", sentences[i + 1] ?? ""].join(" ");
      const nToks = new Set(contentTokens(neighborText).filter((t) => !isGlobal(t)));
      const echo = [...new Set(cToks)].filter((t) => nToks.has(t));
      // 같은 문장 등위 후행절 누설(PP11 실측: "she will ___ and be guided by …" —
      // 후행절이 빈칸을 그 자리에서 구체화): 같은 문장의 나머지와 2스템+ 겹치면
      // 인접 에코가 아니라 재진술 누설로 승격 실격(임계 3 — 2는 C2 과보정 실측).
      const restShared = [...new Set(cToks)].filter((t) => new Set(contentTokens(rest).filter((x) => !isGlobal(x))).has(t));
      if (restShared.length >= 3) {
        scored.push({ sentenceIndex: i + 1, clause, echoWords: [...restShared, "→같은 문장 재진술"], supportSentences: [], echoCount: 99, support: 0 });
        continue;
      }
      // 원거리 관계: |i-j|>=2 문장과의 비전역 겹침을 두 갈래로 판정한다.
      //   겹침 1~2 스템 = 근거(support — 결합 추론 재료, 좋음)
      //   겹침 ≥3 스템 또는 절 어휘의 60%+ = **재진술 누설**(leak — 그 문장이 답을
      //   그대로 말해 준다. 상한 프로브 C2 실측: "objective value" 절을 2문장 뒤
      //   "turn the subjective…into an objective number"가 축자 재진술 → 즉답)
      const support: number[] = [];
      const distinct = [...new Set(cToks)];
      let leakedBy = 0;
      for (let j = 0; j < n; j++) {
        if (Math.abs(i - j) < 2) continue;
        const shared = distinct.filter((t) => sentTokens[j].has(t) && !isGlobal(t)).length;
        if (shared >= 3 || (distinct.length >= 2 && shared / distinct.length >= 0.6)) leakedBy = j + 1;
        else if (shared >= 1) support.push(j + 1);
      }
      if (leakedBy) {
        scored.push({ sentenceIndex: i + 1, clause, echoWords: [...echo, `→S${leakedBy} 재진술`], supportSentences: [], echoCount: 99, support: 0 });
        continue;
      }
      // 준(準)에코: 거리 2 문장과 2스템 공유 — 즉답까진 아니나 정답 어휘로 쓰면
      // 샌다(PA08 실측: 같은 자리에서 공유 어휘를 피해 쓴 쪽만 킬러 생존). 후보는
      // 유지하되 랭크 감점 + "정답에 이 어휘 금지" 경고로 동봉한다.
      for (let j = 0; j < n; j++) {
        if (Math.abs(i - j) !== 2) continue;
        const sharedW = distinct.filter((t) => sentTokens[j].has(t) && !isGlobal(t));
        if (sharedW.length >= 2) for (const w of sharedW) if (!echo.includes(w)) echo.push(w);
      }
      scored.push({
        sentenceIndex: i + 1,
        clause,
        echoWords: echo,
        supportSentences: support,
        echoCount: echo.length,
        support: support.length,
      });
    }
  }
  // 정렬: 에코 적은 순 → 원거리 근거 많은 순 → 중반부(마지막 문장 감점) 선호
  const rank = (c: (typeof scored)[number]) =>
    c.echoCount * 100 - c.support * 10 + (c.sentenceIndex === n ? 30 : 0) + (c.sentenceIndex === 2 ? 5 : 0);
  let eligible = scored.filter((c) => c.echoCount <= 3 && c.support >= 1);
  if (eligible.length === 0) {
    // 후보 전멸 시 폴백: 누설(99) 아닌 절 중 에코 최소 상위 2 — 경고 동봉 안내가
    // 아예 사라지는 것보다 낫다(빈 블록이면 r1 무보정 폴백이라 이득 0).
    eligible = scored.filter((c) => c.echoCount < 99).sort((a, b) => a.echoCount - b.echoCount).slice(0, 2);
  }
  eligible.sort((a, b) => rank(a) - rank(b));
  const chosen = new Set(eligible.slice(0, maxCandidates).map((c) => c.clause));
  const worstPool = [...scored].filter((c) => !chosen.has(c.clause)).sort((a, b) => b.echoCount - a.echoCount).slice(0, 2);
  return {
    sentences,
    candidates: eligible.slice(0, maxCandidates).map(({ echoCount, support, ...c }) => c),
    worst: worstPool
      .filter((w) => w.echoCount >= 3)
      .map((w) => ({ sentenceIndex: w.sentenceIndex, clause: w.clause, echoWords: w.echoWords })),
  };
}

/** 프롬프트 블록 — 후보가 없으면 빈 문자열(주입 생략, 기존 규칙만으로 동작). */
export function buildBlankSlotBlock(analysis: BlankSlotAnalysis): string {
  if (analysis.candidates.length === 0) return "";
  const lines: string[] = [
    "## 빈칸 자리 후보 (결정형 사전 분석 — 필수 준수)",
    "지문을 문장·절 단위로 기계 분석해 \"빈칸을 뚫어도 인접 문장에서 답이 새지 않는\" 자리를 골라냈다. **빈칸원문은 아래 후보 절(또는 그 절 안의 연속 구간)에서만 잡아라.**",
  ];
  for (const [i, c] of analysis.candidates.entries()) {
    const echo = c.echoWords.length
      ? ` 인접 겹침 어휘(${c.echoWords.join(", ")})는 정답이 아니라 **오답 선지에 심어** 표면 매칭 학생을 낚아라.`
      : " 인접 재진술 없음 — 정답이 옆에서 새지 않는 자리다.";
    lines.push(
      `${i + 1}. [문장 ${c.sentenceIndex}] 핵심 절 "${c.clause}" — 빈칸원문은 **이 문장 안에서, 이 절을 중심으로** 잡아라(절 그대로 또는 절 안의 연속 구간, 12단어 이내). 근거가 문장 ${c.supportSentences.slice(0, 3).join("·")} 에 떨어져 있어 결합 추론을 강제한다.${echo}`,
    );
  }
  for (const w of analysis.worst) {
    lines.push(
      `🚫 금지: [문장 ${w.sentenceIndex}] "${w.clause.slice(0, 60)}…" — 인접 문장이 이 내용을 재진술한다(겹침: ${w.echoWords.slice(0, 4).join(", ")}). 이 자리에 뚫으면 표면 스캔으로 즉답된다.`,
    );
  }
  return lines.join("\n");
}
