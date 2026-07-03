export type OptionItem = { label: string; text: string };

// 워드프로세서식 빈 줄로 삽입된 여백(spacer) 블록을 표시하는 마커. blockText 에 넣어
// 두면(spacer 는 blockText 를 렌더하지 않으므로 무해) 미리보기에서 점선 박스 없이 순수
// 여백으로 그린다. 일반 '여백' 블록(툴바 삽입)과 구분하기 위함이며 저장/복원에 보존된다.
export const LINE_GAP_MARKER = "__linegap__";

// line-gap 여백은 한 줄씩 일관되게 자라야 하므로 일반 여백(8~160px)과 달리 훨씬 큰
// 상한까지 한 블록 안에서 키운다. 상한을 둬 폭주만 막는다(정상 사용에선 도달 불가).
export const LINE_GAP_MAX_PX = 2000;

// 한 항목이 워드프로세서식 빈 줄(line-gap) 여백인지 — 렌더/페이지네이션/패널에서 공통 사용.
export function isLineGapItem(item: {
  blockType: PaperBlockType;
  blockText: string;
}): boolean {
  return item.blockType === "spacer" && item.blockText === LINE_GAP_MARKER;
}

export type BuilderQuestion = {
  id: string;
  type: string;
  subType: string | null;
  questionText: string;
  structuredData?: unknown;
  options: string | null;
  correctAnswer: string;
  points: number;
  difficulty: string;
  tags: string | null;
  aiGenerated: boolean;
  approved: boolean;
  starred: boolean;
  createdAt: Date | string;
  // 장문 세트(43~45처럼 지문 1회+N문항) membership. 솔로 문항은 null/undefined.
  // 시험지에서 같은 setId 멤버를 한 그룹으로 묶어 공유 지문을 1회만 출력하는 데 쓴다.
  setId?: string | null;
  passage: {
    id: string;
    title: string;
    content: string;
    grade: number | null;
    semester: string | null;
    publisher: string | null;
    school: { id: string; name: string } | null;
  } | null;
  // 좌측 목록 초기 로드는 페이로드 절감을 위해 해설 '본문'을 빼고 explanation:{id}
  // 만 싣는다(=해설 있음 신호 → 카드 '해설 보기' 버튼 노출 유지). 본문/핵심포인트/
  // 오답해설은 마운트 후 getExamPaperBuilderExplanations 로 백그라운드 병합되므로
  // 옵셔널이다. by-ids 배치 로드(getExamPaperBuilderQuestionsByIds)는 풀로 채운다.
  explanation: {
    id: string;
    content?: string;
    keyPoints?: string | null;
    wrongOptionExplanations?: string | null;
  } | null;
  collectionItems: { collectionId: string }[];
  examLinks: { exam: { id: string; title: string; createdAt: Date | string } }[];
  _count: { examLinks: number };
};

export type QuestionCollection = {
  id: string;
  name: string;
  color: string | null;
  parentId: string | null;
  _count: { items: number; children: number };
};

export type ClassOption = { id: string; name: string };
export type SchoolOption = { id: string; name: string };

export type PaperTemplate = "clean" | "mock" | "worksheet" | "minimal" | "academy" | "modern" | "classic" | "colorband";
export type Density = "comfortable" | "compact";
export type PassageStyle = "boxed" | "plain" | "underlined";
export type PaperSize = "A4" | "B4";

// ─── 표지(COVER) ──────────────────────────────────────────────────────────────
// 켜면 시험지 첫 장 앞에 별도의 표지 페이지가 생긴다. 표지는 본문 페이지 번호에
// 포함되지 않으며, 끄더라도 아래 설정값은 그대로 보존된다.
export type PaperCoverTemplate = "classic" | "band" | "minimal";

export type PaperCover = {
  enabled: boolean;
  template: PaperCoverTemplate;
  // 큰 제목 위에 들어가는 작은 라벨(예: 학원·시리즈명). 비우면 표시 안 함.
  eyebrow: string;
  // 표지 하단 문구(예: 문서번호·슬로건). 비우면 표시 안 함.
  footnote: string;
  // 학원 로고(헤더와 공유) 표시 여부.
  showLogo: boolean;
  // 학교/반/이름/시험일 정보 박스 표시 여부.
  showInfo: boolean;
};

