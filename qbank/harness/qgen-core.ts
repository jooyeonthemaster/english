// ============================================================================
// QBANK 0원 게이트 하네스 — 프로덕션 md 레인(parser/gate/adapter/postprocess/quality)을
// 웹 요청 없이 순수 함수로 호출한다. API 호출 0회, 비용 0원.
//
// 이것이 이 프로젝트 경제성의 심장이다. 형식·마커·라벨축·문장보존·번호연속·언어혼입 같은
// 기계 판정 가능 결함을 전량 여기서 차단하고, LLM 검수는 기계가 못 보는 것
// (논리·정답 유일성·미끼 설계·해설 사실성)에만 투입한다.
//
// 불변조건 I2: 저작물은 이 파이프라인과 바이트 호환이어야 한다. 자체 포맷 발명 금지.
// ============================================================================

import { getMdLane as getRegistryLane } from "../../src/lib/md-qgen/lane-registry";
import { getCanonLane, isCanon } from "./canon";
import type { MdLaneContext } from "../../src/lib/md-qgen/lane-types";
import type { MdDifficulty } from "../../src/lib/md-qgen/prompts";
import { resolveQuestionTypeGenerationSettings } from "../../src/lib/question-type-generation-settings";
import { postProcessQuestion } from "../../src/lib/question-postprocess";
import { validateQuestionQuality } from "../../src/lib/question-quality";

/**
 * 레인 조회 — 등록 레인 24종 + 정본 2종(canon.ts 가 라우트 분기를 이식한 래퍼).
 * 이걸로 26유형 전체가 하나의 인터페이스로 통일된다.
 */
function getMdLane(subType: string) {
  return getRegistryLane(subType) ?? getCanonLane(subType);
}
export { isCanon };

// ── 컨테이너 형식 ──────────────────────────────────────────────────────────
// 한 .md 파일 = 한 (지문 × 유형) 유닛 = 문항 5~8개. 문항마다 아래 헤더로 시작한다.
//
//   <!-- ITEM 1
//   difficulty: KILLER
//   point: 인과 기제 — 원인과 결과가 뒤집히는 지점
//   craft: 정답은 3~5문장 재진술의 압축, ②는 방향반대 미끼
//   settings: {"genericOptionCount":5}
//   -->
//   ...레인 마크다운 그대로...
//
// HTML 주석을 구분자로 쓰는 이유: 어떤 레인 파서도 주석을 필드로 줍지 않고,
// 워드/한컴 변환 경로에도 흔적이 남지 않는다.

export interface ItemMeta {
  index: number;
  difficulty: MdDifficulty;
  point: string;
  craft: string;
  settings: Record<string, unknown>;
  raw: Record<string, string>;
}

export interface ParsedItem {
  meta: ItemMeta;
  markdown: string;
}

const ITEM_HEADER = /<!--\s*ITEM\s+(\d+)\s*\n([\s\S]*?)-->/g;

