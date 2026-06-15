/* ============================================================
   smoat IR Deck — 체험 섹션 데이터
   실제 서비스의 문제 카드 필드 구조(발문/변형 지문/선지/정답/해설/오답 해설)를
   그대로 본뜬 사전 제작 시뮬레이션 데이터.
   ============================================================ */
window.DEMO_DATA = {
  passage:
    "Far from being a mere convenience, the habit of recording what we learn changes the way we think. When students put an idea into their own words, they are forced to notice the gaps in their understanding that passive reading conceals. This act of translation — from someone else's language into one's own — is precisely where learning occurs. Researchers who compared note-taking methods found that students who summarized lectures in their own words retained the material far longer than those who copied them word for word. The effort itself, not the record it produces, is what matters. In other words, the value of writing lies less in preserving information than in transforming the writer.",

  questions: {
    "빈칸 추론": {
      cat: "수능·모의 객관식",
      direction: "다음 글의 빈칸에 들어갈 말로 가장 적절한 것을 고르시오.",
      passage:
        "Far from being a mere convenience, the habit of recording what we learn changes the way we think. (중략) Researchers who compared note-taking methods found that students who summarized lectures in their own words retained the material far longer than those who copied them word for word. The effort itself, not the record it produces, is what matters. In other words, the value of writing lies less in preserving information than in <span class=\"blank\">_______________</span>.",
      options: [
        "recording facts as accurately as possible",
        "impressing readers with an elegant style",
        "transforming the writer himself",
        "saving time for further review",
        "collecting as many sources as possible",
      ],
      answer: 3,
      explanation:
        "글 전체의 논지는 '기록의 가치는 정보 보존이 아니라, 자기 말로 옮기는 행위가 학습자를 변화시키는 데 있다'입니다. 직접 요약한 학생이 더 오래 기억했다는 연구와 'The effort itself ... is what matters'가 결정적 단서로, 빈칸에는 '쓰는 사람 자신을 변화시키는 것'이 와야 합니다.",
      wrong: [
        "① '정확한 기록'은 글이 명시적으로 부정하는 '보존(preserving)' 관점의 재진술 — 매력적 오답.",
        "② 문체·인상은 글에서 언급되지 않음.",
        "④ 복습 시간 절약은 무관한 실용적 이점.",
        "⑤ 자료 수집은 글의 소재가 아님.",
      ],
    },
    "어법": {
      cat: "수능·모의 객관식",
      direction: "다음 글의 밑줄 친 부분 중, 어법상 틀린 것을 고르시오.",
      passage:
        "Far from <span class=\"mk\">① being</span> a mere convenience, the habit of recording what we learn changes the way we think. When students put an idea into their own words, they are forced <span class=\"mk\">② to notice</span> the gaps in their understanding that passive reading conceals. This act of translation is precisely <span class=\"mk\">③ where</span> learning occurs. Researchers found that students who summarized lectures in their own words <span class=\"mk\">④ retaining</span> the material far longer than those who copied them word for word. The effort itself, not the record it produces, is <span class=\"mk\">⑤ what</span> matters.",
      options: [
        "① being — 전치사 from의 목적어 자리",
        "② to notice — be forced to-V 구문",
        "③ where — 보어 자리의 관계부사절",
        "④ retaining — that절 내 본동사 자리",
        "⑤ what — 선행사를 포함한 관계대명사",
      ],
      answer: 4,
      explanation:
        "found의 목적어인 that절에서 주어는 students(who summarized ... words는 수식절)이고, 이에 대응하는 본동사가 필요합니다. retaining(분사)을 쓰면 절에 동사가 없게 되므로 retained로 고쳐야 합니다.",
      wrong: [
        "① Far from -ing(결코 ~이 아닌)의 관용 구조로 적절.",
        "② be forced to-V '~하지 않을 수 없다' — 적절.",
        "③ 'is precisely where ...'는 보어로 쓰인 관계부사절 — 적절.",
        "⑤ The effort is what matters — 선행사 포함 관계대명사 what — 적절.",
      ],
    },
    "글의 순서": {
      cat: "수능·모의 객관식",
      direction:
        "주어진 글 다음에 이어질 글의 순서로 가장 적절한 것을 고르시오.",
      passage:
        "<b>[주어진 글]</b> Far from being a mere convenience, the habit of recording what we learn changes the way we think.<br/><br/>" +
        "<b>(A)</b> The effort itself, not the record it produces, is what matters. In other words, the value of writing lies less in preserving information than in transforming the writer.<br/><br/>" +
        "<b>(B)</b> When students put an idea into their own words, they are forced to notice the gaps in their understanding that passive reading conceals. This act of translation is precisely where learning occurs.<br/><br/>" +
        "<b>(C)</b> Researchers who compared note-taking methods found that students who summarized lectures in their own words retained the material far longer than those who copied them word for word.",
      options: ["(A) - (C) - (B)", "(B) - (A) - (C)", "(B) - (C) - (A)", "(C) - (A) - (B)", "(C) - (B) - (A)"],
      answer: 3,
      explanation:
        "주어진 글의 일반 진술(기록 습관이 사고를 바꾼다)을 (B)가 구체적 메커니즘(자기 말로 옮기며 이해의 공백을 발견)으로 풀고, (C)가 연구 결과로 뒷받침하며, (A)가 'In other words'로 전체 논지를 재진술하며 마무리합니다. 따라서 (B)-(C)-(A).",
      wrong: [
        "(A)는 'The effort itself'가 (C)의 실험 내용을 전제하므로 처음에 올 수 없음.",
        "(C)의 연구는 (B)의 주장에 대한 근거이므로 (B)보다 먼저 오면 논리가 끊김.",
      ],
    },
    "요약문 완성": {
      cat: "내신 서술형 연계",
      direction:
        "다음 글의 내용을 한 문장으로 요약하고자 한다. 빈칸 (A), (B)에 들어갈 말로 가장 적절한 것을 고르시오.",
      passage:
        "<b>[요약문]</b> Writing about what one learns is valuable not because it <span class=\"blank\">__(A)__</span> knowledge, but because the very act of expressing ideas in one's own words <span class=\"blank\">__(B)__</span> the learner's understanding.",
      options: [
        "(A) stores ······ (B) deepens",
        "(A) stores ······ (B) distorts",
        "(A) creates ····· (B) deepens",
        "(A) creates ····· (B) simplifies",
        "(A) shares ······ (B) distorts",
      ],
      answer: 1,
      explanation:
        "글의 핵심 대비는 '정보의 보존(preserving) vs 학습자의 변화(transforming)'입니다. (A)에는 글이 부정하는 가치인 '저장하다(stores)', (B)에는 자기 말로 표현하는 행위가 이해를 '깊게 한다(deepens)'가 들어가야 요약이 성립합니다.",
      wrong: [
        "②⑤ distorts(왜곡하다)는 글의 긍정적 논지와 반대.",
        "③④ creates는 (A) 자리의 '보존' 의미와 불일치 — 글은 지식의 '생성'을 부정한 적이 없음.",
      ],
    },
  },

  // 생성 단계 연출 (실제 파이프라인의 단계명 차용)
  phases: [
    "지문 구조 분석 중 — 문장 9개 · 논리 흐름 추출",
    "출제 포인트 선정 중 — 유형 적합 스팬 탐색",
    "오답 선지 설계 중 — 매력적 오답 · 함정 시나리오",
    "품질 게이트 검증 중 — 정답 위치 다양성 · 힌트 누출 검사",
  ],
};
