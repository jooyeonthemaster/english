// ============================================================================
// AI 지문 만들기(passage authoring) — 화면 문구 전용 사전
//
// 왜 director-glossary.ts(649줄)에 합치지 않는가:
//   그 파일은 디렉터 콘솔(학생 관제)의 어휘 정본이고, 워크벤치의 지문 조판대와는
//   독자·동사·톤이 전부 다르다. 게다가 공유 파일이라 여러 작업이 동시에 손대면
//   충돌 지점이 된다(v3 §7 "공유 코드는 조율 후 수정"). 이 기능의 문구는 여기에
//   따로 산다.
//
// 이 파일의 존재 이유(강제 규칙):
//   scripts/check-authoring-tokens.mjs 의 게이트 ⑤ — intake/** 의 *.tsx JSX
//   텍스트 노드에 한글 리터럴이 있으면 lint 가 죽는다. 화면에 뜨는 모든 한국어는
//   **반드시** 이 사전을 거친다. 그래야 말투(해요체)·용어가 한곳에서 관리되고,
//   같은 뜻을 다르게 부르는 표류(자료/첨부/파일, 지문함/보관함)가 재발하지 않는다.
//
// 말투 계약
//  · 전량 **해요체**. 기존 문구 중 합쇼체였던 것(“…돌려드립니다”, “…없습니다”)은
//    전부 해요체로 옮겼다 — 같은 자리에 번갈아 찍히는 문장들이라 하나만 합쇼체면
//    상태가 바뀔 때 말투가 튄다.
//  · 유일한 예외는 NOTICE.koreanFixed 다. 그건 안내가 아니라 **규정문**이라
//    합쇼체가 맞다(KoreanFixedBanner).
//  · 판독 주체를 “AI”라고 쓰지 않는다. 텍스트·표·문서·붙여넣기는 브라우저 파싱이라
//    모델 호출이 0이다. “AI”는 **쓰기(생성)** 를 말할 때만 쓴다.
//    (material-chip.tsx:30-32 → material-row.tsx 로 승계된 계약)
//  · “서버”, “파싱”, “조건 완화”, “지시문” 같은 개발자 어휘를 화면에 쓰지 않는다.
//    화면에 실제로 적혀 있는 칸 이름으로만 가리킨다.
//
// 소유권 계약
//  · MATERIAL_ROLE_LABELS / MATERIAL_ROLE_HINTS 는 schema.ts 가 정본이다. 여기서는
//    **재수출만** 한다 — 서버 프롬프트가 소비하는 축 라벨과 화면 문구가 갈라지면
//    선생님이 고른 역할과 실제 동작이 어긋난다.
//  · 같은 이유로 GRADE_BAND/LEXICAL/SYNTAX/PASSAGE_GENRE/TOPIC_FIELD 의 **라벨**도
//    schema.ts 것을 쓴다. 이 파일이 갖는 것은 라벨이 아니라 “고르면 무슨 글이
//    나오는가”를 말하는 **한국어 힌트**다(*_KO_HINTS).
// ============================================================================

import {
  MATERIAL_ROLE_HINTS,
  MATERIAL_ROLE_LABELS,
  type GradeBand,
  type LexicalLevel,
  type PassageGenre,
  type SyntaxLevel,
  type TopicField,
} from "@/lib/passage-authoring/schema";

/** 역할 라벨·힌트는 schema.ts 가 정본 — 재수출만 한다(문구 이중화 금지). */
export { MATERIAL_ROLE_HINTS, MATERIAL_ROLE_LABELS };

/** 천 단위 구분 — 화면의 모든 숫자는 이 형식을 쓴다(자릿수 표류 방지). */
const n = (value: number): string => value.toLocaleString("ko-KR");

// ── 화면 문구 본체 ──────────────────────────────────────────────────────────

