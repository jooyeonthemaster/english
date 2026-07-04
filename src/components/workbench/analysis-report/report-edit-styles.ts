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
  white-space: pre-wrap;
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
.par-root-edit .par-table-row-delete-cell { position: relative; overflow: visible; }
.par-root-edit .par-edit-del.par-table-row-delete {
  position: absolute; right: -8mm; top: 50%; z-index: 12;
  transform: translateY(-50%);
  margin-left: 0; opacity: 0;
  width: 18px; height: 18px;
  box-shadow: 0 2px 8px rgba(15,23,42,.12);
}
.par-root-edit tr.par-eline:hover .par-edit-del.par-table-row-delete,
.par-root-edit tr.par-eline.is-active .par-edit-del.par-table-row-delete,
.par-root-edit .par-edit-del.par-table-row-delete:focus-visible { opacity: 1; }
.par-root-edit .par-edit-del.par-table-row-delete:hover {
  transform: translateY(-50%) scale(1.04);
}
.par-root-edit .par-vocab-test-card-exclude {
  position: absolute; right: -7px; top: -7px; z-index: 12;
  margin-left: 0; opacity: 0;
  box-shadow: 0 2px 8px rgba(15,23,42,.12);
}
.par-root-edit .par-vocab-test-card:hover .par-vocab-test-card-exclude,
.par-root-edit .par-eline.is-active .par-vocab-test-card-exclude,
.par-root-edit .par-vocab-test-card-exclude:focus-visible { opacity: 1; }
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

/* 활동 블록은 페이지 분할을 위해 내부 행이 여러 FlowItem 으로 나뉜다.
   일반 활성 outline 을 그대로 쓰면 행마다 파란 박스가 반복되어 문항 경계처럼 보이므로,
   활동에서는 실제 편집 필드 포커스만 표시한다. */
.par-root-edit .par-activity-run .par-wrap-activity.par-eline:hover,
.par-root-edit .par-activity-run .par-wrap-activity.par-eline.is-active {
  outline: none;
  box-shadow: none;
}
.par-root-edit .par-activity-run .par-wrap-activity.par-dragover-before {
  box-shadow: inset 0 2px 0 rgba(37,99,235,.45);
}
.par-root-edit .par-activity-run .par-wrap-activity.par-dragover-after {
  box-shadow: inset 0 -2px 0 rgba(37,99,235,.45);
}

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

