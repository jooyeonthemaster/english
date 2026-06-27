import { type ReactNode } from "react";
import { type WorksheetWordOrder, formatSummaryPairText, isSummaryPairWorksheetType, normalizeStudentFacingMarkup } from "@/lib/passage-report/analysis-report/worksheet-surface";
import type { LearningWorksheetSection, WorksheetQuestionPatch, WorksheetQuestionView } from "./types";
import { Field, renderStudentFacingText } from "./editable-field";

export function WorksheetMiniTitle({ title, kicker }: { title: string; kicker?: string }) {
  return (
    <div className="par-ws-minihead">
      <span className="par-ws-minihead-k">{title}</span>
      {kicker ? <span className="par-ws-minihead-e">{kicker}</span> : null}
    </div>
  );
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
          {withTitle ? <WorksheetMiniTitle title="정답 및 해설" kicker="Answer Key" /> : null}
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
      <WorksheetMiniTitle title="지문 논리 구조 분석" kicker="Logic Map" />
      <table className="par-ws-logic">
        <thead>
          <tr>
            <th>문장</th>
            <th>기능</th>
            <th>핵심 내용</th>
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
