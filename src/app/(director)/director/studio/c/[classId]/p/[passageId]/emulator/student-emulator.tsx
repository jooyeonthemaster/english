"use client";

// ============================================================================
// 클래스 스튜디오 — 학생 화면 에뮬레이터 (docs/class-studio-spec.md §3.6)
//
// 디렉터가 배포 전에 학생이 받게 될 실물을 조작해 본다. 데이터는
// getStudioEmulatorPlan(실서빙과 동일 조립 plan-server) 단일 경로 — "실제 배포와
// 동일한 문제" 보증은 이 경로가 담보한다. 행 탭 시 실제 학생 플레이어
// StudyPlayerClient 를 harness(무전송) 모드로 마운트해 판정·재도전·요약까지
// 실동작하고 서버 기록은 0이다.
//
// 기술 함정 3개 처리(전부 이 파일·emulator.css 에 봉인):
//  (a) 플레이어 루트 h-dvh → 스케일 래퍼가 실기기 px 고정 높이를 갖고,
//      emulator.css 의 `.studio-emu-viewport .gd-app { height:100% !important }`
//      가 프레임 높이에 가둔다.
//  (b) 플레이어의 fixed 요소(질문 시트·나가기 시트)가 브라우저 전체로 탈출
//      → 스케일 래퍼에 transform: scale() 을 **항상**(scale=1 이어도) 걸어
//      containing block 을 만들어 프레임 안에 가둔다.
//  (c) gd-* 스타일은 /g 레이아웃 전용 gd.css 소유 — 디렉터 번들에 없으므로
//      여기서 직접 import 해 플레이어·허브가 스타일을 입게 한다(dev 하네스
//      src/app/dev/worksheet-study/layout.tsx 와 같은 관용구).
//
// 2026-08-10 감사 수리(L4-07·L2-05·L5-06 / L5-07 / L4-18·L5-14 / L2-07 / L5-09):
//  · 학습지 제목은 **현재 지문 제목 기준**으로 조립한다. 서버 액션이 내려주는
//    report.title 은 분석 리포트 제목(부분 분석에서는 "지문 분석" 같은 값)이라
//    학생이 실제로 받을 과제명과 다르다 — 캡션이 "실제 배포와 동일"이라 단언하는
//    화면의 첫 줄이 거짓이 된다. 배포 다이얼로그의 과제명 규칙(§3.4
//    `[지문제목] {모듈} 학습`)을 그대로 재현해 두 표면을 한 문장으로 묶는다.
//  · 허브 재현 충실도: 실제 허브(src/app/g/w/[taskId]/hub-client.tsx)의 헤더
//    (뒤로가기·학습지 라벨·제목)·진행 히어로(0/N·미터·시작 CTA)·단계 행·하단
//    유틸까지 같은 구조/타이포/간격으로 미러한다. 실값이 없는 항목(D-Day·선생님
//    안내문·정답률)은 **가짜 값을 만들지 않고 생략**한다.
//  · 사용 가능 모듈 0이면 프레임을 320px 컴팩트로 줄이고(거대 빈 상자 금지)
//    캡션도 그 상태의 문장으로 바꾼다 — 문항 0인데 "동일" 주장 금지.
//  · 내용이 프레임보다 길면 하단 그라데이션 페이드 + 셰브런으로 스크롤 단서를
//    준다(잘린 글자가 "고장난 화면"으로 읽히던 증상).
// ============================================================================

import "@/app/g/gd.css";
import "./emulator.css";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  BarChart3,
  BatteryFull,
  ChevronDown,
  ChevronRight,
  FileText,
  Loader2,
  Play,
  ScanSearch,
  Smartphone,
  Tablet,
  Wifi,
} from "lucide-react";
import { getStudioEmulatorPlan } from "@/actions/studio/deploy";
import { STUDIO_MODULE_BY_ID, type StudioModuleId } from "@/lib/studio/modules";
import { StudyPlayerClient } from "@/components/worksheet-study/player-client";
import type { StudyStage } from "@/lib/worksheet-study/types";

