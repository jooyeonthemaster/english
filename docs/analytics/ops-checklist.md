# 유입 분석 배포 — 운영자 조치 체크리스트

> 정본. 코드로 끝나지 않는 일만 모았다. 스펙은 `docs/analytics/analytics-spec.md`(§15 보유기간, §8 픽셀, §13·§14 결정).
> 작성 26-09-18 · 적대 검수 21기 → 중재 결과(operatorTodos 11항)를 순서·담당·검증 명령과 함께 옮긴 것.
>
> **읽는 법**: `[ ]` 는 사람이 직접 해야 하는 일이다. 코드가 대신 할 수 없어서 여기 있다.
> 배포 차단(🚫) 표시가 붙은 항목은 **끝나기 전에 배포하지 않는다**.

---

## A. 배포 전 (순서대로)

### A-1 🚫 합성 시드 청소 — 운영 DB 에 검수용 가짜 유입이 남아 있다
지금 운영 DB 에는 `qa-seed-*` 합성 데이터가 **860세션·520방문자** 들어 있고, 그것이 실학원 25곳(조이스영어·SKY영어학원·ME영어학원 등)에 붙어 있다.
화면의 「유입 추적 25곳 · 귀속 매출 132,000원」은 **전부 이 합성치**다. 이대로 배포하면 첫 화면이 거짓말로 시작한다.

- 담당: 배포자
- 실행: `npx tsx scripts/analytics-seed-qa.ts --clean`
- 검증(눈으로 0행 확인):
  ```sql
  SELECT hostname, COUNT(*) FROM analytics_sessions GROUP BY 1;   -- qa.seed 행이 없어야 한다
  SELECT COUNT(*) FROM analytics_visitors WHERE id LIKE 'qa-%';   -- 0
  ```
- ⚠️ 게이트·검수 중에는 지우지 말 것. **배포 직전**에만 한다.

### A-2 🚫 마이그레이션을 코드보다 **먼저** 적용
순서가 뒤바뀌면 회원 상세의 유입 카드가 전 회원에서 오류 문구로 뜬다(테이블이 없어서).

- 담당: 배포자
- 실행(둘 다, 이 순서로):
  ```bash
  npx prisma db execute --file prisma/migrations-manual/20260917_analytics.sql
  npx prisma db execute --file prisma/migrations-manual/20260918_analytics_indexes.sql
  ```
- 검증:
  ```sql
  SELECT tablename, indexname FROM pg_indexes
   WHERE tablename LIKE 'analytics%' ORDER BY 1,2;
  -- analytics_visitors_lastSeenAt_idx 가 있어야 한다(없으면 보유기간 크론이 Seq Scan)
  ```
- 남은 일: `prisma/schema.prisma` 의 `AnalyticsVisitor` 에 `@@index([lastSeenAt])` 를 넣어야 drift 가 안 남는다(스키마 소유자).

### A-3 🚫 개인정보처리방침 개정 **사전 공지** 후 시행
방침 13항이 스스로 「중요한 변경은 시행 전 안내」를 약속했는데, 지금 구조는 배포 즉시 수집이 시작된다.

- 담당: 운영자(대표)
- 순서: ① 스모트 소식으로 개정 내용·**시행일** 공지 → ② 공지한 시행일에 트래커·픽셀을 켠다.
- 같이 볼 것: §15.1 이 요구하는 방침 예외 2문장(연결 방문 요약 보관·전환 기록 보관)이 방침 본문에 들어갔는지.

### A-4 법무 검토 3건
- ① 국외 이전 고지에 **이전받는 자의 연락처·보유이용기간**(개인정보보호법 §28의8)이 들어갔는지.
- ② 로그인 시 방문기록을 **계정과 연결**(식별하여 행태정보 처리)하는 법적 근거.
- ③ 학생·학부모·단어훈련 화면의 **만 14세 미만 아동** 처리와 법정대리인 동의 필요 여부.
- 담당: 운영자(대표) → 외부 검토
- ②·③ 은 결론에 따라 코드가 바뀐다(연결 중단 또는 동의 UI). 배포를 막지는 않되 **결론 없이 픽셀을 켜지 않는다**.

---

## B. 환경변수 (Vercel 프로덕션)

### B-1 🚫 `CRON_SECRET` 설정 확인
없으면 `/api/cron/analytics-retention` 이 **매일 조용히 401** 이고, 방침이 고지한 「1년 뒤 파기」가 영구 미집행 상태가 된다(로컬 `.env` 에도 없다 — 확인함).

- 담당: 배포자
- 검증(비밀값을 찍지 않고 설정 여부만 본다):
  ```bash
  curl -s https://www.smoat.co.kr/api/cron/analytics-retention | jq .
  # → {"ok":false,"error":"unauthorized","cronSecretConfigured":true,...} 여야 한다.
  #   false 면 크론이 죽어 있는 것이다.
  ```
- 설정 후 수동 1회 집행(관리자 세션 쿠키로도 가능):
  ```bash
  curl -s -H "Authorization: Bearer $CRON_SECRET" \
    "https://www.smoat.co.kr/api/cron/analytics-retention?dry=1" | jq .
  # 드라이런 — 지우지 않고 대상 건수만 센다. days=400 처럼 cutoff 를 당겨 볼 수도 있다(관리자 세션).
  ```

