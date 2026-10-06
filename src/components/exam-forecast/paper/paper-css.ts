// 한광고 기출 동형 시험지 조판 CSS.
//
// 실측 근거(스캔 216dpi → A4 환산, 형식 렌즈 .tmp-hanguang/analysis/lenses.json 「형식·조판」 spacingMm):
//   테두리 x 10.3~201.4 · y 12.9~287.0(0.4mm) · 단 본문 폭 90.2/91.1 · 단 구분선 x 105.3(0.15mm)
//   줄 피치 5.07mm(단당 약 52줄) · 한글 1자 3.25mm(9.2pt) · 영어는 한글 명조에 딸린 라틴 자형
//   영어 10.1pt·낱말 간격 0 = 기출 27개 지문 줄 수와 18개 일치·9개 ±1줄(보정 하네스 .tmp-hanguang/fmt/calib2.mjs)
//   단마다 문항 블록 2개 — 위 블록은 단 꼭대기, 아래 블록은 단 바닥, 남는 공간은 블록 사이.
//
// 엔진: paged-paper.tsx 가 블록 높이를 재서 단·쪽에 배치한다(paginate.ts). 쪽은 210×297mm 절대 배치,
//       @page 여백 0. 정답·해설지(answer-sheet.tsx)만 다단 흐름(FORECAST_FLOW_CSS).

export const FORECAST_PAPER_FONTS_HREF =
  "https://fonts.googleapis.com/css2?family=Nanum+Myeongjo:wght@400;700;800&family=Tinos:ital,wght@0,400;0,700;1,400;1,700&family=Nanum+Gothic:wght@400;700;800&display=block";

