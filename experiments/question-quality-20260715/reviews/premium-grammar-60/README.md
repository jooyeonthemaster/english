# PREMIUM 어법 60문항 재검수

과거 `w3-triple-ladder`의 30/30 두 실행을 현재 validity/craft rubric으로 다시 평가한다.

- `blind-items.json`: 1단계 전용. 저장 정답, 원문 정본, 해설, 모델, 게이트 결과, 실행 번호를 제거했다.
- `sealed-manifest.json`: 1단계 답과 근거를 저장한 뒤에만 여는 2단계 자료다.
- 두 실행은 서로 다른 60개 지문이 아니라 **같은 30개 지문에서 두 번 생성한 60문항**이다. 품질 추정은 문항 60개를 독립 표본으로 취급하지 않고 passage cluster 단위로 분석한다.
- 평가자는 먼저 `blindAnswer`, `alternativeAnswers`, V1~V3, 선택지별 문법성·함정 의도를 기록한다. 그 뒤 sealed 자료로 V4~V5, 저장 key 일치, 해설 사실성, 비용·게이트 메타데이터를 감사한다.
- 과거 `ok`, A/B, 30/30 주장은 새 평가의 입력이 아니다.
