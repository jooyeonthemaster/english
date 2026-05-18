// ─── Text-input variant — Document AI가 추출한 텍스트를 받아 분류만 수행 ──
//
// Gemini vision OCR이 평가원 PDF의 특정 페이지에서 RECITATION으로 거절되는
// 문제를 회피하기 위해, 1차 OCR은 Document AI(Google Cloud)로 옮기고
// Gemini는 "이미 추출된 텍스트"를 받아 블록 분류 + 문제 풀이만 담당한다.
//
// 시스템 프롬프트는 이미지 기반 버전을 거의 그대로 재사용하되,
//   - "이미지" / "이미지에 인쇄된" → "입력 텍스트"
//   - "추가 OCR 시도" 같은 표현 제거
// 만 살짝 보정한다. 출력 스키마(structuredOcrResponseSchema)는 동일.
//
// **Note**: 텍스트 입력에서는 isAnswer 표시(★/●/■)를 시각적으로 알 수 없으므로
// Document AI가 그런 마커를 텍스트로 보존했을 때만 true로 표기하도록 한다.

export const TEXT_INPUT_DISCLAIMER = `
[중요 — 입력 형식]
이번 호출에서는 시험지 이미지를 받지 않는다. 대신 Google Cloud Document AI가 OCR로 추출한 **텍스트**가 제공된다. 너의 일은:
  1) 받은 텍스트를 의미 단위 블록(EXAM_META / HEADER / FOOTER / PASSAGE_BODY / QUESTION_STEM / CHOICE / EXPLANATION / DIAGRAM / NOISE)으로 분류.
  2) QUESTION_STEM에 대해서는 questionAnalysis (유형 + 풀이 + 정답)를 채움.
  3) JSON 1개 반환.

추출된 텍스트에 OCR 오류(잘린 문자, 잘못 인식된 글자, 띄어쓰기 깨짐)가 있어도 임의 수정하지 말 것. content에는 받은 그대로 담는다. 복원은 후속 단계에서 처리한다.
이미지가 없으므로 ★/●/■ 같은 정답 마커는 텍스트로 보존된 경우(예: "③★")에만 isAnswer=true로 표기한다.
`;