export const AUTHORING_COPY = {
  /** 마스트헤드 제목. 「생성」은 내부어라 화면에서는 「만들기」로 쓴다. */
  TITLE: "AI로 지문 만들기",
  /** 제목 옆 한 줄 — 이 기능이 무엇을 요구하는지 전부 말한다. */
  ONELINER: "자료를 붙이고 한 줄만 적으면 새 지문을 써 드려요",

  /**
   * 진입 스위치(직접 입력 표면의 출력 방식 세그먼트) — 이 기능으로 들어오는
   * **유일한 문**이다. 라벨·뱃지·막힘 사유가 전부 여기 산다.
   * ※ 세 모드 중 둘은 이 기능 바깥(그대로 추출·원문 복원)이지만, 한 세그먼트
   *   안에서 나란히 읽히는 문장들이라 말투가 갈라지면 안 된다 — 그래서 한 묶음.
   */
  ENTRY: {
    verbatim: "그대로 추출",
    restored: "AI로 원문 복원",
    authoring: "AI로 지문 생성",
    /** 무료 모드의 뱃지. 유료 모드는 perPassage + CreditCostChip 조합이다. */
    freeBadge: "지문당 무료",
    perPassage: "지문당",
    koRestoredBlocked: "국어 지문은 AI 원문 복원 없이 그대로 등록됩니다.",
    koAuthoringBlocked: "AI 지문 생성은 영어 지문 전용 기능입니다.",
  },

  /** 컬럼 머리표(11/700 0.04em). 전폭 가로선을 만드는 두 헤더의 텍스트. */
  KICKER: {
    brief: "발주",
    result: "조판 결과",
    spec: "지문 설정",
  },

  /** 마스트헤드 우측 상태. */
  MASTHEAD: {
    running: (count: number) => `진행 ${n(count)}건`,
    credits: (balance: number) => `크레딧 ${n(balance)}`,
  },

  /**
   * 주 CTA 가 막힌 이유 — **같은 자리(툴바 아래 한 줄)** 에 번갈아 찍힌다.
   * 하나만 말투가 달라지면 상태가 바뀔 때 문장이 튄다(전부 해요체).
   * 주의: CTA 는 native disabled 로 막지 않는다 — 이 문장 + 힌트 글로우가 규약이다.
   */
  BLOCKED: {
    korean:
      "AI로 지문 만들기는 영어 지문에서만 쓸 수 있어요. 영어 지문을 만드는 화면에서 써 주세요.",
    busy: "지문함에 담는 중이에요. 잠시만 기다려 주세요.",
    /**
     * ⚠️ 이 문장은 **더 이상 CTA 를 잠그는 사유가 아니다**(26-08-04). 판독 중에도
     * 누를 수 있고, 누르면 판독이 끝나는 즉시 자동으로 실행된다 — 그래서 말투가
     * "못 해요"가 아니라 "할게요"다. 종전 문안("자료를 읽고 있어요. 다 읽으면
     * 바로 만들 수 있어요.")은 사실상 **사람이 판독을 지켜보다 다시 누르라는 뜻**
     * 이었고, 사진 한 장이 10~20초 걸리는 구간에서 그 대기가 이 화면의 최대
     * 마찰이었다(오너 지적). 렌더 자리는 그대로 CTA 바로 밑 캡션이다.
     * 되돌리려면 authoring-board 의 queuedStart 배선을 함께 되돌릴 것 — 문구만
     * 바꾸면 "다시 누르면 취소돼요"가 거짓말이 된다.
     */
    reading: "자료를 마저 읽고 바로 시작할게요. 다시 누르면 취소돼요.",
    overCapacity: (max: number) =>
      `자료는 ${n(max)}개까지 넣을 수 있어요. 쓰지 않을 자료를 빼 주세요.`,
    empty: "자료를 넣거나, 어떤 지문을 원하는지 한 줄만 적어 주세요.",
    tooLong: "요청이 너무 길어요 (4,000자까지 적을 수 있어요).",
  },

  /**
   * 경고 층 — blockedReason 과 달리 **막지는 않는다**. 사실 통지이므로
   * attempted 여부와 무관하게 상시 보여 준다(첫 화면 혼내지 않기 계약의 예외).
   */
  WARN: {
    failedMaterials: (count: number) =>
      `읽지 못한 자료 ${n(count)}개는 빼고 만들어요`,
    refundCheck: "환불 확인이 필요해요 — 고객센터에 문의해 주세요.",
    roleUncertain: "역할을 확인해 주세요",
    truncatedRead: "이 배치가 길어 일부가 잘렸어요 — 페이지를 나눠 올려 주세요",
  },

  /** 자료 행 · 역할 드롭다운 · 자료 검토 모달이 공유하는 문구. */
  MATERIAL: {
    reviewTitle: "자료 검토",
    reviewTitleOf: (name: string) => `자료 검토 — ${name}`,
    roleLabel: "역할",
    /** 전달 분량 게이지의 제목. “이번 생성에 실제로 실리는 분량”을 말한다. */
    budgetLabel: "전달 분량",
    budgetBody: (sent: number, total: number) =>
      `전체 ${n(total)}자 중 앞 ${n(sent)}자가 이번 생성에 실려요. 필요한 부분만 남기면 전부 실려요.`,
    budgetShort: (sent: number, total: number) => `${n(sent)}/${n(total)}자`,
    budgetTitle: "이번 생성에 실제로 실리는 분량",
    noteLabel: "이 자료에 대한 요청",
    notePlaceholder: "예: 3단원 어법만 쓰세요",
    /** 하이브리드 토글 — 숨은 자동 결정 금지(표면 스위치로만). */
    sendPages: (pages: number) => `원본 페이지도 함께 보냄 · ${n(pages)}쪽`,
    sendPagesHint: "밑줄·굵게·표가 많은 자료면 켜 두면 더 정확해요",
    failed: "읽지 못했어요 · 이 자료는 빼고 만들어요",
    retry: "다시 읽기",
    reading: "자료를 읽는 중…",
    readingAgain: "다시 읽는 중…",
    /**
     * 사진 전용 진행 라벨. 사진은 OCR 을 돌지 않고 원본만 올린다(26-08-04) —
     * "읽는 중"이라고 적으면 있지도 않은 판독을 기다리는 것처럼 보인다.
     */
    preparingOriginal: "원본을 준비하는 중…",
    /**
     * 자료 검토 모달에서 본문 칸이 비어 있는 사진에 붙는 설명. 빈 칸만 두면
     * "AI 가 글자를 못 읽었나?"로 읽힌다 — 실제로는 읽을 필요가 없어서 안 읽은
     * 것이고, 모델은 이 사진을 원본 그대로 본다.
     */
    originalOnly: "이 사진은 원본 그대로 AI에게 전달돼요. 따로 옮겨 적지 않아도 돼요.",
    /** 자료 4개째부터 목록을 접는다(3번째 스크롤 금지). */
    more: (count: number) => `자료 ${n(count)}개 · 모두 보기`,
    countLine: (count: number) => `붙인 자료 ${n(count)}개`,
    atCapacity: "여기까지만 넣을 수 있어요",
    pastedName: "붙여넣은 텍스트",
    /** 판독 본문 칸 — 이 화면의 15px 두 곳 중 하나. */
    readTextLabel: "이 자료에서 읽어낸 내용",
    readTextPlaceholder: "여기에 자료 내용을 붙여넣거나 직접 적어 주세요.",
    charCount: (chars: number) => `${n(chars)}자`,
    charLineCount: (chars: number, lines: number) =>
      `${n(chars)}자 · ${n(lines)}줄`,
    charLimit: (limit: number) => `${n(limit)}자까지`,
    dirty: "고친 내용 있음",
    stripChoices: (lines: number) => `①②③ 선지 줄 지우기 (${n(lines)}줄)`,
    stripChoicesTitle:
      "줄 맨 앞이 ①②③ 인 줄만 지워요. 되돌리기로 복구할 수 있어요.",
    revertConfirm: "고친 내용을 버리고 처음 담긴 내용으로 돌릴까요?",
    revertTitle: "처음 담긴 내용으로 되돌려요",
    revertNothing: "아직 고친 곳이 없어요",
    /** 자료가 어디서 왔는지 — 확장자·MIME 같은 전문용어를 노출하지 않는다. */
    SOURCE: {
      TEXT: "붙여넣은 텍스트",
      FILE_TEXT: "텍스트 파일",
      FILE_DOC: "문서 파일",
      FILE_SHEET: "표 파일",
      FILE_PDF: "PDF 파일",
      FILE_IMAGE: "사진",
    },
  },

  /** 발주 밴드(컴포저). 상자가 아니라 선과 여백으로만 구성된다. */
  COMPOSER: {
    placeholder:
      "어떤 지문이 필요하신지 적어 주세요.\n예: 분사구문이 자연스럽게 들어간 지문 3편.",
    /** 드래그 중에만 나타난다(평상시 0px). */
    dropHint: "여기에 놓으면 자료로 붙여요",
    pasteHint: "지문은 그대로 붙여넣어도 돼요",
    /** 3,600자부터 뜨는 잔여 카운터. */
    remaining: (left: number) => `${n(left)}자 더 적을 수 있어요`,
    attachTitle: "PDF · 사진 · 워드 · 엑셀 · 한글(hwpx) · 텍스트",
    attachFull: (max: number) => `자료는 ${n(max)}개까지 넣을 수 있어요`,
    startTitle: "지문 만들기 (⌘/Ctrl + Enter)",
  },

  /**
   * 빈 상태 — TabEmpty 의 점선 상자를 쓰지 않는다(상자 금지). 발주 밴드 아래
   * 24px 지점에 결과 밴드의 축소판(견본 조판)을 opacity-45 로 정적 렌더한다.
   */
  EMPTY: {
    kicker: "이렇게 나와요",
    body: "자료를 붙이거나 한 줄만 적으면 이런 결과가 나와요",
    SAMPLE: {
      title: "How Habits Take Hold",
      summary: "습관이 자리 잡는 과정을 신호와 보상으로 설명하는 글이에요",
      lines: [
        "A habit begins as a deliberate choice, but repetition slowly moves it below awareness.",
        "What once required attention becomes a response the brain issues on its own.",
      ],
    },
  },

  /**
   * 버튼 라벨. 전부 AuthoringButton(hero 48 / md 36 / sm 28)으로만 그린다.
   *
   * ⚠️ start / startExcluding 은 **48px 전폭 hero 버튼**의 라벨이다(발주 밴드의
   * 주 CTA). 이 두 문장에는 길이 예산이 있다 — 계산 근거는 전부 코드값이다.
   *   호스트 좌측 패널 하한 380px → 밴드 348px → 버튼 내폭 348 − px-4×2 = 316px.
   *   그 폭에서 단축키 아이콘은 이미 숨어 있고(@max-[420px]:hidden), 남는 보조
   *   표식은 아이콘 20 + 크레딧 칩 ≈35 + gap-2 두 칸(16) = 71px 다.
   *   (칩 35 = Coins 12 + gap 2 + 11px 숫자 두 자리 ≈13 + px-1 8. 편수 상한
   *    MAX_PASSAGES_PER_RUN=6 × 편당 2크레딧이라 숫자는 늘 한두 자리다.)
   *   → 라벨 예산 **245px**. 최장 조합인 "지문 6편 만들기 (자료 12개 제외)"가
   *     14px 기준 ≈226px 라(자료 상한 12 = 두 자리) 최소 폭에서도 한 줄이다.
   * 넘겨도 글자가 상자를 뚫지는 않는다 — hero 는 min-h-12 라 두 줄로 자란다.
   * 다만 밴드 바닥이 그만큼 내려앉으므로, 늘릴 거면 알고 늘릴 것.
   */
  CTA: {
    start: (count: number) => `지문 ${n(count)}편 만들기`,
    startExcluding: (count: number, excluded: number) =>
      `지문 ${n(count)}편 만들기 (자료 ${n(excluded)}개 제외)`,
    attach: "자료 붙이기",
    example: "예시",
    openResults: "결과 보기",
    reopenResults: "다시 열어보기",
    register: (count: number) => `${n(count)}편 지문함에 넣기`,
    registerNone: "넣을 지문이 없어요",
    registering: "지문함에 넣는 중…",
    /** 밴드 지문 카드 안 — 그 편을 그 자리에서 바로 넣는다(26-07-26 인라인 등록). */
    registerOne: "지문함에 넣기",
    registerAll: (count: number) => `${n(count)}편 모두 지문함에 넣기`,
    /** 밴드 카드의 보조 행동 — 결과 모달을 열어 제목·본문을 고친다. */
    editResult: "고치기",
    selectAll: "전체 선택",
    unselectAll: "전체 선택 해제",
    done: "완료",
    revert: "원래대로",
    close: "닫기",
    keep: "그대로 두기",
    discard: "버리고 닫기",
    retryRun: "다시 만들기",
    expandAll: (hidden: number) => `+${n(hidden)}개`,
    collapse: "접기",
  },

  /**
   * 후속 요청 칩 — 누르면 **컴포저를 채우고 스냅샷을 복원할 뿐, 실행하지 않는다.**
   * 이 격하가 “같은 조건으로 다시 만들기”가 몰래 기본값 spec 으로 돌던 사고를
   * 구조적으로 없앤다(스냅샷 계약은 그대로 유지).
   */
  FOLLOWUP: {
    more: (count: number) => `${n(count)}편 더`,
    harder: "한 단계 어렵게",
    otherSpine: "다른 골격으로",
    /** 칩을 누르면 컴포저에 채워지는 실제 요청문. */
    PROMPT: {
      more: (count: number) => `같은 조건으로 ${n(count)}편 더 만들어 주세요`,
      harder: "방금 지문보다 한 단계 어렵게 써 주세요",
      otherSpine: "같은 소재를 다른 골격으로 다시 써 주세요",
      retry: "같은 조건으로 다시 만들어 주세요",
    },
  },

  /** 실행(run) 밴드 — 진행·완료·실패가 같은 형태, 좌측 2px 색만 다르다. */
  RUN: {
    writing: (count: number) => `남은 ${n(count)}편을 쓰고 있어요`,
    writingPreview: "자료를 읽고 구성을 잡는 중이에요…",
    statusWriting: "지문 생성 중",
    progress: (done: number, total: number) => `${n(done)}/${n(total)}편 완성`,
    progressWithEta: (done: number, total: number, eta: string) =>
      `${n(done)}/${n(total)}편 완성 · ${eta}`,
    done: (count: number) => `지문 ${n(count)}편이 완성됐어요`,
    donePartial: (ok: number, failed: number) =>
      `지문 ${n(ok)}편이 완성됐어요 · ${n(failed)}편은 만들지 못했어요`,
    failed: "지문을 만들지 못했어요",
    failedBody:
      "지문을 만드는 중에 문제가 생겼어요. 넣으신 자료나 요청을 조금 줄여서 다시 해 보세요.",
    registered: "지문함에 넣음",
    /** 지문 카드 푸터 — 이 편이 이미 등록됐다는 상태 표식(버튼 아님). */
    itemRegistered: "지문함에 있어요",
    /** PARTIAL 실행에서 실패한 편의 한 줄 표식. order 는 1-based 표시 번호. */
    itemFailed: (order: number) => `지문 ${n(order)}은 만들지 못했어요`,
    restTitles: (rest: number) => `외 ${n(rest)}편`,
    dismissConfirm:
      "아직 지문함에 넣지 않았어요. 닫으면 이 결과를 다시 열 수 없어요.",
    backgroundHint: "다른 작업을 하셔도 돼요. 완성되면 알려 드릴게요.",
    /**
     * 남은 시간 — authoring-types.formatRunEta 가 쓴다. .ts 파일이라 게이트 ⑤
     * (JSX 한글)에는 안 걸리지만, "화면 한국어는 전량 이 사전 경유" 계약은
     * 파일 확장자가 아니라 **화면에 뜨는가**로 판정한다.
     */
    etaSoon: "곧 완료돼요",
    etaSeconds: (sec: number) => `약 ${n(sec)}초 남음`,
    etaMinutes: (min: number) => `약 ${n(min)}분 남음`,
    materialsSent: (count: number) => `자료 ${n(count)}건 전달`,
    skeletons: (codes: readonly string[]) => codes.join(" "),
    /**
     * 복구된 실행에 제목이 없을 때의 카드 제목. 요약 응답의 title 이 비어 있는
     * 경우에만 쓴다(잡은 항상 buildAuthoringJobTitle 로 제목을 갖고 태어난다).
     */
    untitled: "AI 지문 생성",
  },

  /**
   * 실시간 미리보기(StreamPreviewPane) — 지문 1편 발주에서만 뜬다.
   *
   * 왜 이 묶음이 필요한가: 오너 지적("사고하는 과정을 스트리밍으로 보여달라고 했는데
   * 여전히 로딩만 돈다")의 수리다. 패널 자체의 '사고 중/작성 중' 배지는 공유
   * 컴포넌트가 갖고, 여기 있는 것은 **이 기능이 지금 어느 단계인지**를 말하는 꼬리표와
   * 델타가 아직 없을 때 자리를 지키는 문장이다.
   *
   * ⚠️ stage 라벨은 패널 헤더 우측 한 줄에 truncate 로 들어간다 — 12자 안쪽으로 쓴다.
   */
  PREVIEW: {
    /**
     * 첫 델타가 도착하기 전. 빈 패널을 띄우지 않기 위한 자리 문장.
     * (RUN.writingPreview 와 뜻이 겹치지 않게 쓴다 — 저건 밴드 상태 줄용이고
     *  이건 사고 단계의 패널 본문이다.)
     */
    waiting: "무엇을 어떻게 쓸지 정하고 있어요…",
    /** 1차 집필 단계. */
    stageDraft: "초안",
    /** 봉투(분량·문장 길이) 수리 단계. */
    stageRevise: "분량 손질",
    /** 마크다운 판독 실패로 기존 방식으로 되돌아간 단계. */
    stageFallback: "다시 쓰는 중",
    /** 수리 단계로 되감을 때 패널 본문에 적히는 사실 한 줄. */
    reviseBody: "분량이 목표를 벗어나 같은 지문을 다시 다듬고 있어요…",
    /** 폴백 단계 본문. '파싱'·'서버' 같은 개발자 어휘를 쓰지 않는다. */
    fallbackBody: "결과를 읽지 못해 처음부터 다시 쓰고 있어요…",
  },

  /**
   * 과금 문구 — **아는 것만** 말한다. “환불했어요”는 잔액에 대한 사실 주장이라,
   * 서버 왕복이 성사되지 않은 실패에까지 붙이면 화면이 거짓말을 한다.
   * ⚠️ REFUND_CHECK_MARK 가 섞여 있으면 refundCheck **하나만** 반환한다
   *    (‘돌려드려요’와 ‘확인이 필요해요’가 같은 카드에서 동시에 뜨던 사고).
   */
  CREDIT: {
    refundAuto: "만들지 못한 편의 크레딧은 자동으로 돌려드려요.",
    notCharged: "크레딧은 차감되지 않았어요.",
    refundCheck: "환불 확인이 필요해요 — 고객센터에 문의해 주세요.",
    perPassage: (unit: number) => `편당 크레딧 ${n(unit)}`,
    total: (credits: number) => `크레딧 ${n(credits)}`,
    refundHint: "만들지 못한 편은 크레딧을 돌려드려요",
  },

  /** 결과 카드 1편. */
  RESULT: {
    order: (order: number) => `지문 ${n(order)}`,
    titlePlaceholder: "지문 제목",
    bodyPlaceholder: "지문 본문",
    /** 오너가 요구한 “강박적 설계”의 가시화 — plan 블록. */
    planTitle: "이렇게 설계했어요",
    planThesis: "중심 주장",
    planWarrantA: "근거 하나",
    planWarrantB: "근거 둘",
    planTurn: "전환",
    planGrounding: "접지",
    planClosing: "마무리",
    whyTitle: "왜 이렇게 썼나요",
    /** 밴드 지문 카드 안 — 본문 아래 한국어 풀이(요약+집필 근거) 머리표. */
    interpretTitle: "해석",
    /**
     * 지표 덩어리의 머리표. "분석했어요"가 아니라 "세어 봤어요"인 이유는, 이 아래
     * 숫자가 전부 **본문에서 직접 센 값**이기 때문이다(모델의 판단이 하나도 섞여
     * 있지 않다). 같은 컬럼의 '이렇게 설계했어요'·'왜 이렇게 썼나요'가 모델의
     * 주장인 것과 층위가 갈린다 — 이 화면의 정직성 규칙을 머리표가 먼저 말한다.
     * 그리고 이 숫자들은 **편집할 때마다 다시 센다** — 그래서 과거형이 아니라
     * 늘 방금 센 값이다.
     */
    metricsTitle: "본문을 세어 봤어요",
    materialsUsed: (count: number) => `자료 ${n(count)}건 전달`,
    materialsUsedWithChars: (count: number, sent: number, total: number) =>
      `자료 ${n(count)}건 전달 · ${n(sent)}/${n(total)}자`,
    failedOne: "이 편은 만들지 못했어요",
    failedBody: "만드는 중에 문제가 생겼어요. 설정을 조금 낮춰서 다시 만들어 보세요.",
    failedCredit:
      "이 편에 쓰인 크레딧은 자동으로 돌려드려요. 나머지 편은 그대로 지문함에 넣을 수 있어요.",
  },

  /** 지표 — 셀 수 있는 값은 서버가 센다. 화면은 그 사실을 그대로 읽는다. */
  METRIC: {
    words: "단어",
    sentences: "문장",
    avgSentence: "평균 문장",
    longestSentence: "가장 긴 문장",
    shortestSentence: "가장 짧은 문장",
    paragraphs: "문단",
    unitWords: "단어",
    lengthCv: "문장 길이 편차",
    lengthSpan: "길이 폭",
    connective: "연결사",
    nominal: "명사화",
    targetSame: "목표와 동일",
    targetDelta: (target: number, delta: number) =>
      `목표 ${n(target)} 대비 ${delta > 0 ? "+" : ""}${delta}%`,
    /** offTarget 은 색으로 겁주지 않는다(rose 는 ‘실패’로 읽힌다) — 문장으로만. */
    offTarget: (short: boolean) =>
      short
        ? "목표보다 조금 짧아요 — 필요하면 본문을 직접 다듬어 주세요"
        : "목표보다 조금 길어요 — 필요하면 본문을 직접 다듬어 주세요",
    /** 기출 대비 판정은 ‘범위 안 / 벗어남’만. 자동 재생성은 하지 않는다. */
    inRange: "기출 범위 안",
    outOfRange: "기출 범위 밖",
  },

  // ⚠️ COVERAGE 묶음은 **의도적으로 없다**(26-08-04 오너 결정 — 화면만 제거).
  //   "표제어 200개 중 24개 · 12%" 는 선생님이 읽고 할 행동이 없는 숫자였고,
  //   분모(=올린 단어장 크기)가 지문 길이와 무관해서 정상 결과가 늘 실패처럼
  //   보였다. 렌더 층(authoring-coverage-panel.tsx)과 함께 걷어냈다.
  //   **계산·스키마는 그대로 살아 있다**(metrics.computeCoverage ·
  //   schema.AuthoringCoverage · DB 저장값). 되살릴 때는 이 자리에 사전을 먼저
  //   복구하고 패널을 새로 그린다 — 문구를 tsx 에 손코딩하면 게이트 ⑤ 에 걸린다.

  /** 결과 검토 모달. */
  RESULTS_MODAL: {
    title: "AI가 만든 지문",
    selected: (count: number) => `${n(count)}편 선택됨`,
    totalWords: (words: number) => `총 ${n(words)}단어`,
    stillWriting: (done: number, total: number) =>
      `${n(done)}/${n(total)}편 완성 — 나머지도 곧 도착해요`,
    pickHint: "마음에 드는 편만 골라 넣을 수 있어요. 제목과 본문은 지금 바로 고쳐도 돼요.",
    loading: "완성된 지문을 불러오는 중이에요…",
    none: "아직 완성된 지문이 없어요. 첫 편이 도착하면 여기에 나타나요.",
    needSelection: "지문함에 넣을 지문을 하나 이상 선택해 주세요.",
  },

  /** 설계 레일 · 설정 패널. 한 항목 = 한 줄(h-9) 계약을 문구로도 지킨다. */
  SPEC: {
    railTitle: "지문 설정",
    railHint: "한 번 정해 두면 계속 쓰여요",
    /** 컬럼 헤더 우측 요약 — “고2 · 165단어 · 3편”. */
    summary: (grade: string, words: number, count: number) =>
      `${grade} · ${n(words)}단어 · ${n(count)}편`,
    GROUP: {
      difficulty: "얼마나 어렵게",
      content: "무엇을 쓸까",
      usage: "어떻게 낼까",
      quantity: "몇 편 만들까",
    },
    ROW: {
      gradeBand: "읽는 사람",
      lexical: "단어",
      syntax: "문장",
      length: "분량",
      spine: "뼈대",
      topicField: "소재",
      questionKinds: "겨냥 문항",
      examTrack: "용도",
      count: "만들 편수",
      diversify: "소재",
    },
    HINT: {
      gradeBand: "이 학년이 읽을 수 있는 어휘·문장·소재의 기준을 잡아요",
      lexical: "그 학년 기준보다 단어를 더 쉽게 할지, 어렵게 할지 정해요",
      syntax: "그 학년 기준보다 문장을 더 짧게 할지, 길게 할지 정해요",
      length: "글이 얼마나 길지 정해요",
      spine: "글의 갈래와 논리 뼈대를 정해요",
      topicField: "어떤 분야에서 소재를 고를지 정해요",
      questionKinds: "이 지문으로 낼 문항을 최대 3개까지 겨냥해요",
      examTrack: "어디에 쓸 지문인지 정해요 — 문장 밀도와 함정이 달라져요",
      count: "한 번에 여러 편을 만들 수 있어요",
      diversify: "여러 편을 만들 때 편끼리 소재를 어떻게 할지 정해요",
    },
    /**
     * 뼈대 팝오버는 축이 둘(갈래 + 골격)이라 소제목이 필요하다. 한때 spec-panel 이
     * 이 두 문자열을 손코딩했다(사전이 그 작업 단계의 배정 밖이었다) — 이 파일이
     * 화면 한국어의 유일한 소유자라는 계약의 예외를 만들지 않도록 여기로 옮겼다.
     */
    SPINE: {
      genreTitle: "글의 갈래",
      skeletonTitle: "논지가 꺾이는 순서",
    },
    lengthPresetTitle: "자주 쓰는 분량",
    lengthCustomTitle: "직접 정하기",
    words: (words: number) => `${n(words)}단어`,
    aboutWords: (words: number) => `약 ${n(words)}단어`,
    passages: (count: number) => `${n(count)}편`,
    questionKindsNone: "겨냥하지 않기",
    questionKindsMax: "최대 3개까지 고를 수 있어요",
    /**
     * 간소 모드(스튜디오 호스트 — §3.9v2.8 D10) 컴포저 툴바의 팝오버 버튼 라벨.
     * 뜻은 ROW.length / ROW.count 와 같지만 툴바는 한 줄 폭 예산이 좁아 더 짧게
     * 쓴다(「만들 편수」→「편수」). 값 표기는 aboutWords / passages 를 그대로
     * 재사용한다 — 같은 축이 두 호스트에서 다른 말을 쓰면 안 된다.
     */
    SIMPLE: {
      length: "분량",
      count: "편수",
    },
    DIVERSIFY: {
      differentLabel: "서로 다르게",
      differentHint: "편마다 다른 소재를 골라 겹치지 않게 써요",
      sameLabel: "같은 소재로",
      sameHint: "같은 소재를 여러 각도로 다시 써요 — 한 단원 반복 훈련용",
    },
  },

  /**
   * 토스트 — 실행/완료/실패/등록의 유일한 알림 경로.
   *
   * ⚠️ **여기 있는 모든 키는 반드시 소비처가 있어야 한다.** 이 묶음은 화면 문구가
   * .ts 파일(스토어·판독 훅·투입 어댑터)에서 손코딩되기 쉬운 자리라, 게이트 ⑤
   * (tsx JSX 한글)가 잡지 못한다. 실제로 한때 completed/completedPartial/failed 가
   * 사용처 0건 사문이 된 채 화면에는 갈라진 사본이 떴고("만들지 못했어요"↔
   * "실패했어요", "다시 시도해 주세요"↔"다시 시도해주세요"), 그 뒤에도
   * materialTooLong·materialLimitFull·materialLimitPartial·materialReadFailed·
   * materialNoText·pastedRetry 여섯 개가 같은 방식으로 사문으로 남아 있었다
   * (실제 화면에는 "…넣었습니다" 합쇼체 사본이 떠 이 사전의 말투 계약도 깨져 있었다).
   * → tests/unit/passage-authoring-copy-ownership.test.mjs 가 (a) 키별 소비처 존재와
   *   (b) 조판대 소스의 toast(한글 리터럴) 부재를 함께 잠근다.
   */
  TOAST: {
    started: (count: number) =>
      `지문 ${n(count)}편을 만들기 시작했어요. 다른 작업을 하셔도 돼요.`,
    completed: (count: number) => `지문 ${n(count)}편이 완성됐어요`,
    completedPartial: (ok: number, failed: number) =>
      `지문 ${n(ok)}편이 완성됐어요 · ${n(failed)}편은 만들지 못했어요`,
    failed: "지문을 만들지 못했어요. 잠시 후 다시 시도해 주세요.",
    registered: (count: number) => `지문 ${n(count)}편을 지문함에 넣었어요.`,
    // ── 인라인 편집기(워크스페이스 지문 행)에서 오는 문구 (26-08-04) ──────────
    // 변형본은 원본 Passage id 가 있어야 계보가 서므로, 미등록 편은 변형을 누르는
    // 순간 원본이 먼저 지문함에 들어간다. 그 사실을 말하지 않으면 "왜 지문함에
    // 생겼지"가 된다.
    registeredForVariant: "변형본을 만들려고 원본을 먼저 지문함에 넣었어요.",
    registerFailed: "지문함에 넣지 못했어요. 잠시 후 다시 시도해 주세요.",
    tooShortToSave: "지문이 너무 짧아 저장할 수 없어요. (최소 20자)",
    variantSaved: "변형본을 지문함에 넣었어요.",
    variantEmpty: "변형본 제목이나 본문이 비어 있어요.",
    variantFailed: "변형본을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.",
    pastedAsMaterial: "붙여넣은 내용을 자료로 넣었어요",
    pastedAsMaterialHint: "요청으로 쓰시려면 자료 행의 ×를 눌러 빼 주세요.",
    unsupportedMore: (first: string, rest: number) =>
      `${first} (그 외 ${n(rest)}개도 함께 제외했어요)`,
    materialTooLong: "자료가 너무 길어 앞부분만 담았어요. 필요한 부분만 남겨 주세요.",
    materialLimitFull: (max: number) =>
      `자료는 ${n(max)}개까지 넣을 수 있어요. 쓰지 않을 자료를 먼저 빼 주세요.`,
    materialLimitPartial: (max: number, taken: number) =>
      `자료는 ${n(max)}개까지예요. 앞의 ${n(taken)}개만 넣었어요.`,
    materialOverLimit: (limit: number) =>
      `자료 하나에는 ${n(limit)}자까지 담을 수 있어요. 넘는 부분은 담지 않았어요.`,
    materialReadFailed: "이 자료를 읽지 못했어요.",
    materialNoText: "이 자료에서 읽어낼 글자를 찾지 못했어요. 내용을 붙여넣어 주세요.",
    pastedRetry: "붙여넣은 자료는 자료 검토에서 직접 고쳐 주세요.",
    choiceLinesRemoved: (lines: number) =>
      `선지 ${n(lines)}줄을 지웠어요. 아니다 싶으면 되돌리기를 눌러요.`,
    reverted: "처음 담긴 내용으로 되돌렸어요.",
    /** 하이브리드 첨부 실패 — 텍스트만으로 계속 간다는 사실을 함께 말한다. */
    pageUploadFailed: "원본 페이지를 올리지 못했어요. 텍스트만으로 만들어요.",
    /**
     * 시작 왕복 실패 — 잡 레인·스트림 레인이 함께 쓴다. 서버가 사유를 주면 그것이
     * 우선이고 이 둘은 폴백이다. 위 failed 와 **같은 토스트 자리**에 번갈아 찍히므로
     * 종결부(“다시 시도해 주세요”)까지 한 글자도 다르면 안 된다.
     */
    startFailed: "지문 생성을 시작하지 못했어요. 잠시 후 다시 시도해 주세요.",
    jobRegisterFailed: "생성 작업을 등록하지 못했어요. 잠시 후 다시 시도해 주세요.",
    /**
     * 402. 리포 다른 화면들은 “크레딧이 부족합니다.”(합쇼체)를 쓰지만, 이 자리는
     * started/failed 와 번갈아 찍히는 **같은 토스트 슬롯**이라 이 사전의 말투 계약
     * (전량 해요체, 예외는 NOTICE 하나)을 따른다. 숫자는 n() 로 자릿수를 맞춘다.
     */
    insufficientCredits: (balance: number, required: number) =>
      `크레딧이 부족해요. (보유 ${n(balance)} · 필요 ${n(required)})`,
    /**
     * 응답을 받지 못했을 때. **“실패했다”고 단정하지 않는다** — 단정하면 서버가
     * 정상 과금·정상 생성 중인 실행을 사용자가 다시 눌러 이중 과금한다.
     * (“서버”는 이 사전이 금지한 개발자 어휘라 쓰지 않는다.)
     */
    deliveryUnknown:
      "요청이 전달됐는지 확인하지 못했어요. 진행 중인 생성이 있는지 확인하고 있어요 — 없으면 다시 시도해 주세요.",
  },

  /** 스크린리더 전용 이름 — 화면에 안 보여도 한국어 문구다(사전 경유 대상). */
  A11Y: {
    section: "AI로 지문 만들기",
    runList: "지문 만들기 진행",
    instruction: "어떤 지문을 만들지 적어 주세요",
    attach: "자료 붙이기 — PDF · 사진 · 워드 · 엑셀 · 한글(hwpx) · 텍스트",
    removeMaterial: (name: string) => `${name} 빼기`,
    openMaterial: (name: string) => `${name} 자료 검토 열기`,
    sendPages: (pages: number) => `원본 ${n(pages)}쪽 함께 보냄`,
    closeRunCard: "이 결과 카드 닫기",
    selectPassage: (order: number, selected: boolean) =>
      `지문 ${n(order)} ${selected ? "선택 해제" : "선택"}`,
    /** 밴드 지문 카드의 셰브런 토글 — 제목 버튼과 별개 조작점이라 이름이 필요하다. */
    togglePassage: (expanded: boolean) => (expanded ? "지문 접기" : "지문 펼치기"),
    passageTitle: (order: number) => `지문 ${n(order)} 제목`,
    railResize: "설정 패널 폭 조절",
    railResizeTitle: "드래그하여 설정 패널 폭 조절 (더블클릭: 기본 폭)",
    targetWords: "목표 단어 수",
  },

  /**
   * 규정문 — 이 사전에서 **유일한 합쇼체**다. 안내가 아니라 “쓸 수 없다”는 규칙을
   * 알리는 문장이라 해요체로 쓰면 오히려 톤이 흔들린다.
   * 톤은 slate(border-slate-200 bg-slate-50 + Info) — amber 금지(page-frame.tsx:9).
   */
  NOTICE: {
    koreanFixed:
      "AI 지문 만들기는 영어 지문 전용 기능입니다. 지금은 국어로 고정되어 있어 만들 수 없습니다.",
  },
} as const;

