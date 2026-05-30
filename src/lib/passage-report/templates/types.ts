import type {
  BlockKind,
  BlockStyle,
  PageBackground,
  PageMargin,
  ReportTheme,
  TemplateId,
} from "../schema";

/**
 * 디자인 템플릿 시스템.
 *
 * 사용자의 핵심 인사이트: 템플릿 = 디자인 스타일 (콘텐츠는 항상 풀세트).
 * 즉, AI는 "어떤 콘텐츠를 넣을지" 가 아니라 "어떤 시각 스킨으로 풀세트를 보여줄지" 결정.
 *
 * 각 템플릿은:
 *   - theme: 기본 컬러 팔레트 + 폰트 변수
 *   - pages[]: 페이지별 슬롯 테이블 (블록 종류 + 좌표/크기 + 스타일 preset)
 *   - extraPageSlot(): 콘텐츠가 많아 페이지가 늘어날 때 사용할 슬롯 생성기
 */

/** 슬롯 = 페이지 위에 미리 정의된 블록 자리. AI/어댑터는 이 슬롯에 콘텐츠만 채움. */
export interface SlotPreset {
  /** 템플릿 내 슬롯 식별자 (AI Plan 단계에서 sourceRef 매핑용) */
  slotId: string;
  blockKind: BlockKind;
  /** mm 단위 좌표/크기 */
  x: number;
  y: number;
  w: number;
  h: number;
  /** 회전 (-180 ~ 180). 기본 0 */
  rotation?: number;
  /** z-index. 같은 페이지에서 겹칠 때 위로 올라옴 */
  zIndex?: number;
  /** 이 슬롯 블록에 기본 적용될 스타일 (사용자가 인스펙터로 변경 가능) */
  defaultStyle?: Partial<BlockStyle>;
  /** AI Plan 단계에서 참고할 hint ("어휘 4개 위주", "킬러 문장 1개" 등) */
  hint?: string;
  /** 어떤 분석 데이터 소스를 매핑할지 (어댑터/AI 매핑용) */
  sourceKind?:
    | "passageMeta"
    | "passageBody"
    | "vocab"
    | "grammar"
    | "syntax"
    | "summary"
    | "logicFlow"
    | "examPoint"
    | "decorative";
}

export interface PageTemplate {
  pageNumber: number;
  background?: PageBackground;
  margin?: PageMargin;
  slots: SlotPreset[];
}

/** 추가 페이지가 필요할 때 (어휘가 많아서 1페이지 초과 등) 사용할 슬롯 생성기. */
export type ExtraPageSlotFactory = (
  pageNumber: number,
  options: { primaryKind: BlockKind },
) => PageTemplate;

export interface DesignTemplate {
  id: TemplateId;
  label: string;
  description: string;
  /** 미리보기 썸네일 (public/templates/{id}.png 등) — UI에서 사용 */
  thumbnail?: string;
  theme: ReportTheme;
  pages: PageTemplate[];
  extraPage: ExtraPageSlotFactory;
}

/** 슬롯을 실제 Block 좌표로 변환할 때 사용할 부분 정보 */
export interface SlotGeometry {
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  zIndex: number;
  style: Partial<BlockStyle>;
}

export function slotToGeometry(slot: SlotPreset): SlotGeometry {
  return {
    x: slot.x,
    y: slot.y,
    w: slot.w,
    h: slot.h,
    rotation: slot.rotation ?? 0,
    zIndex: slot.zIndex ?? 0,
    style: slot.defaultStyle ?? {},
  };
}
