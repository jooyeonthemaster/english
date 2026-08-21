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
  /* 출력물(인쇄/PDF) 한글 글꼴을 시험지와 동일한 맑은 고딕으로 통일한다. CDN Pretendard
     풀글리프 정적 빌드(굵기당 ~0.75MB)가 사용 굵기 수만큼 인쇄 스풀에 임베드돼 이미지 없는
     텍스트 문서도 ~5MB로 부풀고 프린트 준비가 지연되던 것을, 로컬 서브셋 맑은 고딕
     (@font-face — globals.css 의 Malgun Gothic Exam)으로 교체해 스풀 용량·로드 지연을 줄인다. */
  --font-ko: "Malgun Gothic Exam", "Malgun Gothic", "맑은 고딕", -apple-system, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif;
  color: var(--text, #1a2233);
  font-family: var(--font-ko);
  /* 압축 조판(compact-spec §2) — 기준 10pt/1.55 → 9pt/1.45 */
  font-size: calc(9pt * var(--par-fs, 1));
  line-height: 1.45;
}
.par-root * { box-sizing: border-box; }

/* ── A4 시트(페이지) ── */
.par-sheet {
  position: relative;
  width: 210mm; height: 297mm;
  background: var(--page, #fff);
  margin: 0 auto 9mm;
  /* compact-spec §2 — 좌우 13mm(본문 폭 184mm). .par-measure 폭·IMG_CONTENT_WIDTH_MM 와 동기. */
  padding: 10mm 13mm 8mm;
  display: flex; flex-direction: column;
  box-shadow: 0 8px 30px rgba(15,23,42,.14);
  overflow: hidden;
  /* 화면 편집용 확대/축소 — .par-sheet 에만 적용(측정용 .par-measure 는 영향 없음). 기본 1. */
  zoom: var(--par-zoom, 1);
}

/* ── 뷰포트 밖 페이지 렌더 스킵 (중앙 캔버스 전용) ────────────────────────────
   .par-sheet 는 width/height 가 210mm×297mm 로 **명시**돼 있어 size containment 가
   걸려도 박스 크기가 변하지 않는다 → 스크롤 점프도 재페이지네이션도 원리적으로 없다.
   (contain-intrinsic-size 는 크기가 콘텐츠에서 나올 때만 쓰이므로 여기서는 사실상
   무효인 안전핀이다. zoom(--par-zoom)·조상 transform:scale 과는 같은 배율로 함께
   스케일되므로 어긋날 여지도 없다.)

   선택자를 [data-page-index] 로 좁힌 것은 **둘 다 필수 조건**이다:
   1) 측정 프로브(.par-measure 안의 .par-sheet.par-measure-sheet[data-cref="sheet"])에는
      data-page-index 가 없다 → 절대 스킵되지 않는다. 이 프로브가 스킵되면 페이지 본문
      가용 높이 실측이 죽어 페이지 분할이 통째로 붕괴한다.
   2) 좌측 레일 썸네일의 .par-sheet 에도 data-page-index 가 없다 → 제외한다.
      썸네일은 IntersectionObserver 가상화(page-thumbnail-rail.tsx)가 이미 담당한다.

   :not(:has(.par-canvas)) — 필기 캔버스가 있는 페이지는 제외한다. 연결선 SVG 좌표를
   getBoundingClientRect + ResizeObserver 로 실측하는데(report-sections/sentence-canvas.tsx),
   RO 콜백은 비동기라 인쇄 레이아웃 전에 도착하지 못한다 → '화살표 없는 페이지'가
   인쇄될 수 있다. 이 제외는 성능이 아니라 인쇄 정합의 문제이므로 떼지 말 것. */
/* :not(.par-sheet-cover) — 전면 페이지(표지·원페이지 파이널)는 스킵하지 않는다.
   파이널 시트는 useLayoutEffect 로 자기 높이를 실측해 축소 사다리를 돌리는데,
   content-visibility 스킵 상태에서는 내부 레이아웃이 없어 측정이 0 이 된다
   (스크롤로 처음 드러날 때 맞춤이 안 된 상태로 노출). 전면 페이지는 문서당 1~2장이라
   렌더 스킵의 성능 이득도 사실상 없다. */
.par-sheet[data-page-index]:not(:has(.par-canvas)):not(.par-sheet-cover) {
  content-visibility: auto;
  contain-intrinsic-size: 210mm 297mm;
}
/* 벨트앤브레이스 — 화면 미디어 상태에서도 스킵을 즉시 해제하는 탈출구.
   beforeprint 에서 documentElement 에 .par-print-reveal 을 얹고 afterprint 에서 떼면,
   @media print 평가 시점이 늦는 드라이버에서도 인쇄 직전에 전 페이지가 레이아웃된다.
   (아래 @media print 하드 리셋이 1차 방어선이고 이것은 예비 경로다.) */
.par-print-reveal .par-sheet[data-page-index] {
  content-visibility: visible !important;
  contain-intrinsic-size: none !important;
}

.par-sheet-body {
  flex: 1; min-height: 0;
  /* 최후 방어선 — 조판 오차가 남아도 본문이 러닝 푸터를 '덮는' 일만은 없게 한다.
     .par-sheet-body 는 flex:1 + min-height:0 이라 높이가 남은 공간에 못박히는데
     overflow 가 visible 이면 초과분이 박스 밖으로 흘러 푸터 위에 그대로 그려진다.
     단 overflow:hidden 은 금지 — 본문 박스 '바깥'(left:-6.5mm / right:-6.5~-8mm)에
     절대배치된 편집 chrome(그립·삭제·리사이즈)이 통째로 잘린다. 세로만 clip 한다.
     (visible + clip 조합은 Chromium 에서 auto 로 강등되지 않음을 실측 확인.) */
  overflow-x: visible;
  overflow-y: clip;
}
/* 측정용 숨김 컨테이너 (본문 폭과 동일 — .par-sheet 좌우 패딩과 반드시 동기) */
.par-measure { position: absolute; visibility: hidden; pointer-events: none; left: -99999px; top: 0; width: 184mm; }
/* 페이지 본문 가용 높이 실측용 프로브 시트 — 실제 러닝헤더/푸터를 가진 빈 시트를
   .par-measure(184mm) 안에 '절대배치 210mm' 로 띄워 flow 폭·높이에 영향을 주지 않게 한다.
   zoom 은 반드시 죽인다 — 모바일 뷰의 --par-zoom(0.42~0.72)이 걸리면 측정값이 축소돼
   페이지 수가 폭발한다. */
.par-measure .par-sheet { zoom: 1 !important; }
.par-measure-sheet { position: absolute; left: 0; top: 0; width: 210mm; margin: 0; box-shadow: none; }

/* ── 러닝 헤더/푸터 ── */
.par-runhead {
  display: flex; justify-content: space-between; align-items: center; gap: 4mm;
  font-size: calc(7.2pt * var(--par-fs, 1)); letter-spacing: .02em;
  color: var(--ink); border-bottom: .45mm solid var(--rule);
  padding-bottom: 1.2mm; margin-bottom: 3mm; font-weight: 700; flex: 0 0 auto;
}
.par-runhead-brand { display: flex; align-items: center; gap: 2.2mm; min-width: 0; overflow: hidden; }
/* 26-07-22: 9mm 정사각 고정은 가로로 긴 로고를 레터박스로 축소시켰다 — 높이 기준
   비율 유지 + 폭 상한만 두어 로고가 박스에 밀착되게 한다. */
.par-runhead-logo { height: 7mm; width: auto; max-width: 22mm; object-fit: contain; flex: 0 0 auto; }
/* 헤더/푸터 높이를 결정론적으로 — 긴 브랜드명·titleKo·docNo 가 2줄로 늘어나면 그만큼
   본문 가용 높이가 줄어(각 4.1~4.4mm) 페이지 예산이 어긋난다. 1줄 + 말줄임으로 봉쇄한다.
   높이(height)는 고정하지 않는다 — 로고 유무에 따른 차이는 프로브 실측이 자동으로
   처리하므로 불필요하고, 고정하면 로고 없는 문서에서 페이지당 4.6mm 를 낭비한다. */
.par-runhead-brand > span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
.par-runhead .par-runhead-r {
  color: var(--text-muted); font-weight: 500;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  min-width: 0; flex: 0 1 auto; text-align: right;
}
.par-runfoot {
  display: flex; justify-content: space-between; align-items: center; gap: 4mm;
  font-size: calc(6.8pt * var(--par-fs, 1)); color: var(--text-muted);
  border-top: .35mm solid var(--tint-border);
  padding-top: 1.1mm; margin-top: 2.5mm; letter-spacing: .02em; flex: 0 0 auto;
}
.par-runfoot > span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
.par-runfoot .par-page { font-weight: 700; color: var(--ink); flex: 0 0 auto; }

/* ── 블록 간 간격 (RUN_GAP_MM=3.2 와 동기 — compact-spec §3) ── */
.par-block { margin-bottom: 3.2mm; font-size: calc(9pt * var(--par-fs, 1)); }
.par-block:last-child { margin-bottom: 0; }
/* flow run(병합된 표/박스/도식) 블록 간격 */
.par-runblock { margin-bottom: 3.2mm; }
.par-runblock:last-child { margin-bottom: 0; }
.par-runblock.par-map { font-size: calc(9pt * var(--par-fs, 1)); }
.par-reading-flow-run {
  display: flex;
  flex-direction: column;
  gap: 0;
  margin-bottom: 2.6mm;
}
.par-reading-flow-run .par-block {
  margin-bottom: 0;
}
/* 도식 항목 래퍼 — par-map 안에서 중앙정렬 유지 */
.par-mapitem { display: flex; flex-direction: column; align-items: center; width: 100%; }

/* 커스텀 블록 — 여백 / 자유 텍스트 (보기·인쇄 공통) */
.par-spacer-fill { width: 100%; }
.par-customtext { font-size: calc(9pt * var(--par-fs, 1)); }
.par-customtext-h { font-weight: 800; color: var(--ink); margin-bottom: 1.2mm; }
.par-customtext-b { white-space: pre-wrap; line-height: 1.5; }

/* ── 타이틀 블록 ── */
.par-title {
  background: var(--ink-fill, var(--ink)); color: var(--ink-on-fill, #fff); border-left: 1.8mm solid var(--gold);
  padding: 4.2mm 5.5mm; border-radius: 1.5mm; margin-bottom: 2.8mm;
}
.par-title .par-eyebrow {
  color: var(--gold-soft); font-size: calc(7.5pt * var(--par-fs, 1)); font-weight: 800;
  letter-spacing: .16em; margin-bottom: 1.2mm; white-space: pre-wrap;
}
.par-title .par-title-ko { font-size: calc(15.5pt * var(--par-fs, 1)); font-weight: 800; line-height: 1.16; margin: 0; white-space: pre-wrap; }
.par-title .par-title-en {
  font-family: var(--font-en); font-style: italic; font-size: calc(9.5pt * var(--par-fs, 1));
  color: var(--ink-on-fill-muted, #d7def0); margin-top: 1mm; white-space: pre-wrap;
}

/* ── 메타 테이블 ── */
.par-meta { width: 100%; border-collapse: collapse; margin-bottom: 2mm; font-size: calc(7.8pt * var(--par-fs, 1)); }
.par-meta th, .par-meta td { border: .3mm solid var(--tint-border); padding: 1.1mm 1.8mm; text-align: center; }
.par-meta th { background: var(--table-head-bg, var(--ink-fill, var(--ink))); color: var(--table-head-text, var(--ink-on-fill, #fff)); font-weight: 700; letter-spacing: .02em; }
.par-meta td { color: var(--text); }
.par-meta .par-meta-diff { color: var(--gold); font-weight: 800; }
.par-docnote { display: flex; justify-content: flex-end; gap: 3mm; font-size: calc(7pt * var(--par-fs, 1)); color: var(--text-muted); letter-spacing: .02em; }

/* ── 섹션 헤더 ── */
.par-sec-head {
  display: flex; align-items: center; gap: 2.2mm;
  background: var(--ink-fill, var(--ink)); color: var(--ink-on-fill, #fff); border-left: 1.8mm solid var(--gold);
  padding: 1.5mm 3mm; border-radius: 1mm; margin-bottom: 2.2mm;
}
.par-sec-head .par-sec-no { color: var(--gold-soft); font-weight: 800; font-size: calc(10pt * var(--par-fs, 1)); font-style: italic; }
.par-sec-head .par-sec-ko { font-weight: 800; font-size: calc(10pt * var(--par-fs, 1)); }
.par-sec-head .par-sec-en { font-family: var(--font-en); font-style: italic; font-size: calc(7.5pt * var(--par-fs, 1)); color: var(--ink-on-fill-muted, #c2cbe0); }
.par-cont-head { font-size: calc(7.8pt * var(--par-fs, 1)); font-weight: 700; color: var(--ink); margin-bottom: 1.6mm; }
.par-cont-head .par-cont-k { color: var(--gold); }
.par-note { font-size: calc(7.6pt * var(--par-fs, 1)); color: var(--text-muted); font-style: italic; margin: 0 0 2mm; }
.par-kw-legend { font-style: normal; }

/* ── 필기 분석(05) 색상 범례 ── */
.par-anno-legend {
  display: flex; flex-wrap: wrap; align-items: center; gap: 1.2mm 3mm;
  margin: 0 0 2mm; padding: 1.2mm 2.4mm;
  border: .25mm solid var(--tint-border); border-radius: 1.5mm; background: var(--tint);
  font-size: calc(7.6pt * var(--par-fs, 1));
}
.par-anno-legend-label { font-weight: 800; color: var(--text-muted); letter-spacing: .04em; }
.par-anno-legend-item {
  font-weight: 800; color: var(--anno-c);
  padding-bottom: .2mm; border-bottom: .5mm solid var(--anno-c);
}
/* (마커 감사 M1/M2) 범례 없는 글리프 안내 — 분할 문장의 '+' 이어짐 표식.
   물리 지문 등에서 수식 기호로 오독될 여지가 있어 은은한 안내 하나만 붙인다. */
.par-anno-legend-hint { color: var(--text-muted); font-weight: 600; }
.par-anno-legend-hint::before { content: "+"; font-weight: 900; margin-right: .8mm; color: #64748b; }

/* ── 박스(틴트) — 상하 크롬은 BOX_PAD_MM=6 과 동기(padding 2.6×2 + border .6 = 5.8 ≤ 6) ── */
.par-box { background: var(--tint); border: .3mm solid var(--tint-border); border-radius: 1.5mm; padding: 2.6mm 3.2mm; }
.par-box.par-accent { border-left: 1.5mm solid var(--gold); }

/* ── 영어 원문만 페이지(표지 다음) ── */
/* 줄 간격은 margin 이 아니라 padding 으로 — offsetHeight(여백 제외)에 포함돼 페이지 분할 추정이 정확해짐.
   :last-child 가 아니라 '런의 마지막 블록'만 패딩 제거(측정 클론 vs 편집 뷰 불일치로 넘치던 문제 해결, 깔끔한 원문과 동일 패턴). */
.par-eng-only { display: flex; gap: 2.4mm; padding: 0 0 2.6mm; align-items: baseline; break-inside: avoid; }
.par-reading-flow-run .par-block:last-child .par-eng-only { padding-bottom: 0; }
.par-eng-only-no { flex: 0 0 auto; color: var(--gold); font-weight: 800; font-size: calc(9.5pt * var(--par-fs, 1)); }
.par-eng-only-en { margin: 0; font-family: var(--font-en); font-size: calc(10.5pt * var(--par-fs, 1)); line-height: 1.6; color: var(--ink); }

/* ── 01 원문 (li 간격은 LI_GAP_MM=1.4 와 동기) ── */
.par-sentences { list-style: none; margin: 0; padding: 0; }
.par-sentences li { display: flex; gap: 2mm; margin-bottom: 1.4mm; }
.par-sentences li:last-child { margin-bottom: 0; }
.par-sno { flex: 0 0 auto; color: var(--gold); font-weight: 800; min-width: 4mm; }
.par-sen-en { margin: 0; font-size: calc(9pt * var(--par-fs, 1)); }
.par-sen-ko { margin: .4mm 0 0; color: var(--text-muted); font-size: calc(8pt * var(--par-fs, 1)); }
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
  color: #94a3b8;
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
  display: flex;
  align-items: baseline;
  justify-content: center;
  color: #0369a1;
  font-family: var(--font-ko);
  font-size: calc(9.5pt * var(--par-fs, 1));
  font-weight: 900;
}
.par-read-en {
  margin: 0;
  color: #061528;
  font-family: var(--font-en);
  font-size: calc(9.3pt * var(--par-fs, 1));
  font-weight: 760;
  line-height: 1.55;
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

/* 화살표 — 세로선 + 아래 삼각형 (ARROW_MM=5 와 동기) */
.par-arrow { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 5mm; }
.par-arrow .par-arrow-line { width: .7mm; height: 2.8mm; background: var(--ink); }
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
.par-summary ol { margin: 0; padding-left: 4.5mm; }
.par-summary li { margin-bottom: 1.1mm; font-size: calc(10pt * var(--par-fs, 1)); }
.par-thesis { background: var(--ink-fill, var(--ink)); color: var(--ink-on-fill, #fff); border-left: 1.8mm solid var(--gold); border-radius: 1.5mm; padding: 2.6mm 3.5mm; margin-top: 2.5mm; }
.par-thesis .par-thesis-eyebrow { color: var(--gold-soft); font-size: calc(7.2pt * var(--par-fs, 1)); font-weight: 800; letter-spacing: .14em; margin-bottom: .8mm; }
.par-thesis .par-thesis-en { font-family: var(--font-en); font-style: italic; font-size: calc(11pt * var(--par-fs, 1)); line-height: 1.32; }

/* ── 표 (04/05/06) ── */
/* table-layout: fixed 상시 — auto 였을 때는 열 폭이 '그 표에 든 셀 전부'로 정해져,
   전 행이 한 표에 들어가는 측정 클론과 그 페이지 몫 행만 든 실제 표의 열 폭이 서로 달랐다
   (= 측정 때 안 접히던 셀이 실제로 2줄이 되어 페이지가 넘침). thead 의 th 에 모든 보이는
   열의 퍼센트 폭이 항상 주어지므로(table.tsx resolveColumnWidths) fixed 로 결정론화한다. */
.par-table { width: 100%; table-layout: fixed; border-collapse: collapse; font-size: calc(8pt * var(--par-fs, 1)); }
.par-vocab-test-table { table-layout: fixed; }
/* 행(tr)에 --par-fs 가 실리므로 tr 기준으로 글자크기 → td 가 상속받아 행 단위 크기 조절이 먹는다 */
.par-table tbody tr { font-size: calc(8pt * var(--par-fs, 1)); }
/* fixed 레이아웃에서는 열이 콘텐츠에 맞춰 늘지 않으므로, 긴 영어 표제어/동의어가
   열을 넘치지 않게 어디서든 끊을 수 있게 한다.
   ⚠ 셀 패딩 변경 시 @media print 의 보정 패딩(compact-spec §6)도 함께 재계산할 것. */
.par-table th, .par-table td { border: .3mm solid var(--tint-border); padding: 1.3mm 1.8mm; text-align: left; vertical-align: top; overflow-wrap: anywhere; }
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
.par-cell-pron { text-align: center; color: var(--text-muted); font-size: calc(7.6pt * var(--par-fs, 1)); }
.par-cell-head { font-weight: 800; color: var(--ink); }
.par-cell-syn { font-style: italic; color: var(--text-muted); }
.par-cell-ant { font-style: italic; color: var(--text-muted); }
.par-vocab-grid-run .par-block { margin-bottom: 0; }
.par-vocab-test-grid-row {
  display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1.8mm;
  padding-bottom: 1.2mm; font-size: calc(8pt * var(--par-fs, 1));
}
.par-vocab-test-card {
  position: relative; min-width: 0; min-height: 18mm;
  border: .3mm solid var(--tint-border); background: #fff;
  padding: 1.6mm 2mm; break-inside: avoid;
}
.par-vocab-test-card-empty { border-style: dashed; background: transparent; opacity: .45; }
.par-vocab-test-card-head {
  display: flex; align-items: baseline; gap: 1.5mm;
  border-bottom: .3mm solid var(--tint-border);
  padding-bottom: 1.2mm; margin-bottom: 1.4mm;
}
.par-vocab-test-card-word { color: var(--ink); font-weight: 800; }
.par-vocab-test-card-pron {
  color: var(--text-muted); font-size: calc(7.4pt * var(--par-fs, 1));
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
  display: block; width: 100%; min-width: 24mm; height: 6.5mm;
  border-bottom: .45mm solid var(--ink); opacity: .72;
}
/* ── 단어장(학습용) 2열 컴팩트 카드 — 기본 레이아웃(compact-spec §5) ── */
.par-vocab-study-grid-row {
  display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 1.8mm;
  padding-bottom: 1mm; font-size: calc(8pt * var(--par-fs, 1));
}
.par-vocab-study-card {
  position: relative; min-width: 0;
  display: flex; align-items: flex-start; gap: 1.4mm;
  border: .3mm solid var(--tint-border); background: #fff;
  padding: 1.2mm 1.6mm 1.3mm; break-inside: avoid;
}
.par-vocab-study-card-empty { border-style: dashed; background: transparent; opacity: .45; }
.par-vocab-study-no {
  flex: 0 0 auto; min-width: 4mm; padding-top: .2mm;
  color: var(--gold); font-weight: 800;
  font-size: calc(6.8pt * var(--par-fs, 1)); letter-spacing: .02em;
}
.par-vocab-study-main { flex: 1 1 auto; min-width: 0; }
.par-vocab-study-head { display: flex; align-items: baseline; flex-wrap: wrap; gap: 0 1.4mm; }
.par-vocab-study-word { color: var(--ink); font-weight: 800; }
.par-vocab-study-pron { color: var(--text-muted); font-size: calc(7.2pt * var(--par-fs, 1)); }
.par-vocab-study-meaning { margin-top: .3mm; color: var(--text); line-height: 1.3; }
.par-vocab-study-rel {
  display: flex; flex-wrap: wrap; gap: .3mm 3mm;
  margin-top: .7mm; padding-top: .6mm;
  border-top: .25mm dashed var(--tint-border);
  font-size: calc(7.3pt * var(--par-fs, 1)); color: var(--text-muted); font-style: italic;
}
.par-vocab-study-rel-item { display: inline-flex; align-items: baseline; gap: 1.1mm; min-width: 0; }
.par-vocab-study-rel-k {
  flex: 0 0 auto; color: var(--gold); font-weight: 800; font-style: normal;
  font-size: calc(6.8pt * var(--par-fs, 1));
}

.par-vocab-test-head {
  display: flex; align-items: baseline; justify-content: space-between;
  border-top: .6mm solid var(--gold); border-bottom: .3mm solid var(--tint-border);
  padding: 1.3mm 0 1mm; margin-top: 1.6mm;
}
.par-vocab-test-k { font-weight: 800; color: var(--ink); font-size: calc(10pt * var(--par-fs, 1)); }
.par-vocab-test-mode { color: var(--gold); font-weight: 800; font-size: calc(7.8pt * var(--par-fs, 1)); letter-spacing: .04em; }
.par-vocab-test-empty {
  color: var(--text-muted); font-size: calc(9pt * var(--par-fs, 1));
  border: .3mm dashed var(--tint-border); border-radius: 1mm;
  padding: 3mm; text-align: center;
}
.par-vocab-answer-cell {
  vertical-align: middle; min-width: 26mm; padding: 1.1mm 1.6mm !important;
  background: #fff !important;
}
.par-table tbody tr:nth-child(even) .par-vocab-answer-cell { background: #fff !important; }
.par-vocab-answer-box {
  display: flex; align-items: flex-end; width: 100%; min-width: 20mm; height: 7mm;
  border: .3mm solid var(--tint-border); border-radius: 1mm; background: #fff;
  padding: 0 2mm 1mm;
  box-shadow: inset 0 0 0 .2mm rgba(15,23,42,.035);
}
.par-vocab-answer-line {
  display: block; width: 100%; height: 0;
  border-bottom: .45mm solid var(--ink); opacity: .72;
}
.par-ws-title {
  border-top: .7mm solid var(--ink);
  border-bottom: .35mm solid var(--gold);
  padding: 1.2mm 0 1mm;
  margin-bottom: .8mm;
}
.par-ws-title-k {
  color: var(--ink);
  font-size: calc(11pt * var(--par-fs, 1));
  font-weight: 900;
}
.par-ws-note {
  margin-top: .6mm;
  color: var(--text-muted);
  font-size: calc(8.2pt * var(--par-fs, 1));
}
/* 상하 크롬은 ACTIVITY_PAD_MM=5 와 동기(padding 2.2×2 + border .6 = 5.0) */
.par-ws-block {
  border: .3mm solid var(--tint-border);
  background: #fff;
  padding: 2.2mm;
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
/* 실전 학습지 조각 병합 박스(ws-list) — activity-run 과 동일 의미론.
   조각 간 간격은 margin 이 아닌 padding 으로 줘야 측정(offsetHeight)에 포함된다. */
.par-ws-run {
  display: flex;
  flex-direction: column;
  gap: 0;
  break-inside: auto;
}
.par-ws-run .par-block {
  margin-bottom: 0;
}
.par-ws-run .par-block + .par-block {
  padding-top: 1.4mm;
}
.par-ws-run .par-wrap-ws-list {
  break-inside: avoid;
}
/* 드릴 소단원 구분(어법 선택 ↔ 단어배열) — 옛 .par-ws-drill-set + .par-ws-drill-set 시각 승계 */
.par-ws-run-subsep {
  margin-top: 1.4mm;
  border-top: .3mm dashed var(--tint-border);
  padding-top: 2mm;
}
.par-activity-list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.par-activity-item-row {
  display: flex;
  gap: .5em;
  padding-bottom: 1.2mm;
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
  line-height: 1.6;
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
  line-height: 1.7;
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
  padding-top: 1.2mm;
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
  margin-bottom: 1.4mm;
  padding-bottom: .9mm;
  border-bottom: .35mm solid var(--tint-border);
}
.par-ws-minihead-k {
  color: var(--ink);
  font-size: calc(10pt * var(--par-fs, 1));
  font-weight: 900;
}
.par-ws-minihead-e {
  color: var(--gold);
  font-size: calc(7.6pt * var(--par-fs, 1));
  font-weight: 800;
  letter-spacing: 0;
}
.par-ws-logic,
.par-ws-distractors {
  width: 100%;
  border-collapse: collapse;
  font-size: calc(7.8pt * var(--par-fs, 1));
}
.par-ws-logic th,
.par-ws-logic td,
.par-ws-distractors td {
  border: .3mm solid var(--tint-border);
  padding: 1mm 1.4mm;
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
  gap: 1.2mm;
}
.par-ws-cloze,
.par-ws-practice {
  border-bottom: .25mm solid var(--tint-border);
  padding-bottom: 1.1mm;
}
.par-ws-cloze-en,
.par-ws-practice {
  font-family: var(--font-en);
  color: var(--ink);
  font-size: calc(9.2pt * var(--par-fs, 1));
  line-height: 1.45;
}
.par-ws-cloze-no {
  display: inline-block;
  min-width: 6mm;
  color: var(--gold);
  font-family: inherit;
  font-weight: 900;
}
.par-ws-cloze-ko {
  margin-top: .6mm;
  padding-left: 6mm;
  color: var(--text-muted);
  font-size: calc(8.2pt * var(--par-fs, 1));
  line-height: 1.45;
}
.par-ws-wordbank {
  margin-top: 1.6mm;
  border: .3mm dashed var(--gold-soft);
  background: var(--tint);
  padding: 1.6mm;
  font-size: calc(8.2pt * var(--par-fs, 1));
  line-height: 1.45;
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
  gap: 1.2mm;
}
.par-ws-drill-set + .par-ws-drill-set {
  margin-top: 2mm;
  padding-top: 1.4mm;
  border-top: .3mm dashed var(--tint-border);
}
.par-ws-drill-label {
  color: var(--gold);
  font-size: calc(8.4pt * var(--par-fs, 1));
  font-weight: 900;
}
.par-ws-grammar-choice,
.par-ws-wordorder {
  border: .3mm solid var(--tint-border);
  background: var(--tint);
  padding: 1.5mm 1.8mm;
  font-size: calc(8.6pt * var(--par-fs, 1));
  line-height: 1.42;
}
/* 어법 선택 [a / b] 괄호 강조 — 밑줄 */
.par-ws-choice-mark { text-decoration: underline; text-decoration-thickness: .3mm; text-underline-offset: 1.5px; font-weight: 800; }
/* 단어배열 영작 — 답안 작성 공간(필기 줄 간격은 손글씨 공간이라 6mm 유지) */
.par-ws-write-space { margin-top: 3.5mm; display: flex; flex-direction: column; gap: 6mm; }
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
  padding: 1.8mm 2.2mm;
}
.par-ws-topic-label {
  display: inline-flex;
  margin-bottom: .9mm;
  color: var(--gold);
  font-size: calc(7.6pt * var(--par-fs, 1));
  font-weight: 900;
}
.par-ws-topic-title {
  color: var(--ink);
  font-family: var(--font-en);
  font-size: calc(10pt * var(--par-fs, 1));
  font-weight: 900;
  line-height: 1.3;
}
.par-ws-topic-gist {
  margin-top: .8mm;
  color: var(--text);
  font-size: calc(8.6pt * var(--par-fs, 1));
  line-height: 1.45;
}
.par-ws-workbook-passage {
  white-space: pre-wrap;
  color: var(--ink);
  font-family: var(--font-en);
  font-size: calc(8.8pt * var(--par-fs, 1));
  line-height: 1.5;
}
.par-ws-key-table {
  width: 100%;
  margin-top: 1.8mm;
  border-collapse: collapse;
  font-size: calc(7.6pt * var(--par-fs, 1));
}
.par-ws-key-table td {
  border: .3mm solid var(--tint-border);
  padding: 1.1mm 1.4mm;
  vertical-align: top;
}
.par-ws-key-table td:first-child {
  width: 9mm;
  color: var(--gold);
  font-weight: 900;
  text-align: center;
}
.par-ws-key-table td:nth-child(2) {
  /* 고정 28mm 는 단어배열 정답(완전한 문장)을 13줄로 세로 낙하시켰다(R2 실측) —
     비율 폭으로 정답·해석 열 밀도를 맞춘다. */
  width: 42%;
  color: var(--ink);
  font-family: var(--font-en);
  font-weight: 800;
}
.par-qb-key-narrow td:nth-child(2) {
  /* E22 합본 문항 정답표 전용 수식자 — 위 42% 는 학습지 「단어배열 정답 = 완전한 문장」을
     위해 튜닝된 값이고 R2 실측 근거를 갖고 있어 그대로 둔다.
     문항 정답은 선지 라벨 1글자다(실측: 2학년 클래스 168문항 중 166건이 len=1,
     len>3 은 SUMMARY_WRITING 2건뿐 / _a22-verify-anslen.ts). 그 42% 를 그대로 쓰면
     676.8px 표에서 283.8px 를 한 글자가 먹고 해설이 5~9줄로 눌렸다(_a22-anskey.mjs 실측).
     조각(5행) 전체가 짧은 라벨일 때만 question-flow.tsx 가 이 클래스를 붙인다 —
     긴 문장 정답이 한 행이라도 섞이면 붙이지 않으므로 R2 세로낙하는 재현되지 않는다. */
  width: 14mm;
  text-align: center;
}
.par-ws-question {
  border: .3mm solid var(--tint-border);
  background: #fff;
  padding: 2.2mm;
  break-inside: avoid;
}
.par-ws-qtop {
  display: flex;
  align-items: center;
  gap: 1.6mm;
  margin-bottom: 1.1mm;
}
.par-ws-qno {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 7.5mm;
  height: 5mm;
  background: var(--ink);
  color: #fff;
  font-size: calc(7.4pt * var(--par-fs, 1));
  font-weight: 900;
}
.par-ws-qtype {
  color: var(--gold);
  font-size: calc(8.4pt * var(--par-fs, 1));
  font-weight: 900;
}
.par-ws-qprompt {
  color: var(--ink);
  font-size: calc(8.8pt * var(--par-fs, 1));
  font-weight: 800;
  line-height: 1.38;
}
.par-ws-qpassage {
  margin-top: 1.2mm;
  padding: 1.6mm;
  border-left: .8mm solid var(--gold);
  background: var(--tint);
  color: var(--text);
  font-family: var(--font-en);
  font-size: calc(8.4pt * var(--par-fs, 1));
  line-height: 1.48;
}
.par-ws-choices {
  margin: 1.4mm 0 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: .8mm;
}
.par-ws-choices li {
  display: grid;
  grid-template-columns: 6.5mm minmax(0, 1fr);
  gap: 1mm;
  color: var(--text);
  font-size: calc(8.6pt * var(--par-fs, 1));
  line-height: 1.42;
}
.par-ws-choice-label {
  color: var(--ink);
  font-weight: 900;
}
.par-ws-answer {
  margin-top: 1.5mm;
  border-top: .35mm solid var(--tint-border);
  padding-top: 1.2mm;
}
.par-ws-answer-main {
  display: flex;
  align-items: baseline;
  gap: 1.4mm;
  color: var(--ink);
  font-size: calc(8pt * var(--par-fs, 1));
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
  margin-top: .8mm;
  color: var(--text);
  font-size: calc(7.8pt * var(--par-fs, 1));
  line-height: 1.4;
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
.par-parse { margin-bottom: 2.4mm; }
.par-parse:last-child { margin-bottom: 0; }
.par-parse-en { font-family: var(--font-en); font-style: italic; font-size: calc(8.8pt * var(--par-fs, 1)); margin-bottom: 1.2mm; }
.par-parse-en .par-sno { font-style: normal; }
.par-parse-parts { list-style: none; margin: 0 0 1.2mm; padding: 0; }
.par-parse-parts li { padding-left: 3.5mm; position: relative; margin-bottom: .6mm; font-size: calc(8.4pt * var(--par-fs, 1)); }
.par-parse-parts li::before { content: "▸"; position: absolute; left: 0; color: var(--gold); }
.par-parse-parts .par-plabel { font-weight: 800; color: var(--ink); margin-right: 1.5mm; }
.par-parse-trans { font-size: calc(8.4pt * var(--par-fs, 1)); }
.par-parse-trans .par-tk { color: var(--gold); font-weight: 800; margin-right: 1.5mm; }

/* ── 08 학습 점검 ── */
.par-quiz { list-style: none; margin: 0; padding: 0; counter-reset: none; }
.par-quiz > li { margin-bottom: 2.2mm; padding-bottom: 1.6mm; border-bottom: .25mm dashed var(--tint-border); }
.par-quiz > li:last-child { margin-bottom: 0; padding-bottom: 0; border-bottom: 0; }
.par-q-head { display: flex; align-items: center; gap: 1.5mm; margin-bottom: .9mm; }
.par-quiz .par-q-no { font-weight: 800; color: var(--ink); font-size: calc(9pt * var(--par-fs, 1)); }
.par-quiz .par-q-type { font-size: calc(6.6pt * var(--par-fs, 1)); font-weight: 700; color: #fff; background: var(--gold); padding: .4mm 1.6mm; border-radius: 1mm; letter-spacing: .02em; }
.par-quiz .par-q-prompt { line-height: 1.5; }
.par-blank { display: inline-block; min-width: 14mm; border-bottom: .4mm solid var(--ink); margin: 0 .5mm; vertical-align: baseline; }
.par-quiz .par-q-choices { list-style: none; margin: 1.4mm 0 0; padding: 0; display: flex; flex-direction: column; gap: 1mm; font-size: calc(8.6pt * var(--par-fs, 1)); }
.par-quiz .par-q-choices li { display: flex; gap: 1.8mm; align-items: baseline; line-height: 1.4; }
.par-quiz .par-choice-mark { color: var(--gold); font-weight: 800; flex: 0 0 auto; }
.par-answers { background: var(--ink-fill, var(--ink)); color: var(--ink-on-fill, #fff); border-left: 1.8mm solid var(--gold); border-radius: 1.5mm; padding: 2.4mm 3.5mm; }
.par-answers .par-ans-eyebrow { color: var(--gold-soft); font-size: calc(7pt * var(--par-fs, 1)); font-weight: 800; letter-spacing: .14em; margin-bottom: 1.2mm; }
.par-answers .par-ans-row { font-size: calc(8.2pt * var(--par-fs, 1)); margin-bottom: .8mm; }
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
.par-clean-snt { padding: 0 0 1.5mm; break-inside: avoid; }
.par-reading-flow-run .par-block:last-child .par-clean-snt { padding-bottom: 0; }
.par-clean-line { display: grid; grid-template-columns: 5.5mm minmax(0, 1fr); gap: 1.5mm; align-items: baseline; }
.par-clean-line .par-read-en { margin: 0; }
.par-clean-no {
  display: flex; align-items: baseline; justify-content: center;
  font-family: var(--font-ko); font-size: calc(9.5pt * var(--par-fs, 1)); font-weight: 900;
  color: #0369a1;
}
.par-clean-ko-row { display: grid; grid-template-columns: 5.5mm minmax(0, 1fr); gap: 1.5mm; margin-top: .4mm; align-items: baseline; }
.par-clean-ko-mark { color: #94a3b8; text-align: center; font-size: calc(7.4pt * var(--par-fs, 1)); }
.par-clean-ko { margin: 0; color: var(--text-muted); font-size: calc(8.1pt * var(--par-fs, 1)); line-height: 1.42; }

.par-canvas {
  position: relative;
  display: block;
  break-inside: avoid;
  padding: 0 0 2mm;
}
.par-reading-flow-run .par-block:last-child .par-canvas { padding-bottom: 0; }
.par-canvas-grid { display: grid; grid-template-columns: minmax(0, 1fr); align-items: start; }
.par-canvas-grid.has-rail {
  grid-template-columns: minmax(0, 1fr) 42mm;
  column-gap: 3mm;
}
/* 본문(스태프·어법 목록·해석)은 1열 고정 행, 레일은 2열에서 전 행 스팬 —
   블록 총높이 = max(본문 열 합, 레일 합). 레일이 길어도 본문 열에 빈 사각형이 남지 않는다.
   마지막 1fr 스페이서 행이 레일 초과 높이를 전부 흡수한다 — auto 행 사이에 분배되면
   en 행과 해석 사이가 벌어진다(R2 실측: 최대 70mm). 초과분은 블록 하단으로만 몬다. */
.par-canvas-grid { grid-template-rows: auto auto auto 1fr; }
.par-canvas-grid .par-canvas-staff { grid-column: 1; grid-row: 1; }
.par-canvas-grid .par-canvas-list { grid-column: 1; grid-row: 2; }
.par-canvas-grid .par-canvas-trans { grid-column: 1; grid-row: 3; }
.par-canvas-grid.has-rail .par-canvas-rail { grid-column: 2; grid-row: 1 / -1; }

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
  width: 4.8mm; height: 4.8mm; margin-right: 1.4mm;
  color: #0369a1;
  font-family: var(--font-ko);
  font-size: calc(9.5pt * var(--par-fs, 1)); font-weight: 900;
  align-self: flex-start; margin-top: .3mm;
}
.par-canvas-no.is-cont { color: #94a3b8; }
.par-canvas-chunk { display: flex; flex-direction: column; min-width: 0; max-width: 100%; }
/* 끊어읽기 구분선 — 청크 사이 '/' */
.par-canvas-sep {
  align-self: flex-start; flex: 0 0 auto;
  margin: 0 1mm; color: #94a3b8;
  font-family: var(--font-en); font-size: calc(9.8pt * var(--par-fs, 1));
  font-weight: 400; line-height: 1.5;
}
/* 필기가 달린 청크는 줄사이 노트가 들어갈 가로 여유를 준다 */
.par-canvas-chunk.is-noted { min-width: 31mm; flex: 0 1 auto; }
.par-canvas-en {
  font-family: var(--font-en);
  font-size: calc(9.8pt * var(--par-fs, 1));
  font-weight: 760; line-height: 1.5; color: #061528;
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
.par-canvas-notes { display: flex; flex-direction: column; gap: .6mm; margin-top: .6mm; min-width: 0; }
.par-canvas-note {
  font-family: var(--font-ko);
  font-size: calc(7.9pt * var(--par-fs, 1)); line-height: 1.26;
  color: var(--text); overflow-wrap: anywhere; word-break: break-word;
  border-left: .6mm solid var(--anno-c, #2563a8); padding-left: 1.2mm;
}
.par-canvas-note-role { display: block; color: var(--anno-c, #2563a8); font-weight: 900; font-size: calc(7.5pt * var(--par-fs, 1)); }
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
/* R4(26-08-22) 압축 — 레일이 본문보다 길면 문장 사이 백지 띠가 되므로(블록 높이 = max)
   카드 자체를 조밀하게: 패딩·gap 축소 + 인용 1줄 클램프 + 역할·본문 인라인 흐름.
   초과 카드의 목록 강등은 passage-canvas-model balanceV3Rail(R4-a)이 담당. */
.par-canvas-rail { display: flex; flex-direction: column; gap: 1mm; min-width: 0; }
.par-rail-card {
  position: relative; box-sizing: border-box;
  border: .25mm solid #c9ddf5; border-left: 1mm solid var(--anno-c, #2563a8);
  border-radius: 1mm; background: #fff;
  padding: .8mm 1.1mm;
  font-family: var(--font-ko);
  font-size: calc(8pt * var(--par-fs, 1)); line-height: 1.28; color: var(--text);
  overflow-wrap: anywhere; break-inside: avoid;
}
.par-rail-card.is-exam { border-color: #f3c9ce; }
.par-rail-card.is-logic { border-color: #e0d28a; background: #fffdf3; }
.par-rail-card.is-parsing { border-color: #aef0d2; background: #f8fffb; }
/* 카드가 가리키는 본문 영어 구절 — 검정 본문의 어디서 왔는지 표시.
   R4: 1줄 클램프(말줄임) — 인용은 식별용이라 전체가 필요 없고, 연결선이 근거 청크를 이미 가리킨다. */
.par-rail-card-src {
  display: block; font-family: var(--font-en); font-style: italic; font-weight: 700;
  color: var(--anno-c, #2563a8); font-size: calc(7.7pt * var(--par-fs, 1)); line-height: 1.3;
  margin-bottom: .5mm; padding-bottom: .4mm; border-bottom: .2mm dotted var(--anno-c, #2563a8);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
/* (마커 감사 M3) 인용부호 제거 — 닫는 ❞ 는 클램프에 잘려 항상 짝이 깨졌고, 이탤릭+점선
   밑줄+색이 이미 "원문 인용"을 3중으로 신호한다. 부호 없이 서체·밑줄만으로 표기. */
.par-canvas-fn-src { font-family: var(--font-en); font-style: italic; font-weight: 700; color: var(--anno-c, #475569); }
/* R4: 역할 라벨·본문 줄을 인라인 흐름으로 — 카드당 세로 1줄 이상 절약(밀도 = 백지 띠 방지) */
.par-rail-card-role { display: inline; color: var(--anno-c, #2563a8); font-weight: 900; font-size: calc(8pt * var(--par-fs, 1)); margin-right: .5mm; }
/* 역할 라벨 뒤 구분점 — 인라인화로 "주제문장 1…" 처럼 본문과 붙어 읽히는 것 방지(검수 V2).
   흑백 인쇄에서도 색 없이 경계가 보인다. */
.par-rail-card-role::after { content: " ·"; font-weight: 400; opacity: .55; }
.par-rail-card-anchor { display: block; color: #0369a1; font-family: var(--font-en); font-weight: 700; font-size: calc(7.8pt * var(--par-fs, 1)); }
.par-rail-card-line { display: inline; }
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
  margin-top: 1.2mm; padding-top: .9mm;
  border-top: .25mm solid var(--tint-border);
  display: grid; grid-template-columns: 5mm minmax(0, 1fr); gap: 1.3mm; align-items: baseline;
}
.par-canvas-trans-no { color: #0ea5e9; font-weight: 900; font-size: calc(7.8pt * var(--par-fs, 1)); }
.par-canvas-trans-ko { margin: 0; color: var(--text); font-size: calc(8.6pt * var(--par-fs, 1)); line-height: 1.45; }

/* ── 각주 (공간 부족 시 강등된 필기 — 빽빽하게 줄바꿈) ── */
.par-canvas-footnotes {
  margin-top: 1mm; padding-top: .8mm;
  border-top: .25mm dashed var(--tint-border);
  display: flex; flex-wrap: wrap; gap: .5mm 2.6mm;
  font-family: var(--font-ko);
  font-size: calc(7.6pt * var(--par-fs, 1)); line-height: 1.35; color: var(--text-muted);
}
.par-canvas-fn { min-width: 0; max-width: 100%; }
.par-canvas-fn::before { content: "▸ "; color: var(--gold); font-weight: 800; }
.par-canvas-fn-role { color: var(--anno-c, #475569); font-weight: 800; }
.par-canvas-fn-trap { color: #b42318; font-weight: 700; }

/* ══ 필기 분석 v3 — 직독직해 뜻(위) + 영어 + 짧은 역할(아래) / 어법·구문은 아래 목록 + 번호·화살표 ══ */
/* 왼쪽에 비어 있는 연결선 통로(거터) 확보 — 화살표 세로줄이 본문/뱃지를 침범하지 않게 */
.par-canvas-v3 { padding-left: 5mm; }
/* baseline 정렬 — 모든 스태프 아이템(청크·구분자·번호 열)이 '뜻 줄'을 첫 줄로 갖도록
   렌더러가 공백 패드를 보장하므로, baseline 정렬이 곧 en 텍스트의 공통 기준선이 된다.
   (구 flex-end 는 role 유무에 따라 en 이 계단형으로 어긋났다.) */
.par-canvas-v3 .par-canvas-staff { align-items: baseline; row-gap: 2.2mm; column-gap: 0; }
/* 편집 모드 전용 번호 열 + 행잉 인덴트 — 이어지는 줄이 번호 아래가 아니라 텍스트 시작선에 맞는다. */
.par-canvas-col { display: inline-flex; flex-direction: column; align-items: flex-start; }
.par-canvas-staff.has-no-item { padding-left: 6.2mm; }
.par-canvas-staff.has-no-item .par-canvas-col { margin-left: -6.2mm; }
/* 비편집 모드 — 번호가 첫 청크 en 줄 안 인라인 박스로 들어간다. */
.par-canvas-en .par-canvas-no { margin-top: 0; margin-right: 1.4mm; vertical-align: baseline; }
/* 직독직해 한글 뜻 — 영어 위. z-index+흰 배경 = 연결선이 뜻 글자를 관통하지 않게(선이 뒤로 지나감). */
.par-canvas-v3 .par-canvas-gloss {
  display: block; font-size: calc(6.9pt * var(--par-fs, 1)); color: #6a7b8e; line-height: 1.14;
  margin-bottom: .4mm; white-space: nowrap;
  position: relative; z-index: 3; background: #fff; align-self: flex-start;
}
/* (R4-d, 26-08-22) 뜻 줄 번호 원(par-canvas-lk) 제거 — 밑줄+연결 화살표+목록 인용의
   3중 표기였고 문장 번호 ①②와 혼동됐다(유저 확정). 앵커 표시는 아래 is-anchored 밑줄이 담당. */
/* 모든 청크 영어에 동일한 밑줄 자리(투명) 확보 → 밑줄 유무로 글자가 밀리지 않음 */
.par-canvas-v3 .par-canvas-en { padding-bottom: .2mm; border-bottom: .45mm solid transparent; text-decoration: none; }
.par-canvas-v3 .par-canvas-chunk.is-anchored .par-canvas-en { text-decoration: none; border-bottom-color: var(--anno-c, #94a3b8); }
/* 필기 캔버스에서는 핵심 어휘 '굵은 밑줄'(par-kw)을 표시하지 않는다 — 청크 밑줄과 겹쳐 지저분해지므로. (clean 모드 등 다른 뷰의 par-kw 밑줄은 유지) */
.par-canvas-v3 .par-kw { text-decoration: none; }
/* 짧은 구문 역할 — 영어 아래(중립 슬레이트) */
.par-canvas-v3 .par-canvas-role {
  align-self: stretch; margin-top: .5mm; padding-top: .4mm; border-top: .3mm solid #cdd6e0;
  color: #5b7088; font-weight: 700; font-size: calc(6.3pt * var(--par-fs, 1)); line-height: 1.12;
  overflow-wrap: anywhere;
}
.par-canvas-v3 .par-canvas-sep {
  display: inline-flex; flex-direction: column; align-items: center;
  align-self: auto; flex: 0 0 auto; margin: 0 1.1mm; color: #c2ccd8;
  font-family: var(--font-en); font-size: calc(9.8pt * var(--par-fs, 1)); font-weight: 400; padding-bottom: 0;
}
/* 구분자도 공백 패드(뜻 줄)를 가져 baseline 이 en 줄에 맞는다 — 슬래시가 위로 뜨지 않음. */
.par-canvas-sep .par-canvas-sep-ch { line-height: 1.5; }

/* 어법·구문 목록 (문장 아래) */
.par-canvas-list { margin-top: 1.6mm; display: flex; flex-direction: column; gap: .9mm; }
.par-list-note { position: relative; padding-left: 4.8mm; font-size: calc(7.8pt * var(--par-fs, 1)); line-height: 1.36; color: #26323f; }
.par-list-badge {
  position: absolute; left: 0; top: .4mm; display: inline-flex; align-items: center; justify-content: center;
  /* (마커 감사 M1/M3) 원형 → 모서리 둥근 사각 태그 — 문장 번호 원(①·par-canvas-no)과
     같은 "원+숫자" 계열이라 새 문장 번호로 오독되던 혼동을 형태로 분리. */
  width: 3.2mm; height: 3.2mm; border-radius: .7mm; background: var(--anno-c, #2563a8); color: #fff;
  font-weight: 800; font-size: calc(5.6pt * var(--par-fs, 1));
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

/* ── 한글 줄바꿈 정책 — 어절 중간 분리 금지(compact R1 검수 반영) ──
   keep-all 로 어절 단위 개행을 강제하되, overflow-wrap 으로 좁은 컨테이너의
   비상 탈출(칸 넘침 방지)은 유지한다. 영어 본문(par-canvas-en 등)은 무접촉. */
.par-summary li, .par-sen-ko, .par-clean-ko, .par-canvas-trans-ko, .par-canvas-note,
.par-list-note, .par-rail-card, .par-ws-cloze-ko, .par-activity-ko, .par-trans-ko,
.par-customtext-b, .par-canvas-gloss, .par-ws-expl, .par-ws-topic-gist {
  word-break: keep-all; overflow-wrap: break-word;
}

/* 카드 그리드(단어장) 페이지 이월 표식 — 이어지는 페이지 상단에 조용한 연속 머리.
   높이 예산은 packFlow 의 CONT_HEAD_MM 과 동기. */
.par-cont-head-cont { margin-bottom: 1.6mm; color: var(--text-muted); font-size: calc(7.4pt * var(--par-fs, 1)); font-weight: 700; letter-spacing: .02em; }
.par-cont-head-cont .par-cont-k { color: var(--gold); margin-right: 1.2mm; }

/* ── 원페이지 파이널 학습지 (fon-) — 전면 시트(wrap:"cover") 전용 ──
   스펙: .tmp-final-qa/final-onepage-spec.md §5. 손글씨 = 그리운 규원체(로컬 폰트).
   모든 글자 크기는 --fon-fs(축소 사다리 변수)를 곱한다 — 1페이지 하드 보장의 절반. */
@font-face {
  font-family: "Griun Gyuwon";
  src: url("/fonts/webtoon/griun-gyuwon.ttf") format("truetype");
  font-weight: 400;
  font-style: normal;
  font-display: swap;
}
.fon-root {
  /* ⚠ flex:1 금지 — 부모(.par-cover-shell) 체인의 min-height:auto 가 콘텐츠만큼 자라
     clientHeight 가 '가용 높이'가 아닌 '콘텐츠 높이'를 돌려줘 축소 사다리가 넘침을
     오판한다(장문 함정표 절단 실측). 시트 패딩이 0(par-sheet-cover)이므로 297mm 고정. */
  flex: 0 0 auto; width: 100%; min-width: 0;
  height: 297mm;
  padding: 8mm 10mm 7mm;
  background: #fff; color: #14202e;
  overflow: hidden;
  font-family: var(--font-ko);
}
/* 가용 높이 = root 안쪽(패딩 제외) — clientHeight 는 패딩 포함이라 별도 내벽으로 잰다. */
.fon-avail { height: 100%; overflow: hidden; }
.fon-body { width: 100%; }
.fon-hand { font-family: "Griun Gyuwon", var(--font-ko); }

/* 헤더 밴드 */
.fon-head { border: .5mm solid #14202e; border-radius: 1.2mm; padding: 1.8mm 3mm 2mm; margin-bottom: 2.6mm; }
.fon-head-top { display: flex; align-items: center; gap: 2.5mm; font-size: calc(7.4pt * var(--fon-fs, 1)); }
.fon-brand { font-weight: 800; letter-spacing: .08em; color: #1d4ed8; }
.fon-head-badges { margin-left: auto; display: inline-flex; align-items: center; gap: 2mm; }
.fon-badge-types { font-weight: 800; color: #b91c1c; background: #fef2f2; border: .3mm solid #fecaca; border-radius: .8mm; padding: 0 1.4mm; }
.fon-badge-stars { color: #d97706; letter-spacing: .04em; }
.fon-stamp {
  display: inline-flex; flex-direction: column; align-items: center; line-height: 1.05;
  font-size: calc(5.6pt * var(--fon-fs, 1)); font-weight: 900; letter-spacing: .14em;
  color: #b91c1c; border: .5mm solid #b91c1c; border-radius: .8mm; padding: .8mm 1.6mm;
  transform: rotate(-3deg);
}
.fon-stamp b { font-size: calc(7.2pt * var(--fon-fs, 1)); letter-spacing: .06em; }
.fon-head-title-row { margin-top: .8mm; }
.fon-title { font-size: calc(12.5pt * var(--fon-fs, 1)); font-weight: 800; line-height: 1.2; margin: 0; }
.fon-head-row { display: flex; align-items: baseline; gap: 2mm; margin-top: .8mm; font-size: calc(8.4pt * var(--fon-fs, 1)); }
.fon-topic-k { flex: 0 0 auto; font-weight: 900; font-size: calc(7pt * var(--fon-fs, 1)); color: #fff; background: #14202e; border-radius: .8mm; padding: .2mm 1.6mm; }
.fon-topic { font-weight: 600; }
.fon-oneliner {
  margin-top: 1.4mm; padding-top: 1.2mm; border-top: .3mm dashed #cbd5e1;
  font-size: calc(9pt * var(--fon-fs, 1)); line-height: 1.4;
}
.fon-oneliner-k { font-weight: 900; font-size: calc(6.8pt * var(--fon-fs, 1)); color: #b91c1c; border: .3mm solid #b91c1c; border-radius: .8mm; padding: .1mm 1.4mm; margin-right: 1.8mm; vertical-align: .3mm; }
.fon-oneliner .fon-hand { color: #b91c1c; font-size: calc(10pt * var(--fon-fs, 1)); }

/* 본문 문장 흐름 — 라벨(마크 위 손글씨)이 앉을 줄사이 여유 확보 */
.fon-sentences { margin-bottom: 2.2mm; }
.fon-snt-group { margin-bottom: calc(1.1mm * var(--fon-fs, 1)); }
.fon-snt {
  margin: 0;
  font-family: var(--font-en, Georgia, "Times New Roman", serif);
  font-size: calc(9.6pt * var(--fon-fs, 1));
  line-height: 2.02; /* 마크 라벨 자리 */
  word-break: break-word;
}
.fon-sno { font-weight: 800; margin-right: 1.2mm; color: #334155; font-family: var(--font-ko); font-size: calc(8.6pt * var(--fon-fs, 1)); }

/* 마크 — 색 의미론: red 어법·함정 / blue 구조·순서 / pink 빈칸·핵심 / purple 서술형 / green 어휘·지칭 */
.fon-mk { position: relative; }
.fon-c-red    { --mkc: #dc2626; --mkbg: rgba(252,165,165,.35); }
.fon-c-blue   { --mkc: #2563eb; --mkbg: rgba(147,197,253,.35); }
.fon-c-pink   { --mkc: #db2777; --mkbg: rgba(249,168,212,.4); }
.fon-c-purple { --mkc: #7c3aed; --mkbg: rgba(196,181,253,.4); }
.fon-c-green  { --mkc: #059669; --mkbg: rgba(110,231,183,.35); }
.fon-mk-underline { border-bottom: calc(.5mm * var(--fon-fs, 1)) solid var(--mkc); }
.fon-mk-wavy { text-decoration: underline wavy var(--mkc); text-decoration-thickness: calc(.35mm * var(--fon-fs, 1)); text-underline-offset: .5mm; }
.fon-mk-circle { border: calc(.4mm * var(--fon-fs, 1)) solid var(--mkc); border-radius: 45% / 95%; padding: 0 .9mm; }
.fon-mk-box { border: calc(.4mm * var(--fon-fs, 1)) solid var(--mkc); border-radius: .6mm; padding: 0 .8mm; background: color-mix(in srgb, var(--mkbg) 40%, transparent); }
.fon-mk-highlight { background: linear-gradient(transparent 34%, var(--mkbg) 34%); }
.fon-mklabel {
  position: absolute; left: 50%; top: calc(-.62em); transform: translateX(-50%);
  white-space: nowrap; line-height: 1;
  font-size: calc(6.6pt * var(--fon-fs, 1)); font-weight: 700; color: var(--mkc);
  font-family: "Griun Gyuwon", var(--font-ko);
  pointer-events: auto;
  /* 밑줄·이웃 텍스트 위로 지나갈 때 글자가 섞이지 않게 은은한 종이 칩. */
  background: rgba(255,255,255,.85);
  padding: 0 .5mm;
  border-radius: .5mm;
}
/* 인접 앵커 라벨 2단 배치 — 1단(-.62em)과 가로 충돌하는 라벨을 반 줄 위로 올린다.
   줄높이 2.02em 의 줄사이 여백 안에 앉으므로 윗줄 본문과는 칩 배경으로 분리된다. */
.fon-mklabel-t2 { top: calc(-1.38em); z-index: 1; }

/* 문장 태그(유형 대비 박스) — 문장 뒤 인라인 */
.fon-tag {
  display: inline-flex; align-items: baseline; gap: 1.2mm; vertical-align: .2mm;
  margin-left: 1.6mm; padding: .2mm 1.6mm;
  border: .35mm solid var(--mkc, #dc2626); border-radius: .8mm;
  background: color-mix(in srgb, var(--mkbg, rgba(252,165,165,.3)) 30%, #fff);
  font-family: var(--font-ko); font-size: calc(7.2pt * var(--fon-fs, 1)); line-height: 1.35;
  color: #1f2937;
}
.fon-tag > b { flex: 0 0 auto; color: var(--mkc, #dc2626); font-weight: 900; font-size: calc(6.8pt * var(--fon-fs, 1)); }

/* 문장 아래 손필기 · 전개 해설 */
.fon-note { margin: -0.6mm 0 .4mm 5mm; font-size: calc(8.6pt * var(--fon-fs, 1)); line-height: 1.35; color: #1d4ed8; }
.fon-note-arrow { margin-right: 1.2mm; color: #93c5fd; }
.fon-flownote {
  margin: .8mm 0 1mm; padding: .8mm 2mm;
  border-left: .8mm solid #2563eb; background: #eff6ff; border-radius: 0 .8mm .8mm 0;
  font-size: calc(8.4pt * var(--fon-fs, 1)); line-height: 1.4; color: #1e3a8a;
}
.fon-flownote-k { font-weight: 900; font-size: calc(6.8pt * var(--fon-fs, 1)); color: #fff; background: #2563eb; border-radius: .8mm; padding: .1mm 1.4mm; margin-right: 1.8mm; }

/* 함정 총정리 */
.fon-traps { margin-bottom: 1.8mm; }
.fon-sec-k {
  font-weight: 900; font-size: calc(7.6pt * var(--fon-fs, 1)); letter-spacing: .06em;
  color: #b91c1c; margin-bottom: .8mm;
}
/* (마커 감사 M3) ⚑ → ⚠ — 문서 전체의 "함정 = ⚠" 관례와 통일(⚑는 범례 없는 유일 깃발이었다) */
.fon-sec-k::before { content: "⚠ "; }
.fon-trap-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
.fon-trap-table td {
  border: .3mm solid #e2e8f0; padding: .7mm 1.6mm;
  font-size: calc(7.6pt * var(--fon-fs, 1)); line-height: 1.35; vertical-align: top;
  word-break: break-word;
}
.fon-trap-type { width: 16mm; font-weight: 900; color: #b91c1c; background: #fef2f2; text-align: center; }
.fon-trap-point { width: 34%; font-weight: 600; }
.fon-trap-warn { color: #dc2626; font-weight: 900; margin-right: 1mm; }

/* 각주 어휘 */
.fon-footnotes {
  display: flex; flex-wrap: wrap; column-gap: 4mm; row-gap: .4mm;
  padding-top: 1mm; border-top: .3mm solid #e2e8f0; margin-bottom: 1.4mm;
  font-size: calc(7.4pt * var(--fon-fs, 1)); line-height: 1.4;
}
.fon-fnitem { display: inline-flex; gap: 1mm; align-items: baseline; }
.fon-fnstar { color: #b91c1c; font-weight: 800; }
.fon-fnterm { font-weight: 800; font-family: var(--font-en, Georgia, serif); }

/* 전문 해석 */
.fon-kofull {
  padding: 1.2mm 0 0; border-top: .4mm solid #14202e;
  font-size: calc(7.3pt * var(--fon-fs, 1)); line-height: 1.5; color: #334155;
  margin-bottom: 1.4mm;
}
.fon-kofull-k { font-weight: 900; font-size: calc(6.8pt * var(--fon-fs, 1)); color: #fff; background: #64748b; border-radius: .8mm; padding: .1mm 1.6mm; margin-right: 1.8mm; }

/* 파이널 팁 */
.fon-tip {
  display: flex; align-items: baseline; gap: 1.8mm;
  border: .4mm dashed #b91c1c; border-radius: 1mm; background: #fff7f7;
  padding: 1.2mm 2.4mm;
  font-size: calc(9.4pt * var(--fon-fs, 1)); line-height: 1.4; color: #b91c1c; font-weight: 700;
}
.fon-tip-k { flex: 0 0 auto; font-size: calc(10pt * var(--fon-fs, 1)); }

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
  /* 인쇄 제외 루트(목록 카드 미리보기·좌측 레일 썸네일 등) — 본 리포트 선택자들이
     :not(.par-print-exclude)로 걸러도 이 루트들이 '자리'를 차지하면 빈 페이지를 만들므로
     흐름에서 완전히 제거한다. 다중 par-root 인쇄 붕괴(백지 미리보기)의 재발 방지 계약:
     새 미리보기 호스트는 반드시 ReportPages printExclude 를 켠다. */
  .par-print-exclude { display: none !important; }
  /* 편집 전용 UI(열 너비 핸들·그립·삭제 버튼 등)는 인쇄에서 제외. */
  .par-edit-chrome { display: none !important; }
  /* 웹 전용 편집 컨트롤(.no-print) — 학습 활동 툴바(새 빈칸/빈칸 밀도/정답 보기/삭제) 등은
     .par-root 안에서 렌더되어 아래 visibility:visible 규칙에 의해 다시 보이게 되므로,
     display:none 으로 완전히 제거한다(visibility 와 별개 속성이라 재노출을 확실히 무력화). */
  /* ★ 스코프 이유는 바로 아래 body * 규칙의 ★ 문단과 동일하다
     (인쇄 대상 루트가 0개면 남의 인쇄 주체를 죽이면 안 된다).
     시험지 인쇄의 .no-print 은 exams/paper-builder/components/print-styles.tsx:82-86 가
     따로 갖고 있으므로 이 스코프로 손실되는 은폐는 0 이다.
     특이도는 :where() 로 0 으로 눌러 종전 (0,1,0) 을 그대로 보존한다. */
  :where(body:has(.par-root:not(.par-cover-preview):not(.par-print-exclude))) .no-print,
  :where(body:has(.par-root:not(.par-cover-preview):not(.par-print-exclude))) .no-print * { display: none !important; }

  /* 화면 전체를 숨기고 실제 보고서(.par-root)만 인쇄.
     우측 패널 미리보기(.par-cover-preview)는 같은 .par-root 라도 제외한다.

     ★ 인쇄할 리포트가 실재할 때만 무장한다 (26-08-18 실측 결함 수정 · 스펙 §3.10.22 E22-3).
       이 스타일시트는 report-pages/pages.tsx:168 이 .par-root **안**에 인라인 주입하는데,
       style 태그는 display:none 서브트리 안에 있어도 **문서 전역에 그대로 적용**된다.
       그래서 학습지 조판이 숨김 마운트(.par-print-exclude)로만 남고
       **시험지 조판이 인쇄 주체**인 상태에서는 아래 화이트리스트가 0개를 매칭하는데도
       이 리셋만 살아남아 시험지 인쇄가 **전면 백지**가 됐다.
       실측(.tmp-worksheet-compose/_a22-blank.mjs): PDF 2페이지 p1/p2 chars=0,
       대조군(학습지 조판 미마운트) p1 chars=2235, console error 0 · 화면은 정상.
       수정 후 검증은 _a22-blank-fix.mjs (판정축 = 추출 문자 수, 페이지 수 아님).
     ★ 특이도 보존이 필수다 — 스코프를 :where() 로 감싸 (0,0,1) 을 유지한다.
       그냥 body:has(...) 로 쓰면 :has() 가 인자 특이도(0,3,0)를 상속받아 (0,3,1) 이 되고,
       아래 화이트리스트 .par-root:not(...):not(...) * (0,3,0) 를 **이겨** 보고서 자체가 백지가 된다. */
  body:where(:has(.par-root:not(.par-cover-preview):not(.par-print-exclude))) * { visibility: hidden !important; }
  .par-root:not(.par-cover-preview):not(.par-print-exclude),
  .par-root:not(.par-cover-preview):not(.par-print-exclude) * { visibility: visible !important; }

  /* 보고서 계보(조상 체인)를 제외한 모든 형제 요소(모달 헤더·우측 표지 패널·페이지 인디케이터·
     모달 뒤의 워크벤치 페이지·토스트 등)를 흐름에서 완전히 제거한다.
     visibility:hidden 은 숨겨도 '자리'는 차지하므로, 보고서(예: 7쪽)보다 긴 숨김 요소들이
     그 길이만큼 8·9·10페이지 같은 빈 페이지를 만들던 문제를 해결한다. */
  :has(.par-root:not(.par-cover-preview):not(.par-print-exclude))
    > *:not(:has(.par-root:not(.par-cover-preview):not(.par-print-exclude))):not(.par-root:not(.par-cover-preview):not(.par-print-exclude)) {
    display: none !important;
  }

  /* 보고서를 감싼 모든 조상(모달·스크롤러·앱 셸)의 박스를 통째로 제거(display: contents) —
     루트가 사실상 body 직속 박스가 된다.
     구 방식(overflow visible + position static + height auto)은 화면의 print 에뮬레이션에선
     멀쩡해 보였지만, 크로미엄 '실제 인쇄' 페인트가 깊은 0-높이 조상 체인 아래의 절대배치
     콘텐츠를 그리지 않아 미리보기가 백지 1장이 됐다(2026-08-11 실측 — 루트를 body 직속으로
     재부모화하는 실험으로 확정, display:contents 가 그 CSS 등가물).
     클리핑·포지션·높이 문제는 박스가 사라지므로 원천 소멸한다. */
  body:has(.par-root:not(.par-cover-preview):not(.par-print-exclude)) *:has(.par-root:not(.par-cover-preview):not(.par-print-exclude)) {
    display: contents !important;
  }

  .par-root:not(.par-cover-preview):not(.par-print-exclude) {
    position: absolute !important;
    left: 0; top: 0;
    width: 210mm;
    margin: 0 !important;
    padding: 0 !important;
    background: #fff !important;
  }
  .par-sheet { box-shadow: none !important; margin: 0 !important; break-after: page; zoom: 1 !important; }
  /* ⚠ 이 블록은 **JS 템플릿 리터럴 안**이다 — 주석에도 백틱(back-tick)을 쓰지 마라.
     문자열이 그 자리에서 끝나 파일 전체가 파싱 불능이 된다(26-08-18 실측 사고).
     ⚠ 「마지막 시트만 break-after 해제」는 **부모 기준**으로 써야 한다(§3.10.22 E22 선결 수정).
     구 규칙 .par-sheet:last-child 는 읽기전용에서만 의도대로 동작했다 — 편집·조판 모드는
     pages.tsx 가 시트를 div.par-sheet-wrap 로 한 겹 감싸므로 **모든 시트가
     자기 래퍼의 마지막 자식**이 되어 특이도 (0,2,0) 규칙이 전 시트에 매칭됐다.
     결과: 편집·조판 인쇄에서 **강제 페이지 분할이 통째로 무효**(26-08-18 실측: 12/12 시트의
     computed break-after 가 전부 auto). 지금까지 멀쩡해 보인 유일한 이유는 모든 시트가 정확히
     297mm 라 자연 흐름이 페이지 격자와 우연히 일치했기 때문이고 오차 여유는 0이었다 —
     시트 하나를 180mm 로 줄이자 뒤따르는 6페이지 푸터가 전부 333pt(117mm) 밀렸고
     **페이지 수는 12로 그대로**였다(= 페이지 수 지표로는 절대 못 잡는다).
     문항 블록이 합류하면 「297mm 정확히」 전제가 반드시 깨지므로 E22 의 선결 조건이다. */
  .par-root > .par-sheet:last-child,
  .par-sheet-wrap:last-child > .par-sheet {
    break-after: auto;
  }
  /* 위 규칙은 「시트 시작을 페이지 머리에 고정」할 뿐, 시트가 지면을 넘칠 때 잘리는 것은
     막지 못한다. 합본은 문서·문항이 섞여 높이 이질성이 커지므로 두 번째 방어선을 둔다. */
  .par-sheet { break-inside: avoid; }
  /* 인쇄에서는 무조건 전 페이지를 렌더한다 — content-visibility 스킵이 인쇄까지 남으면
     '높이만 297mm 인 백지'가 그대로 출력된다(치명).
     특이도 함정: !important 끼리는 특이도로 승부가 나므로 화면 규칙과 **완전히 동일한
     선택자**를 여기서 그대로 다시 쓴다(같은 특이도 + 나중 선언 = 승리). 앞의 두 선택자는
     혹시 모를 다른 경로까지 덮는 그물이다.
     contain-intrinsic-size 는 auto 단독이 문법상 무효라 none 으로 되돌린다. */
  .par-sheet,
  .par-sheet[data-page-index],
  .par-sheet[data-page-index]:not(:has(.par-canvas)) {
    content-visibility: visible !important;
    contain-intrinsic-size: none !important;
    contain: none !important;
  }
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
  /* 격자 방식이 collapse(셀 테두리 .3mm) → separate(칸 사이 간격 0.5mm)로 바뀌는 만큼
     셀 패딩을 깎아 인쇄 표의 총 높이·폭을 화면(=페이지 분할을 계산한 레이아웃)과 맞춘다.
     화면 1.3mm/1.8mm 기준 세로 −0.15mm, 가로 −0.3mm(기존 델타 유지 — compact-spec §6).
     이 보정이 없으면 화면이 멀쩡해도 PDF 에서 표가 푸터를 뚫는다. */
  .par-table th, .par-table td { border: 0 !important; background-clip: padding-box !important; padding: 1.15mm 1.5mm !important; }
  /* 단어 시험지 정답칸 — 화면 규칙(.par-vocab-answer-cell 1.1/1.6, 특이도 0,1,0)이 위 인쇄
     규칙(0,1,1)에 눌려 델타가 역전되던 것을 복원한다(세로 −0.15/가로 −0.3 유지). */
  .par-table td.par-vocab-answer-cell { padding: .95mm 1.3mm !important; }
  .par-table tbody tr td { background-color: #ffffff !important; }
  .par-table tbody tr:nth-child(even) td { background-color: #e2e8f0 !important; }
  .par-table thead th { background-color: var(--table-head-bg, var(--ink-fill, var(--ink))) !important; }
  /* 보고서 전체의 배경색/채움색을 강제 인쇄 — 브라우저 '배경 그래픽' 토글(기본 OFF)에 의존하지 않도록.
     이 규칙이 좁게(필기분석 요소만) 걸려 있어서, 제목 블록·구조도 박스·표 헤더/줄무늬·표지 등
     나머지 페이지의 배경색이 인쇄에서 사라져 미리보기와 달라 보이던 문제를 해결한다. */
  .par-root:not(.par-cover-preview):not(.par-print-exclude),
  .par-root:not(.par-cover-preview):not(.par-print-exclude) * {
    -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;
  }
}
`;