// ── 예시 요청문 ─────────────────────────────────────────────────────────────
// 툴바 [예시] 뒤에 접혀 있다가, 고르면 요청 칸에 한 줄로 붙는다.
//
// **한 줄 예산: 한글 20자 + 공백 6칸.** (실측 근거) 팝오버는 w-[340px] · p-1(4px) ·
// 항목 px-2(8px) 라 글자가 쓸 수 있는 폭은 340 − 8 − 16 = **316px** 이다.
// DESK.body 는 13px 이고 한글 글리프가 약 13px, 공백이 약 4px 이므로
// 20자 + 6칸 ≈ 260 + 24 = 284px 로 32px 여유가 남는다.
// 이 예산을 넘기면 그 줄만 두 줄이 되어 목록의 항목 높이가 들쭉날쭉해진다
// (26-07-26 오너 지적: "넣어 둔 어법 포인트가 자연스럽게 들어가게 써 주세요"가
//  29글리프 ≈ 314px 로 316px 경계에 걸려 혼자 접혀 있었다).
// ⚠️ 자르지 않는다(truncate 금지 — 이 디렉터리 공통 계약). 폭을 늘리는 대신
//    **문구를 예산 안으로 쓴다**. 문구가 길어져야만 한다면 팝오버 폭을 먼저 늘려라.
//
// 그리고 세 가지를 지킨다.
//  · 완결된 요청문으로 적는다. 조각("…들어간 지문")은 다른 줄과 이어 붙었을 때
//    무엇을 시키는 말인지 모델도 사람도 알 수 없다.
//  · "이 / 두 지문"처럼 화면에 없는 대상을 가리키지 않는다("넣어 둔"은 자료 행이
//    화면에 있으므로 가리켜도 된다).
//  · **학년을 말하지 않는다.** 학년은 설정 레일(spec.gradeBand)이 정하는데 요청문이
//    또 말하면 한 요청 안에 학년 신호가 둘이 되어 모델이 어느 쪽을 따를지 모른다.
//
// 목록 구성(§3.9v2.8 — 26-08-11 6개 → 12개 다양화): 세 묶음으로 짠다.
//  ① 자료 활용 — 붙인 자료를 어떻게 쓸까(어법·단어장·지문 병합)
//  ② 주제·갈래 — 무엇을 다룰까(과학 실험/역사/그래프·도표/편지/환경/경제/우화)
//  ③ 문장·구성 — 어떻게 쓸까(난이도·주제문 위치)
// 12개 × min-h-9(36px) = 432px 로 팝오버 높이 상한(30rem=480px) 안이다 —
// 더 늘리면 목록이 팝오버 안에서 스크롤되기 시작한다(늘릴 거면 알고 늘릴 것).
export const INSTRUCTION_EXAMPLES: readonly string[] = [
  // ── ① 자료 활용 ──
  // 19자+6칸 ≈ 271px — 종전 22자+7칸(≈314px)에서 "들어가게"를 "녹여"로 줄였다.
  "넣어 둔 어법 포인트를 자연스럽게 녹여 주세요",
  "단어장 단어를 최대한 많이 써 주세요",
  // 18자+6칸 → 15자+5칸. "내용을"은 "엮어"에 이미 함축돼 있어 뺐다.
  "넣어 둔 지문들을 하나로 엮어 주세요",
  // ── ② 주제·갈래 ── (전부 비공백 ≤17자·글리프 ≤23 — copy-budget 예산 안)
  "실험 결과를 소개하는 글로 써 주세요",
  "역사 속 사건을 소재로 써 주세요",
  "그래프 해석이 필요한 글로 써 주세요",
  "편지 형식의 글로 써 주세요",
  "환경 문제를 다루는 글로 써 주세요",
  "경제 개념을 쉽게 풀어 써 주세요",
  "동물 우화로 교훈을 전하는 글로 써 주세요",
  // ── ③ 문장·구성 ──
  "문장을 조금 더 쉽게 써 주세요",
  "마지막 문장에 주제가 드러나게 써 주세요",
];

