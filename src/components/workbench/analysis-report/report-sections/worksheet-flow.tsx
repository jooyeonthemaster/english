import type { AnalysisSection } from "@/lib/passage-report/analysis-report/schema";
import { getConsolidatedWordOrders, toStudentVocabularyClozePassage, worksheetAnswersAreHidden } from "@/lib/passage-report/analysis-report/worksheet-surface";
import { Field, renderGrammarChoiceText } from "./editable-field";
import type { LearningWorksheetSection, SectionFlowCtx } from "./types";
import { WordBank, WorksheetLogicMapBlock, WorksheetMiniTitle, WorksheetQuestionCard, worksheetAnswerKeySubsections } from "./worksheet";

export function worksheetSectionFlow(section: Extract<AnalysisSection, { kind: "learning-worksheet" }>, ctx: SectionFlowCtx): void {
  const { editable, commit, push, options } = ctx;
const s = section;
      const patch = (p: Partial<LearningWorksheetSection>) => commit({ ...s, ...p });
      const workbookSet = s.workbookSet;
      const consolidatedWordOrders = getConsolidatedWordOrders(s);
      const showDrillWordOrders = !workbookSet && !!s.drills?.wordOrders?.length;
      const showAnswerKey = !worksheetAnswersAreHidden(s);
      push(
        "note",
        "ws-title",
        <div className="par-ws-title">
          <Field as="div" className="par-ws-title-k" editable={editable} value={s.title} onCommit={(v) => patch({ title: v })} />
          {s.note ? <Field as="div" className="par-ws-note" editable={editable} value={s.note} onCommit={(v) => patch({ note: v })} /> : null}
        </div>,
      );
      if (!options?.skipWorksheetLogic) {
        push(
          "note",
          "ws-logic",
          <WorksheetLogicMapBlock section={s} editable={editable} onPatch={patch} />,
        );
      }
      if (s.cloze) {
        push(
          "note",
          "ws-cloze",
          <div className="par-ws-block">
            <WorksheetMiniTitle title={s.cloze.title} kicker="Key Phrase Cloze" />
            <div className="par-ws-cloze-list">
              {s.cloze.items.map((item, i) => (
                <div className="par-ws-cloze" key={item.no}>
                  <div className="par-ws-cloze-en">
                    <span className="par-ws-cloze-no">({item.no})</span>
                    <Field
                      as="span"
                      editable={editable}
                      value={item.text}
                      onCommit={(v) =>
                        s.cloze &&
                        patch({
                          cloze: { ...s.cloze, items: s.cloze.items.map((entry, j) => (i === j ? { ...entry, text: v } : entry)) },
                        })
                      }
                    />
                  </div>
                  {item.translation ? (
                    <Field
                      as="div"
                      className="par-ws-cloze-ko"
                      editable={editable}
                      value={item.translation}
                      onCommit={(v) =>
                        s.cloze &&
                        patch({
                          cloze: { ...s.cloze, items: s.cloze.items.map((entry, j) => (i === j ? { ...entry, translation: v } : entry)) },
                        })
                      }
                    />
                  ) : null}
                </div>
              ))}
            </div>
            <WordBank words={s.cloze.wordBank} />
          </div>,
        );
      }
      if (s.practice) {
        push(
          "note",
          "ws-practice",
          <div className="par-ws-block">
            <WorksheetMiniTitle title={s.practice.title} kicker="No Translation" />
            <div className="par-ws-practice-list">
              {s.practice.items.map((item, i) => (
                <div className="par-ws-practice" key={item.no}>
                  <span className="par-ws-cloze-no">({item.no})</span>
                  <Field
                    as="span"
                    editable={editable}
                    value={item.text}
                    onCommit={(v) =>
                      s.practice &&
                      patch({
                        practice: { ...s.practice, items: s.practice.items.map((entry, j) => (i === j ? { ...entry, text: v } : entry)) },
                      })
                    }
                  />
                </div>
              ))}
            </div>
            <WordBank words={s.practice.wordBank} />
          </div>,
        );
      }
      if (s.drills?.grammarChoices?.length || showDrillWordOrders) {
        push(
          "note",
          "ws-drills",
          <div className="par-ws-block">
            <WorksheetMiniTitle title="어법 선택 · 단어배열 영작" kicker="Workbook Drills" />
            {s.drills?.grammarChoices?.length ? (
              <div className="par-ws-drill-set">
                <div className="par-ws-drill-label">어법 선택</div>
                {s.drills.grammarChoices.map((item, i) => (
                  <div className="par-ws-grammar-choice" key={item.no}>
                    <div className="par-ws-drill-line">
                      <span className="par-ws-cloze-no">{item.no}.</span>
                      {editable ? (
                        <Field
                          as="span"
                          editable
                          value={item.text}
                          onCommit={(v) =>
                            patch({
                              drills: {
                                ...s.drills,
                                grammarChoices: s.drills?.grammarChoices?.map((entry, j) => (i === j ? { ...entry, text: v } : entry)),
                              },
                            })
                          }
                        />
                      ) : (
                        <span>{renderGrammarChoiceText(item.text)}</span>
                      )}
                    </div>
                    <div className="par-ws-drill-options">[{item.choices.join(" / ")}]</div>
                  </div>
                ))}
              </div>
            ) : null}
            {showDrillWordOrders ? (
              <div className="par-ws-drill-set">
                <div className="par-ws-drill-label">주요문장 단어배열 영작</div>
                {(s.drills?.wordOrders ?? []).map((item, i) => (
                  <div className="par-ws-wordorder" key={item.no}>
                    <div className="par-ws-wordorder-ko">
                      <span className="par-ws-cloze-no">{item.no}.</span>
                      <Field
                        as="span"
                        editable={editable}
                        value={item.korean}
                        onCommit={(v) =>
                          patch({
                            drills: {
                              ...s.drills,
                              wordOrders: s.drills?.wordOrders?.map((entry, j) => (i === j ? { ...entry, korean: v } : entry)),
                            },
                          })
                        }
                      />
                    </div>
                    <div className="par-ws-wordorder-chunks">[{item.chunks.join(" / ")}]</div>
                    <div className="par-ws-write-space" aria-hidden>
                      <span className="par-ws-write-line" />
                      <span className="par-ws-write-line" />
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>,
        );
      }
      if (workbookSet) {
        push(
          "note",
          "ws-workbook-topic",
          <div className="par-ws-block">
            <WorksheetMiniTitle title={workbookSet.title} kicker="EBS Workbook" />
            <div className="par-ws-topic-card">
              <span className="par-ws-topic-label">{workbookSet.topicGist.title}</span>
              <Field
                as="div"
                className="par-ws-topic-title"
                editable={editable}
                value={workbookSet.topicGist.topicTitle}
                onCommit={(v) =>
                  patch({
                    workbookSet: { ...workbookSet, topicGist: { ...workbookSet.topicGist, topicTitle: v } },
                  })
                }
              />
              <Field
                as="div"
                className="par-ws-topic-gist"
                editable={editable}
                value={workbookSet.topicGist.gist}
                onCommit={(v) =>
                  patch({
                    workbookSet: { ...workbookSet, topicGist: { ...workbookSet.topicGist, gist: v } },
                  })
                }
              />
            </div>
          </div>,
        );
        push(
          "note",
          "ws-workbook-grammar",
          <div className="par-ws-block">
            <WorksheetMiniTitle title={workbookSet.grammarSelection.title} kicker="Grammar Choice" />
            {editable ? (
              <Field
                as="div"
                className="par-ws-workbook-passage"
                editable
                value={workbookSet.grammarSelection.passage}
                onCommit={(v) =>
                  patch({
                    workbookSet: {
                      ...workbookSet,
                      grammarSelection: { ...workbookSet.grammarSelection, passage: v },
                    },
                  })
                }
              />
            ) : (
              <div className="par-ws-workbook-passage">{renderGrammarChoiceText(workbookSet.grammarSelection.passage)}</div>
            )}
          </div>,
        );
        push(
          "note",
          "ws-workbook-vocab",
          <div className="par-ws-block">
            <WorksheetMiniTitle title={workbookSet.vocabularyCloze.title} kicker="Vocabulary Cloze" />
            <Field
              as="div"
              className="par-ws-workbook-passage"
              editable={editable}
              value={toStudentVocabularyClozePassage(workbookSet.vocabularyCloze.passage, workbookSet.vocabularyCloze.blanks)}
              onCommit={(v) =>
                patch({
                  workbookSet: {
                    ...workbookSet,
                    vocabularyCloze: { ...workbookSet.vocabularyCloze, passage: v },
                  },
                })
              }
            />
          </div>,
        );
        push(
          "note",
          "ws-workbook-order",
          <div className="par-ws-block">
            <WorksheetMiniTitle title="주요문장 단어배열 영작" kicker="Word Order" />
            <div className="par-ws-drill-set">
              {consolidatedWordOrders.map((item, i) => (
                <div className="par-ws-wordorder" key={item.no}>
                  <div className="par-ws-wordorder-ko">
                    <span className="par-ws-cloze-no">{item.no}.</span>
                    <Field
                      as="span"
                      editable={editable}
                      value={item.korean}
                      onCommit={(v) =>
                        patch({
                          workbookSet: {
                            ...workbookSet,
                            wordOrders: workbookSet.wordOrders.map((entry, j) => (i === j ? { ...entry, korean: v } : entry)),
                          },
                        })
                      }
                    />
                  </div>
                  <div className="par-ws-wordorder-chunks">[{item.chunks.join(" / ")}]</div>
                  <div className="par-ws-write-space" aria-hidden>
                    <span className="par-ws-write-line" />
                    <span className="par-ws-write-line" />
                  </div>
                </div>
              ))}
            </div>
          </div>,
        );
      }
      const inferenceSet = s.inferenceSet;
      if (inferenceSet?.questions.length) {
        push(
          "note",
          "ws-inference-title",
          <div className="par-ws-block">
            <WorksheetMiniTitle title={inferenceSet.title} kicker="Suneung Inference" />
          </div>,
        );
        inferenceSet.questions.forEach((q, qi) => {
          push(
            "note",
            `ws-iq${qi}`,
            <WorksheetQuestionCard
              q={q}
              editable={editable}
              hiddenAnswers
              onPatch={(questionPatch) => {
                const safePatch = { ...questionPatch };
                delete safePatch.type;
                patch({
                  inferenceSet: {
                    ...inferenceSet,
                    questions: inferenceSet.questions.map((item, j) => (qi === j ? { ...item, ...safePatch } : item)),
                  },
                });
              }}
            />,
          );
        });
      }
      (s.questions ?? []).forEach((q, qi) => {
        push(
          "note",
          `ws-q${qi}`,
          <WorksheetQuestionCard
            q={q}
            editable={editable}
            hiddenAnswers
            onPatch={(questionPatch) =>
              patch({
                questions: (s.questions ?? []).map((item, j) => (qi === j ? { ...item, ...questionPatch } : item)),
              })
            }
          />,
        );
      });
      if (showAnswerKey) {
        let firstAnswer = true;
        for (const sub of worksheetAnswerKeySubsections(s, consolidatedWordOrders)) {
          // 정답·해설은 맨 뒤 '별도 페이지'에서 시작 (학생 시험지와 분리)
          push("note", `ws-answer-${sub.key}`, sub.node, firstAnswer ? { breakBefore: true } : undefined);
          firstAnswer = false;
        }
      }
}
