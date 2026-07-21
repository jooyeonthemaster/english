import { MdLabClient } from "./md-lab-client";

export const metadata = {
  title: "MD 랩 — 마크다운 원큐 생성 실험",
};

// md-lab: 심플 스택(원큐·마크다운 파싱) 검증용 내부 실험 페이지 (26-07-21).
// 프로덕션 생성 경로와 완전 분리 — 시험지 렌더·선지별 수정·PDF 인쇄가
// 마크다운 파서만으로 가능한지를 실물로 보여주는 것이 목적.
export default function MdLabPage() {
  return <MdLabClient />;
}
