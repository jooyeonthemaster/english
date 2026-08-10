"use client";

// ============================================================================
// 발주 밴드(AuthoringComposer) — 선생님이 편집 데스크에 올리는 **발주서 한 장**.
//
// 상자를 없앤 이유(이 파일의 존재 이유):
//   직전 설계는 rounded-2xl 테두리 + shadow 챗 버블이었다. 그 상자 하나가 만든
//   실측 피해는 취향 문제가 아니다.
//    · 좌측 기준선이 세 개였다 — 칩 줄 px-3(12) / textarea px-3.5(14) / 툴바
//      px-2.5(10). 게다가 막힌 사유 줄만 px-1(4)로 상자 **밖**에 떠 있었다.
//      오너가 말한 "정렬이 하나도 안 맞다"의 진원지가 정확히 여기다.
//    · 상자가 자기 반경(16px)과 그림자를 갖는 순간, 호스트가 이미 흰 카드라
//      card-in-card 가 되고 안쪽 칩·팝오버가 또 자기 반경을 갖는 중첩이 시작된다.
//   → **상자를 지우고 선과 여백만 남긴다.** 전 층이 px-4(16px) 하나로 서고,
//     구분은 hairline 한 줄이 한다. 중첩 반경·중첩 패딩이 구조적으로 재발 불가능.
//
// 상자를 없앤 대가는 어포던스로 상환한다(설계 바이블 §1):
//    · 포커스 — 밴드 좌측 x=0 의 2px accent bar(focus-within). 테두리가 하던
//      "여기가 입력칸이다"를 선 하나가 대신한다.
//    · 드래그 — 밴드 전체에 dashed outline + 중앙 안내 14/700. 평상시 0px.
//   (§1 명시 예외: 1px rule 과 2px accent bar 는 간격 그리드의 대상이 아니다.
//    선은 간격이 아니다 — 그래서 w-0.5 는 .5 스텝 금지의 예외다.)
//
// 파기한 계약과 근거 (되돌리지 말 것)
//  · 구 :14-15 "첨부는 칩 한 줄로만, 세부는 칩 팝오버" — 파기. 팝오버는 716px 을
//    448px 창에 담아 62%를 숨기고, 성격이 100배 다른 결정 4개를 한 창에서
//    요구했다. 취지("자료 카드가 입력창을 화면 밖으로 밀어내지 않는다")는
//    **자료 행 3개 상한 + 4개째부터 자료 검토 모달로 이관**이 더 강하게 지킨다.
//  · 구 :16-17 "첨부 칩 줄은 2줄까지 자라고 그 뒤 자기 안에서 스크롤" — 파기.
//    그 스크롤이 화면의 **세 번째 스크롤**이었다(스크롤 2개 계약 위반). 지금은
//    3행에서 멈추고 나머지는 "자료 N개 · 모두 보기"로 모달이 받는다. CSS 스크롤
//    그림자 해킹(#fff 덮개 4겹)도 함께 소멸했다.
//  · 구 CTA 의 font-extrabold / 12.5px / 10.5px 붙여넣기 안내 — 파기. 12~14px
//    한글에서 extrabold 는 자간이 뭉개져 위계가 오히려 약해지고, 0.5px 스텝은
//    1x DPI 에서 구별되지 않는다. 5단 토큰(DESK)으로 흡수했다.
//  · 구 amber 톤 사유 줄 — 파기(page-frame.tsx:9 · v3 §D1 R5 금지색). 안내는
//    slate-600 + Info, 조치 필요는 rose-600 + TriangleAlert 다.
//  · **구 "주 CTA 는 툴바 오른쪽 끝에 h-9 로 앉는다" — 파기(오너 2차 피드백).**
//    근거는 취향이 아니라 세 가지 사실이다.
//     ① 위계 오류: 이 화면에서 **되돌릴 수 없는 행동은 정확히 하나**(크레딧 차감)
//        인데, 되돌릴 수 있는 [자료 붙이기]·[예시] 와 같은 36px 상자·같은 줄에
//        앉아 있었다. 같은 무게로 그린 것은 "이 셋 중 아무거나 고르세요"라는 말이다.
//     ② 위치가 컨테이너 폭의 함수였다: 툴바가 flex-wrap 이고 CTA 가 ml-auto 라,
//        폭이 좁아지면 CTA 는 어떤 때는 1행 오른쪽 끝, 어떤 때는 2행 오른쪽 끝에
//        떴다. 화면에서 **가장 중요한 버튼의 좌표가 예측 불가**였다. 전폭 자기
//        줄은 이 자유도를 0으로 만든다 — 어느 폭에서도 좌표가 같다.
//     ③ 인과가 끊겨 있었다: "왜 못 누르는지" 한 줄이 CTA 와 같은 줄이 아니라
//        **툴바 아래·경고 줄 아래**에 있어, 버튼과 사유 사이에 남의 줄이 끼었다.
//    → 이제 실행 층(경고 → CTA → 사유)이 한 덩어리로 밴드 바닥에 선다. 사유는
//      CTA 바로 밑 캡션 자리이고, FAILED 경고는 CTA **위**다(그 경고가 CTA 라벨의
//      "(자료 N개 제외)" 를 바꾸므로 라벨보다 먼저 읽혀야 인과가 맞는다).
//    ⚠️ CTA 를 툴바로 되돌리지 말 것. 되돌리는 순간 ①②③ 이 함께 돌아온다.
//
// 회귀 방지 계약 (지금도 유효)
//  · **드롭 핸들러는 dataTransfer.files 가 있을 때만 preventDefault 한다.** 먼저
//    부르면 브라우저가 공짜로 해 주는 텍스트 드롭(캐럿에 끼워넣기)까지 죽는다.
//  · **폭 분기는 전부 컨테이너 쿼리다.** 뷰포트 질의(sm:/lg:)를 다시 들이지 말 것 —
//    이 컴포넌트의 폭은 뷰포트와 무관하다(호스트 좌측 패널 하한 380px).
//    **@container 는 이 파일의 루트가 선언한다.** 떼면 자료 행(material-row)의
//    @max-[420px]/@max-[480px] 분기까지 함께 깨진다.
//  · **주 CTA 는 native disabled 로 막지 않는다.** aria-disabled + 힌트 글로우 +
//    "왜 못 누르는지" 한 줄이 하우스 규약이다. hint-glow 대상(boxRef)은 밴드 루트.
//    ⚠️ 그 대신 프리미티브의 `aria-disabled:opacity-50` 을 이 CTA 만 opacity-100
//    으로 덮는다. 36px 보조 버튼에서 반투명은 "지금은 못 눌러요"로 읽히지만,
//    **48px 전폭 막대**에서 반투명은 상태가 아니라 **고장난 바**로 읽힌다(면적이
//    클수록 알파가 재질 결함처럼 보인다). 막힘은 채움색으로만 말한다 —
//    blue-600 → slate-100. 색이 바뀌면 아래 ctaMuted 한 곳만 고친다.
//  · **첫 화면은 혼내지 않는다.** blockedReason 은 첫 렌더부터 차 있으므로 사유
//    줄은 사용자가 움직인 뒤에만(attempted). **단 FAILED 자료 통지는 예외** —
//    그건 훈계가 아니라 "이 자료는 빼고 만들어요"라는 사실 통지라 상시 보여 준다.
//  · **모달은 이 컴포넌트가 소유하되 visible 게이트를 반드시 통과시킨다** —
//    WideModal 은 body 포털이라 조상의 hidden(display:none)이 통하지 않는다.
//  · Sparkles(별 반짝이) 아이콘 금지 — 오너 지시. 이 기능의 대표 아이콘은 PenLine.
// ============================================================================

