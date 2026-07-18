// 어휘 적절성(VOCAB_CHOICE) 치환 무결성 결정형 게이트 (2026-07-18 블라인드 감사 O-VOCAB-seam).
//
// 실측 결함: 원문 구동사 "leaving out the cat" 에서 head 인 "leaving" 만 정답 오답어
// "including" 으로 치환하고 particle "out" 이 잔류 → 렌더 "including out the cat" 가
// 되어 영어에 존재하지 않는 결합이 만들어졌다. 문맥 판단이 아니라 문법 파손만으로
// 정답(d)이 노출되는, 정답 무효급 누수다. 기존 vocab.ts 게이트는 마커/개수/원단어
// 존재만 검사할 뿐 "치환 결과 문장의 이음매(seam) 무결성"을 보지 않는다.
//
// 여기서는 markedWords + passageWithMarkers 만으로(원문 passage 는 있으면 대조 강화)
// 두 클래스를 결정형으로 차단한다:
//   (1) vocab-substitution-seam-particle — 정답 밑줄 직후에 원문 구동사의 particle 이
//       잔류해, 원문에선 구동사였던 "originalWord+particle" 이 치환 후 존재하지 않는
//       "substituteWord+particle" 새 결합이 된 경우 ("including out").
//   (2) vocab-substitution-unauthorized-mutation — 정답 치환 자리의 좌/우 문장부호가
//       원문과 어긋나(콤마 소실/삽입 등) 의도한 1단어 치환을 벗어난 무단 변형.
import { findMarkers, isRecord, normalizeComparableText, normalizeText } from "../../core";

export interface VocabSubstitutionSeamFinding {
  code:
    | "vocab-substitution-seam-particle"
    | "vocab-substitution-unauthorized-mutation";
  message: string;
  evidence: Record<string, unknown>;
}

// 구동사 particle 후보 — 임무 명세의 out/up/off/in/on/away/over/down/back 을 포함한
// 확장 집합. 전치사와 겹치는 항목이 많지만, 발동 조건이 아래 PHRASAL_VERBS 사전에
// "originalWord+particle 이 실제 구동사였는가"로 이중 게이트되므로 오탐 위험은 낮다.
export const PHRASAL_VERB_PARTICLES = new Set<string>([
  "out", "up", "off", "in", "on", "away", "over", "down", "back",
  "through", "around", "along", "apart", "aside", "forward", "forth",
  "about", "across", "ahead", "together",
]);

