// ============================================================================
// orphan-passage / reconstruct — 지워진 지문 원문을 남은 자료에서 되살리는 순수 함수들(DB 무의존).
//
// 원천(신뢰도 순):
//   snapshot       빌더 저장본(exams.settings items/blocks[].passageContent) — 출제자가 본 글 그대로
//   reassembly     글의 순서(SENTENCE_ORDER) structuredData: 주어진 글 + 정답 순서의 (A)(B)(C) 문단
//   reconstruction 문장 삽입(SENTENCE_INSERT): 마커 본문에 주어진 문장을 정답 자리에 끼우고 마커 제거
//                  무관한 문장(IRRELEVANT): 정답 문장을 빼고 마커 제거
//                  빈칸(BLANK_INFERENCE): 정답 선지로 빈칸 채움
//   approximate    그 밖 마커 본문(밑줄·어법·어휘)의 표시만 걷어 낸 것 — 어법·어휘는 바뀐 낱말이 남을 수 있다
// 어느 것이든 **같은 학원의 살아 있는 지문과 정규화 전문이 완전히 같으면** 그 지문이 원본이라는 증거가 된다
// (우연히 1,000자 넘는 글이 글자까지 같을 수 없다). 같지 않으면 사람 검토 없이 쓰지 않는다.
// ============================================================================

import { normalizePassageContent } from "@/actions/workbench/_lib/passage-delete-guard";

export type ReconstructionSource = "snapshot" | "reassembly" | "reconstruction" | "approximate";

export type Reconstruction = {
  source: ReconstructionSource;
  /** 근거 문항(형제 문항) 또는 저장본을 가진 시험지 */
  fromQuestionId: string;
  fromExamId?: string;
  content: string;
};

export type SiblingQuestion = {
  id: string;
  subType: string | null;
  questionText: string;
  structuredData: unknown;
  options: string | null;
  correctAnswer: string;
};

const CIRCLED = "①②③④⑤⑥⑦⑧⑨⑩";

/**
 * 동일 지문 판정 정규화 — 지문 삭제 가드의 정본 normalizePassageContent **그 자체**다(26-09-30 COH-13 단일 원천).
 * 백필이 「같은 지문」이라 판정하는 규칙과 삭제 가드가 옮겨 연결할 때 쓰는 규칙이 갈라지면, 한쪽은 같다 하고 한쪽은
 * 다르다 하는 지문이 생긴다. 복제하지 말고 가져다 쓴다(단위 테스트가 같은 함수인지 확인한다).
 */
export const normalizeForIdentity: (content: unknown) => string = normalizePassageContent;

function readObject(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value === "string" && value.trim().startsWith("{")) {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  return null;
}

/** "3" · "③" · " 3 " → 0-based 인덱스. 아니면 null. */
export function answerIndex(answer: unknown): number | null {
  const s = String(answer ?? "").trim();
  const circled = CIRCLED.indexOf(s);
  if (circled >= 0) return circled;
  const m = /^(\d{1,2})$/.exec(s);
  return m ? Number(m[1]) - 1 : null;
}

function optionTexts(q: SiblingQuestion, sd: Record<string, unknown>): string[] {
  const fromSd = Array.isArray(sd.options) ? sd.options : null;
  let list: unknown[] = fromSd ?? [];
  if (!fromSd && q.options) {
    try {
      const parsed = JSON.parse(q.options);
      if (Array.isArray(parsed)) list = parsed;
    } catch {
      list = [];
    }
  }
  return list.map((o) => (o && typeof o === "object" ? String((o as { text?: unknown }).text ?? "") : String(o ?? "")));
}

/** SENTENCE_ORDER: 주어진 글 + 정답 순서 「(B)-(C)-(A)」 대로 문단. 문단·정답이 온전하지 않으면 null. */
export function reassembleSentenceOrder(q: SiblingQuestion): string | null {
  if (q.subType !== "SENTENCE_ORDER") return null;
  const sd = readObject(q.structuredData);
  if (!sd) return null;
  const given = typeof sd.givenSentence === "string" ? sd.givenSentence.trim() : "";
  const paragraphs = Array.isArray(sd.paragraphs) ? sd.paragraphs : [];
  const byLabel = new Map<string, string>();
  for (const p of paragraphs) {
    const label = String((p as { label?: unknown })?.label ?? "").replace(/[()\s]/g, "");
    const text = String((p as { text?: unknown })?.text ?? "").trim();
    if (label && text) byLabel.set(label, text);
  }
  const idx = answerIndex(sd.correctAnswer ?? q.correctAnswer);
  const order = idx === null ? null : optionTexts(q, sd)[idx];
  if (!given || byLabel.size === 0 || !order) return null;
  const labels = order.match(/[A-Z]/g) ?? [];
  if (labels.length !== byLabel.size || labels.some((l) => !byLabel.has(l))) return null;
  return [given, ...labels.map((l) => byLabel.get(l) as string)].join(" ");
}

/** 표시 마커 걷기: __밑줄__, (A)/(a) 라벨, 원문자, [ ] 괄호 선택지는 앞 것, 빈칸 밑줄 구간. */
export function stripDisplayMarkers(text: string): string {
  return text
    .replace(/\(\s*[①②③④⑤]\s*\)/g, " ")
    .replace(/[①②③④⑤⑥⑦⑧⑨⑩ⓐⓑⓒⓓⓔ]/g, " ")
    .replace(/__\s*\([A-Ea-e]\)\s*/g, "__")
    .replace(/\[([^\]/]+)\/[^\]]+\]/g, "$1")
    .replace(/__/g, "")
    .replace(/<\/?u>/g, "")
    .replace(/\*\*/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim();
}

