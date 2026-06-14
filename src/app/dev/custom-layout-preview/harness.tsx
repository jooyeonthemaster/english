"use client";

import { CustomLayoutRenderer } from "@/components/workbench/custom-layout-renderer";

// 괴랄한 내신 형식 픽스처 — structuredData(q) 형태 그대로. 각 카드가 실제 QuestionCard 의
// 구조화 렌더 경로와 동일한 입력을 받는다.

const FIXTURES: Array<{ key: string; title: string; q: Record<string, unknown> }> = [
  {
    key: "word-table",
    title: "단어/구-뜻 표 매칭 (ⓐ~ⓔ 라벨 밑줄 + 표 선지)",
    q: {
      _typeId: "CUSTOM_LAYOUT",
      correctAnswer: "④",
      explanation: "문맥상 ④의 정의만 본문 의미와 일치한다.",
      keyPoints: ["문맥 어휘 추론"],
      wrongOptionExplanations: { "①": "사전적이지만 문맥과 불일치.", "②": "부정적 의미로 오용." },
      layout: {
        version: 1,
        direction: "다음 글의 밑줄 친 단어/구의 문맥상 의미로 가장 적절한 것은?",
        blocks: [
          {
            kind: "BOX",
            label: "",
            text: "Because both parties review each other, these digital platforms create a ⓐ __trusting__ environment even among complete strangers. The gig economy ⓑ __takes advantage of__ \"idle capacity\" to better ⓒ __utilize__ assets. However, most major players ⓓ __take a cut__ of every transaction. With so much money ⓔ __at stake__, the new world of work can be dark.",
            items: [],
            tableHeaders: [],
            tableRows: [],
          },
        ],
        choices: {
          markerStyle: "CIRCLED_NUM",
          layout: "TABLE",
          itemPattern: "TABLE_ROW",
          pairSeparator: "",
          columnHeaders: ["Word / Phrase", "Meaning"],
          items: [
            { label: "①", text: "", cells: ["ⓐ trusting", "deserving of trust; reliable and honest"] },
            { label: "②", text: "", cells: ["ⓑ takes advantage of", "unfairly exploits a person"] },
            { label: "③", text: "", cells: ["ⓒ utilize", "to alter the physical structure of an object"] },
            { label: "④", text: "", cells: ["ⓓ take a cut", "to receive a share of money from a transaction"] },
            { label: "⑤", text: "", cells: ["ⓔ at stake", "physically fastened with wooden posts"] },
          ],
        },
        answerLineCount: 0,
      },
    },
  },
  {
    key: "triple",
    title: "(X)(Y)(Z) 연결어 3칸 조합 (표 배치)",
    q: {
      _typeId: "CUSTOM_LAYOUT",
      correctAnswer: "④",
      explanation: "역접-양보-부가 조합이 문맥 정합.",
      layout: {
        version: 1,
        direction: "위 글의 (X), (Y), (Z)에 들어갈 말로 가장 적절한 것은?",
        blocks: [
          {
            kind: "TEXT",
            label: "",
            text: "Gig workers report flexibility. (X) _____, they are less likely to be satisfied. Many still join. (Y) _____, the freedom appeals to them. (Z) _____, the shift creates less stable labor conditions.",
            items: [],
            tableHeaders: [],
            tableRows: [],
          },
        ],
        choices: {
          markerStyle: "CIRCLED_NUM",
          layout: "TABLE",
          itemPattern: "TRIPLE",
          pairSeparator: "—",
          columnHeaders: ["(X)", "(Y)", "(Z)"],
          items: [
            { label: "①", text: "", cells: ["As a result", "Moreover", "Furthermore"] },
            { label: "②", text: "", cells: ["As a result", "Yet", "Furthermore"] },
            { label: "③", text: "", cells: ["However", "Moreover", "Otherwise"] },
            { label: "④", text: "", cells: ["However", "Yet", "Furthermore"] },
            { label: "⑤", text: "", cells: ["However", "Yet", "Otherwise"] },
          ],
        },
        answerLineCount: 0,
      },
    },
  },
  {
    key: "combo",
    title: "어법 ⓐ~ⓔ 틀린 것 2개 조합 (INLINE 선지)",
    q: {
      _typeId: "CUSTOM_LAYOUT",
      correctAnswer: "③",
      explanation: "ⓑ는 수일치, ⓓ는 분사 형태 오류.",
      layout: {
        version: 1,
        direction: "다음 글의 밑줄 친 ⓐ~ⓔ 중, 어법상 틀린 것끼리 짝지어진 것은?",
        blocks: [
          {
            kind: "TEXT",
            label: "",
            text: "Sharing platforms ⓐ __have grown__ rapidly because both parties ⓑ __reviews__ each other. The economy takes advantage of idle capacity, ⓒ __which__ should be good for owners. Most players, ⓓ __taken__ a cut of every transaction, are for-profit, and the world of work ⓔ __can be__ unfriendly.",
            items: [],
            tableHeaders: [],
            tableRows: [],
          },
        ],
        choices: {
          markerStyle: "CIRCLED_NUM",
          layout: "INLINE",
          itemPattern: "COMBINATION",
          pairSeparator: "",
          columnHeaders: [],
          items: [
            { label: "①", text: "ⓐ, ⓒ", cells: [] },
            { label: "②", text: "ⓐ, ⓓ", cells: [] },
            { label: "③", text: "ⓑ, ⓓ", cells: [] },
            { label: "④", text: "ⓑ, ⓔ", cells: [] },
            { label: "⑤", text: "ⓒ, ⓔ", cells: [] },
          ],
        },
        answerLineCount: 0,
      },
    },
  },
  {
    key: "essay",
    title: "서술형: 빈칸 (A)(B) + 조건 박스 + 답 슬롯 + 답란 3줄",
    q: {
      _typeId: "CUSTOM_LAYOUT",
      correctAnswer: "(A) utilize, (B) taking",
      modelAnswer: "(A) utilize, (B) taking",
      explanation: "요약문 문맥과 어형 변형.",
      layout: {
        version: 1,
        direction: "위 글의 빈칸 (A), (B)에 들어갈 말을 〈조건〉에 맞게 쓰시오.",
        blocks: [
          {
            kind: "TEXT",
            label: "",
            text: "Although digital platforms are designed to (A) _____ idle capacity, many of them are actually (B) _____ a cut of transactions for profit.",
            items: [],
            tableHeaders: [],
            tableRows: [],
          },
          {
            kind: "CONDITIONS",
            label: "조건",
            text: "",
            items: [
              { label: "1.", text: "본문에서 단어 'utilize'와 'take'를 찾아 각각 알맞게 배열할 것." },
              { label: "2.", text: "문맥과 어법에 맞게 필요한 경우 어형을 변화시켜 쓸 것." },
            ],
            tableHeaders: [],
            tableRows: [],
          },
          {
            kind: "ANSWER_FORM",
            label: "",
            text: "",
            items: [
              { label: "(A)", text: "" },
              { label: "(B)", text: "" },
            ],
            tableHeaders: [],
            tableRows: [],
          },
        ],
        choices: null,
        answerLineCount: 3,
      },
    },
  },
  {
    key: "notice",
    title: "안내문(포스터) 불일치 — 제목 + 불릿 + 한국어 선지",
    q: {
      _typeId: "CUSTOM_LAYOUT",
      correctAnswer: "③",
      explanation: "무료 시식은 2시간 동안 진행된다.",
      layout: {
        version: 1,
        direction: "Food Truck Festival에 관한 다음 안내문의 내용과 일치하지 않는 것은?",
        blocks: [
          {
            kind: "BOX",
            label: "Food Truck Festival",
            text: "Come hungry and leave happy! Join our annual food truck festival with over 20 trucks.\n\nWhen & Where\n• August 16, from 11 a.m. to 9 p.m.\n• Emton Park\n\nFestival Highlights\n• Free sample tastings between 2 p.m. and 3 p.m.\n• Live music performances throughout the festival\n• Cookie-making classes for children\n\nNotes\n• There is no entry fee.\n• Parking is available for free.",
            items: [],
            tableHeaders: [],
            tableRows: [],
          },
        ],
        choices: {
          markerStyle: "CIRCLED_NUM",
          layout: "VERTICAL",
          itemPattern: "TEXT",
          pairSeparator: "",
          columnHeaders: [],
          items: [
            { label: "①", text: "1년에 한 번 열리는 축제이다.", cells: [] },
            { label: "②", text: "오전 11시에 시작한다.", cells: [] },
            { label: "③", text: "무료 시식은 3시간 동안 진행된다.", cells: [] },
            { label: "④", text: "어린이를 위한 쿠키 만들기 수업이 있다.", cells: [] },
            { label: "⑤", text: "입장료를 지불하지 않아도 된다.", cells: [] },
          ],
        },
        answerLineCount: 0,
      },
    },
  },
  {
    key: "order",
    title: "순서배열: 주어진 문장 + (A)(B)(C) 박스 단락 + 2단 순서 선지",
    q: {
      _typeId: "CUSTOM_LAYOUT",
      correctAnswer: "②",
      explanation: "지시어와 연결어 단서로 (B)-(A)-(C).",
      layout: {
        version: 1,
        direction: "주어진 글 다음에 이어질 글의 순서로 가장 적절한 것은?",
        blocks: [
          {
            kind: "GIVEN",
            label: "",
            text: "Princeton University recently announced that all students would be required to study an additional language.",
            items: [],
            tableHeaders: [],
            tableRows: [],
          },
          {
            kind: "LABELED_PARAS",
            label: "",
            text: "",
            items: [
              { label: "(A)", text: "Between students of different backgrounds and opinions, there have been many conflicts recently on university campuses." },
              { label: "(B)", text: "More universities should follow Princeton's lead, as language study could lead to an increased tolerance of different cultural norms." },
              { label: "(C)", text: "Because of this, a little more tolerance would help everyone." },
            ],
            tableHeaders: [],
            tableRows: [],
          },
        ],
        choices: {
          markerStyle: "CIRCLED_NUM",
          layout: "TWO_COLUMN",
          itemPattern: "SEQUENCE",
          pairSeparator: "",
          columnHeaders: [],
          items: [
            { label: "①", text: "(A)-(B)-(C)", cells: [] },
            { label: "②", text: "(B)-(A)-(C)", cells: [] },
            { label: "③", text: "(B)-(C)-(A)", cells: [] },
            { label: "④", text: "(C)-(A)-(B)", cells: [] },
            { label: "⑤", text: "(C)-(B)-(A)", cells: [] },
          ],
        },
        answerLineCount: 0,
      },
    },
  },
];

export function CustomLayoutPreviewHarness() {
  return (
    <div className="min-h-screen bg-slate-100 p-6">
      <h1 className="mb-4 text-[16px] font-black text-slate-900">
        CustomLayoutRenderer 픽스처 하니스 (dev 전용)
      </h1>
      <div className="grid gap-5 xl:grid-cols-2">
        {FIXTURES.map((fixture) => (
          <section
            key={fixture.key}
            data-fixture={fixture.key}
            className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <h2 className="mb-3 border-b border-slate-100 pb-2 text-[12px] font-bold text-blue-700">
              {fixture.title}
            </h2>
            <div className="space-y-3">
              <CustomLayoutRenderer q={fixture.q} />
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
