// ============================================================================
// 시험지 인쇄 「준비 완료」 판정 도구 — 순수 DOM · 비동기 헬퍼.
//
// 「지금 인쇄를 호출해도 되는가」를 **관측 가능한 조건**으로만 정의한다. 인쇄 컨트롤러
// (use-exam-print-controller.ts) · e2e 스냅숏 · 원격 측정이 같은 판정식을 쓴다.
//
// 준비 완료 조건 6가지(readinessGaps 가 못 채운 것을 돌려준다):
//   fonts        시험지 글꼴 400·700 이 fonts.check 로 참(로딩 중 아님) — **시험지 글꼴 면만** 본다.
//                전역 document.fonts.status 는 보지 않는다: 무관한 UI 글꼴(Pretendard CDN)이 늦거나 막히면
//                status 가 영영 loading 이라, 그것을 보면 빠른 경로 · 가드 측정을 통째로 잃는다(26-09-30 PRINT-R1).
//   pages       루트 안 모든 본문 프레임([data-exam-page-index])이 .exam-a4-page 를 가진다(전 쪽 마운트)
//   guard        넘침 가드 isSettled() 가 참
//   images       루트 안 img 가 전부 complete
//   primary-root document.getElementById('exam-paper-print-root') === 내 루트(포털이 옮길 대상이 나)
//   visible      탭이 보이는 상태
// pages · primary-root 는 **차단 조건**이다 — 끝내 못 채우면 print() 를 부르지 않는다(백지 · 엉뚱한
// 시험지를 찍느니 안 찍는다). 나머지는 상한까지 기다린 뒤 플래그를 남기고 인쇄한다.
//
// ⚠ PRINT_BUDGETS 의 시간은 전부 「실패 상한」이다. 준비 판정에 시간 추측(50/120/600ms 대기 뒤
//   인쇄)을 쓰지 않는다 — 조건이 참이 되는 순간 진행하고, 상한은 끝내 참이 안 될 때 멈추는 데만 쓴다.
// ============================================================================

export const EXAM_FONT_FAMILY = "Malgun Gothic Exam";
export const EXAM_PRINT_ROOT_ID = "exam-paper-print-root";
/** 인쇄될 쪽 프레임(표지 · 본문 · 정답표) */
export const EXAM_PAGE_FRAME_SELECTOR = ".exam-preview-page-frame";
/** 지연 마운트되는 본문 쪽 프레임 */
export const EXAM_BODY_FRAME_SELECTOR = "[data-exam-page-index]";
/** 프레임 안에 실제로 그려진 용지 */
export const EXAM_PAGE_SELECTOR = ".exam-a4-page";

/** 실패 상한(ms) — 대기 시간이 아니다. 조건이 먼저 참이 되면 그 즉시 진행한다. */
export const PRINT_BUDGETS = Object.freeze({
  fonts: 8000,
  guard: 4000,
  images: 3000,
  primaryRoot: 1000,
});

// 한글 · 라틴 · 숫자 · 원문자를 모두 품은 표본 — 글꼴 면이 unicode-range 로 쪼개져도 필요한 면을 본다.
const FONT_PROBE_TEXT = "가A1①";

export type ReadinessGap = "fonts" | "pages" | "guard" | "images" | "primary-root" | "visible";
/** 끝내 못 채우면 print() 를 막는 조건 */
export const BLOCKING_GAPS: readonly ReadinessGap[] = ["pages", "primary-root"];

export interface ExamPrintRootInspection {
  /** 인쇄될 쪽 프레임 수(표지 · 본문 · 정답표) */
  frames: number;
  /** 그중 .exam-a4-page 를 가진 프레임 수 */
  mountedFrames: number;
  /** 본문(지연 마운트) 프레임 수 */
  bodyFrames: number;
  mountedBodyFrames: number;
  /** .exam-a4-page 가 없는 본문 프레임의 쪽 인덱스(오름차순) */
  missing: number[];
  /** 루트 안 complete=false 인 img 수 */
  imagesPending: number;
}

export interface ReadinessSnapshot {
  fontsReady: boolean;
  inspection: ExamPrintRootInspection | null;
  guardSettled: boolean;
  primaryRoot: boolean;
  visible: boolean;
}

/** 못 채운 조건 목록(비었으면 지금 바로 인쇄해도 된다). 루트가 없으면 pages 로 친다. */
export function readinessGaps(s: ReadinessSnapshot): ReadinessGap[] {
  const gaps: ReadinessGap[] = [];
  if (!s.fontsReady) gaps.push("fonts");
  if (!s.inspection || s.inspection.missing.length > 0 || s.inspection.bodyFrames !== s.inspection.mountedBodyFrames) {
    gaps.push("pages");
  }
  if (!s.guardSettled) gaps.push("guard");
  if (s.inspection && s.inspection.imagesPending > 0) gaps.push("images");
  if (!s.primaryRoot) gaps.push("primary-root");
  if (!s.visible) gaps.push("visible");
  return gaps;
}

export function blockingGaps(gaps: readonly ReadinessGap[]): ReadinessGap[] {
  return gaps.filter((gap) => BLOCKING_GAPS.includes(gap));
}