export function splitItems(source: string): { items: ParsedItem[]; errors: string[] } {
  const errors: string[] = [];
  const heads: { index: number; body: string; start: number; end: number }[] = [];
  ITEM_HEADER.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = ITEM_HEADER.exec(source)) !== null) {
    heads.push({ index: Number(m[1]), body: m[2], start: m.index, end: m.index + m[0].length });
  }
  if (heads.length === 0) {
    errors.push("ITEM 헤더가 하나도 없다 — 컨테이너 형식 위반(`<!-- ITEM 1 ... -->`)");
    return { items: [], errors };
  }
  const items: ParsedItem[] = [];
  for (let i = 0; i < heads.length; i += 1) {
    const h = heads[i];
    const nextStart = i + 1 < heads.length ? heads[i + 1].start : source.length;
    const markdown = source.slice(h.end, nextStart).trim();
    const raw: Record<string, string> = {};
    for (const line of h.body.split("\n")) {
      const mm = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.*)$/.exec(line);
      if (mm) raw[mm[1]] = mm[2].trim();
    }
    let settings: Record<string, unknown> = {};
    if (raw.settings) {
      try {
        settings = JSON.parse(raw.settings) as Record<string, unknown>;
      } catch {
        errors.push(`ITEM ${h.index}: settings 가 JSON 이 아니다 — ${raw.settings.slice(0, 60)}`);
      }
    }
    const diff = (raw.difficulty || "INTERMEDIATE").toUpperCase();
    if (!["BASIC", "INTERMEDIATE", "KILLER"].includes(diff)) {
      errors.push(`ITEM ${h.index}: difficulty 가 BASIC|INTERMEDIATE|KILLER 가 아니다 — ${raw.difficulty}`);
    }
    if (!raw.point) errors.push(`ITEM ${h.index}: point(출제 포인트) 누락 — 포인트 다각화 추적 불가`);
    if (!markdown) errors.push(`ITEM ${h.index}: 본문이 비어 있다`);
    if (h.index !== i + 1) errors.push(`ITEM 번호 비연속: ${i + 1} 자리에 ${h.index}`);
    items.push({
      meta: {
        index: h.index,
        difficulty: (["BASIC", "INTERMEDIATE", "KILLER"].includes(diff) ? diff : "INTERMEDIATE") as MdDifficulty,
        point: raw.point || "",
        craft: raw.craft || "",
        settings,
        raw,
      },
      markdown,
    });
  }
  return { items, errors };
}

// ── 컨텍스트 조립 ──────────────────────────────────────────────────────────
export function buildCtx(opts: {
  subType: string;
  passage: string;
  difficulty: MdDifficulty;
  rawTypeSettings?: unknown;
  variantIndex?: number;
  variantCount?: number;
}): MdLaneContext {
  const rawTypeSettings = opts.rawTypeSettings ?? null;
  const resolved = resolveQuestionTypeGenerationSettings(
    opts.subType,
    rawTypeSettings,
    opts.difficulty,
  ) as unknown as Record<string, unknown>;
  return {
    passage: opts.passage,
    difficulty: opts.difficulty,
    rawDifficulty: opts.difficulty,
    resolved,
    rawTypeSettings,
    teacherPoints: [],
    variantIndex: opts.variantIndex ?? 0,
    variantCount: opts.variantCount ?? 1,
  };
}

// ── 프로덕션 저작 프롬프트 재현 ────────────────────────────────────────────
/** 프로덕션 md-stream 이 모델에게 주는 것과 동일한 유형 프롬프트를 반환한다. */
export function buildProductionPrompt(opts: {
  subType: string;
  passage: string;
  difficulty: MdDifficulty;
  rawTypeSettings?: unknown;
  variantIndex?: number;
  variantCount?: number;
}): { ok: true; prompt: string; extras: string[] } | { ok: false; error: string } {
  const lane = getMdLane(opts.subType);
  if (!lane) return { ok: false, error: `UNSUPPORTED_LANE: ${opts.subType} (정본 분기 — 별도 경로 필요)` };
  const ctx = buildCtx(opts);
  try {
    return { ok: true, prompt: lane.buildBasePrompt(ctx), extras: lane.buildExtras(ctx) };
  } catch (e) {
    return { ok: false, error: `프롬프트 조립 실패: ${(e as Error).message}` };
  }
}

// ── 게이트 ─────────────────────────────────────────────────────────────────
export interface ItemGateResult {
  index: number;
  meta: ItemMeta;
  gateIssues: string[];
  corrections: string[];
  adaptOk: boolean;
  adaptError?: string;
  postOk: boolean;
  postError?: string;
  qualityErrors: { code: string; message: string }[];
  qualityWarnings: { code: string; message: string }[];
  structuredData?: Record<string, unknown>;
  /** 정답 유일성·다각화 판정을 위해 뽑아둔 표적 */
  diversityTargets: string[];
}

