import { Fragment, type ReactNode } from "react";
import type { AnalysisSection, ReadingAnalysisSection, ReadingMarkKind } from "@/lib/passage-report/analysis-report/schema";
import { Field } from "./editable-field";
import type { FlowItem, SectionEdit } from "./types";

/**
 * 직독직해 분석본(reading-analysis) 카드 조판 — 시각 정본 `.tmp-reading-qa/proto.html`
 * (감독이 레퍼런스 PDF 와 육안 대조 완료), 구조 정본 docs/reading-analysis-worksheet-spec.md §1·§4.
 *
 * 파이널 원페이지와 같은 「전면 문서」이지만 조판 방식이 다르다(§5.1):
 *  · 파이널  = wrap:"cover" FlowItem 1개(1장 고정, 축소 사다리)
 *  · 이 문서 = 표지 헤더+범례 1블록 → 파트 헤더(wrap:"secheader", 고아 방지 자동)
 *              → **문장 카드당 FlowItem 1개**(wrap:"jikdok", atomic — 카드 내부 절단 금지)
 *    로 packFlow 멀티페이지에 참여한다. FlowItem 조립 호출은 assemble.pushReadingAnalysis.
 *
 * ⚠ sentence-canvas.tsx 의 par-canvas-sep-ch 슬래시 구분은 **재사용하지 않는다** —
 *   그쪽은 손필기 캔버스(절대배치 라벨·연결선 실측)이고 이 문서는 순수 활자 조판이다(§5.2-15).
 *
 * 측정 계약(재발 금지): 블록 높이는 BlockShell(.par-block, data-mid)의
 * getBoundingClientRect 로 측정된다 — **여백이 블록 가장자리 밖으로 붕괴(collapse)해
 * 새어나가면 측정에서 빠진다**. 그래서 블록 내부 층간 간격은 전부 margin-top/padding 으로
 * 만들고(첫 자식 margin-top 0), 블록 최상위 요소에는 margin 을 두지 않는다.
 */

type ReadingSentence = ReadingAnalysisSection["sentences"][number];
type ReadingChunk = ReadingSentence["chunks"][number];
type ChunkMark = NonNullable<ReadingChunk["marks"]>[number];

// ─── 인라인 하이라이트 세그먼트 (§1.3) ────────────────────────────────────────
type ChunkSegment = { text: string; kind?: ReadingMarkKind };

/**
 * 조각 en 을 marks[].text 문자열 매칭으로 세그먼트 분해 — proto.html renderChunkEn 로직.
 * **긴 텍스트 우선**으로 자리를 선점한다(짧은 마크가 긴 마크의 부분 문자열일 때 —
 * "as" 가 "as they set out" 안쪽을 먼저 먹으면 긴 마크가 실종된다). 이미 선점된 구간과
 * 겹치는 발생 위치는 다음 발생으로 넘어가고, 어디에도 못 앉으면 그 마크는 조용히 평문
 * 강등된다(C3 위반 데이터에 대한 관대 렌더 — 생성 게이트가 1차 방어선이다). 순수·결정론.
 */
function chunkSegments(en: string, marks: ChunkMark[] | undefined): ChunkSegment[] {
  if (!marks || marks.length === 0) return [{ text: en }];
  const claimed: Array<{ start: number; end: number; kind: ReadingMarkKind }> = [];
  const sorted = [...marks].sort((a, b) => b.text.length - a.text.length);
  for (const m of sorted) {
    if (!m.text) continue;
    let from = 0;
    while (from <= en.length - m.text.length) {
      const idx = en.indexOf(m.text, from);
      if (idx < 0) break;
      const end = idx + m.text.length;
      if (!claimed.some((c) => idx < c.end && end > c.start)) {
        claimed.push({ start: idx, end, kind: m.kind });
        break;
      }
      from = idx + 1;
    }
  }
  claimed.sort((a, b) => a.start - b.start);
  const segments: ChunkSegment[] = [];
  let cursor = 0;
  for (const c of claimed) {
    if (c.start > cursor) segments.push({ text: en.slice(cursor, c.start) });
    segments.push({ text: en.slice(c.start, c.end), kind: c.kind });
    cursor = c.end;
  }
  if (cursor < en.length) segments.push({ text: en.slice(cursor) });
  return segments;
}

