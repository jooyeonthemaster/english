"use client";

// ============================================================================
// 클래스 스튜디오 워크벤치 — 중앙 자산 헤더
// (docs/class-studio-spec.md §3.10.14·§3.10.16-a·§3.10.22 → **§3.10.23 E24**)
//
// §3.10.23(E24): 「조판실」 1필을 **[학습지 조판 | 시험지 조판] 2필로 해체**하고,
// 이행기 레거시 2필(문제관리·학습지 관리)을 폐기한다. 최종 3필:
//     [지문관리 | 학습지 조판 | 시험지 조판]
// 사용자 지시 원문: "지금 내가 시험지 조판에 있는지, 학습지 조판에 있는지 구분이
// 안 돼. 그냥 조판실을 학습지 조판, 시험지 조판 이렇게 명확하게 구분을 해줘."
// → **필 = 지금 어느 조판인가**가 되었다. 조판 상호배제가 다시 뷰 값 하나로
//   구조적으로 성립하므로 E22-3 의 명시 상태 `composeMode` 는 폐지됐다
//   (studio-home-client.tsx — 그 파일이 근거를 자인한다).
//
// §3.10.14(E13)로 "소스 탭 4개 대등 나열"을 폐기한 자리. 위계가 핵심이다:
//   · 평시 = 자산 3뷰 세그먼트 [지문관리 | 학습지 조판 | 시험지 조판]
//     + 우측 primary 「+ 지문 추가」 — **지문관리 뷰 전용**(팝오버 3항목:
//     기출/직접 입력/파일 업로드. 조판 뷰에선 지문이 재료가 아니다)
//   · 들여오기 집중 모드(intakeActive) = 「← 지문관리」 복귀 + 방법 3필
//     (지문 추가는 일시적 태스크지 지문관리와 대등한 탭이 아니다 — E13)
// 순수 프레젠테이션 — 상태를 소유하지 않고(전부 controlled) 팝오버 열림과
// 컨테이너 실측 폭만 내부 시각 상태다.
// memo: 오케스트레이터의 5초 큐 폴링 리렌더를 여기서 끊는다 — 호스트는
// 핸들러 전부를 참조 안정(useCallback)으로 내린다.
// 컴팩트 모드(§3.10.17-d v2.3): 조판 중 중앙 420px 등 좁은 폭에서 내부 가로
// 스크롤로 찌그러뜨리는 대신, **라벨은 전부 유지**한 채 건수 (N) 를 툴팁·접근성
// 이름으로 옮기고 패딩·간격만 조여(px-2·gap-1) 전부 한눈에 담는다. 판정은
// 콘텐츠 폭이 아니라 컨테이너 폭 임계(콘텐츠 기준은 축약 즉시 임계 미달 →
// 모드 진동). 극단 폭 대비 스크롤+페이드는 안전망으로 존치 — 활성 필
// scrollIntoView(nearest) 가시 보장 동일.
//
// ⚠ **E24 필 라벨 ↔ 실행대 CTA 라벨 충돌**(E24-SPEC §⑦): 실행대 CTA 라벨은
//   §⑦(c) 에 따라 **「시험지 조판」·「학습지 조판」 그대로 유지**한다 — 사용자가
//   §3.10.13·§3.10.17 에서 직접 지시해 굳은 자구라 승인 없이 못 바꾼다.
//   그 결과 **필 라벨과 글자가 단위로 같다.** 충돌 해소는 두 갈래다:
//    (a) 각 필이 **`data-asset-view` 를 계약으로 노출**한다 — QA 프로브는 라벨이
//        아니라 이 속성으로 필을 특정한다(라벨 부분매칭은 영구히 취약하다).
//    (b) 필의 `aria-label`/`title` 은 **항상 긴 설명형**이라(아래 sheetDetail /
//        examDetail) 조판 표면의 `aria-label="학습지 조판"` 과 절대 같아지지 않는다.
//        건수 유무로 짧아지면 부팅 직후(미조회)에만 충돌하는 **상태 의존 간헐
//        오작동**이 생긴다 — `waitFor` 는 가짜 GREEN, `count===0` 은 가짜 RED.
//   ※ §⑥ 요약 스트립의 점프 버튼(「시험지 조판 →」)도 같은 부분매칭에 걸린다.
//     그쪽은 `data-summary-jump` 로 배제한다(프로브 규약 §6-1).
//
// §M(26-08-22) 모바일 학습 임시 숨김 개편 — 조판 유도 넛지: 오케스트레이터가
// 생성 완료를 감지해 `nudgeSheet`/`nudgeExam` 을 내리면 해당 조판 필이
// **비활성일 때만** studio-pulse 링을 띄워 조판 뷰로 유도한다(활성 필은 이미
// 그 뷰라 제외). 옵셔널·기본 false 원시 boolean — memo 방어선 무해.
// 들여오기 방법 필·「+ 지문 추가」 클러스터는 무접촉.
// ============================================================================

