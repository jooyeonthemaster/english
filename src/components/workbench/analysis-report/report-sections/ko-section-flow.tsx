import type { AnalysisSection } from "@/lib/passage-report/analysis-report/schema";
import type {
  KoAnalysisSection,
  KoCheckQuizSection,
  KoConceptVocabSection,
  KoExamPointsSection,
  KoLiteraryDeviceSection,
  KoOverviewSection,
  KoParagraphSection,
  KoPassageSection,
  KoSpeakerSection,
  KoStructureSection,
} from "@/lib/passage-report/analysis-report/ko-schema";
import { Field } from "./editable-field";
import type { SectionFlowCtx } from "./types";

/**
 * PRIME_KO 섹션 → FlowItem[] 렌더러.
 *
 * 영어 section-flow 의 FlowItem/WrapKind 조판 인프라를 그대로 재사용하되,
 * KO 섹션은 전부 자기완결 블록(wrap:"note")으로 내보낸다 — WorksheetLogicMapBlock
 * (logicRows 표) 패턴 미러. 표 스타일은 기존 .par-ws-logic / .par-ws-block CSS 재사용.
 * 영어 케이스는 무접촉(section-flow.tsx 는 KO 게이트 1줄만 추가).
 */

function commitKo(ctx: SectionFlowCtx, next: KoAnalysisSection): void {
  // SectionEdit.commit 은 영어 AnalysisSection 으로 타입돼 있으나 런타임은 JSON 패스스루 —
  // KO 보고서 저장 라우트가 koAnalysisReportSchema 로 재검증한다.
  ctx.commit(next as unknown as AnalysisSection);
}

function MiniHead({ k, e }: { k: string; e?: string }) {
  return (
    <div className="par-ws-minihead">
      <span className="par-ws-minihead-k">{k}</span>
      {e ? <span className="par-ws-minihead-e">{e}</span> : null}
    </div>
  );
}

// ─── 00 원문 (결정론 — 행 구분 보존) ─────────────────────────────────────────
function koPassageFlow(s: KoPassageSection, ctx: SectionFlowCtx): void {
  const { push } = ctx;
  if (s.note) push("note", "note", <p className="par-note">{s.note}</p>);
  // 빈 줄(문단/연 경계) 단위로 쪼개 페이지 분할이 자연스럽게 되도록 한다.
  const blocks = s.text.replace(/\r\n?/g, "\n").split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  blocks.forEach((block, i) => {
    push(
      "note",
      `ko-psg${i}`,
      <div className="par-box" style={{ whiteSpace: "pre-wrap", lineHeight: 1.8 }}>
        {block}
      </div>,
    );
  });
}

// ─── 01 개관 ─────────────────────────────────────────────────────────────────
function koOverviewFlow(s: KoOverviewSection, ctx: SectionFlowCtx): void {
  const { editable, push } = ctx;
  const patch = (p: Partial<KoOverviewSection>) => commitKo(ctx, { ...s, ...p });
  const row = (label: string, value: string, onCommit: (v: string) => void, key: string) => (
    <tr key={key}>
      <th style={{ width: "18%" }}>{label}</th>
      <td>
        <Field as="span" editable={editable} value={value} onCommit={onCommit} placeholder="—" />
      </td>
    </tr>
  );
  push(
    "note",
    "ko-ov",
    <div className="par-ws-block">
      <table className="par-ws-logic">
        <tbody>
          {row("갈래", s.genre, (v) => patch({ genre: v }), "genre")}
          {s.genreDetail || editable
            ? row("성격", s.genreDetail ?? "", (v) => patch({ genreDetail: v }), "detail")
            : null}
          {row("제재", s.subjectMatter, (v) => patch({ subjectMatter: v }), "subject")}
          {row("주제", s.theme, (v) => patch({ theme: v }), "theme")}
        </tbody>
      </table>
    </div>,
  );
  if (s.commentary || editable) {
    push(
      "note",
      "ko-ov-comm",
      <div className="par-box">
        <MiniHead k="해제" e="Commentary" />
        <Field as="div" editable={editable} value={s.commentary} onCommit={(v) => patch({ commentary: v })} placeholder="(해제)" />
      </div>,
    );
  }
}