export interface UnitGateResult {
  subType: string;
  passageId: string;
  gatedAt: string;
  laneSupported: boolean;
  itemCount: number;
  ok: boolean;
  /**
   * 형식 차단 — 프로덕션 md-stream 과 **동일 축**이다(route.ts 는 parsed.gateIssues 하나로만 판정).
   * 여기 걸리면 웹에서도 반려된다. 재저작 필수.
   */
  blocking: { item: number | null; code: string; message: string }[];
  /**
   * 품질 차단 — `validateQuestionQuality` 의 error 들. **프로덕션은 이걸 기록만 하고 통과시킨다.**
   * 우리 기준이 더 높으므로 차단하되, 축을 분리해 둔다:
   *  ① 웹 통과율과 우리 통과율을 혼동하지 않기 위해
   *  ② 이 검증기는 fast 레인 계약 전제라 md 레인에서 설계상 예상된 코드를 낼 수 있어(lane.filterQualityIssues 참조)
   *     유형별로 오탐이 확인되면 축 단위로 강등할 수 있게
   */
  qualityBlocking: { item: number | null; code: string; message: string }[];
  /** 기록만 하는 경고 */
  warnings: { item: number | null; code: string; message: string }[];
  items: ItemGateResult[];
}

/**
 * md 레인에서 **구조적으로 만족 불가능한** 품질 코드 — 저자에게 보여주면 안 된다.
 *
 * `few-key-points`: `validateKillerBar`(question-quality/validators/misc.ts:78-81)가
 * KILLER 문항에 `keyPoints.length >= 3` 을 요구하지만, **md 어댑터 24개 전부가
 * `keyPoints: []` 를 의도적으로 낸다**(정본 `adapter.ts:319-322`).
 * 근거는 26-07-21 실사고다 — 합성 keyPoints 가 모델의 포인트코드 오태깅
 * (전치사 Despite 에 형용사 형부 등)을 학생 표면까지 노출시켰다. 정본 주석은
 * "빈 배열 = 검증기 스킵" 을 의도했으나 검증기가 빈 배열도 위반으로 세어 경고가 남는다.
 * 프로덕션은 md 레인에서 품질 이슈를 차단하지 않으므로 무해했지만
 * (`adapter-conditional-writing.ts:19-21` 에 그렇게 적혀 있다),
 * **우리는 품질 이슈를 저자에게 되먹인다** — 그래서 고칠 수 없는 경고가
 * 재저작 루프를 돌렸다(2027 q20 실측: TITLE·TOPIC·MAIN_IDEA 전부 attempts=2~3,
 * 매 시도 같은 문항 번호에 같은 코드가 재등장).
 *
 * ⚠ 여기에 코드를 추가하려면 **"저자가 어떻게 고쳐도 사라지지 않는다"를 증명**해야 한다.
 *   단지 자주 뜬다는 이유로 넣으면 그것은 게이트 무력화다.
 */
const STRUCTURALLY_UNSATISFIABLE = new Set<string>(["few-key-points"]);

