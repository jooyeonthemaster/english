import type { AnalysisReport } from "./schema";

import s01 from "./_samples/gen-01-contrast.json";
import s02 from "./_samples/gen-02-process.json";
import s03 from "./_samples/gen-03-cause-effect.json";
import s04 from "./_samples/gen-04-problem-solution.json";
import s05 from "./_samples/gen-05-argument.json";
import s06 from "./_samples/gen-06-narrative.json";
import s07 from "./_samples/gen-07-science.json";
import s08 from "./_samples/gen-08-abstract.json";
import s09 from "./_samples/gen-09-expository.json";
import s10 from "./_samples/gen-10-compare-debate.json";

/**
 * 실제 Gemini(gemini-3.5-flash)가 생성한 10개 유형 보고서 — 디자인 검증 갤러리용.
 * (운영 데이터 아님. 라이브 테스트 산출물을 프리뷰에서 눈으로 확인하기 위함)
 */
export const SAMPLE_REPORTS: { id: string; label: string; report: AnalysisReport }[] = [
  { id: "01-contrast", label: "① 대조 · 내향/외향", report: s01 as unknown as AnalysisReport },
  { id: "02-process", label: "② 과정 · 백신 작동", report: s02 as unknown as AnalysisReport },
  { id: "03-cause-effect", label: "③ 인과 · 블루라이트", report: s03 as unknown as AnalysisReport },
  { id: "04-problem-solution", label: "④ 문제해결 · 음식물쓰레기", report: s04 as unknown as AnalysisReport },
  { id: "05-argument", label: "⑤ 주장 · 코딩교육", report: s05 as unknown as AnalysisReport },
  { id: "06-narrative", label: "⑥ 서사 · 바다 극복", report: s06 as unknown as AnalysisReport },
  { id: "07-science", label: "⑦ 과학 · 블랙홀", report: s07 as unknown as AnalysisReport },
  { id: "08-abstract", label: "⑧ 추상 · 선택의 역설", report: s08 as unknown as AnalysisReport },
  { id: "09-expository", label: "⑨ 설명(중3) · 꿀벌 춤", report: s09 as unknown as AnalysisReport },
  { id: "10-compare-debate", label: "⑩ 논쟁 · 본성vs양육", report: s10 as unknown as AnalysisReport },
];