// ── 설정 축 한국어 힌트 ─────────────────────────────────────────────────────
// 전부 "고르면 무슨 글이 나오는가"만 말한다. 축의 이름을 되풀이하지 않는다
// ("어려운 어휘: 어휘가 어려워요"는 아무것도 알려주지 않는다).
//
// ⚠️ 이 힌트들은 모델에게 가는 영어 힌트(prompts.ts)의 한국어 짝이다. 한쪽만
//    고치면 "화면 설명"과 "실제 생성물"이 갈라진다 — 반드시 같이 고친다.

export const GRADE_BAND_KO_HINTS: Record<GradeBand, string> = {
  MIDDLE_1: "일상 소재 · 현재/과거 시제 위주의 짧고 또렷한 문장으로 써요",
  MIDDLE_2: "익숙한 소재에 설명을 조금 얹고, 접속사로 이어지는 문장을 써요",
  MIDDLE_3: "관계대명사·to부정사가 자연스럽게 섞인 조금 긴 문장을 써요",
  HIGH_1: "고1 모의고사 수준 — 한 가지 주장이 또렷하게 보이는 글을 써요",
  HIGH_2: "고2 모의고사 수준 — 추상적인 개념어와 분사구문이 섞인 학술적인 글이에요",
  HIGH_3: "고3 수준 — 수능에 가까운 밀도와 논리 전환이 들어가요",
  CSAT: "수능 수준 — 가장 촘촘한 학술 문체와 높은 추상도로 써요",
};