import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent,
  type KeyboardEvent,
  type RefObject,
} from "react";
import { toast } from "sonner";
import {
  ArrowUp,
  CornerDownLeft,
  Info,
  Loader2,
  Paperclip,
  TriangleAlert,
} from "lucide-react";

import { CreditCostChip } from "@/components/credits/credit-cost-chip";
import {
  MATERIAL_ACCEPT_ATTR,
  describeUnsupportedFile,
  isSupportedMaterialFile,
} from "@/lib/passage-authoring/material-readers";
import { AUTHORING_COPY } from "@/lib/wording/passage-authoring-glossary";
import { cn } from "@/lib/utils";

import { ExamplePicker } from "./authoring-board-parts";
import { AuthoringButton } from "./authoring-primitives";
import { DESK, HAIRLINE, SURFACE } from "./authoring-tokens";
import type { DraftMaterial } from "./authoring-types";
import { predictMaterialBudgets } from "./material-budget";
import { MaterialReaderModal } from "./material-reader-modal";
import { MaterialRow, type MaterialReviewSection } from "./material-row";
import { MAX_AUTHORING_MATERIALS } from "./use-material-drafts";

/**
 * 자료 행은 3개까지만 세운다. 4개째부터 목록을 접고 "자료 N개 · 모두 보기"로
 * 자료 검토 모달에 넘긴다 — 여기서 스크롤을 만들면 화면의 **세 번째 스크롤**이
 * 되어 스크롤 2개 계약이 깨진다(좌 컬럼 1 + 우 레일 1).
 * 자료 검토 모달의 목록 칼럼 임계값(LIST_COLUMN_THRESHOLD=4)과 같은 값이다.
 */