/** SENTENCE_INSERT: 「① …」 마커 본문에 주어진 문장을 정답 마커 자리에 넣고 마커를 지운다. */
export function reconstructSentenceInsert(q: SiblingQuestion): string | null {
  if (q.subType !== "SENTENCE_INSERT") return null;
  const sd = readObject(q.structuredData);
  const body = typeof sd?.passageWithMarkers === "string" ? sd.passageWithMarkers : "";
  const given = typeof sd?.givenSentence === "string" ? sd.givenSentence.trim() : "";
  const idx = answerIndex(sd?.correctAnswer ?? q.correctAnswer);
  if (!body || !given || idx === null) return null;
  const marker = new RegExp(`\\(?\\s*${CIRCLED[idx]}\\s*\\)?`);
  if (!marker.test(body)) return null;
  return stripDisplayMarkers(body.replace(marker, ` ${given} `));
}

/** IRRELEVANT: 정답(무관한) 문장을 빼고 마커를 지운다. */
export function reconstructIrrelevant(q: SiblingQuestion): string | null {
  if (q.subType !== "IRRELEVANT") return null;
  const sd = readObject(q.structuredData);
  const body = typeof sd?.passageWithNumbers === "string" ? sd.passageWithNumbers : "";
  const sentences = Array.isArray(sd?.sentences) ? (sd?.sentences as unknown[]).map(String) : [];
  const idx = answerIndex(sd?.correctAnswer ?? q.correctAnswer);
  if (!body || idx === null || !sentences[idx]) return null;
  const stripped = stripDisplayMarkers(body);
  const target = stripDisplayMarkers(sentences[idx]);
  if (!stripped.includes(target)) return null;
  return stripped.replace(target, " ").replace(/\s+/g, " ").trim();
}

/** BLANK_INFERENCE: 빈칸 구간을 정답 선지로 채운다. */
export function reconstructBlank(q: SiblingQuestion): string | null {
  if (q.subType !== "BLANK_INFERENCE") return null;
  const sd = readObject(q.structuredData);
  const body = typeof sd?.passageWithBlank === "string" ? sd.passageWithBlank : "";
  const idx = answerIndex(sd?.correctAnswer ?? q.correctAnswer);
  const fill = idx === null || !sd ? "" : optionTexts(q, sd)[idx] ?? "";
  if (!body || !fill || !/_{3,}/.test(body)) return null;
  return stripDisplayMarkers(body.replace(/_{3,}/, fill.trim()));
}

/** 그 밖 마커 본문의 표시만 걷은 근사본(어법·어휘 오답 낱말이 남을 수 있어 검토 전용). */
export function approximateFromMarkers(q: SiblingQuestion): string | null {
  const sd = readObject(q.structuredData);
  if (!sd) return null;
  for (const field of ["passageWithUnderline", "passageWithMarkers", "passageWithNumbers"]) {
    const v = sd[field];
    if (typeof v === "string" && v.trim().length > 80) return stripDisplayMarkers(v);
  }
  return null;
}

/** 형제 문항 하나 → 가능한 재구성 전부(신뢰도 높은 것 먼저). */
export function reconstructionsFromSibling(q: SiblingQuestion): Reconstruction[] {
  const out: Reconstruction[] = [];
  const push = (source: ReconstructionSource, content: string | null) => {
    if (content && content.trim().length >= 40) out.push({ source, fromQuestionId: q.id, content });
  };
  push("reassembly", reassembleSentenceOrder(q));
  push("reconstruction", reconstructSentenceInsert(q));
  push("reconstruction", reconstructIrrelevant(q));
  push("reconstruction", reconstructBlank(q));
  if (out.length === 0) push("approximate", approximateFromMarkers(q));
  return out;
}

function wordTokens(s: string): string[] {
  return s.toLowerCase().replace(/[’‘]/g, "'").match(/[a-z0-9']+|[가-힣]+/g) ?? [];
}

function commonTokens(ta: string[], tb: string[]): number {
  const count = new Map<string, number>();
  for (const t of ta) count.set(t, (count.get(t) ?? 0) + 1);
  let common = 0;
  for (const t of tb) {
    const n = count.get(t) ?? 0;
    if (n > 0) {
      common += 1;
      count.set(t, n - 1);
    }
  }
  return common;
}

/** 낱말 다중집합 겹침(0~1, 긴 쪽 기준) — 검토 목록용 근접도. 대소문자·구두점 무시. */
export function tokenSimilarity(a: string, b: string): number {
  const ta = wordTokens(a);
  const tb = wordTokens(b);
  if (!ta.length || !tb.length) return 0;
  return commonTokens(ta, tb) / Math.max(ta.length, tb.length);
}

/**
 * target 낱말 중 text 에 들어 있는 비율(0~1, target 기준 재현율). 발문이 지시문·보기로 길어져도 떨어지지 않는다 —
 * 「이 문항 글이 target 지문을 담고 있나」 판정용(evidence.ts).
 */
export function tokenRecall(text: string, target: string): number {
  const tt = wordTokens(target);
  if (!tt.length) return 0;
  return commonTokens(wordTokens(text), tt) / tt.length;
}