/**
 * 단어 축. 이 축은 절대값이 아니라 **학년 기준에 대한 오프셋**이다(prompts.ts 의
 * applyOffset 이 학년 파라미터 한 행을 그만큼 밀어 준다). 그래서 라벨도
 * '한 단계 쉽게 / 학년 기준 / 한 단계 어렵게'로 바뀐다(schema.ts LABELS).
 */
export const LEXICAL_KO_HINTS: Record<LexicalLevel, string> = {
  EASY: "자주 쓰는 쉬운 단어만 써요. 어려운 말이 꼭 필요하면 앞뒤 문장으로 뜻이 풀리게 해요",
  STANDARD: "고른 학년의 모의고사에서 보던 정도로 써요",
  HARD: "추상적인 개념어와 잘 안 쓰는 학술 어휘를 일부러 섞어요",
};

export const SYNTAX_KO_HINTS: Record<SyntaxLevel, string> = {
  SIMPLE: "한 문장에 한 가지만 담고, 연결어를 겉으로 드러내요",
  STANDARD: "짧은 문장과 긴 문장을 자연스럽게 섞어 써요",
  COMPLEX: "분사구문·관계절이 자주 겹치는 수능 수준의 밀도로 써요",
};

/** 목록 항목에 한 줄로 붙는 부연. 레일 최소폭(280px)에서 한 줄에 들어가게 짧게. */
export const PASSAGE_GENRE_KO_HINTS: Record<PassageGenre, string> = {
  AUTO: "자료와 요청에 맞는 형식을 AI가 골라요",
  EXPOSITORY: "뜻 → 원리 → 의미 순서로 풀어 써요",
  ARGUMENTATIVE: "주장 → 근거 → 반론까지 짚어요",
  RESEARCH: "절차 → 결과 → 해석 순서로 써요",
  NARRATIVE: "한 사람의 일화와 그 끝의 깨달음을 써요",
  PRACTICAL: "안내문·편지처럼 목적이 뚜렷한 글을 써요",
};

