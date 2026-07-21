// 분석 허브 레이아웃 — @modal 패러렐 슬롯을 연다.
//
// 워크스페이스([id])는 허브에서 카드를 누르면 **화면을 거의 꽉 채운 팝업**으로 열린다.
// 단순 클라이언트 모달이 아니라 인터셉팅 라우트((.)[id])를 쓰는 이유:
//   - URL 이 그대로 /exam-report/[id] 라 딥링크(?openAddStudent=1 · ?start=1)가 산다
//   - 뒤로가기로 팝업이 닫히고, 새로고침·주소 직접 진입은 전체 페이지로 폴백된다
//   - 허브(분석 현황)가 뒤에 남아 목록 맥락이 유지된다
// 안쪽 학생 워크스페이스([id]/students/[studentId])는 인터셉트하지 않아 기존대로
// 전체 페이지로 이동한다(모달-인-모달 회피).

export default function ExamReportLayout({
  children,
  modal,
}: {
  children: React.ReactNode;
  modal: React.ReactNode;
}) {
  return (
    <>
      {children}
      {modal}
    </>
  );
}
