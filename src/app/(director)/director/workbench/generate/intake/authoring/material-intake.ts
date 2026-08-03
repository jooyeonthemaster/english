"use client";

// ============================================================================
// 자료 투입 어댑터 — 파일/붙여넣기 → DraftMaterial(텍스트) 정규화 + 역할 자동추정
//
// 왜 이 파일이 따로 있나: 드롭존·목록·보드 세 화면이 각자 "자료 초안"을 만들면
// 드래그로 넣은 자료와 붙여넣기로 넣은 자료의 모양이 갈린다. DraftMaterial
// (authoring-types.ts)을 채우는 지점을 여기 하나로 묶어 두 경로가 반드시 같은
// 모양을 내놓게 한다.
//
// 판독 자체는 하지 않는다 — 형식별 판독은 material-readers.readMaterialFile 의
// 몫이다. 여기서는 그 결과를 화면 계약(60,000자 상한·역할·상태)에 맞춰 다듬기만
// 한다. 회귀 방지: 판독 로직을 이 파일로 끌어오지 말 것(서버 라우트를 타는 PDF·
// 사진 경로가 두 벌이 된다).
// ============================================================================

import {
  canSendPages,
  readMaterialFile,
  MAX_SEND_PAGES,
  type MaterialLayout,
} from "@/lib/passage-authoring/material-readers";
import type {
  MaterialRole,
  MaterialSourceKind,
} from "@/lib/passage-authoring/schema";
// 이 파일이 만드는 초안에는 **화면에 그대로 뜨는 한국어**가 셋 있다(진행 라벨·
// 이름 폴백·본문 없음 오류). .ts 라 게이트 ⑤(tsx JSX 한글)에 걸리지 않을 뿐,
// 소유자는 언제나 사전이다 — 손코딩하면 사전 키가 사문이 되고 문구가 갈라진다.
import { AUTHORING_COPY } from "@/lib/wording/passage-authoring-glossary";
import { countWords } from "@/app/(director)/director/workbench/generate/generate-page-types";
import type { DraftMaterial } from "./authoring-types";

/** 자료 본문 상한 — schema.authoringMaterialSchema.content(max 60,000)와 같은 값. */
export const MATERIAL_CONTENT_LIMIT = 60_000;

/**
 * (해소 완료) 한동안 이 타입은 `DraftMaterial & { sendPages·storagePath·… }`
 * 교차 타입이었다 — 타입 정본(authoring-types.DraftMaterial)을 다른 작업 단계가
 * 소유해서 필드를 넣지 못했기 때문이다. 그 임시 조치가 실제 결함을 낳았다:
 * use-authoring-store 의 payload 매핑은 DraftMaterial 만 보므로 하이브리드 필드가
 * 서버에 **한 번도 전달되지 않았다.** 지금은 DraftMaterial 이 전부 갖는다.
 * 별칭은 사용처(use-material-drafts)의 import 를 그대로 두려고 남긴 것이다 —
 * 여기에 필드를 다시 얹지 말고 authoring-types 에 넣을 것.
 */
export type MaterialDraft = DraftMaterial;

// ── 작은 유틸 ───────────────────────────────────────────────────────────────