export const TOPIC_FIELD_KO_HINTS: Record<TopicField, string> = {
  AUTO: "자료와 요청에 어울리는 소재를 AI가 골라요",
  SCIENCE: "물리·생물·화학·천문",
  HUMANITIES: "역사·윤리·언어·사상",
  SOCIAL: "사회·시장·제도·정책",
  ARTS: "음악·미술·영화·건축·디자인",
  ENVIRONMENT: "생태·기후·자연 보전",
  PSYCHOLOGY: "인지·학습·동기·교육",
  SPORTS_HEALTH: "운동·음식·건강",
  TECH: "컴퓨터·AI·통신·공학",
};

/**
 * 용도(examTrack) 힌트. 축(enum)과 라벨의 정본은 schema.ts 이므로 여기서는
 * 코드 문자열로 느슨하게 잡는다 — schema 에 EXAM_TRACKS 가 들어온 뒤 그 타입으로
 * 좁히면 된다(그때까지 Record<string,string> 이 컴파일을 막지 않는다).
 */
export const EXAM_TRACK_KO_HINTS: Record<string, string> = {
  CSAT_STYLE: "수능·모평의 밀도와 논리 전환에 맞춰 써요",
  SCHOOL_EXAM: "교과서 단원에서 다루는 범위로 좁혀 내신 시험지에 맞춰 써요",
  TEXTBOOK_VARIANT: "넣어 둔 지문을 알아볼 수 있게 변형해요",
};

