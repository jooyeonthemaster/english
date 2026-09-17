"use client";

import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { circledNo } from "@/lib/passage-report/analysis-report/design-tokens";
import { resolveAnchorRangeWordBoundary } from "@/lib/passage-report/analysis-report/passage-canvas-model";
import type { FinalOnepageSection, ReportMeta } from "@/lib/passage-report/analysis-report/schema";
import { Field } from "./editable-field";

/**
 * 원페이지 파이널 학습지 시트 — 문서당 FlowItem 정확히 1개(wrap:"cover")로 나간다.
 * 표지와 같은 전면 페이지 메커니즘(페이지 독점·러닝헤더/푸터 없음·번호 제외)을 그대로
 * 재사용하므로 packFlow / pages.tsx 는 무수정이다. FlowItem 조립은 assemble.tsx 가
 * (meta·brand 컨텍스트를 가진 곳에서) 표지 coverItems 와 동형으로 담당한다.
 * (스펙 .tmp-final-qa/final-onepage-spec.md §5)
 */

// ─── 마크 세그먼트 분해 ───────────────────────────────────────────────────────
type Mark = FinalOnepageSection["sentences"][number]["marks"][number];
type Segment = { text: string; mark?: Mark; markIndex?: number; labelTier?: 1 | 2 };

/**
 * 문장 en 을 마크 앵커 기준 세그먼트로 나눈다(겹침은 앞선 마크 우선). 순수·결정론.
 * labelTier: 라벨 있는 마크가 바짝 붙어 있으면(사이 원문 < 12자) 뒤쪽 라벨을 2단으로
 * 올려 가로 충돌을 피한다("compared it" 처럼 인접 앵커 라벨이 뒤섞이던 실측 결함).
 */
function splitByMarks(en: string, marks: Mark[]): Segment[] {
  const resolved = marks
    .map((mark, markIndex) => ({ mark, markIndex, range: resolveAnchorRangeWordBoundary(en, mark.anchor) }))
    .filter((m): m is { mark: Mark; markIndex: number; range: { start: number; end: number } } => m.range !== null)
    .sort((a, b) => a.range.start - b.range.start);
  const kept: typeof resolved = [];
  for (const m of resolved) {
    const prev = kept.at(-1);
    if (prev && m.range.start < prev.range.end) continue; // 겹침 → 먼저 온 마크 우선
    kept.push(m);
  }
  // 라벨 충돌 판정 — 직전 '라벨 있는' 마크와의 간격이 좁고 그 라벨이 1단이면 2단으로.
  const tiers = new Map<number, 1 | 2>();
  let prevLabeled: { end: number; tier: 1 | 2 } | null = null;
  for (const m of kept) {
    if (!m.mark.label?.trim()) continue;
    const tier: 1 | 2 =
      prevLabeled && prevLabeled.tier === 1 && m.range.start - prevLabeled.end < 12 ? 2 : 1;
    tiers.set(m.markIndex, tier);
    prevLabeled = { end: m.range.end, tier };
  }
  const segments: Segment[] = [];
  let cursor = 0;
  for (const m of kept) {
    if (m.range.start > cursor) segments.push({ text: en.slice(cursor, m.range.start) });
    segments.push({
      text: en.slice(m.range.start, m.range.end),
      mark: m.mark,
      markIndex: m.markIndex,
      labelTier: tiers.get(m.markIndex) ?? 1,
    });
    cursor = m.range.end;
  }
  if (cursor < en.length) segments.push({ text: en.slice(cursor) });
  return segments;
}

const TAG_COLOR: Record<string, string> = {
  빈칸대비: "pink",
  어법함정: "red",
  어휘함정: "green",
  서술형대비: "purple",
  순서단서: "blue",
  삽입단서: "blue",
  지칭대비: "green",
  요약대비: "purple",
  "주제·제목": "blue",
  함축대비: "pink",
  내용일치: "blue",
  무관문장: "blue",
};