const VISIBLE_MATERIAL_ROWS = 3;

/**
 * 요청문 상한. schema.ts:412 `instruction: z.string().max(4_000)` 과 같은 값이다 —
 * 여기서 막지 않으면 서버 zod 가 영문 메시지로 튕겨(route.ts) 사용자는 무엇을
 * 줄여야 할지 알 수 없다. 값이 바뀌면 양쪽을 같이 고친다.
 */
const INSTRUCTION_MAX_CHARS = 4_000;

/**
 * 잔여 카운터를 꺼내는 지점. 처음부터 "4,000자까지"를 띄우면 한 줄 적는 사람에게
 * 없던 상한을 알려 주는 꼴이라, 상한의 90%에 닿았을 때만 나타난다.
 */
const INSTRUCTION_COUNTER_AT = 3_600;

/**
 * 이 길이를 넘는 텍스트를 요청 칸에 붙여넣으면 "요청"이 아니라 "자료"로 본다.
 *
 * 왜 자동인가: 선생님은 지문을 입력칸에 그냥 붙여넣는다. 예전에는 그러면 요청
 * 칸이 지문으로 가득 찼고, 자료로 넣으려면 별도 팝오버를 열어야 했다. 이제
 * 그 자리에서 자료 행이 된다. 400자 근거: 실제 요청("분사구문 넣어서")은 길어야
 * 100자 안쪽, 지문·단어장·어법 설명은 예외 없이 그보다 훨씬 길다. 그 사이의 골짜기.
 */
const PASTE_AS_MATERIAL_MIN = 400;

/**
 * 아직 DraftMaterial 에 실리지 않은 필드들(하이브리드 첨부·자동분류 확신도).
 * 타입 소유자는 authoring-types.ts / material-intake.ts 이며 각각 다른 작업에서
 * 들어온다. material-row.tsx 와 같은 방식으로 **있으면 그린다**로만 다뤄 배선
 * 순서에 의존하지 않는다.
 */
type ComposerMaterial = DraftMaterial & {
  sendPages?: boolean;
  pageCount?: number;
  roleUncertain?: boolean;
};

export interface AuthoringComposerProps {
  instruction: string;
  onInstructionChange: (v: string) => void;
  materials: readonly ComposerMaterial[];
  disabled: boolean;
  /** 자료를 더 받을 수 없는 상태(상한 도달). */
  atCapacity: boolean;
  onFiles: (files: File[]) => void;
  onPasteText: (text: string) => void;
  onMaterialChange: (id: string, patch: Partial<ComposerMaterial>) => void;
  onMaterialRemove: (id: string) => void;
  onMaterialRetry: (id: string) => void;
  /** 생성 실행. 막혀 있으면 blockedReason 이 채워진다. */
  onStart: () => void;
  starting: boolean;
  blockedReason: string | null;
  /**
   * 판독이 끝나는 즉시 자동 실행되도록 **예약된** 상태의 캡션(26-08-04).
   * blockedReason 과 같은 자리에 뜨지만 성격이 반대다 — 저건 "못 해요"이고 이건
   * "할게요"다. 그래서 첫인상 보호(attempted) 게이트를 타지 않는다: 이 값이
   * 채워지는 유일한 경로가 **사용자가 방금 CTA 를 누른 것**이라, 숨길 이유가 없고
   * 숨기면 클릭이 삼켜진 것처럼 보인다.
   */
  queuedReason?: string | null;
  credits: number;
  count: number;
  /** hint-glow 대상 = 밴드 루트. 막힌 CTA 가 "여기를 채우세요"라고 가리킬 곳. */
  boxRef: RefObject<HTMLDivElement | null>;
  /**
   * 파일 드래그가 이 밴드 위에 들어왔는가를 상위에 알린다. 보드가 좌 컬럼
   * **전체**에 dashed outline 을 두르고 싶을 때 쓴다(밴드는 자기 몫만 그린다).
   */
  onDraggingChange?: (dragging: boolean) => void;
  /**
   * 이 보드가 지금 화면에 보이는가(활성 탭인가). 숨은 동안 자료 검토 모달이
   * 열려 있으면 body 포털이라 다른 화면을 덮고 스크롤까지 잠근다. 미전달이면 true.
   */
  visible?: boolean;
}

