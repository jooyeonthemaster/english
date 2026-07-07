# 26-07-06 never-fail 강화 캠페인 — 골 설정 (유저 지시)

## 배경 (실측)
26-07-06 01:14 KST 생성 실패 3건(어법 KILLER: 일반1·프리미엄2). 거절 코드 전부
craft(완성도) 계열(grammar-weak-filler-decoys, grammar-obvious-local-agreement,
grammar-killer-thin-answer 등)인데 전-모드 차단 + 프리미엄 relaxed 생략 + scarce
어법·결핍감지 한정이라 출구가 없었다. → 척추 수술 완료(never-fail 구제 사다리).

## 골 (절대 목표)
- **G1 실패율 0%**: 어떤 유형·플랜·난이도·세부설정에서도 "생성 실패" 금지.
  파스 가능한 후보가 1개라도 나오면 반드시 출하(craft 결함은 notice 부착).
  허용되는 유일한 실패: 모델 전면 장애(0 파스)뿐 — 그것도 salvage 1회로 방어.
- **G2 틀린 문항 0**: F급(정답 무효·복수정답 시비·정답 누출·렌더 파손)은 notice
  로도 출하 금지. salvage 는 "덜 예쁜 문항"만 통과시킨다.
- **G3 salvage 의존율 최소화**: salvage 출하율이 높다 = strict 경로가 너무 좁다.
  셀별 salvage-rate > 50% 면 프롬프트/게이트 캘리브레이션 대상.
- **G4 품질 무회귀**: 심사 점수(95-bar 통과 수·평균)가 26-07-05 최종 스윕
  (PREM 25/52) 대비 후퇴 금지.

## 루프 규약 (모든 에이전트 필수)
1. 작업 전 자기 클러스터 노트북(notebook-<cluster>.md)과 GOALS.md 를 읽는다.
2. 한 번에 하나의 가설→하나의 변경→재측정. 맹목 반복 금지.
3. 모든 시도를 노트북에 append: [시각] 가설 / 변경(파일:라인) / 측정 결과(수치) /
   판정(채택·기각·보류) / 다음 방향. 실패한 시도도 반드시 기록(재시도 방지).
4. 실측 없는 채택 금지. 측정은 하니스(scripts/audit-question-quality-loop.ts)
   실LLM 런으로.
5. F급 게이트 완화 절대 금지. craft 게이트 추가·강화는 자유(단 salvage 등재 동반).

## 파일 소유권 (충돌 방지)
- grammar 클러스터: validators/grammar/**, grammar-frames, 어법 프롬프트 블록
- blank 클러스터: validators/blank/**, candidate-blocks/blank, 빈칸 프롬프트 블록
- mc-reading 클러스터: 무관/삽입/순서/지칭/함축/요약MC validators + 해당 프롬프트 블록
- writing 클러스터: SW/TSW/영작 계열 validators/직렬화 + question-prompts-essay
- 공용 파일(run-question-generation*, question-quality/dispatcher)은 **오케스트레이터(메인)만** 수정.

## 백로그 (이번 캠페인 범위 밖, 다음 후보)
- 다문항(count>1) 요청에서 strict 시도의 "깨끗한 부분 성과"가 다음 시도에 승계되지
  않고 버려짐(hasEnoughQuestions 전량 재생성) — 부분 누적+잔여만 재생성으로 개선 여지.
- 하니스 심사가 _qualityMode/_difficultyDowngraded 등 내부 메타를 보고 감점함 —
  구제 출하물 점수가 이중 감점되는 측정 편향(어제와 동일 조건이라 비교엔 무영향).

## 측정 결과물
- artifacts/ai-audits/salvage-smoke-grammar-20260706.* — 척추 스모크(실패 셀 재현)
- artifacts/ai-audits/postspine-baseline-20260706.* — 새 사다리 전수 베이스라인
- 이후 웨이브별 재측정은 notebook-<cluster>.md 에 경로 기록
