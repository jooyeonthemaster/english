# PREMIUM grammar 60 — third adjudication

## Frozen outcome

- Final grades: **F 22, C 38, B 0, A 0**.
- All V1-V5 pass: **38/60 (63.3%)**.
- Fatal: **22/60 (36.7%)**.
- Stored-answer mismatches: **3/60** — PG023, PG040, PG048.
- The 60 rows are **30 passages × 2 runs**, not 60 independent passages.
- API/model calls made by this adjudication: **0**.

The three final key mismatches are all NO_ANSWER cases. PG023 and PG040 permit a header/left-dislocation reading inside the dash; PG048's stop-to-V form is grammatical even though its meaning is wrong for the context. PG038 is not a mismatch: the proposed reduced-relative defense leaves “and offers” without a coordinate finite predicate, so stored (C) remains the unique answer.

## Dependence, run, and cost

| Unit | F | C | B | A | Calls | Cost (USD) |
|---|---:|---:|---:|---:|---:|---:|
| R1 (30 items) | 14 | 16 | 0 | 0 | 96 | 2.109936 |
| R2 (30 items) | 8 | 22 | 0 | 0 | 146 | 3.034212 |
| Total | 22 | 38 | 0 | 0 | 242 | 5.144148 |

At passage-cluster level, **18/30 (60.0%)** clusters contain at least one fatal item: 4 both-fatal, 14 one-fatal, and 12 none-fatal. Repeat-run fatal/nonfatal outcome agrees in only **53.3%**, so treating the two generations as independent evidence would materially overstate stability.

By requested difficulty: INTERMEDIATE 5/20 fatal; ADVANCED 12/20; KILLER 5/20.

## Gate implications

All 60 candidates were historically accepted. Under the adjudicated rubric, that creates **22 fatal false acceptances**. Ten difficulty-field failures emitted a matching difficulty-mismatch warning but were still accepted; the other **12 fatal items** had no matching validity signal. Their IDs are PG001, PG002, PG005, PG010, PG016, PG021, PG023, PG027, PG037, PG040, PG046, PG048.

Among the 38 all-V-pass items, 25 still had at least one final error/warning signal (17 with errors, 8 with warnings). This is not automatically a 25-item false-positive count: several codes correctly flag craft defects such as shallow KILLER points. The production gate needs an explicit code→V-gate/craft-only mapping before precision or specificity is meaningful.

## Inter-rater agreement before adjudication

| Dimension | Exact agreement and Cohen κ |
|---|---:|
| Blind answer | 57/60 (95.0%), κ=0.933 |
| All V jointly | 50/60 (83.3%), κ=0.629 |
| V1 | 60/60 (100.0%), κ=1.000 |
| V2 | 57/60 (95.0%), κ=0.375 |
| V3 | 53/60 (88.3%), κ=0.160 |
| V4 | 49/60 (81.7%), κ=0.267 |
| V5 | 60/60 (100.0%), κ=1.000 |
| C1 | 45/60 (75.0%), κ=0.143 |
| C2 | 47/60 (78.3%), κ=-0.040 |
| C3 | 37/60 (61.7%), κ=0.099 |
| C4 | 40/60 (66.7%), κ=0.205 |
| C5 | 41/60 (68.3%), κ=0.563 |
| Grade | 48/60 (80.0%), κ=0.592 |

The weak V3/V4 and C1-C4 κ values show that agreement percentages were inflated by the dominant PASS/low-score categories. The adjudication therefore resolves actual item evidence rather than averaging scores.

## Every disagreement

The format is “rater 1 / rater 2 → final”.