// ─── 02 문단/연별 요지 ───────────────────────────────────────────────────────
function koParagraphFlow(s: KoParagraphSection, ctx: SectionFlowCtx): void {
  const { editable, push } = ctx;
  const upd = (i: number, p: Partial<KoParagraphSection["rows"][number]>) =>
    commitKo(ctx, { ...s, rows: s.rows.map((r, j) => (j === i ? { ...r, ...p } : r)) });
  push(
    "note",
    "ko-para",
    <div className="par-ws-block">
      <table className="par-ws-logic">
        <thead>
          <tr>
            <th style={{ width: "10%" }}>{s.unitLabel}</th>
            <th>요지</th>
          </tr>
        </thead>
        <tbody>
          {s.rows.map((r, i) => (
            <tr key={i}>
              <td>{`${r.no}${s.unitLabel}`}</td>
              <td>
                {r.heading ? <b>[{r.heading}] </b> : null}
                <Field as="span" editable={editable} value={r.gist} onCommit={(v) => upd(i, { gist: v })} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>,
  );
}

// ─── 03 핵심 개념어·어휘 ─────────────────────────────────────────────────────
function koConceptVocabFlow(s: KoConceptVocabSection, ctx: SectionFlowCtx): void {
  const { editable, push } = ctx;
  const upd = (i: number, p: Partial<KoConceptVocabSection["rows"][number]>) =>
    commitKo(ctx, { ...s, rows: s.rows.map((r, j) => (j === i ? { ...r, ...p } : r)) });
  push(
    "note",
    "ko-vocab",
    <div className="par-ws-block">
      <table className="par-ws-logic">
        <thead>
          <tr>
            <th style={{ width: "24%" }}>개념어·어휘</th>
            <th>뜻풀이</th>
            <th style={{ width: "24%" }}>비고</th>
          </tr>
        </thead>
        <tbody>
          {s.rows.map((r, i) => (
            <tr key={i}>
              <td>
                <Field as="span" editable={editable} value={r.term} onCommit={(v) => upd(i, { term: v })} />
                {r.hanja ? <span style={{ color: "#64748b" }}>({r.hanja})</span> : null}
              </td>
              <td>
                <Field as="span" editable={editable} value={r.meaning} onCommit={(v) => upd(i, { meaning: v })} />
              </td>
              <td>
                <Field as="span" editable={editable} value={r.note ?? ""} onCommit={(v) => upd(i, { note: v })} placeholder="—" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>,
  );
}

// ─── 04 구조도 (logicRows 패턴 미러) ─────────────────────────────────────────
function koStructureFlow(s: KoStructureSection, ctx: SectionFlowCtx): void {
  const { editable, push } = ctx;
  const upd = (i: number, p: Partial<KoStructureSection["rows"][number]>) =>
    commitKo(ctx, { ...s, rows: s.rows.map((r, j) => (j === i ? { ...r, ...p } : r)) });
  if (s.note) push("note", "ko-struct-note", <p className="par-note">{s.note}</p>);
  push(
    "note",
    "ko-struct",
    <div className="par-ws-block par-ws-logic-promoted">
      <table className="par-ws-logic">
        <thead>
          <tr>
            <th style={{ width: "10%" }}>번호</th>
            <th style={{ width: "24%" }}>기능</th>
            <th>핵심 내용</th>
          </tr>
        </thead>
        <tbody>
          {s.rows.map((r, i) => (
            <tr key={i}>
              <td>{r.no ? `${r.no}` : "-"}</td>
              <td>
                <Field as="span" editable={editable} value={r.functionLabel} onCommit={(v) => upd(i, { functionLabel: v })} />
              </td>
              <td>
                <Field as="span" editable={editable} value={r.keyPoint} onCommit={(v) => upd(i, { keyPoint: v })} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>,
  );
}

// ─── 05 표현·서술상 특징 (문학 전용) ─────────────────────────────────────────
function koLiteraryDeviceFlow(s: KoLiteraryDeviceSection, ctx: SectionFlowCtx): void {
  const { editable, push } = ctx;
  const upd = (i: number, p: Partial<KoLiteraryDeviceSection["rows"][number]>) =>
    commitKo(ctx, { ...s, rows: s.rows.map((r, j) => (j === i ? { ...r, ...p } : r)) });
  push(
    "note",
    "ko-dev",
    <div className="par-ws-block">
      <table className="par-ws-logic">
        <thead>
          <tr>
            <th style={{ width: "18%" }}>기법</th>
            <th style={{ width: "34%" }}>근거 구절</th>
            <th>효과</th>
          </tr>
        </thead>
        <tbody>
          {s.rows.map((r, i) => (
            <tr key={i}>
              <td>
                <Field as="span" editable={editable} value={r.device} onCommit={(v) => upd(i, { device: v })} />
              </td>
              <td>
                <Field as="span" editable={editable} value={r.evidence} onCommit={(v) => upd(i, { evidence: v })} render={(v) => `“${v}”`} />
              </td>
              <td>
                <Field as="span" editable={editable} value={r.effect} onCommit={(v) => upd(i, { effect: v })} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>,
  );
}

// ─── 06 화자·인물 (문학 전용) ────────────────────────────────────────────────
function koSpeakerFlow(s: KoSpeakerSection, ctx: SectionFlowCtx): void {
  const { editable, push } = ctx;
  const upd = (i: number, p: Partial<KoSpeakerSection["rows"][number]>) =>
    commitKo(ctx, { ...s, rows: s.rows.map((r, j) => (j === i ? { ...r, ...p } : r)) });
  push(
    "note",
    "ko-spk",
    <div className="par-ws-block">
      <table className="par-ws-logic">
        <thead>
          <tr>
            <th style={{ width: "16%" }}>화자·인물</th>
            <th style={{ width: "18%" }}>정서</th>
            <th style={{ width: "18%" }}>태도</th>
            <th>근거</th>
          </tr>
        </thead>
        <tbody>
          {s.rows.map((r, i) => (
            <tr key={i}>
              <td>
                <Field as="span" editable={editable} value={r.target} onCommit={(v) => upd(i, { target: v })} />
                {r.role ? <div style={{ color: "#64748b", fontSize: "0.9em" }}>{r.role}</div> : null}
              </td>
              <td>
                <Field as="span" editable={editable} value={r.emotion} onCommit={(v) => upd(i, { emotion: v })} />
              </td>
              <td>
                <Field as="span" editable={editable} value={r.attitude} onCommit={(v) => upd(i, { attitude: v })} />
              </td>
              <td>
                <Field as="span" editable={editable} value={r.evidence ?? ""} onCommit={(v) => upd(i, { evidence: v })} placeholder="—" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>,
  );
}

// ─── 07 예상 출제 포인트 ─────────────────────────────────────────────────────
function koExamPointsFlow(s: KoExamPointsSection, ctx: SectionFlowCtx): void {
  const { editable, push } = ctx;
  const upd = (i: number, p: Partial<KoExamPointsSection["rows"][number]>) =>
    commitKo(ctx, { ...s, rows: s.rows.map((r, j) => (j === i ? { ...r, ...p } : r)) });
  s.rows.forEach((r, i) => {
    push(
      "note",
      `ko-exam${i}`,
      <div className="par-ws-block">
        <div className="par-ws-minihead">
          <Field as="span" className="par-ws-minihead-k" editable={editable} value={r.slot} onCommit={(v) => upd(i, { slot: v })} />
          {r.typeId ? <span className="par-ws-minihead-e">{r.typeId}</span> : null}
        </div>
        <div>
          <b>무엇을 묻나</b>{" "}
          <Field as="span" editable={editable} value={r.asks} onCommit={(v) => upd(i, { asks: v })} />
        </div>
        <div>
          <b>출제 근거</b>{" "}
          <Field as="span" editable={editable} value={r.basis} onCommit={(v) => upd(i, { basis: v })} />
        </div>
        {r.bogiIdea || editable ? (
          <div>
            <b>&lt;보기&gt; 소재</b>{" "}
            <Field as="span" editable={editable} value={r.bogiIdea ?? ""} onCommit={(v) => upd(i, { bogiIdea: v })} placeholder="—" />
          </div>
        ) : null}
      </div>,
    );
  });
}

// ─── 08 확인 문제 — 정답은 교사 표면 전용 (hiddenAnswers 게이트) ──────────────
function koCheckQuizFlow(s: KoCheckQuizSection, ctx: SectionFlowCtx): void {
  const { editable, push } = ctx;
  const patch = (p: Partial<KoCheckQuizSection>) => commitKo(ctx, { ...s, ...p });
  const upd = (i: number, p: Partial<KoCheckQuizSection["questions"][number]>) =>
    patch({ questions: s.questions.map((q, j) => (j === i ? { ...q, ...p } : q)) });

  if (s.note) push("note", "ko-quiz-note", <p className="par-note">{s.note}</p>);
  s.questions.forEach((q, i) => {
    push(
      "note",
      `ko-quiz${i}`,
      <div className="par-ws-block">
        <span style={{ fontWeight: 700 }}>{`${q.no}. `}</span>
        <span style={{ color: "#64748b", fontSize: "0.9em" }}>[{q.format}]</span>{" "}
        <Field as="span" editable={editable} value={q.prompt} onCommit={(v) => upd(i, { prompt: v })} />
        {q.format === "단답" ? <span style={{ color: "#94a3b8" }}> (답: ______________ )</span> : <span style={{ color: "#94a3b8" }}> ( O / X )</span>}
      </div>,
    );
  });

  // 정답·해설 — 학생 표면 미노출 게이트: hiddenAnswers(기본 true)면 절대 렌더하지 않는다.
  if (editable) {
    push(
      "note",
      "ko-quiz-toggle",
      <button
        type="button"
        className="par-note"
        style={{ cursor: "pointer", border: "1px dashed #cbd5e1", borderRadius: 6, padding: "2px 8px", background: "transparent" }}
        onClick={() => patch({ hiddenAnswers: !s.hiddenAnswers })}
      >
        {s.hiddenAnswers ? "확인 문제 정답 표시 (교사용)" : "확인 문제 정답 숨기기 (학생 배포용)"}
      </button>,
    );
  }
  if (s.hiddenAnswers === false) {
    push(
      "note",
      "ko-quiz-ans",
      <div className="par-ws-block par-ws-answer-subsection">
        <MiniHead k="확인 문제 정답 (교사용)" e="Answer Key" />
        <table className="par-ws-key-table">
          <tbody>
            {s.questions.map((q, i) => (
              <tr key={i}>
                <td>{q.no}</td>
                <td>
                  <Field as="span" editable={editable} value={q.answer} onCommit={(v) => upd(i, { answer: v })} />
                </td>
                <td>
                  <Field as="span" editable={editable} value={q.explanation ?? ""} onCommit={(v) => upd(i, { explanation: v })} placeholder="—" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>,
    );
  }
}

/** KO 섹션 디스패처 — section-flow.tsx 의 KO 게이트가 위임 호출. */
export function koSectionFlowItems(section: KoAnalysisSection, ctx: SectionFlowCtx): void {
  switch (section.kind) {
    case "ko-passage":
      koPassageFlow(section, ctx);
      break;
    case "ko-overview":
      koOverviewFlow(section, ctx);
      break;
    case "ko-paragraph":
      koParagraphFlow(section, ctx);
      break;
    case "ko-concept-vocab":
      koConceptVocabFlow(section, ctx);
      break;
    case "ko-structure":
      koStructureFlow(section, ctx);
      break;
    case "ko-literary-device":
      koLiteraryDeviceFlow(section, ctx);
      break;
    case "ko-speaker":
      koSpeakerFlow(section, ctx);
      break;
    case "ko-exam-points":
      koExamPointsFlow(section, ctx);
      break;
    case "ko-check-quiz":
      koCheckQuizFlow(section, ctx);
      break;
  }
}