### B-2 `ANALYTICS_COUNT_NONPROD` 가 **없는지** 확인
설정돼 있으면 비운영 호스트(로컬·프리뷰) 트래픽이 외부 유입으로 집계된다. 로컬 게이트 전용 스위치다.

- 담당: 배포자
- 검증: Vercel → Project → Settings → Environment Variables 에서 Production 에 이 키가 없어야 한다.

---

## C. 외부 콘솔 설정 (코드로 못 하는 것)

### C-1 GSC 연결 — 2단계 **둘 다** 해야 한다
①만 하면 다시 403 이다(과거에 매일 03:00 사이트맵 크론이 이 이유로 죽었다).

1. Google Cloud 콘솔에서 **Search Console API 사용 설정**
2. 서비스 계정(`nara-document-ai@nara-ai-496105…`)을 **Search Console 속성의 사용자로 추가**

- 담당: 운영자
- 검증: `/admin/analytics/setup` 의 GSC 연결 실검사 결과가 초록인지. (`gscConfigured()` 는 권한을 안 보므로 화면의 실검사 결과를 믿는다.)

### C-2 GA4 — 향상된 측정의 「브라우저 기록 기반 페이지 변경」 끄기
**코드로 끌 수 없다**(D11). 끄지 않으면 우리가 막아 놓은 금지 경로 URL(토큰이 든 주소)이 GA4 로 샌다.

- 담당: 운영자
- 위치: GA4 관리 → 데이터 스트림 → 웹 스트림 → 향상된 측정 → 톱니 → 「브라우저 기록 이벤트 기반 페이지 변경」 해제
- 검증: 해제 후 SPA 로 `/t/e/<토큰>` 을 지나갔을 때 GA4 실시간에 그 URL 이 안 뜨는지(C-4 와 함께).

### C-3 Meta / Clarity
- Meta Events Manager → **자동 고급매칭(autoConfig) 끄기**.
- Clarity 를 쓴다면 대시보드 **마스킹을 Strict 로 고정**. 원장·강사 화면에는 학생 이름·성적이 렌더된다.
- 결정 D13: Clarity 는 `director`·`teacher` 영역에서 **로드하지 않는다**. 허용은 marketing·/register·/login 뿐.
- 담당: 운영자
- ⚠️ 이 결정이 확정되기 전에는 **Clarity ID 를 입력하지 않는다**.

### C-4 🚫 픽셀 ID 입력 후 스테이징에서 1회 실사격
우리 코드는 스텁으로만 검증됐다. 제3자 SDK 자체의 SPA 훅은 미검증이다.

- 담당: 배포자
- 절차: 스테이징에 픽셀 ID 를 넣고, 금지 경로 3종(`/t/e/<토큰>`, `/r/exam/<토큰>`, `/g`)에 **SPA 이동으로** 진입한다.
- 검증: Clarity 세션 리플레이와 GA4 실시간에 그 URL 이 **남지 않아야** 한다. 남으면 C-2 를 다시 확인하고, 그래도 남으면 해당 픽셀을 그 영역에서 뺀다.

---

## D. 배포 후 상시 점검

### D-1 보유기간 크론이 실제로 돌았는지
집행 기록은 `platform_settings` 의 `analytics_retention_last_run` 키에 남는다(§15.2).

```sql
SELECT "updatedAt", left(value, 400) FROM platform_settings
 WHERE key = 'analytics_retention_last_run';
```
- 행이 **없으면 한 번도 집행된 적이 없다** → B-1 로 돌아간다.
- `truncated:true` 면 예산 안에 다 못 지운 것이다. `remaining` 이 다음 날 줄어드는지 본다. 이틀 연속 안 줄면 배치 크기·예산을 조정한다.

### D-2 미해결 무통장 입금 대기 14건 693,000원 — 실고객 응대
최고령 2026-06-30, 이스팀영어학원 49,500원(9/8 이탈) 포함. **DB 상태 변경은 D3 로 금지**돼 있으니 표시만 고쳤다. 고객 응대·정리 여부는 사람이 결정한다.

- 담당: 운영자
- 참고 화면: `/admin/credits` 결제 관리 → 「미완료(이탈·만료)」

### D-3 전환 기록이 여전히 0건인지
`SELECT COUNT(*) FROM analytics_conversions;` 가 배포 후에도 0 이면 가입·결제 전환이 한 번도 발사되지 않은 것이다(스펙 §0 성공조건 3 미달). 첫 실가입이 들어온 다음 날 한 번 본다.

---

## E. 담당·순서 요약

| 순서 | 항목 | 담당 | 배포 차단 |
|---|---|---|---|
| 1 | A-4 법무 검토 3건 | 운영자 | 부분(②③ 결론 없이 픽셀 금지) |
| 2 | A-3 방침 개정 사전 공지 | 운영자 | 🚫 |
| 3 | A-2 마이그레이션 2건 선적용 | 배포자 | 🚫 |
| 4 | B-1 CRON_SECRET · B-2 ANALYTICS_COUNT_NONPROD | 배포자 | 🚫(B-1) |
| 5 | A-1 합성 시드 `--clean` | 배포자 | 🚫 |
| 6 | 코드 배포 | 배포자 | — |
| 7 | C-1 GSC · C-2 GA4 · C-3 Meta/Clarity | 운영자 | — |
| 8 | C-4 스테이징 픽셀 실사격 | 배포자 | 🚫(픽셀 켜기 전) |
| 9 | D-1~D-3 상시 점검 | 운영자 | — |