// particle 별 구동사 head 원형(lemma) 사전. 목적은 두 가지다:
//   · 원문측: originalWord+particle 이 "진짜 구동사였는지" 판정(발동 전제).
//   · 치환측: substituteWord+particle 이 "정상 구동사인지" 판정(오탐 억제).
// 원문측이 사전에서 누락되면 미발동(false negative, 안전). 치환측 오탐을 막기 위해
// 각 particle 의 흔한 구동사를 넉넉히 수록한다. 완전 사전이 아니라 "흔한 결합" 사전이다.
const PHRASAL_VERBS: Record<string, Set<string>> = {
  out: new Set([
    "leave", "cross", "rule", "throw", "take", "work", "figure", "point", "hand",
    "give", "put", "carry", "find", "hold", "pick", "sell", "wipe", "black",
    "knock", "spread", "stretch", "spell", "map", "single", "phase", "weed",
    "drown", "drag", "draw", "iron", "smooth", "filter", "screen", "block",
    "edge", "fan", "flesh", "hammer", "help", "lay", "level", "opt", "pan",
    "play", "print", "read", "rent", "round", "set", "space", "storm", "tease",
    "thin", "tire", "top", "try", "tune", "wash", "watch", "wear", "act", "bail",
    "bear", "blot", "bottom", "branch", "break", "bring", "buy", "call", "camp",
    "cancel", "chill", "chop", "clean", "clear", "close", "comb", "come", "count",
    "cut", "deal", "die", "dig", "dish", "dole", "drop", "dry", "dust", "eat",
    "even", "fall", "farm", "fill", "fish", "fit", "fling", "flush", "fork",
    "freak", "gross", "gut", "hang", "hash", "head", "hear", "hollow", "hunt",
    "keep", "kick", "lash", "leak", "lean", "let", "live", "lock", "log", "look",
    "make", "mark", "miss", "move", "nose", "order", "pass", "pay", "peel",
    "plug", "poke", "pop", "pour", "pull", "pump", "push", "reach", "reason",
    "roll", "root", "rough", "rub", "run", "rush", "scoop", "scope", "scout",
    "scrape", "seek", "send", "share", "shell", "shine", "shoot", "shout",
    "shut", "sign", "sit", "sketch", "slip", "sneak", "snuff", "sort", "speak",
    "spit", "splash", "spring", "squeeze", "stamp", "stand", "start", "step",
    "stick", "strike", "string", "swear", "sweat", "swing", "talk", "tap",
    "tear", "tell", "think", "thrust", "time", "tip", "toss", "trace", "trot",
    "turn", "type", "vote", "wait", "walk", "whip", "win", "wring", "write",
    "zone",
  ]),
  up: new Set([
    "give", "grow", "break", "bring", "call", "come", "get", "go", "look",
    "make", "pick", "put", "set", "show", "take", "wake", "back", "beat",
    "blow", "build", "burn", "buy", "catch", "cheer", "clean", "clear", "climb",
    "close", "curl", "cut", "dig", "do", "dress", "dry", "end", "face", "fill",
    "finish", "fire", "fix", "flare", "follow", "free", "gather", "gear", "hang",
    "heat", "hold", "hook", "hurry", "keep", "lay", "lift", "light", "line",
    "live", "lock", "loosen", "mess", "mix", "mop", "move", "open", "own",
    "pack", "pair", "pay", "pile", "play", "pop", "pull", "push", "raise",
    "read", "ring", "rise", "roll", "round", "rub", "save", "screw", "seal",
    "send", "settle", "shake", "shape", "shoot", "shut", "sign", "size", "slip",
    "slow", "snap", "soak", "sober", "speak", "speed", "spice", "split", "stack",
    "stand", "start", "stay", "step", "stir", "stock", "straighten", "suck",
    "sum", "sync", "tally", "team", "tear", "throw", "tidy", "tie", "top",
    "tune", "use", "wait", "walk", "warm", "wash", "wind", "wipe", "wrap",
    "whip", "wise", "prop", "perk", "pep", "muster",
  ]),
  off: new Set([
    "take", "put", "call", "get", "go", "back", "block", "break", "bring",
    "brush", "burn", "buy", "cast", "check", "chop", "clear", "close", "cool",
    "count", "cross", "cut", "doze", "drop", "dust", "ease", "fend", "finish",
    "fire", "give", "head", "hit", "hold", "keep", "kick", "knock", "laugh",
    "lay", "leave", "let", "live", "log", "mark", "pair", "pass", "pay", "peel",
    "pull", "put", "reel", "ring", "rip", "round", "run", "scare", "seal",
    "sell", "send", "set", "shake", "shave", "show", "shrug", "shut", "sign",
    "sleep", "sound", "spark", "split", "square", "storm", "strip", "switch",
    "take", "tear", "tell", "tick", "tip", "top", "trail", "trigger", "turn",
    "ward", "wave", "wear", "wipe", "work", "write",
  ]),
  down: new Set([
    "break", "put", "take", "turn", "write", "back", "bear", "bog", "boil",
    "bring", "burn", "buy", "calm", "close", "come", "cut", "die", "dress",
    "drink", "drive", "fall", "get", "go", "hand", "hold", "keep", "knock",
    "lay", "let", "lie", "live", "look", "mark", "melt", "mow", "nail",
    "narrow", "note", "pass", "pat", "pay", "pin", "play", "pour", "pull",
    "put", "rain", "run", "scale", "set", "settle", "shoot", "shut", "simmer",
    "sit", "slow", "step", "take", "talk", "tear", "throw", "tie", "tone",
    "track", "turn", "wash", "water", "wear", "weigh", "wind", "write", "cool",
    "count", "gun", "hose", "jot",
  ]),
  in: new Set([
    "give", "take", "bring", "come", "break", "call", "cave", "check", "chip",
    "close", "cut", "drop", "fall", "fill", "get", "hand", "join", "kick",
    "move", "plug", "pull", "put", "reel", "rein", "rope", "sink", "sit",
    "step", "stop", "tie", "tune", "turn", "usher", "zoom", "zero", "cash",
    "factor", "fit", "hone", "key", "lock", "log", "opt", "pencil", "phase",
    "pour", "rub", "sign", "settle", "throw", "trade", "weigh", "dig", "dive",
    "barge", "box", "count", "fence", "hem", "pack", "pile", "square", "stack",
    "tuck", "wade", "wall", "wave",
  ]),
  on: new Set([
    "put", "take", "go", "carry", "get", "hold", "keep", "move", "pass", "turn",
    "act", "bank", "base", "build", "call", "catch", "cheer", "count", "depend",
    "dote", "draw", "dwell", "egg", "embark", "expand", "feed", "focus", "hang",
    "harp", "latch", "lean", "look", "pile", "play", "prey", "push", "rely",
    "sign", "sleep", "spring", "spur", "stay", "tack", "touch", "tread", "try",
    "urge", "wait", "work", "zero", "chip", "gain", "hinge", "insist", "load",
    "pull", "reflect", "sell", "switch", "tag", "tie",
  ]),
  over: new Set([
    "take", "go", "hand", "look", "come", "boil", "bowl", "brood", "change",
    "chew", "cross", "do", "fall", "get", "gloss", "hang", "keel", "knock",
    "laugh", "lay", "mull", "pass", "pore", "pull", "push", "put", "read",
    "roll", "run", "sail", "sign", "skate", "skip", "sleep", "spill", "start",
    "stop", "switch", "talk", "think", "tide", "tip", "topple", "trip", "turn",
    "walk", "wash", "watch", "win",
  ]),
  away: new Set([
    "give", "take", "throw", "put", "get", "run", "walk", "back", "blow",
    "break", "carry", "cast", "chase", "chip", "come", "cut", "die", "do",
    "drive", "ebb", "explain", "fade", "fall", "file", "fire", "fritter",
    "gnaw", "hide", "keep", "laugh", "lock", "look", "melt", "move", "pass",
    "peel", "plug", "pull", "push", "sail", "scare", "send", "shy", "sign",
    "slip", "snatch", "spirit", "stash", "stay", "steal", "step", "storm",
    "stow", "sweep", "tear", "tidy", "tuck", "turn", "waste", "wave", "wear",
    "while", "whisk", "wither", "work",
    // 26-07-18 FP 스캔(fp-scan-vocab-substitution-seam) 오탐 억제: "away" 는 정지·
    // 위치 동사에도 생산적으로 붙는 부사라("remain/linger/drift away" 모두 정문),
    // 관용 구동사가 아니어도 유효 결합인 stative 동사를 억제셋에 편입한다.
    "remain", "linger", "shrink", "edge", "back",
  ]),
  back: new Set([
    "give", "take", "come", "go", "get", "bring", "call", "cut", "date", "draw",
    "ease", "fall", "fight", "hang", "hark", "hit", "hold", "keep", "kick",
    "laugh", "look", "pay", "phase", "play", "pull", "push", "put", "report",
    "roll", "scale", "sell", "send", "set", "sit", "snap", "stand", "step",
    "tie", "trace", "turn", "win", "write", "answer", "buy", "claw", "double",
    "edge", "feed", "plow", "read", "throw",
  ]),
  through: new Set([
    "get", "go", "come", "break", "carry", "cut", "fall", "follow", "live",
    "look", "muddle", "pass", "plow", "pull", "push", "put", "read", "run",
    "scroll", "see", "shine", "sit", "sleep", "slip", "think", "thumb", "wade",
    "sail", "sift", "breeze", "flick", "leaf", "sweat", "talk",
  ]),
  around: new Set([
    "get", "go", "come", "turn", "bring", "boss", "fool", "gather", "hang",
    "horse", "kick", "knock", "lounge", "mess", "mill", "move", "order", "play",
    "poke", "push", "run", "shop", "sit", "stick", "swing", "throw", "wait",
    "walk", "wrap", "ask", "nose", "rally", "root", "scout", "shuffle", "spin",
  ]),
  along: new Set([
    "get", "go", "come", "bring", "carry", "move", "play", "run", "sing",
    "string", "tag", "walk", "amble", "bowl", "chug", "drive", "hum", "pass",
    "plod", "roll", "saunter", "scrape", "trundle",
  ]),
  apart: new Set([
    "take", "tell", "fall", "pull", "come", "break", "drift", "grow", "keep",
    "move", "rip", "set", "tear", "blow", "split", "wrench",
  ]),
  aside: new Set([
    "set", "put", "cast", "lay", "push", "brush", "step", "take", "turn",
    "move", "sweep", "shove", "stand", "thrust",
  ]),
  forward: new Set([
    "look", "bring", "put", "come", "carry", "feed", "move", "pay", "press",
    "push", "step", "drive", "edge", "roll", "send", "spring",
  ]),
  forth: new Set(["set", "bring", "come", "go", "put", "call", "hold", "pour", "send"]),
  about: new Set(["bring", "come", "go", "set", "turn", "knock"]),
  across: new Set(["come", "get", "put", "run", "stumble", "cut"]),
  ahead: new Set(["get", "go", "forge", "press", "push", "plan", "look", "pull"]),
  together: new Set([
    "get", "put", "bring", "come", "pull", "band", "throw", "piece", "scrape",
    "pool", "club", "gather",
  ]),
};