export const DEFAULT_PAPER_COVER: PaperCover = {
  enabled: false,
  template: "classic",
  eyebrow: "",
  footnote: "",
  showLogo: true,
  showInfo: true,
};

export const PAPER_COVER_TEMPLATE_LABELS: Record<PaperCoverTemplate, string> = {
  classic: "클래식",
  band: "밴드",
  minimal: "미니멀",
};

export type BreakBefore = "auto" | "column" | "page";
export type PaperBlockType = "question" | "text" | "section" | "divider" | "spacer" | "image";
export type InsertablePaperBlockType = Exclude<PaperBlockType, "question">;
export type PaperBlockAlign = "left" | "center" | "right";
export type PaperBlockFontSize = "sm" | "md" | "lg";
export type PaperBlockDividerStyle = "solid" | "dashed" | "dotted";

// 블록(텍스트/섹션) 글자 크기: 미리보기는 px, 내보내기(HWPX/DOCX)는 pt 를 쓴다. HWPX 본문
// 9pt ↔ 미리보기 11.5px 비율로 환산해, 한 pt 값이 화면·내보내기에서 같은 크기로 보이게 한다.
export const BLOCK_PX_PER_PT = 11.5 / 9;
export const MIN_BLOCK_FONT_PT = 5;
export const MAX_BLOCK_FONT_PT = 60;

// blockFontPt 가 비어 있는(기존 시험지) 블록의 기본 pt — sm/md/lg·블록 종류에서 도출한다.
// 미리보기 px(sm 10·md 11.5·lg 14)을 pt 로 환산한 값이라, blockFontPt 미설정 시 화면과
// 툴바 표시 pt 가 정확히 일치한다(섹션은 제목이므로 약간 크게 13pt).
export function defaultBlockFontPt(item: {
  blockType: PaperBlockType;
  blockFontSize: PaperBlockFontSize;
}): number {
  if (item.blockType === "section") return 13;
  if (item.blockFontSize === "lg") return 11;
  if (item.blockFontSize === "sm") return 8;
  return 9;
}

export function effectiveBlockFontPt(item: {
  blockType: PaperBlockType;
  blockFontSize: PaperBlockFontSize;
  blockFontPt: number | null;
}): number {
  return item.blockFontPt ?? defaultBlockFontPt(item);
}

export function clampBlockFontPt(pt: number): number {
  return Math.min(MAX_BLOCK_FONT_PT, Math.max(MIN_BLOCK_FONT_PT, Math.round(pt)));
}

export type PaperItem = {
  localId: string;
  questionId: string;
  sourceQuestion: BuilderQuestion;
  orderNum: number;
  points: number;
  groupId: string | null;
  includePassage: boolean;
  passageTitle: string;
  passageContent: string;
  questionText: string;
  options: OptionItem[];
  correctAnswer: string;
  answerSpaceLines: number;
  objectiveAnswerSlots: number;
  objectiveAnswerTexts: string[];
  sectionTitle: string;
  teacherNote: string;
  breakBefore: BreakBefore;
  keepWithPrev: boolean;
  blockType: PaperBlockType;
  locked: boolean;
  blockTitle: string;
  blockText: string;
  blockAlign: PaperBlockAlign;
  blockFontSize: PaperBlockFontSize;
  // 굵게/기울임/숫자 pt 글자 크기(블록 단위 서식). blockFontPt 가 null 이면 blockFontSize
  // 프리셋(sm/md/lg)으로 폴백한다 — 기존 시험지는 이 값들이 없어도 동작이 그대로 유지된다.
  blockBold: boolean;
  blockItalic: boolean;
  blockFontPt: number | null;
  blockAccentColor: string;
  dividerStyle: PaperBlockDividerStyle;
  dividerThickness: number;
  spacerHeight: number;
  imageDataUrl: string | null;
  imageAlt: string;
  imageWidth: number;
};

