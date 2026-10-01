import { Fragment, type CSSProperties, type ReactNode } from "react";
import type { ForecastQBody, ForecastQType } from "@/lib/exam-forecast/types";
import { markupToPlain, renderInline, splitParagraphs } from "./markup";

// 문항 블록 — 위(발문·상자·지문)와 아래(선지·답란) 두 부분으로 나눠 그린다.
// 조판기는 통째로 안 들어가는 문항의 아래 부분만 다음 단으로 넘긴다(기출 7·19·26번).

const CIRCLED = ["①", "②", "③", "④", "⑤", "⑥"];

export interface PaperHeader {
  gradeLabel: string;
  schoolLine: string;
  subjectLine: string;
  dateLine: string;
  /** 「본 시험은 선택형 27문항, 논술형 3문항이며 쪽수는 {PAGES}쪽입니다.」 — {PAGES} 는 조판 뒤 채운다 */
  countLine?: string;
}

export interface PaperItem {
  key: string;
  /** 선택형 번호 — 논술형이면 null */
  number: number | null;
  essayNo: number | null;
  points: number | null;
  qtype: ForecastQType;
  body: ForecastQBody;
  /** 이 문항 위에 찍을 구획 머리(문제집: 지문 제목 등) */
  section?: { title: string; sub?: string } | null;
}

/** 배점 표기 — 기출은 〔2.5점〕 (U+3014/3015) */
export function formatPoints(points: number | null | undefined): string {
  if (points == null) return "";
  const s = Number.isInteger(points) ? String(points) : points.toFixed(1);
  return `〔${s}점〕`;
}

function hasHangul(s: string) {
  return /[가-힣]/.test(s);
}

function Paragraphs({ src, flat }: { src: string; flat?: boolean }) {
  return (
    <>
      {splitParagraphs(src).map((p, i) => (
        <p key={i} className={`fcp-p${flat ? " fcp-noindent" : ""}`}>
          {renderInline(p, `p${i}`)}
        </p>
      ))}
    </>
  );
}

/** 유형별 빈칸 폭(mm) — 기출 실측: 연결어 13 · 요약 11.5 · 단일 빈칸 46 · (A)(B) 34/24 · 논술형 45 */
function blankVars(qtype: ForecastQType): CSSProperties {
  const v = (w: Record<string, string>) => w as CSSProperties;
  switch (qtype) {
    case "CONNECTIVE_ABC":
      return v({ "--fcp-blank-w": "13mm" });
    case "SUMMARY":
      return v({ "--fcp-blank-w": "11.5mm" });
    case "BLANK_AB":
      return v({ "--fcp-blank-a": "34mm", "--fcp-blank-b": "24mm" });
    case "ESSAY_SUMMARY_ARRANGE":
      return v({ "--fcp-blank-w": "56mm" });
    case "ESSAY_BLANK_ARRANGE_FIX":
      return v({ "--fcp-blank-a": "36mm", "--fcp-blank-b": "26mm" });
    default:
      return v({ "--fcp-blank-w": "46mm" });
  }
}

export interface PartProps {
  item: PaperItem;
  /** 묶음 지시문을 이 문항 앞에 찍을 때 범위(예 "10~11") */
  groupRange?: string | null;
  /** 묶음의 일원 — 발문 대신 「번호. 〔배점〕」만 */
  inGroup?: boolean;
  /** 배점이 줄을 넘겨 오른쪽 정렬로 떨어져야 하는가(측정 단계가 정한다) */
  wrapPoints?: boolean;
}