export function newMaterialId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `mat-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** 60,000자 상한에서 잘라낸다. 잘렸는지도 알려 UI 가 안내할 수 있게 한다. */
export function clampMaterialContent(text: string): {
  content: string;
  truncated: boolean;
} {
  if (text.length <= MATERIAL_CONTENT_LIMIT) {
    return { content: text, truncated: false };
  }
  return { content: text.slice(0, MATERIAL_CONTENT_LIMIT), truncated: true };
}

// ── 형식 추정 (판독 전 아이콘·역할 기본값용) ────────────────────────────────
//
// 판독이 끝나면 readMaterialFile 이 확정한 sourceKind 가 이 값을 덮는다. 여기서는
// 파일을 붙인 "직후 0.1초" 동안 보여줄 그럴듯한 아이콘을 고르는 게 전부다.

const SHEET_EXTS = ["xlsx", "xls", "xlsm", "csv", "tsv", "numbers"];
const DOC_EXTS = ["doc", "docx", "hwp", "hwpx", "odt", "rtf", "pages"];

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : "";
}

export function inferSourceKind(file: File): MaterialSourceKind {
  const ext = extensionOf(file.name);
  const mime = file.type.toLowerCase();
  if (mime === "application/pdf" || ext === "pdf") return "FILE_PDF";
  if (mime.startsWith("image/")) return "FILE_IMAGE";
  if (SHEET_EXTS.includes(ext) || mime.includes("sheet") || mime.includes("excel")) {
    return "FILE_SHEET";
  }
  if (DOC_EXTS.includes(ext) || mime.includes("word") || mime.includes("document")) {
    return "FILE_DOC";
  }
  return "FILE_TEXT";
}

// ── 역할 자동추정 ───────────────────────────────────────────────────────────
//
// 회귀 방지 계약 (실제 사고에서 나왔다 — 한 줄도 되돌리지 말 것)
//  · **라틴 키워드는 반드시 \b 경계 정규식으로 본다.** 경계 없는 includes 는
//    'example'→EXAM_SAMPLE, 'lifestyle'→STYLE_SAMPLE, 'advocate'→VOCABULARY 처럼
//    흔한 영단어 하나로 역할을 통째로 뒤집었다. 영어 지문 자료에는 이 세 단어가
//    거의 반드시 들어 있어서 오탐이 예외가 아니라 기본값이었다.
//  · **한글 키워드만 includes 를 유지한다.** 한국어는 교착어라 '기출문제집'처럼
//    조사·복합어가 붙어 다녀서 경계 개념이 오히려 맞지 않는다.
//  · **우선순위는 EXAM_SAMPLE → GRAMMAR_POINTS → VOCABULARY** 다. 기출 시험지에는
//    '어휘'·'어법'이 늘 함께 인쇄돼 있어서, 시험지를 먼저 집지 않으면 시험지가
//    단어장으로 잡힌다. 그 오분류가 커버리지 패널에 "200개 중 3개(2%)"라는
//    파괴적 거짓 신호를 냈다(선생님은 자료가 무시당했다고 읽는다).
//  · **파일명이 본문보다 강한 신호다.** 파일명은 사람이 붙인 라벨이고 본문 앞머리는
//    우연히 스쳐 지나가는 낱말이다. 예전에는 `name + content.slice(0,400)` 를 한
//    덩어리로 섞어 둘의 무게가 같았다.
//  · **확신이 낮으면 OTHER + uncertain 이다.** 틀린 역할은 없는 역할보다 나쁘다 —
//    역할은 프롬프트의 지시 블록을 통째로 바꾸고(prompts.ts) 커버리지 숫자의
//    분모가 된다. 확신이 없으면 화면이 '역할을 확인해 주세요'라고 말하게 둔다.

interface RoleKeywordSet {
  role: MaterialRole;
  /** 한글 키워드 — 부분일치(includes). */
  ko: readonly string[];
  /** 라틴 키워드 — **정규식 조각**이며 항상 \b 경계로 감싸 쓴다. */
  en: readonly string[];
}

const ROLE_KEYWORDS: readonly RoleKeywordSet[] = [
  {
    role: "EXAM_SAMPLE",
    ko: [
      "기출",
      "모의고사",
      "시험지",
      "수능",
      "학평",
      "모평",
      "내신",
      "중간고사",
      "기말고사",
      "평가원",
      "고사",
      "문항",
      "정답률",
      "학기",
    ],
    en: ["exams?", "mock ?tests?", "csat"],
  },
  {
    role: "GRAMMAR_POINTS",
    ko: ["어법", "문법", "구문"],
    en: ["grammar", "syntax"],
  },
  {
    role: "VOCABULARY",
    ko: ["단어", "어휘", "표제어", "낱말"],
    en: ["voca", "vocabs?", "vocabulary", "word ?lists?", "wordlists?"],
  },
  { role: "STYLE_SAMPLE", ko: ["문체", "스타일"], en: ["style"] },
  {
    role: "TOPIC_BRIEF",
    ko: ["수업", "계획", "요구", "주제", "브리프", "지시"],
    en: [],
  },
];

/** 역할별 라틴 키워드 정규식. 모듈 로드 때 한 번만 만든다(행마다 재컴파일 금지). */
const ROLE_LATIN_PATTERNS: ReadonlyMap<MaterialRole, RegExp> = new Map(
  ROLE_KEYWORDS.filter((set) => set.en.length > 0).map(
    (set) => [set.role, new RegExp(`\\b(?:${set.en.join("|")})\\b`, "iu")] as const,
  ),
);

/** 본문에서 키워드를 훑는 범위. 앞 1,000자면 표지·머리말이 다 들어온다. */
const ROLE_BODY_SCAN = 1_000;

/** 파일명 적중 1회의 무게. 본문 3회와 같다 — 사람이 붙인 라벨이 우선이다. */
const NAME_WEIGHT = 3;
/** 본문 적중 1회의 무게. */
const BODY_WEIGHT = 1;
/** 본문 적중은 3회까지만 센다(한 낱말이 반복돼도 근거가 3배가 되지는 않는다). */
const BODY_HIT_CAP = 3;
/** 이 점수 이상이라야 "확신"이다 = 파일명 1회 또는 본문 3회. */
const CONFIDENT_SCORE = 3;

function keywordHits(text: string, set: RoleKeywordSet): number {
  let hits = 0;
  for (const word of set.ko) {
    if (text.includes(word)) hits += 1;
  }
  const latin = ROLE_LATIN_PATTERNS.get(set.role);
  if (latin && latin.test(text)) hits += 1;
  return hits;
}

export interface MaterialRoleGuess {
  role: MaterialRole;
  /** 확신이 낮다 — 행에 '역할을 확인해 주세요'가 뜨고 사람이 한 번 본다. */
  uncertain: boolean;
}

/**
 * 첨부 직후 즉시 보여줄 역할 추정. 선생님이 칩 하나로 바꿀 수 있으므로 속도가
 * 중요하지만, **틀린 확신은 즉시성보다 비싸다**(위 회귀 방지 계약 참조).
 * roleLocked=true 인 자료에는 절대 적용하지 않는다(사용자 선택이 최우선).
 */
export function guessMaterialRole(input: {
  name: string;
  content: string;
  sourceKind: MaterialSourceKind;
}): MaterialRoleGuess {
  const name = input.name.toLowerCase();
  const body = input.content.slice(0, ROLE_BODY_SCAN).toLowerCase();

  let bestRole: MaterialRole = "OTHER";
  let bestScore = 0;
  // 우선순위 순으로 돌면서 **더 큰 점수일 때만** 갈아치운다 → 동점은 앞선 역할이
  // 이긴다(EXAM_SAMPLE → GRAMMAR_POINTS → VOCABULARY → …).
  for (const set of ROLE_KEYWORDS) {
    const score =
      (keywordHits(name, set) > 0 ? NAME_WEIGHT : 0) +
      Math.min(keywordHits(body, set), BODY_HIT_CAP) * BODY_WEIGHT;
    if (score > bestScore) {
      bestScore = score;
      bestRole = set.role;
    }
  }
  if (bestScore >= CONFIDENT_SCORE) return { role: bestRole, uncertain: false };

  // 여기부터는 낱말이 아니라 **지면의 모양**을 본다. 구조 신호는 스쳐 지나간
  // 낱말 하나보다 세다(그리고 위에서 걸러진 약한 키워드 점수는 버린다).
  if (input.sourceKind === "FILE_SHEET") {
    return { role: "VOCABULARY", uncertain: false };
  }

  const trimmed = input.content.trim();
  if (trimmed) {
    const hangul = (trimmed.match(/[가-힣]/gu) ?? []).length;
    const latin = (trimmed.match(/[A-Za-z]/gu) ?? []).length;
    // 영문이 압도적으로 많고 길면 "참고 지문"으로 본다(외부 지문 투입이 최빈 경로).
    if (latin > hangul * 3 && countWords(trimmed) >= 50) {
      return { role: "SOURCE_PASSAGE", uncertain: false };
    }
    // 짧은 한국어 메모는 브리프일 **가능성**이 클 뿐이다 — 확인을 청한다.
    if (hangul > latin && countWords(trimmed) < 120) {
      return { role: "TOPIC_BRIEF", uncertain: true };
    }
  }
  return { role: "OTHER", uncertain: true };
}

/**
 * 최종 역할 결정 — **판독 라우트의 [[ROLE=…]] 가 휴리스틱을 이긴다.**
 *
 * 그 값은 지면을 실제로 보고 나온 판정이라(read-material/route.ts, 같은 콜의
 * 꼬리줄이라 추가 과금 0) 파일명·낱말 휴리스틱과 급이 다르다. 다만 라우트가
 * OTHER 를 돌려준 것은 "판단하지 않았다"에 가까우므로, 그때만 휴리스틱이 확신할
 * 경우 그 값을 쓴다. roleLocked(선생님이 직접 고름)는 이 함수를 아예 호출하지
 * 않는 것으로 지킨다 — 호출부가 책임진다.
 */
export function resolveMaterialRole(input: {
  name: string;
  content: string;
  sourceKind: MaterialSourceKind;
  /** 판독 라우트가 돌려준 역할([[ROLE=…]]). */
  detectedRole?: MaterialRole;
}): MaterialRoleGuess {
  const detected = input.detectedRole;
  if (detected && detected !== "OTHER") return { role: detected, uncertain: false };
  const guess = guessMaterialRole(input);
  if (detected === "OTHER") {
    return guess.uncertain ? { role: "OTHER", uncertain: true } : guess;
  }
  return guess;
}

/**
 * 원본 페이지 첨부(하이브리드)의 **기본값**. 표·도해가 많은 지면은 텍스트만으로는
 * 뜻이 통하지 않으므로 켜 둔 채로 시작한다. 기본값일 뿐 결정은 언제나 사용자다 —
 * 자료 검토 모달의 표면 스위치로 끄고 켠다(숨은 자동 결정 금지).
 *
 * layout 이 어디서 오는지가 이 함수의 전부다(material-readers.MATERIAL_LAYOUTS):
 *   · 스캔 쪽·사진 → 판독 라우트 꼬리줄 `[[LAYOUT=…]]`
 *   · 텍스트 레이어가 살아 있는 PDF → detectTableLayout(좌표 판정, 호출 0회)
 * 한동안 뒤쪽 경로가 비어 있어서 **표 교재 PDF 가 정확히 반대로 기본 OFF** 였다.
 * 그러니 이 함수를 고치기 전에 "layout 이 실제로 채워지는가"를 먼저 볼 것 —
 * 여기에 sourceKind 별 기본 ON 같은 걸 얹으면 평문 교재까지 원가를 물게 된다.
 *
 * layout 이 undefined 인 경우(꼬리줄도 없고 좌표 판정도 못 한 문서)는 **끈다** —
 * 모르면 돈을 쓰지 않는 쪽이 맞고, 모달 스위치는 layout 과 무관하게 언제나 떠 있다.
 */
export function defaultSendPages(input: {
  layout?: MaterialLayout;
  sourceKind: MaterialSourceKind;
}): boolean {
  if (!canSendPages(input.sourceKind)) return false;
  return input.layout === "TABLE_HEAVY" || input.layout === "DIAGRAM";
}

/** 화면에 적을 "함께 보낼 쪽수" — 문서 전체 쪽수가 아니라 실제로 보낼 수다. */
export function sendablePageCount(pageCount: number | undefined): number {
  if (!pageCount || pageCount <= 0) return 0;
  return Math.min(pageCount, MAX_SEND_PAGES);
}

// ── 변형 지문 제안 ──────────────────────────────────────────────────────────
//
// '참고 지문'과 '변형할 지문'은 프롬프트가 완전히 다르다(전자는 소재만 빌리고,
// 후자는 원문을 알아볼 수 있게 남긴다). 선생님이 지시문에 "내신 대비로 변형해
// 주세요"라고 적어 놓고 역할은 참고 지문 그대로 두는 일이 흔한데, 그러면 원문
// 흔적이 사라진 지문이 나와 시험범위와 어긋난다. 지시문의 신호로 **제안**한다 —
// roleLocked 자료는 건드리지 않는다.

const VARY_INSTRUCTION_PATTERN =
  /(변형|재구성|비틀|바꿔\s*(써|주|만들)|내신|시험\s*범위|교과서\s*지문)/u;

/** 지시문이 "이 지문을 변형해 달라"고 말하고 있는가. */
export function instructionAsksVariation(instruction: string): boolean {
  return VARY_INSTRUCTION_PATTERN.test(instruction);
}

/**
 * 이 자료의 역할을 SOURCE_TO_VARY 로 올릴까? 올릴 이유가 없으면 null.
 * (참고 지문 + 지시문의 변형 신호일 때만 — 그 외에는 손대지 않는다.)
 */
export function suggestVariationRole(
  material: { role: MaterialRole; roleLocked: boolean },
  instruction: string,
): MaterialRole | null {
  if (material.roleLocked) return null;
  if (material.role !== "SOURCE_PASSAGE") return null;
  return instructionAsksVariation(instruction) ? "SOURCE_TO_VARY" : null;
}

// ── 초안 생성 ───────────────────────────────────────────────────────────────

/** 파일을 붙인 직후 화면에 즉시 뜨는 초안 (판독 전이므로 READING). */
export function createFileDraft(file: File): MaterialDraft {
  const sourceKind = inferSourceKind(file);
  const guess = guessMaterialRole({ name: file.name, content: "", sourceKind });
  return {
    id: newMaterialId(),
    role: guess.role,
    roleUncertain: guess.uncertain,
    roleLocked: false,
    name: file.name,
    sourceKind,
    content: "",
    note: "",
    status: "READING",
    progressLabel: AUTHORING_COPY.MATERIAL.reading,
    bytes: file.size,
    file,
  };
}

/** 텍스트를 직접 붙여넣은 자료 — 판독할 게 없으니 바로 READY. */
export function createTextDraft(text: string, name?: string): MaterialDraft {
  const { content } = clampMaterialContent(text.trim());
  const fallbackName = content.replace(/\s+/gu, " ").slice(0, 24).trim();
  const guess = guessMaterialRole({
    name: name ?? "",
    content,
    sourceKind: "TEXT",
  });
  return {
    id: newMaterialId(),
    role: guess.role,
    roleUncertain: guess.uncertain,
    roleLocked: false,
    name:
      name?.trim() ||
      (fallbackName ? `${fallbackName}…` : AUTHORING_COPY.MATERIAL.pastedName),
    sourceKind: "TEXT",
    content,
    note: "",
    status: "READY",
  };
}

// ── 판독 ────────────────────────────────────────────────────────────────────

export interface MaterialReadOutcome {
  content: string;
  sourceKind: MaterialSourceKind;
  /** 60,000자 상한에 걸려 뒷부분이 잘렸는지. */
  truncated: boolean;
  /** 판독기가 남긴 주의(예: "앞 20쪽만 읽었습니다"). */
  warning?: string;
  /** 판독 라우트가 지면을 보고 판정한 역할([[ROLE=…]]). 휴리스틱보다 우선한다. */
  role?: MaterialRole;
  /** 지면 형태([[LAYOUT=…]]) — 하이브리드 첨부 기본값의 근거. */
  layout?: MaterialLayout;
  /** 원본 페이지 수(PDF=쪽수, 사진=1). */
  pageCount?: number;
}

/** 자료를 뺐거나 화면을 떠났을 때 판독을 끊었는지. */
export function isMaterialReadAborted(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
}

/**
 * 파일 1개를 텍스트로 판독한다. 실패는 예외로 던지고, 메시지는 선생님이 읽고 바로
 * 다음 행동을 할 수 있는 한국어 한 문장이어야 한다(FAILED 카드에 그대로 뜬다).
 *
 * signal 은 반드시 readMaterialFile 까지 흘려보낸다 — 판독기는 배치 루프마다
 * throwIfAborted 로 이 신호를 확인하도록 만들어져 있어서, 여기서 끊어야 자료를
 * 뺀 뒤에도 남은 PDF 배치 콜이 계속 나가 레이트리밋을 스스로 먹는 일이 없다.
 */
export async function readMaterialDraft(
  file: File,
  onProgress?: (label: string) => void,
  signal?: AbortSignal,
): Promise<MaterialReadOutcome> {
  const result = await readMaterialFile(file, { onProgress, signal });
  const { content, truncated } = clampMaterialContent(result.content.trim());
  if (!content) {
    throw new Error(AUTHORING_COPY.TOAST.materialNoText);
  }
  return {
    content,
    sourceKind: result.sourceKind,
    truncated,
    warning: result.warning,
    role: result.role,
    layout: result.layout,
    pageCount: result.pageCount,
  };
}
