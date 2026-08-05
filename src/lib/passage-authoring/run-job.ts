// ============================================================================
// AI 지문 생성 — 실행 오케스트레이션 (after() 안에서 도는 백그라운드 본체)
//
// 왜 라우트에서 분리했는가:
//   POST 라우트는 "잡을 만들고 크레딧을 잡고 즉시 응답한다"까지만 책임진다.
//   실제 N편 생성은 after() 로 응답 뒤에 이어지므로, 라우트 파일 안에 두면
//   응답 경로와 백그라운드 경로가 한 파일에서 뒤엉켜 회귀를 만들기 쉽다.
//
// 이 파일이 지키는 계약(회귀 방지):
//   1) 절대 예외를 밖으로 던지지 않는다. after() 안이라 아무도 못 잡고,
//      잡은 PROCESSING 인 채 좀비가 된다(리퍼가 10분 뒤 FAILED+전액환불).
//   2) 한 편이 끝날 때마다 잡 row 를 갱신한다(점진 저장). 폴링 클라이언트가
//      실시간으로 카드를 채우고, 함수가 중간에 죽어도 완성분은 DB 에 남는다.
//   3) 잡 갱신은 직렬화한다(promise chain 뮤텍스). 동시성 3으로 돌기 때문에
//      마지막 쓰기가 이전 스냅샷을 덮어 완성분을 되돌리는 사고를 막는다.
//   4) 실패한 편도 자리를 비우지 않는다 — status:"FAILED" + 한국어 사유로
//      items 에 남겨 "몇 번째가 왜 실패했는지"가 UI 에서 보이게 한다.
//   5) 실패 편수만큼만 부분 환불한다. 환불 실패는 크레딧 유실이므로 반드시
//      console.error 로 흔적을 남긴다.
//   6) **런 단위로 한 번만 정하는 것들**(nonce · 편별 골격 배분 · 페이지 이미지)은
//      워커 풀이 돌기 전에 확정한다. 편마다 다시 만들면 최대 60,000자 자료 블록의
//      프리픽스가 콜마다 갈라져 같은 자료를 편수만큼 풀가로 태운다(캐시 소멸).
//   7) 페이지 이미지 조달은 **절대 실행을 죽이지 않는다.** 스토리지가 흔들려도
//      텍스트 판독본은 그대로 있으므로, 조달 실패는 로그만 남기고 0장으로 간다.
//      쪽 예산은 **자료 간 공정 배분**이다(선착순 금지 — 첫 자료가 총량을 다 먹어
//      두 번째 자료가 0장이 되던 사고). 총 쪽 수·바이트 상한은 그대로라 원가 불변.
//   8) 배치 후처리(편 간 중복 검사)와 조달 경고(0장이 된 자료)는 모델 호출 0회이고
//      **차단하지 않는다.** item.warnings 에 표시만 하고, 크레딧·환불 판정에는
//      전혀 관여하지 않는다.
// ============================================================================

import { randomBytes } from "node:crypto";

import type { Prisma } from "@prisma/client";

import { CREDIT_COSTS } from "@/lib/credit-costs";
import { refundCredits } from "@/lib/credits";
import { runAuthoringGeneration } from "@/lib/passage-authoring/generate";
// 조달은 이 파일의 module-private 함수였다 — 그래서 생중계 레인이 이미지를 실을
// 방법이 없었다(stream/route.ts 의 부적격 사유 ②). 지금은 두 레인이 같은 한 벌을
// 쓴다(page-images.ts 머리 주석). 여기로 되돌리지 말 것.
import {
  emptyProcuredPageImages,
  procurePageImages,
  type ProcuredPageImages,
} from "@/lib/passage-authoring/page-images";
import {
  assignSkeletons,
  authoringSkeletonSeed,
  selectAuthoringMaterialsWithBudget,
} from "@/lib/passage-authoring/prompts";
import {
  AUTHORING_CONCURRENCY,
  REFUND_CHECK_MARK,
  type AuthoringJobResult,
  type AuthoringRequest,
  type AuthoringResultItem,
  type PassageSkeleton,
} from "@/lib/passage-authoring/schema";
import { recordAiCost } from "@/lib/platform-api-costs";
import { prisma } from "@/lib/prisma";

