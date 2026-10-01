import { FORECAST_BLOCK_CSS, FORECAST_FLOW_CSS } from "./paper-css";
import { renderInline, splitParagraphs } from "./markup";

export interface AnswerItem {
  key: string;
  /** "1".."27" · "논술형 1" */
  label: string;
  answer: string;
  points: number | null;
  typeLabel: string;
  sourceLabel: string;
  explanation: string;
  /** 출제 예측 근거(교사용) — 비우면 생략 */
  rationale?: string;
}

/** 정답·해설지 — 2단 흐름(브라우저가 쪽을 나눈다). 맨 앞에 선택형 정답표. */
export function ForecastAnswerSheet({ title, items }: { title: string; items: AnswerItem[] }) {
  const mc = items.filter((it) => /^\d+$/.test(it.label));
  const rows: AnswerItem[][] = [];
  for (let i = 0; i < mc.length; i += 10) rows.push(mc.slice(i, i + 10));
  return (
    <div className="fcp-root fcp-flow-screen">
      <style dangerouslySetInnerHTML={{ __html: FORECAST_BLOCK_CSS + FORECAST_FLOW_CSS }} />
      <div className="fcp-flow-frame" aria-hidden />
      <div className="fcp-flow">
        <div className="fcp-flow-head">{title}</div>
        <div style={{ columnSpan: "all", marginBottom: "3mm" }}>
          {rows.map((row, r) => (
            <table key={r} className="fcp-key-table">
              <thead>
                <tr>
                  {row.map((it) => (
                    <th key={it.key}>{it.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  {row.map((it) => (
                    <td key={it.key}>{it.answer}</td>
                  ))}
                </tr>
              </tbody>
            </table>
          ))}
        </div>
        {items.map((it) => {
          const short = it.answer.length <= 2;
          return (
            <div key={it.key} className="fcp-expl">
              <div>
                <b>
                  {/^\d+$/.test(it.label) ? `${it.label}.` : `〔${it.label}〕`} {short ? `정답 ${it.answer}` : ""}
                </b>{" "}
                <span style={{ fontSize: "8.1pt" }}>
                  [{it.typeLabel}] {it.sourceLabel}
                  {it.points != null ? ` · ${it.points}점` : ""}
                </span>
              </div>
              {!short ? (
                <div style={{ margin: "0.5mm 0", fontFamily: "var(--fcp-serif)", fontSize: "9.4pt" }}>
                  <b>모범답안</b> {renderInline(it.answer, `a-${it.key}`)}
                </div>
              ) : null}
              {splitParagraphs(it.explanation).map((p, i) => (
                <div key={i}>{renderInline(p, `e-${it.key}-${i}`)}</div>
              ))}
              {it.rationale ? (
                <div style={{ marginTop: "0.5mm", fontSize: "8.1pt", color: "#333" }}>
                  <b>출제 예측</b> {renderInline(it.rationale, `r-${it.key}`)}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
