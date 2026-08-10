// ============================================================================
// SMOAT 학습 OS — 트랙 레지스트리 (4트랙)
// 규범: docs/study-os-spec.md §1
//
// 트랙은 동일한 학습 문법(단원 → 개념 레슨 → 훈련 → 시험 → 숙달)을 공유하고
// 콘텐츠 도메인만 다르다. PREPARING 트랙도 정식 카드로 노출하되, 진입하면
// "무엇이 준비되는가 / 지금 대신 할 것"을 반드시 안내한다(죽은 링크 금지).
// ============================================================================

import { FEATURE_FLAGS } from "@/lib/feature-flags";

export type TrackId = "grammar" | "listening" | "vocab" | "school";
export type TrackStatus = "LIVE" | "PREPARING";

export interface StudyTrack {
  id: TrackId;
  name: string;
  /** 한 줄 정체성 */
  tagline: string;
  status: TrackStatus;
  href: string;
  /** lucide 아이콘 이름 (렌더러가 매핑) */
  icon: "SpellCheck" | "Headphones" | "BookA" | "School";
  /** PREPARING 일 때 학생에게 보여줄 준비 내역 (3줄 이내) */
  preparing?: {
    what: string[];
    /** 지금 대신 할 것 */
    insteadLabel: string;
    insteadHref: string;
  };
}

export const STUDY_TRACKS: StudyTrack[] = [
  {
    id: "grammar",
    name: "어법",
    tagline: "문장을 판별하는 눈 — 기초 골격부터 수능 판별까지",
    status: "LIVE",
    href: "/g/track/grammar",
    icon: "SpellCheck",
  },
  {
    id: "listening",
    name: "듣기",
    tagline: "들리는 대로가 아니라 구조로 듣습니다",
    status: "PREPARING",
    href: "/g/track/listening",
    icon: "Headphones",
    preparing: {
      what: [
        "수능·모의고사 듣기 17문항 유형별 훈련",
        "받아쓰기와 청크 단위 끊어 듣기",
        "틀린 문항의 스크립트 구조 분석",
      ],
      insteadLabel: "어법 훈련 이어서 하기",
      insteadHref: "/g/track/grammar",
    },
  },
  FEATURE_FLAGS.ENABLE_VOCAB_DRILL
    ? {
        id: "vocab",
        name: "어휘",
        tagline: "외운 단어가 문장 속에서 살아나게",
        status: "LIVE",
        href: "/g/track/vocab",
        icon: "BookA",
      }
    : {
        id: "vocab",
        name: "어휘",
        tagline: "외운 단어가 문장 속에서 살아나게",
        status: "PREPARING",
        href: "/g/track/vocab",
        icon: "BookA",
        preparing: {
          what: [
            "학년·교재별 어휘장과 자동 단어 시험",
            "간격 반복(라이트너) 기반 복습 큐",
            "지문 속 문맥 의미 확인 문항",
          ],
          insteadLabel: "어법 훈련 이어서 하기",
          insteadHref: "/g/track/grammar",
        },
      },
  {
    id: "school",
    name: "내신",
    tagline: "내 학교, 내 시험 범위에 맞춘 대비",
    status: "PREPARING",
    href: "/g/track/school",
    icon: "School",
    preparing: {
      what: [
        "학교·학년별 시험 범위 등록과 진도 추적",
        "교과서 본문 기반 예상 문제와 서술형 대비",
        "지난 시험 오답의 개념 연결",
      ],
      insteadLabel: "어법 훈련 이어서 하기",
      insteadHref: "/g/track/grammar",
    },
  },
];

export const TRACK_BY_ID = new Map(STUDY_TRACKS.map((t) => [t.id, t]));

export function isTrackId(v: string): v is TrackId {
  return TRACK_BY_ID.has(v as TrackId);
}