// ── 예산·동시성 상수 ────────────────────────────────────────────────────────

/**
 * 실행 전체 마감 예산(ms). 라우트 maxDuration=300s 벽보다 50s 앞서 끊어,
 * 남은 시간에 "마지막 잡 갱신 + 부분 환불"까지 반드시 완주하게 한다.
 */
export const AUTHORING_RUN_BUDGET_MS = 250_000;

// 동시 생성 편수(AUTHORING_CONCURRENCY)는 schema.ts 가 소유한다 — 이 값은 서버의
// 워커 수이자 클라이언트 ETA 계산의 분모이기 때문이다. 여기 모듈 로컬로 두면
// 클라이언트가 "편수 × 편당 시간"으로 계산해 6편에서 실제의 약 3배를 부른다.

/** 다음 편에 넘길 "이미 만든 본문" 스냅샷 최대 개수 — 프롬프트 비대 방지. */
const AVOID_SNAPSHOT_LIMIT = 4;

/** 지문 N편의 총 크레딧. 라우트(선차감 게이트)와 이 파일이 같은 식을 공유한다. */
export function authoringCreditCost(count: number): number {
  return CREDIT_COSTS.PASSAGE_AUTHORING * Math.max(1, count);
}

// ── 내부 유틸 ───────────────────────────────────────────────────────────────

/** 도메인 타입 → Prisma Json 저장 경계(optional 필드 때문에 직접 대입 불가). */
function toJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

/** 시간 예산 초과로 생성 자체를 시작하지 못한 경우. */
class AuthoringDeadlineError extends Error {
  constructor() {
    super("authoring deadline exceeded");
    this.name = "AuthoringDeadlineError";
  }
}

/**
 * 사용자에게 그대로 보여줄 한국어 실패 사유.
 *
 * ⚠️ 원문(raw)을 문구에 **절대 붙이지 않는다**. 이 값은 잡 result.item.error 와
 * job.errorMessage 에 저장돼 결과 카드·진행 카드·작업 큐 설명에 그대로 렌더되는데,
 * ai-sdk APICallError 의 message 는 게이트웨이 응답 본문(벤더명·모델 id·잔액 상태
 * "This request requires more credits…")을 담는다. 그게 학원 선생님 화면에 영어로
 * 뜨면 우리 인프라가 노출되고, 선생님은 자기 크레딧 문제로 오해해 충전 문의를 한다.
 * 디버깅용 원문은 호출부가 console.error 로만 남긴다.
 */
function toUserErrorMessage(err: unknown): string {
  if (err instanceof AuthoringDeadlineError) {
    return "생성 시간이 초과됐습니다. 편수를 줄이거나 다시 시도해주세요.";
  }
  const raw = err instanceof Error ? err.message.trim() : "";
  if (!raw) return "지문 생성에 실패했습니다. 잠시 후 다시 시도해주세요.";
  if (/timeout|deadline|abort|etimedout|econnreset/i.test(raw)) {
    return "생성 시간이 초과됐습니다. 편수를 줄이거나 다시 시도해주세요.";
  }
  if (/rate.?limit|too many requests|429|quota|overload/i.test(raw)) {
    return "지금 요청이 몰려 있습니다. 잠시 후 다시 시도해주세요.";
  }
  if (/schema|json|parse|validation|invalid.*response|no object generated/i.test(raw)) {
    return "결과 형식이 올바르지 않아 이 편을 만들지 못했습니다. 다시 시도해주세요.";
  }
  return "지문 생성에 실패했습니다. 잠시 후 다시 시도해주세요.";
}

