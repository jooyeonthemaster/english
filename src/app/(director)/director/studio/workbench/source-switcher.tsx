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
// 순수 프레젠테이션 — 내부 상태 없이 호스트의 선택을 표시한다.
// memo: 오케스트레이터의 5초 큐 폴링 리렌더를 여기서 끊는다 — 호스트는
// 핸들러 전부를 참조 안정(useCallback)으로 내린다.
// 26-09-07: 고정 높이·가로 스크롤을 제거하고 컨테이너 쿼리로 재배치한다.
// 420px 조판 목록에서는 3+2, 넓은 패널에서는 한 줄. 모든 라벨이 항상 보인다.
// 【26-09-03 사용자 지시 — 필 라벨에서 건수 전면 철거】 "학습지 조판이든,
// 지문 관리든 학생 관리든 옆에 숫자 필요 없다고." → 26-09-01 에 「시험지 조판」
// 하나에만 적용됐던 규칙이 **전 필로 확대**됐다. 건수는 소멸이 아니라 이사다 —
// 전부 `title`/`aria-label`(긴 설명형, §3.10.23 ⑦(b))이 계속 든다. 그 결과
// 필 라벨은 **폭이 데이터에 안 흔들리는 상수 문자열**이 되어, 컴팩트 모드의
// 「건수를 툴팁으로 옮긴다」 절도 자연 소멸했다(라벨이 이미 최단형).
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

import { memo, type ReactNode } from "react";
import {
  ArrowLeft,
  ClipboardPaste,
  FileBarChart,
  FolderOpen,
  GraduationCap,
  ImageUp,
  LayoutTemplate,
  ListChecks,
  Users,
  type LucideIcon,
} from "lucide-react";
import { FEATURE_FLAGS } from "@/lib/feature-flags";
import styles from "./source-switcher.module.css";

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
export type StudioAssetView =
  | "passages"
  | "sheet"
  | "exam"
  | "analysis"
  | "students";

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
  /** 지문 건수 — **툴팁 전용**(26-09-03 라벨 철거). 0 이면 표기 생략. */
  libraryCount: number;
  /** 문항 건수 — null = 아직 미조회(표기 생략). 두 조판 필 툴팁의 재료다. */
  questionCount: number | null;
  /** 학습지 건수 — null = 아직 미조회. 「학습지 조판」 필의 **주** 건수다.
   *  학습지 조판 뷰의 목록은 학습지 + 문항 병합이지만(합본 재료), 한 숫자에
   *  합계를 실으면 두 필의 숫자가 겹쳐 보여(문항이 양쪽에 계상) 오히려
   *  「어느 쪽에 뭐가 있나」가 흐려진다 — **그 뷰의 주 재료**만 센다.
   *  병합 사실은 title/aria-label 이 「학습지 N · 문항 M」으로 함께 내린다. */
  worksheetCount: number | null;
  /**
   * 「학생 관리」 필 건수(v4 26-09-02, docs/exam-analysis-v4-spec.md §3 U6-1) —
   * 선택 클래스의 학생 수. 셸이 클래스 행(studentCount)에서 원시값으로 내린다
   * (memo 방어선 무해). null = 미상(표기 생략) · 옵셔널 = 기존 호출부 무회귀.
   */
  studentCount?: number | null;
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

// 라벨·건수 툴팁·data-asset-view 계약은 유지하고 배치만 CSS가 맡는다.
function Pill({
  active,
  onClick,
  icon,
  label,
  title,
  ariaLabel,
  className = "",
  dataAssetView,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
  title?: string;
  ariaLabel?: string;
  className?: string;
  dataAssetView?: StudioAssetView;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={ariaLabel}
      aria-pressed={active}
      data-asset-view={dataAssetView}
      className={`${styles.pill} ${className}`}
    >
      {icon}
      <span className={styles.label}>{label}</span>
    </button>
  );
}

// 모듈 상수 — 렌더마다 배열·아이콘 참조가 새로 만들어지지 않는다.
// 들여오기 3방법(§3.10.14) — 집중 모드 방법 필과, 지문 목록 툴바로 이사한
// 「지문 추가」 팝오버(library-pane AddPassageLauncher, 26-09-01 사용자 지시)가
// 같은 정의를 공유한다 — export 는 그 단일 소스 계약이다.
export const INTAKE_METHODS: ReadonlyArray<{
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
  // 「시험 분석」(26-09-01, 정본 docs/studio-exam-analysis-integration.md §2·§3):
  // 대상+동사 2어절 체계에서 동사부가 직무를 가른다 — 조판=만들기 / 분석=치른
  // 시험 읽기. 「시험지 분석」은 기각(「시험지 조판」과 접두 공유 + 과금 라벨
  // "시험지 문항 분석"(credit-costs.ts:68) 수렴). FileBarChart 는 exam-report
  // 허브 헤더와 같은 아이콘 — 같은 기능은 같은 어휘.
  { key: "analysis", label: "시험 분석", Icon: FileBarChart },
  // 「학생 관리」(26-09-02 v4, docs/exam-analysis-v4-spec.md §1-6·§3 U6-1):
  // 분석 → 링크 발송 → 학생 관리가 스튜디오 안에서 이어지도록 시험 분석 **옆**에
  // 둔다(사용자 지시 원문). Users 는 학생 탭·로스터의 기존 어휘.
  { key: "students", label: "학생 관리", Icon: Users },
];