import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type Ref,
} from "react";
import {
  ArrowLeft,
  ClipboardPaste,
  FolderOpen,
  GraduationCap,
  ImageUp,
  LayoutTemplate,
  ListChecks,
  Plus,
  type LucideIcon,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

/** 중앙 열 자산 뷰(§3.10.16-a → §3.10.23 E24) — 지문(재료) · **두 조판**.
 *
 *  E24 로 구 3값(`"questions"`·`"worksheets"`·`"studio"`)이 삭제됐다. 그 값들을
 *  살려 두던 근거는 「뷰 강제 채널의 인자 도메인 + 이행기 프로브 셀렉터」였는데,
 *  강제 채널은 이제 `"exam"`/`"sheet"` 를 각각 넘기고(그 분기 자체가 정보다 —
 *  구조에서는 두 채널이 같은 `"studio"` 를 넘기고 `composeMode` 가 정보를 들었다),
 *  프로브는 `data-asset-view` 로 이행했다.
 *
 *  ⚠ 값을 지우면 `view === "studio"` 류 비교는 TS 가 잡지만 `view !== "passages"`
 *    류는 **조용히 의미가 바뀐다**. 전수 점검이 계약이다(E24-SPEC §3 원장). */
export type StudioAssetView = "passages" | "sheet" | "exam";

/** 들여오기 3방법 — IntakeSurface 의 intakeTab 축약형(§3.10.14) */
export type IntakeMethodKey = "exam" | "paste" | "upload";

export interface SourceSwitcherProps {
  /** 현재 자산 뷰 — 호스트 소유(controlled) */
  assetView: StudioAssetView;
  onSelectView: (v: StudioAssetView) => void;
  /** passages 뷰가 들여오기 집중 모드인가(intakeView === "intake" 파생) */
  intakeActive: boolean;
  /** 집중 모드의 현재 방법 — intakeTab 파생 */
  intakeTab: IntakeMethodKey;
  /** 방법 선택(팝오버 항목·집중 모드 방법 필 공용) — 집중 모드 진입 포함 */
  onSelectIntake: (k: IntakeMethodKey) => void;
  /** 집중 모드 → 지문관리 복귀 */
  onBackToLibrary: () => void;
  /** 지문관리 건수 — 필 라벨 「지문관리 (N)」(0이면 숫자 생략 — 탭 관용구) */
  libraryCount: number;
  /** 문항 건수 — null = 아직 미조회(숫자 생략). 「시험지 조판」 필의 건수다. */
  questionCount: number | null;
  /** 학습지 건수 — null = 아직 미조회. 「학습지 조판」 필의 **주** 건수다.
   *  학습지 조판 뷰의 목록은 학습지 + 문항 병합이지만(합본 재료), 필 라벨에
   *  합계를 실으면 두 필의 숫자가 겹쳐 보여(문항이 양쪽에 계상) 오히려
   *  「어느 쪽에 뭐가 있나」가 흐려진다 — 라벨은 **그 뷰의 주 재료**만 센다.
   *  병합 사실은 title/aria-label 로만 내린다. */
  worksheetCount: number | null;
  /**
   * §M(26-08-22) 조판 유도 펄스 — 생성 완료를 오케스트레이터가 감지해 true 를
   * 내리면 해당 조판 필(학습지/시험지)이 **비활성일 때만** studio-pulse 를
   * 부여한다(활성 필 = 이미 그 뷰 — 넛지 불필요). 소등도 오케스트레이터 소관.
   * 옵셔널·기본 false 원시 boolean — memo 방어선 무해.
   */
  nudgeSheet?: boolean;
  nudgeExam?: boolean;
  // 구 workspaceCount 4종은 §3.10.18 E18-a 로, 구 studioCount 는 §3.10.23 E24 로
  // 삭제됐다(조판실 합계 필 자체가 소멸).
}

// ── 필 공통 시각 문법 — 기존 탭(intake-surface.tsx Tab) 토큰 계승 ───────────
// px 는 BASE 에 두지 않는다: 컴팩트의 px-2 와 평시 px-3 은 같은 유틸리티
// 그룹이라 클래스 나열 순서가 아닌 스타일시트 순서로 승부가 나 무의미해진다.

const PILL_BASE =
  "inline-flex h-8 max-w-full shrink-0 items-center whitespace-nowrap rounded-md border text-[12.5px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500";
const PILL_ACTIVE = "border-blue-600 bg-blue-50/40 text-blue-700 shadow-sm";
const PILL_IDLE =
  "cursor-pointer border-transparent text-slate-400 hover:bg-slate-50 hover:text-slate-600";

function Pill({
  active,
  onClick,
  icon,
  label,
  title,
  ariaLabel,
  className = "",
  pillRef,
  compact = false,
  dataAssetView,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
  title?: string;
  ariaLabel?: string;
  className?: string;
  /** 활성 필 가시 보장용 — 스위처가 scrollIntoView 대상(활성 필)에만 단다. */
  pillRef?: Ref<HTMLButtonElement>;
  /** 컴팩트 모드 — 라벨은 항상 남기고(사용자 확정) 패딩·간격만 조인다.
   *  건수 등 라벨 축약분은 호출부가 title/ariaLabel 로 승계할 것. */
  compact?: boolean;
  /** 자산 뷰 필 전용 계약 속성(E24) — QA 프로브의 **정본 셀렉터**.
   *  들여오기 방법 필에는 달지 않는다(뷰가 아니다). */
  dataAssetView?: StudioAssetView;
}) {
  return (
    <button
      ref={pillRef}
      type="button"
      onClick={onClick}
      title={title}
      aria-label={ariaLabel}
      aria-pressed={active}
      data-asset-view={dataAssetView}
      className={
        PILL_BASE +
        " " +
        (active ? PILL_ACTIVE : PILL_IDLE) +
        (compact ? " gap-1 px-2" : " gap-1.5 px-3") +
        (className ? " " + className : "")
      }
    >
      {icon}
      {label}
    </button>
  );
}

// 모듈 상수 — 렌더마다 배열·아이콘 참조가 새로 만들어지지 않는다.
// 들여오기 3방법(§3.10.14) — 팝오버 항목·집중 모드 방법 필이 같은 정의 공유.
const INTAKE_METHODS: ReadonlyArray<{
  key: IntakeMethodKey;
  label: string;
  desc: string;
  Icon: LucideIcon;
}> = [
  {
    key: "exam",
    label: "기출 지문",
    desc: "기출 시험지에서 지문을 골라 담습니다",
    Icon: GraduationCap,
  },
  {
    key: "paste",
    label: "직접 입력",
    desc: "본문 붙여넣기 · AI 지문 생성으로 작성합니다",
    Icon: ClipboardPaste,
  },
  {
    key: "upload",
    label: "파일 업로드",
    desc: "PDF·이미지에서 AI가 지문을 추출합니다",
    Icon: ImageUp,
  },
];

/** 자산 뷰 필 정의(§3.10.23 E24) — 건수는 render 시 주입.
 *  아이콘 어휘:
 *   · FolderOpen = 재료 보관(지문관리, 불변)
 *   · LayoutTemplate = 이 스튜디오의 「조판」 정본 어휘 — 구 조판실 필이 쓰던
 *     아이콘을 **학습지 조판**이 승계한다(합본 = A4 한 묶음 조판의 본체).
 *   · ListChecks = 문항 나열 어휘 — 구 「문제관리」 필의 아이콘을 **시험지
 *     조판**이 승계한다(재료가 문항 목록이라는 사실이 그대로 읽힌다).
 *  순서: 재료 → 학습지 조판 → 시험지 조판. 학습지가 앞인 이유는 합본 경로가
 *  학습지 ≥1 을 요구하는 상위 경로이기 때문(E22-6). */
const ASSET_VIEWS: ReadonlyArray<{
  key: StudioAssetView;
  label: string;
  Icon: LucideIcon;
}> = [
  { key: "passages", label: "지문관리", Icon: FolderOpen },
  { key: "sheet", label: "학습지 조판", Icon: LayoutTemplate },
  { key: "exam", label: "시험지 조판", Icon: ListChecks },
];

function SourceSwitcherInner({
  assetView,
  onSelectView,
  intakeActive,
  intakeTab,
  onSelectIntake,
  onBackToLibrary,
  libraryCount,
  questionCount,
  worksheetCount,
  nudgeSheet = false,
  nudgeExam = false,
}: SourceSwitcherProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const stickyRef = useRef<HTMLDivElement | null>(null);
  const activePillRef = useRef<HTMLButtonElement | null>(null);
  const [fade, setFade] = useState({ left: false, right: false });
  // 「지문 추가」 팝오버 — 스위처 내부 시각 상태(자산 뷰는 여전히 controlled).
  const [addOpen, setAddOpen] = useState(false);
  // 컨테이너 실측 폭 — 컴팩트 판정 재료(초깃값 ∞ = 첫 페인트는 풀 모드,
  // 마운트 effect 의 updateOverflow 가 즉시 실측으로 교정).
  const [stripWidth, setStripWidth] = useState<number>(
    Number.POSITIVE_INFINITY,
  );

  const updateOverflow = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const width = el.clientWidth;
    setStripWidth((prev) => (prev === width ? prev : width));
    const maxLeft = el.scrollWidth - width;
    const left = el.scrollLeft > 1;
    const right = el.scrollLeft < maxLeft - 1;
    // sticky 우측 클러스터 폭만큼 scroll-padding — scrollIntoView(nearest)가
    // 필을 sticky 클러스터 아래 숨긴 채 정렬을 끝내지 않게 한다.
    el.style.scrollPaddingRight = stickyRef.current
      ? `${stickyRef.current.offsetWidth}px`
      : "";
    setFade((prev) =>
      prev.left === left && prev.right === right ? prev : { left, right },
    );
  }, []);

  // 오버플로 재판정 — 마운트·컨테이너 리사이즈·내용 폭 변화(카운트·모드 전환).
  // 리사이즈 시 활성 필 가시도 재보장한다(조판 진입으로 중앙이 420px 로 접힐
  // 때 활성 필이 sticky 「지문 추가」 뒤에 반쯤 숨던 실측 결함 — onScroll
  // 경로에는 넣지 않는다: 사용자 스크롤과 싸운다).
  useEffect(() => {
    updateOverflow();
    const el = scrollRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      updateOverflow();
      activePillRef.current?.scrollIntoView({
        inline: "nearest",
        block: "nearest",
      });
    });
    ro.observe(el);
    return () => ro.disconnect();
    // assetView: 조판 두 뷰에서는 sticky 「+ 지문 추가」 클러스터가 통째로
    // 미렌더라 stickyRef 가 null 이 된다. 이 effect 가 다시 돌아야
    // updateOverflow 가 scrollPaddingRight 를 "" 로 되돌린다 — 안 돌면
    // 사라진 클러스터 폭만큼 스크롤 패딩이 남는다.
  }, [
    updateOverflow,
    libraryCount,
    questionCount,
    worksheetCount,
    intakeActive,
    assetView,
  ]);

  // 활성 필 가시 보장 — 마운트·활성 전환 시 활성 필(ref)을 시야로 끌어온다.
  useEffect(() => {
    activePillRef.current?.scrollIntoView({
      inline: "nearest",
      block: "nearest",
    });
  }, [assetView, intakeActive, intakeTab]);

  const countLabel = (base: string, n: number | null) =>
    n !== null && n > 0 ? `${base} (${n})` : base;

  // 뷰별 건수 조회표 — Record 는 키가 하나라도 빠지면 컴파일 에러이므로,
  // 뷰가 늘거나 줄 때 「4번째 키가 조용히 마지막 삼항 분기로 떨어져 틀린 숫자를
  // 표시」하던 §3.10.22 U11-3 의 사고가 원천 봉쇄된다. **삼항 사슬 금지.**
  const viewCounts: Record<StudioAssetView, number | null> = {
    passages: libraryCount,
    sheet: worksheetCount,
    exam: questionCount,
  };

  // 「학습지 조판」 필의 detail — 목록이 학습지 + 문항 **병합**이라는 사실은
  // 라벨에 싣지 않고(두 필의 숫자가 겹쳐 보인다) 툴팁으로만 내린다.
  // 미조회(null)는 0으로 위조하지 않는다.
  const sheetDetailParts: string[] = [];
  if (worksheetCount !== null) sheetDetailParts.push(`학습지 ${worksheetCount}`);
  if (questionCount !== null) sheetDetailParts.push(`문항 ${questionCount}`);
  const sheetDetail = sheetDetailParts.length
    ? `학습지 조판 — 학습지 뒤에 문항을 이어 붙여 A4 한 묶음으로 (${sheetDetailParts.join(" · ")})`
    : "학습지 조판 — 학습지 뒤에 문항을 이어 붙여 A4 한 묶음으로";
  const examDetail =
    questionCount !== null
      ? `시험지 조판 — 문항으로 시험지 세트를 만듭니다 (문항 ${questionCount})`
      : "시험지 조판 — 문항으로 시험지 세트를 만듭니다";

  // ── 컴팩트 판정(§3.10.17-d v2.3 → §3.10.23 E24 **재실측**) ─────────────────
  // §3.10.22 U11-6 의 미결(「560 은 3필 체제 파생값인데 4필 동거 중이라 재실측
  // 보류」)을 E24 가 **실측으로 종결**한다. 그 메모는 「최종 2필이 되면 **하향**
  // 하라」고 지시했는데 **방향이 반대였다** — 확정 상태는 3필이고 라벨이
  // 「학습지 조판」·「시험지 조판」으로 길어져 필요 폭이 **늘었다**.
  //
  // 실측(26-08-21 · `probe-e24-split.mjs` G15b · 지문관리 뷰 = sticky
  // 「+ 지문 추가」 클러스터가 붙는 최대 폭 상태):
  //     풀 모드 자연 폭 = **619.92px**  (라벨에 건수 포함)
  //     구 임계 560 에서 → cw=560 · sw=620 · **가로 오버플로 60px**
  // 구 임계가 하필 패널 하한 `minCenter=560`(studio-home-client PANEL_SPECS)과
  // **같은 값**이라, 우측 패널을 최대로 넓혀 중앙이 하한에 닿는 구간
  // (560~619)에서 **컴팩트가 영영 발동하지 않고** 그 구간 전체가 가로 스크롤
  // 이었다. 그러면 sticky 클러스터가 세 번째 필의 오른쪽을 덮고,
  // scrollIntoView 는 **활성 필만** 끌어오므로 비활성 필은 스크롤해야 보인다
  // (§3.10.17-d v2.3 이 「내부 가로 스크롤로 찌그러뜨리지 않는다」며 폐기한 바로 그 상태).
  //
  // → **640**: 실측 619.92 위 + 건수 자릿수 증가 여유(「지문관리 (508)」 →
  //   네 자리가 돼도 임계를 넘지 않는다). 임계가 크면 컴팩트로 **더 일찍**
  //   떨어질 뿐 잘림이 없다(안전측). 컴팩트 모드는 420px 에서도 오버플로 0 이
  //   실측돼 있어(G15 `compose420` cw=420/sw=420) 560 구간을 여유 있게 담는다.
  //
  // ⚠ **반드시 컨테이너 폭 기준**이다(이 파일 머리 경고). 콘텐츠 폭으로 재면
  //   축약 즉시 임계 미달이 되어 모드가 진동한다. 컨테이너 폭은 모드와 무관하므로
  //   되먹임이 없다.
  // ⚠ 이 값을 다시 만질 때는 **반드시 G15b 를 재실행**해 실측 위임을 확인하라 —
  //   「minCenter 와 같은 값」으로 되돌리면 위 결함이 그대로 되살아난다.
  const compact = stripWidth < 640;

  // sticky 우측 클러스터 렌더 여부 — 「+ 지문 추가」가 유일 내용물이므로
  // 버튼 게이트(§3.10.17-e)와 컨테이너 게이트를 하나로 묶는다(U11-7).
  const showAddCluster = !intakeActive && assetView === "passages";

  // 팝오버 항목 클릭 — 닫고 집중 모드 진입(호스트가 뷰·탭 전환을 소유).
  const pickIntake = (k: IntakeMethodKey) => {
    setAddOpen(false);
    onSelectIntake(k);
  };

  return (
    // data-tour="asset-pills": 온보딩 투어(E26) 앵커 — 정적 속성이라 memo 무접촉.
    <div data-tour="asset-pills" className="relative h-11 shrink-0 border-b border-slate-100">
      <div
        ref={scrollRef}
        onScroll={updateOverflow}
        className="flex h-full items-center gap-1.5 overflow-x-auto pl-3"
      >
        {intakeActive ? (
          <>
            {/* ── 들여오기 집중 모드 — 복귀 + 방법 3필(§3.10.14 takeover) ── */}
            <button
              type="button"
              data-tour="intake-back"
              onClick={onBackToLibrary}
              title="지문관리로 돌아가기"
              aria-label="지문관리로 돌아가기"
              className={
                "inline-flex h-8 shrink-0 cursor-pointer items-center whitespace-nowrap rounded-md border border-transparent text-[12.5px] font-semibold text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 " +
                (compact ? "gap-1 px-2" : "gap-1.5 px-2.5")
              }
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
              지문관리
            </button>
            <span aria-hidden className="mx-1 h-4 w-px shrink-0 bg-slate-200" />
            {compact ? null : (
              <span className="shrink-0 whitespace-nowrap text-[11px] font-semibold text-slate-400">
                지문 추가
              </span>
            )}
            {INTAKE_METHODS.map(({ key, label, Icon }) => {
              const isActive = intakeTab === key;
              return (
                <Pill
                  key={key}
                  active={isActive}
                  onClick={() => onSelectIntake(key)}
                  icon={<Icon className="h-3.5 w-3.5" />}
                  label={label}
                  pillRef={isActive ? activePillRef : undefined}
                  compact={compact}
                />
              );
            })}
          </>
        ) : (
          /* ── 평시 — 자산 3뷰 세그먼트(§3.10.23 E24 최종형) ── */
          ASSET_VIEWS.map(({ key, label, Icon }) => {
            const isActive = assetView === key;
            const full = countLabel(label, viewCounts[key]);
            // 두 조판 필은 「무엇을 만드는 자리인가」를 툴팁으로 명시한다 —
            // 라벨만으로는 합본(학습지+문항)과 순수 문항 조판의 차이가
            // 안 읽힌다. 이것이 사용자 지시("구분이 안 돼")의 직접 대응이다.
            const detail =
              key === "sheet"
                ? sheetDetail
                : key === "exam"
                  ? examDetail
                  : full;
            // §M 조판 유도 — 해당 조판 필이 **비활성**이고 넛지가 켜졌을 때만
            // 펄스(활성 필은 이미 그 뷰다). Pill 의 className passthrough 사용.
            const nudged =
              !isActive &&
              ((key === "sheet" && nudgeSheet) ||
                (key === "exam" && nudgeExam));
            return (
              <Pill
                key={key}
                dataAssetView={key}
                active={isActive}
                onClick={() => onSelectView(key)}
                // 컴팩트: 라벨은 유지, 건수만 툴팁·접근성 이름으로 이동
                // (사용자 확정 — 아이콘 전축약 금지).
                label={compact ? label : full}
                icon={<Icon className="h-3.5 w-3.5" />}
                title={detail}
                ariaLabel={detail}
                className={nudged ? "studio-pulse" : undefined}
                pillRef={isActive ? activePillRef : undefined}
                compact={compact}
              />
            );
          })
        )}

        {/* sticky 우측 클러스터 — 「+ 지문 추가」 primary(평시). 오버플로에서도
            항상 보인다(h-full bg-white 가 아래를 지나는 필을 가린다).
            §3.10.22 U11-7: 게이트를 버튼이 아니라 **컨테이너까지** 끌어올린다 —
            구조에서는 조판 뷰·들여오기 모드에서 내용 없는 흰 박스만 남아
            우측에 빈 여백이 떠 있었다. 버튼이 지문관리 전용인 것은 §3.10.17-e
            그대로(두 조판 뷰에서 지문은 이 화면의 재료가 아니다). */}
        {showAddCluster ? (
          <div
            ref={stickyRef}
            className="sticky right-0 z-[1] ml-auto flex h-full shrink-0 items-center gap-1.5 bg-white pl-1.5 pr-3"
          >
            {fade.right ? (
              <span
                aria-hidden
                className="pointer-events-none absolute inset-y-0 right-full w-6 bg-gradient-to-l from-white to-transparent"
              />
            ) : null}
            <Popover open={addOpen} onOpenChange={setAddOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  data-tour="add-passage"
                  title="지문 추가 — 기출 지문·직접 입력·파일 업로드"
                  aria-label="지문 추가 — 기출 지문·직접 입력·파일 업로드"
                  className={
                    "inline-flex h-8 shrink-0 cursor-pointer items-center gap-1 whitespace-nowrap rounded-md bg-blue-600 text-[12.5px] font-bold text-white shadow-sm transition-colors hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 " +
                    (compact ? "px-2" : "px-3")
                  }
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  지문 추가
                </button>
              </PopoverTrigger>
              <PopoverContent
                align="end"
                sideOffset={6}
                className="w-72 border-slate-200 bg-white p-1.5 shadow-lg"
              >
                <p className="px-2 pb-1 pt-1.5 text-[10.5px] font-bold uppercase tracking-wider text-slate-400">
                  어떻게 추가할까요?
                </p>
                {INTAKE_METHODS.map(({ key, label, desc, Icon }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => pickIntake(key)}
                    className="flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2 py-2 text-left transition-colors hover:bg-blue-50/60"
                  >
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-blue-100 bg-blue-50 text-blue-600">
                      <Icon className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[12.5px] font-bold text-slate-800">
                        {label}
                      </span>
                      <span className="block truncate text-[11px] text-slate-400">
                        {desc}
                      </span>
                    </span>
                  </button>
                ))}
              </PopoverContent>
            </Popover>
          </div>
        ) : null}
      </div>
      {fade.left ? (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-white to-transparent"
        />
      ) : null}
      {/* 클러스터가 없는 뷰(두 조판·들여오기)의 우측 스크롤 단서 — 평시에는
          sticky 클러스터 안쪽 그라데이션(right-full)이 담당하지만, U11-7 로 그
          컨테이너가 사라지는 뷰에서는 단서까지 함께 사라진다. 좌측과 대칭으로
          바깥 relative 컨테이너에 건다. */}
      {!showAddCluster && fade.right ? (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-white to-transparent"
        />
      ) : null}
    </div>
  );
}

export const SourceSwitcher = memo(SourceSwitcherInner);