/** 문항 블록 공통 — 화면 미리보기 카드·시험지·정답지가 같이 쓴다(@page 없음) */
export const FORECAST_BLOCK_CSS = String.raw`
/* 짧은 하이픈: 나눔명조는 '-' 를 길게 그린다 → 하이픈만 Times 계열로 */
@font-face { font-family: "FcpHyphen"; src: local("Times New Roman"), local("Tinos"); unicode-range: U+002D; }
.fcp-root {
  --fcp-fs: 10.1pt;
  --fcp-lh: 5.07mm;
  --fcp-ko-fs: 9.2pt;
  --fcp-serif: "FcpHyphen", "Nanum Myeongjo", "Batang", serif;
  --fcp-ko: "Nanum Myeongjo", "Batang", serif;
  --fcp-gothic: "Nanum Gothic", "Malgun Gothic", sans-serif;
  color: #000;
  font-family: var(--fcp-serif);
  font-size: var(--fcp-fs);
  line-height: var(--fcp-lh);
  word-break: keep-all;
  overflow-wrap: break-word;
  font-kerning: normal;
  -webkit-font-smoothing: antialiased;
}
.fcp-part { display: flow-root; }
.fcp-group {
  font-family: var(--fcp-ko); font-weight: 700; font-size: 9.3pt; word-spacing: 0.22em;
  padding-left: 1em; text-indent: -1em; margin: 0 0 2.6mm;
}
.fcp-stem { display: flex; font-family: var(--fcp-ko); font-size: var(--fcp-ko-fs); word-spacing: 0.22em; margin: 0 0 1.7mm; }
.fcp-stem .fcp-num { flex: none; font-weight: 700; margin-right: 0.45em; font-size: 9.6pt; word-spacing: 0; }
.fcp-stem .fcp-stem-t { flex: 1; min-width: 0; }
.fcp-pts { white-space: nowrap; word-spacing: 0; }
.fcp-pts.fcp-pts-wrap { display: block; text-align: right; }
.fcp-brl { margin-left: -0.42em; }
.fcp-brr { margin-right: -0.42em; }
.fcp-essay-label { font-family: var(--fcp-ko); font-size: var(--fcp-ko-fs); }
.fcp-essay-stem { font-family: var(--fcp-ko); font-size: var(--fcp-ko-fs); word-spacing: 0.22em; text-align: justify; margin: 0 0 5.07mm; }
.fcp-p { margin: 0; text-align: justify; text-indent: 3.1mm; -webkit-text-stroke: 0.12px #000; }
.fcp-p.fcp-noindent { text-indent: 0; }
.fcp-passage { margin: 0; }
.fcp-passage.fcp-order .fcp-p { text-indent: 0; margin-top: 2.4mm; }
.fcp-passage.fcp-order .fcp-p:first-child { margin-top: 0; }
.fcp-u { text-decoration: underline; text-decoration-thickness: 0.07em; text-underline-offset: 0.18em; }
.fcp-mark { font-family: var(--fcp-ko); font-weight: 800; -webkit-text-stroke: 0; }
.fcp-mark-sp { margin-right: 0.26em; }
.fcp-brk { display: inline-block; white-space: nowrap; text-indent: 0; }
.fcp-nw { white-space: nowrap; }
.fcp-lab { font-family: var(--fcp-gothic); font-size: 0.82em; margin-right: 0.3em; -webkit-text-stroke: 0; }
.fcp-blank {
  display: inline-block; width: var(--fcp-blank-w, 46mm); border-bottom: 0.2mm solid #000; text-align: center;
  text-indent: 0; line-height: 1.05; vertical-align: baseline; word-spacing: 0; white-space: nowrap;
}
.fcp-glue { white-space: nowrap; }
.fcp-blank-A { width: var(--fcp-blank-a, var(--fcp-blank-w, 34mm)); }
.fcp-blank-B { width: var(--fcp-blank-b, var(--fcp-blank-w, 24mm)); }
.fcp-blank-C { width: var(--fcp-blank-c, var(--fcp-blank-w, 13mm)); }
.fcp-slot { display: inline-block; white-space: nowrap; text-indent: 0; }
.fcp-box { border: 0.2mm solid #000; padding: 0.6mm 1.2mm 0.8mm; }
/* 해석·요약문 상자는 짧은 폭에 긴 어절·빈칸이 있어 양쪽 정렬하면 띄어쓰기가 크게 벌어진다 */
.fcp-box.fcp-box-flat .fcp-p { text-indent: 0; text-align: left; }
.fcp-box-given { margin: 0 0 3.2mm; }
.fcp-box-title { text-align: center; font-family: var(--fcp-ko); font-size: var(--fcp-ko-fs); }
.fcp-box.fcp-box-center .fcp-p { text-align: center; text-indent: 0; }
.fcp-chunks { text-wrap: balance; }
.fcp-chunk { white-space: nowrap; }
.fcp-box-ko .fcp-p { font-family: var(--fcp-ko); font-size: var(--fcp-ko-fs); word-spacing: 0.22em; -webkit-text-stroke: 0; }
/* 한글 해석 상자는 빈칸이 없다 — 기출(9쪽 논술형 1)처럼 양쪽 정렬로 상자 폭을 채운다 */
.fcp-box.fcp-box-ko .fcp-p { text-align: justify; }
.fcp-box-gap { margin-top: 5mm; }
.fcp-arrow { text-align: center; }
.fcp-summary { margin-top: 1mm; }

.fcp-tail { padding-top: 5.07mm; }
.fcp-tail.fcp-tail-tight { padding-top: 3.6mm; }
.fcp-tail.fcp-tail-top { padding-top: 0; }
.fcp-opt { display: flex; gap: 0.35em; margin: 0; }
.fcp-opt-n { flex: none; font-family: var(--fcp-ko); font-weight: 800; }
.fcp-opt-t { flex: 1; min-width: 0; text-align: justify; -webkit-text-stroke: 0.12px #000; }
.fcp-opts-ko .fcp-opt-t { font-family: var(--fcp-ko); font-size: var(--fcp-ko-fs); word-spacing: 0.22em; -webkit-text-stroke: 0; }
.fcp-grid2 { display: grid; grid-template-columns: 51% 49%; }
.fcp-grid3 { display: grid; grid-template-columns: 37% 39% 24%; }
/* 고정 배분 — 내용 열 너비는 question-parts 가 열마다 가장 긴 칸의 글자 수에 비례해 준다(자동 배분은 첫 열에 폭을 몰아 다른 열이 꺾였다) */
.fcp-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
.fcp-table th { font-weight: 400; text-align: left; padding: 0; }
.fcp-table td { padding: 0; vertical-align: top; }
.fcp-table .fcp-tn { width: 5%; font-family: var(--fcp-ko); font-weight: 800; white-space: nowrap; }
.fcp-table .fcp-tdot { text-align: center; letter-spacing: 0.08em; white-space: nowrap; }
.fcp-stack-line { display: flex; gap: 0.45em; }
.fcp-stack-line > span:first-child { flex: none; }
.fcp-answer-line { display: flex; align-items: flex-end; gap: 1.5mm; margin-top: 8.1mm; }
.fcp-answer-line:first-child { margin-top: 3mm; }
.fcp-answer-line .fcp-al-rule { flex: 1; border-bottom: 0.2mm solid #000; height: 4mm; }
.fcp-answer-line .fcp-al-pts, .fcp-answer-line .fcp-al-label { flex: none; white-space: nowrap; font-family: var(--fcp-ko); font-size: var(--fcp-ko-fs); }
`;