export function AuthoringComposer({
  instruction,
  onInstructionChange,
  materials,
  disabled,
  atCapacity,
  onFiles,
  onPasteText,
  onMaterialChange,
  onMaterialRemove,
  onMaterialRetry,
  onStart,
  starting,
  blockedReason,
  queuedReason = null,
  credits,
  count,
  boxRef,
  onDraggingChange,
  visible = true,
}: AuthoringComposerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  // 검토 모달은 id 하나로만 산다 — 자료 객체를 복사해 두면 본문을 고쳤을 때
  // 모달만 옛 값을 들고 있게 된다(항상 materials 에서 다시 찾는다).
  const [readerId, setReaderId] = useState<string | null>(null);
  const [readerSection, setReaderSection] =
    useState<MaterialReviewSection | null>(null);
  // ── 첫인상 보호 ── blockedReason 은 첫 렌더부터 차 있다. 그대로 그리면 아무것도
  // 하기 전에 경고문과 회색 버튼부터 본다 — 잘못한 게 없는데 혼나는 화면이다.
  const [attempted, setAttempted] = useState(false);
  // dragenter/dragleave 는 자식 위를 지날 때마다 번갈아 발생한다. 깊이를 세지
  // 않으면 오버레이가 깜빡인다.
  const dragDepth = useRef(0);

  const setDragActive = useCallback(
    (next: boolean) => {
      setDragging(next);
      onDraggingChange?.(next);
    },
    [onDraggingChange],
  );

  const attachDisabled = disabled || atCapacity;

  const acceptFiles = useCallback(
    (list: FileList | File[] | null) => {
      if (disabled || !list) return;
      const files = Array.from(list);
      if (files.length === 0) return;
      const ok = files.filter((f) => isSupportedMaterialFile(f));
      const bad = files.filter((f) => !isSupportedMaterialFile(f));
      if (bad.length > 0) {
        const first = describeUnsupportedFile(bad[0]);
        toast.warning(
          bad.length === 1
            ? first
            : AUTHORING_COPY.TOAST.unsupportedMore(first, bad.length - 1),
        );
      }
      if (ok.length > 0) onFiles(ok);
    },
    [disabled, onFiles],
  );

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    dragDepth.current = 0;
    setDragActive(false);
    // 순서가 핵심이다. preventDefault 를 먼저 부르면 **텍스트 드롭**까지 취소된다 —
    // 브라우저가 공짜로 해 주는 "고른 글을 캐럿에 끼워넣기"가 통째로 삼켜진다.
    const files = Array.from(event.dataTransfer?.files ?? []);
    if (files.length === 0) return;
    event.preventDefault();
    acceptFiles(files);
  };

  /**
   * 긴 텍스트 붙여넣기 → 자료 행으로. 짧으면 손대지 않고 그대로 요청에 들어간다.
   * 되돌리려면 행의 ✕ 하나면 되므로 확인 절차를 두지 않는다("왜 자꾸 물어보지"가 된다).
   */
  const handlePaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    if (attachDisabled) return;
    const text = event.clipboardData?.getData("text") ?? "";
    if (text.trim().length < PASTE_AS_MATERIAL_MIN) return;
    event.preventDefault();
    onPasteText(text.trim());
    toast.success(AUTHORING_COPY.TOAST.pastedAsMaterial, {
      description: AUTHORING_COPY.TOAST.pastedAsMaterialHint,
    });
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    // ⌘/Ctrl+Enter 로 실행 — 입력창의 보편 관습.
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      setAttempted(true);
      onStart();
    }
  };

  const openReview = useCallback(
    (id: string, section?: MaterialReviewSection) => {
      setReaderId(id);
      setReaderSection(section ?? null);
    },
    [],
  );

  // 목록 **전체**를 놓고 한 번에 예측한다. 행마다 혼자 계산하면 다른 자료와의
  // 총예산(60,000자) 경쟁이 반영되지 않아 "3,000/13,786자"가 거짓이 된다.
  // useMemo 는 장식이 아니다 — 자료 12개 × 60,000자면 한 번에 72만 자를 정화한다.
  // 이 밴드는 요청 칸 키 입력마다 리렌더되므로 감싸지 않으면 입력이 끊긴다.
  const budgets = useMemo(
    () =>
      predictMaterialBudgets(
        materials
          .filter((m) => m.status === "READY")
          .map((m) => ({ id: m.id, role: m.role, content: m.content })),
      ),
    [materials],
  );

  // 읽지 못한 자료 — CTA 라벨과 경고 줄이 같은 값을 본다(두 곳이 갈라지면
  // "3편 만들기"라고 적힌 버튼이 자료 2개를 조용히 빼고 돈다).
  const failedMaterials = useMemo(
    () => materials.filter((m) => m.status === "FAILED"),
    [materials],
  );

  const visibleMaterials = materials.slice(0, VISIBLE_MATERIAL_ROWS);
  // 접힌 자료로 들어가는 문 — 첫 번째 숨은 자료를 열면 모달이 목록 칼럼(자료
  // 4개 이상)을 함께 그려 나머지도 거기서 고를 수 있다.
  const firstHidden = materials[VISIBLE_MATERIAL_ROWS] ?? null;
  const hiddenCount = materials.length - visibleMaterials.length;

  // 모달을 연 채로 행의 ✕를 누르면 id 만 남는다 — 그땐 닫힌 것으로 본다(빈 모달 방지).
  const readerMaterial = materials.find((m) => m.id === readerId) ?? null;

  // 자료가 하나도 없을 때 "자료 붙이기"는 이 화면의 두 번째로 중요한 행동이다
  // (첫째는 적기). 회색 테두리로 두면 툴바 장식으로 읽혀 "내 파일은 어디에 넣지?"가
  // 된다. 채우지 않고 **테두리·글자만** 파랑으로 올린다 — 채운 파랑은 주 CTA 하나뿐.
  const attachEmphasis = materials.length === 0 && !attachDisabled;

  const touched =
    attempted || instruction.trim().length > 0 || materials.length > 0;
  // 사유를 "드러낼지"만 가른다. aria-disabled 는 진짜 상태(blockedReason)를 말한다.
  const showBlocked = touched && Boolean(blockedReason);
  /**
   * CTA 밑 캡션 한 줄의 최종 문구. **예약이 사유를 이긴다** — 예약 중에는 자료가
   * 아직 READY 가 아니라 blockedReason.empty 가 함께 켜져 있을 수 있는데, 그때
   * "자료를 넣거나 한 줄 적어 주세요"를 띄우면 방금 자료를 넣고 누른 사람에게
   * 자료를 넣으라고 말하는 화면이 된다.
   */
  const caption = queuedReason ?? (showBlocked ? blockedReason : null);
  const ctaMuted = showBlocked || starting;
  const remaining = INSTRUCTION_MAX_CHARS - instruction.length;

  return (
    // @container: 아래 모든 @max-* 는 이 div 의 폭을 잰다(자기 자신은 질의하지
    // 못하므로 분기는 전부 자식에 건다 — 상단 계약).
    <div className="@container min-w-0">
      <div
        ref={boxRef}
        onDragEnter={(e) => {
          e.preventDefault();
          if (attachDisabled) return;
          dragDepth.current += 1;
          setDragActive(true);
        }}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={(e) => {
          e.preventDefault();
          dragDepth.current = Math.max(0, dragDepth.current - 1);
          if (dragDepth.current === 0) setDragActive(false);
        }}
        onDrop={handleDrop}
        // 상자가 아니다 — 테두리도 그림자도 배경도 없다. 포커스는 좌측 x=0 의
        // 2px accent bar 가, 드래그는 dashed outline 이 말한다(어포던스 상환).
        className={cn(
          "relative",
          "before:absolute before:left-0 before:top-0 before:h-full before:w-0.5 before:content-['']",
          "focus-within:before:bg-blue-600",
          dragging
            ? "outline-2 outline-dashed outline-blue-400 -outline-offset-2"
            : null,
        )}
      >
        {/* 드래그 중에만 나타나는 안내 — 평상시에는 0px 을 차지한다. */}
        {dragging ? (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
            <p
              className={cn(
                DESK.title,
                SURFACE.info,
                "rounded-md px-3 py-2 text-blue-700",
              )}
            >
              {AUTHORING_COPY.COMPOSER.dropHint}
            </p>
          </div>
        ) : null}

        {/* ① 자료 목록 — 칩 격자가 아니라 원고 목록이다. 좌측 기준선 1개. */}
        {materials.length > 0 ? (
          <ul className="px-4">
            {visibleMaterials.map((material) => (
              <MaterialRow
                key={material.id}
                material={material}
                disabled={disabled}
                budget={budgets[material.id]}
                onChange={onMaterialChange}
                onRemove={onMaterialRemove}
                onRetry={onMaterialRetry}
                onOpenReview={openReview}
              />
            ))}
            {hiddenCount > 0 && firstHidden ? (
              <li className={cn("flex items-center border-b", HAIRLINE)}>
                <AuthoringButton
                  size="sm"
                  variant="ghost"
                  onClick={() => openReview(firstHidden.id)}
                  className="px-0 text-blue-700 hover:bg-transparent hover:text-blue-800"
                >
                  {AUTHORING_COPY.MATERIAL.more(materials.length)}
                </AuthoringButton>
                {atCapacity ? (
                  <span className={cn(DESK.meta, "ml-2 text-slate-500")}>
                    {AUTHORING_COPY.MATERIAL.atCapacity}
                  </span>
                ) : null}
              </li>
            ) : null}
          </ul>
        ) : null}

        {/* ② 요청 칸 + ③ hairline.
            mx-4 로 선을 그으면 자료 행의 hairline 과 **정확히 같은 x** 에서
            시작하고 끝난다(테두리는 패딩 바깥에 그려지므로 px-4 로는 어긋난다). */}
        <div className={cn("mx-4 border-b", HAIRLINE)}>
          <textarea
            value={instruction}
            onChange={(e) => onInstructionChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            disabled={disabled}
            maxLength={INSTRUCTION_MAX_CHARS}
            placeholder={AUTHORING_COPY.COMPOSER.placeholder}
            aria-label={AUTHORING_COPY.A11Y.instruction}
            // 이 화면에 15px 은 두 곳뿐이다 — 여기와 결과 지문 본문. 이 기능의
            // 본업이 영문 지문 읽기·쓰기인데 13px 은 편안한 독서 하한 아래다.
            // placeholder 가 이 기능의 설명문 전부를 짊어지므로(설명 단락을
            // 걷어냈다) slate-300(1.49:1)이 아니라 slate-500(4.76:1)이다.
            className={cn(
              DESK.read,
              "block max-h-[40vh] min-h-[120px] w-full resize-y bg-transparent py-3",
              "text-slate-800 outline-none placeholder:text-slate-500",
              "disabled:cursor-not-allowed disabled:opacity-60",
            )}
          />
        </div>

        {/* ④ 툴바 — **되돌릴 수 있는 행동만** 남는다(전부 h-9 보조 버튼).
            실행은 이 줄에 없다(상단 파기 계약). pb 를 떼고 pt-2 만 남긴 이유는
            아래 실행 층이 py-3 으로 자기 위 간격 12px 를 소유하기 때문이다 —
            양쪽이 다 패딩을 가지면 8+12=20px 라는 그리드 밖 간격이 생긴다. */}
        <div className="flex flex-wrap items-center gap-2 px-4 pt-2">
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={MATERIAL_ACCEPT_ATTR}
            className="hidden"
            onChange={(e) => {
              acceptFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <AuthoringButton
            onClick={() => inputRef.current?.click()}
            disabled={attachDisabled}
            title={
              atCapacity
                ? AUTHORING_COPY.COMPOSER.attachFull(MAX_AUTHORING_MATERIALS)
                : AUTHORING_COPY.COMPOSER.attachTitle
            }
            // 지원 형식을 title 로만 두면 터치 기기에서 볼 방법이 없다 — 이름에 싣는다.
            aria-label={AUTHORING_COPY.A11Y.attach}
            className={cn(
              attachEmphasis
                ? "border-blue-600 text-blue-700 hover:border-blue-600 hover:bg-blue-50 hover:text-blue-700"
                : null,
            )}
          >
            <Paperclip className="size-3.5 shrink-0" aria-hidden="true" />
            {AUTHORING_COPY.CTA.attach}
          </AuthoringButton>

          <ExamplePicker
            disabled={disabled}
            instruction={instruction}
            onPick={(text) =>
              onInstructionChange(
                instruction.trim() ? `${instruction.trim()}\n${text}` : text,
              )
            }
          />

          {/* 붙여넣기 안내 — 상자를 새로 만들지 않는다. 툴바에 남는 폭이 있을 때만
              한 줄로 얹고, 좁으면 사라진다. ml-auto 로 오른쪽에 밀지 않는다:
              CTA 가 툴바를 떠난 지금 오른쪽 끝에 12px 회색 글자만 홀로 뜨면
              밴드의 단일 좌측 기준선(x=16) 밖으로 나간 고아 조각이 된다.

              400px 임계 근거(코드에서 읽은 값으로 계산):
                자료 붙이기 = 한글 5자×13 + 공백 4 + 아이콘(size-3.5)14 + gap-1 4
                              + px-3 24 = 111
                예시       = 한글 2자×13 + 셰브런 14 + gap-1 4 + px-3 24 = 68
                이 문장    = 12px(DESK.meta) 한글 13자×12 + 공백 3칸×4 = 168
                gap-2 두 칸 = 16  →  합 363, 툴바 내폭 = 밴드 폭 − px-4×2(32)
                → 밴드 395px 에서 한 줄이 꽉 찬다. 한 스텝 얹어 400 에서 끊는다.
              (글리프 폭 근거는 glossary INSTRUCTION_EXAMPLES 의 "한 줄 예산" 주석과
               같은 기준이다 — 한글 글리프 ≈ 폰트 크기, 공백 ≈ 1/3.)
              ⚠️ 종전 540px 은 이 줄 오른쪽에 CTA(183px)가 있던 시절의 값이다.
                 CTA 를 툴바에서 뺐으므로 그 폭도 함께 빠졌다. */}
          <span className={cn(DESK.meta, "text-slate-500 @max-[400px]:hidden")}>
            {instruction.length >= INSTRUCTION_COUNTER_AT
              ? AUTHORING_COPY.COMPOSER.remaining(Math.max(0, remaining))
              : AUTHORING_COPY.COMPOSER.pasteHint}
          </span>
        </div>

        {/* ⑤ 실행 층 — **경고 → 주 CTA → 사유**가 한 덩어리로 밴드 바닥에 선다.
            순서 근거: FAILED 경고가 CTA 라벨의 "(자료 N개 제외)"를 바꾸므로 라벨보다
            먼저 읽혀야 인과가 맞고, 사유는 "왜 못 누르는지"라 버튼 **바로 밑**
            캡션 자리여야 한다(종전에는 둘 사이에 남의 줄이 끼어 있었다).

            간격: 이 블록이 py-3 으로 자기 위·아래 12px 를 통째로 소유한다(툴바는
            pt-2 만 갖는다 — 양쪽이 다 패딩을 가지면 8+12=20px 라는 그리드 밖 간격이
            생긴다). 안쪽 gap-2(8px)는 경고·사유가 CTA 의 **캡션**이기 때문이다.
            12px 를 주면 세 줄이 각각 남남으로 흩어져 다시 인과가 끊긴다. */}
        <div className="flex flex-col gap-2 px-4 py-3">
          {/* 읽지 못한 자료 — **attempted 와 무관하게 상시** 보여 준다. 훈계가
              아니라 "이 자료는 빼고 만들어요"라는 사실 통지이고, 실행을 막지도
              않는다(막으면 나머지 자료로 만들 길이 사라진다). */}
          {failedMaterials.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <TriangleAlert
                className="size-3.5 shrink-0 text-rose-600"
                aria-hidden="true"
              />
              <p className={cn(DESK.body, "min-w-0 text-rose-600")}>
                {AUTHORING_COPY.WARN.failedMaterials(failedMaterials.length)}
              </p>
              <AuthoringButton
                size="sm"
                variant="ghost"
                disabled={disabled}
                onClick={() =>
                  failedMaterials.forEach((m) => onMaterialRetry(m.id))
                }
                className="px-0 text-rose-600 hover:bg-transparent hover:text-rose-700"
              >
                {AUTHORING_COPY.MATERIAL.retry}
              </AuthoringButton>
            </div>
          ) : null}

          {/* 주 CTA — size="hero"(48px · 전폭 · 14/700 · rounded-lg). 크기·굵기·
              라운드·줄바꿈 규칙은 전부 프리미티브가 소유한다. 여기서 손코딩하는
              것은 **상태**(막힘 색)뿐이다.
              w-full 이므로 ml-auto 도, 스페이서도 필요 없다 — 어느 폭에서도 좌표가
              같다(밴드 좌우 인셋 16px 에 정확히 맞물린다).
              두 줄 안전: min-h-12 + whitespace-normal + break-keep 이 프리미티브에
              들어 있어, 좁은 컨테이너에서 라벨이 접혀도 48px 상자를 뚫지 않고
              상자가 자란다(어절 중간에서 끊겨 "지문 3편 만들 / 기"가 되지도 않는다). */}
          <AuthoringButton
            size="hero"
            variant="primary"
            onClick={() => {
              setAttempted(true);
              onStart();
            }}
            // aria-disabled 는 native disabled 가 아니다(계약) — 예약 중에도 클릭은
            // 그대로 전달돼야 한다. 그 클릭이 "예약 취소"의 유일한 통로다.
            aria-disabled={Boolean(blockedReason) || starting}
            title={caption ?? AUTHORING_COPY.COMPOSER.startTitle}
            className={cn(
              // 48px 전폭 막대에서 반투명은 상태가 아니라 고장으로 읽힌다(상단 계약).
              "aria-disabled:opacity-100",
              // native disabled 를 쓰지 않으므로(계약) 막힘은 채움색으로만 말한다.
              ctaMuted
                ? "bg-slate-100 text-slate-600 hover:bg-slate-100"
                : null,
            )}
          >
            {/* 아이콘 20px — 14px 라벨 옆 14px 아이콘은 48px 막대 안에서 먼지처럼
                보인다. 보조 표식(크레딧 칩·단축키)은 그대로 작게 남겨 위계를 만든다. */}
            {starting ? (
              <Loader2
                className="size-5 shrink-0 animate-spin"
                aria-hidden="true"
              />
            ) : (
              // 별·반짝이 계열 금지(오너 지시). 입력창 관습인 "보내기" 화살표.
              <ArrowUp className="size-5 shrink-0" aria-hidden="true" />
            )}
            {/* 라벨만 줄어들고 접힌다. min-w-0 가 없으면 flex 항목의 기본
                min-width:auto 때문에 좁은 폭에서 칩·단축키를 밖으로 밀어낸다. */}
            <span className="min-w-0">
              {failedMaterials.length > 0
                ? AUTHORING_COPY.CTA.startExcluding(
                    count,
                    failedMaterials.length,
                  )
                : AUTHORING_COPY.CTA.start(count)}
            </span>
            {/* 차감되는 크레딧은 이 화면에서 유일하게 되돌릴 수 없는 결과(돈)다.
                반투명 배경이던 시절에는 숫자가 읽히지 않았다 — 불투명 blue-800
                (흰 글자 8:1 이상). 칩은 11/700 로 라벨(14/700)보다 작게 두어야
                "버튼 이름"이 아니라 "가격표"로 읽힌다. */}
            <CreditCostChip
              amount={credits}
              className={cn(
                DESK.kicker,
                "shrink-0 rounded-md px-1",
                ctaMuted ? "text-slate-600" : "bg-blue-800 text-white",
              )}
              iconClassName="size-3"
            />
            {/* ⌘/Ctrl+Enter 힌트. 뷰포트(max-sm)가 아니라 컨테이너 질의다 —
                1440px 화면의 380px 패널에서 뷰포트 질의는 늘 거짓이다. 좁은 폭에서는
                라벨이 두 줄로 접히기 시작하므로 이 장식부터 내린다. */}
            <CornerDownLeft
              className="size-3.5 shrink-0 @max-[420px]:hidden"
              aria-hidden="true"
            />
          </AuthoringButton>

          {/* 캡션 한 줄 — 막힌 이유이거나(사용자가 움직인 뒤에만) 예약 상태다.
              첫 화면에는 아무 줄도 차지하지 않는다. 조치 요구(rose)가 아니라
              **안내**라 slate-600 + Info 다(금지색 amber 대체). */}
          {caption ? (
            <div className="flex items-start gap-2">
              <Info
                className="size-3.5 shrink-0 translate-y-[3px] text-slate-500"
                aria-hidden="true"
              />
              <p className={cn(DESK.body, "min-w-0 text-slate-600")}>{caption}</p>
            </div>
          ) : null}
        </div>
      </div>

      {/* 자료 검토 모달 — 행에서 연다. visible 게이트가 이 모달의 안전장치다(상단 계약). */}
      <MaterialReaderModal
        open={visible && readerMaterial !== null}
        material={readerMaterial}
        budget={readerId ? budgets[readerId] : undefined}
        materials={materials}
        onSelectMaterial={openReview}
        openSection={readerSection}
        onChange={onMaterialChange}
        onClose={() => {
          setReaderId(null);
          setReaderSection(null);
        }}
      />
    </div>
  );
}