// ── 디바이스 프레임 정의 (내용부 실기기 px — 패널 폭에 맞춰 scale 축소) ──────
const DEVICES = {
  phone: { label: "폰", width: 390, height: 720 },
  tablet: { label: "태블릿", width: 768, height: 1000 },
} as const;
type DeviceKind = keyof typeof DEVICES;

/** 패널 실측 전 기본 폭 — 우측 레일(420px) 안쪽 내용 폭 근사 */
const FALLBACK_PANEL_WIDTH = 388;

/** 분석 전(사용 가능 모듈 0) 컴팩트 프레임 높이 — 실기기 px */
const EMPTY_FRAME_HEIGHT = 320;

/** 상태바(28) + 상하 베젤(12) + 숨 쉴 여유(8) — 프레임 자체가 먹는 세로 크롬 */
const FRAME_CHROME = 48;

/** 스크롤 조상 탐색 — 에뮬은 xl 레일(max-h+overflow)과 xl 미만 시트 둘 다에 산다 */
function findScrollParent(el: HTMLElement | null): HTMLElement | null {
  let node = el?.parentElement ?? null;
  while (node && node !== document.body) {
    const oy = getComputedStyle(node).overflowY;
    if (oy === "auto" || oy === "scroll") return node;
    node = node.parentElement;
  }
  return null;
}

interface EmuPlan {
  planHash: string;
  stages: StudyStage[];
}

/**
 * getStudioEmulatorPlan 의 stages 는 unknown[] — StudyStage 최소 판별
 * (id·title·items 배열)을 통과한 것만 안전 캐스팅한다.
 */
function asStudyStages(raw: unknown[]): StudyStage[] {
  const out: StudyStage[] = [];
  for (const v of raw) {
    if (
      v !== null &&
      typeof v === "object" &&
      typeof (v as { id?: unknown }).id === "string" &&
      typeof (v as { title?: unknown }).title === "string" &&
      Array.isArray((v as { items?: unknown }).items)
    ) {
      out.push(v as StudyStage);
    }
  }
  return out;
}