// 아주 얕은 표면 원형화(lemmatizer). 사전이 원형만 담으므로 -ing/-ed/-es/-s 활용을
// 원형 후보로 되돌린다. 완벽할 필요는 없고(사전 히트만 판정), 흔한 활용을 포괄한다.
const DOUBLED_CONSONANT_TAIL = /([bcdfghjklmnpqrstvwxz])\1$/;

function lemmaCandidates(word: string): string[] {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!w) return [];
  const out = new Set<string>([w]);
  if (w.endsWith("ing") && w.length > 4) {
    const base = w.slice(0, -3);
    out.add(base);
    out.add(`${base}e`); // leaving→leave, including→include
    if (DOUBLED_CONSONANT_TAIL.test(base)) out.add(base.slice(0, -1)); // running→run
  }
  if (w.endsWith("ied") && w.length > 3) out.add(`${w.slice(0, -3)}y`); // tried→try
  if (w.endsWith("ed") && w.length > 3) {
    const base = w.slice(0, -2);
    out.add(base);
    out.add(`${base}e`); // saved→save
    if (DOUBLED_CONSONANT_TAIL.test(base)) out.add(base.slice(0, -1)); // dropped→drop
  }
  if (w.endsWith("ies") && w.length > 3) out.add(`${w.slice(0, -3)}y`); // tries→try
  if (w.endsWith("es") && w.length > 3) {
    out.add(w.slice(0, -2)); // pushes→push
    out.add(w.slice(0, -1)); // takes→take
  }
  if (w.endsWith("s") && w.length > 2 && !w.endsWith("ss")) out.add(w.slice(0, -1)); // runs→run
  return [...out];
}