export function QuestionHead({ item, groupRange, inGroup, wrapPoints }: PartProps) {
  const { body, qtype, number, essayNo, points } = item;
  const isEssay = essayNo != null;
  const pts = points != null ? <span className={`fcp-pts${wrapPoints ? " fcp-pts-wrap" : ""}`}>{renderInline(formatPoints(points), "pt")}</span> : null;
  const boxes = body.boxes ?? [];
  return (
    <div className="fcp-part fcp-headpart" style={blankVars(qtype)} data-q={number ?? `S${essayNo}`}>
      {item.section ? (
        <div className="fcp-section">
          {item.section.title}
          {item.section.sub ? <small> · {item.section.sub}</small> : null}
        </div>
      ) : null}
      {groupRange && body.groupStem ? (
        <div className="fcp-group">
          {renderInline(`〔${groupRange}〕`, "gr")} {renderInline(body.groupStem, "g")}
        </div>
      ) : null}
      {isEssay ? (
        <>
          <div className="fcp-essay-label">{renderInline(`〔 논술형 ${essayNo} 〕`, "el")}</div>
          <div className="fcp-essay-stem fcp-stem-box">
            <span className="fcp-stem-t">{renderInline(body.stem, "es")}</span> {pts}
          </div>
        </>
      ) : (
        <div className="fcp-stem fcp-stem-box">
          <span className="fcp-num">{number}.</span>
          <span className="fcp-stem-t">
            {inGroup ? null : <>{renderInline(body.stem, "st")} </>}
            {pts}
          </span>
        </div>
      )}
      {body.givenBox ? (
        <div className="fcp-box fcp-box-given">
          <Paragraphs src={body.givenBox} />
        </div>
      ) : null}
      {body.passage ? (
        <div className={`fcp-passage${qtype === "ORDER" ? " fcp-order" : ""}`}>
          <Paragraphs src={body.passage} />
        </div>
      ) : null}
      {body.summaryBox ? (
        <>
          <div className="fcp-arrow">↓</div>
          <div className="fcp-box fcp-summary">
            <Paragraphs src={body.summaryBox} />
          </div>
        </>
      ) : null}
      {boxes.map((b, i) => {
        const ko = hasHangul(b.text);
        const cls = ["fcp-box", "fcp-box-flat"];
        if (b.align === "center") cls.push("fcp-box-center");
        if (ko) cls.push("fcp-box-ko");
        if (i > 0 || body.passage) cls.push("fcp-box-gap");
        return (
          <div key={i}>
            {i === 0 && isEssay && b.label === "해석" ? <div className="fcp-arrow">↓</div> : null}
            <div className={cls.join(" ")}>
              <div className="fcp-box-title">[ {b.label} ]</div>
              {b.label === "보기" && !ko ? <ChunkFlow src={b.text} keyBase={`bx${i}`} /> : <Paragraphs src={b.text} flat />}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** 〔보기〕 청크 — 작성자가 넣은 줄바꿈 대신 청크 경계에서만 줄을 바꾸고 줄 길이를 고르게(청크 하나만 남는 줄 방지) */
function ChunkFlow({ src, keyBase }: { src: string; keyBase: string }) {
  const chunks = src.split(/\n|,\s*/).map((c) => c.trim()).filter(Boolean);
  return (
    <div className="fcp-p fcp-chunks">
      {chunks.map((c, k) => (
        <Fragment key={k}>
          <span className="fcp-chunk">
            {renderInline(c, `${keyBase}-${k}`)}
            {k < chunks.length - 1 ? "," : ""}
          </span>
          {k < chunks.length - 1 ? " " : null}
        </Fragment>
      ))}
    </div>
  );
}

function optionNodes(body: ForecastQBody): ReactNode {
  const layout = body.optionLayout ?? "list";
  if (layout === "table" && body.optionTable) {
    const { headers, rows } = body.optionTable;
    const n = headers.length;
    // 내용 열 너비 = 열마다 가장 긴 칸의 글자 수에 비례. 점(···) 열은 좁게 — 넓으면 「For example」 같은 연결어가 꺾인다
    const dot = n >= 3 ? 5.5 : 8;
    const longest = headers.map((h, c) => Math.max(6, h.length, ...rows.map((row) => markupToPlain(row[c] ?? "").length)));
    const sum = longest.reduce((a, b) => a + b, 0);
    const widths = longest.map((l) => ((100 - 5 - dot * (n - 1)) * l) / sum);
    return (
      <table className="fcp-table">
        <colgroup>
          <col style={{ width: "5%" }} />
          {headers.map((_, i) =>
            i < n - 1
              ? [<col key={`c${i}`} style={{ width: `${widths[i].toFixed(2)}%` }} />, <col key={`d${i}`} style={{ width: `${dot}%` }} />]
              : <col key={`c${i}`} style={{ width: `${widths[i].toFixed(2)}%` }} />,
          )}
        </colgroup>
        <thead>
          <tr>
            <th />
            {headers.map((h, i) => (
              <th key={i} colSpan={i < n - 1 ? 2 : 1}>
                <span style={{ paddingLeft: "1.2em" }}>{h}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => (
            <tr key={r}>
              <td className="fcp-tn">{CIRCLED[r]}</td>
              {row.map((cell, c) => [
                <td key={`c${c}`}>{renderInline(cell, `t${r}-${c}`)}</td>,
                c < row.length - 1 ? (
                  <td key={`d${c}`} className="fcp-tdot">
                    ···
                  </td>
                ) : null,
              ])}
            </tr>
          ))}
        </tbody>
      </table>
    );
  }
  const opts = body.options ?? [];
  if (opts.length === 0) return null;
  const row = (o: string, i: number, inner?: ReactNode) => (
    <div key={i} className="fcp-opt">
      <span className="fcp-opt-n">{CIRCLED[i]}</span>
      <span className="fcp-opt-t">{inner ?? renderInline(o, `o${i}`)}</span>
    </div>
  );
  if (layout === "grid2" || layout === "grid3") return <div className={layout === "grid2" ? "fcp-grid2" : "fcp-grid3"}>{opts.map((o, i) => row(o, i))}</div>;
  if (layout === "stack") {
    return (
      <div>
        {opts.map((o, i) =>
          row(
            o,
            i,
            o.split("\n").map((line, j) => {
              const m = line.match(/^(\([A-Z]\))\s*([\s\S]*)$/);
              return (
                <span key={j} className="fcp-stack-line">
                  <span>{m ? m[1] : ""}</span>
                  <span style={{ flex: 1 }}>{renderInline(m ? m[2] : line, `s${i}-${j}`)}</span>
                </span>
              );
            }),
          ),
        )}
      </div>
    );
  }
  return <div className={opts.some(hasHangul) ? "fcp-opts-ko" : undefined}>{opts.map((o, i) => row(o, i))}</div>;
}

/** 아래 부분이 있는가(선지·표·답란) */
export function hasTail(item: PaperItem): boolean {
  const b = item.body;
  if (item.essayNo != null) return true;
  return Boolean((b.optionLayout === "table" && b.optionTable) || (b.options && b.options.length));
}

export function QuestionTail({ item, atTop }: { item: PaperItem; atTop?: boolean }) {
  const { body } = item;
  const isEssay = item.essayNo != null;
  if (!hasTail(item)) return null;
  const tight = body.optionLayout === "table" || body.optionLayout === "grid2" || body.optionLayout === "grid3";
  const lines = body.answerLines && body.answerLines.length ? body.answerLines : [{ label: "", points: item.points ?? undefined }];
  return (
    <div className={`fcp-part fcp-tail${tight ? " fcp-tail-tight" : ""}${atTop ? " fcp-tail-top" : ""}`}>
      {optionNodes(body)}
      {isEssay
        ? lines.map((l, i) => (
            <div key={i} className="fcp-answer-line">
              {l.label ? <span className="fcp-al-label">{l.label}</span> : null}
              <span className="fcp-al-rule" />
              {l.points != null ? <span className="fcp-al-pts">{lines.length > 1 ? `(${l.points}점)` : renderInline(formatPoints(l.points), `al${i}`)}</span> : null}
            </div>
          ))
        : null}
    </div>
  );
}

/** 통짜 블록(화면 카드용) */
export function QuestionBlock(props: PartProps) {
  return (
    <div>
      <QuestionHead {...props} />
      <QuestionTail item={props.item} />
    </div>
  );
}