/**
 * 주석 해설 볼드 규칙 — 정본은 **평문** 「표제: 설명 / 표제: 설명」이고 콜론 앞 표제를
 * 자동 볼드한다(데이터에 서식 마커를 넣지 않는 코드베이스 평문 원칙 — 마커가 있으면
 * 편집 캔버스에서 `**` 가 그대로 노출되는 실측 사고). `**` 가 남은 구본 데이터는
 * 하위호환으로 기존 마커 파싱을 유지한다.
 */
function noteBoldSpans(text: string): Array<{ text: string; bold: boolean }> {
  const out: Array<{ text: string; bold: boolean }> = [];
  if (text.includes("**")) {
    // 구본 하위호환 — `**표제**` 마커 파싱(짝이 안 맞으면 평문 그대로).
    const re = /\*\*(.+?)\*\*/g;
    let cursor = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      if (m.index > cursor) out.push({ text: text.slice(cursor, m.index), bold: false });
      out.push({ text: m[1], bold: true });
      cursor = m.index + m[0].length;
    }
    if (cursor < text.length) out.push({ text: text.slice(cursor), bold: false });
    return out;
  }
  // 평문 콜론 규칙 — ` / ` 병기 세그먼트별 첫 `:` 앞이 표제.
  const segs = text.split(" / ");
  segs.forEach((seg, i) => {
    if (i > 0) out.push({ text: " / ", bold: false });
    const colon = seg.indexOf(":");
    if (colon > 0) {
      out.push({ text: seg.slice(0, colon), bold: true });
      out.push({ text: seg.slice(colon), bold: false });
    } else {
      out.push({ text: seg, bold: false });
    }
  });
  return out;
}

function renderNoteBold(text: string): ReactNode {
  const spans = noteBoldSpans(text);
  if (!spans.some((s) => s.bold)) return text;
  return (
    <>
      {spans.map((s, k) => (s.bold ? <b key={k}>{s.text}</b> : s.text))}
    </>
  );
}

/** 편집 필드용 같은 규칙의 innerHTML 버전 — 커밋은 innerText 라 <b> 는 평문으로 접혀 왕복 무손실. */
function noteDisplayHtml(text: string): string {
  const esc = (t: string) =>
    t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/\n/g, "<br>");
  return noteBoldSpans(text)
    .map((s) => (s.bold ? `<b>${esc(s.text)}</b>` : esc(s.text)))
    .join("");
}

/** 슬래시 구분자 — 좌우의 `{" "}` 는 줄바꿈 기회다(마진만으로는 브라우저가 조각 경계에서 못 접는다). */
function Slash() {
  return (
    <>
      {" "}
      <span className="par-jd-slash">/</span>{" "}
    </>
  );
}