function isPhrasalVerb(word: string, particle: string): boolean {
  const set = PHRASAL_VERBS[particle];
  if (!set) return false;
  return lemmaCandidates(word).some((lemma) => set.has(lemma));
}

// 이동·지각·자세(motion/perception/posture) 동사류는 PHRASAL_VERB_PARTICLES 의 방향·
// 공간 부사와 생산적으로 자유 결합해 정문을 만든다("glance out (the window)", "step
// back", "lean over", "peer in", "climb down"). 관용 구동사 사전(PHRASAL_VERBS)이 흔한
// 결합만 담는 "완전하지 않은" 목록이라, 이런 자유 결합이 사전에 없으면 substituteIsPhrasal
// = false 가 되어 seam-particle 이 오발화한다(26-07-18 FP 스캔 오탐 벡터). 이 동사류가
// substituteWord 일 때는 사전 히트 여부와 무관하게 particle 잔류를 정문 후보로 보고
// 발화를 억제한다. 게이트 발동 전제(originalIsPhrasal)상 particle 은 이미 실제 구동사를
// 이루는 방향 부사이므로, 이 동사류와의 결합은 사실상 항상 유효하다.
const PRODUCTIVE_PARTICLE_VERBS = new Set<string>([
  // 이동(motion)
  "walk", "run", "go", "come", "move", "step", "climb", "jump", "leap", "crawl",
  "march", "stroll", "wander", "dash", "rush", "hurry", "race", "ride", "drive",
  "fly", "sail", "swim", "roll", "slide", "slip", "creep", "sneak", "dart",
  "stride", "skip", "hike", "travel", "head", "turn", "return", "charge",
  "scramble", "tiptoe", "wade", "trudge", "amble", "float", "drift", "spin",
  "circle", "pace", "back", "pull", "push", "set",
  // 지각(perception)/시선
  "look", "glance", "peer", "gaze", "stare", "watch", "peek", "glimpse",
  "squint", "gape",
  // 자세(posture)/신체 정렬
  "sit", "stand", "lie", "lean", "bend", "kneel", "crouch", "stoop", "slouch",
  "recline", "rise", "settle", "perch", "flop", "slump",
  // 팔·손 뻗기(reach 계열)
  "reach", "stretch", "point", "wave", "lift", "raise", "hold", "lay",
]);