/**
 * 환불 실패 표식. 환불은 크레딧 잔액에 대한 사실 주장이라, 실패를 로그에만 남기면
 * 화면은 "환불되었습니다"라고 말하는데 잔액은 줄어든 채로 남는다(CS 대응 불가).
 * 잡 errorMessage 에 흔적을 남겨 사용자·운영 양쪽에서 보이게 한다.
 *
 * ⚠️ **정본은 schema.ts 다** — 이 파일은 re-export 만 한다.
 * 이 파일은 최상단에서 `node:crypto`·prisma·supabase 서비스 클라이언트를 끌어오므로
 * `"use client"` 인 authoring-store-io 가 여기서 import 하면 빌드가 깨진다. 그래서
 * 한동안 클라이언트가 같은 문자열을 손코딩했고, 판정이 두 벌로 갈라져 "돌려드려요"와
 * "환불 확인이 필요해요"가 같은 밴드에 동시에 뜨는 사고가 났다. zod 만 import 하는
 * 순수 계약 파일(schema.ts)에 정본을 두면 서버·클라이언트가 같은 값을 읽는다.
 * re-export 를 지우지 말 것 — 이 모듈을 쓰던 서버 호출부의 import 경로가 그대로다.
 */
export { REFUND_CHECK_MARK };

/** 환불이 실패했을 때 잡 errorMessage 뒤에 표식을 덧댄다(실패해도 무해). */
async function markRefundNeedsCheck(jobId: string): Promise<void> {
  try {
    const row = await prisma.workbenchAiJob.findUnique({
      where: { id: jobId },
      select: { errorMessage: true },
    });
    const base = (row?.errorMessage ?? "").trim();
    if (base.includes(REFUND_CHECK_MARK)) return;
    await prisma.workbenchAiJob.update({
      where: { id: jobId },
      data: {
        errorMessage: base ? `${base} ${REFUND_CHECK_MARK}` : REFUND_CHECK_MARK,
      },
    });
  } catch (err) {
    console.error(
      `[PASSAGE-AUTHORING] refund-check mark failed (job=${jobId}):`,
      err instanceof Error ? err.message : err,
    );
  }
}

/** 실패 편도 결과 배열에서 자리를 지킨다 — 지표·커버리지는 0으로 채운다. */
function buildFailedItem(
  jobId: string,
  index: number,
  message: string,
): AuthoringResultItem {
  return {
    id: `${jobId}-${index}`,
    index,
    status: "FAILED",
    title: "",
    passage: "",
    koreanSummary: "",
    rationale: "",
    topicLabel: "",
    metrics: {
      words: 0,
      sentences: 0,
      avgSentenceWords: 0,
      longestSentenceWords: 0,
      paragraphs: 0,
      targetDeltaPercent: 0,
      // STEP 5 에서 늘어난 기계성 지표 5종. 실패 편은 본문이 없으므로 전부 0 이다
      // (null 로 두면 UI 가 "기출 범위 벗어남"으로 오독한다 — 0 은 표시 대상 자체가
      // 없다는 뜻으로 status:"FAILED" 와 함께 읽힌다).
      sentenceLengthCv: 0,
      sentenceSpanWords: 0,
      shortestSentenceWords: 0,
      connectiveDensity: 0,
      nominalRatioPercent: 0,
    },
    coverage: { words: [], grammarPoints: [], wordCoveragePercent: null },
    usedMaterialIds: [],
    error: message,
  };
}

/**
 * 잡 result 에 싣는 요청 스냅샷. 자료 본문은 절대 통째로 넣지 않는다(잡 row
 * 비대 → 폴링 응답 egress 폭증). 미리보기 200자만 남긴다.
 *
 * skeletons/charsSent 가 여기 들어가는 이유: 스튜디오를 다시 열어 복구된 실행은
 * items 만으로 되살아나는데, 그러면 "어떤 골격으로 몇 자를 실어 만든 결과인지"가
 * 기본값으로 되살아나 결과 카드가 거짓말을 한다. charsSent 는 generate.ts 와
 * **같은 함수**(selectAuthoringMaterialsWithBudget)로 계산하므로 구조적으로
 * 어긋날 수 없다(자료 선별·클리핑 단일 진실원 계약).
 */