| Item | Disagreed dimensions | Third judgment evidence |
|---|---|---|
| PG003 | C4: 2 / 3 → 2 | allowed가 콤마 직후 -ed 형태로 노출되고 목적어까지 바로 이어져 약한 형태 누출이 있으므로 C4=2다. |
| PG005 | V4: false / true → false; C1: 2 / 1 → 2; C3: 1 / 0 → 0; grade: F / C → F | gives up and jumping은 즉시 소거되어 C3=0이다. 더 중요하게는 해설이 the rest를 the penguins의 수식어로 뒤집어 설명한다. 실제 핵은 the rest이고 of the penguins는 partitive 보충어이므로 V4 실패다. |
| PG006 | C4: 2 / 3 → 2 | PG003과 같은 allowed→allowing 국소 형태 누출이 있어 C4=2다. |
| PG007 | C2: 2 / 3 → 3; C5: 2 / 3 → 2 | 다섯 표지는 서로 다른 유효 문법점을 의도하지만, that절 끝의 serving은 정동사 결손을 쉽게 드러낸다. 따라서 C2=3, INTERMEDIATE 정합은 C5=2다. |
| PG009 | C1: 2 / 1 → 1 | 독립절의 본동사 자리에 watching이 놓여 즉시 드러나는 기초 결손이므로 출제 가치 C1=1이다. |
| PG010 | V4: false / true → false; grade: F / C → F | what the matter was에서 what은 be의 보어인 의문대명사이지 명사를 수식하는 의문형용사가 아니다. 해설의 '의문형용사(또는 의문대명사)'와 keyPoints의 관계대명사 병기는 실제 분석을 흐리므로 V4 실패다. |
| PG011 | C2: 2 / 3 → 3; C3: 1 / 2 → 1; C4: 2 / 3 → 2; C5: 1 / 2 → 1 | 분사·태 등 다섯 표지의 의도는 분명해 C2=3이지만, task 바로 뒤 completing과 목적어 부재가 국소 단서가 되어 C3=1·C4=2·C5=1이다. |
| PG012 | C2: 2 / 3 → 3; C3: 1 / 2 → 1; C5: 0 / 1 → 0 | 긴 동명사구 주어를 추적해야 해 표지 의도 C2=3은 인정하지만, 결론은 단순 수일치라 C3=1이고 KILLER 정합은 C5=0이다. |
| PG014 | C5: 2 / 3 → 2 | 명령문과 동명사 단편 구별은 INTERMEDIATE에 맞지만 대문자·마침표가 강한 단서라 C5=2다. |
| PG015 | C4: 3 / 2 → 2 | 문두 Focusing과 뒤의 comma-and 결과 구문이 정답을 표면적으로 노출하므로 C4=2다. |
| PG016 | V3: true / false → false; C3: 2 / 1 → 1; C4: 3 / 1 → 1; C5: 3 / 2 → 2 | tending으로 고쳐도 wounds 뒤 종속절 닫는 쉼표 누락과 'fine -but'가 남는다. 따라서 V3 실패이며 편집 노이즈를 반영해 C3=1·C4=1·C5=2다. |
| PG018 | C1: 2 / 1 → 1; C3: 1 / 0 → 0; C4: 3 / 2 → 2 | people과 tends가 가까워 기본 수일치로 즉시 끝난다. C1=1·C3=0이며 이 인접 단서 때문에 C4=2다. |
| PG019 | C3: 0 / 1 → 0; C4: 3 / 2 → 2 | 문두 What + 고유명사 + 동사 배열이 즉시 비문을 드러내므로 C3=0·C4=2다. |
| PG020 | C3: 1 / 2 → 2; C5: 1 / 2 → 2 | Sailors와 has 사이의 관계절이 유인어를 제공해 C3=2이며 ADVANCED 하단 정도의 C5=2다. |
| PG021 | V4: false / true → false; C2: 2 / 3 → 3; C5: 1 / 2 → 1; grade: F / B → F | be able to stimulate의 to부정사를 '명사적 용법'이라 한 해설은 adjective able의 infinitival complement를 잘못 분류한다. V4 실패이며, 표지 의도는 C2=3이나 KILLER 정합은 C5=1이다. |
| PG022 | C1: 2 / 1 → 1; C3: 1 / 0 → 0; C5: 3 / 2 → 2 | might 바로 뒤 wanting은 초급 modal+원형 규칙으로 즉시 소거되어 C1=1·C3=0, INTERMEDIATE 하단 C5=2다. |
| PG023 | blindAnswer: (A) / NO_ANSWER → NO_ANSWER; alternativeAnswers: [] / [(A)] → [(A)]; V2: true / false → false; V3: true / false → false; V4: true / false → false; C1: 2 / 3 → 2; C3: 1 / 3 → 1; C4: 1 / 0 → 0; C5: 0 / 1 → 0; grade: C / F → F | dash 안의 수원 목록을 header로, none of them을 재개 주어로 읽는 left-dislocation 분석이 가능하다. 따라서 (A)는 필연적 비문이 아니며 NO_ANSWER, V2-V4 실패다. 시비성 함정이라 C4=0·C5=0이다. |
| PG024 | V4: false / true → false | enough to keep advancing은 정도·결과 보충 구조다. 해설이 목적 용법도 가능하다고 병기해 실제 기능을 흐리므로 V4 실패다(V5 난이도 불일치는 양 평가자가 이미 확인). |
| PG026 | C2: 1 / 2 → 2; C3: 0 / 1 → 0; C5: 2 / 3 → 2 | friends and family donates는 tell A to V 결손과 표면 수일치가 동시에 답을 노출해 C3=0, C5=2다. |
| PG027 | V3: false / true → false; grade: F / C → F | own 뒤 첫 쉼표는 coordinate-adjective 경계이고 story 뒤 쉼표는 주어와 is를 부당하게 가른다. 제거 가능한 삽입구 쌍이 아니므로 to think 교정 후에도 V3 실패다. |
| PG029 | C4: 3 / 2 → 2 | Giving으로 끝나는 독립 단편 자체가 메타 단서이므로 C4=2다. |
| PG030 | C4: 2 / 3 → 2 | thing...are의 국소 수일치와 비표적 조건문 시제 흔들림이 있어 C4=2다. |
| PG031 | V4: false / true → true; C1: 2 / 3 → 3; C2: 2 / 3 → 3; C3: 1 / 2 → 2; C5: 0 / 2 → 1; grade: F / B → C | 실제 저장 해설은 be able to를 '조동사 상당어구'라고 했지 명사적 용법이라 하지 않았다. 따라서 V4는 통과한다. zero-relative를 건너 주절 주어를 찾고 project의 타동성·태를 판단해야 해 C1=3·C2=3·C3=2이나 KILLER에는 못 미쳐 C5=1이다. |
| PG032 | C2: 2 / 3 → 3; C3: 1 / 2 → 1; C5: 1 / 2 → 1 | 다섯 표지 의도는 분명해 C2=3이지만 someone else similarly immersing은 태와 타동성으로 국소 소거되어 C3=1·C5=1이다. |
| PG033 | V3: false / true → false | PG027과 같은 'their own, unique story, is'의 불필요한 주어–동사 쉼표가 using→used 교정 뒤에도 남으므로 V3 실패다. |
| PG034 | C2: 2 / 3 → 3; C3: 1 / 2 → 2; C5: 0 / 1 → 1 | get A to V와 make/let A V의 혼동은 실제 함정이라 C2=3·C3=2이나 단일 국소 보문형이라 KILLER 정합 C5=1이다. |
| PG035 | V4: false / true → false | keyPoints가 계속적 which와 선행사의 수일치를 묻는다고 하지만 which는 수에 따라 변하지 않고 meant도 과거형이라 그 점검항목이 성립하지 않는다. V4 실패다. |
| PG037 | V3: true / false → false; C3: 2 / 1 → 1; C4: 3 / 1 → 1; C5: 3 / 2 → 2 | appropriately로 고쳐도 wounds 뒤 쉼표 누락과 'fine -but' 표면 결함이 남아 V3 실패다. 국소 품사 단서와 노이즈로 C3=1·C4=1·C5=2다. |
| PG038 | blindAnswer: NO_ANSWER / (C) → (C); alternativeAnswers: [(C) (출제 의도 추정: shows up)] / [] → []; V2: false / true → true; V3: false / true → true; V4: false / true → true; C1: 1 / 2 → 2; C2: 1 / 2 → 2; C3: 0 / 1 → 1; C4: 0 / 2 → 2; grade: F / C → C | a stranger showing up을 축약 관계절로 잡으면 뒤의 and offers를 결속할 좌측 유한 술어가 없어 혼합 병렬이 된다. 따라서 showing→shows인 저장 정답 (C)가 유일하다. what kind 절은 embedded interrogative와 fused-relative 기술이 모두 가능한 전통적 분석 범위여서 V4 실패로 보지 않는다. |
| PG039 | C4: 2 / 3 → 3 | kept 바로 뒤 목적어가 분사 태를 배제하긴 하지만 별도 메타·꼬리 단서는 없어 C4=3이다. |
| PG040 | blindAnswer: (A) / NO_ANSWER → NO_ANSWER; alternativeAnswers: [] / [(A)] → [(A)]; V2: true / false → false; V3: true / false → false; V4: true / false → false; C1: 2 / 3 → 2; C3: 1 / 3 → 1; C4: 1 / 0 → 0; C5: 0 / 1 → 0; grade: C / F → F | PG023과 동일하게 수원 목록을 header, none of that을 집합적 재개 주어로 읽을 수 있다. (A)가 필연적 비문이 아니므로 NO_ANSWER, V2-V4 실패이며 C4=0·C5=0이다. |
| PG041 | C2: 2 / 3 → 3; C5: 1 / 2 → 1; grade: C / B → C | Only-by 도치는 구조 포인트이고 다섯 표지 의도는 분명해 C2=3이지만 Only가 규칙을 직접 신호하므로 KILLER 정합은 C5=1이다. |
| PG044 | C1: 2 / 1 → 1; C3: 1 / 0 → 0; C4: 3 / 2 → 2 | beauty와 come 사이에는 짧은 of구만 있어 기본 수일치로 즉시 끝난다. C1=1·C3=0·C4=2다. |
| PG045 | C1: 2 / 1 → 1; C3: 1 / 0 → 0; C4: 3 / 2 → 2 | PG018과 같은 people...tends 오류를 같은 passage cluster에서 반복했고 인접 수일치로 즉시 끝난다. C1=1·C3=0·C4=2다. |
| PG046 | V4: false / true → false; grade: F / C → F | 단순 명사 열거를 '등위 상관접속어구'라고 부른 것은 correlative conjunction의 정의와 다르다. 결론 are는 맞아도 학생용 문법 용어가 사실과 달라 V4 실패다. |
| PG048 | alternativeAnswers: [(D) (출제 의도 추정: running)] / [(D)] → [(D)]; C1: 1 / 2 → 1; C2: 1 / 2 → 1; C3: 0 / 3 → 0; C5: 0 / 1 → 0 | stop to V는 '다른 행동을 멈추고 V하려고 하다'라는 정상 구조다. 문맥상 running이 의도 의미지만 to run은 문법적이므로 NO_ANSWER이고 해설도 문법과 의미를 혼동해 V2-V4 실패다. |
| PG050 | C4: 3 / 2 → 2 | When + NP + bringing에서 종속절 정동사 결손이 표면에 드러나 C4=2다. |
| PG051 | C2: 2 / 3 → 3; C3: 1 / 2 → 2; C5: 1 / 2 → 2 | encourage A to V와 수동 후치분사 디코이가 실제 경쟁을 만들어 C2=3·C3=2이나 ADVANCED 하단이라 C5=2다. |
| PG052 | C1: 2 / 1 → 1; C4: 3 / 2 → 2 | Both influencing으로 끝나는 전체 문장 단편이 즉시 보여 C1=1·C4=2다. |
| PG053 | V4: false / true → true; grade: F / C → C | what kind of sandwich I like는 embedded interrogative로 가장 자연스럽지만 'the kind that I like'인 fused-relative 기술도 가능하다. keyPoints의 넓은 범주 병기를 치명적 사실 오류로 보지 않아 V4 통과·최종 C다. |
| PG056 | C1: 2 / 1 → 1; C3: 1 / 0 → 0; C4: 3 / 2 → 2 | 문두 Incorporate와 뒤 can improve의 두 정동사 충돌이 즉시 보여 C1=1·C3=0·C4=2다. |
| PG057 | C1: 2 / 1 → 1; C3: 1 / 0 → 0; C4: 3 / 2 → 2 | If NP qualifying ... then에서 종속절 정동사 결손이 즉시 보여 C1=1·C3=0·C4=2다. |
| PG060 | C1: 2 / 3 → 2; C2: 2 / 3 → 3; C3: 1 / 2 → 1; C5: 2 / 3 → 2; grade: C / B → C | in order for NP to V는 유효한 INTERMEDIATE 포인트이고 표지 의도도 분명해 C2=3이지만 긴 구 전체가 밑줄이라 C3=1, 난도 정합 C5=2다. |