function isProductiveParticleVerb(word: string): boolean {
  return lemmaCandidates(word).some((lemma) => PRODUCTIVE_PARTICLE_VERBS.has(lemma));
}

interface AnswerMarker {
  label: string;
  originalWord: string;
  substituteWord: string;
  markerEnd: number; // passageWithMarkers 상 이 정답 마커의 닫는 __ 직후 인덱스
  markerStart: number; // 여는 __ 인덱스
}

/** passageWithMarkers 에서 정답(치환된) 마커의 위치·원단어·치환어를 뽑는다. */
function collectAnswerMarkers(
  markedWords: Record<string, unknown>[],
  passageWithMarkers: string,
): AnswerMarker[] {
  const rendered = findMarkers(passageWithMarkers)
    .map((marker) => {
      const match = marker.inner.match(/^\(([a-jA-J])\)\s*(.+)$/);
      if (!match) return null;
      return {
        key: match[1].toLowerCase(),
        start: marker.start,
        end: marker.end,
      };
    })
    .filter((marker): marker is { key: string; start: number; end: number } => !!marker);
  const renderedByKey = new Map(rendered.map((marker) => [marker.key, marker]));

  const answers: AnswerMarker[] = [];
  for (const markedWord of markedWords) {
    if (markedWord.isInappropriate !== true) continue;
    const label = normalizeText(markedWord.label)
      .replace(/[()]/g, "")
      .trim()
      .toLowerCase();
    const key = label.match(/^[a-j]$/) ? label : "";
    if (!key) continue;
    const placed = renderedByKey.get(key);
    if (!placed) continue;
    // 치환 전 원단어: originalWord(우선) → betterWord(=원단어와 동일 계약).
    const originalWord =
      normalizeText(markedWord.originalWord) || normalizeText(markedWord.betterWord);
    // 치환 후 표시어: substituteWord(우선) → 렌더 word.
    const substituteWord =
      normalizeText(markedWord.substituteWord) || normalizeText(markedWord.word);
    answers.push({
      label: key,
      originalWord,
      substituteWord,
      markerStart: placed.start,
      markerEnd: placed.end,
    });
  }
  return answers;
}