function examFontSpec(weight: 400 | 700): string {
  return `${weight} 16px "${EXAM_FONT_FAMILY}"`;
}

/** 문서의 시험지 글꼴 면(globals.css @font-face 400·700). 글꼴 API 가 없거나 순회할 수 없으면 빈 목록. */
export function examFontFaces(doc: Document = document): FontFace[] {
  const faces: FontFace[] = [];
  try {
    doc.fonts?.forEach((face) => {
      if (face.family.replace(/^["']|["']$/g, "") === EXAM_FONT_FAMILY) faces.push(face);
    });
  } catch {
    // 판정 불가 — 빈 목록(막지 않는다)
  }
  return faces;
}

/**
 * 시험지 글꼴 면이 지금 내려받는 중인가. 넘침 가드가 「대체 글꼴로 잰 값」을 버리는 기준이다.
 * 시험지 조판(a4-paper-page · 인쇄 CSS)의 글꼴 스택은 시험지 글꼴 → 시스템 맑은 고딕 → sans-serif 라
 * 다른 웹 글꼴(Pretendard 등)은 칸 높이에 영향이 없다 — 그래서 전역 status 가 아니라 이 면들만 본다.
 */
export function examFontsLoading(doc: Document = document): boolean {
  return examFontFaces(doc).some((face) => face.status === "loading");
}

/**
 * 시험지 글꼴 면 중 내려받기에 실패한 것(404 · 차단 → FontFace.status 'error')이 있는가 — 원격 측정 fonts:'error'
 * 라벨 전용(PRINT-R8). Chromium 은 실패한 면에 fonts.check 가 거짓이라 준비 경로의 ensureExamFonts 가 'error' 를
 * 돌려주지만, check 가 참을 돌려주는 엔진에서도 빠른 경로가 'loaded' 로 거짓 보고하지 않게 면 상태를 직접 본다.
 */
export function examFontsFailed(doc: Document = document): boolean {
  return examFontFaces(doc).some((face) => face.status === "error");
}

/**
 * 시험지 글꼴이 지금 쓸 수 있는가. 400·700 면을 fonts.check 로 직접 확인한다 — check 는 그 글꼴 면만
 * 본다(내려받는 중 · 아직 요청 전이면 거짓). 전역 fonts.status 는 보지 않는다(무관한 UI 글꼴이 걸리면
 * 영영 loading — PRINT-R1). 글꼴 API 가 없는 환경은 판정할 수 없으므로 막지 않는다.
 */
export function examFontsReady(doc: Document = document): boolean {
  const fonts = doc.fonts;
  if (!fonts) return true;
  try {
    return (
      fonts.check(examFontSpec(400), FONT_PROBE_TEXT) && fonts.check(examFontSpec(700), FONT_PROBE_TEXT)
    );
  } catch {
    return true;
  }
}

/** 한 프레임 양보 — rAF 와 setTimeout 50 의 경주(백그라운드 탭에서 rAF 가 멈춰도 진행한다). */
export function nextFrame(win: Window = window): Promise<void> {
  return new Promise((resolve) => {
    let done = false;
    let raf = 0;
    const finish = () => {
      if (done) return;
      done = true;
      if (raf) win.cancelAnimationFrame?.(raf);
      win.clearTimeout(timer);
      resolve();
    };
    const timer = win.setTimeout(finish, 50);
    raf = win.requestAnimationFrame?.(finish) ?? 0;
  });
}

/** promise 와 상한의 경주. 상한이 먼저 오면 `null`. 이긴 쪽이 정해지면 타이머를 치운다. */
export function withCap<T>(promise: Promise<T>, capMs: number, win: Window = window): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = win.setTimeout(() => resolve(null), capMs);
    promise.then(
      (value) => {
        win.clearTimeout(timer);
        resolve(value);
      },
      () => {
        win.clearTimeout(timer);
        resolve(null);
      },
    );
  });
}

/** 시험지 글꼴 준비 결과 — loaded · timeout(상한 안에 안 옴) · error(글꼴 파일 404 · 차단 — 기다려도 안 온다) */
export type ExamFontsOutcome = "loaded" | "timeout" | "error";

/**
 * 시험지 글꼴 400·700 을 명시적으로 불러오고(fonts.load) **그 면들만** 기다린다 — 상한과 경주.
 * fonts.ready(문서 전체)는 기다리지 않는다: 무관한 UI 글꼴이 걸려 있으면 영영 풀리지 않는다(PRINT-R1).
 * 불러오기가 거부되면(404 · 차단) 즉시 'error' — 상한까지 기다리지 않고 대체 글꼴로 인쇄한다.
 */