export function gateUnit(opts: {
  subType: string;
  passageId: string;
  passage: string;
  source: string;
  rawTypeSettings?: unknown;
  /** 유형당 최소 문항 수 (티어별) */
  minItems?: number;
}): UnitGateResult {
  const now = new Date().toISOString();
  const blocking: UnitGateResult["blocking"] = [];
  const qualityBlocking: UnitGateResult["qualityBlocking"] = [];
  const warnings: UnitGateResult["warnings"] = [];
  const lane = getMdLane(opts.subType);

  if (!lane) {
    return {
      subType: opts.subType,
      passageId: opts.passageId,
      gatedAt: now,
      laneSupported: false,
      itemCount: 0,
      ok: false,
      blocking: [
        {
          item: null,
          code: "UNSUPPORTED_LANE",
          message: `${opts.subType} 은 lane-registry 에 없다(정본 분기). 이 하네스로는 검증 불가 — 조용한 통과를 막기 위해 차단한다.`,
        },
      ],
      qualityBlocking: [],
      warnings: [],
      items: [],
    };
  }

  const { items, errors } = splitItems(opts.source);
  for (const e of errors) blocking.push({ item: null, code: "CONTAINER", message: e });

  const minItems = opts.minItems ?? 5;
  if (items.length < minItems) {
    blocking.push({
      item: null,
      code: "ITEM_COUNT",
      message: `문항 ${items.length}개 — 최소 ${minItems}개 필요(유형당 하한, 불변조건 I8)`,
    });
  }

  const results: ItemGateResult[] = [];
  const pointSeen = new Map<string, number[]>();

  for (const it of items) {
    const ctx = buildCtx({
      subType: opts.subType,
      passage: opts.passage,
      difficulty: it.meta.difficulty,
      rawTypeSettings: mergeSettings(opts.subType, opts.rawTypeSettings, it.meta.settings),
      variantIndex: it.meta.index - 1,
      variantCount: items.length,
    });

    const r: ItemGateResult = {
      index: it.meta.index,
      meta: it.meta,
      gateIssues: [],
      corrections: [],
      adaptOk: false,
      postOk: false,
      qualityErrors: [],
      qualityWarnings: [],
      diversityTargets: [],
    };

    try {
      const parsed = lane.parseAndGate(it.markdown, ctx);
      r.gateIssues = parsed.gateIssues || [];
      r.corrections = parsed.corrections || [];

      if (r.gateIssues.length === 0) {
        const adapted = lane.adapt(parsed, ctx);
        r.adaptOk = adapted.ok;
        r.adaptError = adapted.error;
        if (adapted.ok && adapted.aiQuestion) {
          const pp = postProcessQuestion(opts.subType as never, opts.passage, adapted.aiQuestion as never);
          r.postOk = pp.success === true;
          r.postError = pp.error;
          if (pp.success && pp.data) {
            const data = pp.data as unknown as Record<string, unknown>;
            r.structuredData = data;
            const issues = validateQuestionQuality({
              typeId: opts.subType as never,
              question: { ...data, difficulty: it.meta.difficulty } as never,
              passage: opts.passage,
              requestedDifficulty: it.meta.difficulty as never,
              ...lane.qualityArgs(ctx),
            } as never) as { code: string; message: string; severity: string }[];
            const filtered = lane.filterQualityIssues
              ? new Set(lane.filterQualityIssues(issues.map((i) => i.code), ctx))
              : null;
            for (const i of issues) {
              if (filtered && !filtered.has(i.code)) continue;
              if (STRUCTURALLY_UNSATISFIABLE.has(i.code)) continue;
              if (i.severity === "error") r.qualityErrors.push({ code: i.code, message: i.message });
              else r.qualityWarnings.push({ code: i.code, message: i.message });
            }
            try {
              r.diversityTargets = lane.diversityTargets(data) || [];
            } catch {
              r.diversityTargets = [];
            }
          }
        }
      }
    } catch (e) {
      r.gateIssues.push(`파이프라인 예외: ${(e as Error).message}`);
    }

    for (const g of r.gateIssues) blocking.push({ item: r.index, code: "GATE", message: g });
    if (r.gateIssues.length === 0 && !r.adaptOk)
      blocking.push({ item: r.index, code: "ADAPT", message: r.adaptError || "어댑터 실패" });
    if (r.adaptOk && !r.postOk)
      blocking.push({ item: r.index, code: "POSTPROCESS", message: r.postError || "후처리 실패" });
    for (const q of r.qualityErrors) qualityBlocking.push({ item: r.index, code: `QUALITY:${q.code}`, message: q.message });
    for (const q of r.qualityWarnings) warnings.push({ item: r.index, code: `QUALITY:${q.code}`, message: q.message });
    for (const c of r.corrections) warnings.push({ item: r.index, code: "AUTOSNAP", message: c });

    const key = normalizePoint(it.meta.point);
    if (key) {
      if (!pointSeen.has(key)) pointSeen.set(key, []);
      pointSeen.get(key)!.push(r.index);
    }

    results.push(r);
  }

  // 출제 포인트 다각화 — 같은 유형 5문항이 같은 포인트를 겨냥하면 존재 이유가 없다.
  for (const [key, idxs] of pointSeen) {
    if (idxs.length > 1) {
      blocking.push({
        item: null,
        code: "POINT_DUPLICATE",
        message: `출제 포인트 중복: "${key}" 가 문항 ${idxs.join(", ")} 에 반복 — 유형 내 포인트는 전부 달라야 한다`,
      });
    }
  }

  // ── 정답 표적 중복 ────────────────────────────────────────────────────────
  //
  // ⚠ `lane.diversityTargets` 를 그대로 중복 판정 축으로 쓰면 안 된다(감독 오류, 파일럿에서 적발).
  //    이 함수의 **의미가 레인마다 다르다**:
  //      TITLE·CONTENT_MATCH·BLANK_INFERENCE → 정답 텍스트
  //      TOPIC                               → 정답 텍스트를 산문으로 감싼 문자열
  //      TOPIC_MAIN_IDEA                     → **미끼**(오답) 텍스트
  //      WORD_ORDER·TOPIC_SENTENCE_WRITING   → modelAnswer
  //      MAIN_IDEA                           → **고정 지시문 상수** ← 전 문항 동일이라 무조건 중복 판정
  //      나머지 다수                          → 빈 배열
  //    실제로 MAIN_IDEA 유닛이 "정답 표적 중복: '같은 지문이므로 논지는 그대로 두되…'" 로
  //    차단됐다. 그 문자열은 정답이 아니라 레인이 프롬프트에 실으려고 만든 안내문이다.
  //
  // → 정답은 structuredData 에서 **직접 도출**한다. diversityTargets 는 보조 신호로만 쓰되
  //   전 문항에서 동일한 값(=안내문)은 버린다.
  // ⚠ 두 번째 함정(파일럿 적발): **선지 텍스트가 위치 마커인 유형이 있다.**
  //    IRRELEVANT 의 options 는 `["①","②","③","④","⑤"]` 이고 correctAnswer 는 `"④"` 다.
  //    문항 1과 4가 둘 다 ④면 "정답 중복"이 아니라 **서로 다른 무관 문장을 우연히 같은 슬롯에
  //    넣은 것**이다 — 위치 기반 유형에서 슬롯 반복은 정답 분산상 오히려 정상이다.
  //    진짜 정체성은 `sentences[irrelevantIndex]`(실제 삽입한 문장)에 있다.
  //
  // → 정체성을 **유형별로 명시**한다. 못 세우면 **차단하지 않는다** —
  //   거짓 차단이 놓친 중복보다 나쁘다(의미 중복은 검수 렌즈 ⑤가 잡는다).
  const isMarkerOnly = (s: string) => /^[①-⑳]$/.test(s) || /^\([A-J]\)$/.test(s) || /^[0-9]{1,2}$/.test(s);

  const subType = opts.subType;
  const answerSurface = (sd: Record<string, unknown> | undefined): string => {
    if (!sd) return "";
    const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : "");

    // ⚠ 세 번째 함정(저작 에이전트가 지적, 감독 확인): **SENTENCE_ORDER 는 givenSentence 로 세면 안 된다.**
    //    이 유형의 주어진 글은 **반드시 지문 맨 앞 조각**이고 1~2문장으로 제한된다
    //    (`gate-order.ts:272,274` 앞부분 유실 금지 + `validators/sentence-order.ts:8` 1~2문장).
    //    즉 가능한 값이 `{S1}` 또는 `{S1+S2}` **두 개뿐**이라, givenSentence 를 정체성으로 쓰면
    //    어떤 지문에서도 유닛당 최대 2문항이 되어 버린다.
    //    형식 계약 §8-B1 이 규정하는 진짜 정체성은 **절단 좌표 조합**이고,
    //    `lane-order.ts:219-221` 의 diversityTargets 가 그 문자열을 정확히 내보낸다.
    //    → 이 유형은 전용 분기로 diversityTargets 를 쓰게 한다.
    if (subType === "SENTENCE_ORDER") {
      return ""; // 정체성은 아래 diversityTargets 경로가 담당(절단 좌표)
    }

    // ① 유형별 전용 정체성 — 선지가 마커인 유형은 반드시 여기서 잡힌다
    if (Array.isArray(sd.sentences) && typeof sd.irrelevantIndex === "number") {
      const s = str((sd.sentences as unknown[])[sd.irrelevantIndex as number]);
      if (s) return s; // IRRELEVANT — 삽입한 무관 문장 자체
    }
    const direct =
      str(sd.givenSentence) || // SENTENCE_INSERT — 빼낸 문장
      str(sd.insertSentence) ||
      str(sd.originalExpression) || // BLANK_INFERENCE / FILL_BLANK_KEY — 빈칸 원문
      str(sd.modelAnswer); // 서술형 — 모범답안
    if (direct) return direct;

    // ② 일반 객관식 — 정답 선지 텍스트. 단 마커뿐이면 정체성이 아니다
    const opts = sd.options;
    const ans = sd.correctAnswer;
    if (Array.isArray(opts) && ans != null) {
      const hit = (opts as Record<string, unknown>[]).find((o) => String(o.label) === String(ans));
      const t = str(hit?.text);
      if (t && !isMarkerOnly(t)) return t;
    }

    // ③ 어법·어휘 — 고침/원형
    const fixes = sd.fixes;
    if (fixes && typeof fixes === "object") {
      const v = Object.values(fixes as Record<string, unknown>).map(str).filter(Boolean);
      if (v.length) return v.join(" | ");
    }

    return ""; // 정체성 불명 → 중복 판정에서 제외
  };

  // 전 문항에서 동일한 diversityTargets 값 = 레인이 내보내는 안내문이므로 축에서 제외한다
  const targetFreq = new Map<string, number>();
  for (const r of results) for (const t of new Set(r.diversityTargets.map(normalizeTarget))) {
    if (t) targetFreq.set(t, (targetFreq.get(t) || 0) + 1);
  }
  const isLaneGuidance = (k: string) => results.length > 1 && targetFreq.get(k) === results.length;

  const targetSeen = new Map<string, number[]>();
  for (const r of results) {
    const keys = new Set<string>();
    const derived = normalizeTarget(answerSurface(r.structuredData));
    if (derived) keys.add(derived);
    for (const t of r.diversityTargets) {
      const k = normalizeTarget(t);
      if (k && !isLaneGuidance(k)) keys.add(k);
    }
    for (const k of keys) {
      if (!targetSeen.has(k)) targetSeen.set(k, []);
      if (!targetSeen.get(k)!.includes(r.index)) targetSeen.get(k)!.push(r.index);
    }
  }
  for (const [k, idxs] of targetSeen) {
    if (idxs.length > 1) {
      blocking.push({
        item: null,
        code: "ANSWER_DUPLICATE",
        message: `정답 표적 중복: "${k.slice(0, 60)}" 가 문항 ${idxs.join(", ")} 의 정답 — 같은 답을 두 번 묻는다`,
      });
    }
  }

  return {
    subType: opts.subType,
    passageId: opts.passageId,
    gatedAt: now,
    laneSupported: true,
    itemCount: items.length,
    ok: blocking.length === 0 && qualityBlocking.length === 0,
    blocking,
    qualityBlocking,
    warnings,
    items: results,
  };
}

function mergeSettings(subType: string, base: unknown, itemSettings: Record<string, unknown>): unknown {
  if (!itemSettings || Object.keys(itemSettings).length === 0) return base ?? null;
  const b = (base && typeof base === "object" ? (base as Record<string, unknown>) : {}) as Record<string, unknown>;
  const prev = (b[subType] && typeof b[subType] === "object" ? (b[subType] as Record<string, unknown>) : {}) as Record<
    string,
    unknown
  >;
  return { ...b, [subType]: { ...prev, ...itemSettings } };
}

function normalizePoint(p: string): string {
  return p
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function normalizeTarget(t: string): string {
  return String(t)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}