function buildRequestSnapshot(
  request: AuthoringRequest,
  extra: {
    skeletons: ReadonlyArray<PassageSkeleton>;
    /** 실제로 원본 페이지가 함께 실린 자료 id. */
    pagedMaterialIds: ReadonlySet<string>;
  },
): NonNullable<AuthoringJobResult["request"]> {
  const charsSent = new Map(
    selectAuthoringMaterialsWithBudget(request.materials).map((entry) => [
      entry.material.id,
      { sent: entry.sentChars, total: entry.totalChars },
    ]),
  );
  return {
    instruction: request.instruction,
    spec: request.spec,
    count: request.count,
    skeletons: [...extra.skeletons],
    materials: request.materials.map((m) => ({
      id: m.id,
      role: m.role,
      name: m.name,
      sourceKind: m.sourceKind,
      note: m.note,
      preview: m.content.slice(0, 200),
      sendPages: extra.pagedMaterialIds.has(m.id),
      // 예산에 들지 못한 자료는 "0자 실림"이 사실이다 — 필드를 비우면 UI 가
      // "모르겠다"와 "안 실렸다"를 구분하지 못한다.
      charsSent: charsSent.get(m.id) ?? { sent: 0, total: m.content.length },
    })),
  };
}

// ── 배치 후처리: 편 간 중복 검사 (모델 호출 0회 · 차단 없음) ─────────────────
//
// "소재 다르게"를 켜도 같은 자료에서 6편을 뽑으면 실제로는 같은 이야기가 세 번
// 나온다 — 그런데 편마다 독립 호출이라 아무도 그걸 알아채지 못한다(avoidTexts 는
// 완료 순서상 뒤 편에만 걸리고, 동시성 3이라 같은 웨이브끼리는 서로를 못 본다).
// 여기서 배치 전체를 한 번에 훑어 사실만 적어 둔다. **재생성하지 않는다** —
// 자동 재생성은 크레딧·부분 환불 계약과 얽혀 별도 정책 결정이 필요하다.

/** 상위 내용어 추출에서 뺄 기능어·범용어. 4자 미만은 애초에 후보가 아니다. */
const OVERLAP_STOPWORDS: ReadonlySet<string> = new Set([
  "that", "this", "these", "those", "with", "from", "have", "here", "there",
  "they", "them", "their", "then", "than", "when", "what", "which", "while",
  "where", "will", "would", "could", "should", "must", "been", "being", "does",
  "done", "each", "even", "ever", "every", "some", "same", "such", "also",
  "into", "over", "under", "about", "because", "before", "after", "again",
  "against", "between", "during", "through", "without", "within", "often",
  "much", "many", "more", "most", "less", "least", "only", "other", "others",
  "still", "thus", "upon", "very", "were", "well", "make", "makes", "made",
  "take", "takes", "like", "just", "both", "however", "therefore", "rather",
  "whether", "cannot", "become", "becomes", "something", "someone", "itself",
  "themselves", "another", "always", "never", "once", "long", "little",
]);

interface OverlapFingerprint {
  index: number;
  topicLabel: string;
  contentWords: Set<string>;
  properNouns: Set<string>;
  skeleton: string;
}

