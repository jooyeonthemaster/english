/**
 * PRIME 분석 보고서 — 편집 모드 전용 CSS.
 * 전부 .par-root-edit 하위로 스코프 → 보기/인쇄 렌더(.par-root)엔 영향 없음.
 * 인쇄 시 편집 chrome 은 모두 숨겨 깨끗한 A4 가 나온다.
 */
export const ANALYSIS_REPORT_EDIT_CSS = `
/* 인라인 편집 필드 */
.par-root-edit .par-edit-field {
  cursor: text;
  border-radius: 3px;
  transition: background-color .12s, box-shadow .12s;
}
.par-root-edit .par-edit-field:hover { background: rgba(59,130,246,.10); }
.par-root-edit .par-edit-field:focus {
  background: rgba(59,130,246,.16);
  outline: none;
  box-shadow: 0 0 0 2px rgba(59,130,246,.55);
}
.par-root-edit .par-edit-empty:not(:focus)::before {
  content: attr(data-ph);
  color: #cbd5e1;
  font-style: italic;
}

/* 행/항목 레이아웃 + 삭제·추가 버튼 */
.par-root-edit .par-edit-row { display: flex; align-items: flex-start; gap: 2mm; }
.par-root-edit .par-edit-grow { flex: 1 1 auto; min-width: 0; }
.par-root-edit .par-edit-del {
  flex: 0 0 auto;
  width: 16px; height: 16px; padding: 0;
  border-radius: 50%; border: 1px solid #fecaca; background: #fff;
  color: #dc2626; font-size: 12px; line-height: 1; cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center;
  vertical-align: middle; margin-left: 4px; opacity: .55;
}
.par-root-edit .par-edit-del:hover { opacity: 1; background: #fee2e2; }
.par-root-edit .par-edit-add {
  margin-top: 2mm; font-size: 11px; padding: 3px 9px;
  border: 1px dashed #93c5fd; color: #2563eb; background: #eff6ff;
  border-radius: 5px; cursor: pointer; font-weight: 600;
}
.par-root-edit .par-edit-add:hover { background: #dbeafe; }

/* 줄/블록 단위 선택·드래그 chrome */
.par-root-edit .par-eline { position: relative; }
.par-root-edit .par-eline:hover { outline: 1px dashed rgba(59,130,246,.4); outline-offset: 2px; }
.par-root-edit .par-eline.is-active { outline: 2px solid rgba(37,99,235,.7); outline-offset: 2px; }
.par-root-edit tr.par-eline.is-active { outline: none; box-shadow: inset 0 0 0 2px rgba(37,99,235,.7); }
.par-root-edit .par-eline.is-dragging { opacity: .4; }
.par-root-edit .par-dragover-before { box-shadow: inset 0 3px 0 #2563eb; }
.par-root-edit .par-dragover-after { box-shadow: inset 0 -3px 0 #2563eb; }
.par-root-edit tr.par-dragover-before td { box-shadow: inset 0 3px 0 #2563eb; }
.par-root-edit tr.par-dragover-after td { box-shadow: inset 0 -3px 0 #2563eb; }

/* 드래그 핸들 ⠿ — 줄 왼쪽 여백에 hover 시 표시 */
.par-root-edit .par-egrip2 {
  position: absolute; left: -6.5mm; top: 0;
  width: 5mm; height: 5mm; display: inline-flex; align-items: center; justify-content: center;
  border: 1px solid #cbd5e1; background: #fff; border-radius: 3px; color: #64748b;
  cursor: grab; font-size: 11px; line-height: 1; opacity: 0; transition: opacity .12s; z-index: 6;
}
.par-root-edit .par-egrip2:active { cursor: grabbing; }
.par-root-edit .par-eline:hover > .par-egrip2,
.par-root-edit .par-eline.is-active > .par-egrip2 { opacity: 1; }
/* 세로 리사이즈 핸들 — 블록 하단 중앙, hover/active 시 표시 */
.par-root-edit .par-eresize {
  position: absolute; left: 50%; bottom: -4px; transform: translateX(-50%);
  width: 44px; height: 8px; border-radius: 4px;
  border: 1px solid #cbd5e1; background: #fff; padding: 0; margin: 0;
  cursor: ns-resize; opacity: 0; transition: opacity .12s; z-index: 6;
}
.par-root-edit .par-eresize::after {
  content: ""; display: block; width: 16px; height: 2px; margin: 2px auto; border-radius: 2px; background: #94a3b8;
}
.par-root-edit .par-eline:hover > .par-eresize,
.par-root-edit .par-eline.is-active > .par-eresize { opacity: 1; }
.par-root-edit .par-eresize:hover { border-color: #2563eb; }
.par-root-edit .par-eresize:hover::after { background: #2563eb; }
.par-root-edit .is-resizing { outline: 2px dashed rgba(37,99,235,.6) !important; }
body.par-resizing { cursor: ns-resize !important; user-select: none !important; }

/* 표지 로고 — 편집 시 드래그 이동 */
.par-root-edit .par-cov-logo-draggable { cursor: move; touch-action: none; }
.par-root-edit .par-cov-logo-draggable:hover { outline: 1.5px dashed rgba(37,99,235,.55); outline-offset: 3px; border-radius: 2px; }

/* 여백(spacer) 블록 — 편집 시 점선 + "여백" 라벨, 인쇄 시 순수 공백 */
.par-root-edit .par-spacer-fill { position: relative; }
.par-root-edit .par-spacer-fill::before {
  content: "여백"; position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  font-size: 10px; color: #94a3b8; border: 1px dashed #cbd5e1; border-radius: 4px;
}

/* 표 행 핸들 — 별도 좁은 셀 */
.par-root-edit .par-edit-hcell {
  width: 6mm; padding: 0 1mm !important; text-align: center; vertical-align: middle;
  border: none !important; background: transparent !important;
}
.par-root-edit .par-edit-hcell .par-egrip2 { position: static; left: auto; top: auto; opacity: .45; }
.par-root-edit tr.par-eline:hover .par-edit-hcell .par-egrip2 { opacity: 1; }

/* 인쇄 시 편집 chrome 전부 숨김 → 깨끗한 A4 */
@media print {
  .par-edit-chrome, .par-egrip2, .par-edit-hcell, .par-eresize { display: none !important; }
  .par-root-edit .par-edit-field { background: none !important; box-shadow: none !important; }
  .par-root-edit .par-eline, .par-root-edit .par-eline:hover, .par-root-edit .par-eline.is-active { outline: none !important; box-shadow: none !important; }
  .par-root-edit .par-edit-empty::before { content: "" !important; }
  .par-root-edit .is-resizing { outline: none !important; }
  .par-root-edit .par-spacer-fill::before { content: "" !important; border: none !important; }
}
`;
