// ============================================================================
// 시험지 인쇄 잡 1건의 진행 — React 에 의존하지 않는 상태기계(컨트롤러가 의존성을 주입한다).
//
// 순서(설계 확정안 층 3):
//   0) 남은 포털  지난 인쇄의 #exam-print-host 잔재를 치운다(print-portal-registry — PRINT-R7, 동기)
//   1) 글꼴      examFontsReady() 가 거짓이면 준비 경로 → ensureExamFonts(상한 8초)
//   2) 탭 visible 숨은 탭이면 보일 때까지(상한 없음 — 취소로만 멈춘다)
//   3) 전 쪽 마운트  ensureVisible() → mountAll()  ← 둘 다 flushSync 동기 커밋(컨트롤러 제공)
//   4) 가드 수렴  isGuardSettled() 가 참이 될 때까지 프레임마다(상한 4초)
//   5) 이미지    미완료 img decode(상한 3초) → remeasure() 로 가드에 다시 재게 하고 수렴 대기
//   6) 첫 매칭 루트  isPrimaryPrintRoot(상한 1초)
//   7) 최종 판정  전 쪽 마운트 · 첫 매칭 루트가 아니면 **차단**(print 호출 0, outcome=blocked 기록)
//                 통과하면 기록(outcome=printed) → invokePrint(). 이 순간 넘친 칸을 실측해 overflowColumns 로
//                 싣는다 — 가드가 수렴했는데도 남았으면 guard='stuck'(고칠 수 없는 칸 = 종이에서 잘림, PRINT-R3)
//
// 【빠른 경로】 모든 조건이 처음부터 참이면 위 과정에 await 가 하나도 없다 — async 함수는 첫 await
// 전까지 호출자의 태스크에서 동기로 돈다. 그래서 클릭 태스크 안에서 전 쪽을 그리고 같은 태스크에서
// 인쇄를 호출한다(Safari 사용자 활성화 보존 · 비용은 종전 beforeprint 동기 마운트와 같다).
// 【준비 경로】 조건 하나라도 거짓이면 onPreparing() 으로 「준비 중」을 알리고 한 프레임 양보해
// 페인트한 뒤 조건마다 기다린다. 시간은 **실패 상한**에만 쓴다(PRINT_BUDGETS).
// 매 await 뒤 isDead() 를 확인한다 — 취소 · 언마운트 · 대체된 잡은 절대 인쇄를 호출하지 않는다.
// ============================================================================

import type {
  ExamPrintBlockReason,
  ExamPrintEntry,
  ExamPrintEventMeta,
  ExamPrintFontsOutcome,
  ExamPrintGuardOutcome,
  ExamPrintImagesOutcome,
  ExamPrintMode,
  ExamPrintPath,
  ExamPrintPrior,
} from "@/lib/exams/print-event-meta";
import { findColumnOverflows } from "./column-overflow";
import { settleStalePrintPortal } from "./print-portal-registry";
import {
  PRINT_BUDGETS,
  ensureExamFonts,
  examFontsFailed,
  examFontsReady,
  inspectExamPrintRoot,
  isDocumentVisible,
  isPrimaryPrintRoot,
  nextFrame,
  pendingImages,
  waitImages,
  type ExamPrintRootInspection,
} from "./print-readiness";

export interface ExamPrintJobDeps {
  mode: ExamPrintMode;
  entry: ExamPrintEntry;
  /** 이 잡이 needs-gesture · blocked 뒤의 재시도인가(원격 측정 전용) */
  prior?: ExamPrintPrior | null;
  getRoot: () => HTMLElement | null;
  isGuardSettled: () => boolean;
  /** 전 쪽 마운트(+해설 모드)를 **동기 커밋**한다 — flushSync 로 감싼 setState */
  mountAll: () => void;
  /** 루트가 display:none 인 화면 상태(모바일 문항 단계 등)를 동기로 벗긴다(선택) */
  ensureVisible?: () => void;
  /** 이미지가 자리를 잡은 뒤 가드에 다시 재게 한다 — flushSync 로 감싼 requestMeasure(선택) */
  remeasure?: () => void;
  /** 준비 경로에 들어섰다(처음 한 번만 불린다) */
  onPreparing: () => void;
  /** 취소 · 언마운트 · 대체 — 참이면 즉시 멈추고 인쇄를 호출하지 않는다 */
  isDead: () => boolean;
  /** 원격 측정(fire-and-forget) — 인쇄 호출 직전 또는 차단 시 1회 */
  report: (meta: ExamPrintEventMeta) => void;
  /** 인쇄 호출 — 컨트롤러만 이것을 가진다 */
  invokePrint: () => void;
  env?: { doc?: Document; win?: Window; now?: () => number };
}

