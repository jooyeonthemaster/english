/**
 * PRIME ANALYSIS 보고서 CSS — 디자인 시스템을 CSS 변수로 구동.
 * 색은 컴포넌트가 .par-root 에 --ink/--gold 등으로 주입 (테마 전환 지원).
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
  font-size: 10pt;
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
}
.par-sheet-body { flex: 1; min-height: 0; }
/* 측정용 숨김 컨테이너 (본문 폭과 동일) */
.par-measure { position: absolute; visibility: hidden; pointer-events: none; left: -99999px; top: 0; width: 174mm; }

/* ── 러닝 헤더/푸터 ── */
.par-runhead {
  display: flex; justify-content: space-between; align-items: baseline;
  font-size: 8pt; letter-spacing: .04em;
  color: var(--ink); border-bottom: .6mm solid var(--rule);
  padding-bottom: 2mm; margin-bottom: 5mm; font-weight: 700; flex: 0 0 auto;
}
.par-runhead .par-runhead-r { color: var(--text-muted); font-weight: 500; }
.par-runfoot {
  display: flex; justify-content: space-between; align-items: center;
  font-size: 7.5pt; color: var(--text-muted);
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
/* 도식 항목 래퍼 — par-map 안에서 중앙정렬 유지 */
.par-mapitem { display: flex; flex-direction: column; align-items: center; width: 100%; }

/* 커스텀 블록 — 여백 / 자유 텍스트 (보기·인쇄 공통) */
.par-spacer-fill { width: 100%; }
.par-customtext { font-size: calc(10pt * var(--par-fs, 1)); }
.par-customtext-h { font-weight: 800; color: var(--ink); margin-bottom: 1.5mm; }
.par-customtext-b { white-space: pre-wrap; line-height: 1.6; }

/* ── 타이틀 블록 ── */
.par-title {
  background: var(--ink); color: #fff; border-left: 2.2mm solid var(--gold);
  padding: 7mm 8mm; border-radius: 1.5mm; margin-bottom: 4mm;
}
.par-title .par-eyebrow {
  color: var(--gold-soft); font-size: 8.5pt; font-weight: 800;
  letter-spacing: .22em; margin-bottom: 2.5mm;
}
.par-title .par-title-ko { font-size: 21pt; font-weight: 800; line-height: 1.18; margin: 0; }
.par-title .par-title-en {
  font-family: var(--font-en); font-style: italic; font-size: 12pt;
  color: #d7def0; margin-top: 2mm;
}

/* ── 메타 테이블 ── */
.par-meta { width: 100%; border-collapse: collapse; margin-bottom: 3mm; font-size: 8.5pt; }
.par-meta th, .par-meta td { border: .3mm solid var(--tint-border); padding: 2mm 2.5mm; text-align: center; }
.par-meta th { background: var(--ink); color: #fff; font-weight: 700; letter-spacing: .02em; }
.par-meta td { color: var(--text); }
.par-meta .par-meta-diff { color: var(--gold); font-weight: 800; }
.par-docnote { display: flex; justify-content: flex-end; gap: 4mm; font-size: 7.5pt; color: var(--text-muted); letter-spacing: .03em; }

/* ── 섹션 헤더 ── */
.par-sec-head {
  display: flex; align-items: center; gap: 3mm;
  background: var(--ink); color: #fff; border-left: 2.2mm solid var(--gold);
  padding: 2.5mm 4mm; border-radius: 1mm; margin-bottom: 3.5mm;
}
.par-sec-head .par-sec-no { color: var(--gold-soft); font-weight: 800; font-size: calc(13pt * var(--par-fs, 1)); font-style: italic; }
.par-sec-head .par-sec-ko { font-weight: 800; font-size: calc(12pt * var(--par-fs, 1)); }
.par-sec-head .par-sec-en { font-family: var(--font-en); font-style: italic; font-size: calc(9pt * var(--par-fs, 1)); color: #c2cbe0; }
.par-cont-head { font-size: 8.5pt; font-weight: 700; color: var(--ink); margin-bottom: 2.5mm; }
.par-cont-head .par-cont-k { color: var(--gold); }
.par-note { font-size: 8pt; color: var(--text-muted); font-style: italic; margin: 0 0 3mm; }

/* ── 박스(틴트) ── */
.par-box { background: var(--tint); border: .3mm solid var(--tint-border); border-radius: 1.5mm; padding: 4mm 5mm; }
.par-box.par-accent { border-left: 1.5mm solid var(--gold); }

/* ── 01 원문 ── */
.par-sentences { list-style: none; margin: 0; padding: 0; }
.par-sentences li { display: flex; gap: 2.5mm; margin-bottom: 2.5mm; }
.par-sentences li:last-child { margin-bottom: 0; }
.par-sno { flex: 0 0 auto; color: var(--gold); font-weight: 800; min-width: 5mm; }
.par-sen-en { margin: 0; font-size: calc(10pt * var(--par-fs, 1)); }
.par-sen-ko { margin: .8mm 0 0; color: var(--text-muted); font-size: calc(9pt * var(--par-fs, 1)); }
.par-kw { background: transparent; color: var(--ink); font-weight: 700; text-decoration: underline; text-decoration-color: var(--gold); text-underline-offset: 2px; text-decoration-thickness: .4mm; }

/* ── 02 구조도 ── */
.par-map { display: flex; flex-direction: column; align-items: center; gap: 0; }
.par-node { background: var(--ink); color: #fff; border-radius: 2mm; padding: 3mm 6mm; text-align: center; min-width: 60%; }
.par-node .par-node-eyebrow { color: var(--gold-soft); font-size: 7pt; font-weight: 800; letter-spacing: .18em; margin-bottom: 1mm; }
.par-node .par-node-label { font-weight: 800; font-size: 11pt; }
.par-node.par-node-soft { background: var(--ink-soft); min-width: 48%; padding: 2.5mm 5mm; }
.par-node.par-node-soft .par-node-label { font-size: 10pt; }

/* 화살표 — 세로선 + 아래 삼각형 (또렷하게) */
.par-arrow { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 7mm; }
.par-arrow .par-arrow-line { width: .7mm; height: 4.5mm; background: var(--ink); }
.par-arrow .par-arrow-head { width: 0; height: 0; border-left: 1.8mm solid transparent; border-right: 1.8mm solid transparent; border-top: 2.2mm solid var(--ink); margin-top: -.2mm; }

.par-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 4mm; width: 100%; }
.par-col { background: var(--tint); border: .3mm solid var(--tint-border); border-top: 1.5mm solid var(--gold); border-radius: 1.5mm; padding: 3.5mm 4mm; display: flex; flex-direction: column; }
.par-col-head { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 2.5mm; }
.par-col-head .par-col-en { font-weight: 800; font-size: 13pt; color: var(--ink); letter-spacing: .04em; }
.par-col-head .par-col-ko { font-size: 9pt; color: var(--text-muted); font-weight: 700; }
.par-col ul { margin: 0; padding-left: 4mm; flex: 1; }
.par-col li { margin-bottom: 1.5mm; font-size: 9pt; }
.par-col-foot { margin-top: 2.5mm; text-align: center; font-size: 8pt; font-weight: 700; color: var(--ink); background: #fff; border: .3mm solid var(--tint-border); border-radius: 1mm; padding: 1.5mm; }
/* sequence 변형 — 단계 흐름도 */
.par-steps { display: flex; flex-direction: column; align-items: stretch; gap: 0; width: 86%; }
.par-step { display: flex; gap: 3mm; align-items: flex-start; background: var(--tint); border: .3mm solid var(--tint-border); border-left: 1.5mm solid var(--gold); border-radius: 1.5mm; padding: 3mm 4mm; }
.par-step-no { flex: 0 0 auto; width: 7mm; height: 7mm; border-radius: 50%; background: var(--ink); color: #fff; font-weight: 800; font-size: 9pt; display: flex; align-items: center; justify-content: center; }
.par-step-body { flex: 1; }
.par-step-title { font-weight: 800; color: var(--ink); font-size: 10pt; }
.par-step-en { font-family: var(--font-en); font-style: italic; font-weight: 600; color: var(--text-muted); font-size: 9pt; }
.par-step-detail { font-size: 9pt; margin-top: .8mm; }
.par-core { background: var(--ink); color: #fff; border: 1mm solid var(--gold); border-radius: 2mm; padding: 3mm 6mm; text-align: center; min-width: 70%; }
.par-core .par-core-eyebrow { color: var(--gold-soft); font-size: 7pt; font-weight: 800; letter-spacing: .18em; }
.par-core .par-core-label { font-weight: 800; font-size: 13pt; margin: 1mm 0; }
.par-core .par-core-detail { font-size: 8pt; color: #cdd5e6; }
.par-concl { background: var(--tint); border: .3mm solid var(--gold); border-radius: 2mm; padding: 3mm 6mm; text-align: center; min-width: 80%; }
.par-concl .par-concl-eyebrow { color: var(--gold); font-size: 7pt; font-weight: 800; letter-spacing: .18em; margin-bottom: 1mm; }
.par-concl .par-concl-text { font-weight: 700; font-size: 10pt; color: var(--ink); }
.par-logic { margin-top: 4mm; }
.par-logic .par-logic-k { color: var(--gold); font-weight: 800; margin-right: 2mm; }

/* ── 03 요약 ── */
.par-summary ol { margin: 0; padding-left: 5mm; }
.par-summary li { margin-bottom: 1.8mm; font-size: calc(10pt * var(--par-fs, 1)); }
.par-thesis { background: var(--ink); color: #fff; border-left: 2mm solid var(--gold); border-radius: 1.5mm; padding: 4mm 5mm; margin-top: 4mm; }
.par-thesis .par-thesis-eyebrow { color: var(--gold-soft); font-size: 7.5pt; font-weight: 800; letter-spacing: .2em; margin-bottom: 1.5mm; }
.par-thesis .par-thesis-en { font-family: var(--font-en); font-style: italic; font-size: calc(11.5pt * var(--par-fs, 1)); line-height: 1.4; }

/* ── 표 (04/05/06) ── */
.par-table { width: 100%; border-collapse: collapse; font-size: calc(8.7pt * var(--par-fs, 1)); }
/* 행(tr)에 --par-fs 가 실리므로 tr 기준으로 글자크기 → td 가 상속받아 행 단위 크기 조절이 먹는다 */
.par-table tbody tr { font-size: calc(8.7pt * var(--par-fs, 1)); }
.par-table th, .par-table td { border: .3mm solid var(--tint-border); padding: 2mm 2.5mm; text-align: left; vertical-align: top; }
.par-table thead th { background: var(--ink); color: #fff; font-weight: 700; }
.par-table tbody tr:nth-child(even) td { background: var(--table-stripe); }
.par-cell-no { text-align: center; color: var(--gold); font-weight: 800; white-space: nowrap; }
.par-cell-pos { text-align: center; font-style: italic; color: var(--text-muted); white-space: nowrap; }
.par-cell-pron { text-align: center; color: var(--text-muted); font-size: calc(8.3pt * var(--par-fs, 1)); }
.par-cell-head { font-weight: 800; color: var(--ink); }
.par-cell-syn { font-style: italic; color: var(--text-muted); }
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
.par-quiz .par-q-no { font-weight: 800; color: var(--ink); font-size: 10pt; }
.par-quiz .par-q-type { font-size: 7pt; font-weight: 700; color: #fff; background: var(--gold); padding: .4mm 1.8mm; border-radius: 1mm; letter-spacing: .02em; }
.par-quiz .par-q-prompt { line-height: 1.7; }
.par-blank { display: inline-block; min-width: 14mm; border-bottom: .4mm solid var(--ink); margin: 0 .5mm; vertical-align: baseline; }
.par-quiz .par-q-choices { list-style: none; margin: 2mm 0 0; padding: 0; display: flex; flex-direction: column; gap: 1.4mm; font-size: 9.2pt; }
.par-quiz .par-q-choices li { display: flex; gap: 2mm; align-items: baseline; line-height: 1.45; }
.par-quiz .par-choice-mark { color: var(--gold); font-weight: 800; flex: 0 0 auto; }
.par-answers { background: var(--ink); color: #fff; border-left: 2mm solid var(--gold); border-radius: 1.5mm; padding: 3.5mm 5mm; }
.par-answers .par-ans-eyebrow { color: var(--gold-soft); font-size: 7.5pt; font-weight: 800; letter-spacing: .2em; margin-bottom: 2mm; }
.par-answers .par-ans-row { font-size: 8.7pt; margin-bottom: 1mm; }
.par-answers .par-ans-no { color: var(--gold-soft); font-weight: 800; margin-right: 1.5mm; }

/* ── 표지(Cover) — 6개 템플릿 (보기·인쇄 공통) ── */
.par-sheet-cover { padding: 0 !important; }
.par-cover-shell { flex: 1; width: 100%; display: flex; }
.par-cover-preview { display: flex; }
.par-cover { flex: 1; width: 100%; display: flex; flex-direction: column; position: relative; box-sizing: border-box; overflow: hidden; }
.par-cov-eyebrow { font-size: 9pt; font-weight: 800; letter-spacing: .26em; color: var(--gold); text-transform: uppercase; }
.par-cov-title { font-size: 30pt; font-weight: 800; line-height: 1.14; color: var(--ink); margin: 0; }
.par-cov-title-l { text-align: left; }
.par-cov-title-white { color: #fff; }
.par-cov-sub { font-family: var(--font-en); font-style: italic; font-size: 14pt; color: var(--text-muted); }
.par-cov-sub-white { color: #d7def0; }
.par-cov-rule { width: 26mm; height: .8mm; background: var(--gold); margin: 5mm 0; }
.par-cov-tag { font-size: 10.5pt; color: var(--text); }
.par-cov-logo { display: flex; align-items: center; }
.par-cov-logo img { display: block; }
.par-cov-metaline { display: flex; gap: 2mm; align-items: center; font-size: 9pt; color: var(--text-muted); margin-top: 3mm; }
.par-cov-metaline .par-cov-stars { color: var(--gold); }
.par-cov-dot { color: var(--tint-border); }
.par-cov-zone-bot { flex: 0 0 auto; display: flex; justify-content: space-between; width: 100%; font-size: 9pt; color: var(--text-muted); letter-spacing: .05em; border-top: .3mm solid var(--tint-border); padding-top: 4mm; margin-top: 6mm; }

/* 1) classic-center */
.par-cov-classic { padding: 22mm 20mm; text-align: center; align-items: center; }
.par-cov-classic .par-cov-zone-top { flex: 0 0 auto; min-height: 16mm; display: flex; align-items: center; justify-content: center; }
.par-cov-classic .par-cov-zone-mid { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3mm; }
.par-cov-classic .par-cov-rule { margin: 5mm auto; }
.par-cov-classic .par-cov-title { font-size: 33pt; }

/* 2) spine-left */
.par-cov-spine { flex-direction: row; padding: 0; }
.par-cov-spine-bar { width: 11mm; background: var(--ink); border-right: 2mm solid var(--gold); flex: 0 0 auto; }
.par-cov-spine-body { flex: 1; display: flex; flex-direction: column; padding: 24mm 20mm; }
.par-cov-spine-body .par-cov-logo { margin-bottom: 8mm; }
.par-cov-spine-mid { flex: 1; display: flex; flex-direction: column; justify-content: center; gap: 3mm; align-items: flex-start; }
.par-cov-spine-bot { display: flex; justify-content: space-between; font-size: 9pt; color: var(--text-muted); border-top: .3mm solid var(--tint-border); padding-top: 4mm; }

/* 3) band-fill */
.par-cov-band { padding: 0; }
.par-cov-band-top { background: var(--ink); color: #fff; padding: 26mm 20mm 16mm; display: flex; flex-direction: column; gap: 3mm; flex: 0 0 auto; min-height: 45%; justify-content: center; border-bottom: 2mm solid var(--gold); }
.par-cov-band-bot { flex: 1; padding: 16mm 20mm; display: flex; flex-direction: column; gap: 4mm; }
.par-cov-band-foot { margin-top: auto; display: flex; justify-content: space-between; font-size: 9pt; color: var(--text-muted); border-top: .3mm solid var(--tint-border); padding-top: 4mm; }
.par-cov-eyebrow-gold { color: var(--gold-soft); }

/* 4) numeral-hero */
.par-cov-numeral { padding: 22mm 20mm; }
.par-cov-numeral-bg { position: absolute; top: -10mm; right: -4mm; font-family: var(--font-en); font-weight: 800; font-size: 150pt; line-height: 1; color: var(--tint); z-index: 0; }
.par-cov-numeral-top, .par-cov-numeral-mid { position: relative; z-index: 1; }
.par-cov-numeral .par-cov-zone-bot { position: relative; z-index: 1; }
.par-cov-numeral-top { flex: 0 0 auto; min-height: 14mm; }
.par-cov-numeral-mid { flex: 1; display: flex; flex-direction: column; justify-content: center; gap: 3mm; }

/* 5) index-grid */
.par-cov-index { padding: 24mm 20mm; }
.par-cov-index-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 5mm; }
.par-cov-index .par-cov-title { font-size: 26pt; margin-top: 2mm; }
.par-cov-index-grid { margin-top: 10mm; border-top: .5mm solid var(--ink); }
.par-cov-index-row { display: flex; padding: 3.2mm 0; border-bottom: .3mm solid var(--tint-border); font-size: 10pt; }
.par-cov-index-k { width: 30mm; flex: 0 0 auto; font-weight: 800; color: var(--gold); letter-spacing: .05em; }
.par-cov-index-v { color: var(--text); }

/* 6) framed-card */
.par-cov-framed { padding: 13mm; }
.par-cov-framed-card { flex: 1; border: .6mm solid var(--ink); border-radius: 2mm; padding: 16mm 14mm; display: flex; flex-direction: column; align-items: center; text-align: center; position: relative; }
.par-cov-framed-card::before { content: ""; position: absolute; inset: 3mm; border: .3mm solid var(--gold); border-radius: 1mm; pointer-events: none; }
.par-cov-framed-top { display: flex; flex-direction: column; align-items: center; gap: 2mm; }
.par-cov-framed-mid { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2.5mm; }
.par-cov-framed-bot { font-size: 9pt; color: var(--text-muted); letter-spacing: .1em; }
.par-cov-framed .par-cov-title { font-size: 28pt; }

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
  .par-sheet { box-shadow: none !important; margin: 0 !important; break-after: page; }
  .par-sheet:last-child { break-after: auto; }
}
`;