export function StudentEmulator(props: {
  passageId: string;
  title: string;
  readyModules: StudioModuleId[];
  selectedModules: StudioModuleId[];
  refreshKey: string;
}): React.ReactElement {
  const { passageId, title, readyModules, selectedModules, refreshKey } = props;

  const [device, setDevice] = useState<DeviceKind>("phone");
  const [plan, setPlan] = useState<EmuPlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryTick, setRetryTick] = useState(0);
  /** null = 에뮬 허브, 숫자 = 해당 스테이지 플레이어 */
  const [stageIdx, setStageIdx] = useState<number | null>(null);

  // ── 데이터 — 모듈 집합(정렬 JSON 키)·refreshKey 변경 시에만 재페치(300ms) ──
  const hasReady = readyModules.length > 0;
  const modules = selectedModules.length > 0 ? selectedModules : readyModules;
  const moduleKey = JSON.stringify([...modules].sort());

  // 학습지 제목 — 배포 다이얼로그 과제명 규칙(§3.4 "[지문제목] {모듈} 학습")과 동일
  // 조립. 리포트 제목이 아니라 **이 화면의 지문 제목**에서 출발하므로 h1·브레드크럼과
  // 항상 일치하고, 학생이 실제로 받을 과제명 초안과도 일치한다.
  const moduleLabels = modules
    .map((id) => STUDIO_MODULE_BY_ID.get(id)?.label)
    .filter((v): v is string => Boolean(v))
    .join("·");
  const worksheetTitle = moduleLabels ? `[${title}] ${moduleLabels} 학습` : title;

  const reqSeqRef = useRef(0);
  const planHashRef = useRef<string | null>(null);

  useEffect(() => {
    if (!hasReady) {
      // 분석된 모듈 0 — 페치 없이 빈 상태(렌더 분기가 담당). 여기서는 진행 중
      // 응답 폐기 + 해시 리셋(ref)만 — 다음 성립 시 반드시 허브부터 시작한다.
      reqSeqRef.current += 1;
      planHashRef.current = null;
      return;
    }
    const seq = ++reqSeqRef.current;
    const timer = setTimeout(() => {
      // 디바운스 경과 후에만 로딩 표시 — 연속 토글 시 스피너 깜빡임도 함께 준다
      setLoading(true);
      void (async () => {
        const wanted = JSON.parse(moduleKey) as StudioModuleId[];
        const res = await getStudioEmulatorPlan({ passageId, modules: wanted });
        if (seq !== reqSeqRef.current) return; // 늦게 도착한 응답 폐기
        setLoading(false);
        if (!res.success || !res.data) {
          planHashRef.current = null;
          setPlan(null);
          setStageIdx(null);
          setError(res.error ?? "미리보기를 불러오지 못했습니다.");
          return;
        }
        const stages = asStudyStages(res.data.stages);
        if (stages.length === 0) {
          planHashRef.current = null;
          setPlan(null);
          setStageIdx(null);
          setError("미리 볼 수 있는 모듈이 없습니다.");
          return;
        }
        setError(null);
        setPlan({ planHash: res.data.planHash, stages });
        if (planHashRef.current !== res.data.planHash) {
          // 구성이 실제로 바뀐 경우만 허브로 복귀(같은 구성 재확인은 화면 유지)
          planHashRef.current = res.data.planHash;
          setStageIdx(null);
        }
      })();
    }, 300);
    return () => clearTimeout(timer);
  }, [hasReady, moduleKey, passageId, refreshKey, retryTick]);

  // ── 패널 폭 실측 → 스케일 계산 ─────────────────────────────────────────────
  const hostRef = useRef<HTMLDivElement>(null);
  const [hostW, setHostW] = useState(FALLBACK_PANEL_WIDTH);
  useEffect(() => {
    const el = hostRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w && w > 0) setHostW(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 가용 높이 실측 — 프레임이 담긴 그릇보다 크면 잘리는데, 잘린 베젤은 "고장난 화면"
  // 으로 읽힌다(2026-08-10 캡처 실측). 폭은 실기기 값을 지키고(레이아웃 진실성)
  // **높이만** 줄여 "화면이 짧은 기기"처럼 동작시킨다 — 내용은 프레임 안에서 정상
  // 스크롤된다. 상수 여백(구 `innerHeight-190`)은 캡션·스트립이 한 줄만 늘어도 곧장
  // 베젤을 잘라먹었다 — 그릇(스크롤 조상)과 프레임 위 크롬을 **실측**한다.
  //  · byPosition: 그릇 바닥까지 남은 거리(그릇이 화면보다 짧을 수 있다)
  //  · byBox     : 그릇 자체 높이 상한 — 레일이 스크롤된 상태에서도 값이 흔들리지
  //                않게 잡아 주는 고정점(피드백 루프 차단)
  const sectionRef = useRef<HTMLElement>(null);
  const [availH, setAvailH] = useState(640);
  const measureAvail = useCallback(() => {
    const host = hostRef.current;
    const section = sectionRef.current;
    if (!host || !section) return;
    const sectionTop = section.getBoundingClientRect().top;
    const chromeAbove = Math.max(0, host.getBoundingClientRect().top - sectionTop);
    let limitBottom = window.innerHeight;
    let boxH = window.innerHeight;
    const scroller = findScrollParent(section);
    if (scroller) {
      limitBottom = Math.min(limitBottom, scroller.getBoundingClientRect().bottom);
      boxH = Math.min(boxH, scroller.clientHeight);
    }
    const byPosition = limitBottom - sectionTop - chromeAbove - FRAME_CHROME;
    const byBox = boxH - chromeAbove - FRAME_CHROME;
    setAvailH(Math.max(360, Math.min(byPosition, byBox)));
  }, []);
  useEffect(() => {
    measureAvail();
    window.addEventListener("resize", measureAvail);
    return () => window.removeEventListener("resize", measureAvail);
    // 캡션·스트립 줄 수가 바뀌는 조건(상태 전환)마다 크롬을 다시 잰다
  }, [measureAvail, hasReady, plan, error, device, selectedModules.length]);

  const dev = DEVICES[device];
  // 스케일 산식 정본(§3.6 2026-08-10 개정): 베젤(좌우 border 6px씩, 합 12px)은
  // 스케일되지 않는 크롬이라 분모에서 선차감한다. 구식 hostW/dev.width 는 스케일
  // 구간(태블릿)에서 프레임 총폭이 hostW+12 가 되어 레일 그릇(overflow-y-auto →
  // overflow-x:auto 계산)에 우측 베젤 6px 이 잘렸다(1440 실측: 432px > 420px).
  const scale = Math.min(1, Math.max(1, hostW - 12) / dev.width);
  /**
   * 실기기 px 기준 유효 높이 — 내용 레이아웃도 이 높이로 계산돼 하단이 잘리지 않는다.
   * 분석 전에는 보여줄 학생 화면 자체가 없으므로 컴팩트 높이로 접는다(감사 L4-18·L5-14:
   * 750px 짜리 빈 상자가 레일을 통째로 비웠다).
   */
  const targetH = hasReady ? dev.height : EMPTY_FRAME_HEIGHT;
  const deviceH = Math.min(targetH, Math.round(availH / scale));
  const viewW = Math.round(dev.width * scale);
  const viewH = Math.round(deviceH * scale);

  // ── 프레임 내용 ────────────────────────────────────────────────────────────
  const activeStage =
    plan && stageIdx !== null && stageIdx >= 0 && stageIdx < plan.stages.length
      ? plan.stages[stageIdx]
      : undefined;

  let frameContent: React.ReactNode;
  if (!hasReady) {
    // 학생 화면이 아직 없는 상태 — 크림(지면) 배경은 실제 학생 화면이 마운트될 때만
    // 쓴다. 스튜디오 카드 언어(흰 배경·slate)로 두어 색 덩어리를 없앤다.
    frameContent = (
      <FramePlaceholder>
        <ScanSearch className="h-7 w-7 text-slate-300" strokeWidth={1.5} aria-hidden />
        <p className="text-[13px] font-semibold text-slate-600">
          모듈을 분석하면 학생 화면을 미리 볼 수 있습니다
        </p>
      </FramePlaceholder>
    );
  } else if (plan && activeStage && stageIdx !== null) {
    const hasNextStage = stageIdx + 1 < plan.stages.length;
    frameContent = (
      <StudyPlayerClient
        key={`${plan.planHash}:${activeStage.id}`}
        taskId={`emu:${passageId}`}
        stage={activeStage}
        planHash={plan.planHash}
        backHref="#"
        nextStageHref={hasNextStage ? "#" : null}
        harness
        onExit={() => setStageIdx(null)}
        onNextStage={hasNextStage ? () => setStageIdx(stageIdx + 1) : undefined}
      />
    );
  } else if (plan) {
    frameContent = (
      <EmulatorHub title={worksheetTitle} stages={plan.stages} onOpen={(i) => setStageIdx(i)} />
    );
  } else if (error) {
    frameContent = (
      <FramePlaceholder>
        <p className="text-[13px] font-semibold text-slate-600">{error}</p>
        <button
          type="button"
          className="min-h-11 rounded-xl border border-slate-200 bg-white px-4 text-[13px] font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-900"
          onClick={() => setRetryTick((t) => t + 1)}
        >
          다시 시도
        </button>
      </FramePlaceholder>
    );
  } else {
    frameContent = (
      <FramePlaceholder>
        <Loader2 className="h-6 w-6 animate-spin text-slate-300" aria-hidden />
        <p className="text-xs font-medium text-slate-500">학생 화면을 준비하고 있습니다</p>
      </FramePlaceholder>
    );
  }

  // 프레임 위 상태 스트립 — 배포 바가 "선택해 주세요"라고 말할 때 프레임은 전체를
  // 보여주던 불일치(감사 L5-09)를 한 줄로 해소한다.
  const totalItems = plan ? plan.stages.reduce((acc, s) => acc + s.items.length, 0) : 0;
  const totalMin = plan ? plan.stages.reduce((acc, s) => acc + s.estMin, 0) : 0;

  return (
    <section
      ref={sectionRef}
      aria-label="학생 화면 미리보기"
      className="flex flex-col gap-2.5"
    >
      {/* ── 캡션 + 폰/태블릿 토글 ── */}
      <div className="flex items-start justify-between gap-2">
        {/* 캡션 문구는 §3.6 정본 그대로 — 좁은 레일에서 어수선해 보이지 않게 2행으로
            나눠 보여 준다(문구 자체는 변형 금지). 단 분석 전에는 문항이 0개라 "동일"을
            주장할 대상이 없다 — 그 상태의 문장으로 교체한다(감사 L5-14). */}
        <p className="min-w-0 text-xs leading-snug font-semibold text-slate-500 break-keep">
          학생 화면 미리보기
          <span className="block font-medium text-slate-400">
            {hasReady
              ? "실제 배포와 동일한 문제입니다"
              : "분석하면 학생 화면을 여기서 바로 확인할 수 있습니다"}
          </span>
        </p>
        <div className="flex shrink-0 items-center gap-1" role="group" aria-label="기기 선택">
          {/* 아이콘 전용 토글은 무엇을 고르는지 읽히지 않는다(캡처 실측) — 라벨 병기 */}
          <DeviceToggle
            active={device === "phone"}
            label="폰 화면"
            onClick={() => setDevice("phone")}
          >
            <Smartphone className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
            <span className="ml-1 text-[11px] font-semibold">폰</span>
          </DeviceToggle>
          <DeviceToggle
            active={device === "tablet"}
            label="태블릿 화면"
            onClick={() => setDevice("tablet")}
          >
            <Tablet className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
            <span className="ml-1 text-[11px] font-semibold">태블릿</span>
          </DeviceToggle>
        </div>
      </div>

      {/* ── 미리보기 범위 스트립 — 무엇을 보고 있는지 프레임 밖에서 밝힌다 ── */}
      {hasReady ? (
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
          {selectedModules.length === 0 ? (
            <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-500">
              선택한 모듈이 없어 전체를 미리 봅니다
            </span>
          ) : (
            <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700">
              선택한 모듈 {selectedModules.length}개를 미리 봅니다
            </span>
          )}
          {plan ? (
            <span className="text-[11px] font-medium text-slate-400 tabular-nums">
              {plan.stages.length}단계 · {totalItems}문항 · 약 {totalMin}분
            </span>
          ) : null}
        </div>
      ) : null}

      {/* ── 디바이스 프레임 — 패널 폭 실측(ref) 기준으로 스케일 ── */}
      <div ref={hostRef} className="w-full">
        <div
          className="mx-auto overflow-hidden rounded-[2rem] border-[6px] border-slate-900 bg-slate-900 shadow-xl"
          style={{ width: viewW + 12 }}
        >
          <div className="flex flex-col overflow-hidden rounded-[1.65rem] bg-white">
            {/* 상태바 — tutor 에뮬레이터 관용구(시각·Wifi·BatteryFull), 비스케일 */}
            <div className="flex h-7 shrink-0 items-center justify-between bg-white px-4 text-[10px] font-bold text-slate-900">
              <span>9:41</span>
              <span className="flex items-center gap-1">
                <Wifi className="h-3 w-3" aria-hidden />
                <BatteryFull className="h-3.5 w-3.5" aria-hidden />
              </span>
            </div>
            {/* 뷰포트 — 실기기 px 내용을 transform scale 로 축소 */}
            <div
              className="studio-emu-viewport relative overflow-hidden"
              style={{ width: viewW, height: viewH }}
            >
              {/* 함정 (b): transform 은 scale=1 이어도 항상 건다 — fixed 요소
                  (질문·나가기 시트)의 containing block 을 이 래퍼로 고정 */}
              <div
                style={{
                  width: dev.width,
                  height: deviceH,
                  transform: `scale(${scale})`,
                  transformOrigin: "top left",
                }}
              >
                {frameContent}
              </div>
              {loading && plan && hasReady ? (
                <div className="pointer-events-none absolute inset-x-0 top-2 z-10 flex justify-center">
                  <span className="flex items-center gap-1 rounded-full bg-slate-900/80 px-2.5 py-1 text-[10px] font-semibold text-white">
                    <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                    미리보기 갱신 중
                  </span>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ── 프레임 안 비-학생 상태(분석 전·오류·로딩) — 스튜디오 카드 언어 ───────────
function FramePlaceholder({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 bg-white px-8 text-center">
      {children}
    </div>
  );
}

// ── 토글 버튼 (하우스 스타일 §10 — 강조 blue 만) ────────────────────────────
function DeviceToggle({
  active,
  label,
  onClick,
  children,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      title={label}
      // 레일(xl+)은 마우스면이라 28px 로 촘촘하게, xl 미만 전폭 시트는 터치면이라
      // 44px 타깃을 지킨다.
      className={
        active
          ? "flex h-11 items-center justify-center rounded-lg border border-blue-300 bg-blue-50 px-2.5 text-blue-700 xl:h-7 xl:px-2"
          : "flex h-11 items-center justify-center rounded-lg border border-slate-200 bg-white px-2.5 text-slate-400 transition hover:text-slate-600 xl:h-7 xl:px-2"
      }
    >
      {children}
    </button>
  );
}

// ── 에뮬 허브 — 실제 학생 허브(/g/w hub-client)의 시각 언어를 미러 ──────────
// 미러 범위: 헤더(뒤로가기·「학습지」 라벨·제목) · 진행 히어로(단계 진행·미터·CTA)
// · 단계 행 · 하단 유틸. **실값이 없는 항목은 만들지 않는다** — D-Day(배포 전이라
// 마감이 확정되지 않음)·선생님 안내문(배포 다이얼로그 입력)·첫 시도 정답률(기록
// 0건)은 생략한다. 가짜 값을 넣으면 캡션의 "실제 배포와 동일"이 다시 거짓이 된다.
function EmulatorHub({
  title,
  stages,
  onOpen,
}: {
  title: string;
  stages: StudyStage[];
  onOpen: (index: number) => void;
}) {
  // 프레임보다 내용이 길면 하단이 글자 중간에서 잘려 "고장난 화면"으로 읽힌다
  // (감사 L2-07). 더 볼 것이 남아 있을 때만 페이드+셰브런으로 알린다.
  const scrollRef = useRef<HTMLDivElement>(null);
  const [moreBelow, setMoreBelow] = useState(false);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () => {
      setMoreBelow(el.scrollHeight - el.clientHeight - el.scrollTop > 12);
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => update()) : null;
    if (ro) {
      ro.observe(el);
      if (el.firstElementChild) ro.observe(el.firstElementChild);
    }
    return () => {
      el.removeEventListener("scroll", update);
      ro?.disconnect();
    };
  }, [stages]);

  return (
    <div className="gd-app relative flex h-full flex-col">
      {/* 헤더 — hub-client.tsx:129-155 미러. 뒤로가기는 미리보기에서 갈 곳이 없어
          비활성 표식으로만 둔다(학생 화면에 그 자리가 있다는 사실은 보여야 한다). */}
      <header
        className="shrink-0"
        style={{ background: "var(--gd-card)", borderBottom: "1px solid var(--gd-line)" }}
      >
        <div className="gd-page flex items-center gap-1.5 px-2.5 py-2">
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
            style={{ color: "var(--gd-ink-3)" }}
            aria-hidden
          >
            <ArrowLeft className="h-5 w-5" strokeWidth={1.75} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="gd-label">학습지</p>
            <h2 className="gd-t-sm truncate font-bold tracking-tight">{title}</h2>
          </div>
        </div>
      </header>

      <div ref={scrollRef} className="gd-scroll min-h-0 flex-1">
        <main className="gd-page gd-safe-b flex flex-col gap-3 px-4 py-4">
          {/* 진행 히어로 — 배포 직후 학생이 처음 보는 상태(0/N·미터 0%·시작 CTA) */}
          <section className="gd-card px-4 py-4">
            <div className="min-w-0">
              <p className="gd-label">진행 상황</p>
              <p className="gd-t-lg mt-1 font-bold">
                <span className="gd-mono">0/{stages.length}</span> 단계 완료
              </p>
            </div>
            <div className="gd-meter mt-3">
              <span style={{ width: "0%" }} />
            </div>
            <button
              type="button"
              onClick={() => onOpen(0)}
              className="gd-btn gd-btn-primary mt-4 w-full"
            >
              <Play className="h-4.5 w-4.5" strokeWidth={2} aria-hidden />
              학습 시작하기
            </button>
          </section>

          {/* 단계 행 — hub-client.tsx:288-350 미러(전부 todo 상태) */}
          <section aria-label="학습 단계">
            <p className="gd-label mb-2">학습 단계</p>
            <div className="flex flex-col gap-2">
              {stages.map((s, i) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => onOpen(i)}
                  className="block w-full text-left"
                >
                  <div className="gd-card flex items-center gap-3 px-4 py-3.5">
                    <span
                      className="gd-t-xs inline-flex shrink-0 items-center justify-center rounded-full font-bold"
                      style={{
                        width: "1.75rem",
                        height: "1.75rem",
                        background: "var(--gd-blue-soft)",
                        color: "var(--gd-blue)",
                      }}
                      aria-hidden
                    >
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="gd-t-md font-bold leading-snug">{s.title}</p>
                      <p className="gd-t-xs mt-0.5" style={{ color: "var(--gd-ink-2)" }}>
                        {s.subtitle}
                      </p>
                      <p className="gd-t-2xs gd-mono mt-1" style={{ color: "var(--gd-ink-3)" }}>
                        {s.items.length}문항 · {s.estMin}분
                      </p>
                    </div>
                    <ChevronRight
                      className="h-4 w-4 shrink-0"
                      style={{ color: "var(--gd-ink-3)" }}
                      aria-hidden
                    />
                  </div>
                </button>
              ))}
            </div>
          </section>

          {/* 하단 유틸 — 학생 허브에 이 자리가 있다는 사실까지 보여 준다.
              미리보기에서는 열 수 없으므로 비활성 표기(실제 허브의 비활성 규칙과 동일). */}
          <div className="flex gap-2">
            <span
              aria-disabled="true"
              title="미리보기에서는 열 수 없습니다"
              className="gd-btn gd-btn-ghost flex-1"
              style={{ opacity: 0.45, pointerEvents: "none" }}
            >
              <FileText className="h-4 w-4" strokeWidth={1.75} aria-hidden />
              원본 학습지 보기
            </span>
            <span
              aria-disabled="true"
              title="미리보기에서는 열 수 없습니다"
              className="gd-btn gd-btn-ghost flex-1"
              style={{ opacity: 0.45, pointerEvents: "none" }}
            >
              <BarChart3 className="h-4 w-4" strokeWidth={1.75} aria-hidden />
              결과 리포트
            </span>
          </div>
        </main>
      </div>

      {/* 스크롤 단서 — 내용이 더 있을 때만 */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 flex h-10 items-end justify-center pb-1 transition-opacity duration-200"
        style={{
          opacity: moreBelow ? 1 : 0,
          background:
            "linear-gradient(180deg, rgba(246,245,241,0) 0%, rgba(246,245,241,0.9) 55%, var(--gd-paper) 100%)",
        }}
      >
        <ChevronDown className="h-3.5 w-3.5" strokeWidth={2.25} style={{ color: "var(--gd-ink-3)" }} />
      </div>
    </div>
  );
}
