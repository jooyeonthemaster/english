// ============================================================================
// AI 문제 수정 — 유형별 컨트롤 (자동 생성: 24개 유형 팬아웃 집계)
// ============================================================================
// scripts/aggregate-controls 로 생성. 수정 시 원본 팬아웃 또는 type-edit-config.ts 참고.
// SENTENCE_INSERT 는 견본이므로 type-edit-config.ts 에 직접 정의됨(여기 미포함).
// ============================================================================

import type { EditControl } from "./type-edit-config";

export const FANOUT_TYPE_CONTROLS: Record<string, EditControl[]> = {
  "BLANK_INFERENCE": [
    {
      "id": "paraphraseAnswerToggle",
      "kind": "toggle",
      "label": "패러프레이즈 정답",
      "hint": "정답을 원문 표현 그대로가 아니라 의미를 보존한 추론형으로 변형",
      "badges": [
        "난이도 ↑",
        "암기 방지"
      ],
      "options": [
        {
          "value": "off",
          "label": "끄기 (원문 그대로)",
          "directive": null
        },
        {
          "value": "on",
          "label": "적용 (패러프레이즈)",
          "directive": "정답을 원문 표현 그대로가 아니라 의미를 보존한 패러프레이즈(추론이 필요한 형태)로 바꿔. blankAnswerMode는 PARAPHRASE로 설정. originalExpression은 원문 그대로 유지하되, 선지는 context-fit·polarity·문법적 정확성을 지켜 다시 작성. 난이도를 한 단계 올려."
        }
      ],
      "defaultValue": "off"
    },
    {
      "id": "doubleNegativeToggle",
      "kind": "toggle",
      "label": "이중부정 (킬러)",
      "hint": "부정-부정 논리로 정답 추론을 더 정교하게 (높은 난이도)",
      "badges": [
        "난이도 ↑↑",
        "고급"
      ],
      "options": [
        {
          "value": "off",
          "label": "끄기",
          "directive": null
        },
        {
          "value": "on",
          "label": "적용 (이중부정)",
          "directive": "정답 표현과 선지들을 이중부정(부정-부정 논리)으로 정교화해 줘. blankAnswerMode는 DOUBLE_NEGATIVE로 설정하고 answerLogic에 '부정-부정 논리' 설명을 추가. originalExpression을 이중부정 구조가 명확한 표현으로 조정하되 원문 의미는 정확히 유지. 난이도를 KILLER로 올려."
        }
      ],
      "defaultValue": "off"
    },
    {
      "id": "pointFocusSegmented",
      "kind": "segmented",
      "label": "핵심 포인트 집중",
      "hint": "빈칸 정답의 추론 논리를 고빈출 코어로 좁혀 출제 포인트 명확화",
      "options": [
        {
          "value": "keep",
          "label": "유지",
          "directive": null
        },
        {
          "value": "causality",
          "label": "인과 중심",
          "directive": "정답 표현을 인과·인과관계 추론 중심으로 다시 구성해. originalExpression과 앞뒤 문맥이 원인-결과 구조를 명확히 드러내도록 다듬어. 선지도 인과 관계와 무관한 매력적 오답으로 정교화."
        },
        {
          "value": "conceptNaming",
          "label": "개념 명명",
          "directive": "정답을 글의 핵심 개념을 명명하는 표현으로 다시 구성해. 주요 주제나 이론 용어를 빈칸 정답으로 만들고, 선지는 비슷해 보이지만 구체성·의미가 다른 개념으로 정교화."
        },
        {
          "value": "rephrasing",
          "label": "재진술",
          "directive": "정답을 앞서 언급된 표현이나 개념을 다른 단어로 재진술하는 형태로 구성해. originalExpression을 포함한 문맥에서 같은 의미를 달리 표현해야 하는 추론을 요구하도록 다듬어. 오답은 표면적으로 비슷해 보이지만 재진술이 아닌 다른 개념들로."
        },
        {
          "value": "contrast",
          "label": "대조 전환",
          "directive": "정답 표현을 지문의 대조(contrast)·반대 관계를 파악해야 완성되는 형태로 구성해. originalExpression 주변에 but/however 같은 연결어나 부정의 맥락이 있도록 조정하고, 선지도 대조 논리를 놓치는 함정들로 정교화."
        }
      ],
      "defaultValue": "keep"
    },
    {
      "id": "blankUnitSegmented",
      "kind": "segmented",
      "label": "빈칸 단위",
      "hint": "빈칸으로 잡는 표현의 크기를 단어·구·절로 강제",
      "options": [
        {
          "value": "keep",
          "label": "유지",
          "directive": null
        },
        {
          "value": "word",
          "label": "단어",
          "directive": "빈칸을 단일 핵심 단어(WORD) 단위로 다시 구성해. originalExpression을 원문의 핵심 내용어(명사·동사·형용사·부사) 한 단어로 잡고, 다섯 선지도 모두 같은 품사의 한 단어로 작성. 추론 논리·정답 의미는 유지하되 표현의 크기만 단어로 좁혀. 빈칸 주변 문맥은 그대로 둬."
        },
        {
          "value": "phrase",
          "label": "구",
          "directive": "빈칸을 2~4단어 구(PHRASE) 단위로 다시 구성해. originalExpression을 명사구·동사구·전치사구 같은 2~4단어 구(주어+동사 절은 제외)로 잡고, 다섯 선지도 모두 같은 문법 자리의 2~4단어 구로 작성. 추론 논리·정답 의미는 유지."
        },
        {
          "value": "clause",
          "label": "절",
          "directive": "빈칸을 주어와 동사를 갖춘 절(CLAUSE, 약 5~10단어) 단위로 다시 구성해. originalExpression을 한 명제를 이루는 절로 잡고, 다섯 선지도 모두 주어+동사 형태의 절로 작성. 추론 논리·정답 의미는 유지."
        }
      ],
      "defaultValue": "keep"
    }
  ],
  "GRAMMAR_ERROR": [
    {
      "id": "focusPoint",
      "kind": "segmented",
      "label": "어법 포인트",
      "hint": "밑줄 표현의 문법 오류 유형을 변경합니다. 밑줄 개수와 정답 개수는 유지됩니다.",
      "badges": [
        "내용 변경",
        "포인트 집중"
      ],
      "options": [
        {
          "value": "keep",
          "label": "유지",
          "directive": null
        },
        {
          "value": "auxiliaries",
          "label": "조동사",
          "directive": "어법 포인트를 조동사(can/must/should/might/will 등)와 조동사+have p.p. 중심으로 다시 구성해 줘. 밑줄 표현과 정답, 오답해설을 모두 그 포인트에 맞춰 정합하게 고쳐. 밑줄 개수와 정답 개수는 현재 문제와 동일하게 유지해."
        },
        {
          "value": "tense",
          "label": "시제·시상",
          "directive": "어법 포인트를 시제·시상(현재완료/과거완료/시제일치/시간표현) 중심으로 다시 구성해 줘. 정답 밑줄과 정답해설을 시제 판단으로 맞춰. 밑줄 개수와 정답 개수는 유지해."
        },
        {
          "value": "agreement",
          "label": "수일치",
          "directive": "어법 포인트를 주어-동사 수일치(단수/복수, 도치·삽입구 속 수일치) 중심으로 바꿔 줘. 정답 밑줄에서 수 판단이 명확히 드러나도록 해석하고 오답해설을 정교하게. 밑줄 개수와 정답 개수는 유지해."
        },
        {
          "value": "relatives",
          "label": "관계사",
          "directive": "어법 포인트를 관계대명사/관계부사(that/which/what, 전치사+관계대명사, when/where) 중심으로 바꿔 줘. 정답 위치와 정답해설을 관계사 판단으로 맞춰. 밑줄 개수와 정답 개수는 유지해."
        },
        {
          "value": "voiceAspect",
          "label": "능동·수동(태)",
          "directive": "어법 포인트를 능동/수동태 판단 중심으로 바꿔 줘. 정답 밑줄에서 능동/수동 선택이 논리적으로 필수가 되도록 문맥을 정합하게 만들고, 오답해설도 정교화해. 밑줄 개수와 정답 개수는 유지해."
        },
        {
          "value": "gerund",
          "label": "준동사",
          "directive": "어법 포인트를 to부정사 vs 동명사, 분사구문, 분사의 능동/수동 중심으로 바꿔 줘. 정답 위치에서 준동사 형태 판단이 명확하게 드러나도록 하고, 오답은 다른 준동사 형태로 매력적으로 만들어. 밑줄 개수와 정답 개수는 유지해."
        },
        {
          "value": "parallel",
          "label": "병렬 구조",
          "directive": "어법 포인트를 등위/상관 접속사의 병렬 구조(and/or/but/either...or/both...and, 평행 구조) 중심으로 바꿔 줘. 정답 밑줄에서 병렬성 판단이 필수가 되도록 문맥을 만들고, 오답해설을 정교하게. 밑줄 개수와 정답 개수는 유지해."
        }
      ],
      "defaultValue": "keep"
    },
    {
      "id": "wrongAnswerQuality",
      "kind": "toggle",
      "label": "오답 선지 정교화",
      "hint": "정답 선지 외 4개 선지가 더 그럴듯하고 매력적인 함정이 되도록 강화합니다. (정답 밑줄 위치와 개수는 유지)",
      "badges": [
        "암기 방지"
      ],
      "options": [
        {
          "value": "off",
          "label": "끄기",
          "directive": null
        },
        {
          "value": "on",
          "label": "적용",
          "directive": "정답 선지(정답 밑줄이 있는 것)를 제외한 나머지 4개 선지를 다듬어, 각 선지가 정답 밑줄의 다른 문법 오류 변형이거나 비슷하지만 명확히 틀린 표현이 되도록 하고, 각 오답 해설(wrongOptionExplanations)을 정교하게 다시 써 줘. 정답 밑줄 위치와 정답 개수는 현재 문제와 동일하게 유지해."
        }
      ],
      "defaultValue": "off"
    }
  ],
  "GRAMMAR_CHOICE_COMBO": [
    {
      "id": "slotPointDiversity",
      "kind": "toggle",
      "label": "슬롯 간 포인트 분화",
      "hint": "각 네모가 다른 문법 개념을 다루도록",
      "badges": [
        "포인트 명확화"
      ],
      "options": [
        {
          "value": "off",
          "label": "끄기",
          "directive": null
        },
        {
          "value": "on",
          "label": "적용",
          "directive": "(A)(B)(C) 각 슬롯이 서로 다른 어법 포인트를 다루도록 다시 구성해 줘. 예를 들어 한 슬롯이 시제 판단이면 다른 슬롯은 수일치·능수태·준동사 등 다른 문법 영역이 되도록. 각 슬롯의 correctExpression·wrongExpression을 그에 맞춰 정합하게 조정해 줘."
        }
      ],
      "defaultValue": "off"
    },
    {
      "id": "decoyAttractiveness",
      "kind": "toggle",
      "label": "오답 표현 정교화",
      "hint": "각 슬롯의 틀린 표현을 더 그럴듯하게",
      "badges": [
        "변별력 ↑"
      ],
      "options": [
        {
          "value": "off",
          "label": "끄기",
          "directive": null
        },
        {
          "value": "on",
          "label": "적용",
          "directive": "(A)(B)(C) 각 슬롯의 wrongExpression(틀린 표현)을 더 그럴듯하고 매력적인 함정으로 정교하게 다시 만들어 줘. 학생이 한 번씩 끌릴 만한 표현이 되되, 문법상 명확히 틀리게. 정답 표현(correctExpression)은 그대로 유지."
        }
      ],
      "defaultValue": "off"
    },
    {
      "id": "focusArea",
      "kind": "segmented",
      "label": "출제 포인트 영역",
      "hint": "문법 개념을 특정 영역으로 좁혀 집중",
      "options": [
        {
          "value": "keep",
          "label": "유지",
          "directive": null
        },
        {
          "value": "tenseAspect",
          "label": "시제·시상 중심",
          "directive": "(A)(B)(C)의 어법 포인트를 시제·시상(현재/과거/미래, 완료, 진행, 시제일치) 중심으로 집중해 줘. 다른 문법 영역보다는 시간과 완료성 판단이 핵심이 되도록 구성해."
        },
        {
          "value": "voiceModality",
          "label": "능수태·조동사 중심",
          "directive": "(A)(B)(C)의 어법 포인트를 능동/수동태와 조동사(can/must/should/might 등, 조동사+have p.p.) 중심으로 집중해 줘."
        },
        {
          "value": "agreement",
          "label": "수일치·준동사 중심",
          "directive": "(A)(B)(C)의 어법 포인트를 주어-동사 수일치, 도치·삽입구 속 수일치, to부정사 vs 동명사, 분사의 능동/수동 중심으로 집중해 줘."
        },
        {
          "value": "clauseConnector",
          "label": "관계사·접속사 중심",
          "directive": "(A)(B)(C)의 어법 포인트를 관계대명사/관계부사(that/which/what, 전치사+관계대명사)와 접속사(and/but/although 등) 중심으로 집중해 줘."
        }
      ],
      "defaultValue": "keep"
    }
  ],
  "VOCAB_CHOICE": [
    {
      "id": "vocabDisplayMode",
      "kind": "segmented",
      "label": "단어 표시 모드",
      "hint": "정답이 아닌 단어도 동의어로 변형해 원문 지문 암기를 무력화할 수 있습니다",
      "badges": [
        "암기 방지"
      ],
      "options": [
        {
          "value": "keep",
          "label": "유지",
          "directive": null
        },
        {
          "value": "synonymVariant",
          "label": "동의어 변형",
          "directive": "정답 외 모든 밑줄 단어도 원문과 의미가 같은 동의어로 표시해 줘(SYNONYM_VARIANT 모드). 위치 식별용 originalWord는 그대로 유지하고, 정답(부적절 단어)만 부적절성이 명확한 단어로 바꾸며 그 betterWord와 함께 명시해 줘. 이렇게 하면 학생이 지문을 통째로 외워도 표면 매칭으로는 풀 수 없게 됩니다."
        }
      ],
      "defaultValue": "keep"
    }
  ],
  "SENTENCE_ORDER": [
    {
      "id": "prefixVariation",
      "kind": "segmented",
      "label": "문단 앞부분 변형",
      "hint": "정답 순서는 유지하고 암기 방지용 표면 변형만 적용",
      "badges": [
        "암기 방지"
      ],
      "options": [
        {
          "value": "keep",
          "label": "유지",
          "directive": null
        },
        {
          "value": "1paragraph",
          "label": "1개 문단",
          "directive": "단락 (A), (B), (C) 중 1개를 선택해 그 문단의 첫 문장(앞부분)만 의미를 보존한 채 패러프레이즈해 줘. 문단 라벨·순서·정답 위치는 절대 바뀌지 않는다. 지문을 외운 학생도 표면 표현으로는 못 풀게."
        },
        {
          "value": "2paragraphs",
          "label": "2개 문단",
          "directive": "단락 (A), (B), (C) 중 2개를 선택해 각각의 첫 문장(앞부분)만 의미를 보존한 채 패러프레이즈해 줘. 나머지 1개는 그대로 두고, 문단 라벨·순서·정답 위치는 불변이다. 표면 암기 방지."
        },
        {
          "value": "3paragraphs",
          "label": "3개 문단",
          "directive": "단락 (A), (B), (C) 세 개 모두의 첫 문장(앞부분)을 의미는 보존한 채 패러프레이즈해 줘. 뒷부분·문단 라벨·순서·정답은 그대로 유지. 지문 표면 암기 완전 무력화."
        }
      ],
      "defaultValue": "keep"
    }
  ],
  "TOPIC": [
    {
      "id": "distractorFidelity",
      "kind": "segmented",
      "label": "오답 매력도",
      "hint": "오답 선지가 지문의 부분 정보에 얼마나 가까운지 조정합니다.",
      "badges": [
        "변별력 ↑"
      ],
      "options": [
        {
          "value": "keep",
          "label": "유지",
          "directive": null
        },
        {
          "value": "partial",
          "label": "부분 정보 강화",
          "directive": "오답 선지를 지문에서 명확히 드러나는 부분적 내용만 담되, 전체 주제는 아니도록 정교하게 다시 써 줘. 예를 들어 글이 의료기술의 미래에 대한 주제인데, 오답은 '현재 의료기술의 한계' 같은 부분 주제로 끌리게 만들어."
        },
        {
          "value": "semantic",
          "label": "의미적 연관성 높이기",
          "directive": "오답 선지를 정답과 의미상 연관이 높지만 정확한 범주는 다른 주제로 다시 만들어 줘. 학생들이 한 번씩 끌릴 만하되 핵심을 놓치도록. 난이도를 올리고 변별력을 높여 줘."
        }
      ],
      "defaultValue": "keep"
    },
    {
      "id": "answerCoverage",
      "kind": "segmented",
      "label": "정답 포괄성",
      "hint": "정답 선지가 글의 주제를 얼마나 광범위하게 담는지 조정합니다.",
      "badges": [
        "정확성 ↑"
      ],
      "options": [
        {
          "value": "keep",
          "label": "유지",
          "directive": null
        },
        {
          "value": "broader",
          "label": "더 포괄적으로",
          "directive": "정답 선지를 글의 전체적·거시적 주제를 더 정확히 담도록 다듬어 줘. 지나치게 세부사항이나 특정 부분에 국한된 표현보다는 전체 논지를 포괄하는 표현으로."
        },
        {
          "value": "precise",
          "label": "더 정교하게",
          "directive": "정답 선지를 글의 핵심 주제를 더 정확하고 엄밀하게 표현하도록 다듬어 줘. 애매한 부분을 더 명확히 하고, 지문에서 반복되는 핵심 어휘를 포함하도록."
        }
      ],
      "defaultValue": "keep"
    },
    {
      "id": "optionLanguageTone",
      "kind": "segmented",
      "label": "선지 표현 스타일",
      "hint": "선택지의 영문 표현 난이도와 문체를 조정합니다.",
      "options": [
        {
          "value": "keep",
          "label": "유지",
          "directive": null
        },
        {
          "value": "academic",
          "label": "학술적 표현",
          "directive": "모든 선지(정답·오답 포함)를 학술적·형식적 영문 표현으로 다시 써 줘. 추상적·이론적 용어를 높이고 수능 기출 톤을 반영해 줘."
        },
        {
          "value": "concrete",
          "label": "구체적 표현",
          "directive": "모든 선지를 구체적·직관적 영문으로 다시 써 줘. 추상 명사보다 동사와 구체 사례를 중심으로, 학생들이 글 내용과 더 직접 연결할 수 있도록."
        }
      ],
      "defaultValue": "keep"
    }
  ],
  "MAIN_IDEA": [
    {
      "id": "answerScope",
      "kind": "segmented",
      "label": "정답 정합 범위",
      "hint": "정답이 글 전체를 포괄할지(종합적) vs 글의 특정 측면(상세)에 집중할지 선택",
      "badges": [
        "표현성 ↑",
        "정합 강화"
      ],
      "options": [
        {
          "value": "keep",
          "label": "유지",
          "directive": null
        },
        {
          "value": "comprehensive",
          "label": "종합적 정합",
          "directive": "정답 선지가 글 전체의 중심 주장·결론을 가장 포괄적·종합적으로 담도록 다듬어 줘. 지엽적 세부가 아니라 글 전체를 꿰뚫는 통일된 메시지를 한국어 완전 진술문으로 명확히 표현해."
        },
        {
          "value": "coreConcept",
          "label": "핵심 개념 강조",
          "directive": "정답 선지의 핵심 개념(주요 논리·인과관계·필자의 태도)을 더 명확히 부각하고, 그 개념을 뒷받침하는 지문의 주요 근거를 직결시켜 정합도를 높여 줘."
        }
      ],
      "defaultValue": "keep"
    },
    {
      "id": "distractorLocality",
      "kind": "toggle",
      "label": "오답 지엽화 강화",
      "hint": "오답을 지문의 세부 정보나 부분 주제로 정교하게 변형",
      "badges": [
        "변별력 ↑"
      ],
      "options": [
        {
          "value": "off",
          "label": "끄기",
          "directive": null
        },
        {
          "value": "on",
          "label": "적용",
          "directive": "오답 선지를 더욱 지엽적이고 부분적으로 만들어 줘. 글의 특정 예시·세부 통계·개별 주장은 실제로 있지만, 전체 중심 논리와는 거리가 있는 한국어 완전 진술문으로 다시 작성해. 학생이 부분만 보고 선택할 함정을 강화해."
        }
      ],
      "defaultValue": "off"
    }
  ],
  "TOPIC_MAIN_IDEA": [
    {
      "id": "answerRefinement",
      "kind": "segmented",
      "label": "정답 정합화",
      "hint": "정답 선지가 글의 주제·요지와 더 정확히 부합하도록 조정",
      "options": [
        {
          "value": "keep",
          "label": "유지",
          "directive": null
        },
        {
          "value": "mainTheme",
          "label": "주제 강화",
          "directive": "정답 선지를 글의 중심 주제를 더 정확하고 포괄적으로 담은 표현으로 다듬어 줘. 문제가 '주제'를 묻는 것이라면 주제와의 정합도를 높여."
        },
        {
          "value": "gistEmphasize",
          "label": "요지 강화",
          "directive": "정답 선지를 글의 핵심 주장·결론을 더 명확히 담은 표현으로 다듬어 줘. 문제가 '요지'를 묻는 것이라면 저자의 주요 주장과 더 정확히 일치하게."
        }
      ],
      "defaultValue": "keep"
    },
    {
      "id": "decoyQuality",
      "kind": "toggle",
      "label": "오답 매력 강화",
      "hint": "오답을 부분 정보·지엽적 진술로 정교하게 구성해 변별력 ↑",
      "badges": [
        "변별력 ↑"
      ],
      "options": [
        {
          "value": "off",
          "label": "끄기",
          "directive": null
        },
        {
          "value": "on",
          "label": "적용",
          "directive": "오답 4개를 더 정교하게 다듬어 줘. 각 오답이 지문의 부분 정보·구체 사례·지엽적 진술을 담거나, 주제는 비슷해 보이나 글의 전체 의도는 빗나가게 만들어서 변별력을 높여."
        }
      ],
      "defaultValue": "off"
    }
  ],
  "TITLE": [
    {
      "id": "decoyType",
      "kind": "segmented",
      "label": "오답 함정 유형",
      "hint": "정답이 아닌 선지들의 전략적 함정 방식 지정",
      "options": [
        {
          "value": "keep",
          "label": "유지",
          "directive": null
        },
        {
          "value": "peripheral",
          "label": "지엽적 정보",
          "directive": "제목 오답 선지들을 글의 주요 논점은 놓치고 지문의 세부 사실·예시·부분 정보만 담은 제목으로 정교하게 다시 만들어 변별력을 높여 줘. 정답은 이들보다 글의 전체 핵심을 훨씬 폭넓게 담도록."
        },
        {
          "value": "overinclusive",
          "label": "과포괄적",
          "directive": "제목 오답 선지들을 지나치게 넓거나 추상적인 제목으로 다시 만들어, 이 글뿐만 아니라 다른 여러 글에도 적용될 수 있도록 약화시켜 줘. 정답은 이 글의 고유한 주제를 정확히 담도록."
        },
        {
          "value": "mixed",
          "label": "지엽+과포괄 혼합",
          "directive": "오답 선지를 두 가지 함정으로 나눠서: 일부는 글의 세부 사실만 담은 지엽적 제목, 일부는 글의 범위를 벗어난 과포괄적 제목으로 정교하게 구성해 변별력을 높여 줘. 정답만 글의 핵심을 정확히 반영하게."
        }
      ],
      "defaultValue": "keep"
    },
    {
      "id": "answerStyle",
      "kind": "segmented",
      "label": "정답 표현 스타일",
      "hint": "정답 제목의 표현 방식 선택",
      "badges": [
        "난이도 조정"
      ],
      "options": [
        {
          "value": "keep",
          "label": "유지",
          "directive": null
        },
        {
          "value": "explicit",
          "label": "명제형(직설적)",
          "directive": "정답 제목을 글의 주요 주장이나 핵심 개념을 직접적으로 나타내는 명제형으로 다시 작성해 줘(예: 'The Importance of...' 'How to Improve...'). 명확하고 이해하기 쉽지만 추론이 필요 없도록."
        },
        {
          "value": "implicit",
          "label": "비유형(함축적)",
          "directive": "정답 제목을 글의 핵심을 비유·상징·질문형으로 함축적으로 나타내는 표현으로 다시 작성해 줘(예: 'Bridging the Gap' 'What Lies Beyond?' 'The Hidden Cost'). 학생이 글을 읽고 핵심을 추론해야 깨달을 수 있도록 난이도를 높여."
        }
      ],
      "defaultValue": "keep"
    }
  ],
  "IMPLIED_MEANING": [
    {
      "id": "inferenceMode",
      "kind": "segmented",
      "label": "함축 추론 핵심",
      "hint": "정답과 표면 의미를 이어주는 추론 메커니즘을 선택해 reasoningGap과 evidenceChain을 그에 맞춰 재구성합니다.",
      "options": [
        {
          "value": "keep",
          "label": "유지",
          "directive": null
        },
        {
          "value": "causality",
          "label": "인과·논리",
          "directive": "함축 의미 추론을 '인과 관계·논리적 전개'로 재구성해. reasoningGap은 표면 의미에서 인과적 결과나 논리적 귀결로 나아가는 과정을 명시하고, evidenceChain에 인과의 고리(왜→결과→함축의미)를 명백히 담아."
        },
        {
          "value": "paradox",
          "label": "대조·역설",
          "directive": "함축 의미 추론을 '표면의 모순·역설 해소'로 재구성해. 밑줄 표현이 겉으로는 한 의미처럼 보이지만 실제는 반대 또는 딴뜻을 담고 있는 구조로. reasoningGap에 '표면 vs 실제'의 긴장을 명시하고 evidenceChain에 역설 해소 근거를 담아."
        },
        {
          "value": "contextual",
          "label": "맥락 재해석",
          "directive": "함축 의미 추론을 '맥락상 재해석·숨은 뜻 읽기'로 재구성해. 밑줄 표현이 표면 사전적 의미를 넘어 글의 맥락·필자의 의도·시대·문화적 배경 안에서 특정 의미로 재해석되는 과정을. reasoningGap에 '맥락의 층(표면→숨은 뜻)'을 명시하고 evidenceChain에 맥락 요소를 담아."
        },
        {
          "value": "metaphor",
          "label": "비유·상징",
          "directive": "함축 의미 추론을 '비유·은유·상징'으로 재구성해. 밑줄 표현이 문자 그대로의 의미가 아니라 추상적·상징적 의미를 담은 표현으로. reasoningGap에 '문자→상징'의 이행을 명시하고 evidenceChain에 비유의 대응 관계(A는 실제로는 B를 뜻함)를 담아."
        }
      ],
      "defaultValue": "keep"
    },
    {
      "id": "wrongOptionPrecision",
      "kind": "toggle",
      "label": "오답 정밀도(암기 방지)",
      "hint": "오답을 더 교묘한 함정으로: 표면 의미·부분 의미만 담거나 함축 의미의 일부만 담은 매력적인 오답으로 정교화합니다.",
      "badges": [
        "암기 방지",
        "변별력 ↑"
      ],
      "options": [
        {
          "value": "off",
          "label": "끄기",
          "directive": null
        },
        {
          "value": "on",
          "label": "적용",
          "directive": "오답 4개를 다음과 같이 정교화해: ① 표면 의미만 담아 정답과 혼동하게, ② 함축 의미의 일부만 담아 불완전하게, ③ 함축과 비슷하지만 미묘하게 다른 의미로, ④ 정답처럼 보이는 비유나 상징적 표현으로. wrongOptionExplanations는 각 오답이 왜 정답이 아닌지(표면/부분에 머물거나, 문맥 외 오독) 명시해."
        }
      ],
      "defaultValue": "off"
    },
    {
      "id": "evidenceExplicitness",
      "kind": "toggle",
      "label": "근거 명시화",
      "hint": "evidenceChain의 각 단계를 지문의 정확한 구절·문장으로 더 명확히 합니다.",
      "options": [
        {
          "value": "off",
          "label": "끄기",
          "directive": null
        },
        {
          "value": "on",
          "label": "적용",
          "directive": "evidenceChain의 각 단계를 지문에서 직접 인용한 구절이나 문장(페러프레이즈 가능)으로 명시해. 추론의 각 고리가 지문 근거와 정확히 연결되도록. 근거 없는 암묵적 단계는 제거하고 지문에 명백한 근거만 남겨."
        }
      ],
      "defaultValue": "off"
    }
  ],
  "REFERENCE": [
    {
      "id": "pronounType",
      "kind": "segmented",
      "label": "대명사 타입",
      "hint": "대명사의 지칭 범위와 특성을 조정합니다.",
      "options": [
        {
          "value": "keep",
          "label": "유지",
          "directive": null
        },
        {
          "value": "narrowPersonal",
          "label": "인칭대명사 한정",
          "directive": "밑줄 대명사를 he, she, they 등 인칭대명사로 통일해서 지칭 범위를 명확하게 하고, 각 선지의 인물을 분명히 구분되게 재구성해 줘."
        },
        {
          "value": "expandReference",
          "label": "지칭 대상 확대",
          "directive": "대명사가 단순 인물뿐 아니라 단체, 행동, 추상적 개념을 포함하도록 지문을 다듬고, 선지에서 그 모든 후보를 고르게 매력적으로 제시해 줘."
        }
      ],
      "defaultValue": "keep"
    },
    {
      "id": "distractorPattern",
      "kind": "segmented",
      "label": "오답 함정 전략",
      "hint": "오답 선지의 함정 유형을 지정합니다.",
      "badges": [
        "난이도 ↑"
      ],
      "options": [
        {
          "value": "keep",
          "label": "유지",
          "directive": null
        },
        {
          "value": "adjacentEntity",
          "label": "인접 개체 함정",
          "directive": "정답 대상과 가장 가깝게 언급된 다른 개체(인물/단체)를 오답으로 배치해서 학생들이 '단순히 가까운 명사'에 현혹되게 구성해 줘."
        },
        {
          "value": "semanticTrap",
          "label": "의미 관련성 함정",
          "directive": "정답과 의미가 연관되어 있지만 문맥상 실제 지칭은 아닌 개체들을 오답으로 배치해서, 단순 의미 관계로 판단하는 학생을 함정에 빠뜨려 줘."
        }
      ],
      "defaultValue": "keep"
    },
    {
      "id": "contextCue",
      "kind": "toggle",
      "label": "문맥 단서 강화",
      "hint": "정답 대상으로 유일하게 수렴하는 문맥 신호를 추가합니다.",
      "badges": [
        "난이도 ↓"
      ],
      "options": [
        {
          "value": "off",
          "label": "끄기",
          "directive": null
        },
        {
          "value": "on",
          "label": "적용",
          "directive": "밑줄 대명사 앞뒤의 문맥(시제·성·수 일치, 선행사의 특성·역할)을 더 분명하게 다듬어서, 정답이 논리적으로 단 하나로 결정되도록 강화해 줘. 단 선지 개수는 5개 유지하고."
        }
      ],
      "defaultValue": "off"
    }
  ],
  "CONTENT_MATCH": [
    {
      "id": "evidenceClarity",
      "kind": "toggle",
      "label": "근거 명확화",
      "hint": "각 선지가 지문의 특정 문장과 일치/불일치하는지 근거를 분명히 하고, 오답 해설에 해당 근거를 명시합니다.",
      "badges": [
        "명확성 ↑"
      ],
      "options": [
        {
          "value": "off",
          "label": "유지",
          "directive": null
        },
        {
          "value": "on",
          "label": "적용",
          "directive": "각 선지가 지문의 특정 문장과 일치/불일치하는지 근거를 분명히 하고, 오답 해설에 해당 근거를 명시해 줘. 학생이 정답을 고르는 논리적 근거가 지문 인용으로 명확해야 함."
        }
      ],
      "defaultValue": "off"
    },
    {
      "id": "trapType",
      "kind": "segmented",
      "label": "함정 강화",
      "hint": "지문을 살짝 비튼 함정 선지 유형을 선택합니다. 구조는 유지하고 내용만 변경.",
      "badges": [
        "난이도 ↑"
      ],
      "options": [
        {
          "value": "keep",
          "label": "유지",
          "directive": null
        },
        {
          "value": "numberRange",
          "label": "숫자·범위",
          "directive": "오답 선지를 지문의 숫자·수량·범위를 조금 틀리게(예: 3명→4명, 50%→60%) 비틀어 표면상 맞는 것처럼 보이지만 명확히 틀리게 만들어 줘. 수치 함정으로 변별력을 높여."
        },
        {
          "value": "causality",
          "label": "인과 뒤집기",
          "directive": "오답 선지를 지문의 인과관계를 뒤집게(원인→결과, 결과→원인) 또는 부분적으로 역전하게 만들어 줘. 로직은 비슷해 보이지만 명확히 틀리게."
        },
        {
          "value": "partialDetail",
          "label": "부분정보",
          "directive": "오답 선지를 지문의 부분 진술만 담아 마치 전체처럼 보이게 만들거나, 한정사/조건을 생략해 과도하게 일반화하게 다시 써 줘."
        },
        {
          "value": "contextualMeaning",
          "label": "간접표현",
          "directive": "오답 선지를 지문의 직접적 표현이 아니라 상징·대리의미·함축으로 표현해, 학생이 신중한 사고 없이는 헷갈리도록 정교화해 줘."
        }
      ],
      "defaultValue": "keep"
    },
    {
      "id": "optionRealism",
      "kind": "toggle",
      "label": "선지 현실성 강화",
      "hint": "각 선지를 실제 시험지처럼 자연스럽고 설득력 있게 다듬습니다. 부자연스러운 오답은 필터링됩니다.",
      "options": [
        {
          "value": "off",
          "label": "유지",
          "directive": null
        },
        {
          "value": "on",
          "label": "적용",
          "directive": "모든 선지를 문맥상 자연스럽고 설득력 있게 다듬되, 정답은 여전히 논리적으로 명확해야 하고 오답도 한 번씩 끌리지만 명백히 틀려야 함. 부자연스럽거나 애매한 표현은 제거해 줘."
        }
      ],
      "defaultValue": "off"
    }
  ],
  "SUMMARY_COMPLETE_MC": [
    {
      "id": "summaryCompression",
      "kind": "segmented",
      "label": "요약문 정교화 수준",
      "hint": "요약문이 글 전체를 담아내는 범위와 정밀도 조정",
      "badges": [
        "정확도 ↑"
      ],
      "options": [
        {
          "value": "keep",
          "label": "유지",
          "directive": null
        },
        {
          "value": "comprehensive",
          "label": "전체 포괄",
          "directive": "요약문이 글의 부분 정보가 아니라 **전체 맥락과 주제**를 모두 담아내도록 다시 작성해 줘. (A)(B) 빈칸 정답도 그에 맞춰 글 핵심을 직결하는 표현으로 갱신하고, 오답 조합도 정합하게 다시 구성해."
        },
        {
          "value": "precise",
          "label": "정밀 압축",
          "directive": "요약문을 더 정밀하고 간결하게 다듬어 글의 핵심 논리만 남기되 불필요한 부분 정보는 제거해 줘. 이에 따라 (A)(B) 빈칸의 정답도 글의 **주요 추론 포인트**를 직결하는 표현으로 다시 구성해."
        }
      ],
      "defaultValue": "keep"
    },
    {
      "id": "decoyComboStrength",
      "kind": "toggle",
      "label": "오답 조합 강화",
      "hint": "(A) 또는 (B)만 맞고 다른 하나는 틀린 함정으로",
      "badges": [
        "변별력 ↑"
      ],
      "options": [
        {
          "value": "off",
          "label": "끄기",
          "directive": null
        },
        {
          "value": "on",
          "label": "적용",
          "directive": "5개 선지 중 오답 4개를 다음과 같이 정교하게 다시 구성해 줘: **(A)는 맞으나 (B)는 틀린 조합 2개**, **(B)는 맞으나 (A)는 틀린 조합 1개**, **둘 다 틀린 조합 1개**. 이렇게 하면 '한쪽만 골라 선택하는' 함정이 생겨 변별력이 높아진다. 정답 조합(둘 다 맞는 것)은 논리적으로 유일해야 한다."
        }
      ],
      "defaultValue": "off"
    },
    {
      "id": "contextualClue",
      "kind": "toggle",
      "label": "문맥 단서 강화",
      "hint": "요약문 앞뒤 문맥에서 정답이 더 명확히 유추되도록",
      "options": [
        {
          "value": "off",
          "label": "끄기",
          "directive": null
        },
        {
          "value": "on",
          "label": "적용",
          "directive": "요약문 주변의 연결 문맥(앞뒤 문장의 지시어·연결어·문법 구조)을 강화해서, (A)(B) 빈칸의 정답이 문맥상으로 더 자연스럽고 명확히 결정되도록 다듬어 줘. 문맥 강화는 요약문 자체를 과하게 바꾸지 말고, 정답 빈칸 주변만 정밀하게."
        }
      ],
      "defaultValue": "off"
    }
  ],
  "IRRELEVANT": [
    {
      "id": "irrelevanceType",
      "kind": "segmented",
      "label": "무관성 유형",
      "hint": "삽입 문장이 무관한 방식(주제·범위·인과)을 지정해 일관된 설계를 유도합니다.",
      "badges": [
        "출제 포인트"
      ],
      "options": [
        {
          "value": "keep",
          "label": "유지",
          "directive": null
        },
        {
          "value": "topic_intrusion",
          "label": "주제 침입",
          "directive": "무관한 문장을 '글 전체의 주제/소재와 다른 화제'를 끌어들이도록 설계해 줘. 글의 핵심 소재와 명확히 다른 주제를 다루되, 인접 문장의 내용어 3~4개(같은 분야 어휘)는 재사용해 표면상 자연스럽게 위장하게 해. 나머지 4개 문장(선지)은 글 전체 주제를 일관되게 유지하게."
        },
        {
          "value": "scope_shift",
          "label": "범위 이탈",
          "directive": "무관한 문장을 '같은 소재의 다른 측면/범위 평가'로 설계해 줘. 글이 논증하는 특정 측면(예: 효과·원인)과 다른 측면(예: 도덕성·경제성)을 서술하게 하고, 나머지 4개 문장은 글의 원래 논점 범위를 일관되게 유지하게."
        },
        {
          "value": "contrast_misuse",
          "label": "대조 오용",
          "directive": "무관한 문장을 '글이 일관되게 옹호하는 주장과 정반대의 입장'으로 만들어 줘. 표면적 역접어(However 등)가 아니라 내용이 실제로 글의 논지와 모순되게 하되, 앞뒤 문장(같은 주장 전개)과 논리적으로 충돌하게."
        }
      ],
      "defaultValue": "keep"
    },
    {
      "id": "answerPlacement",
      "kind": "toggle",
      "label": "정답 위치 강화",
      "hint": "정답 문장을 중간(2~4번)에 확실히 배치해 문제로서 명확한 답을 보장합니다.",
      "options": [
        {
          "value": "off",
          "label": "끄기",
          "directive": null
        },
        {
          "value": "on",
          "label": "중간 고정",
          "directive": "무관한 문장(정답)이 맨 처음(①)이나 맨 끝(⑤)이 아니라 중간 위치(②③④ 중)에 배치되도록 문장 순서를 조정해 줘. 그 위치에서 앞뒤 문장과의 흐름 단절이 가장 명확해지도록."
        }
      ],
      "defaultValue": "off"
    },
    {
      "id": "contextualCue",
      "kind": "segmented",
      "label": "무관성 단서 강도",
      "hint": "정답 문장이 무관하다는 신호(어휘·연결어·주제)의 명확성을 조정합니다.",
      "options": [
        {
          "value": "keep",
          "label": "유지",
          "directive": null
        },
        {
          "value": "subtle",
          "label": "미묘하게(난이도↑)",
          "directive": "무관한 문장과 앞뒤 문장이 표면상 자연스럽게 이어지도록 어휘·연결어를 정교하게 조정해(같은 분야 단어 공유, 약한 연결 신호) 무관성을 꼭꼭 숨겨 난이도를 올려 줘. 하지만 논지를 꼼꼼히 읽으면 명확히 벗어나야 함."
        },
        {
          "value": "sharp",
          "label": "명확하게(난이도↓)",
          "directive": "무관한 문장이 앞뒤 문장과 분명히 어긋나도록 주제·어휘·논리 단서를 더 또렷이 드러내 줘. 학생이 한눈에 논지 이탈을 알 수 있도록 대비를 강하게."
        }
      ],
      "defaultValue": "keep"
    }
  ],
  "CONDITIONAL_WRITING": [
    {
      "id": "grammarPointFocus",
      "kind": "segmented",
      "label": "문법 포인트",
      "hint": "조건에 특정 문법을 명시해 정합하게 조정합니다. 조건 개수는 유지됩니다.",
      "badges": [
        "포인트 집중"
      ],
      "options": [
        {
          "value": "keep",
          "label": "유지",
          "directive": null
        },
        {
          "value": "relativeClauses",
          "label": "관계사",
          "directive": "조건에 관계대명사/관계부사(that/which/what/where/when 등)를 반드시 사용하도록 명시하고, 모범답안과 채점 기준을 그에 맞춰 갱신해 줘. 조건 개수는 유지."
        },
        {
          "value": "participialPhrase",
          "label": "분사구문",
          "directive": "조건에 분사(현재분사/과거분사)를 포함한 분사구문을 사용하도록 명시하고, 모범답안을 그에 맞춰 갱신해 줘. 조건 개수는 유지."
        },
        {
          "value": "conditionalStructure",
          "label": "가정법",
          "directive": "조건에 가정법(If절, 가정법 과거/과거완료 등)을 사용하도록 명시하고, 모범답안과 채점 기준을 그에 맞춰 갱신해 줘. 조건 개수는 유지."
        },
        {
          "value": "comparativeSuperlative",
          "label": "비교·최상급",
          "directive": "조건에 비교급/최상급 구조를 사용하도록 명시하고, 모범답안을 그에 맞춰 갱신해 줘. 조건 개수는 유지."
        },
        {
          "value": "voicePassive",
          "label": "능동·수동태",
          "directive": "조건에 수동태(또는 능동태 전환) 사용을 명시하고, 모범답안을 그에 맞춰 갱신해 줘. 조건 개수는 유지."
        }
      ],
      "defaultValue": "keep"
    },
    {
      "id": "conditionClarity",
      "kind": "toggle",
      "label": "조건 구체화",
      "hint": "조건을 더 명확하고 검증 가능하게 다듬습니다. 조건 개수는 그대로 유지됩니다.",
      "badges": [
        "정합도 ↑"
      ],
      "options": [
        {
          "value": "off",
          "label": "끄기",
          "directive": null
        },
        {
          "value": "on",
          "label": "적용",
          "directive": "각 조건을 더 구체적이고 검증 가능하게 다듬어 줘. 예를 들어 '관계사를 사용할 것'이면 '관계대명사 which 또는 that으로 시작하는 절을 포함할 것' 정도로 명확히 하고, 모범답안·채점 기준과 1:1 대응되도록 갱신해 줘. 조건 개수는 유지."
        }
      ],
      "defaultValue": "off"
    },
    {
      "id": "modelAnswerRefinement",
      "kind": "toggle",
      "label": "모범답안 정교화",
      "hint": "모범답안을 모든 조건을 충족하는 자연스러운 영어로 다듭니다.",
      "badges": [
        "정합도 ↑"
      ],
      "options": [
        {
          "value": "off",
          "label": "끄기",
          "directive": null
        },
        {
          "value": "on",
          "label": "적용",
          "directive": "모범답안(modelAnswer)을 명시된 모든 조건을 100% 충족하면서 자연스러운 영어 문장으로 다시 정교화해 줘. 조건별 대응 관계가 명확하고, 채점 기준(scoringCriteria)도 새 모범답안에 맞춰 갱신해 줘."
        }
      ],
      "defaultValue": "off"
    }
  ],
  "SENTENCE_TRANSFORM": [
    {
      "id": "transformMode",
      "kind": "segmented",
      "label": "전환 포인트",
      "hint": "문장을 변환할 문법 항목을 지정하면 조건과 답이 그에 맞춰 정합됨",
      "badges": [
        "명확성 ↑"
      ],
      "options": [
        {
          "value": "keep",
          "label": "유지",
          "directive": null
        },
        {
          "value": "activePassive",
          "label": "능동↔수동",
          "directive": "문장 전환의 핵심 포인트를 능동태 ↔ 수동태로 명확히 하고, 조건(conditions)에 '수동태로 바꿀 것' 또는 '능동태로 바꿀 것'을 명시해 줘. 모범답안은 태 변환이 자연스러운 영어 문장으로 정합하게."
        },
        {
          "value": "directIndirect",
          "label": "직접↔간접화법",
          "directive": "문장 전환의 핵심을 직접 화법 ↔ 간접 화법으로 재구성해 줘. 조건에 '간접 화법으로 바꿀 것' 또는 '직접 화법으로 바꿀 것'을 명시하고, 모범답안은 시제·대명사 변환까지 완벽하게."
        },
        {
          "value": "conditionalMood",
          "label": "가정법",
          "directive": "문장 전환을 가정법(If절·조건·반사실적 상황)으로 재구성해 줘. 조건에 '가정법으로 바꿀 것' 또는 구체적으로 '~라면 어땠을까'식 가정법을 명시하고, 모범답안은 가정법 시제(과거/대과거)와 주절 구조가 정확하게."
        },
        {
          "value": "participialPhrase",
          "label": "분사구문",
          "directive": "문장 전환을 분사구문(분사+목적어+부사) 또는 절 → 분사구 변환으로 재구성해 줘. 조건에 '분사구문으로 바꿀 것'을 명시하고 모범답안은 능동/수동 분사 구분이 정확하게."
        },
        {
          "value": "relativeClause",
          "label": "관계절↔전치사구",
          "directive": "문장 전환을 관계절 ↔ 전치사구(또는 분사구)로 재구성해 줘. 조건에 '관계절로 바꿀 것' 또는 '전치사구로 바꿀 것'을 명시하고, 모범답안은 의미 동등성이 정확하게."
        },
        {
          "value": "comparativeSuperlative",
          "label": "비교급/최상급",
          "directive": "문장 전환을 비교급(more A than B) 또는 최상급(most) 구조로 재구성해 줘. 조건에 '~보다 더 / 가장 ~'로 표현할 것을 명시하고, 모범답안은 원문 의미를 완벽히 담으면서도 비교 구조가 자연스럽게."
        }
      ],
      "defaultValue": "keep"
    },
    {
      "id": "conditionSpecificity",
      "kind": "segmented",
      "label": "조건 수준",
      "hint": "조건이 모호하면 난이도 하향, 구체 명시하면 상향",
      "options": [
        {
          "value": "keep",
          "label": "유지",
          "directive": null
        },
        {
          "value": "vague",
          "label": "개념만(난이도 ↓)",
          "directive": "조건(conditions)을 단순 개념 수준('수동태로', '가정법으로', '분사구문으로')으로 단순화해 줘. 학생이 전환 방식을 스스로 선택해야 하도록 해서 난이도를 낮춰."
        },
        {
          "value": "specific",
          "label": "구체 명시(난이도 ↑)",
          "directive": "조건(conditions)을 구체적으로 명시해 줘. 예: '주어를 ~로 유지한 채 수동태로', '~ing 분사구문으로', 'As~로 시작하는 분사구로' 등. 모범답안이 조건을 정확히 충족하게."
        }
      ],
      "defaultValue": "keep"
    },
    {
      "id": "answerUniqueness",
      "kind": "toggle",
      "label": "정답 유일성",
      "hint": "여러 정답이 가능하지 않도록 조건·정답을 정합",
      "badges": [
        "채점 엄정성 ↑"
      ],
      "options": [
        {
          "value": "off",
          "label": "끄기",
          "directive": null
        },
        {
          "value": "on",
          "label": "적용",
          "directive": "조건(conditions)을 매우 구체적으로 명시해서 모범답안(modelAnswer)이 유일하게 결정되도록 만들어 줘. 예를 들어 '상으로만 변경 / 시제·대명사는 원문 그대로' 같은 제약을 추가해. 이러한 제약을 조건에 명시하고 모범답안이 그 제약을 정확히 충족하게."
        }
      ],
      "defaultValue": "off"
    }
  ],
  "FILL_BLANK_KEY": [
    {
      "id": "clueDensity",
      "kind": "segmented",
      "label": "단서 강도",
      "hint": "빈칸 앞뒤 문맥에서 정답을 유추할 수 있는 단서의 명확성",
      "badges": [
        "변별력 조정"
      ],
      "options": [
        {
          "value": "keep",
          "label": "유지",
          "directive": null
        },
        {
          "value": "explicit",
          "label": "명시적(쉬움)",
          "directive": "빈칸 앞뒤 문맥 단서를 더 분명하고 명시적으로 다듬어서, 정답 표현을 충분한 근거로부터 합리적으로 유추할 수 있게 해 줘. 동의어나 부연 설명으로 힌트를 강화해."
        },
        {
          "value": "implicit",
          "label": "내재적(어려움)",
          "directive": "빈칸 앞뒤 단서를 더 함축적이고 간접적으로 다듬어서, 학생이 글의 논리 흐름을 파악해야만 정답을 유추하게 해 줘. 불필요한 명시적 힌트는 제거."
        }
      ],
      "defaultValue": "keep"
    },
    {
      "id": "answerScope",
      "kind": "segmented",
      "label": "빈칸 표현 범위",
      "hint": "정답이 될 표현의 언어 단위(단어/구/절)",
      "options": [
        {
          "value": "keep",
          "label": "유지",
          "directive": null
        },
        {
          "value": "phrase",
          "label": "구 단위(2~4단어)",
          "directive": "정답을 단어 1개가 아니라 의미를 갖는 구(noun phrase, verb phrase 등) 단위로 바꿔 줘. 예: 'policy' → 'monetary policy'. 문장 길이와 빈칸 표시(_____)를 그에 맞춰."
        },
        {
          "value": "singleton",
          "label": "단어 1개",
          "directive": "정답을 핵심 단어 1개로 단순화해 줘. 불필요한 수식어나 보어는 제거하고 최소 단위의 핵심 어휘로."
        }
      ],
      "defaultValue": "keep"
    },
    {
      "id": "topicAlignment",
      "kind": "toggle",
      "label": "주제 직결 강화",
      "hint": "빈칸 표현이 글의 핵심 주제·주장과 직접 연결되도록",
      "badges": [
        "주제성 ↑"
      ],
      "options": [
        {
          "value": "off",
          "label": "끄기",
          "directive": null
        },
        {
          "value": "on",
          "label": "적용",
          "directive": "빈칸으로 만들 핵심 표현을 글의 주제·핵심 주장과 더 직결되는 표현으로 바꿔 줘. 현재 표현이 지엽적이거나 보조 개념이라면 글의 중심 아이디어를 대표하는 표현으로 교체해. 그에 따라 문맥 단서도 정합하게 조정."
        }
      ],
      "defaultValue": "off"
    },
    {
      "id": "inferenceDepth",
      "kind": "segmented",
      "label": "추론 깊이",
      "hint": "정답을 얻기 위해 필요한 사고의 깊이",
      "options": [
        {
          "value": "keep",
          "label": "유지",
          "directive": null
        },
        {
          "value": "direct",
          "label": "직접 참조",
          "directive": "정답이 글의 명시적 표현에서 직접 추출하거나 동일한 표현을 찾으면 되도록 다시 구성해 줘. 복잡한 추론이나 함축 의미 파악은 불필요하게."
        },
        {
          "value": "logical",
          "label": "논리 추론",
          "directive": "정답을 얻으려면 글의 논리 흐름(원인→결과, 대조, 목적 등)을 따라가야 하도록 다시 구성해 줘. 명시적 표현은 아니지만 문맥의 논리로부터 필연적으로 유도되는 답으로."
        }
      ],
      "defaultValue": "keep"
    }
  ],
  "SUMMARY_COMPLETE": [
    {
      "id": "blankInferenceLevel",
      "kind": "segmented",
      "label": "빈칸 난이도",
      "hint": "정답 어휘의 추론 필요도를 조정",
      "badges": [
        "난이도 조절"
      ],
      "options": [
        {
          "value": "keep",
          "label": "유지",
          "directive": null
        },
        {
          "value": "explicit",
          "label": "명시적",
          "directive": "빈칸 정답을 지문의 핵심 표현 중에서 그대로 찾을 수 있는 명시적 어휘로 다시 선정해서, 학생이 문맥에서 쉽게 유추할 수 있도록 해 줘. 요약문은 그에 맞춰 자연스럽게 다시 구성해 줘."
        },
        {
          "value": "inferential",
          "label": "추론형",
          "directive": "빈칸 정답을 지문의 핵심 개념을 다른 표현(동의어·상위어·개념적 변환)으로 인코딩한 어휘로 바꿔, 학생이 더 정교한 추론을 통해 유도해야 하도록 해 줘. 요약문 정합성도 점검해."
        }
      ],
      "defaultValue": "keep"
    },
    {
      "id": "summaryPrecision",
      "kind": "toggle",
      "label": "요약문 정교화",
      "hint": "요약문이 글 전체를 더 정확히 압축하도록 개선",
      "badges": [
        "품질 ↑"
      ],
      "options": [
        {
          "value": "off",
          "label": "끄기",
          "directive": null
        },
        {
          "value": "on",
          "label": "적용",
          "directive": "요약문이 글 전체의 주제·논리를 더 정확하고 포괄적으로 압축하도록 다시 다듬어 줘. 빈칸 정답도 새 요약문에 맞춰 함께 갱신하고, 요약문 자체 문법·문체가 학위논문이나 학생 에세이처럼 자연스럽게 흘러가도록 해 줘."
        }
      ],
      "defaultValue": "off"
    },
    {
      "id": "answerKeyword",
      "kind": "toggle",
      "label": "핵심 어휘 강화",
      "hint": "정답 어휘를 지문 주제와 더 직결되게",
      "options": [
        {
          "value": "off",
          "label": "끄기",
          "directive": null
        },
        {
          "value": "on",
          "label": "적용",
          "directive": "빈칸 정답을 단순한 짝짓기나 일반 어휘가 아니라, 글의 중심 주제·논리와 직결되는 더 핵심적인 개념 어휘로 바꿔 줘. 예를 들어 '긍정적'→'상호협력', '중요하다'→'필수불가결' 같은 수준. 학습 포인트(keyPoints)도 새 어휘에 맞춰 조정해."
        }
      ],
      "defaultValue": "off"
    }
  ],
  "SUMMARY_WRITING": [
    {
      "id": "clueModeConfig",
      "kind": "segmented",
      "label": "단서 방식 변경",
      "hint": "빈칸을 푸는 난이도와 도움말 제공 수준",
      "badges": [
        "난이도 조정"
      ],
      "options": [
        {
          "value": "keep",
          "label": "유지",
          "directive": null
        },
        {
          "value": "none",
          "label": "단서 없음",
          "directive": "clueMode를 'none'으로 설정해서 빈칸에 단서를 제공하지 않게 해 줘. 학생이 보기와 해석만 보고 풀어야 하므로 난이도가 올라간다. 빈칸 개수는 유지해."
        },
        {
          "value": "firstLetter",
          "label": "첫글자 단서",
          "directive": "clueMode를 'firstLetter'로 설정해서 각 빈칸 정답의 단어별 첫 글자만 소문자로 표시(예: 'p s d')해 줘. 각 blank.firstLetterHint에 정답(answer) 토큰을 공백으로 분리해서 채워. 이 단서로 난이도를 낮춰. 빈칸 개수는 유지해."
        },
        {
          "value": "wordCount",
          "label": "단어수 표시",
          "directive": "clueMode를 'wordCount'로 설정해서 각 빈칸에 목표 단어수를 '약 N단어' 형식으로 표시해 줘. targetWordsMode='approx'를 유지하고 각 blank.targetWordCount에 예상 단어 수를 채워. 난이도를 낮춰."
        },
        {
          "value": "skeleton",
          "label": "골격 표시",
          "directive": "clueMode를 'skeleton'으로 설정해서 각 빈칸 정답의 '골격'(주요 단어 약자/음절 패턴)을 표시해 줘. 예: answer='which allows'면 골격을 'w____ a_____' 같이. 난이도를 낮춰. 빈칸 개수는 유지해."
        }
      ],
      "defaultValue": "keep"
    },
    {
      "id": "wordBankConfig",
      "kind": "segmented",
      "label": "보기(Word Bank) 제공",
      "hint": "학생이 선택할 수 있는 단어/구 칩 제공 여부",
      "badges": [
        "난이도 ↓"
      ],
      "options": [
        {
          "value": "keep",
          "label": "유지",
          "directive": null
        },
        {
          "value": "off",
          "label": "끄기",
          "directive": "wordBankEnabled를 false로 설정하거나 wordBank 배열을 비워서 보기를 제공하지 않게 해 줘. 학생이 직접 영작만으로 풀어야 하므로 난이도가 올라간다. 정답 단어들을 학생면에 노출하지 마. 빈칸 개수는 유지해."
        },
        {
          "value": "on",
          "label": "제공",
          "directive": "wordBankEnabled를 true로 설정해서 보기를 제공해 줘. wordBank 배열에 정답에 쓰이는 단어들과 미끼(정답에 안 쓰이는) 단어를 섞어서 넣되, 정답 단어 자체는 학생이 보기에서 직접 알아낼 수 없게 미끼와 배치해. wordBankDistractors에 미끼 목록을 (교사면 전용으로) 기록해. 난이도를 낮춰. 빈칸 개수는 유지해."
        }
      ],
      "defaultValue": "keep"
    },
    {
      "id": "koreanGlossConfig",
      "kind": "segmented",
      "label": "해석([해석] 박스) 제공",
      "hint": "요약문 전체의 한국어 뜻을 제공할지 여부",
      "options": [
        {
          "value": "keep",
          "label": "유지",
          "directive": null
        },
        {
          "value": "off",
          "label": "끄기",
          "directive": "koreanGloss를 비우거나 제거해서 [해석] 박스를 학생에게 보이지 않게 해 줘. 학생이 영어 요약문만 보고 맥락을 파악해야 하므로 난이도가 올라간다. 교사면에는 koreanGloss를 여전히 유지해 검수 용이. 빈칸 개수는 유지해."
        },
        {
          "value": "on",
          "label": "제공",
          "directive": "koreanGloss 필드에 요약문 전체의 자연스러운 한국어 해석을 채워 줘. 개별 빈칸마다 1:1 직역으로 정답을 노출하면 안 되고, 전체 문맥 의미만 전달하도록 작성. 보기(wordBank)와 조합했을 때도 정답 단어가 시각적으로 드러나지 않아야 함. 난이도를 낮춰. 빈칸 개수는 유지해."
        }
      ],
      "defaultValue": "keep"
    }
  ],
  "WORD_ORDER": [
    {
      "id": "contextHintClarity",
      "kind": "segmented",
      "label": "힌트 유형",
      "hint": "배열 문제의 한국어 힌트(contextHint)를 재구성",
      "badges": [
        "명확성 ↑"
      ],
      "options": [
        {
          "value": "keep",
          "label": "유지",
          "directive": null
        },
        {
          "value": "structural",
          "label": "구조 단서",
          "directive": "contextHint를 주어-술어-목적어 구조나 시간·인과 순서처럼 문장 구조 정보 중심으로 다듬어 줘. 학생이 단어 순서의 논리적 골격을 파악하도록."
        },
        {
          "value": "semantic",
          "label": "의미 맥락",
          "directive": "contextHint를 글의 의미 맥락(주제·상황·핵심 표현)을 바탕으로 다시 작성해 줘. 문장이 어떤 상황·주제에서 나올 문장인지 명확히."
        },
        {
          "value": "explicit",
          "label": "명시적 제약",
          "directive": "contextHint에 '~로 시작'·'~로 끝남' 같은 명시적 제약을 추가해 배열 난이도를 적절히 조절해 줘."
        }
      ],
      "defaultValue": "keep"
    },
    {
      "id": "wordGrouping",
      "kind": "toggle",
      "label": "단어 묶음 최적화",
      "hint": "복합 표현(구/절) 묶음 재검토",
      "badges": [
        "가독성 ↑"
      ],
      "options": [
        {
          "value": "off",
          "label": "끄기",
          "directive": null
        },
        {
          "value": "on",
          "label": "적용",
          "directive": "scrambledWords 의 단어/구 묶음을 재검토해 줘. 명사구·전치사구·접속사절처럼 의미 단위로 묶이도록 하되, 배열 난이도는 유지. 학생이 논리적으로 문장을 재구성할 수 있게."
        }
      ],
      "defaultValue": "off"
    },
    {
      "id": "answerVariety",
      "kind": "toggle",
      "label": "모범답안 다양화",
      "hint": "같은 의미의 다른 문장으로",
      "options": [
        {
          "value": "off",
          "label": "끄기",
          "directive": null
        },
        {
          "value": "on",
          "label": "적용",
          "directive": "modelAnswer 를 같은 의미의 다른 영어 표현으로 바꿔 줘(다른 시제·수동태·구조 변형 등). scrambledWords 는 새로운 modelAnswer 에 맞게 조정하고 contextHint도 그에 맞춰. 정답 구조와 배열 난이도는 균형있게."
        }
      ],
      "defaultValue": "off"
    }
  ],
  "GRAMMAR_CORRECTION": [
    {
      "id": "grammarPointCategory",
      "kind": "segmented",
      "label": "문법 포인트",
      "hint": "정정 대상 어법 개념을 특정하면 정답 밑줄과 정정안이 그에 맞춰 재구성됨",
      "badges": [
        "포인트 집중"
      ],
      "options": [
        {
          "value": "keep",
          "label": "유지",
          "directive": null
        },
        {
          "value": "subjectVerbAgreement",
          "label": "수일치(주동일치)",
          "directive": "문법 오류를 주어-동사 수일치(단수/복수) 또는 도치·삽입구 속 수일치로 통일해 줘. 모든 밑줄 구간의 정정안이 수일치 포인트를 명확히 드러내도록 다듬어."
        },
        {
          "value": "tenseAspect",
          "label": "시제·시상",
          "directive": "문법 오류를 시제·시상(현재완료/과거완료/시제일치/조건문 시제) 중심으로 재구성해 줘. 모든 밑줄의 정정안이 시제 판단으로 명확하게 구분되도록."
        },
        {
          "value": "relativeClause",
          "label": "관계사",
          "directive": "문법 오류를 관계대명사/관계부사(that/which/what, 전치사+관계대명사) 선택 또는 생략 중심으로 바꿔 줘. 정정안을 관계사 포인트 하나로 통일."
        },
        {
          "value": "voiceModality",
          "label": "태·조동사",
          "directive": "문법 오류를 능동/수동태 판단 또는 조동사(can/must/should/might 등) 및 조동사+have p.p. 중심으로 다시 구성해 줘."
        }
      ],
      "defaultValue": "keep"
    },
    {
      "id": "correctingPrecision",
      "kind": "toggle",
      "label": "정정안 정교화",
      "hint": "각 밑줄 구간의 오류와 정정안을 더 명확하고 구체적으로 다듬음",
      "badges": [
        "명확성 ↑"
      ],
      "options": [
        {
          "value": "off",
          "label": "끄기",
          "directive": null
        },
        {
          "value": "on",
          "label": "적용",
          "directive": "각 밑줄 구간의 오류 표현(errorPart)과 정정안(correctedPart)을 더 명확하고 구체적으로 다듬어 줘. 오류의 원인(수일치 실수, 시제 오류, 태 혼동 등)이 정정안으로 명확히 보이도록. 해설도 그에 맞춰 정교화하고 학습 포인트를 강화해."
        }
      ],
      "defaultValue": "off"
    }
  ],
  "CONTEXT_MEANING": [
    {
      "id": "contextDependency",
      "kind": "toggle",
      "label": "문맥의존도 강화",
      "hint": "밑줄 단어를 더 문맥에 종속된 표현으로 바꿔 사전 뜻만으로는 풀 수 없게",
      "badges": [
        "난이도 ↑",
        "변별력 ↑"
      ],
      "options": [
        {
          "value": "off",
          "label": "끄기",
          "directive": null
        },
        {
          "value": "on",
          "label": "적용",
          "directive": "밑줄 칠 단어를 더 높은 문맥의존도를 가진 다의어나 관용표현으로 바꿔 주세요. 사전에 있는 뜻 하나만으로는 풀 수 없고, 지문의 문맥을 꼼꼼히 읽어야만 정답을 고를 수 있도록. 정답 선지와 오답을 그에 맞춰 갱신해 주세요."
        }
      ],
      "defaultValue": "off"
    },
    {
      "id": "decoyQuality",
      "kind": "segmented",
      "label": "오답 함정 전략",
      "hint": "오답이 어떤 방식으로 학생을 유인할지",
      "options": [
        {
          "value": "keep",
          "label": "유지",
          "directive": null
        },
        {
          "value": "literal",
          "label": "사전적 의미",
          "directive": "오답 선지를 밑줄 단어의 사전적·원래 의미로 채워서, 문맥을 무시하고 사전만 찾는 학생을 함정에 빠뜨리게 해 주세요. 정답은 그 지문의 문맥상 정확한 의미만 남기고."
        },
        {
          "value": "similarity",
          "label": "유사 의미",
          "directive": "오답 선지를 정답과 의미가 비슷하지만 뉘앙스나 용법이 다른 동의어로 만들어, 문맥을 꼼꼼히 읽지 않으면 구별 어렵게 해 주세요. 함정의 그럴듯함을 높여."
        },
        {
          "value": "frequency",
          "label": "고빈도 동의어",
          "directive": "오답 선지를 밑줄 단어의 흔한 동의어들로 채워서, 학생들이 자주 아는 뜻 중 하나를 고르도록 유인하되 문맥상 부정확하게 해 주세요."
        }
      ],
      "defaultValue": "keep"
    }
  ],
  "SYNONYM": [
    {
      "id": "decoyQuality",
      "kind": "segmented",
      "label": "오답 선지 전략",
      "hint": "비슷한 의미 단어들 중 정답이 아닌 것을 어떤 방식으로 구성할지",
      "badges": [
        "변별력 ↑"
      ],
      "options": [
        {
          "value": "keep",
          "label": "유지",
          "directive": null
        },
        {
          "value": "contextDependent",
          "label": "문맥 의존도 ↑",
          "directive": "오답 선지들(정답 제외)이 각각 특정 문맥에서는 어울릴 법하지만, 주어진 contextSentence에서만 정답이 유일하게 최적인 단어가 되도록 다시 구성해 줘. 예를 들어 'begin'은 모든 맥락에 쓸 수 있지만 'commence'는 형식적일 때만 쓰인다는 식으로 미묘하게 다르게 해."
        },
        {
          "value": "semanticDifference",
          "label": "의미축 분화",
          "directive": "오답 선지를 의미가 비슷해 보이지만 미묘하게 다른 축에서 구분되게 다시 선택해 줘. 예: 'robust'(강함) vs 'durable'(지속성) vs 'hardy'(혹독한 환경 저항). 정답(targetWord)만 contextSentence 맥락에서 100% 적절하도록."
        },
        {
          "value": "commonMistakes",
          "label": "학생 착각 함정",
          "directive": "오답을 한국 학생들이 자주 헷갈리는 단어들로 구성해 줘. 예를 들어 사전에는 유사하지만 실제 원문 맥락에서 정답과 자주 혼동되는 오답들. 잘못된 선택에 대한 해설도 정교하게."
        }
      ],
      "defaultValue": "keep"
    },
    {
      "id": "contextIntensity",
      "kind": "toggle",
      "label": "문맥 강화(암기 방지)",
      "hint": "단어만 외운 학생도 풀 수 없도록 contextSentence의 함의성 증대",
      "badges": [
        "암기 방지",
        "난이도 ↑"
      ],
      "options": [
        {
          "value": "off",
          "label": "끄기",
          "directive": null
        },
        {
          "value": "on",
          "label": "적용",
          "directive": "contextSentence를 더 복잡하고 미묘한 의미 함의를 담도록 다시 쓰되, targetWord의 뉘앙스를 완전히 이해해야만 정답을 고를 수 있게 해 줘. 예: 단순 'The book is big' → '이 복잡한 원리는 그 '~'란 단어로만 정확히 표현된다'는 식으로. 선지는 가능하면 유지."
        }
      ],
      "defaultValue": "off"
    }
  ],
  "ANTONYM": [
    {
      "id": "correctPairClarityMode",
      "kind": "segmented",
      "label": "올바른 쌍 반의 명확도",
      "hint": "올바른 4개 쌍의 반의어 관계를 얼마나 분명히 할지 선택",
      "options": [
        {
          "value": "keep",
          "label": "유지",
          "directive": null
        },
        {
          "value": "explicit",
          "label": "확연한 반의",
          "directive": "올바른 반의어 쌍 4개를 더 확실하고 명확한 반의어 관계로 다듬어 줘(antiphrase 원칙, 의미상 정면 대립). 예: good↔bad, hot↔cold, strong↔weak 같이 대조가 확연한 쌍."
        },
        {
          "value": "subtle",
          "label": "미묘한 반의",
          "directive": "올바른 반의어 쌍 4개를 더 미묘하고 정교한 반의어로 다듬어 줘(문맥상 대조지만 완벽한 정반대 아님). 의미 간격을 벌리되 단순 반의는 아닌 표현들로 구성."
        }
      ],
      "defaultValue": "keep"
    },
    {
      "id": "incorrectPairAmbiguity",
      "kind": "toggle",
      "label": "정답 쌍 모호성 강화",
      "hint": "정답(잘못된 쌍 1개)를 더 애매/그럴듯하게 → 난이도↑",
      "badges": [
        "난이도 ↑",
        "변별력 상↑"
      ],
      "options": [
        {
          "value": "off",
          "label": "끄기",
          "directive": null
        },
        {
          "value": "on",
          "label": "적용",
          "directive": "정답(잘못된 반의어 쌍)을 더 미묘하고 그럴듯하게 만들어 줘. 정답 쌍의 antonym 이 정답 word 와 실제로는 의미상 어느 정도 관련이 있거나 헷갈릴 여지가 있게(하지만 진정한 반의어는 아님). 학생들이 한 번씩 끌릴 수 있도록."
        }
      ],
      "defaultValue": "off"
    }
  ]
};