/** 빈도 상위 내용어 집합. 동점은 사전순으로 끊어 같은 입력이면 항상 같은 결과다. */
function topContentWords(text: string, limit = 30): Set<string> {
  const counts = new Map<string, number>();
  for (const token of text.toLowerCase().match(/[a-z][a-z'-]{3,}/g) ?? []) {
    const word = token.replace(/[^a-z]+$/, "");
    if (word.length < 4 || OVERLAP_STOPWORDS.has(word)) continue;
    counts.set(word, (counts.get(word) ?? 0) + 1);
  }
  const ranked = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .slice(0, limit)
    .map(([word]) => word);
  return new Set(ranked);
}

/**
 * 고유명사 어근. 문장 첫 토큰은 건너뛴다 — 대문자만으로는 문두의 평범한 단어와
 * 구분되지 않기 때문이다(문두의 진짜 고유명사를 놓치는 대신 오탐을 0으로 둔다).
 */
function properNounStems(text: string): Set<string> {
  const out = new Set<string>();
  for (const sentence of text.split(/(?<=[.!?])\s+/)) {
    const tokens = sentence.trim().split(/\s+/);
    for (let i = 1; i < tokens.length; i += 1) {
      const bare = (tokens[i] ?? "")
        .replace(/[’']/g, "")
        .replace(/^[^A-Za-z]+/, "")
        .replace(/[^A-Za-z]+$/, "");
      if (!/^[A-Z][A-Za-z]{2,}$/.test(bare)) continue;
      const stem = bare.toLowerCase().replace(/s$/, "");
      if (stem.length < 3 || OVERLAP_STOPWORDS.has(stem)) continue;
      out.add(stem);
    }
  }
  return out;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const value of a) if (b.has(value)) shared += 1;
  return shared / (a.size + b.size - shared);
}

const normalizeLabel = (value: string) =>
  value.replace(/\s+/g, "").replace(/[·・.,]/g, "").toLowerCase();

/** "지문 1·3" — 경고 문구에서 상대 편을 가리키는 표기. */
const peerLabel = (indexes: number[]) =>
  `지문 ${indexes.map((index) => index + 1).join("·")}`;

/** 소재·어휘·고유명사·골격이 겹치는 편에 표시용 경고를 단다(차단 없음). */
function annotateBatchOverlap(items: AuthoringResultItem[]): void {
  const prints: OverlapFingerprint[] = items
    .filter((item) => item.status === "OK" && item.passage)
    .map((item) => ({
      index: item.index,
      topicLabel: normalizeLabel(item.topicLabel ?? ""),
      contentWords: topContentWords(item.passage),
      properNouns: properNounStems(item.passage),
      skeleton: (item.plan?.skeleton ?? "").trim().toUpperCase(),
    }));
  if (prints.length < 2) return;

  const byIndex = new Map(items.map((item) => [item.index, item]));
  const skeletonCounts = new Map<string, number>();
  for (const print of prints) {
    if (!print.skeleton) continue;
    skeletonCounts.set(
      print.skeleton,
      (skeletonCounts.get(print.skeleton) ?? 0) + 1,
    );
  }

  for (const self of prints) {
    const sameLabel: number[] = [];
    const partialLabel: number[] = [];
    const similar: Array<{ index: number; percent: number }> = [];
    const sharedNames = new Map<number, string[]>();

    for (const other of prints) {
      if (other.index === self.index) continue;

      if (self.topicLabel && other.topicLabel) {
        if (self.topicLabel === other.topicLabel) {
          sameLabel.push(other.index);
        } else if (
          self.topicLabel.length >= 2 &&
          other.topicLabel.length >= 2 &&
          (self.topicLabel.includes(other.topicLabel) ||
            other.topicLabel.includes(self.topicLabel))
        ) {
          partialLabel.push(other.index);
        }
      }

      const score = jaccard(self.contentWords, other.contentWords);
      if (score > 0.25) {
        similar.push({ index: other.index, percent: Math.round(score * 100) });
      }

      const names = [...self.properNouns]
        .filter((stem) => other.properNouns.has(stem))
        .sort();
      if (names.length > 0) sharedNames.set(other.index, names);
    }

    const warnings: string[] = [];
    if (sameLabel.length) {
      warnings.push(`${peerLabel(sameLabel.sort((a, b) => a - b))}과 소재 라벨이 같아요`);
    }
    if (partialLabel.length) {
      warnings.push(`${peerLabel(partialLabel.sort((a, b) => a - b))}과 소재가 겹쳐요`);
    }
    if (similar.length) {
      similar.sort((a, b) => a.index - b.index);
      const worst = Math.max(...similar.map((entry) => entry.percent));
      warnings.push(
        `${peerLabel(similar.map((entry) => entry.index))}과 핵심어가 ${worst}% 겹쳐요`,
      );
    }
    if (sharedNames.size) {
      const peers = [...sharedNames.keys()].sort((a, b) => a - b);
      const names = [...new Set([...sharedNames.values()].flat())].slice(0, 3);
      warnings.push(`${peerLabel(peers)}과 같은 고유명사를 써요 (${names.join(", ")})`);
    }
    const skeletonCount = self.skeleton
      ? (skeletonCounts.get(self.skeleton) ?? 0)
      : 0;
    if (skeletonCount > 1) {
      warnings.push(`골격 ${self.skeleton}을 ${skeletonCount}편이 함께 써요`);
    }

    if (warnings.length === 0) continue;
    const item = byIndex.get(self.index);
    if (!item) continue;
    item.warnings = [...(item.warnings ?? []), ...warnings];
  }
}

// ── 실행 본체 ───────────────────────────────────────────────────────────────

export interface RunAuthoringJobArgs {
  jobId: string;
  academyId: string;
  staffId: string;
  request: AuthoringRequest;
  creditTxId: string;
}

export async function runAuthoringJob(args: RunAuthoringJobArgs): Promise<void> {
  const { jobId, academyId, request, creditTxId } = args;
  const count = request.count;
  const deadlineAt = Date.now() + AUTHORING_RUN_BUDGET_MS;

  // ── 런 단위로 한 번만 정하는 것들 ────────────────────────────────────────
  // ① nonce: 자료 마커의 추측 불가능성이 인젝션 방어의 본체다. 편마다 새로 만들면
  //    최대 60,000자 자료 블록의 프리픽스가 콜마다 갈라져 Gemini implicit prefix
  //    cache 가 통째로 무효화되고, 같은 자료를 편수만큼 풀가로 태운다.
  // ② 골격: 배치 전체를 봐야 "반박형(S2/S7)이 절반을 넘지 않는다"를 강제할 수 있다.
  //    편별로 독립 계산하면 그 상한을 걸 자리가 없다.
  const nonce = randomBytes(6).toString("hex");
  // 씨앗은 회전의 **시작점**만 옮긴다 — 배치 안의 다양화(반박형 상한 포함)는 그대로다.
  // 없으면 count=1 발주가 언제나 S1 로 고정된다(회전표 0번).
  const skeletons = assignSkeletons(
    count,
    request.diversify,
    request.spec,
    authoringSkeletonSeed(request),
  );

  // 편별 결과 자리. index 를 그대로 슬롯으로 써 완료 순서와 무관하게 순서를 지킨다.
  const slots: Array<AuthoringResultItem | null> = Array.from(
    { length: count },
    () => null,
  );
  // 완료 순서대로 쌓이는 본문 — 다음 편 시작 시 스냅샷을 떠 반복을 회피한다.
  const completedTexts: string[] = [];

  // ── 잡 갱신 직렬화 뮤텍스 ────────────────────────────────────────────────
  // 동시성 3의 갱신이 겹치면 늦게 도착한 옛 스냅샷이 최신 items 를 덮는다.
  // 체인에 태워 한 번에 하나씩만 쓰고, 각 태스크는 스스로 예외를 삼킨다.
  let persistChain: Promise<void> = Promise.resolve();
  const enqueue = (task: () => Promise<void>): Promise<void> => {
    persistChain = persistChain
      .catch(() => {})
      .then(async () => {
        try {
          await task();
        } catch (err) {
          console.error(
            `[PASSAGE-AUTHORING] job update failed (job=${jobId}):`,
            err instanceof Error ? err.message : err,
          );
        }
      });
    return persistChain;
  };

  const collect = (): AuthoringResultItem[] =>
    slots.filter((item): item is AuthoringResultItem => item !== null);

  // 조달·스냅샷은 워커 풀보다 먼저 확정한다. 스냅샷의 sendPages 는 "켜 달라고
  // 했는가"가 아니라 "실제로 실렸는가"를 말해야 하므로 조달 결과를 기다린다.
  // ⚠️ 아래 두 구간은 메인 try 블록 **밖**이다 — 계약 1(after() 밖으로 예외 금지)을
  //    지키려면 각자 스스로 삼켜야 한다. 조달이 깨져도 이미지 0장으로, 스냅샷이
  //    깨져도 request 없이 계속 간다(둘 다 생성 자체를 막을 이유가 없다).
  let paged: ProcuredPageImages = emptyProcuredPageImages();
  try {
    paged = await procurePageImages({
      logTag: `job=${jobId}`,
      academyId,
      materials: request.materials,
      // 상한이 편수로 갈린다 — 이 레인은 1~6편을 모두 태우므로 반드시 실제 편수를
      // 넘긴다(1편이면 20쪽, 2편 이상이면 4쪽. page-images.maxPageImagesFor).
      count: request.count,
    });
  } catch (procureErr) {
    console.error(
      `[PASSAGE-AUTHORING] page image procurement aborted (job=${jobId}):`,
      procureErr instanceof Error ? procureErr.message : procureErr,
    );
  }

  let snapshot: AuthoringJobResult["request"];
  try {
    snapshot = buildRequestSnapshot(request, {
      skeletons,
      pagedMaterialIds: paged.pagedMaterialIds,
    });
  } catch (snapshotErr) {
    console.error(
      `[PASSAGE-AUTHORING] request snapshot failed (job=${jobId}):`,
      snapshotErr instanceof Error ? snapshotErr.message : snapshotErr,
    );
    snapshot = undefined;
  }

  const persistProgress = () =>
    enqueue(async () => {
      const items = collect();
      const payload: AuthoringJobResult = { items, request: snapshot };
      await prisma.workbenchAiJob.update({
        where: { id: jobId },
        data: {
          successCount: items.filter((i) => i.status === "OK").length,
          failedCount: items.filter((i) => i.status === "FAILED").length,
          // resultCount = 지금까지 판정이 끝난 편 수(성공+실패). 진행률 분자가
          // 아니라 "결과 배열 길이"라는 다른 도메인과 동일한 의미로 쓴다.
          resultCount: items.length,
          result: toJson(payload),
        },
      });
    });

  try {
    // ── 한 편 실행 ─────────────────────────────────────────────────────────
    const runOne = async (index: number): Promise<void> => {
      try {
        if (Date.now() >= deadlineAt) throw new AuthoringDeadlineError();

        // diversify 일 때만 "이미 만든 본문"을 회피 목록에 얹는다. 끄면 같은
        // 소재를 여러 각도로 반복하는 게 의도이므로 회피시키면 안 된다.
        const avoidTexts = [
          ...request.avoidTexts,
          ...(request.diversify
            ? completedTexts.slice(-AVOID_SNAPSHOT_LIMIT)
            : []),
        ];

        const generated = await runAuthoringGeneration({
          request,
          index,
          avoidTexts,
          deadlineAt,
          skeleton: skeletons[index],
          nonce,
          pageImages: paged.images,
        });

        slots[index] = {
          id: `${jobId}-${index}`,
          index,
          status: "OK",
          ...generated.item,
        };
        completedTexts.push(generated.item.passage);

        // 원가 기록은 편 단위. 실패해도 결과를 잃지 않도록 슬롯 확정 뒤에 둔다.
        try {
          await recordAiCost({
            sourceType: "AI_INTERACTIVE",
            sourceDetail: "passage-authoring",
            academyId,
            model: generated.modelId,
            operationType: "PASSAGE_AUTHORING",
            usage: generated.usage,
            metadata: { jobId, index, count, pageImages: paged.images.length },
          });
        } catch (costErr) {
          console.error(
            `[PASSAGE-AUTHORING] recordAiCost failed (job=${jobId}, index=${index}):`,
            costErr instanceof Error ? costErr.message : costErr,
          );
        }
      } catch (err) {
        console.error(
          `[PASSAGE-AUTHORING] passage failed (job=${jobId}, index=${index}):`,
          err instanceof Error ? err.message : err,
        );
        slots[index] = buildFailedItem(jobId, index, toUserErrorMessage(err));
      }
      await persistProgress();
    };

    // ── 동시성 워커 풀(AUTHORING_CONCURRENCY) ──────────────────────────────
    let cursor = 0;
    const worker = async (): Promise<void> => {
      for (;;) {
        const index = cursor;
        cursor += 1;
        if (index >= count) return;
        await runOne(index);
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(AUTHORING_CONCURRENCY, count) }, worker),
    );

    // 방어: 어떤 이유로든 비어 있는 자리는 실패로 메운다(자리를 비우지 않는다).
    for (let i = 0; i < count; i += 1) {
      if (!slots[i]) {
        slots[i] = buildFailedItem(
          jobId,
          i,
          "지문 생성이 완료되지 못했습니다. 다시 시도해주세요.",
        );
      }
    }

    const items = collect();

    // 조달 경고(페이지 예산·불러오기 실패)를 결과에 싣는다. 런 단위 사실이지만
    // 경고를 그리는 자리가 편별 결과 카드뿐이라 전 편에 같은 줄을 붙인다 —
    // 어느 카드를 열든 "원본 페이지가 빠진 채 만들어졌다"가 보여야 한다.
    // 스냅샷의 sendPages 는 사실대로 false 지만, 화면의 스위치는 켜진 채 남아
    // "원본도 함께 보내요"라고 말하므로 그것만으로는 어긋남이 드러나지 않는다.
    for (const warning of paged.warnings) {
      for (const item of items) {
        item.warnings = [...(item.warnings ?? []), warning];
      }
    }

    // 배치 후처리 — 표시용 경고만 단다. 실패해도 결과에는 아무 영향이 없어야
    // 하므로 통째로 감싼다(경고 계산이 잡을 죽이는 일은 있을 수 없다).
    try {
      annotateBatchOverlap(items);
    } catch (overlapErr) {
      console.error(
        `[PASSAGE-AUTHORING] overlap annotation failed (job=${jobId}):`,
        overlapErr instanceof Error ? overlapErr.message : overlapErr,
      );
    }

    const success = items.filter((i) => i.status === "OK").length;
    const failed = items.length - success;
    const status =
      success === 0 ? "FAILED" : failed > 0 ? "PARTIAL" : "COMPLETED";
    const firstError = items.find((i) => i.status === "FAILED")?.error ?? null;

    await enqueue(async () => {
      const payload: AuthoringJobResult = { items, request: snapshot };
      await prisma.workbenchAiJob.update({
        where: { id: jobId },
        data: {
          status,
          successCount: success,
          failedCount: failed,
          resultCount: items.length,
          result: toJson(payload),
          completedAt: new Date(),
          errorMessage: failed > 0 ? firstError : null,
        },
      });
    });

    // ── 부분 환불 ──────────────────────────────────────────────────────────
    // 실패한 편수 × 편당 단가만 돌려준다. 전편 실패면 자연히 전액이 된다.
    if (failed > 0) {
      try {
        await refundCredits(
          academyId,
          "PASSAGE_AUTHORING",
          creditTxId,
          `AI 지문 생성 실패 ${failed}편 환불`,
          CREDIT_COSTS.PASSAGE_AUTHORING * failed,
        );
      } catch (refundErr) {
        // 환불 실패 = 크레딧 유실. 추적 가능하게 로그를 남기고, 화면이 "환불됐다"고
        // 단언하지 않도록 잡에도 표식을 남긴다.
        console.error(
          `[PASSAGE-AUTHORING] refund FAILED (academy=${academyId}, tx=${creditTxId}, failed=${failed}):`,
          refundErr instanceof Error ? refundErr.message : refundErr,
        );
        await markRefundNeedsCheck(jobId);
      }
    }
  } catch (err) {
    // 여기까지 왔다면 오케스트레이션(DB 등) 자체가 깨진 것 — after() 밖으로는
    // 절대 던지지 않고 잡을 종결시킨다.
    console.error(
      `[PASSAGE-AUTHORING] run aborted (job=${jobId}):`,
      err instanceof Error ? err.message : err,
    );
    const succeeded = slots.filter((s) => s?.status === "OK").length;
    const unpaid = count - succeeded;
    try {
      await prisma.workbenchAiJob.update({
        where: { id: jobId },
        data: {
          status: succeeded > 0 ? "PARTIAL" : "FAILED",
          successCount: succeeded,
          failedCount: unpaid,
          completedAt: new Date(),
          errorMessage: toUserErrorMessage(err),
        },
      });
    } catch (updateErr) {
      console.error(
        `[PASSAGE-AUTHORING] final job update failed (job=${jobId}):`,
        updateErr instanceof Error ? updateErr.message : updateErr,
      );
    }
    // 만들지 못한 편수만 환불한다. 이미 부분 환불이 나갔더라도 refundCredits 가
    // 원 거래 잔여분으로 캡을 씌우므로 과환불은 발생하지 않는다.
    if (unpaid > 0) {
      try {
        await refundCredits(
          academyId,
          "PASSAGE_AUTHORING",
          creditTxId,
          `AI 지문 생성 중단 ${unpaid}편 환불`,
          CREDIT_COSTS.PASSAGE_AUTHORING * unpaid,
        );
      } catch (refundErr) {
        console.error(
          `[PASSAGE-AUTHORING] abort refund FAILED (academy=${academyId}, tx=${creditTxId}, unpaid=${unpaid}):`,
          refundErr instanceof Error ? refundErr.message : refundErr,
        );
        await markRefundNeedsCheck(jobId);
      }
    }
  }
}
