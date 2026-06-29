import { type ReactNode } from "react";
import { type WorksheetWordOrder, formatSummaryPairText, isSummaryPairWorksheetType, normalizeStudentFacingMarkup } from "@/lib/passage-report/analysis-report/worksheet-surface";
import type { LearningWorksheetSection, WorksheetQuestionPatch, WorksheetQuestionView } from "./types";
import { Field, renderStudentFacingText } from "./editable-field";

/**
 * 섹션 미니 타이틀(par-ws-minihead) — 한글 제목(k) + 영문 라벨(e).
 * editable + onTitleCommit/onKickerCommit 가 주어지면 인라인 편집 필드로 렌더한다.
 * (편집 핸들러가 없는 호출부는 기존처럼 정적 텍스트로 표시 — 무회귀)
 */
export function WorksheetMiniTitle({
  title,
  kicker,
  editable,
  onTitleCommit,
  onKickerCommit,
}: {
  title: string;
  kicker?: string;
  editable?: boolean;
  onTitleCommit?: (v: string) => void;
  onKickerCommit?: (v: string) => void;
}) {
  const editTitle = editable && !!onTitleCommit;
  const editKicker = editable && !!onKickerCommit;
  return (
    <div className="par-ws-minihead">
      {editTitle ? (
        <Field as="span" className="par-ws-minihead-k" editable value={title} onCommit={onTitleCommit!} placeholder="섹션 제목" />
      ) : (
        <span className="par-ws-minihead-k">{title}</span>
      )}
      {editKicker ? (
        <Field as="span" className="par-ws-minihead-e" editable value={kicker ?? ""} onCommit={onKickerCommit!} placeholder="영문 라벨" />
      ) : kicker ? (
        <span className="par-ws-minihead-e">{kicker}</span>
      ) : null}
    </div>
  );
}

/**
 * 미니 타이틀 슬롯 오버라이드 → WorksheetMiniTitle props.
 * - 영문 라벨(e)은 항상 titleOverrides[slot].e 로 편집(하드코딩 키커도 편집 가능).
 * - 한글 제목(k)은 스키마 필드가 있으면(onTitleCommitField) 그 필드로 직접 커밋(정답지와 일관),
 *   없으면(하드코딩 제목) titleOverrides[slot].k 로 편집.
 */
export function miniHeadProps(
  section: LearningWorksheetSection,
  onPatch: (p: Partial<LearningWorksheetSection>) => void,
  editable: boolean,
  slot: string,
  defaultTitle: string,
  defaultKicker?: string,
  onTitleCommitField?: (v: string) => void,
): {
  title: string;
  kicker?: string;
  editable: boolean;
  onTitleCommit: (v: string) => void;
  onKickerCommit: (v: string) => void;
} {
  const ov = section.titleOverrides?.[slot];
  const setOv = (key: "k" | "e", v: string) =>
    onPatch({
      titleOverrides: {
        ...(section.titleOverrides ?? {}),
        [slot]: { ...(section.titleOverrides?.[slot] ?? {}), [key]: v },
      },
    });
  return {
    title: onTitleCommitField ? defaultTitle : ov?.k ?? defaultTitle,
    kicker: ov?.e ?? defaultKicker,
    editable,
    onTitleCommit: onTitleCommitField ?? ((v: string) => setOv("k", v)),
    onKickerCommit: (v: string) => setOv("e", v),
  };
}

/**
 * titleOverrides[slot].k 로 백업되는 단일 라벨(영문 키커 없는 par-ws-drill-label·표 헤더 등).
 * editable 면 인라인 Field, 아니면 정적 엘리먼트(무회귀). as 로 div/th/span 선택.
 */
export function EditableSectionLabel({
  section,
  onPatch,
  editable,
  slot,
  defaultText,
  as = "div",
  className,
}: {
  section: LearningWorksheetSection;
  onPatch: (p: Partial<LearningWorksheetSection>) => void;
  editable: boolean;
  slot: string;
  defaultText: string;
  as?: "div" | "th" | "span";
  className?: string;
}) {
  const value = section.titleOverrides?.[slot]?.k ?? defaultText;
  if (editable) {
    return (
      <Field
        as={as}
        className={["par-no-fontrun", className].filter(Boolean).join(" ")}
        editable
        value={value}
        onCommit={(v) =>
          onPatch({
            titleOverrides: {
              ...(section.titleOverrides ?? {}),
              [slot]: { ...(section.titleOverrides?.[slot] ?? {}), k: v },
            },
          })
        }
      />
    );
  }
  const Tag = as;
  return <Tag className={className}>{value}</Tag>;
}