/** 마커 닫는 __ 직후, "공백만" 사이에 두고 붙어 있는 첫 단어를 반환(문장부호가 끼면 null). */
function adjacentFollowingWord(passageWithMarkers: string, markerEnd: number): string | null {
  const after = passageWithMarkers.slice(markerEnd);
  const match = after.match(/^\s+([A-Za-z][A-Za-z'-]*)/);
  return match ? match[1] : null;
}

/** 마커 여는 __ 직전/닫는 __ 직후의 첫 비공백 문자(문장부호 대조용). 없으면 "". */
function seamPunctuation(passageWithMarkers: string, marker: AnswerMarker): {
  before: string;
  after: string;
} {
  const beforeRaw = passageWithMarkers.slice(0, marker.markerStart).replace(/\s+$/, "");
  const afterRaw = passageWithMarkers.slice(marker.markerEnd).replace(/^\s+/, "");
  const beforeChar = beforeRaw.slice(-1);
  const afterChar = afterRaw.slice(0, 1);
  return {
    before: /[.,;:!?"'()\-—–]/.test(beforeChar) ? beforeChar : "",
    after: /[.,;:!?"'()\-—–]/.test(afterChar) ? afterChar : "",
  };
}

/** 원문 passage 에서 originalWord 가 정확히 한 번만 등장할 때 그 좌/우 인접 문장부호를 반환. */
function originalSeamPunctuation(
  passage: string,
  originalWord: string,
): { before: string; after: string } | null {
  const escaped = originalWord.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(.?)\\s*\\b${escaped}\\b\\s*(.?)`, "gi");
  const matches = [...passage.matchAll(re)];
  if (matches.length !== 1) return null; // 다중/영 등장이면 정렬 모호 → 미대조(오탐 회피).
  const match = matches[0];
  const beforeChar = match[1] ?? "";
  const afterChar = match[2] ?? "";
  return {
    before: /[.,;:!?"'()\-—–]/.test(beforeChar) ? beforeChar : "",
    after: /[.,;:!?"'()\-—–]/.test(afterChar) ? afterChar : "",
  };
}

const PUNCTUATION_EQUIVALENTS: Record<string, string> = {
  "“": "\"", "”": "\"", "‘": "'", "’": "'", "—": "-", "–": "-",
};

function normalizePunct(char: string): string {
  return PUNCTUATION_EQUIVALENTS[char] ?? char;
}

export function findVocabSubstitutionSeamIssues(
  markedWordsInput: unknown,
  passageWithMarkers: string | undefined,
  passage?: string,
  vocabDisplayMode?: string,
): VocabSubstitutionSeamFinding[] {
  if (!passageWithMarkers) return [];
  const markedWords = Array.isArray(markedWordsInput)
    ? markedWordsInput.filter(isRecord)
    : [];
  if (markedWords.length === 0) return [];

  const answers = collectAnswerMarkers(markedWords, passageWithMarkers);
  const findings: VocabSubstitutionSeamFinding[] = [];

  for (const answer of answers) {
    const { originalWord, substituteWord } = answer;
    // 치환이 실제로 일어난 정답만 검사(원단어=치환어면 다른 게이트 소관).
    if (
      !originalWord ||
      !substituteWord ||
      normalizeComparableText(originalWord) === normalizeComparableText(substituteWord)
    ) {
      continue;
    }

    // ── (1) 구동사 particle 잔류 이음매 ──────────────────────────────────────
    const followingWord = adjacentFollowingWord(passageWithMarkers, answer.markerEnd);
    if (followingWord) {
      const particle = followingWord.toLowerCase();
      if (PHRASAL_VERB_PARTICLES.has(particle)) {
        const originalIsPhrasal = isPhrasalVerb(originalWord, particle);
        // 사전 히트 OR 이동·지각·자세 동사류(방향 부사와 생산적 자유 결합)면 정문 후보로
        // 보고 발화를 억제한다.
        const substituteIsPhrasal =
          isPhrasalVerb(substituteWord, particle) ||
          isProductiveParticleVerb(substituteWord);
        // 렌더된 "substituteWord+particle" 가 원문 passage 에 실제로 존재하면 정상 결합
        // 이므로 오탐 회피(원문 대조 억제기).
        const substituteSeamInPassage =
          !!passage &&
          normalizeComparableText(passage).includes(
            normalizeComparableText(`${substituteWord} ${particle}`),
          );
        if (originalIsPhrasal && !substituteIsPhrasal && !substituteSeamInPassage) {
          findings.push({
            code: "vocab-substitution-seam-particle",
            message:
              `VOCAB_CHOICE answer (${answer.label}) replaced only the head of the phrasal verb ` +
              `"${originalWord} ${particle}" with "${substituteWord}", stranding the particle "${particle}" ` +
              `and producing the non-existent English combination "${substituteWord} ${particle}". ` +
              `The wrong word is then detectable by grammar breakage alone (answer leaked). Replace the whole ` +
              `phrasal verb, or choose a substitute that does not strand "${particle}".`,
            evidence: {
              label: answer.label,
              originalSeam: `${originalWord} ${particle}`,
              renderedSeam: `${substituteWord} ${particle}`,
              particle,
            },
          });
          continue; // 같은 정답에 대해 이음매/문장부호 이중 발화 방지.
        }
      }
    }

    // ── (2) 치환 자리 문장부호 무단 변형(원문 대조) ──────────────────────────
    // 원문 passage 가 있고, 동의어 변형 모드가 아니며, originalWord 가 원문에 유일하게
    // 등장할 때만 좌/우 인접 문장부호를 대조한다(정렬 모호·변형모드 오탐 회피).
    if (passage && normalizeText(vocabDisplayMode).toUpperCase() !== "SYNONYM_VARIANT") {
      const renderedSeam = seamPunctuation(passageWithMarkers, answer);
      const sourceSeam = originalSeamPunctuation(passage, originalWord);
      if (sourceSeam) {
        const beforeMismatch =
          normalizePunct(renderedSeam.before) !== normalizePunct(sourceSeam.before);
        const afterMismatch =
          normalizePunct(renderedSeam.after) !== normalizePunct(sourceSeam.after);
        if (beforeMismatch || afterMismatch) {
          findings.push({
            code: "vocab-substitution-unauthorized-mutation",
            message:
              `VOCAB_CHOICE answer (${answer.label}) changed punctuation around the substitution site ` +
              `beyond the intended single-word swap: source shows "${sourceSeam.before || "·"}…${sourceSeam.after || "·"}" ` +
              `around "${originalWord}" but the rendered passage shows "${renderedSeam.before || "·"}…${renderedSeam.after || "·"}". ` +
              `Substitute exactly one word and keep all surrounding punctuation verbatim.`,
            evidence: {
              label: answer.label,
              originalWord,
              substituteWord,
              sourcePunct: `${sourceSeam.before || "·"}…${sourceSeam.after || "·"}`,
              renderedPunct: `${renderedSeam.before || "·"}…${renderedSeam.after || "·"}`,
            },
          });
        }
      }
    }
  }

  return findings;
}