// ─── 표지 헤더 + 범례 (§1.1-1·2 — 문서 선두 1회, FlowItem 1개) ────────────────
function JdDocHeader({
  header,
  editable,
  onPatch,
}: {
  header: ReadingAnalysisSection["header"];
  editable: boolean;
  onPatch: (p: Partial<ReadingAnalysisSection["header"]>) => void;
}) {
  return (
    <div className="par-jd-cover">
      <div className="par-jd-head">
        {header.curriculumBadge || editable ? (
          <Field
            as="span"
            className="par-jd-badge"
            editable={editable}
            value={header.curriculumBadge}
            placeholder="(교육과정/과목)"
            onCommit={(v) => onPatch({ curriculumBadge: v })}
          />
        ) : null}
        <Field as="h1" className="par-jd-title" editable={editable} value={header.title} onCommit={(v) => onPatch({ title: v })} />
        <p className="par-jd-subtitle">
          {/* source 는 C5(사실 창작 금지) 계약상 미상이면 빈 문자열 — 그때는 구분자까지 접는다. */}
          {header.source || editable ? (
            <>
              <Field as="span" editable={editable} value={header.source} placeholder="(출처)" onCommit={(v) => onPatch({ source: v })} />
              <span className="par-jd-sub-sep"> | </span>
            </>
          ) : null}
          <Field as="span" editable={editable} value={header.subtitle} onCommit={(v) => onPatch({ subtitle: v })} />
        </p>
      </div>
      <div className="par-jd-legend">
        <b className="par-jd-lg-k">📌 색상별 판서 및 기호 범례:</b> <b className="par-jd-lg-r">빨간색 (문법/어법 핵심)</b> ·{" "}
        <b className="par-jd-lg-b">파란색 (핵심 표현/어휘/숙어)</b> · <b className="par-jd-lg-y">황토색 (접속사/연결사)</b> ·{" "}
        <b className="par-jd-lg-t">청록색 (구조/관계사/분사)</b> · <span className="par-jd-slash">/</span>{" "}
        <b>(슬래시 끊어읽기 호흡)</b>
      </div>
    </div>
  );
}

// ─── 파트 헤더 (§1.1-3 — [본문 N] 한국어 소제목) ──────────────────────────────
function JdPartHeader({
  label,
  titleKo,
  editable,
  onTitleKo,
}: {
  label: string;
  titleKo: string;
  editable: boolean;
  onTitleKo: (v: string) => void;
}) {
  return (
    // 래퍼 padding-top 이 파트 앞 추가 호흡(proto 26px 근사)이다 — margin-top 으로 두면
    // 블록 가장자리 밖으로 붕괴해 측정(data-mid rect)에서 빠진다(파일 머리 주석의 측정 계약).
    <div className="par-jd-partwrap">
      <h2 className="par-jd-part">
        <span className="par-jd-part-label">[{label}]</span>{" "}
        <Field as="span" editable={editable} value={titleKo} onCommit={onTitleKo} />
      </h2>
    </div>
  );
}