/* 블록 삭제 버튼 — 블록 오른쪽 위 모서리, hover/active 시 표시 */
.par-root-edit .par-eblock-del {
  position: absolute; right: -6.5mm; top: 0;
  width: 5mm; height: 5mm; display: inline-flex; align-items: center; justify-content: center;
  border: 1px solid #fecaca; background: #fff; border-radius: 3px; color: #dc2626;
  cursor: pointer; line-height: 1; opacity: 0; transition: opacity .12s, background-color .12s; z-index: 7;
}
.par-root-edit .par-eline:hover > .par-eblock-del,
.par-root-edit .par-eline.is-active > .par-eblock-del { opacity: 1; }
.par-root-edit .par-eblock-del:hover { background: #fee2e2; border-color: #fca5a5; }
/* 편집 모드: 각 페이지를 relative 래퍼로 감싸 컨트롤을 시트 바깥에 띄운다.
   (시트는 overflow:hidden 이라 컨트롤을 자식으로 두면 바깥으로 못 나간다) */
/* 첫 페이지 컨트롤이 스크롤 최상단에서 잘리지 않도록 상단 여백 확보
   (이 값은 editor 의 previewContentHeight 에도 더해 높이를 맞춘다). */
.par-root-edit { padding-top: 18mm; }
.par-root-edit .par-sheet-wrap { position: relative; width: 210mm; margin: 0 auto 18mm; }
.par-root-edit .par-sheet-wrap > .par-sheet { margin: 0; }
.par-root-edit .par-page-controls {
  /* 페이지 바깥 오른쪽 위 — 클러스터 아래변을 페이지 상단에 맞춰 위로 띄운다. */
  position: absolute; right: 0; bottom: 100%; margin-bottom: 2mm; z-index: 30;
  display: inline-flex; align-items: center; gap: 4px;
}
.par-root-edit .par-page-ctrl {
  width: 7mm; height: 7mm; padding: 0;
  display: inline-flex; align-items: center; justify-content: center;
  border: 1px solid #e2e8f0; border-radius: 8px; background: #fff;
  color: #475569; line-height: 1;
  box-shadow: 0 2px 8px rgba(15,23,42,.10); cursor: pointer;
}
.par-root-edit .par-page-ctrl:hover { background: #f1f5f9; border-color: #cbd5e1; color: #0f172a; }
.par-root-edit .par-page-ctrl:disabled { opacity: .35; cursor: not-allowed; box-shadow: none; }
.par-root-edit .par-page-ctrl-del { border-color: #fecaca; color: #dc2626; }
.par-root-edit .par-page-ctrl-del:hover { background: #fee2e2; border-color: #fca5a5; color: #dc2626; }
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
.par-root-edit .par-cov-logo-draggable { position: relative; cursor: move; touch-action: none; }
.par-root-edit .par-cov-logo-draggable:hover { outline: 1.5px dashed rgba(37,99,235,.55); outline-offset: 3px; border-radius: 2px; }
.par-root-edit .par-cov-logo-resize {
  position: absolute; right: -7px; bottom: -7px; z-index: 8;
  width: 14px; height: 14px; padding: 0; border-radius: 999px;
  border: 1px solid #93c5fd; background: #fff;
  box-shadow: 0 2px 7px rgba(15,23,42,.16);
  cursor: nwse-resize; opacity: 0; transition: opacity .12s, background-color .12s;
}
.par-root-edit .par-cov-logo-resize::after {
  content: ""; display: block; width: 6px; height: 6px; margin: 3px;
  border-right: 2px solid #2563eb; border-bottom: 2px solid #2563eb;
}
.par-root-edit .par-cov-logo-draggable:hover .par-cov-logo-resize,
.par-root-edit .par-cov-logo-resize:focus-visible { opacity: 1; }
.par-root-edit .par-cov-logo-resize:hover { background: #eff6ff; opacity: 1; }

/* 지문 웹툰(이미지) — 네 모서리 드래그 리사이즈 (가로세로 비율 유지) */
.par-root-edit .par-img-box { position: relative; }
.par-root-edit .par-img-handle {
  position: absolute; width: 14px; height: 14px; padding: 0; z-index: 8;
  border: 1.5px solid #2563eb; background: #fff; border-radius: 999px;
  box-shadow: 0 2px 7px rgba(15,23,42,.18); touch-action: none;
  opacity: 0; transition: opacity .12s, transform .12s, background-color .12s;
}
.par-root-edit .par-img-handle-nw { left: -7px; top: -7px; cursor: nwse-resize; }
.par-root-edit .par-img-handle-ne { right: -7px; top: -7px; cursor: nesw-resize; }
.par-root-edit .par-img-handle-sw { left: -7px; bottom: -7px; cursor: nesw-resize; }
.par-root-edit .par-img-handle-se { right: -7px; bottom: -7px; cursor: nwse-resize; }
.par-root-edit .par-eline:hover .par-img-handle,
.par-root-edit .par-eline.is-active .par-img-handle { opacity: 1; }
.par-root-edit .par-img-handle:hover { transform: scale(1.18); background: #eff6ff; }
.par-root-edit .par-img-box.is-resizing { outline: 2px dashed rgba(37,99,235,.6); outline-offset: 2px; }
body.par-img-resizing { user-select: none !important; }

/* 여백(spacer) 블록 — 편집 시 점선 + "여백" 라벨, 인쇄 시 순수 공백 */
.par-root-edit .par-spacer-fill { position: relative; }
.par-root-edit .par-spacer-fill::before {
  content: "여백"; position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  font-size: 10px; color: #94a3b8; border: 1px dashed #cbd5e1; border-radius: 4px;
}

/* 표 행 핸들 — 별도 좁은 셀 */
.par-root-edit .par-edit-hcell {
  width: 6mm !important; min-width: 6mm !important; max-width: 6mm !important;
  padding: 0 1mm !important; text-align: center; vertical-align: middle;
  border: none !important; background: transparent !important;
}
.par-root-edit .par-edit-hcell .par-egrip2 { position: static; left: auto; top: auto; opacity: .45; }
.par-root-edit tr.par-eline:hover .par-edit-hcell .par-egrip2 { opacity: 1; }

/* 인쇄 시 편집 chrome 전부 숨김 → 깨끗한 A4 */
@media print {
  .par-edit-chrome, .par-egrip2, .par-eblock-del, .par-edit-hcell, .par-eresize, .par-page-controls, .par-cov-logo-resize { display: none !important; }
  .par-root-edit .par-edit-field { background: none !important; box-shadow: none !important; }
  .par-root-edit .par-eline, .par-root-edit .par-eline:hover, .par-root-edit .par-eline.is-active { outline: none !important; box-shadow: none !important; }
  .par-root-edit .par-edit-empty::before { content: "" !important; }
  .par-root-edit .is-resizing { outline: none !important; }
  .par-root-edit .par-spacer-fill::before { content: "" !important; border: none !important; }
  /* 편집 모드에서 인쇄 시 페이지 래퍼는 여백 없이 시트만 그대로 페이지 분할 */
  .par-root-edit .par-sheet-wrap { margin: 0 !important; }
  .par-root-edit { padding-top: 0 !important; }
}
`;