/** 쪽 배치(210×297mm 절대 좌표) */
export const FORECAST_PAGED_CSS = String.raw`
@page { size: A4; margin: 0; }
@media print {
  html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
  .fcp-screen-only { display: none !important; }
  .fcp-page { box-shadow: none !important; margin: 0 !important; }
  .fcp-pages { display: block !important; }
  .fcp-measure { display: none !important; }
}
.fcp-measure { position: absolute; left: -9999px; top: 0; width: 90.4mm; visibility: hidden; }
.fcp-page {
  position: relative; width: 210mm; height: 297mm; background: #fff; overflow: hidden;
  break-after: page; page-break-after: always; box-sizing: border-box;
}
.fcp-page:last-child { break-after: auto; page-break-after: auto; }
.fcp-frame { position: absolute; left: 10.3mm; top: 12.9mm; width: 191.1mm; height: 274.1mm; border: 0.4mm solid #000; box-sizing: border-box; }
.fcp-rule { position: absolute; left: 105.3mm; top: 12.9mm; bottom: 13mm; border-left: 0.15mm solid #000; }
.fcp-page-1 .fcp-rule { top: 43.9mm; }
.fcp-col { position: absolute; width: 90.4mm; display: flex; flex-direction: column; justify-content: flex-start; line-height: var(--fcp-lh); }
.fcp-col-L { left: 13.2mm; }
.fcp-col-R { left: 107.8mm; }
.fcp-col.fcp-between { justify-content: space-between; }
.fcp-col.fcp-start > .fcp-blk + .fcp-blk { margin-top: 11mm; }
.fcp-col > .fcp-spacer { flex: 1; }
.fcp-footer {
  position: absolute; left: 10.3mm; width: 191.1mm; top: 288.2mm; text-align: right; padding-right: 2mm; box-sizing: border-box;
  font-family: var(--fcp-gothic); font-size: 9pt; line-height: 1.3; white-space: nowrap;
}
.fcp-footer .fcp-ft-subject { margin-right: 6mm; }
.fcp-footer .fcp-ft-page { margin-right: 10mm; }

.fcp-head { position: absolute; left: 0; top: 0; width: 210mm; height: 44mm; font-family: var(--fcp-gothic); }
.fcp-head-rule { position: absolute; left: 13.2mm; width: 186.6mm; top: 43.9mm; border-top: 0.2mm solid #000; }
.fcp-head-grade {
  position: absolute; left: 24.9mm; top: 20.5mm; width: 22.5mm; height: 12.4mm; box-sizing: border-box;
  border: 0.4mm solid #000; border-radius: 3mm; display: flex; align-items: center; justify-content: center; font-size: 16.5pt; line-height: 1;
}
.fcp-head-line { position: absolute; left: 9.2mm; width: 200mm; text-align: center; white-space: nowrap; transform: translateY(-50%); line-height: 1; }
.fcp-head-school { top: 17.9mm; font-size: 13pt; }
.fcp-head-subject { top: 26.7mm; font-size: 21pt; -webkit-text-stroke: 0.25px #000; letter-spacing: 0.03em; }
.fcp-head-date { top: 37mm; font-size: 13pt; }
.fcp-notice { font-family: var(--fcp-gothic); font-size: 9.4pt; line-height: 4.1mm; border-bottom: 0.3mm solid #000; padding-bottom: 0.7mm; white-space: nowrap; }
.fcp-notice-2 { padding-left: 1.45em; }
.fcp-count {
  font-family: var(--fcp-gothic); font-size: 8.8pt; font-weight: 700; text-align: center; white-space: nowrap; line-height: 1.2;
  border: 0.45mm solid #000; border-radius: 2.5mm; height: 10.3mm; box-sizing: border-box; margin-top: 7.1mm; padding: 0 2.4mm;
  display: flex; align-items: center; justify-content: center;
}
.fcp-check { border: 0.3mm solid #000; padding: 2mm 3mm; margin: 0 1.8mm 1.7mm; font-family: var(--fcp-gothic); font-size: 9.2pt; line-height: 1.6; word-break: keep-all; }
.fcp-section {
  font-family: var(--fcp-gothic); font-size: 8.6pt; font-weight: 700; border-top: 0.5mm solid #000; border-bottom: 0.2mm solid #000;
  padding: 0.9mm 1mm; line-height: 1.35; margin-bottom: 3mm;
}
.fcp-section small { font-weight: 400; font-size: 7.8pt; }
@media screen {
  .fcp-pages { display: flex; flex-direction: column; align-items: center; gap: 18px; }
  .fcp-page { box-shadow: 0 4px 24px rgba(0,0,0,.16); }
}
`;

