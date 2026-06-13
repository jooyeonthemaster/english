/**
 * PRIME ANALYSIS 보고서 CSS — 디자인 시스템을 CSS 변수로 구동.
 * 색은 컴포넌트가 .par-root 에 --ink/--gold 등으로 주입 (디자인 템플릿 전환 지원).
 * 모든 간격/정렬은 여기서 고정 → 섹션이 어떤 내용이든 동일 규칙으로 조판됨.
 *
 * 레이아웃: .par-root > .par-sheet(A4 1장) × N. 각 시트는 헤더/본문/푸터.
 * 페이지 분할은 컴포넌트가 콘텐츠 높이를 측정해 블록을 시트에 채우는 방식.
 */
export const ANALYSIS_REPORT_CSS = `
.par-root {
  --font-ko: "Pretendard", -apple-system, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif;
  color: var(--text, #1a2233);
  font-family: var(--font-ko);
  font-size: calc(10pt * var(--par-fs, 1));
  line-height: 1.55;
}
.par-root * { box-sizing: border-box; }

/* ── A4 시트(페이지) ── */
.par-sheet {
  position: relative;
  width: 210mm; height: 297mm;
  background: var(--page, #fff);
  margin: 0 auto 9mm;
  padding: 13mm 18mm 11mm;
  display: flex; flex-direction: column;
  box-shadow: 0 8px 30px rgba(15,23,42,.14);
  overflow: hidden;
  /* 화면 편집용 확대/축소 — .par-sheet 에만 적용(측정용 .par-measure 는 영향 없음). 기본 1. */
  zoom: var(--par-zoom, 1);
}
.par-sheet-body { flex: 1; min-height: 0; }
/* 측정용 숨김 컨테이너 (본문 폭과 동일) */
.par-measure { position: absolute; visibility: hidden; pointer-events: none; left: -99999px; top: 0; width: 174mm; }

/* ── 러닝 헤더/푸터 ── */
.par-runhead {
  display: flex; justify-content: space-between; align-items: center; gap: 5mm;
  font-size: calc(8pt * var(--par-fs, 1)); letter-spacing: .04em;
  color: var(--ink); border-bottom: .6mm solid var(--rule);
  padding-bottom: 2mm; margin-bottom: 5mm; font-weight: 700; flex: 0 0 auto;
}
.par-runhead-brand { display: flex; align-items: center; gap: 2.2mm; min-width: 0; }
.par-runhead-logo { width: 9mm; height: 9mm; object-fit: contain; flex: 0 0 auto; }
.par-runhead .par-runhead-r { color: var(--text-muted); font-weight: 500; }
.par-runfoot {
  display: flex; justify-content: space-between; align-items: center;
  font-size: calc(7.5pt * var(--par-fs, 1)); color: var(--text-muted);
  border-top: .4mm solid var(--tint-border);
  padding-top: 2mm; margin-top: 5mm; letter-spacing: .03em; flex: 0 0 auto;
}
.par-runfoot .par-page { font-weight: 700; color: var(--ink); }

/* ── 블록 간 간격 ── */
.par-block { margin-bottom: 6mm; font-size: calc(10pt * var(--par-fs, 1)); }
.par-block:last-child { margin-bottom: 0; }
/* flow run(병합된 표/박스/도식) 블록 간격 */
.par-runblock { margin-bottom: 6mm; }
.par-runblock:last-child { margin-bottom: 0; }
.par-runblock.par-map { font-size: calc(10pt * var(--par-fs, 1)); }
.par-reading-flow-run {
  display: flex;
  flex-direction: column;
  gap: 0;
  margin-bottom: 4mm;
}
.par-reading-flow-run .par-block {
  margin-bottom: 0;
}
/* 도식 항목 래퍼 — par-map 안에서 중앙정렬 유지 */
.par-mapitem { display: flex; flex-direction: column; align-items: center; width: 100%; }

/* 커스텀 블록 — 여백 / 자유 텍스트 (보기·인쇄 공통) */
.par-spacer-fill { width: 100%; }
.par-customtext { font-size: calc(10pt * var(--par-fs, 1)); }
.par-customtext-h { font-weight: 800; color: var(--ink); margin-bottom: 1.5mm; }
.par-customtext-b { white-space: pre-wrap; line-height: 1.6; }

/* ── 타이틀 블록 ── */
.par-title {
  background: var(--ink-fill, var(--ink)); color: var(--ink-on-fill, #fff); border-left: 2.2mm solid var(--gold);
  padding: 7mm 8mm; border-radius: 1.5mm; margin-bottom: 4mm;
}
.par-title .par-eyebrow {
  color: var(--gold-soft); font-size: calc(8.5pt * var(--par-fs, 1)); font-weight: 800;
  letter-spacing: .22em; margin-bottom: 2.5mm; white-space: pre-wrap;
}
.par-title .par-title-ko { font-size: calc(21pt * var(--par-fs, 1)); font-weight: 800; line-height: 1.18; margin: 0; white-space: pre-wrap; }
.par-title .par-title-en {
  font-family: var(--font-en); font-style: italic; font-size: calc(12pt * var(--par-fs, 1));
  color: var(--ink-on-fill-muted, #d7def0); margin-top: 2mm; white-space: pre-wrap;
}

/* ── 메타 테이블 ── */
.par-meta { width: 100%; border-collapse: collapse; margin-bottom: 3mm; font-size: calc(8.5pt * var(--par-fs, 1)); }
.par-meta th, .par-meta td { border: .3mm solid var(--tint-border); padding: 2mm 2.5mm; text-align: center; }
.par-meta th { background: var(--table-head-bg, var(--ink-fill, var(--ink))); color: var(--table-head-text, var(--ink-on-fill, #fff)); font-weight: 700; letter-spacing: .02em; }
.par-meta td { color: var(--text); }
.par-meta .par-meta-diff { color: var(--gold); font-weight: 800; }
.par-docnote { display: flex; justify-content: flex-end; gap: 4mm; font-size: calc(7.5pt * var(--par-fs, 1)); color: var(--text-muted); letter-spacing: .03em; }

/* ── 섹션 헤더 ── */
.par-sec-head {
  display: flex; align-items: center; gap: 3mm;
  background: var(--ink-fill, var(--ink)); color: var(--ink-on-fill, #fff); border-left: 2.2mm solid var(--gold);
  padding: 2.5mm 4mm; border-radius: 1mm; margin-bottom: 3.5mm;
}
.par-sec-head .par-sec-no { color: var(--gold-soft); font-weight: 800; font-size: calc(13pt * var(--par-fs, 1)); font-style: italic; }
.par-sec-head .par-sec-ko { font-weight: 800; font-size: calc(12pt * var(--par-fs, 1)); }
.par-sec-head .par-sec-en { font-family: var(--font-en); font-style: italic; font-size: calc(9pt * var(--par-fs, 1)); color: var(--ink-on-fill-muted, #c2cbe0); }
.par-cont-head { font-size: calc(8.5pt * var(--par-fs, 1)); font-weight: 700; color: var(--ink); margin-bottom: 2.5mm; }
.par-cont-head .par-cont-k { color: var(--gold); }
.par-note { font-size: calc(8pt * var(--par-fs, 1)); color: var(--text-muted); font-style: italic; margin: 0 0 3mm; }
.par-kw-legend { font-style: normal; }

/* ── 필기 분석(05) 색상 범례 ── */
.par-anno-legend {
  display: flex; flex-wrap: wrap; align-items: center; gap: 1.6mm 3.4mm;
  margin: 0 0 3mm; padding: 1.6mm 3mm;
  border: .25mm solid var(--tint-border); border-radius: 1.5mm; background: var(--tint);
  font-size: calc(8pt * var(--par-fs, 1));
}
.par-anno-legend-label { font-weight: 800; color: var(--text-muted); letter-spacing: .04em; }
.par-anno-legend-item {
  font-weight: 800; color: var(--anno-c);
  padding-bottom: .2mm; border-bottom: .5mm solid var(--anno-c);
}

/* ── 박스(틴트) ── */
.par-box { background: var(--tint); border: .3mm solid var(--tint-border); border-radius: 1.5mm; padding: 4mm 5mm; }
.par-box.par-accent { border-left: 1.5mm solid var(--gold); }

/* ── 영어 원문만 페이지(표지 다음) ── */
/* 줄 간격은 margin 이 아니라 padding 으로 — offsetHeight(여백 제외)에 포함돼 페이지 분할 추정이 정확해짐.
   :last-child 가 아니라 '런의 마지막 블록'만 패딩 제거(측정 클론 vs 편집 뷰 불일치로 넘치던 문제 해결, 깔끔한 원문과 동일 패턴). */
.par-eng-only { display: flex; gap: 3mm; padding: 0 0 4mm; align-items: baseline; break-inside: avoid; }
.par-reading-flow-run .par-block:last-child .par-eng-only { padding-bottom: 0; }
.par-eng-only-no { flex: 0 0 auto; color: var(--gold); font-weight: 800; font-size: calc(11pt * var(--par-fs, 1)); }
.par-eng-only-en { margin: 0; font-family: var(--font-en); font-size: calc(11.5pt * var(--par-fs, 1)); line-height: 1.75; color: var(--ink); }

/* ── 01 원문 ── */
.par-sentences { list-style: none; margin: 0; padding: 0; }
.par-sentences li { display: flex; gap: 2.5mm; margin-bottom: 2.5mm; }
.par-sentences li:last-child { margin-bottom: 0; }
.par-sno { flex: 0 0 auto; color: var(--gold); font-weight: 800; min-width: 5mm; }
.par-sen-en { margin: 0; font-size: calc(10pt * var(--par-fs, 1)); }
.par-sen-ko { margin: .8mm 0 0; color: var(--text-muted); font-size: calc(9pt * var(--par-fs, 1)); }
.par-kw { background: transparent; color: var(--ink); font-weight: 700; text-decoration: underline; text-decoration-color: var(--gold); text-underline-offset: 2px; text-decoration-thickness: .4mm; }
.par-inline-underline {
  color: var(--ink);
  font-weight: 900;
  text-decoration-line: underline;
  text-decoration-color: #0ea5e9;
  text-decoration-thickness: .45mm;
  text-underline-offset: 1.2mm;
}
.par-reading-lab {
  border: .35mm solid var(--tint-border);
  background: #fff;
  padding: 3mm;
  break-inside: avoid;
}
.par-reading-card {
  position: relative;
  padding: 2mm;
}
.par-reading-flow-item {
  padding: 0 0 .6mm;
}
.par-reading-flow-run .par-block:last-child .par-reading-flow-item {
  padding-bottom: 0;
}
.par-reading-flow-note {
  padding: 0 0 .8mm;
}
.par-reading-flow-run .par-block:last-child .par-reading-flow-note {
  padding-bottom: 0;
}
.par-reading-note-grid {
  align-items: start;
}
.par-reading-note-main {
  min-width: 0;
  margin-left: 8mm;
}
.par-reading-note-side {
  min-width: 0;
}
.par-reading-source-item {
  padding-right: 50mm;
}
.par-reading-source-item.is-continuation {
  padding-top: 0;
}
.par-reading-source-item.is-continuation .par-read-sentence {
  border-left-color: #7dd3fc;
  background: #fbfdff;
}
.par-read-no-cont {
  background: #dbeafe;
  color: #0369a1;
}
.par-reading-trans-flow {
  padding-bottom: .8mm;
}
.par-reading-side-grid {
  align-items: start;
}
.par-reading-side-main {
  min-width: 0;
  display: flex;
  justify-content: flex-end;
  padding: .8mm 0 0 8mm;
}
.par-reading-side-label {
  color: #0369a1;
  font-size: calc(7.3pt * var(--par-fs, 1));
  font-weight: 900;
}
.par-reading-note { margin-bottom: 2.2mm; }
.par-reading-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 53mm;
  gap: 4mm;
  align-items: start;
}
.par-reading-row-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 47mm;
  gap: 3mm;
  align-items: stretch;
}
.par-reading-row-grid.has-study-notes {
  display: block;
  position: relative;
  padding-right: 50mm;
}
.par-reading-row-grid.has-study-notes .par-reading-trans {
  position: absolute;
  top: 0;
  right: 0;
  width: 47mm;
  box-sizing: border-box;
  z-index: 1;
}
.par-reading-main {
  display: flex;
  flex-direction: column;
  gap: 2.2mm;
  min-width: 0;
}
.par-read-sentence {
  position: relative;
  border-left: .8mm solid #0ea5e9;
  background: #f8fbff;
  padding: 2mm 2.2mm 2mm 2.6mm;
  break-inside: avoid;
}
.par-reading-row-grid.has-side-notes .par-read-sentence::after {
  content: "";
  position: absolute;
  right: -3mm;
  top: 9mm;
  width: 3mm;
  border-top: .45mm solid #0ea5e9;
}
.par-reading-row-grid.has-side-notes .par-read-sentence::before {
  content: "";
  position: absolute;
  right: -3.2mm;
  top: calc(9mm - 1mm);
  width: 0;
  height: 0;
  border-top: 1.1mm solid transparent;
  border-bottom: 1.1mm solid transparent;
  border-left: 1.8mm solid #0ea5e9;
}
.par-read-line {
  display: grid;
  grid-template-columns: 6.5mm minmax(0, 1fr);
  gap: 1.5mm;
  align-items: baseline;
}
.par-read-no {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 5.5mm;
  height: 5.5mm;
  border-radius: 50%;
  background: #0ea5e9;
  color: #fff;
  font-family: var(--font-ko);
  font-size: calc(7.5pt * var(--par-fs, 1));
  font-weight: 900;
}
.par-read-en {
  margin: 0;
  color: #061528;
  font-family: var(--font-en);
  font-size: calc(10.2pt * var(--par-fs, 1));
  font-weight: 760;
  line-height: 1.7;
  white-space: pre-wrap;
}
.par-read-en-annotated {
  overflow-wrap: anywhere;
}
.par-read-word-note {
  display: inline-flex;
  position: relative;
  flex-direction: column;
  align-items: flex-start;
  justify-content: flex-start;
  margin: 0 .25mm .35mm;
  vertical-align: text-top;
  line-height: 1.05;
}
.par-read-word-surface {
  color: #04111f;
  font-weight: 900;
  text-decoration-line: underline;
  text-decoration-color: #0ea5e9;
  text-decoration-thickness: .3mm;
  text-underline-offset: .65mm;
}
.par-read-word-gloss {
  display: inline-flex;
  flex-direction: column;
  align-items: flex-start;
  max-width: 34mm;
  margin-top: .25mm;
  color: #0284c7;
  font-family: var(--font-ko);
  font-size: calc(6.35pt * var(--par-fs, 1));
  font-weight: 650;
  line-height: 1.16;
  white-space: normal;
  pointer-events: none;
  user-select: none;
}
.par-read-word-gloss-head {
  color: #0284c7;
  font-family: var(--font-en);
  font-size: calc(6.2pt * var(--par-fs, 1));
  font-weight: 800;
}
.par-read-word-gloss-meaning {
  color: #0369a1;
}
.par-read-notes {
  margin: 1.5mm 0 0 8mm;
  display: flex;
  flex-direction: column;
  gap: 1mm;
}
.par-read-note {
  display: grid;
  grid-template-columns: minmax(18mm, auto) minmax(0, 1fr);
  gap: .8mm 1.5mm;
  align-items: baseline;
  border: .25mm solid #d7e6f7;
  background: #fff;
  padding: 1.2mm 1.6mm;
  color: var(--text);
  font-size: calc(7.8pt * var(--par-fs, 1));
  line-height: 1.42;
}
.par-read-note-split {
  grid-template-columns: minmax(0, 1fr);
  gap: .45mm;
  padding: .85mm 1.35mm;
}
.par-read-note-split > .par-read-note-label,
.par-read-note-split > .par-read-note-target,
.par-read-note-split > .par-read-note-body,
.par-read-note-split > .par-read-note-trap {
  grid-column: 1 / -1;
}
.par-read-note-split-head {
  background: #f7fbff;
  border-bottom-style: dashed;
}
.par-read-note-split-target {
  border-top-style: dashed;
  border-bottom-style: dashed;
  background: #fbfdff;
}
.par-read-note-split-body {
  border-top-style: dashed;
  border-bottom-style: dashed;
}
.par-read-note-split-trap {
  border-top-style: dashed;
  background: #fffafa;
}
.par-read-note-label {
  color: var(--ink);
  font-weight: 900;
}
.par-read-note-body {
  min-width: 0;
}
.par-read-note-target {
  grid-column: 1 / -1;
  color: #0284c7;
  font-family: var(--font-en);
  font-weight: 800;
  text-decoration-line: underline;
  text-decoration-color: #38bdf8;
  text-decoration-thickness: .32mm;
  text-underline-offset: .8mm;
}
.par-read-note-trap {
  grid-column: 1 / -1;
  color: #b42318;
  font-weight: 800;
}
.par-read-note-trap::before {
  content: "함정 ";
  color: #b42318;
  font-weight: 900;
}
.par-read-note-logic {
  border-color: #d7c56d;
  background: #fffdf0;
}
.par-read-note-logic .par-read-note-label { color: #9a6b00; }
.par-read-note-grammar { border-color: #b9ddff; }
.par-read-note-parse {
  border-color: #a7f3d0;
  background: #f7fffb;
}
.par-read-note-parse .par-read-note-label {
  color: #047857;
}
.par-read-note-split-parse-trans {
  border-top-style: dashed;
  background: #fbfff8;
}
.par-read-note-exam {
  border-color: #f5c2c7;
  background: #fff8f8;
}
.par-read-note-exam .par-read-note-label { color: #9f1239; }
.par-read-bank-title {
  margin-bottom: 1.4mm;
  color: var(--ink);
  font-size: calc(9.2pt * var(--par-fs, 1));
  font-weight: 900;
}
.par-read-bank-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1.2mm;
}
.par-reading-trans {
  border-left: .45mm solid var(--tint-border);
  padding-left: 3mm;
  display: flex;
  flex-direction: column;
  gap: 1.5mm;
  min-width: 0;
}
.par-reading-trans-card {
  padding-left: 2.4mm;
  justify-content: flex-start;
}
.par-trans-study {
  display: flex;
  flex-direction: column;
  gap: 1mm;
}
.par-reading-trans .par-read-note {
  grid-template-columns: minmax(0, 1fr);
  gap: .65mm;
  padding: 1.15mm 1.35mm;
  font-size: calc(7.45pt * var(--par-fs, 1));
}
.par-reading-trans .par-read-note-body,
.par-reading-trans .par-read-note-target,
.par-reading-trans .par-read-note-trap {
  grid-column: 1 / -1;
}
.par-trans-title {
  color: var(--ink);
  font-size: calc(9.2pt * var(--par-fs, 1));
  font-weight: 900;
  border-bottom: .35mm solid var(--gold);
  padding-bottom: 1mm;
}
.par-trans-row {
  display: grid;
  grid-template-columns: 6mm minmax(0, 1fr);
  gap: 1.2mm;
  border-bottom: .25mm solid var(--tint-border);
  padding-bottom: 1.2mm;
}
.par-trans-no {
  color: #0ea5e9;
  font-weight: 900;
  font-size: calc(8pt * var(--par-fs, 1));
}
.par-trans-ko {
  margin: 0;
  color: var(--text);
  font-size: calc(8pt * var(--par-fs, 1));
  line-height: 1.5;
  white-space: pre-wrap;
}
.par-ws-logic-promoted {
  border-left: 1.2mm solid #0ea5e9;
  background: #fbfdff;
}

/* ── 02 구조도 ── */
.par-map { display: flex; flex-direction: column; align-items: center; gap: 0; }
.par-node { background: var(--ink-fill, var(--ink)); color: var(--ink-on-fill, #fff); border-radius: 2mm; padding: 3mm 6mm; text-align: center; min-width: 60%; }
.par-node .par-node-eyebrow { color: var(--gold-soft); font-size: calc(7pt * var(--par-fs, 1)); font-weight: 800; letter-spacing: .18em; margin-bottom: 1mm; }
.par-node .par-node-label { font-weight: 800; font-size: calc(11pt * var(--par-fs, 1)); }
.par-node.par-node-soft { background: var(--ink-fill-soft, var(--ink-soft)); min-width: 48%; padding: 2.5mm 5mm; }
.par-node.par-node-soft .par-node-label { font-size: calc(10pt * var(--par-fs, 1)); }

/* 화살표 — 세로선 + 아래 삼각형 (또렷하게) */
.par-arrow { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 7mm; }
.par-arrow .par-arrow-line { width: .7mm; height: 4.5mm; background: var(--ink); }
.par-arrow .par-arrow-head { width: 0; height: 0; border-left: 1.8mm solid transparent; border-right: 1.8mm solid transparent; border-top: 2.2mm solid var(--ink); margin-top: -.2mm; }

.par-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 4mm; width: 100%; }
.par-col { background: var(--tint); border: .3mm solid var(--tint-border); border-top: 1.5mm solid var(--gold); border-radius: 1.5mm; padding: 3.5mm 4mm; display: flex; flex-direction: column; }
.par-col-head { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 2.5mm; }
.par-col-head .par-col-en { font-weight: 800; font-size: calc(13pt * var(--par-fs, 1)); color: var(--ink); letter-spacing: .04em; }
.par-col-head .par-col-ko { font-size: calc(9pt * var(--par-fs, 1)); color: var(--text-muted); font-weight: 700; }
.par-col ul { margin: 0; padding-left: 4mm; flex: 1; }
.par-col li { margin-bottom: 1.5mm; font-size: calc(9pt * var(--par-fs, 1)); }
.par-col-foot { margin-top: 2.5mm; text-align: center; font-size: calc(8pt * var(--par-fs, 1)); font-weight: 700; color: var(--ink); background: #fff; border: .3mm solid var(--tint-border); border-radius: 1mm; padding: 1.5mm; }
/* sequence 변형 — 단계 흐름도 */
.par-steps { display: flex; flex-direction: column; align-items: stretch; gap: 0; width: 86%; }
.par-step { display: flex; gap: 3mm; align-items: flex-start; background: var(--tint); border: .3mm solid var(--tint-border); border-left: 1.5mm solid var(--gold); border-radius: 1.5mm; padding: 3mm 4mm; }
.par-step-no { flex: 0 0 auto; width: 7mm; height: 7mm; border-radius: 50%; background: var(--ink-fill, var(--ink)); color: var(--ink-on-fill, #fff); border: .3mm solid var(--ink); font-weight: 800; font-size: calc(9pt * var(--par-fs, 1)); display: flex; align-items: center; justify-content: center; }
.par-step-body { flex: 1; }
.par-step-title { font-weight: 800; color: var(--ink); font-size: calc(10pt * var(--par-fs, 1)); }
.par-step-en { font-family: var(--font-en); font-style: italic; font-weight: 600; color: var(--text-muted); font-size: calc(9pt * var(--par-fs, 1)); }
.par-step-detail { font-size: calc(9pt * var(--par-fs, 1)); margin-top: .8mm; }
.par-core { background: var(--ink-fill, var(--ink)); color: var(--ink-on-fill, #fff); border: 1mm solid var(--gold); border-radius: 2mm; padding: 3mm 6mm; text-align: center; min-width: 70%; }
.par-core .par-core-eyebrow { color: var(--gold-soft); font-size: calc(7pt * var(--par-fs, 1)); font-weight: 800; letter-spacing: .18em; }
.par-core .par-core-label { font-weight: 800; font-size: calc(13pt * var(--par-fs, 1)); margin: 1mm 0; }
.par-core .par-core-detail { font-size: calc(8pt * var(--par-fs, 1)); color: var(--ink-on-fill-muted, #cdd5e6); }
.par-concl { background: var(--tint); border: .3mm solid var(--gold); border-radius: 2mm; padding: 3mm 6mm; text-align: center; min-width: 80%; }
.par-concl .par-concl-eyebrow { color: var(--gold); font-size: calc(7pt * var(--par-fs, 1)); font-weight: 800; letter-spacing: .18em; margin-bottom: 1mm; }
.par-concl .par-concl-text { font-weight: 700; font-size: calc(10pt * var(--par-fs, 1)); color: var(--ink); }
.par-logic { margin-top: 4mm; }
.par-logic .par-logic-k { color: var(--gold); font-weight: 800; margin-right: 2mm; }

/* ── 03 요약 ── */
.par-summary ol { margin: 0; padding-left: 5mm; }
.par-summary li { margin-bottom: 1.8mm; font-size: calc(10pt * var(--par-fs, 1)); }
.par-thesis { background: var(--ink-fill, var(--ink)); color: var(--ink-on-fill, #fff); border-left: 2mm solid var(--gold); border-radius: 1.5mm; padding: 4mm 5mm; margin-top: 4mm; }
.par-thesis .par-thesis-eyebrow { color: var(--gold-soft); font-size: calc(7.5pt * var(--par-fs, 1)); font-weight: 800; letter-spacing: .2em; margin-bottom: 1.5mm; }
.par-thesis .par-thesis-en { font-family: var(--font-en); font-style: italic; font-size: calc(11.5pt * var(--par-fs, 1)); line-height: 1.4; }

/* ── 표 (04/05/06) ── */
.par-table { width: 100%; border-collapse: collapse; font-size: calc(8.7pt * var(--par-fs, 1)); }
.par-vocab-test-table { table-layout: fixed; }
/* 행(tr)에 --par-fs 가 실리므로 tr 기준으로 글자크기 → td 가 상속받아 행 단위 크기 조절이 먹는다 */
.par-table tbody tr { font-size: calc(8.7pt * var(--par-fs, 1)); }
.par-table th, .par-table td { border: .3mm solid var(--tint-border); padding: 2mm 2.5mm; text-align: left; vertical-align: top; }
.par-table thead th { background: var(--table-head-bg, var(--ink-fill, var(--ink))); color: var(--table-head-text, var(--ink-on-fill, #fff)); font-weight: 700; }
.par-table tbody tr:nth-child(even) td { background: var(--table-stripe); }
/* 열 너비 조절 손잡이 — thead th 오른쪽 경계에 떠 있는 세로 드래그 영역(편집 모드 전용). */
.par-col-resize {
  position: absolute; top: 0; right: -3.5px; z-index: 4;
  width: 8px; height: 100%;
  cursor: col-resize; touch-action: none; user-select: none;
}
.par-col-resize::after {
  content: ""; position: absolute; top: 0; bottom: 0; left: 50%;
  width: 2px; transform: translateX(-50%);
  background: transparent; transition: background .12s ease;
}
.par-col-resize:hover::after, .par-col-resize:active::after { background: #3b82f6; }
.par-cell-no { text-align: center; color: var(--gold); font-weight: 800; white-space: nowrap; }
.par-cell-pos { text-align: center; font-style: italic; color: var(--text-muted); white-space: nowrap; }
.par-cell-pron { text-align: center; color: var(--text-muted); font-size: calc(8.3pt * var(--par-fs, 1)); }
.par-cell-head { font-weight: 800; color: var(--ink); }
.par-cell-syn { font-style: italic; color: var(--text-muted); }
.par-cell-ant { font-style: italic; color: var(--text-muted); }
.par-vocab-grid-run .par-block { margin-bottom: 0; }
.par-vocab-test-grid-row {
  display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 2mm;
  padding-bottom: 1.5mm; font-size: calc(8.7pt * var(--par-fs, 1));
}
.par-vocab-test-card {
  position: relative; min-width: 0; min-height: 22mm;
  border: .3mm solid var(--tint-border); background: #fff;
  padding: 2mm 2.4mm; break-inside: avoid;
}
.par-vocab-test-card-empty { border-style: dashed; background: transparent; opacity: .45; }
.par-vocab-test-card-head {
  display: flex; align-items: baseline; gap: 1.5mm;
  border-bottom: .3mm solid var(--tint-border);
  padding-bottom: 1.2mm; margin-bottom: 1.4mm;
}
.par-vocab-test-card-word { color: var(--ink); font-weight: 800; }
.par-vocab-test-card-pron {
  color: var(--text-muted); font-size: calc(8.1pt * var(--par-fs, 1));
  white-space: nowrap;
}
.par-vocab-test-card-line {
  display: grid; grid-template-columns: 10mm minmax(0, 1fr); gap: 1.5mm;
  margin-top: 1mm; color: var(--text);
}
.par-vocab-test-card-label {
  color: var(--gold); font-weight: 800; font-size: calc(7.8pt * var(--par-fs, 1));
}
.par-vocab-test-card-blank {
  display: block; width: 100%; min-width: 24mm; height: 7.5mm;
  border-bottom: .45mm solid var(--ink); opacity: .72;
}
.par-vocab-test-head {
  display: flex; align-items: baseline; justify-content: space-between;
  border-top: .6mm solid var(--gold); border-bottom: .3mm solid var(--tint-border);
  padding: 1.8mm 0 1.4mm; margin-top: 2mm;
}
.par-vocab-test-k { font-weight: 800; color: var(--ink); font-size: calc(11pt * var(--par-fs, 1)); }
.par-vocab-test-mode { color: var(--gold); font-weight: 800; font-size: calc(8.3pt * var(--par-fs, 1)); letter-spacing: .05em; }
.par-vocab-test-empty {
  color: var(--text-muted); font-size: calc(9pt * var(--par-fs, 1));
  border: .3mm dashed var(--tint-border); border-radius: 1mm;
  padding: 3mm; text-align: center;
}
.par-vocab-answer-cell {
  vertical-align: middle; min-width: 30mm; padding: 1.35mm 2mm !important;
  background: #fff !important;
}
.par-table tbody tr:nth-child(even) .par-vocab-answer-cell { background: #fff !important; }
.par-vocab-answer-box {
  display: flex; align-items: flex-end; width: 100%; min-width: 20mm; height: 8.2mm;
  border: .3mm solid var(--tint-border); border-radius: 1mm; background: #fff;
  padding: 0 2mm 1.2mm;
  box-shadow: inset 0 0 0 .2mm rgba(15,23,42,.035);
}
.par-vocab-answer-line {
  display: block; width: 100%; height: 0;
  border-bottom: .45mm solid var(--ink); opacity: .72;
}
.par-ws-title {
  border-top: .7mm solid var(--ink);
  border-bottom: .35mm solid var(--gold);
  padding: 2mm 0 1.8mm;
  margin-bottom: 1mm;
}
.par-ws-title-k {
  color: var(--ink);
  font-size: calc(13pt * var(--par-fs, 1));
  font-weight: 900;
}
.par-ws-note {
  margin-top: .8mm;
  color: var(--text-muted);
  font-size: calc(9.2pt * var(--par-fs, 1));
}
.par-ws-block {
  border: .3mm solid var(--tint-border);
  background: #fff;
  padding: 3mm;
  break-inside: avoid;
}
.par-activity-run {
  display: flex;
  flex-direction: column;
  gap: 0;
  break-inside: auto;
}
.par-activity-run .par-block {
  margin-bottom: 0;
}
.par-activity-run .par-wrap-activity {
  break-inside: avoid;
}
.par-activity-list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.par-activity-item-row {
  display: flex;
  gap: .5em;
  padding-bottom: 1.4mm;
  break-inside: avoid;
}
.par-activity-no {
  min-width: 1.5em;
  color: #334155;
  font-weight: 700;
}
.par-activity-body {
  flex: 1;
  min-width: 0;
}
.par-activity-ko {
  color: #64748b;
  font-size: .85em;
  line-height: 1.45;
}
.par-activity-ko + .par-activity-prompt,
.par-activity-ko + .par-activity-chipline {
  margin-top: .15em;
}
.par-activity-prompt {
  line-height: 1.75;
  white-space: pre-wrap;
}
.par-activity-order {
  margin-top: .3em;
}
.par-activity-order-given {
  border: 1px solid #cbd5e1;
  border-radius: 7px;
  background: #f8fafc;
  padding: .5em .7em;
  margin-bottom: .6em;
}
.par-activity-order-givenlabel {
  display: inline-block;
  font-size: .7em;
  font-weight: 800;
  letter-spacing: .03em;
  color: #475569;
  background: #e2e8f0;
  border-radius: 4px;
  padding: .05em .5em;
  margin-bottom: .3em;
}
.par-activity-order-cards {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: .45em;
}
.par-activity-order-card {
  display: flex;
  gap: .55em;
  align-items: flex-start;
  border: 1px solid #e2e8f0;
  border-radius: 7px;
  padding: .45em .6em;
  break-inside: avoid;
}
.par-activity-order-badge {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.7em;
  height: 1.7em;
  border-radius: 5px;
  border: 1px solid #cbd5e1;
  background: #fff;
  font-weight: 800;
  color: #334155;
}
.par-activity-order-body {
  flex: 1;
  min-width: 0;
}
.par-activity-order-en {
  line-height: 1.55;
}
.par-activity-order-ko {
  color: #64748b;
  font-size: .85em;
  margin-top: .12em;
}
.par-activity-order-answerline {
  display: flex;
  align-items: baseline;
  gap: .5em;
  margin-top: .7em;
  font-weight: 600;
  color: #334155;
}
.par-activity-order-slot {
  flex: 1;
  border-bottom: 1px solid #cbd5e1;
  min-height: 1.4em;
  color: #2563eb;
  font-weight: 700;
}
.par-activity-match {
  display: flex;
  gap: 1.4em;
  margin-top: .3em;
}
.par-activity-match-col {
  flex: 1;
  min-width: 0;
}
.par-activity-match-head {
  font-size: .72em;
  font-weight: 800;
  letter-spacing: .04em;
  color: #94a3b8;
  text-transform: uppercase;
  margin-bottom: .25em;
}
.par-activity-match-row {
  display: flex;
  align-items: baseline;
  gap: .45em;
  padding: .14em 0;
  line-height: 1.5;
}
.par-activity-match-mk {
  flex: none;
  font-weight: 700;
  color: #475569;
}
.par-activity-match-txt {
  flex: 1;
  min-width: 0;
}
.par-activity-match-pick {
  flex: none;
  min-width: 2.4em;
  text-align: center;
  color: #2563eb;
  font-weight: 600;
}
.par-activity-chipline {
  display: flex;
  flex-wrap: wrap;
  gap: .3em;
  line-height: 1.9;
}
.par-activity-chip {
  border: 1px solid #cbd5e1;
  border-radius: 5px;
  padding: .05em .5em;
  background: #f8fafc;
}
.par-activity-answer {
  margin-top: .2em;
  color: #2563eb;
  font-size: .85em;
  font-weight: 600;
}
.par-activity-list .par-activity-item-row:last-child {
  padding-bottom: 0;
}
.par-activity-run .par-block + .par-block {
  border-top: .25mm solid var(--tint-border);
  padding-top: 1.4mm;
}
.par-activity-wordbank {
  margin-top: .5em;
  padding: .45em .7em;
  border: 1px dashed #cbd5e1;
  border-radius: 6px;
  font-size: .9em;
  line-height: 1.7;
}
.par-ws-answer-key {
  border-color: var(--gold-soft);
  background: #fffdf8;
}
.par-ws-answer-subsection + .par-ws-answer-subsection,
.par-ws-answer-subsection + .par-ws-answer,
.par-ws-answer + .par-ws-answer {
  margin-top: 2.4mm;
}
/* 정답 서브섹션은 한 덩어리로 — 페이지 경계에서 라벨만 떨어지는 것 방지(블록 단위 분할은 페이지네이터가 처리) */
.par-ws-answer-subsection { break-inside: avoid; }
.par-ws-minihead {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 3mm;
  margin-bottom: 2mm;
  padding-bottom: 1.2mm;
  border-bottom: .35mm solid var(--tint-border);
}
.par-ws-minihead-k {
  color: var(--ink);
  font-size: calc(11.3pt * var(--par-fs, 1));
  font-weight: 900;
}
.par-ws-minihead-e {
  color: var(--gold);
  font-size: calc(8.2pt * var(--par-fs, 1));
  font-weight: 800;
  letter-spacing: 0;
}
.par-ws-logic,
.par-ws-distractors {
  width: 100%;
  border-collapse: collapse;
  font-size: calc(8.3pt * var(--par-fs, 1));
}
.par-ws-logic th,
.par-ws-logic td,
.par-ws-distractors td {
  border: .3mm solid var(--tint-border);
  padding: 1.6mm 2mm;
  vertical-align: top;
}
.par-ws-logic th {
  background: var(--ink);
  color: #fff;
  text-align: left;
  font-weight: 800;
}
.par-ws-logic td:first-child,
.par-ws-distractors td:first-child {
  width: 12mm;
  color: var(--gold);
  font-weight: 800;
  text-align: center;
}
.par-ws-logic td:nth-child(2) {
  width: 30mm;
  color: var(--ink);
  font-weight: 800;
}
.par-ws-cloze-list,
.par-ws-practice-list {
  display: flex;
  flex-direction: column;
  gap: 1.6mm;
}
.par-ws-cloze,
.par-ws-practice {
  border-bottom: .25mm solid var(--tint-border);
  padding-bottom: 1.4mm;
}
.par-ws-cloze-en,
.par-ws-practice {
  font-family: var(--font-en);
  color: var(--ink);
  font-size: calc(10pt * var(--par-fs, 1));
  line-height: 1.5;
}
.par-ws-cloze-no {
  display: inline-block;
  min-width: 8mm;
  color: var(--gold);
  font-family: inherit;
  font-weight: 900;
}
.par-ws-cloze-ko {
  margin-top: .8mm;
  padding-left: 8mm;
  color: var(--text-muted);
  font-size: calc(9pt * var(--par-fs, 1));
  line-height: 1.5;
}
.par-ws-wordbank {
  margin-top: 2.2mm;
  border: .3mm dashed var(--gold-soft);
  background: var(--tint);
  padding: 2mm;
  font-size: calc(8.9pt * var(--par-fs, 1));
  line-height: 1.55;
}
.par-ws-wordbank-k {
  color: var(--gold);
  font-weight: 900;
  margin-right: 2mm;
}
.par-ws-wordbank-list {
  color: var(--ink);
  font-family: var(--font-en);
}
.par-ws-drill-set {
  display: flex;
  flex-direction: column;
  gap: 1.6mm;
}
.par-ws-drill-set + .par-ws-drill-set {
  margin-top: 3mm;
  padding-top: 2mm;
  border-top: .3mm dashed var(--tint-border);
}
.par-ws-drill-label {
  color: var(--gold);
  font-size: calc(9pt * var(--par-fs, 1));
  font-weight: 900;
}
.par-ws-grammar-choice,
.par-ws-wordorder {
  border: .3mm solid var(--tint-border);
  background: var(--tint);
  padding: 2mm 2.2mm;
  font-size: calc(9.3pt * var(--par-fs, 1));
  line-height: 1.5;
}
/* 어법 선택 [a / b] 괄호 강조 — 밑줄 */
.par-ws-choice-mark { text-decoration: underline; text-decoration-thickness: .3mm; text-underline-offset: 1.5px; font-weight: 800; }
/* 단어배열 영작 — 답안 작성 공간 */
.par-ws-write-space { margin-top: 6mm; display: flex; flex-direction: column; gap: 7mm; }
.par-ws-write-line { display: block; height: 0; border-bottom: .25mm solid var(--tint-border); }
.par-ws-drill-line,
.par-ws-wordorder-ko {
  color: var(--ink);
  font-family: var(--font-en);
  font-weight: 700;
}
.par-ws-drill-options,
.par-ws-wordorder-chunks {
  margin-top: .8mm;
  color: var(--text-muted);
  font-family: var(--font-en);
}
.par-ws-drill-answer,
.par-ws-wordorder-answer {
  margin-top: 1mm;
  display: flex;
  gap: 1.5mm;
  color: var(--text);
  font-size: calc(8pt * var(--par-fs, 1));
}
.par-ws-drill-answer b,
.par-ws-wordorder-answer {
  color: var(--ink);
  font-weight: 900;
}
.par-ws-topic-card {
  border: .3mm solid var(--tint-border);
  background: var(--tint);
  padding: 2.4mm 2.8mm;
}
.par-ws-topic-label {
  display: inline-flex;
  margin-bottom: 1.2mm;
  color: var(--gold);
  font-size: calc(8pt * var(--par-fs, 1));
  font-weight: 900;
}
.par-ws-topic-title {
  color: var(--ink);
  font-family: var(--font-en);
  font-size: calc(11pt * var(--par-fs, 1));
  font-weight: 900;
  line-height: 1.35;
}
.par-ws-topic-gist {
  margin-top: 1mm;
  color: var(--text);
  font-size: calc(9.3pt * var(--par-fs, 1));
  line-height: 1.5;
}
.par-ws-workbook-passage {
  white-space: pre-wrap;
  color: var(--ink);
  font-family: var(--font-en);
  font-size: calc(9.6pt * var(--par-fs, 1));
  line-height: 1.6;
}
.par-ws-key-table {
  width: 100%;
  margin-top: 2.4mm;
  border-collapse: collapse;
  font-size: calc(8pt * var(--par-fs, 1));
}
.par-ws-key-table td {
  border: .3mm solid var(--tint-border);
  padding: 1.4mm 1.7mm;
  vertical-align: top;
}
.par-ws-key-table td:first-child {
  width: 9mm;
  color: var(--gold);
  font-weight: 900;
  text-align: center;
}
.par-ws-key-table td:nth-child(2) {
  width: 28mm;
  color: var(--ink);
  font-family: var(--font-en);
  font-weight: 800;
}
.par-ws-question {
  border: .3mm solid var(--tint-border);
  background: #fff;
  padding: 3mm;
  break-inside: avoid;
}
.par-ws-qtop {
  display: flex;
  align-items: center;
  gap: 2mm;
  margin-bottom: 1.5mm;
}
.par-ws-qno {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 9mm;
  height: 6mm;
  background: var(--ink);
  color: #fff;
  font-size: calc(8pt * var(--par-fs, 1));
  font-weight: 900;
}
.par-ws-qtype {
  color: var(--gold);
  font-size: calc(9pt * var(--par-fs, 1));
  font-weight: 900;
}
.par-ws-qprompt {
  color: var(--ink);
  font-size: calc(9.5pt * var(--par-fs, 1));
  font-weight: 800;
  line-height: 1.45;
}
.par-ws-qpassage {
  margin-top: 1.8mm;
  padding: 2mm;
  border-left: .8mm solid var(--gold);
  background: var(--tint);
  color: var(--text);
  font-family: var(--font-en);
  font-size: calc(9pt * var(--par-fs, 1));
  line-height: 1.55;
}
.par-ws-choices {
  margin: 2mm 0 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 1mm;
}
.par-ws-choices li {
  display: grid;
  grid-template-columns: 8mm minmax(0, 1fr);
  gap: 1mm;
  color: var(--text);
  font-size: calc(9.3pt * var(--par-fs, 1));
  line-height: 1.5;
}
.par-ws-choice-label {
  color: var(--ink);
  font-weight: 900;
}
.par-ws-answer {
  margin-top: 2.2mm;
  border-top: .35mm solid var(--tint-border);
  padding-top: 1.8mm;
}
.par-ws-answer-main {
  display: flex;
  align-items: baseline;
  gap: 1.5mm;
  color: var(--ink);
  font-size: calc(8.5pt * var(--par-fs, 1));
  font-weight: 800;
}
.par-ws-answer-label {
  color: var(--gold);
  font-weight: 900;
}
.par-ws-answer-text {
  color: var(--text);
  font-weight: 600;
}
.par-ws-expl {
  margin-top: 1mm;
  color: var(--text);
  font-size: calc(8.2pt * var(--par-fs, 1));
  line-height: 1.45;
}
.par-ws-distractors {
  margin-top: 1.6mm;
}
.par-ws-distractors td:nth-child(2) {
  width: 24mm;
  color: var(--gold);
  font-weight: 800;
}
.par-gr-excerpt { display: block; margin-bottom: 1mm; font-family: var(--font-en); font-style: italic; font-size: calc(8.5pt * var(--par-fs, 1)); color: var(--ink); border-left: .8mm solid var(--gold); padding-left: 1.5mm; }
.par-trap { display: block; margin-top: 1.5mm; color: var(--gold); font-weight: 600; font-size: calc(8pt * var(--par-fs, 1)); }
.par-trap b { color: var(--ink); }

/* ── 07 구문 분석 ── */
.par-parse { margin-bottom: 4mm; }
.par-parse:last-child { margin-bottom: 0; }
.par-parse-en { font-family: var(--font-en); font-style: italic; font-size: calc(9.5pt * var(--par-fs, 1)); margin-bottom: 2mm; }
.par-parse-en .par-sno { font-style: normal; }
.par-parse-parts { list-style: none; margin: 0 0 2mm; padding: 0; }
.par-parse-parts li { padding-left: 4mm; position: relative; margin-bottom: 1mm; font-size: calc(9pt * var(--par-fs, 1)); }
.par-parse-parts li::before { content: "▸"; position: absolute; left: 0; color: var(--gold); }
.par-parse-parts .par-plabel { font-weight: 800; color: var(--ink); margin-right: 1.5mm; }
.par-parse-trans { font-size: calc(9pt * var(--par-fs, 1)); }
.par-parse-trans .par-tk { color: var(--gold); font-weight: 800; margin-right: 1.5mm; }

/* ── 08 학습 점검 ── */
.par-quiz { list-style: none; margin: 0; padding: 0; counter-reset: none; }
.par-quiz > li { margin-bottom: 4mm; padding-bottom: 3mm; border-bottom: .25mm dashed var(--tint-border); }
.par-quiz > li:last-child { margin-bottom: 0; padding-bottom: 0; border-bottom: 0; }
.par-q-head { display: flex; align-items: center; gap: 1.5mm; margin-bottom: 1.2mm; }
.par-quiz .par-q-no { font-weight: 800; color: var(--ink); font-size: calc(10pt * var(--par-fs, 1)); }
.par-quiz .par-q-type { font-size: calc(7pt * var(--par-fs, 1)); font-weight: 700; color: #fff; background: var(--gold); padding: .4mm 1.8mm; border-radius: 1mm; letter-spacing: .02em; }
.par-quiz .par-q-prompt { line-height: 1.7; }
.par-blank { display: inline-block; min-width: 14mm; border-bottom: .4mm solid var(--ink); margin: 0 .5mm; vertical-align: baseline; }
.par-quiz .par-q-choices { list-style: none; margin: 2mm 0 0; padding: 0; display: flex; flex-direction: column; gap: 1.4mm; font-size: calc(9.2pt * var(--par-fs, 1)); }
.par-quiz .par-q-choices li { display: flex; gap: 2mm; align-items: baseline; line-height: 1.45; }
.par-quiz .par-choice-mark { color: var(--gold); font-weight: 800; flex: 0 0 auto; }
.par-answers { background: var(--ink-fill, var(--ink)); color: var(--ink-on-fill, #fff); border-left: 2mm solid var(--gold); border-radius: 1.5mm; padding: 3.5mm 5mm; }
.par-answers .par-ans-eyebrow { color: var(--gold-soft); font-size: calc(7.5pt * var(--par-fs, 1)); font-weight: 800; letter-spacing: .2em; margin-bottom: 2mm; }
.par-answers .par-ans-row { font-size: calc(8.7pt * var(--par-fs, 1)); margin-bottom: 1mm; }
.par-answers .par-ans-no { color: var(--gold-soft); font-weight: 800; margin-right: 1.5mm; }

/* ── 표지(Cover) — 6개 템플릿 (보기·인쇄 공통) ── */
.par-sheet-cover { padding: 0 !important; }
.par-cover-shell { flex: 1; width: 100%; display: flex; }
.par-cover-preview { display: flex; }
.par-cover { flex: 1; width: 100%; display: flex; flex-direction: column; position: relative; box-sizing: border-box; overflow: hidden; }
.par-cov-eyebrow { font-size: calc(9pt * var(--par-fs, 1)); font-weight: 800; letter-spacing: .26em; color: var(--gold); text-transform: uppercase; white-space: pre-wrap; }
.par-cov-title { font-size: calc(30pt * var(--par-fs, 1)); font-weight: 800; line-height: 1.14; color: var(--ink); margin: 0; white-space: pre-wrap; }
.par-cov-title-l { text-align: left; }
.par-cov-title-white { color: var(--ink-on-fill, #fff); }
.par-cov-sub { font-family: var(--font-en); font-style: italic; font-size: calc(14pt * var(--par-fs, 1)); color: var(--text-muted); white-space: pre-wrap; }
.par-cov-sub-white { color: var(--ink-on-fill-muted, #d7def0); }
.par-cov-rule { width: 26mm; height: .8mm; background: var(--gold); margin: 5mm 0; }
.par-cov-tag { font-size: calc(10.5pt * var(--par-fs, 1)); color: var(--text); white-space: pre-wrap; }
.par-cov-logo { display: flex; align-items: center; }
.par-cov-logo img { display: block; }
.par-cov-metaline { display: flex; gap: 2mm; align-items: center; font-size: calc(9pt * var(--par-fs, 1)); color: var(--text-muted); margin-top: 3mm; }
.par-cov-metaline .par-cov-stars { color: var(--gold); }
.par-cov-dot { color: var(--tint-border); }
.par-cov-zone-bot { flex: 0 0 auto; display: flex; justify-content: space-between; width: 100%; font-size: calc(9pt * var(--par-fs, 1)); color: var(--text-muted); letter-spacing: .05em; border-top: .3mm solid var(--tint-border); padding-top: 4mm; margin-top: 6mm; }

/* 1) classic-center */
.par-cov-classic { padding: 22mm 20mm; text-align: center; align-items: center; }
.par-cov-classic .par-cov-zone-top { flex: 0 0 auto; min-height: 16mm; display: flex; align-items: center; justify-content: center; }
.par-cov-classic .par-cov-zone-mid { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3mm; }
.par-cov-classic .par-cov-rule { margin: 5mm auto; }
.par-cov-classic .par-cov-title { font-size: calc(33pt * var(--par-fs, 1)); }

/* 2) spine-left */
.par-cov-spine { flex-direction: row; padding: 0; }
.par-cov-spine-bar { width: 11mm; background: var(--ink-fill, var(--ink)); border-right: 2mm solid var(--gold); flex: 0 0 auto; }
.par-cov-spine-body { flex: 1; display: flex; flex-direction: column; padding: 24mm 20mm; }
.par-cov-spine-body .par-cov-logo { margin-bottom: 8mm; }
.par-cov-spine-mid { flex: 1; display: flex; flex-direction: column; justify-content: center; gap: 3mm; align-items: flex-start; }
.par-cov-spine-bot { display: flex; justify-content: space-between; font-size: calc(9pt * var(--par-fs, 1)); color: var(--text-muted); border-top: .3mm solid var(--tint-border); padding-top: 4mm; }

/* 3) band-fill */
.par-cov-band { padding: 0; }
.par-cov-band-top { background: var(--ink-fill, var(--ink)); color: var(--ink-on-fill, #fff); padding: 26mm 20mm 16mm; display: flex; flex-direction: column; gap: 3mm; flex: 0 0 auto; min-height: 45%; justify-content: center; border-bottom: 2mm solid var(--gold); }
.par-cov-band-bot { flex: 1; padding: 16mm 20mm; display: flex; flex-direction: column; gap: 4mm; }
.par-cov-band-foot { margin-top: auto; display: flex; justify-content: space-between; font-size: calc(9pt * var(--par-fs, 1)); color: var(--text-muted); border-top: .3mm solid var(--tint-border); padding-top: 4mm; }
.par-cov-eyebrow-gold { color: var(--gold-soft); }

/* 4) numeral-hero */
.par-cov-numeral { padding: 22mm 20mm; }
.par-cov-numeral-bg { position: absolute; top: -10mm; right: -4mm; font-family: var(--font-en); font-weight: 800; font-size: calc(150pt * var(--par-fs, 1)); line-height: 1; color: var(--tint); z-index: 0; }
.par-cov-numeral-top, .par-cov-numeral-mid { position: relative; z-index: 1; }
.par-cov-numeral .par-cov-zone-bot { position: relative; z-index: 1; }
.par-cov-numeral-top { flex: 0 0 auto; min-height: 14mm; }
.par-cov-numeral-mid { flex: 1; display: flex; flex-direction: column; justify-content: center; gap: 3mm; }

/* 5) index-grid */
.par-cov-index { padding: 24mm 20mm; }
.par-cov-index-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 5mm; }
.par-cov-index .par-cov-title { font-size: calc(26pt * var(--par-fs, 1)); margin-top: 2mm; }
.par-cov-index-grid { margin-top: 10mm; border-top: .5mm solid var(--ink); }
.par-cov-index-row { display: flex; padding: 3.2mm 0; border-bottom: .3mm solid var(--tint-border); font-size: calc(10pt * var(--par-fs, 1)); }
.par-cov-index-k { width: 30mm; flex: 0 0 auto; font-weight: 800; color: var(--gold); letter-spacing: .05em; }
.par-cov-index-v { color: var(--text); }

/* 6) framed-card */
.par-cov-framed { padding: 13mm; }
.par-cov-framed-card { flex: 1; border: .6mm solid var(--ink); border-radius: 2mm; padding: 16mm 14mm; display: flex; flex-direction: column; align-items: center; text-align: center; position: relative; }
.par-cov-framed-card::before { content: ""; position: absolute; inset: 3mm; border: .3mm solid var(--gold); border-radius: 1mm; pointer-events: none; }
.par-cov-framed-top { display: flex; flex-direction: column; align-items: center; gap: 2mm; }
.par-cov-framed-mid { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2.5mm; }
.par-cov-framed-bot { font-size: calc(9pt * var(--par-fs, 1)); color: var(--text-muted); letter-spacing: .1em; }
.par-cov-framed .par-cov-title { font-size: calc(28pt * var(--par-fs, 1)); }

/* ══════════════════════════════════════════════════════════════════════════
   01 원문 — 필기 캔버스 (HLC). 문장 1개 = 원자 블록.
   직독직해 청크가 flex-wrap 으로 흐르고, 각 청크 아래에 줄사이 필기가 붙는다.
   겹침 없음 = 브라우저 flow 가 구조적으로 보장(JS 추정 의존 없음). 긴 필기만 오른쪽 레일.
   ════════════════════════════════════════════════════════════════════════════ */
/* ── 깔끔한 원문 + 해석 (필기 없음) ── */
.par-clean-snt { padding: 0 0 2.6mm; break-inside: avoid; }
.par-reading-flow-run .par-block:last-child .par-clean-snt { padding-bottom: 0; }
.par-clean-line { display: grid; grid-template-columns: 6.5mm minmax(0, 1fr); gap: 1.8mm; align-items: baseline; }
.par-clean-line .par-read-en { margin: 0; }
.par-clean-no {
  display: inline-flex; align-items: center; justify-content: center;
  width: 5.4mm; height: 5.4mm; border-radius: 50%;
  background: #0ea5e9; color: #fff;
  font-family: var(--font-ko); font-size: calc(7.3pt * var(--par-fs, 1)); font-weight: 900;
}
.par-clean-ko-row { display: grid; grid-template-columns: 6.5mm minmax(0, 1fr); gap: 1.8mm; margin-top: .9mm; align-items: baseline; }
.par-clean-ko-mark { color: #94a3b8; text-align: center; font-size: calc(8pt * var(--par-fs, 1)); }
.par-clean-ko { margin: 0; color: var(--text-muted); font-size: calc(8.8pt * var(--par-fs, 1)); line-height: 1.5; }

.par-canvas {
  position: relative;
  display: block;
  break-inside: avoid;
  padding: 0 0 3mm;
}
.par-reading-flow-run .par-block:last-child .par-canvas { padding-bottom: 0; }
.par-canvas-grid { display: grid; grid-template-columns: minmax(0, 1fr); align-items: start; }
.par-canvas-grid.has-rail {
  grid-template-columns: minmax(0, 1fr) 46mm;
  column-gap: 3.5mm;
}

/* ── 직독직해 staff (영문 청크 흐름) ── */
.par-canvas-staff {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  column-gap: 0;
  row-gap: 2mm;
  min-width: 0;
}
.par-canvas-no {
  display: inline-flex; align-items: center; justify-content: center;
  flex: 0 0 auto;
  width: 5.4mm; height: 5.4mm; margin-right: 1.6mm;
  border-radius: 50%;
  background: #0ea5e9; color: #fff;
  font-family: var(--font-ko);
  font-size: calc(7.3pt * var(--par-fs, 1)); font-weight: 900;
  align-self: flex-start; margin-top: .3mm;
}
.par-canvas-no.is-cont { background: #dbeafe; color: #0369a1; }
.par-canvas-chunk { display: flex; flex-direction: column; min-width: 0; max-width: 100%; }
/* 끊어읽기 구분선 — 청크 사이 '/' */
.par-canvas-sep {
  align-self: flex-start; flex: 0 0 auto;
  margin: 0 1mm; color: #94a3b8;
  font-family: var(--font-en); font-size: calc(11pt * var(--par-fs, 1));
  font-weight: 400; line-height: 1.62;
}
/* 필기가 달린 청크는 줄사이 노트가 들어갈 가로 여유를 준다 */
.par-canvas-chunk.is-noted { min-width: 31mm; flex: 0 1 auto; }
.par-canvas-en {
  font-family: var(--font-en);
  font-size: calc(11pt * var(--par-fs, 1));
  font-weight: 760; line-height: 1.62; color: #061528;
  white-space: pre-wrap; overflow-wrap: anywhere; word-break: break-word;
}
.par-canvas-chunk.is-core .par-canvas-en { color: #022; }
.par-canvas-chunk.is-anchored .par-canvas-en {
  text-decoration: underline; text-decoration-color: var(--anno-c, #94a3b8);
  text-decoration-thickness: .3mm; text-underline-offset: 1.6mm;
}
/* 청크 구문 라벨 (구 아래 brace 느낌) */
.par-canvas-role {
  align-self: stretch;
  margin-top: .3mm; padding-top: .4mm;
  border-top: .35mm solid var(--anno-c, #047857);
  color: var(--anno-c, #047857);
  font-family: var(--font-ko);
  font-size: calc(7.4pt * var(--par-fs, 1)); font-weight: 800; line-height: 1.16;
  overflow-wrap: anywhere;
}
/* 청크 아래 줄사이 필기 스택 */
.par-canvas-notes { display: flex; flex-direction: column; gap: .7mm; margin-top: .7mm; min-width: 0; }
.par-canvas-note {
  font-family: var(--font-ko);
  font-size: calc(8.4pt * var(--par-fs, 1)); line-height: 1.28;
  color: var(--text); overflow-wrap: anywhere; word-break: break-word;
  border-left: .6mm solid var(--anno-c, #2563a8); padding-left: 1.3mm;
}
.par-canvas-note-role { display: block; color: var(--anno-c, #2563a8); font-weight: 900; font-size: calc(8pt * var(--par-fs, 1)); }
.par-canvas-note-line { display: block; }
.par-canvas-note-trap { display: block; color: #b42318; font-weight: 800; }
.par-canvas-note-trap::before { content: "⚠ "; }
/* ⚠ 함정 아래 예문 — 출제 포인트 예시 한 문장 */
.par-anno-example {
  display: block; margin-top: .5mm; padding: .4mm 1.4mm;
  border-left: .5mm solid var(--anno-c, #b42318); background: color-mix(in srgb, var(--anno-c, #b42318) 7%, #fff);
  font-family: var(--font-en); font-style: italic; color: #334155;
  font-size: calc(7.8pt * var(--par-fs, 1)); line-height: 1.4; overflow-wrap: anywhere;
}
.par-anno-example::before { content: "예) "; font-style: normal; font-family: var(--font-ko); font-weight: 800; color: var(--anno-c, #b42318); }

/* ── 오른쪽 여백 레일 (긴 필기 카드) ── */
.par-canvas-rail { display: flex; flex-direction: column; gap: 1.5mm; min-width: 0; }
.par-rail-card {
  position: relative; box-sizing: border-box;
  border: .25mm solid #c9ddf5; border-left: 1mm solid var(--anno-c, #2563a8);
  border-radius: 1mm; background: #fff;
  padding: 1.1mm 1.4mm;
  font-family: var(--font-ko);
  font-size: calc(8.6pt * var(--par-fs, 1)); line-height: 1.34; color: var(--text);
  overflow-wrap: anywhere; break-inside: avoid;
}
.par-rail-card.is-exam { border-color: #f3c9ce; }
.par-rail-card.is-logic { border-color: #e0d28a; background: #fffdf3; }
.par-rail-card.is-parsing { border-color: #aef0d2; background: #f8fffb; }
/* 카드가 가리키는 본문 영어 구절 — 검정 본문의 어디서 왔는지 표시 */
.par-rail-card-src {
  display: block; font-family: var(--font-en); font-style: italic; font-weight: 700;
  color: var(--anno-c, #2563a8); font-size: calc(7.7pt * var(--par-fs, 1)); line-height: 1.3;
  margin-bottom: .6mm; padding-bottom: .5mm; border-bottom: .2mm dotted var(--anno-c, #2563a8); overflow-wrap: anywhere;
}
.par-rail-card-src::before { content: "❝ "; font-style: normal; opacity: .7; }
.par-rail-card-src::after { content: " ❞"; font-style: normal; opacity: .7; }
.par-canvas-fn-src { font-family: var(--font-en); font-style: italic; font-weight: 700; color: var(--anno-c, #475569); }
.par-rail-card-role { display: block; color: var(--anno-c, #2563a8); font-weight: 900; font-size: calc(8.6pt * var(--par-fs, 1)); margin-bottom: .4mm; }
.par-rail-card-anchor { display: block; color: #0369a1; font-family: var(--font-en); font-weight: 700; font-size: calc(7.8pt * var(--par-fs, 1)); }
.par-rail-card-line { display: block; }
.par-rail-card-trap { display: block; color: #b42318; font-weight: 800; }
.par-rail-card-trap::before { content: "⚠ "; }

/* ── 연결선 (장식 SVG, 높이 0 / 측정 무영향) ── */
/* overflow:hidden — 연결선 좌표는 JS(getBoundingClientRect)로 측정되는데, 일시적 레이아웃(카드/앵커 rect 0,0)에서
   stale 좌표가 잡히면 overflow:visible 일 때 선이 캔버스를 벗어나 다른 페이지(예: 1페이지)로 새어나가던 문제 차단.
   정상 연결선은 캔버스 내부에 있으므로 클립되지 않음. */
.par-canvas-connectors { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; overflow: hidden; clip-path: inset(0); z-index: 2; }
.par-canvas-connectors path { fill: none; stroke: var(--anno-c, #2563a8); stroke-width: .35mm; stroke-linejoin: round; stroke-linecap: round; opacity: .8; }
.par-canvas-connectors circle { fill: var(--anno-c, #2563a8); opacity: .9; }

/* ── 전체폭 한글 해석 ── */
.par-canvas-trans {
  margin-top: 1.8mm; padding-top: 1.3mm;
  border-top: .25mm solid var(--tint-border);
  display: grid; grid-template-columns: 5.6mm minmax(0, 1fr); gap: 1.4mm; align-items: baseline;
}
.par-canvas-trans-no { color: #0ea5e9; font-weight: 900; font-size: calc(8.4pt * var(--par-fs, 1)); }
.par-canvas-trans-ko { margin: 0; color: var(--text); font-size: calc(9.4pt * var(--par-fs, 1)); line-height: 1.55; }

/* ── 각주 (공간 부족 시 강등된 필기 — 빽빽하게 줄바꿈) ── */
.par-canvas-footnotes {
  margin-top: 1.3mm; padding-top: 1mm;
  border-top: .25mm dashed var(--tint-border);
  display: flex; flex-wrap: wrap; gap: .6mm 3mm;
  font-family: var(--font-ko);
  font-size: calc(8pt * var(--par-fs, 1)); line-height: 1.4; color: var(--text-muted);
}
.par-canvas-fn { min-width: 0; max-width: 100%; }
.par-canvas-fn::before { content: "▸ "; color: var(--gold); font-weight: 800; }
.par-canvas-fn-role { color: var(--anno-c, #475569); font-weight: 800; }
.par-canvas-fn-trap { color: #b42318; font-weight: 700; }

/* ══ 필기 분석 v3 — 직독직해 뜻(위) + 영어 + 짧은 역할(아래) / 어법·구문은 아래 목록 + 번호·화살표 ══ */
/* 왼쪽에 비어 있는 연결선 통로(거터) 확보 — 화살표 세로줄이 본문/뱃지를 침범하지 않게 */
.par-canvas-v3 { padding-left: 6mm; }
.par-canvas-v3 .par-canvas-staff { align-items: flex-end; row-gap: 3mm; column-gap: 0; }
/* 직독직해 한글 뜻 — 영어 위 */
.par-canvas-v3 .par-canvas-gloss {
  display: block; font-size: calc(7.5pt * var(--par-fs, 1)); color: #6a7b8e; line-height: 1.15;
  margin-bottom: .4mm; white-space: nowrap;
}
/* 밑줄↔설명 연결 번호 뱃지 (뜻 줄에) */
.par-canvas-v3 .par-canvas-lk {
  display: inline-flex; align-items: center; justify-content: center; width: 3mm; height: 3mm;
  margin-left: .8mm; border-radius: 50%; background: var(--anno-c, #2563a8); color: #fff;
  font-family: var(--font-ko); font-size: calc(5.6pt * var(--par-fs, 1)); font-weight: 800; vertical-align: middle;
}
/* 모든 청크 영어에 동일한 밑줄 자리(투명) 확보 → 밑줄 유무로 글자가 밀리지 않음 */
.par-canvas-v3 .par-canvas-en { padding-bottom: .2mm; border-bottom: .45mm solid transparent; text-decoration: none; }
.par-canvas-v3 .par-canvas-chunk.is-anchored .par-canvas-en { text-decoration: none; border-bottom-color: var(--anno-c, #94a3b8); }
/* 필기 캔버스에서는 핵심 어휘 '굵은 밑줄'(par-kw)을 표시하지 않는다 — 청크 밑줄과 겹쳐 지저분해지므로. (clean 모드 등 다른 뷰의 par-kw 밑줄은 유지) */
.par-canvas-v3 .par-kw { text-decoration: none; }
/* 짧은 구문 역할 — 영어 아래(중립 슬레이트) */
.par-canvas-v3 .par-canvas-role {
  align-self: stretch; margin-top: .6mm; padding-top: .4mm; border-top: .3mm solid #cdd6e0;
  color: #5b7088; font-weight: 700; font-size: calc(6.8pt * var(--par-fs, 1)); line-height: 1.12;
  overflow-wrap: anywhere;
}
.par-canvas-v3 .par-canvas-sep {
  align-self: flex-end; flex: 0 0 auto; margin: 0 1.2mm; color: #c2ccd8;
  font-family: var(--font-en); font-size: calc(11pt * var(--par-fs, 1)); font-weight: 400; padding-bottom: 1.6mm;
}

/* 어법·구문 목록 (문장 아래) */
.par-canvas-list { margin-top: 2.4mm; display: flex; flex-direction: column; gap: 1.2mm; }
.par-list-note { position: relative; padding-left: 5.4mm; font-size: calc(8.4pt * var(--par-fs, 1)); line-height: 1.42; color: #26323f; }
.par-list-badge {
  position: absolute; left: 0; top: .4mm; display: inline-flex; align-items: center; justify-content: center;
  width: 3.6mm; height: 3.6mm; border-radius: 50%; background: var(--anno-c, #2563a8); color: #fff;
  font-weight: 800; font-size: calc(6pt * var(--par-fs, 1));
}
.par-list-body { display: block; }
.par-list-kind { font-weight: 800; color: var(--anno-c, #2563a8); }
.par-list-src { font-family: var(--font-en); font-style: italic; font-weight: 700; color: var(--anno-c, #2563a8); }
.par-list-role { font-weight: 800; color: var(--anno-c, #2563a8); }
.par-list-line { }
.par-list-trap { display: block; margin-top: .4mm; color: #b42318; font-weight: 600; }
.par-list-trap::before { content: "⚠ "; }

/* 함정 예문(목록·레일 공통) — 틀린 토큰 빨강 텍스트 / 정답 초록 */
.par-ex-bad { color: #dc2626; font-weight: 800; }
.par-ex-good { color: #047857; font-weight: 700; font-style: normal; }

/* 연결선(화살표) — 본문 캔버스 안으로 클립되어 인쇄/페이지분할에서 새지 않음 */
.par-conn-line { fill: none; stroke-width: .3mm; opacity: .8; stroke-linejoin: miter; stroke-linecap: butt; }

/* ── 인쇄 ── */
@media print {
  @page { size: A4; margin: 0; }
  html, body {
    background: #fff !important;
    margin: 0 !important;
    padding: 0 !important;
    /* 모달이 body 에 inline 으로 건 overflow:hidden / 고정 높이가 인쇄를 1페이지로 자르는 것 방지 */
    overflow: visible !important;
    height: auto !important;
  }

  /* 측정용 숨김 클론·표지 미리보기 썸네일은 절대 인쇄하지 않음.
     (아래 .par-root * 의 visibility:visible 가 숨김 측정 컨테이너/미리보기를 되살리던 버그 차단) */
  .par-measure { display: none !important; }
  .par-cover-preview { display: none !important; }
  /* 편집 전용 UI(열 너비 핸들·그립·삭제 버튼 등)는 인쇄에서 제외. */
  .par-edit-chrome { display: none !important; }
  /* 웹 전용 편집 컨트롤(.no-print) — 학습 활동 툴바(새 빈칸/빈칸 밀도/정답 보기/삭제) 등은
     .par-root 안에서 렌더되어 아래 visibility:visible 규칙에 의해 다시 보이게 되므로,
     display:none 으로 완전히 제거한다(visibility 와 별개 속성이라 재노출을 확실히 무력화). */
  .no-print, .no-print * { display: none !important; }

  /* 화면 전체를 숨기고 실제 보고서(.par-root)만 인쇄.
     우측 패널 미리보기(.par-cover-preview)는 같은 .par-root 라도 제외한다. */
  body * { visibility: hidden !important; }
  .par-root:not(.par-cover-preview),
  .par-root:not(.par-cover-preview) * { visibility: visible !important; }

  /* 보고서 계보(조상 체인)를 제외한 모든 형제 요소(모달 헤더·우측 표지 패널·페이지 인디케이터·
     모달 뒤의 워크벤치 페이지·토스트 등)를 흐름에서 완전히 제거한다.
     visibility:hidden 은 숨겨도 '자리'는 차지하므로, 보고서(예: 7쪽)보다 긴 숨김 요소들이
     그 길이만큼 8·9·10페이지 같은 빈 페이지를 만들던 문제를 해결한다. */
  :has(.par-root:not(.par-cover-preview))
    > *:not(:has(.par-root:not(.par-cover-preview))):not(.par-root:not(.par-cover-preview)) {
    display: none !important;
  }

  /* 보고서를 감싼 모든 조상(모달·스크롤러·고정 컨테이너)의 클리핑·포지션·높이 제한을 해제.
     모달의 overflow:hidden / position:relative / 고정 높이 때문에 보고서가 표지(첫 화면)에서
     잘려 "모든 페이지가 표지로만" 인쇄되던 문제를 해결한다. */
  body:has(.par-root:not(.par-cover-preview)) *:has(.par-root:not(.par-cover-preview)) {
    overflow: visible !important;
    position: static !important;
    max-height: none !important;
    height: auto !important;
    transform: none !important;
  }

  .par-root:not(.par-cover-preview) {
    position: absolute !important;
    left: 0; top: 0;
    width: 210mm;
    margin: 0 !important;
    padding: 0 !important;
    background: #fff !important;
  }
  .par-sheet { box-shadow: none !important; margin: 0 !important; break-after: page; zoom: 1 !important; }
  .par-sheet:last-child { break-after: auto; }
  .par-canvas { break-inside: avoid; }
  /* 연결선 SVG가 인쇄 래스터에서 캔버스 박스를 벗어나 다른 페이지(1페이지 좌상단)로
     새어나가지 않도록 인쇄 시에도 자기 캔버스 박스에 강제 클립한다.
     (overflow:hidden 만으로는 viewBox 없는 outer SVG 의 클립이 인쇄에서 불안정함.) */
  .par-canvas-connectors { overflow: hidden !important; clip-path: inset(0) !important; }
  /* 표 격자 인쇄 안정화 — 분수폭 테두리(border)가 인쇄 드라이버(특히 Microsoft Print to PDF)
     의 래스터라이저에서 줄마다 들쭉날쭉 사라지는 문제를 근본 차단한다.
     테두리 대신 "표 배경색이 칸 사이 간격(border-spacing)으로 비치는" 방식으로 격자선을 그린다.
     배경 채움(fill)은 thin-line 처럼 드롭되지 않고 어떤 래스터라이저에서도 일관되게 칠해지므로
     모든 가로·세로 선이 끊김 없이 출력된다. (print-color-adjust:exact 가 이미 강제돼 배경이
     '배경 그래픽' 토글과 무관하게 인쇄됨.) 화면(non-print)은 기존 border-collapse 그대로 유지. */
  /* 행 구분을 '얇은 선'이 아니라 '솔리드 배경 띠(zebra)'로 보장한다 — 이것이 핵심.
     얇은 선(테두리/간격)은 인쇄·뷰어 래스터에서 1픽셀 미만이라 그 줄이 픽셀 격자에
     어떻게 걸치느냐에 따라 사라질 수 있다(=단어마다 선이 있다 없다 함). 반면 큰 솔리드
     배경 영역의 '경계'는 채워진 사각형의 가장자리라 어떤 배율·뷰어·인쇄 드라이버에서도
     절대 사라지지 않는다. 그래서 테마와 무관하게 홀/짝 행에 또렷이 구분되는 배경색을
     강제해 모든 행이 색 띠로 구분되게 한다. 격자선(gap-fill)은 보조 장식.
     (print-color-adjust:exact 가 이미 강제돼 배경은 '배경 그래픽' 토글과 무관하게 인쇄됨.) */
  .par-table { border-collapse: separate !important; border-spacing: 0.5mm !important; background-color: #94a3b8 !important; border: 0.6mm solid #94a3b8 !important; box-sizing: border-box !important; }
  .par-table th, .par-table td { border: 0 !important; background-clip: padding-box !important; }
  .par-table tbody tr td { background-color: #ffffff !important; }
  .par-table tbody tr:nth-child(even) td { background-color: #e2e8f0 !important; }
  .par-table thead th { background-color: var(--table-head-bg, var(--ink-fill, var(--ink))) !important; }
  /* 보고서 전체의 배경색/채움색을 강제 인쇄 — 브라우저 '배경 그래픽' 토글(기본 OFF)에 의존하지 않도록.
     이 규칙이 좁게(필기분석 요소만) 걸려 있어서, 제목 블록·구조도 박스·표 헤더/줄무늬·표지 등
     나머지 페이지의 배경색이 인쇄에서 사라져 미리보기와 달라 보이던 문제를 해결한다. */
  .par-root:not(.par-cover-preview),
  .par-root:not(.par-cover-preview) * {
    -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;
  }
}
`;