// ─── 시트 본체 ────────────────────────────────────────────────────────────────
export function FinalOnepageSheet({
  section,
  meta,
  brand,
  editable,
  onPatch,
  onMetaPatch,
}: {
  section: FinalOnepageSection;
  meta: ReportMeta;
  brand: string;
  editable: boolean;
  onPatch: (patch: Partial<FinalOnepageSection>) => void;
  onMetaPatch?: (patch: Partial<ReportMeta>) => void;
}) {
  const availRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  // ── 1페이지 하드 보장: 폰트 스케일 사다리(1.00→0.70) → 잔여 transform scale ──
  // 가용 높이는 .fon-avail(297mm 고정 root 의 패딩 안쪽 100% 내벽)에서 잰다 —
  // root 를 flex:1 로 두면 부모 체인이 콘텐츠만큼 자라 넘침을 오판한다(장문 절단 실측).
  // offsetHeight/clientHeight 는 레이아웃 px 라 조상 zoom·transform 배율과 무관하다.
  const fit = useCallback(() => {
    const availEl = availRef.current;
    const body = bodyRef.current;
    if (!availEl || !body) return;
    body.style.transform = "";
    body.style.width = "";
    body.style.setProperty("--fon-fs", "1");
    const avail = availEl.clientHeight;
    if (avail <= 0 || body.offsetHeight <= 0) return; // 미레이아웃(스킵 렌더) — 다음 기회에
    const steps = [1, 0.96, 0.92, 0.88, 0.84, 0.8, 0.76, 0.72, 0.7];
    for (const s of steps) {
      body.style.setProperty("--fon-fs", String(s));
      if (body.offsetHeight <= avail + 1) return;
    }
    // 사다리 바닥(0.7)에서도 넘침 — 잔여분은 균등 축소(폭 보상으로 전폭 유지, 수학적 수렴).
    const r = Math.max(0.5, avail / body.offsetHeight);
    body.style.width = `${(100 / r).toFixed(3)}%`;
    body.style.transformOrigin = "top left";
    body.style.transform = `scale(${r.toFixed(4)})`;
  }, []);

  useLayoutEffect(() => {
    fit();
  }, [fit, section]);
  useEffect(() => {
    // 손글씨 웹폰트 로드 후 줄바꿈이 변한다 — 로드 완료 시 1회 재보정.
    let alive = true;
    document.fonts?.ready?.then(() => {
      if (alive) fit();
    });
    return () => {
      alive = false;
    };
  }, [fit]);

  const s = section;
  const patchSentence = (i: number, p: Partial<FinalOnepageSection["sentences"][number]>) =>
    onPatch({ sentences: s.sentences.map((x, j) => (j === i ? { ...x, ...p } : x)) });

  const flowAfter = new Map<number, { idx: number; note: FinalOnepageSection["flowNotes"][number] }[]>();
  s.flowNotes.forEach((note, idx) => {
    const list = flowAfter.get(note.afterSentence) ?? [];
    list.push({ idx, note });
    flowAfter.set(note.afterSentence, list);
  });

  return (
    <div className="fon-root">
      <div className="fon-avail" ref={availRef}>
      <div className="fon-body" ref={bodyRef}>
        {/* ── 헤더 밴드 ── */}
        <header className="fon-head">
          <div className="fon-head-top">
            <span className="fon-brand">{brand}</span>
            <span className="fon-head-badges">
              <span className="fon-badge-types">{meta.examTypes}</span>
              <span className="fon-badge-stars" aria-label={`난이도 ${meta.difficulty}`}>
                {"★".repeat(Math.max(1, Math.min(5, meta.difficulty)))}
                {"☆".repeat(Math.max(0, 5 - meta.difficulty))}
              </span>
            </span>
            <span className="fon-stamp" aria-hidden="true">FINAL<b>1-PAGE</b></span>
          </div>
          <div className="fon-head-title-row">
            <Field
              as="h1"
              className="fon-title"
              editable={editable && !!onMetaPatch}
              value={meta.titleKo}
              onCommit={(v) => onMetaPatch?.({ titleKo: v })}
            />
          </div>
          <div className="fon-head-row">
            <span className="fon-topic-k">소재</span>
            <Field
              as="span"
              className="fon-topic"
              editable={editable}
              value={s.topic}
              onCommit={(v) => onPatch({ topic: v })}
            />
          </div>
          {s.oneLiner || editable ? (
            <div className="fon-oneliner">
              <span className="fon-oneliner-k">한 줄 정리</span>
              <Field
                as="span"
                className="fon-hand"
                editable={editable}
                value={s.oneLiner ?? ""}
                placeholder="(한 줄 정리)"
                onCommit={(v) => onPatch({ oneLiner: v })}
              />
            </div>
          ) : null}
        </header>

        {/* ── 본문: 원문 + 필기 ── */}
        <div className="fon-sentences">
          {s.sentences.map((snt, i) => (
            <div className="fon-snt-group" key={snt.n}>
              <p className="fon-snt">
                <span className="fon-sno">{circledNo(snt.n)}</span>
                {splitByMarks(snt.en, snt.marks).map((seg, k) => {
                  if (!seg.mark) return <span key={k}>{seg.text}</span>;
                  const color = seg.mark.color ?? "red";
                  return (
                    <span key={k} className={`fon-mk fon-mk-${seg.mark.style} fon-c-${color}`}>
                      {seg.mark.label ? (
                        <span
                          className={`fon-mklabel fon-hand${seg.labelTier === 2 ? " fon-mklabel-t2" : ""}`}
                          contentEditable={false}
                        >
                          <Field
                            as="span"
                            editable={editable}
                            value={seg.mark.label}
                            onCommit={(v) =>
                              patchSentence(i, {
                                marks: snt.marks.map((m, mj) =>
                                  mj === seg.markIndex ? { ...m, label: v } : m,
                                ),
                              })
                            }
                          />
                        </span>
                      ) : null}
                      {seg.text}
                    </span>
                  );
                })}
                {snt.tags.map((tag, ti) => (
                  <span className={`fon-tag fon-c-${TAG_COLOR[tag.type] ?? "red"}`} key={ti}>
                    <b>{tag.type}</b>
                    <Field
                      as="span"
                      editable={editable}
                      value={tag.text}
                      onCommit={(v) =>
                        patchSentence(i, {
                          tags: snt.tags.map((t, tj) => (tj === ti ? { ...t, text: v } : t)),
                        })
                      }
                    />
                  </span>
                ))}
              </p>
              {snt.note || editable ? (
                <div className="fon-note fon-hand">
                  <span className="fon-note-arrow" aria-hidden="true">↳</span>
                  <Field
                    as="span"
                    editable={editable}
                    value={snt.note ?? ""}
                    placeholder={editable ? "(필기)" : "—"}
                    onCommit={(v) => patchSentence(i, { note: v })}
                  />
                </div>
              ) : null}
              {(flowAfter.get(snt.n) ?? []).map(({ idx, note }) => (
                <div className="fon-flownote" key={`fn-${idx}`}>
                  {note.label ? <span className="fon-flownote-k">{note.label}</span> : null}
                  <Field
                    as="span"
                    className="fon-hand"
                    editable={editable}
                    value={note.text}
                    onCommit={(v) =>
                      onPatch({
                        flowNotes: s.flowNotes.map((n, nj) => (nj === idx ? { ...n, text: v } : n)),
                      })
                    }
                  />
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* ── 출제자의 함정 총정리 ── */}
        <div className="fon-traps">
          <div className="fon-sec-k">출제자의 함정 총정리</div>
          <table className="fon-trap-table">
            <tbody>
              {s.traps.map((trap, i) => (
                <tr key={i}>
                  <td className="fon-trap-type">
                    <Field
                      as="span"
                      editable={editable}
                      value={trap.type}
                      onCommit={(v) => onPatch({ traps: s.traps.map((t, j) => (j === i ? { ...t, type: v } : t)) })}
                    />
                  </td>
                  <td className="fon-trap-point">
                    <Field
                      as="span"
                      editable={editable}
                      value={trap.point}
                      onCommit={(v) => onPatch({ traps: s.traps.map((t, j) => (j === i ? { ...t, point: v } : t)) })}
                    />
                  </td>
                  <td className="fon-trap-trap">
                    <span className="fon-trap-warn" aria-hidden="true">⚠</span>
                    <Field
                      as="span"
                      editable={editable}
                      value={trap.trap}
                      onCommit={(v) => onPatch({ traps: s.traps.map((t, j) => (j === i ? { ...t, trap: v } : t)) })}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* ── 각주 어휘 ── */}
        {s.mustKnow.length > 0 ? (
          <div className="fon-footnotes">
            {s.mustKnow.map((w, i) => (
              <span className="fon-fnitem" key={i}>
                <span className="fon-fnstar" aria-hidden="true">{"*".repeat((i % 3) + 1)}</span>
                <Field
                  as="span"
                  className="fon-fnterm"
                  editable={editable}
                  value={w.term}
                  onCommit={(v) => onPatch({ mustKnow: s.mustKnow.map((x, j) => (j === i ? { ...x, term: v } : x)) })}
                />
                <Field
                  as="span"
                  editable={editable}
                  value={w.meaning}
                  onCommit={(v) => onPatch({ mustKnow: s.mustKnow.map((x, j) => (j === i ? { ...x, meaning: v } : x)) })}
                />
              </span>
            ))}
          </div>
        ) : null}

        {/* ── 전문 해석 ── */}
        {s.koFull || editable ? (
          <div className="fon-kofull">
            <span className="fon-kofull-k">전문 해석</span>
            <Field
              as="span"
              editable={editable}
              value={s.koFull ?? ""}
              placeholder="(전문 해석)"
              onCommit={(v) => onPatch({ koFull: v })}
            />
          </div>
        ) : null}

        {/* ── 파이널 팁 ── */}
        {s.finalTip || editable ? (
          <div className="fon-tip">
            <span className="fon-tip-k" aria-hidden="true">✎</span>
            <Field
              as="span"
              className="fon-hand"
              editable={editable}
              value={s.finalTip ?? ""}
              placeholder="(마지막 한 줄)"
              onCommit={(v) => onPatch({ finalTip: v })}
            />
          </div>
        ) : null}
      </div>
      </div>
    </div>
  );
}
