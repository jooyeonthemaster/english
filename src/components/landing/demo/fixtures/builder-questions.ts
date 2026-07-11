// Step4 시험지 조판 데모용 문항 fixture — 워크벤치 `BuilderQuestion` 계약 그대로
// 수제 작성(제네릭 객관식 유형만 사용해 structuredData 없이도 조판이 완전함).
// makePaperItem → buildGroups → paginateGroups 정규화 파이프라인을 실제로 통과한다.
import type { BuilderQuestion } from "@/components/exams/paper-builder/types";
import { DEMO_PASSAGE } from "./passage";

const DEMO_PASSAGE_REF: BuilderQuestion["passage"] = {
  id: "landing-demo-passage",
  title: DEMO_PASSAGE.title,
  content: DEMO_PASSAGE.text,
  grade: null,
  semester: null,
  publisher: null,
  school: null,
};

function baseQuestion(
  id: string,
  subType: string,
  questionText: string,
  options: { label: string; text: string }[],
  correctAnswer: string,
  explanation: string,
): BuilderQuestion {
  return {
    id,
    type: "MULTIPLE_CHOICE",
    subType,
    questionText,
    options: JSON.stringify(options),
    correctAnswer,
    points: 2,
    difficulty: "INTERMEDIATE",
    tags: null,
    aiGenerated: true,
    approved: true,
    starred: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    setId: null,
    setRender: null,
    passage: DEMO_PASSAGE_REF,
    explanation: { id: `${id}-exp`, content: explanation },
    collectionItems: [],
    examLinks: [],
    _count: { examLinks: 0 },
  };
}

export const DEMO_BUILDER_QUESTIONS: BuilderQuestion[] = [
  baseQuestion(
    "landing-demo-q1",
    "TITLE",
    "다음 글의 제목으로 가장 적절한 것은?",
    [
      { label: "①", text: "The True Value of Saving Money" },
      { label: "②", text: "Christmas Shopping on a Tight Budget" },
      { label: "③", text: "One Dollar and Eighty-Seven Cents: A Portrait of Devotion" },
      { label: "④", text: "How to Bargain with Local Merchants" },
      { label: "⑤", text: "The Economics of Holiday Gift-Giving" },
    ],
    "3",
    "글은 델라가 1달러 87센트를 한 푼씩 아껴 모은 과정과 크리스마스를 앞둔 절망을 통해 헌신적인 사랑을 그리고 있으므로, 제목으로는 ③이 가장 적절합니다.",
  ),
  baseQuestion(
    "landing-demo-q2",
    "TOPIC",
    "다음 글의 주제로 가장 적절한 것은?",
    [
      { label: "①", text: "the difficulty of managing household finances" },
      { label: "②", text: "a devoted wife's desperation over a meager Christmas fund" },
      { label: "③", text: "effective strategies for negotiating with grocers" },
      { label: "④", text: "the commercialization of Christmas traditions" },
      { label: "⑤", text: "the psychological benefits of crying" },
    ],
    "2",
    "한 푼씩 아껴 모았지만 크리스마스 선물을 사기엔 턱없이 부족한 돈 앞에서 무너지는 델라의 상황이 글의 중심 내용이므로 주제는 ②입니다.",
  ),
  baseQuestion(
    "landing-demo-q3",
    "MAIN_IDEA",
    "다음 글의 요지로 가장 적절한 것은?",
    [
      { label: "①", text: "절약은 생활의 안정을 가져다주는 최고의 미덕이다." },
      { label: "②", text: "가난 속에서도 사랑하는 이를 위한 마음은 꺾이지 않는다." },
      { label: "③", text: "상인과의 흥정은 생활비 절감에 필수적이다." },
      { label: "④", text: "충동적인 감정 표현은 문제 해결에 도움이 되지 않는다." },
      { label: "⑤", text: "명절 소비 문화는 서민의 삶을 어렵게 만든다." },
    ],
    "2",
    "볼이 화끈거리는 흥정까지 견디며 돈을 모은 이유가 사랑하는 사람의 선물이라는 점에서, 글의 요지는 ②가 가장 적절합니다.",
  ),
  baseQuestion(
    "landing-demo-q4",
    "CONTENT_MATCH",
    "윗글의 내용과 일치하지 않는 것은?",
    [
      { label: "①", text: "델라가 모은 돈의 60센트는 동전(페니)이었다." },
      { label: "②", text: "델라는 식료품상, 채소 장수, 정육점 주인과 흥정을 했다." },
      { label: "③", text: "델라는 돈을 세 번 세어 보았다." },
      { label: "④", text: "다음 날은 크리스마스였다." },
      { label: "⑤", text: "델라는 돈을 세고 나서 기쁨의 환호성을 질렀다." },
    ],
    "5",
    "돈을 센 뒤 델라는 낡은 소파에 엎드려 흐느꼈다고 했으므로 ⑤는 글의 내용과 일치하지 않습니다.",
  ),
];