// 「시험 분석」 필은 허브 nav 의 ENABLE_EXAM_DEPLOYMENT 스프레드 게이트
// (nav-config.ts)와 운명 공동체다 — 여기(필 렌더)와 studio-location parse
// **양쪽**을 같은 플래그로 걸어야 진입로 비대칭이 없다(적대검수 M9).
// §M SHOW_MOBILE(step-strip.tsx)과 같은 모듈 상수 관용구 — prop 화 금지.
const VISIBLE_ASSET_VIEWS: ReadonlyArray<(typeof ASSET_VIEWS)[number]> =
  FEATURE_FLAGS.ENABLE_EXAM_DEPLOYMENT
    ? ASSET_VIEWS
    : ASSET_VIEWS.filter((v) => v.key !== "analysis" && v.key !== "students");

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
  studentCount = null,
  nudgeSheet = false,
  nudgeExam = false,
}: SourceSwitcherProps) {
  // 건수 접미(툴팁 전용) — 미조회(null)·0 은 **표기하지 않는다**(0으로 위조 금지).
  const countSuffix = (n: number | null, unit: string) =>
    n !== null && n > 0 ? ` (${n}${unit})` : "";

  // 「학습지 조판」 필의 detail — 목록이 학습지 + 문항 **병합**이라는 사실은
  // 한 숫자로 뭉개지 않고 두 항으로 나눠 툴팁이 내린다.
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

  // 뷰별 툴팁(= 접근성 이름) 조회표 — 구 `viewCounts` 의 자리를 그대로 승계한다.
  // Record 는 키가 하나라도 빠지면 컴파일 에러이므로, 뷰가 늘거나 줄 때
  // 「4번째 키가 조용히 마지막 삼항 분기로 떨어져 틀린 값을 표시」하던
  // §3.10.22 U11-3 의 사고가 원천 봉쇄된다. **삼항 사슬 금지.**
  // 전 항이 **긴 설명형**인 것은 §3.10.23 ⑦(b) 계약이다 — 필의 접근성 이름이
  // 조판 표면 `aria-label="학습지 조판"` 과 글자 단위로 같아지는 순간
  // 상태 의존 간헐 오작동(가짜 GREEN/RED)이 생긴다. 26-09-03 라벨 철거로
  // passages·students 도 짧아질 뻔했으므로 여기서 설명형을 못 박는다.
  const viewDetail: Record<StudioAssetView, string> = {
    passages: `지문관리 — 학습지·시험지의 재료가 되는 지문 보관함${countSuffix(libraryCount, "개")}`,
    sheet: sheetDetail,
    // 시험지 조판 건수는 26-09-01 사용자 지시로 라벨에서 먼저 빠졌다("그 숫자
    // 없애줘") — 26-09-03 에 나머지 필이 같은 자리로 합류했을 뿐이다.
    exam: examDetail,
    // 시험 분석 건수는 v1 미집계(패널이 자체 폴링 소유 — 업링크 배선은 후속).
    analysis: "시험 분석 — 치른 시험을 읽고 학생 리포트를 만듭니다",
    // 학생 관리 = 선택 클래스 학생 수(셸 prop, v4 §3 U6-1).
    students: `학생 관리 — 이 클래스의 학생 명단·초대${countSuffix(studentCount, "명")}`,
  };

  return (
    <nav
      data-tour="asset-pills"
      aria-label={intakeActive ? "지문 추가 방법" : "클래스 스튜디오 작업"}
      className={styles.switcher}
    >
      {intakeActive ? (
        <div className={styles.intake}>
          <div className={styles.intakeHeader}>
            <button
              type="button"
              data-tour="intake-back"
              onClick={onBackToLibrary}
              title="지문관리로 돌아가기"
              aria-label="지문관리로 돌아가기"
              className={styles.back}
            >
              <ArrowLeft className={styles.icon} aria-hidden="true" />
              <span className={styles.label}>지문관리</span>
            </button>
            <span className={styles.intakeTitle}>지문 추가</span>
          </div>
          <div className={styles.methods}>
            {INTAKE_METHODS.map(({ key, label, Icon }) => (
              <Pill
                key={key}
                active={intakeTab === key}
                onClick={() => onSelectIntake(key)}
                icon={<Icon className={styles.icon} aria-hidden="true" />}
                label={label}
              />
            ))}
          </div>
        </div>
      ) : (
        <div className={styles.views}>
          {VISIBLE_ASSET_VIEWS.map(({ key, label, Icon }) => {
            const isActive = assetView === key;
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
                label={label}
                icon={<Icon className={styles.icon} aria-hidden="true" />}
                title={viewDetail[key]}
                ariaLabel={viewDetail[key]}
                className={nudged ? "studio-pulse" : undefined}
              />
            );
          })}
        </div>
      )}
    </nav>
  );
}

export const SourceSwitcher = memo(SourceSwitcherInner);