// ─── 문장 카드 (§1.2 — 5층 반복 단위) ─────────────────────────────────────────
function JdSentenceCard({
  sentence,
  editable,
  onPatch,
}: {
  sentence: ReadingSentence;
  editable: boolean;
  onPatch: (p: Partial<ReadingSentence>) => void;
}) {
  // ★≥1 카드 = 주황 액센트 + 크림 배경(§1.4).
  const hot = sentence.stars > 0;
  const updChunkKo = (ci: number, v: string) =>
    onPatch({ chunks: sentence.chunks.map((c, j) => (j === ci ? { ...c, ko: v } : c)) });
  const updNoteText = (ni: number, v: string) =>
    onPatch({ notes: sentence.notes.map((n, j) => (j === ni ? { ...n, text: v } : n)) });

  return (
    <article className={`par-jd-card${hot ? " par-jd-hot" : ""}`}>
      {/* ① 원문 행 — 번호 배지(★중요도) + 슬래시 끊어읽기 + 4색 하이라이트.
          en 은 편집 불가로 둔다 — C1(원문 축자 일치)·C3(마크 부분 문자열 실존)이
          en 문자열에 앵커돼 있어 자유 편집이 하이라이트를 조용히 전멸시킨다. */}
      <div className="par-jd-sent">
        <span className={`par-jd-no${hot ? " par-jd-no-hot" : ""}`}>
          {String(sentence.no).padStart(2, "0")}
          {sentence.stars > 0 ? ` ${"★".repeat(sentence.stars)}` : ""}
        </span>
        <span className="par-jd-en">
          {sentence.chunks.map((c, ci) => (
            <Fragment key={ci}>
              {ci > 0 ? <Slash /> : null}
              {chunkSegments(c.en, c.marks).map((seg, sj) =>
                seg.kind ? (
                  <span key={sj} className={`par-jd-hl-${seg.kind}`}>
                    {seg.text}
                  </span>
                ) : (
                  <Fragment key={sj}>{seg.text}</Fragment>
                ),
              )}
            </Fragment>
          ))}
        </span>
      </div>
      {/* ② 직독직해 — 조각 수·순서 = 원문과 1:1(§1.4). ko 는 교사 손질 빈도가 높아 편집 허용. */}
      <div className="par-jd-jik">
        <span className="par-jd-jik-tag">👍[직독직해]</span>{" "}
        {sentence.chunks.map((c, ci) => (
          <Fragment key={ci}>
            {ci > 0 ? <Slash /> : null}
            <Field as="span" editable={editable} value={c.ko} onCommit={(v) => updChunkKo(ci, v)} />
          </Fragment>
        ))}
      </div>
      {/* ③ 완전해석 — 자연 어순 완역. */}
      <div className="par-jd-full">
        <span className="par-jd-full-tag">[완전해석]</span>{" "}
        <Field as="span" editable={editable} value={sentence.fullKo} onCommit={(v) => onPatch({ fullKo: v })} />
      </div>
      {/* ④ 주석 행들 — 라벨 배지(red=문법 계열/blue=어휘·표현 계열) + 볼드 표제 해설. */}
      {sentence.notes.length > 0 ? (
        <div className="par-jd-notes">
          {sentence.notes.map((n, ni) => (
            <div className="par-jd-note" key={ni}>
              <span className={`par-jd-note-label par-jd-note-${n.tone === "red" ? "red" : "blue"}`}>{n.label}</span>
              <Field
                as="span"
                className="par-jd-note-text"
                editable={editable}
                value={n.text}
                render={renderNoteBold}
                displayHtml={noteDisplayHtml}
                onCommit={(v) => updNoteText(ni, v)}
              />
            </div>
          ))}
        </div>
      ) : null}
    </article>
  );
}

// ─── 섹션 → FlowItem[] (assemble.pushReadingAnalysis 전용) ────────────────────
/**
 * 문서 전개(§1.1 순서 고정): 표지 헤더+범례 1블록 → 파트마다 [헤더 → 소속 카드들].
 *
 * FlowItem 계약:
 *  · 표지 블록  wrap:"note"  — standalone 1블록. wrap:"cover" 를 쓰지 않는 이유(실측):
 *    packFlow 가 cover 를 **페이지 독점**(hh=pageBodyMm, 앞뒤 강제 분할)으로 다루고
 *    pages.tsx 가 러닝헤더/푸터 없는 전면 시트로 그린다 — 레퍼런스 p1 은 헤더·범례 아래
 *    같은 페이지에 카드가 이어지는 모양이라 cover 의미론과 정면 충돌한다.
 *  · 파트 헤더  wrap:"secheader" + keepWithPrev + splitWithPrev — forceBreak(섹션마다
 *    새 페이지)를 면제받고, orphanBreak 최소 보증(헤더+첫 카드 동반)만 남긴다(§4 고아 방지).
 *    단 orphanBreak 게이트(items.ts packFlow)는 `sawSecHeader` 뒤에 있어 **문서의 첫
 *    secheader 는 보호하지 않는다** — 그래서 atomic + keepWithNextGroup 를 함께 실어
 *    atomicBreak 1홉 시뮬레이션(헤더+다음 atomic 그룹 = 첫 카드)으로 같은 보증을 만든다.
 *    keepWithNextGroup 는 `it.atomic` 옵트인 안에서만 읽히므로 둘은 한 쌍이다(items.ts:304,
 *    worksheet-flow 추론 미니헤드 [E34-R4]와 같은 관용구). 2번째 이후 헤더에서는
 *    orphanBreak(먼저 판정) 최소 보증과 산식이 같아 중복-무해하다.
 *  · 문장 카드  wrap:"jikdok" + atomic — 카드 내부 절단 금지, 잔여 공간에 안 들어가면
 *    카드째 다음 페이지(packFlow atomicBreak). 카드 id 가 곧 orderId(그룹=카드 1개)다.
 *
 * C4 위반 데이터 방어: 파트가 참조하지 않는 문장은 맨 뒤에 헤더 없이 이어 붙인다 —
 * 「무설명 증발」 금지(파트 분할이 깨져도 문장은 전부 지면에 남는다).
 */