export type ExamPrintJobResult =
  | { kind: "printed"; meta: ExamPrintEventMeta }
  | { kind: "blocked"; reason: ExamPrintBlockReason; missing: number[]; meta: ExamPrintEventMeta }
  | { kind: "aborted" };

const ABORTED: ExamPrintJobResult = { kind: "aborted" };

/** 최종 차단 판정 — 루트 없음 · 그려지지 않은 쪽 · 첫 매칭 아님. 통과면 null. */
export function finalBlockReason(
  inspection: ExamPrintRootInspection | null,
  primaryRoot: boolean,
): ExamPrintBlockReason | null {
  if (!inspection) return "no-root";
  if (inspection.missing.length > 0 || inspection.mountedBodyFrames !== inspection.bodyFrames) {
    return "unmounted-pages";
  }
  if (!primaryRoot) return "not-primary-root";
  return null;
}

export async function runExamPrintJob(d: ExamPrintJobDeps): Promise<ExamPrintJobResult> {
  const doc = d.env?.doc ?? document;
  const win = d.env?.win ?? window;
  const now = d.env?.now ?? (() => win.performance.now());
  const startedAt = now();
  let path: ExamPrintPath = "fast";

  // 준비 경로 진입 — 「준비 중」 표시를 한 번 페인트한다. 이후에는 프레임 양보만.
  const yieldFrame = async () => {
    if (path === "fast") {
      path = "prepare";
      d.onPreparing();
    }
    await nextFrame(win);
  };
  // 조건이 참이 될 때까지 프레임마다 확인(상한 = 실패 상한).
  const waitUntil = async (predicate: () => boolean, capMs: number) => {
    const deadline = now() + capMs;
    while (!predicate()) {
      if (d.isDead() || now() >= deadline) return false;
      await yieldFrame();
    }
    return true;
  };

  // 0) 지난 인쇄가 남긴 포털(afterprint 누락 · 주인 없는 #exam-print-host)을 치운다(PRINT-R7). 새 인쇄 요청은
  //    인쇄 사건 밖에서 시작하므로 지금 남은 호스트는 전부 잔재다. 남겨 두면 그 안의 옛 루트가 첫 매칭이 되어
  //    내 루트를 not-primary-root 로 막거나, 고정 호스트가 화면을 덮는다. 동기 · await 없음(빠른 경로 유지).
  settleStalePrintPortal(doc, null);

  // 1) 글꼴
  let fonts: ExamPrintFontsOutcome = "loaded";
  if (!examFontsReady(doc)) {
    await yieldFrame();
    if (d.isDead()) return ABORTED;
    fonts = await ensureExamFonts(PRINT_BUDGETS.fonts, doc, win);
    if (d.isDead()) return ABORTED;
  } else if (examFontsFailed(doc)) {
    // 준비됐다고 답했지만 시험지 글꼴 면이 실패 상태(check 가 실패 면을 참으로 치는 엔진) — 대체 글꼴 인쇄다.
    fonts = "error";
  }

  // 2) 탭 visible — 숨은 탭에서 그리면 rAF 가 멈춰 수렴 확인이 1초 단위로 늘어진다.
  while (!isDocumentVisible(doc)) {
    await yieldFrame();
    if (d.isDead()) return ABORTED;
  }

  // 3) 전 쪽 마운트(동기 커밋 — 같은 커밋 안에서 넘침 가드 layout effect 가 돈다)
  d.ensureVisible?.();
  d.mountAll();
  // 새로 그려진 쪽이 없으면(전 쪽이 이미 래치됨) 가드가 다시 재지 않는다 — 루트가 방금까지
  // display:none 이었다면(빌더 모바일 문항 단계) 마지막 「깨끗함」은 잴 수 없어서 나온 값이다.
  // 지금 레이아웃으로 한 번 재게 한다(넘침이 있으면 같은 동기 체인에서 바로잡힌다).
  d.remeasure?.();
  if (d.isDead()) return ABORTED;

  // 4) 가드 수렴
  let guard: ExamPrintGuardOutcome = "settled";
  const guardDeadline = now() + PRINT_BUDGETS.guard;
  if (!d.isGuardSettled()) {
    const settled = await waitUntil(d.isGuardSettled, PRINT_BUDGETS.guard);
    if (d.isDead()) return ABORTED;
    if (!settled) guard = "timeout";
  }

  // 5) 이미지 — decode 뒤 칸 높이가 바뀌었을 수 있으니 가드에 다시 재게 한다.
  let images: ExamPrintImagesOutcome = "loaded";
  const imageRoot = d.getRoot();
  if (imageRoot && pendingImages(imageRoot).length > 0) {
    await yieldFrame();
    if (d.isDead()) return ABORTED;
    images = await waitImages(imageRoot, PRINT_BUDGETS.images, win);
    if (d.isDead()) return ABORTED;
    if (d.remeasure) {
      d.remeasure();
      if (!d.isGuardSettled()) {
        const remaining = Math.max(guardDeadline - now(), 1000);
        const settled = await waitUntil(d.isGuardSettled, remaining);
        if (d.isDead()) return ABORTED;
        if (!settled) guard = "timeout";
      }
    }
  }

  // 6) 첫 매칭 루트(대화상자 닫힘 애니메이션 중 다른 미리보기와 겹친 경우 등)
  if (!isPrimaryPrintRoot(d.getRoot(), doc)) {
    await waitUntil(() => isPrimaryPrintRoot(d.getRoot(), doc), PRINT_BUDGETS.primaryRoot);
    if (d.isDead()) return ABORTED;
  }

  // 탭이 그새 숨었으면 돌아올 때까지 — 돌아온 뒤 가드가 흔들렸으면 다시 수렴을 기다린다.
  if (!isDocumentVisible(doc)) {
    while (!isDocumentVisible(doc)) {
      await yieldFrame();
      if (d.isDead()) return ABORTED;
    }
    if (!d.isGuardSettled()) {
      const settled = await waitUntil(d.isGuardSettled, PRINT_BUDGETS.guard);
      if (d.isDead()) return ABORTED;
      if (!settled) guard = "timeout";
    }
  }

  // 7) 최종 판정 — 여기서부터 인쇄 호출까지 await 없음(판정한 상태 그대로 인쇄된다).
  const root = d.getRoot();
  const inspection = root ? inspectExamPrintRoot(root) : null;
  const reason = finalBlockReason(inspection, isPrimaryPrintRoot(root, doc));
  // 인쇄될 DOM 의 넘친 칸(가드가 포기한 칸 · 상한으로 못 고친 칸). 인쇄를 막지는 않는다 — 잘린 한 칸 때문에
  // 시험지 전체를 안 찍는 것보다 찍고 드러내는 편이 낫다. 레이아웃은 가드가 방금 재서 깨끗하다(읽기만 한다).
  const overflowColumns = root ? findColumnOverflows(root, {}, false).length : 0;
  if (overflowColumns > 0 && guard === "settled") guard = "stuck";
  const base = {
    entry: d.entry,
    mode: d.mode,
    pages: inspection?.frames ?? 0,
    mountedPages: inspection?.mountedFrames ?? 0,
    prepareMs: Math.max(0, Math.min(600000, Math.round(now() - startedAt))),
    fonts,
    guard,
    path,
    images,
    ...(d.prior ? { prior: d.prior } : {}),
    ...(overflowColumns > 0 ? { overflowColumns } : {}),
  };
  if (reason) {
    const meta: ExamPrintEventMeta = { ...base, outcome: "blocked", blockReason: reason };
    d.report(meta);
    return { kind: "blocked", reason, missing: inspection?.missing ?? [], meta };
  }
  const meta: ExamPrintEventMeta = { ...base, outcome: "printed" };
  d.report(meta);
  d.invokePrint();
  return { kind: "printed", meta };
}
