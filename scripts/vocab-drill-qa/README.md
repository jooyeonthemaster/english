# 단어 훈련 QA 하네스

실서버(dev)와 실 DB 를 상대로 도는 스모크 2종. 유닛 테스트가 아니라 **계약 검사**다 —
"이 경로로 정답이 새는가", "이 상태에서 이 큐가 나오는가"를 실제 HTTP 로 확인한다.

## 준비

```bash
npm run dev                      # 3000 포트
node scripts/vocab-drill-qa/mint-cookie.mjs   # QA 학생 세션 토큰 발급
```

토큰은 `.cookie` 파일로 떨어지며 두 스모크가 읽는다. git 에 올리지 마라(.gitignore 대상).

## 실행

```bash
node scripts/vocab-drill-qa/smoke-flow.mjs       # 기능 전 구간
node scripts/vocab-drill-qa/smoke-security.mjs   # 보안 계약 8항목
```

- **smoke-flow** — 드릴 큐 → 정답 제출 → clientKey 멱등 → 복습·문맥 큐 → 기본 덱
  프로비저닝 → 학습(FLASH) 큐 → 덱 시험 12문항 믹스 → me 집계.
- **smoke-security** — lemma 유출 · 힌트에 정답 문자열 · 미학습 sense 403 ·
  probe 암호화 · 덱 단계 게이트 · FLASH 위조로 MASTERED 자가부여 · 테넌트 격리 ·
  빈 큐 계약(정상 빈 상태는 404 가 아니다).

둘 다 끝에서 **QA 학생의 학습 데이터를 지운다**. 다른 학생 데이터는 건드리지 않는다.

## 대상 학생

`이동주(테스트)` — studentId `cms35q8dg00019q37g2nvlj4l`, 학원 `cmr4lx5690000l504n0uyck1g`.
바뀌었으면 각 스크립트 상단 상수만 고치면 된다.

## 왜 이 검사들인가

2026-08-04 적대검수에서 **실제로 뚫렸던** 것들이다. 회귀를 막는 것이 목적이므로
기능을 고칠 때 스모크가 깨지면 **스모크를 고치기 전에 그 변경이 계약을 깬 건 아닌지**
먼저 따져라. 계약의 정본은 `prisma/sql/vocab-drill-init.sql` 과
`src/lib/vocab-drill/payload.ts` 다.