export function readingAnalysisFlowItems(
  section: ReadingAnalysisSection,
  si: number,
  no: number,
  sed?: SectionEdit,
): FlowItem[] {
  const editable = !!sed;
  const patch = (p: Partial<ReadingAnalysisSection>) => sed?.commit({ ...section, ...p } as AnalysisSection);
  const updSentenceAt = (idx: number, p: Partial<ReadingSentence>) =>
    patch({ sentences: section.sentences.map((x, i) => (i === idx ? { ...x, ...p } : x)) });

  const items: FlowItem[] = [];
  const push = (key: string, wrap: FlowItem["wrap"], node: ReactNode, extra?: Partial<FlowItem>) =>
    items.push({ id: `s${si}-${key}`, sectionIndex: si, kind: section.kind, no, wrap, node, ...extra });

  // 표지 헤더 + 범례 — 한 FlowItem 이라 둘 사이에서 페이지가 갈리지 않는다(§4 문서 선두 1회).
  push("jd-cover", "note", <JdDocHeader header={section.header} editable={editable} onPatch={(p) => patch({ header: { ...section.header, ...p } })} />);

  // 문장 no → (문장, 배열 인덱스). 배열 인덱스가 카드 id 를 만든다(no 중복 불량 데이터에도 id 유일).
  const byNo = new Map<number, { sentence: ReadingSentence; index: number }>();
  section.sentences.forEach((sentence, index) => {
    if (!byNo.has(sentence.no)) byNo.set(sentence.no, { sentence, index });
  });
  const used = new Set<number>();

  const pushCard = (entry: { sentence: ReadingSentence; index: number }) => {
    used.add(entry.index);
    push(
      `jd-card${entry.index}`,
      "jikdok",
      <JdSentenceCard sentence={entry.sentence} editable={editable} onPatch={(p) => updSentenceAt(entry.index, p)} />,
      { atomic: true },
    );
  };

  section.parts.forEach((part, pi) => {
    push(
      `jd-part${pi}`,
      "secheader",
      <JdPartHeader
        label={part.label}
        titleKo={part.titleKo}
        editable={editable}
        onTitleKo={(v) => patch({ parts: section.parts.map((x, j) => (j === pi ? { ...x, titleKo: v } : x)) })}
      />,
      // atomic+keepWithNextGroup: **첫 파트 헤더 고아 방지**(렌즈3 실측 — 표지 62.2mm
      // 뒤에 헤더만 남고 첫 카드 180mm 가 atomicBreak 로 다음 장에 가던 케이스).
      // packFlow orphanBreak 는 sawSecHeader 게이트라 첫 secheader 미보호 → atomicBreak
      // 1홉 보증으로 대체한다. keepWithNextGroup 는 atomic 없이는 읽히지 않는다(items.ts:304).
      // 다음 그룹(첫 카드)이 atomic 인 것이 1홉 전진의 전제다 — pushCard 가 전 카드에 부여.
      { keepWithPrev: true, splitWithPrev: true, atomic: true, keepWithNextGroup: true },
    );
    for (const n of part.sentences) {
      const entry = byNo.get(n);
      if (!entry || used.has(entry.index)) continue; // 중복 참조는 첫 파트 승리(관대)
      pushCard(entry);
    }
  });

  // C4 위반(파트 미참조 문장) 폴백 — 배열 순서대로 꼬리에 붙인다.
  section.sentences.forEach((sentence, index) => {
    if (used.has(index)) return;
    pushCard({ sentence, index });
  });

  return items;
}