// ── 독자 호칭 · 읽기 시간 ───────────────────────────────────────────────────
// GRADE_BAND_LABELS 는 세그먼트 버튼용 **짧은 라벨**이라 CSAT 이 그냥 "수능"이다.
// 그걸 문장에 그대로 끼우면 "수능 학생이 읽으면…"이라는, 한국어에 없는 말이 나온다.
// 문장 안에 들어갈 때는 이 사전을 쓴다(버튼 라벨은 짧게 그대로 둔다).

export const GRADE_BAND_READER_LABELS: Record<GradeBand, string> = {
  MIDDLE_1: "중1 학생",
  MIDDLE_2: "중2 학생",
  MIDDLE_3: "중3 학생",
  HIGH_1: "고1 학생",
  HIGH_2: "고2 학생",
  HIGH_3: "고3 학생",
  CSAT: "수능 수험생",
};

/** 학년대별 영어 독해 속도(분당 단어) — 이 사전이 문장을 만들기 위해서만 쓴다. */
const READING_WPM: Record<GradeBand, number> = {
  MIDDLE_1: 60,
  MIDDLE_2: 70,
  MIDDLE_3: 80,
  HIGH_1: 90,
  HIGH_2: 100,
  HIGH_3: 110,
  CSAT: 120,
};

/**
 * "약 1분 30초" 같은 사람 말. 분량을 움직일 때 단어 수보다 이 문구가 먼저 읽힌다 —
 * 선생님은 단어 수가 아니라 수업 시간으로 분량을 가늠하기 때문이다.
 */
export function formatReadingTime(words: number, grade: GradeBand): string {
  const seconds = Math.round((words / READING_WPM[grade]) * 60);
  if (seconds < 60) return `약 ${Math.max(10, Math.round(seconds / 5) * 5)}초`;
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round((seconds % 60) / 10) * 10;
  if (rest === 60) return `약 ${minutes + 1}분`;
  if (rest === 0) return `약 ${minutes}분`;
  return `약 ${minutes}분 ${rest}초`;
}

/** "고2 학생이 읽으면 약 1분 30초 걸리는 분량이에요" 전체 문장. */
export function describeReadingLoad(words: number, grade: GradeBand): string {
  return `${GRADE_BAND_READER_LABELS[grade]}이 읽으면 ${formatReadingTime(
    words,
    grade,
  )} 걸리는 분량이에요`;
}