export type PaperBlock = PaperItem;

export type PaperGroup = {
  id: string;
  items: PaperItem[];
  passageTitle: string;
  passageContent: string;
  includePassage: boolean;
};

export type RenderOption = { option: OptionItem; originalIndex: number };

// 구조화 본문(지문/요약/given 박스·↓·순서 단락)을 줄 단위로 흘려 칸 경계에서
// 쪼갤 수 있게 하는 행 단위 표현.
export type StructRowStyle = "passage" | "summary" | "given" | "arrow" | "para" | "text";
export type StructRow = {
  segIndex: number;
  style: StructRowStyle;
  paraLabel?: string;
  line: string;
  isSegStart: boolean; // 세그먼트(박스/단락)의 전역 첫 줄인지
  isSegEnd: boolean; // 세그먼트의 전역 마지막 줄인지
  // 원문(\n 경계) 행의 첫 랩행인지(래핑 이어짐 행은 false). 렌더 조인이 리스트/시행
  // 판정을 원문 행 머리에만 적용하기 위한 플래그 — undefined 는 레거시(휴리스틱 폴백).
  isSourceLineStart?: boolean;
};

export type RenderItemPart = {
  source: PaperItem;
  partKey: string;
  showHeader: boolean;
  showAnswer: boolean;
  showObjectiveAnswer: boolean;
  showCustomBlock: boolean;
  // 인라인 정답·해설(해설 포함 PDF) 블록을 이 part 끝에 렌더할지.
  showExplanation: boolean;
  questionRenderedLines: string[];
  questionStartLineIndex: number;
  questionTotalLines: number;
  structRows: StructRow[];
  options: RenderOption[];
  isStart: boolean;
  isContinuation: boolean;
};

export type RenderFragment = {
  id: string;
  passageTitle: string;
  passageContent: string;
  includePassage: boolean;
  usesSentenceInsertMarkers: boolean;
  passageRenderedLines: string[];
  passageStartLineIndex: number;
  passageTotalLines: number;
  groupSourceId: string;
  parts: RenderItemPart[];
};

export type PaperPage = RenderFragment[][];

export type PaginationSettings = {
  paperSize: PaperSize;
  columns: 1 | 2;
  density: Density;
  passageStyle: PassageStyle;
  showAnswerSpace: boolean;
  showPassageTitle: boolean;
  showQuestionMeta: boolean;
  template: PaperTemplate;
  // 켜면 자동 흐름/분할 대신 한 칸(섹션)당 문항(그룹) 1개씩 강제 배치한다.
  // 2단 레이아웃에서 "페이지당 2문제" 효과. 기본(undefined/false)은 기존 동작 유지.
  forceTwoPerPage?: boolean;
  // 1페이지 상단 헤더(제목/학생정보/안내문)가 차지하는 높이(px) 오버라이드.
  // HWPX export 는 헤더를 본문 표 위 별도 블록으로 그리므로, 한컴 실제 렌더 높이를
  // 여기로 넘겨 page-0 본문 용량에서 정확히 빼야 첫 표가 1쪽에 들어간다(미지정 시 기본값).
  firstPageHeaderPx?: number;
  // 켜면 각 문항 뒤에 인라인 정답·해설 블록을 페이지네이션/렌더에 포함한다(해설 포함 PDF).
  includeAnswers?: boolean;
  // HWPX 전용 페이지 용량 안전 여백(px). 한컴 실제 렌더가 추정보다 미세하게 클 때
  // (특히 구조화 박스 유형) 원자 페이지 표가 넘쳐 통째로 다음 장으로 밀리는 것을
  // 막기 위해 모든 페이지 용량에서 추가로 뺀다(미지정 시 0 — 웹 미리보기 영향 없음).
  contentSafetyPx?: number;
};

export type HeaderPatch = Partial<{
  title: string;
  subtitle: string;
  instructions: string;
  studentNameLabel: string;
  academyLogoDataUrl: string | null;
}>;

export type DropPlacement = "before" | "after";
