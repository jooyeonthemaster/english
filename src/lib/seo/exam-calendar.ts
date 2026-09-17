/**
 * 시험 일정 단일 진실원(SSOT).
 *
 * 왜 필요한가 — 시험 날짜가 아티클 본문·llms.txt·구조화데이터에 각각 복제되면
 * 하나가 바뀔 때 나머지가 조용히 낡는다. 실제로 /exam-prep/mock-exam-calendar 는
 * updatedAt 이 2026-07-10 인데 본문에 구체 날짜가 0개였다(「예년 시행 패턴 기준」).
 *
 * 원칙:
 *  - 모든 항목에 `sourceUrl` 필수. 근거 없는 날짜는 들어올 수 없다.
 *  - 확정되지 않은 일정은 `confidence: '추정'` 으로 표시하고 UI 에서 그렇게 노출한다.
 *  - 시험 콘텐츠 저작권: 지문·문항 원문은 어디에도 싣지 않는다(대법원 2021다272001).
 *    여기 담기는 것은 시행일·주관·범위 같은 **사실 정보**뿐이다.
 */

export type ExamConfidence = "확정" | "추정";

export type ExamEvent = {
  id: string;
  /** 표시명. 예) 9월 모의평가 */
  name: string;
  /** 주관 기관. */
  host: string;
  /** 대상 학년. */
  grades: ("고1" | "고2" | "고3" | "N수")[];
  /** 시행일 YYYY-MM-DD. 기간이면 시작일. */
  date: string;
  /** 기간 시험의 종료일(선택). */
  endDate?: string;
  /** 성적 통지일(선택). */
  resultDate?: string;
  confidence: ExamConfidence;
  /** 근거 URL — 필수. */
  sourceUrl: string;
  /** 실무 메모(자료 발행 타이밍 등). */
  note?: string;
};

/**
 * 2026년 하반기 ~ 2027학년도 수능.
 *
 * ⚠️ 자료 선점 타이밍(실측):
 *   · 영어 영역 종료 14:30
 *   · 시·도교육청 정답·해설 공개 18:00 이후
 *   · EBSi CDN 영어 자료 업로드 17~20시
 *   → **14:30~18:00 약 3시간 반이 무주공산**이다. 이 창을 사실정보(시행일·범위)와
 *     평가원 보도자료(공공저작물), 자체 분석으로 채우면 저작권을 건드리지 않고 선점한다.
 */
export const EXAM_CALENDAR_2026H2: ExamEvent[] = [
  {
    id: "2026-09-mock",
    name: "9월 모의평가",
    host: "한국교육과정평가원",
    grades: ["고3", "N수"],
    date: "2026-09-02",
    resultDate: "2026-09-29",
    confidence: "확정",
    sourceUrl: "https://www.suneung.re.kr/main.do?s=suneung",
    note: "영어 종료 14:30. 당일 14:30~18:00 이 자료 선점 구간.",
  },
  {
    id: "2026-09-nationwide",
    name: "9월 전국연합학력평가",
    host: "인천광역시교육청",
    grades: ["고1", "고2"],
    date: "2026-09-02",
    confidence: "확정",
    sourceUrl: "https://www.ebsi.co.kr/ebs/xip/xipa/retrieveExmSchedRngNext.ebs?targetCd=D300",
    note: "고3 모평과 동일자 시행. 고1·고2 자료 수요가 같은 날 몰린다.",
  },
  {
    id: "2026-10-nationwide",
    name: "10월 전국연합학력평가",
    host: "서울특별시교육청(고3) / 경기도교육청(고1·고2)",
    grades: ["고1", "고2", "고3"],
    date: "2026-10-20",
    confidence: "확정",
    sourceUrl: "https://www.ebsi.co.kr/ebs/xip/xipa/retrieveExmSchedRngNext.ebs?targetCd=D300",
  },
  {
    id: "2027-suneung",
    name: "2027학년도 대학수학능력시험",
    host: "한국교육과정평가원",
    grades: ["고3", "N수"],
    date: "2026-11-19",
    resultDate: "2026-12-11",
    confidence: "확정",
    sourceUrl: "https://www.suneung.re.kr/main.do?s=suneung",
    note: "이의신청 11-19~11-23, 정답 확정 12-01, 성적 통지 12-11.",
  },
];

/** 오늘 기준 다가오는 시험 n개. 지난 일정은 제외한다. */
export function upcomingExams(from: Date = new Date(), limit = 3): ExamEvent[] {
  const today = from.toISOString().slice(0, 10);
  return EXAM_CALENDAR_2026H2.filter((e) => e.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, limit);
}

/** D-day. 음수면 이미 지난 시험. */
export function daysUntil(examDate: string, from: Date = new Date()): number {
  const a = new Date(`${examDate}T00:00:00+09:00`).getTime();
  const b = new Date(`${from.toISOString().slice(0, 10)}T00:00:00+09:00`).getTime();
  return Math.round((a - b) / 86400000);
}

/** 특정 시험을 id 로 찾는다. */
export function getExam(id: string): ExamEvent | undefined {
  return EXAM_CALENDAR_2026H2.find((e) => e.id === id);
}
