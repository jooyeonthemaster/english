// report-sections 공개 API 배럴 — 경로(@/.../report-sections) 보존. 외부 importer 0수정.
export type { CustomEdit, FlowItem, MetaEdit, PassageStudyNotes, SectionEdit, TableColResize, WrapKind } from "./types";
// 섹션 단위 flow 캐시 — reportFlowItems 3번째 인자. 안 주면 무캐시(기존 동작 100% 동일).
export { SectionFlowCache } from "./flow-cache";
export { BlockFontProvider } from "./editable-field";
export { Arrow, BOX_LIST_WRAPS, SectionHead, TABLE_COLUMNS, TABLE_WRAPS, tableHeadRow } from "./table";
export { ReadGrammarNote } from "./study-notes";
export { customBlockFlowItem, customBlockFlowItems } from "./custom-block";
export { sectionFlowItems } from "./section-flow";
// 섹션 목차(헤더 슬롯) 단일 진실원 — 순수 TS(JSX 없음). 렌더·목차 UI·뮤테이션 공용.
export type { OutlineEntry, SectionSlot, SectionSlotKind } from "./section-slots";
export { hiddenSectionKeys, isSectionHidden, reportOutline, reportSectionSlots } from "./section-slots";
export { reportFlowItems } from "./assemble";