export function WordBank({ words }: { words?: string[] }) {
  if (!words || words.length === 0) return null;
  return (
    <div className="par-ws-wordbank">
      <span className="par-ws-wordbank-k">단어 목록</span>
      <span className="par-ws-wordbank-list">{words.join(" · ")}</span>
    </div>
  );
}

export function WorksheetQuestionCard({
  q,
  editable,
  hiddenAnswers,
  onPatch,
}: {
  q: WorksheetQuestionView;
  editable: boolean;
  hiddenAnswers?: boolean;
  onPatch: (patch: WorksheetQuestionPatch) => void;
}) {
  const displayType = "typeLabel" in q && q.typeLabel ? q.typeLabel : q.type;
  const isSummaryPair = isSummaryPairWorksheetType(q.type, "typeLabel" in q ? q.typeLabel : undefined);
  const choiceText = (text: string) =>
    normalizeStudentFacingMarkup(isSummaryPair ? formatSummaryPairText(text) : text);
  const promptValue = normalizeStudentFacingMarkup(q.prompt);
  const passageValue = q.passage ? normalizeStudentFacingMarkup(q.passage) : "";
  return (
    <div className="par-ws-question">
      <div className="par-ws-qtop">
        <span className="par-ws-qno">Q{q.no}</span>
        <Field
          as="span"
          className="par-ws-qtype"
          editable={editable}
          value={displayType}
          onCommit={(v) => onPatch("typeLabel" in q ? { typeLabel: v } : { type: v })}
        />
      </div>
      <Field
        as="div"
        className="par-ws-qprompt"
        editable={editable}
        value={promptValue}
        onCommit={(v) => onPatch({ prompt: normalizeStudentFacingMarkup(v) })}
        render={renderStudentFacingText}
      />
      {q.passage ? (
        <Field
          as="div"
          className="par-ws-qpassage"
          editable={editable}
          value={passageValue}
          onCommit={(v) => onPatch({ passage: normalizeStudentFacingMarkup(v) })}
          render={renderStudentFacingText}
        />
      ) : null}
      <ol className="par-ws-choices">
        {q.choices.map((choice, i) => (
          <li key={`${choice.label}-${i}`}>
            <span className="par-ws-choice-label">{choice.label}</span>
            <Field
              as="span"
              editable={editable}
              value={choiceText(choice.text)}
              render={renderStudentFacingText}
              onCommit={(v) =>
                onPatch({
                  choices: q.choices.map((item, j) => (i === j ? { ...item, text: normalizeStudentFacingMarkup(v) } : item)),
                })
              }
            />
          </li>
        ))}
      </ol>
      {!hiddenAnswers ? (
        <div className="par-ws-answer">
          <div className="par-ws-answer-main">
            <span className="par-ws-answer-label">정답</span>
            <Field as="span" editable={editable} value={q.answerLabel} onCommit={(v) => onPatch({ answerLabel: v })} />
            {q.answerText ? (
              <Field as="span" className="par-ws-answer-text" editable={editable} value={isSummaryPair ? formatSummaryPairText(q.answerText) : q.answerText} onCommit={(v) => onPatch({ answerText: v })} />
            ) : null}
          </div>
          <Field as="div" className="par-ws-expl" editable={editable} value={q.explanation} onCommit={(v) => onPatch({ explanation: v })} />
          {q.distractors?.length ? (
            <table className="par-ws-distractors">
              <tbody>
                {q.distractors.map((d, i) => (
                  <tr key={`${d.label}-${i}`}>
                    <td>{d.label}</td>
                    <td>{d.type}</td>
                    <td>
                      <Field
                        as="span"
                        editable={editable}
                        value={d.reason}
                        onCommit={(v) =>
                          onPatch({
                            distractors: q.distractors?.map((item, j) => (i === j ? { ...item, reason: v } : item)),
                          })
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

// ─── 타이틀/메타 ──────────────────────────────────────────────────────────────
function AnswerText({ children }: { children: ReactNode }) {
  return <span className="par-ws-answer-text">{children}</span>;
}

function WorksheetQuestionAnswer({ q }: { q: WorksheetQuestionView }) {
  return (
    <div className="par-ws-answer">
      <div className="par-ws-answer-main">
        <span className="par-ws-answer-label">Q{q.no}</span>
        <b>{q.answerLabel}</b>
        {q.answerText ? (
          <AnswerText>
            {isSummaryPairWorksheetType(q.type, "typeLabel" in q ? q.typeLabel : undefined)
              ? formatSummaryPairText(q.answerText)
              : q.answerText}
          </AnswerText>
        ) : null}
      </div>
      <div className="par-ws-expl">{q.explanation}</div>
      {q.distractors?.length ? (
        <table className="par-ws-distractors">
          <tbody>
            {q.distractors.map((d, i) => (
              <tr key={`${d.label}-${i}`}>
                <td>{d.label}</td>
                <td>{d.type}</td>
                <td>{d.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </div>
  );
}

/**
 * 정답·해설을 "서브섹션별 독립 블록"으로 빌드한다.
 * 과거엔 전체 정답키를 하나의 .par-ws-block(break-inside:avoid)으로 push 했는데,
 * 정답키가 한 페이지(250mm)를 넘기면 .par-sheet{overflow:hidden} 에 의해 잘려 보이던 문제.
 * 각 표/문항을 별도 블록으로 내보내면 페이지네이터가 자연스럽게 여러 장에 흘려 담는다.
 */
export function worksheetAnswerKeySubsections(
  section: LearningWorksheetSection,
  wordOrders: WorksheetWordOrder[],
  editable?: boolean,
  onPatch?: (p: Partial<LearningWorksheetSection>) => void,
): { key: string; node: ReactNode }[] {
  const workbook = section.workbookSet;
  const clozeItems = section.cloze?.items ?? [];
  const practiceItems = section.practice?.items ?? [];
  const drillGrammarChoices = section.drills?.grammarChoices ?? [];
  const inferenceQuestions = section.inferenceSet?.questions ?? [];
  const extraQuestions = section.questions ?? [];

  const subs: { key: string; node: ReactNode }[] = [];
  // "정답 및 해설" 헤더는 첫 번째 블록에만 붙여 고아 헤더(페이지 하단에 제목만 남는 것)를 막는다.
  const wrap = (key: string, inner: ReactNode) => {
    const withTitle = subs.length === 0;
    subs.push({
      key,
      node: (
        <div className="par-ws-block par-ws-answer-key">
          {withTitle ? (
            onPatch ? (
              <WorksheetMiniTitle {...miniHeadProps(section, onPatch, !!editable, "ws-answer-key", "정답 및 해설", "Answer Key")} />
            ) : (
              <WorksheetMiniTitle title="정답 및 해설" kicker="Answer Key" />
            )
          ) : null}
          {inner}
        </div>
      ),
    });
  };

  if (clozeItems.length) {
    wrap(
      "cloze",
      <div className="par-ws-answer-subsection">
        <div className="par-ws-drill-label">{section.cloze?.title ?? "Key Phrase Cloze"}</div>
        <table className="par-ws-key-table">
          <tbody>
            {clozeItems.map((item) => (
              <tr key={item.no}>
                <td>{item.no}</td>
                <td>{item.answers.join(", ")}</td>
                <td>{item.translation ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>,
    );
  }

  if (practiceItems.length) {
    wrap(
      "practice",
      <div className="par-ws-answer-subsection">
        <div className="par-ws-drill-label">{section.practice?.title ?? "Practice"}</div>
        <table className="par-ws-key-table">
          <tbody>
            {practiceItems.map((item) => (
              <tr key={item.no}>
                <td>{item.no}</td>
                <td>{item.answers.join(", ")}</td>
                <td>{item.sentenceNo ? `S${item.sentenceNo}` : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>,
    );
  }

  if (drillGrammarChoices.length) {
    wrap(
      "drill-grammar",
      <div className="par-ws-answer-subsection">
        <div className="par-ws-drill-label">어법 선택</div>
        <table className="par-ws-key-table">
          <tbody>
            {drillGrammarChoices.map((item) => (
              <tr key={item.no}>
                <td>{item.no}</td>
                <td>{item.answer}</td>
                <td>{item.explanation}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>,
    );
  }

  if (workbook) {
    wrap(
      "workbook-grammar",
      <div className="par-ws-answer-subsection">
        <div className="par-ws-drill-label">{workbook.grammarSelection.title}</div>
        <table className="par-ws-key-table">
          <tbody>
            {workbook.grammarSelection.choices.map((choice) => (
              <tr key={choice.no}>
                <td>{choice.no}</td>
                <td>{choice.answer}</td>
                <td>{choice.explanation}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>,
    );
    wrap(
      "workbook-vocab",
      <div className="par-ws-answer-subsection">
        <div className="par-ws-drill-label">{workbook.vocabularyCloze.title}</div>
        <table className="par-ws-key-table">
          <tbody>
            {workbook.vocabularyCloze.blanks.map((blank) => (
              <tr key={blank.no}>
                <td>{blank.no}</td>
                <td>{blank.answer}</td>
                <td>{[blank.meaning, blank.clue].filter(Boolean).join(" / ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>,
    );
  }

  if (wordOrders.length) {
    wrap(
      "word-order",
      <div className="par-ws-answer-subsection">
        <div className="par-ws-drill-label">주요문장 단어배열 영작</div>
        <table className="par-ws-key-table">
          <tbody>
            {wordOrders.map((item) => (
              <tr key={item.no}>
                <td>{item.no}</td>
                <td>{item.answer}</td>
                <td>{item.korean}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>,
    );
  }

  // 문항별 정답·해설은 '각각' 독립 블록으로 내보낸다. 예전엔 전 문항(추론 Q1~Q5 +
  // 추가 문항)을 하나의 break-inside:avoid 블록으로 묶어, 5문항+오답표가 한 페이지(250mm)를
  // 넘기면 마지막 장이 .par-sheet{overflow:hidden} 에 잘려 보이던 문제. 문항 단위로 쪼개면
  // 페이지네이터가 여러 장에 자연스럽게 흘려 담아 잘림이 사라진다.
  inferenceQuestions.forEach((q) =>
    wrap(`q-inf-${q.no}`, <div className="par-ws-answer-subsection"><WorksheetQuestionAnswer q={q} /></div>),
  );
  extraQuestions.forEach((q) =>
    wrap(`q-extra-${q.no}`, <div className="par-ws-answer-subsection"><WorksheetQuestionAnswer q={q} /></div>),
  );

  return subs;
}

export function WorksheetLogicMapBlock({
  section,
  editable,
  onPatch,
}: {
  section: LearningWorksheetSection;
  editable: boolean;
  onPatch: (patch: Partial<LearningWorksheetSection>) => void;
}) {
  if (!section.logicRows.length) return null;
  return (
    <div className="par-ws-block par-ws-logic-promoted">
      <WorksheetMiniTitle {...miniHeadProps(section, onPatch, editable, "ws-logic", "지문 논리 구조 분석", "Logic Map")} />
      <table className="par-ws-logic">
        <thead>
          <tr>
            <EditableSectionLabel section={section} onPatch={onPatch} editable={editable} slot="ws-logic-col-sentence" defaultText="문장" as="th" />
            <EditableSectionLabel section={section} onPatch={onPatch} editable={editable} slot="ws-logic-col-function" defaultText="기능" as="th" />
            <EditableSectionLabel section={section} onPatch={onPatch} editable={editable} slot="ws-logic-col-keypoint" defaultText="핵심 내용" as="th" />
          </tr>
        </thead>
        <tbody>
          {section.logicRows.map((row, i) => (
            <tr key={i}>
              <td>{row.sentenceNo ? `S${row.sentenceNo}` : "-"}</td>
              <td>
                <Field
                  as="span"
                  editable={editable}
                  value={row.functionLabel}
                  onCommit={(v) => onPatch({ logicRows: section.logicRows.map((item, j) => (i === j ? { ...item, functionLabel: v } : item)) })}
                />
              </td>
              <td>
                <Field
                  as="span"
                  editable={editable}
                  value={row.keyPoint}
                  onCommit={(v) => onPatch({ logicRows: section.logicRows.map((item, j) => (i === j ? { ...item, keyPoint: v } : item)) })}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