export async function ensureExamFonts(
  capMs: number = PRINT_BUDGETS.fonts,
  doc: Document = document,
  win: Window = window,
): Promise<ExamFontsOutcome> {
  const fonts = doc.fonts;
  if (!fonts || examFontsReady(doc)) return "loaded";
  let expired = false;
  const work = (async (): Promise<ExamFontsOutcome> => {
    try {
      await Promise.all([
        fonts.load(examFontSpec(400), FONT_PROBE_TEXT),
        fonts.load(examFontSpec(700), FONT_PROBE_TEXT),
      ]);
    } catch {
      return "error";
    }
    // load 가 끝났는데 아직 참이 아니면(같은 면을 다른 요청이 다시 부르는 중 등) 시험지 면의 loaded 만 기다린다.
    while (!examFontsReady(doc)) {
      if (expired) return "timeout";
      const faces = examFontFaces(doc);
      if (faces.some((face) => face.status === "error")) return "error";
      const loading = faces.filter((face) => face.status === "loading");
      if (loading.length > 0) await Promise.all(loading.map((face) => face.loaded.catch(() => undefined)));
      else await nextFrame(win);
    }
    return "loaded";
  })();
  const result = await withCap(work, capMs, win);
  expired = true;
  return result ?? "timeout";
}

/** 인쇄 루트 실측 — 프레임 · 마운트 · 누락 쪽 · 미완료 이미지. */
export function inspectExamPrintRoot(root: ParentNode): ExamPrintRootInspection {
  let frames = 0;
  let mountedFrames = 0;
  let bodyFrames = 0;
  let mountedBodyFrames = 0;
  const missing: number[] = [];
  root.querySelectorAll<HTMLElement>(EXAM_PAGE_FRAME_SELECTOR).forEach((frame) => {
    frames += 1;
    const mounted = frame.querySelector(EXAM_PAGE_SELECTOR) !== null;
    if (mounted) mountedFrames += 1;
    if (frame.hasAttribute("data-exam-page-index")) {
      bodyFrames += 1;
      if (mounted) mountedBodyFrames += 1;
      else missing.push(Number(frame.getAttribute("data-exam-page-index")));
    }
  });
  missing.sort((a, b) => a - b);
  return {
    frames,
    mountedFrames,
    bodyFrames,
    mountedBodyFrames,
    missing,
    imagesPending: pendingImages(root).length,
  };
}

export function pendingImages(root: ParentNode): HTMLImageElement[] {
  return Array.from(root.querySelectorAll<HTMLImageElement>("img")).filter((img) => !img.complete);
}

/** 포털(usePrintPortal)이 getElementById 첫 매칭을 옮기므로, 그게 내 루트여야 내 시험지가 찍힌다. */
export function isPrimaryPrintRoot(root: HTMLElement | null, doc: Document = document): boolean {
  return !!root && doc.getElementById(EXAM_PRINT_ROOT_ID) === root;
}

export function isDocumentVisible(doc: Document = document): boolean {
  return doc.visibilityState !== "hidden";
}

/**
 * 문서 load 가 아직 안 끝났나 — 이때 부른 print() 는 Chromium · Gecko · WebKit 모두 load 뒤로 미룬다(사건 없이 즉시
 * 반환). 무관한 UI 글꼴(CDN)이 느리면 이 창이 길어진다(26-09-30 XB-1). readyState 가 없는 환경은 끝난 것으로 본다.
 */
export function isDocumentLoadPending(doc: Document = document): boolean {
  return doc.readyState === "loading" || doc.readyState === "interactive";
}

/**
 * 문서 load 사건이 **끝난 다음 태스크**까지 기다린다(이미 끝났으면 즉시). 상한 없음 — 브라우저도 load 전 인쇄를 load 까지
 * 미룬다. 취소된 잡은 load 뒤 isDead 로 멈춘다.
 * 왜 다음 태스크인가: 미뤄진 인쇄는 load 사건과 같은 태스크(Document::CheckCompleted)에서 발화한다 — load 리스너나 거기서
 * 이어진 마이크로태스크에서 print() 를 부르면 아직 로딩 중으로 쳐 또 미뤄진다.
 */
export function waitDocumentLoad(doc: Document = document, win: Window = window): Promise<void> {
  if (!isDocumentLoadPending(doc)) return Promise.resolve();
  return new Promise((resolve) => {
    const onLoad = () => {
      win.removeEventListener("load", onLoad);
      win.setTimeout(resolve, 0);
    };
    win.addEventListener("load", onLoad);
  });
}

/**
 * 루트 안 미완료 이미지를 decode 까지 기다린다 — 상한과 경주. 화면 밖 loading=lazy 이미지는
 * 인쇄 전에는 영영 불러오지 않으므로 eager 로 바꿔 지금 불러오게 한다(인쇄 결과에만 영향).
 */
export async function waitImages(
  root: ParentNode,
  capMs: number = PRINT_BUDGETS.images,
  win: Window = window,
): Promise<"loaded" | "timeout"> {
  const pending = pendingImages(root);
  if (pending.length === 0) return "loaded";
  for (const img of pending) {
    if (img.loading === "lazy") img.loading = "eager";
  }
  const all = Promise.all(
    pending.map((img) =>
      typeof img.decode === "function"
        ? img.decode().catch(() => undefined)
        : new Promise<void>((resolve) => {
            img.addEventListener("load", () => resolve(), { once: true });
            img.addEventListener("error", () => resolve(), { once: true });
          }),
    ),
  );
  await withCap(all, capMs, win);
  return pendingImages(root).length === 0 ? "loaded" : "timeout";
}