/** 정답·해설지 — 다단 흐름(쪽 테두리는 position:fixed 반복, 위아래 여백은 box-decoration-break: clone) */
export const FORECAST_FLOW_CSS = String.raw`
@page { size: A4; margin: 13mm 9.5mm 12mm 9.8mm; }
@media print {
  html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
  .fcp-screen-only { display: none !important; }
}
.fcp-flow-frame { position: fixed; inset: 0; border: 0.4mm solid #000; pointer-events: none; }
.fcp-flow {
  columns: 2; column-gap: 5mm; column-fill: auto; column-rule: 0.15mm solid #000; margin: 0 2.6mm; padding: 3.4mm 0 2.4mm;
  box-decoration-break: clone; -webkit-box-decoration-break: clone;
}
.fcp-flow-head { column-span: all; text-align: center; font-family: var(--fcp-gothic); font-size: 15pt; font-weight: 700; padding: 1mm 0 3mm; border-bottom: 0.2mm solid #000; margin-bottom: 3.5mm; }
.fcp-key-table { width: 100%; border-collapse: collapse; font-family: var(--fcp-gothic); font-size: 9pt; margin-bottom: 2.5mm; break-inside: avoid; line-height: 1.5; }
.fcp-key-table th, .fcp-key-table td { border: 0.2mm solid #000; text-align: center; padding: 0.4mm 0; }
.fcp-key-table th { background: #eee; }
.fcp-expl { font-family: var(--fcp-ko); font-size: 8.9pt; line-height: 1.55; margin: 0 0 3mm; break-inside: avoid-column; word-spacing: 0.08em; }
.fcp-expl b { font-family: var(--fcp-gothic); }
@media screen {
  .fcp-flow-screen { width: 210mm; margin: 0 auto; background: #fff; padding: 13mm 9.5mm 12mm 9.8mm; box-sizing: border-box; box-shadow: 0 4px 24px rgba(0,0,0,.16); position: relative; }
  .fcp-flow-screen .fcp-flow-frame { position: absolute; inset: 13mm 9.5mm 12mm 9.8mm; }
  .fcp-flow-screen .fcp-flow { column-fill: balance; }
}
`;
