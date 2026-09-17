"use client";

// ============================================================================
// 회원 목록 → 엑셀(CSV) 다운로드 공용 헬퍼. 버튼 UI 는 bulk-actions-bar 의
// "다운로드" 팝오버가 담당한다.
//   · "전체 회원 엑셀" : 허수/내부 계정 뺀 전체 회원 (상세 15컬럼, Y/N + 사유 포함)
//   · "정보성 발송 CSV": 전화번호 있는 활성 회원 전체(동의 무관). 크레딧 소멸 등 안내용
//   · "광고성 발송 CSV": 마케팅 동의자만. 추가증정·이벤트 등 홍보용(법적 사전동의 필수)
//   정보성/광고성 모두 뿌리오 업로드 양식(이름,휴대폰,[*1*]~[*4*])으로 바로 다운된다.
// 서버 액션이 CSV 문자열(BOM 포함)을 돌려주면 브라우저에서 Blob 다운로드한다.
// ============================================================================

export function triggerDownload(
  filename: string,
  contentBase64: string,
  mimeType: string,
) {
  // 서버가 base64로 인코딩한 파일 바이트(발송용=CP949, 전체=UTF-8)를 그대로 복원.
  const bin = atob(contentBase64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const blob = new Blob([bytes], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