## Agreement spot checks

- **PG001 (V4)**: 두 평가자가 함께 실패로 본 것을 재확인했다. (D) 밑줄은 be able의 to인데 해설은 문말 sell to의 목적어 관계를 설명해 표적 결속이 깨졌다.
- **PG002 (V4)**: hoped가 that절을 목적어로 못 취한다는 설명은 거짓이다. 문제는 접속사 없는 두 번째 유한동사이며 두 평가자의 공동 실패 판정이 맞다.
- **PG006 (V5)**: fullCandidate.difficulty=ADVANCED와 question.difficulty=KILLER가 실제로 달라 공동 실패 판정이 맞다.
- **PG007 (V1, V2, V3, V4, V5)**: get what they want의 what은 fused relative로 방어되며 저장키 (E) 외 다른 오류가 없다. all-V 공동 통과를 유지했다.
- **PG013 (V1, V2, V3, V4, V5)**: 게이트의 grammar-explanation-lint 신호와 별개로 학생용 해설은 appreciate→be appreciated의 태를 정확히 설명한다. all-V 통과다.
- **PG014 (V4)**: what you thought of a movie는 embedded interrogative가 우세하지만 'your opinion/what you thought'인 nominal 기술도 가능하다. keyPoints의 넓은 학교문법 태그만으로 V4를 뒤집지 않았다.
- **PG028 (V4)**: know what I am fitted to do는 embedded interrogative/fused relative 양쪽 기술이 가능한 전형적 경계다. 공동 V4 통과를 유지했다.
- **PG041 (V1, V2, V3, V4, V5)**: Only by 문두 도치, can you create 교정, 네 디코이 해설이 모두 정확하다. 다만 KILLER 공예는 C5=1로 별도 감점했다.
- **PG048 (V2, V3, V4)**: stop to run의 문맥은 기괴해도 문법 구조는 정상이다. 두 평가자의 NO_ANSWER 및 V2-V4 실패에 동의한다.
- **PG052 (V2, V3)**: a thousand lines ... qualifies는 그 양을 하나의 단위/작품으로 읽는 단수 일치가 가능하다. (E)의 fragment만 유일한 오류다.
- **PG055 (V2, V3, V4)**: Where the mind goes는 자유 관계/장소 종속절로 자연스럽고 keep you focused도 결과 상태 보어로 적법하다. 공동 all-V 통과를 유지했다.
- **PG060 (V1, V2, V3, V4, V5)**: in order for a great company to serve 교정은 유일하고 해설도 정확하다. all-V는 통과하지만 광범위 밑줄 때문에 B가 아닌 C다.

## Bottom line

No item reaches B or A after strict validity and difficulty calibration. The strongest survivors, such as PG031, PG041, and PG060, still miss their requested difficulty or expose the answer through broad/local marking. The historical “all accepted” result therefore measures pipeline acceptance, not exam-ready validity or beautiful KILLER craft.
