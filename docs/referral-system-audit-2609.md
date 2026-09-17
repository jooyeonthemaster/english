# 추천인 코드 회원가입·보상 시스템 전수 감사

- **일자** 2026-09-04
- **대상** 그로스 프로그램 전체 — 추천(referral) · 크레딧 미션 · 알림
- **방법** 12축 병렬 코드 감사 + 프로덕션 DB 실측(SELECT 전용) + 결함별 적대적 반증 2표 + 완전성 비평 4렌즈. 총 273 에이전트, 오류 0.
- **판정** 결함 주장 146건 → **확정 113건**(critical 1 · major 22 · minor 62 · info 28), **반증 33건**
- **원자료** `.tmp-referral-audit/` (probe SQL·출력·confirmed.json·refuted.json)

---

## 1. 한 줄 결론

**기능은 제대로 만들어져 있고, 프로덕션에서 실제로 완주한 증거가 있다. 그러나 사슬의 0번째 고리(코드 발급)가 「리워드 페이지를 직접 연 사람」에게만 걸려 있어, 출시 3개월간 성사된 추천이 단 1건이다. 즉 지금 고장 난 것은 엔진이 아니라 배선이다.**

부정 방지에는 실제로 뚫리는 구멍이 하나 있다(§5). 지급·멱등·트랜잭션 무결성은 견고하다.

---

## 2. 「작동한다」의 증거

프로덕션 DB 로 확인한 유일한 성사 건이 전 구간을 완주했다.

| 항목 | 값 |
|---|---|
| Referral id | `cmsom2to6000ajy04ha6sjibu` |
| 추천인 → 피추천 | 리트영어학원 → 일단영어 |
| 시각 | 2026-08-11 12:03:07 (UTC) |
| 상태 / 부정점수 | `GRANTED` / 0 |
| 추천인 지급 | `cmsom2tow000ejy0400xhkzp1` · TOP_UP **+50** · balanceAfter 104 |
| 피추천 지급 | `cmsom2tp7000ijy044ze34v56` · TOP_UP **+30** · balanceAfter 80 |
| 알림 | REFERRAL 2건(양측) 생성 |

라이브 엔드포인트 실측(2026-09-04):

```
GET  /register?ref=8B5HPE      → 200
POST /api/referral/click       → {"ok":true}
GET  /api/referral (미인증)     → 401   ← 인증 게이트 정상 집행
```

즉 **파이프라인 자체는 살아 있다.**

---

## 3. 사슬 도해 — 어디가 끊겨 있는가

```
[0] 원장이 코드를 얻는다        ← ✗ 병목. /director/rewards 를 열어야만 lazy 생성. 245곳 중 28곳(11%)만 보유
        ↓  getOrCreateReferralCode  (referral.ts:46) ← 유일 호출자: getReferralStats → GET /api/referral → rewards-client
[1] 카카오로 링크 공유           ← △ 공유하지 않아도 미션 10크레딧 지급 / OG 카드가 파비콘
        ↓  buildReferralLink → {site}/register?ref=CODE   (constants.ts:151)
[2] 지인이 링크 클릭             ← △ 쿠키를 심는 주체가 클라이언트 JS 하나뿐(미들웨어 없음). 평생 클릭 4회
        ↓  document.cookie smoat_ref (register/page.tsx:53, 30일, samesite=lax)
[3] 소셜 OAuth 왕복              ← ○ Lax 라 top-level 복귀에 쿠키가 실려 온다. state/redirectTo 에는 ref 미탑재
        ↓
[4] 온보딩 폼                    ← ○ 「추천 코드」 입력란 실재 + 쿠키 프리필 (onboarding/page.tsx:304)
        ↓
[5] 귀속 판정                    ← ✗ 실패(오타·중복·자기추천)가 전부 무음. 로그도 행도 사용자 안내도 0
        ↓  processReferralOnSignup (referral.ts:148)
[6] 부정 채점                    ← ✗ 첫 자가추천은 구조적으로 항상 0점 통과 (§5)
        ↓  evaluateReferralFraud (referral-fraud.ts)
[7] 지급 50/30                   ← ○ 단일 트랜잭션 · referredAcademyId @unique 로 이중지급 불가
        ↓  grantBonusCreditsTx
[8] 알림 2건                     ← △ GRANTED 에만 발송. HELD/REJECTED/CLAWED_BACK 은 전부 무음
        ↓
[9] 원장이 확인                  ← △ 인앱 알림 전용. 유일한 수령자는 24일째 미열람
```

---

## 4. 라이브 실측 수치

| 지표 | 값 | 비고 |
|---|---|---|
| 전체 학원 | 245 | |
| 추천 코드 보유 학원 | **28 (11.4%)** | = 리워드 페이지를 연 학원 수 |
| 출시(26-06-18) 후 가입 학원 | 127 | 그중 코드 보유 **17 (13.4%)** |
| 크레딧을 실제로 쓴 활성 학원 | 133 | 그중 코드 보유 **24 (18%)** |
| `/director/rewards` 방문 | 29개원 · 140뷰 | |
| `/director/credits` 방문 (대조) | **71개원 · 508뷰** | 리워드 도달률은 크레딧 페이지의 **41%** |
| 리워드 페이지를 열었는데 코드 미생성 | **1건** (잉글리쉬 PAL, 26-07-02) | lazy 생성이 조용히 실패한 실사례 |
| 평생 추천 링크 클릭 | **4** | 전부 단일 코드 `8B5HPE` |
| 평생 성사 추천 | **1** (GRANTED) | HELD/REJECTED/CLAWED_BACK 0건 |
| 미션 클레임 | DAILY_CHECKIN 69 · KAKAO_SHARE 4 · ONBOARD_FIRST_GENERATION 4 | FRIEND_REFERRAL 0(설계상 정상) · **ONBOARD_PROFILE 0(달성 불가)** |
| `logoUrl` 보유 학원 | **2 / 246 (0.8%)** | ONBOARD_PROFILE 조건이 사실상 도달 불가인 근거 |
| `bonusCredits > balance` 불변식 위반 | **14개원 · 누적 4,961 크레딧** | 클로백 클램프 로직의 전제가 이미 깨져 있음 |
| 성장 크레딧 발행 총량(TOP_UP) | 관리자 수기 11,325 · 인쇄쿠폰 3,400 · 미션 585 · **추천 80** | 추천은 발행량의 0.5% |

> 참고: 「리트영어학원」 코드 2개는 유니크 제약 위반이 아니라 **동명 별개 학원 2곳**이다(원장 이메일 상이). 유일한 추천은 후자(`8B5HPE`)가 냈다.

---
## 5. 확정 결함 — CRITICAL (1건)

### C1. 자기추천 1회차는 구조적으로 항상 통과한다 — 최강 신호 2종이 미검증 자기신고 필드, IP 신호는 2회차부터만 발화

- **위치** `src/lib/growth/referral-fraud.ts:111` · 축 `fraud` · 반증 시도 1/2 생존
- **근거**

```
referral-fraud.ts:111-126 — `if (input.signupIp) { const sameIp = await prisma.referral.count({ where: { referrerAcademyId: input.referrerAcademyId, signupIp: input.signupIp } }); if (sameIp > 0) { ... weight: 60 } }`  ← 비교 대상이 '그 추천인의 **과거 referral 행**'이라 첫 부정 건은 sameIp=0(발화 불가).
추천인 본인의 가입 IP/기기는 어디에도 없다: `grep -n "signupIp|lastLoginIp|ipAddress" prisma/schema.prisma` → 유일 히트 `2975:  signupIp          String?` (Referral 모델뿐).
남은 강한 신호 2종은 전부 가입자가 타이핑하는 값이다 — referral-fraud.ts:70 `if (refPhone && newPhone && refPhone === newPhone)`(weight 100), :88 `if (normalize(refEmail) === normalize(newEmail))`(weight 100). 그런데 onboarding은 전화번호를 정규식으로만 검사하고(src/app/api/auth/onboarding/route.ts:70 `normalizePhone(parsed.data.directorPhone)`) SMS 인증도, 전화번호 중복 검사도 하지 않는다(중복 검사는 이메일만: route.ts:82-88 `existingByEmail ... 409 email_already_used`). 프로덕션에도 이미 서로 다른 학원이 같은 원장 전화번호를 쓰는 그룹이 11개 존재한다(동일 쿼리 하네스 실측).
```

- **영향** 원장이 새 지메일/카카오 계정 하나(무료)와 아무 전화번호나 넣어 새 학원을 만들고 자기 코드를 입력하면 fraudScore=0 → 즉시 GRANTED, 추천인 +50 / 신규 +30 이 자동 지급된다. 게다가 신규 가입 자체에도 초기 크레딧이 붙어(route.ts:120 `getSignupCredits()`) 1회 자작 가입당 80 크레딧 + 신규 배정분이 순증한다. 월 상한 20건까지는 아무 신호도 뜨지 않으므로 계정 하나로 월 1,000(추천인분)+600(피추천분) 크레딧을 무제한 반복 가능하고, 계정을 늘리면 상한 자체가 무의미해진다.

- **재현** 1) 원장 A가 /director/rewards 에서 코드 획득 → 2) 시크릿창에서 새 구글 계정으로 /register?ref=CODE → 3) 온보딩에서 학원명 아무거나, 이메일=새 구글 계정, 전화번호는 A와 다른 번호(예: 010-0000-0000) 입력 → 4) SELF_SAME_ACADEMY(다른 학원이라 미발화)·PHONE(다름)·EMAIL(다름)·VELOCITY(1건)·SAME_IP_REPEAT(과거 referral 행 0건)·MONTHLY_CAP(0건) 전부 미발화 → score 0 → status GRANTED, 크레딧 즉시 지급. 같은 PC·같은 IP·같은 브라우저로 해도 탐지되지 않는다.

- **수리 제안** (a) 추천인 학원의 **가입 시점 IP/UA를 Academy 또는 Staff에 저장**하고, 신규 가입 IP/UA-핑거프린트가 추천인의 것과 일치하면 신호(>=60)를 발화시킨다 — 지금은 비교할 데이터 자체가 없다. (b) 전화번호를 신뢰 신호로 쓰려면 온보딩에 SMS 인증을 붙이거나, 최소한 '동일 전화번호로 이미 학원이 존재'를 가입 단계에서 차단/플래그한다(현재 11그룹 존재). (c) 신규 학원이 '실사용' 임계(예: 첫 생성 1건 또는 가입 후 N일)를 넘긴 뒤 지급하는 지연 지급으로 바꾸면 자작 계정 비용이 급등한다.


## 6. 확정 결함 — MAJOR (22건)

| # | 결함 | 위치 | 축 |
|---|---|---|---|
| M1 | 추천 코드는 가입 시 발급되지 않는다 — 「리워드」 페이지를 직접 방문한 원장에게만 lazy 생성(245곳 중 28곳=11%만 보유) | `src/lib/growth/referral.ts:81` | issuance |
| M2 | 귀속에 쓰인 smoat_ref 를 소비 후 삭제하지 않아, 같은 브라우저의 이후 학원 생성이 30일간 계속 같은 추천인에게 붙는다 | `src/app/api/auth/onboarding/route.ts:220` | click |
| M3 | 잘못된 추천 코드는 무음 폐기 — 사용자에게도 로그에도 흔적이 0이다 | `src/app/api/auth/onboarding/route.ts:224` | signup-manual |
| M4 | 귀속 실패가 전부 무음 — 반환값을 버리고, 로그도 행도 사용자 피드백도 없다 | `src/app/api/auth/onboarding/route.ts:224` | signup-onboarding |
| M5 | HELD 로 잡히면 신규 학원의 환영 보너스까지 무음 보류되고, 당사자·관리자 어느 쪽에도 알림이 없다 | `src/lib/growth/referral.ts:203` | signup-onboarding |
| M6 | 잔액이 부족하면 0크레딧만 회수하고도 어드민에 "회수 완료"로 보고된다 (미회수 부채 은닉) | `src/lib/growth/credit-grant.ts:171` | grant |
| M7 | 추천 귀속/지급 실패가 완전 무음이고 재시도·정합 복구 경로가 0건이다 | `src/app/api/auth/onboarding/route.ts:232` | grant |
| M8 | 승인·반려·회수 후 목록과 '보류' 배지가 갱신되지 않는다 (프롭 스냅샷 고착) | `src/components/admin/referral-management-client.tsx:125` | admin |
| M9 | 크레딧을 발행/회수하는 서버액션에 SUPER_ADMIN 역할 게이트가 없다 (코드베이스 관례 이탈) | `src/actions/admin/referrals.ts:302` | admin |
| M10 | 학생 리포트 공유 패널이 KAKAO_SHARE 추천 미션 보상을 발화하고, 학부모에게 추천 마케팅 문구를 보낸다 | `src/components/exam-report/report/share-panel.tsx:157` | missions |
| M11 | HELD·REJECTED·CLAWED_BACK 추천은 알림이 0건 — 실패·회수가 양측에 완전히 무음 | `src/lib/growth/referral.ts:203` | missions |
| M12 | ONBOARD_PROFILE 조건이 logoUrl 인데 이를 채울 수단이 「자유 텍스트 URL 1칸(선택)」뿐 — 245곳 중 2곳만 조건 충족, 평생 클레임 0건 | `src/lib/growth/missions.ts:62` | missions |
| M13 | 카카오 가입(원장 59%)에서 이메일·전화가 전부 자기신고 → weight 100짜리 자가추천 신호 2개가 무력화 | `src/app/api/auth/onboarding/route.ts:75` | security |
| M14 | VELOCITY 가중치(40)가 보류 임계(60)보다 낮아, 대량 추천이 속도 신호만으로는 절대 보류되지 않는다 | `src/lib/growth/referral-fraud.ts:102` | security |
| M15 | POST /api/referral/click 은 미인증 무제한 DB 쓰기 — 쿠키 디듀프는 쿠키를 안 보내면 그만 | `src/app/api/referral/click/route.ts:28` | security |
| M16 | 추천 코드가 「리워드 페이지를 직접 연 사람」에게만 존재한다 — 245개원 중 217곳(88.6%)은 코드 자체가 없음 | `src/lib/growth/referral.ts:46` | reachability |
| M17 | 앱 전체에서 리워드/추천으로 가는 진입점이 사이드바 1곳뿐 — 크레딧이 부족한 순간에도 유도가 없다 | `src/components/layout/nav-config.ts:378` | reachability |
| M18 | 추천 코드가 가입 시 발급되지 않고 리워드 화면 최초 방문 때만 lazy 생성 — 출시 후 가입 학원 87%가 추천 링크를 가진 적이 없다 | `src/lib/growth/referral.ts:81` | live-forensics |
| M19 | 추천 코드가 무효/중복/자가여도 신규 원장에게 아무 통보가 없고, 입력한 코드는 어디에도 저장되지 않는다 | `src/app/api/auth/onboarding/route.ts:222` | e2e-trace |
| M20 | HELD 판정 시 신규 학원은 약속된 +30을 못 받고 양쪽 모두 알림이 0건 — 화면상 「추천 실패」와 구분 불가 | `src/lib/growth/referral.ts:203` | e2e-trace |
| M21 | 첫 자가추천은 부정 점수 0으로 항상 즉시 지급된다 — IP 대조가 「이 추천인의 이전 referral 행」과만 이뤄진다 | `src/lib/growth/referral-fraud.ts:112` | e2e-trace |
| M22 | 추천 코드는 원장이 「리워드」 페이지를 열어야 비로소 생성된다 — 245개원 중 28개(11%)만 코드를 보유 | `src/lib/growth/referral.ts:81` | e2e-trace |

### M1. 추천 코드는 가입 시 발급되지 않는다 — 「리워드」 페이지를 직접 방문한 원장에게만 lazy 생성(245곳 중 28곳=11%만 보유)

- **위치** `src/lib/growth/referral.ts:81` · 축 `issuance` · 반증 1/2
- **근거**

```
referral.ts:80-81  `export async function getReferralStats(academyId: string): Promise<ReferralStats> { const referralCode = await getOrCreateReferralCode(academyId);`
호출자 전수(rg 결과): `getOrCreateReferralCode` ← `getReferralStats` 단 1곳 ← `src/app/api/referral/route.ts:14 const stats = await getReferralStats(staff.academyId);` 단 1곳 ← `rewards-client.tsx:74 const res = await fetch("/api/referral", { cache: "no-store" });` 단 1곳.
온보딩에는 발급 코드가 없다 — `src/app/api/auth/onboarding/route.ts:224` 는 `await processReferralOnSignup({...})`(소비)만 호출한다.
백필 스크립트 부재: `scripts/` 에 referral 관련 파일 0건(seed-credit-missions.ts 만 존재).
DB 실측: academies 245 / referral_codes 28. 코드 생성 lag(학원 생성→코드 생성): 삼계PDI국제어학원 95.99일, 이(E) 영어 87.11일, 리트영어학원 72.82일, M.P학원 52.18일 — 가입 시점이 아니라 「어느 날 페이지를 열어본 시점」에 만들어졌음을 증명.
```

- **영향** 추천 프로그램의 첫 칸(원장이 링크를 얻는 것)이 89%의 학원에서 아예 열리지 않는다. 코드가 없으면 링크도, 카카오 공유도, FRIEND_REFERRAL 미션 성사도 구조적으로 불가능하다. 이것이 referrals 테이블이 평생 1건인 1차 원인이다. 도달률은 활성 학원 기준으로도 낮다: CONSUMPTION 이 있는 실사용 학원 211곳 중 코드 보유 27곳(12.8%), 최근 30일 활동 학원 37곳 중 9곳(24.3%).

- **수리 제안** 발급을 방문 의존에서 떼어낸다: (a) `src/app/api/auth/onboarding/route.ts` 의 온보딩 트랜잭션 커밋 직후(processReferralOnSignup 옆)에 `await getOrCreateReferralCode(academy.id, staff.id)` 를 best-effort 로 추가해 신규 학원 전원에게 즉시 발급, (b) 기존 217개 학원에 대해 1회성 백필 스크립트(scripts/backfill-referral-codes.ts)로 코드 부여, (c) 발급 후에야 의미가 생기는 「리워드」 진입을 미션/알림 배너로 노출.

### M2. 귀속에 쓰인 smoat_ref 를 소비 후 삭제하지 않아, 같은 브라우저의 이후 학원 생성이 30일간 계속 같은 추천인에게 붙는다

- **위치** `src/app/api/auth/onboarding/route.ts:220` · 축 `click` · 반증 1/2
- **근거**

```
src/app/api/auth/onboarding/route.ts:220-236
  const referralCodeCandidate =
    parsed.data.referralCode?.trim() || request.cookies.get("smoat_ref")?.value;
  if (referralCodeCandidate) {
    try { await processReferralOnSignup({ ... }); } catch (referralError) { ... }
  }
  ...
  return NextResponse.json({ ok: true, bridgeToken });   // ← 쿠키 삭제/만료 처리 없음
※ 전수 grep(REFERRAL_COOKIE / smoat_ref)상 이 쿠키를 지우는 코드는 리포지토리 어디에도 없다. 접촉 파일은 register/page.tsx(쓰기), onboarding/page.tsx:137(읽기), onboarding/route.ts:221(읽기) 3곳뿐.
```

- **영향** `Referral.referredAcademyId` 의 @unique 는 **같은 학원**의 이중지급만 막고, 같은 브라우저에서 만들어지는 **다른 학원**은 막지 못한다. 한 사람이 링크 한 번 타고 들어와 학원 A 를 만든 뒤 30일 안에 학원 B·C 를 더 만들면 전부 동일 추천인에게 귀속되어 건당 50 크레딧이 반복 지급된다(fraud 모듈이 HELD 로 잡아주길 기대할 뿐, 귀속 자체는 성립). 반대로 정당한 케이스에서도 오귀속을 만든다: 원장이 자기 PC 에서 지인 가입을 대신 눌러준 뒤 나중에 별도 계정을 만들면 무관한 추천인에게 붙는다.

- **수리 제안** `processReferralOnSignup` 이 `ok:true` 를 반환했든 `already_referred`/`self_referral` 로 끝났든, 온보딩 성공 응답에서 쿠키를 만료시킨다: `const res = NextResponse.json({ok:true, bridgeToken}); res.cookies.set(REFERRAL_COOKIE, "", { path: "/", maxAge: 0 }); return res;` (또는 `res.cookies.delete(REFERRAL_COOKIE)`).

### M3. 잘못된 추천 코드는 무음 폐기 — 사용자에게도 로그에도 흔적이 0이다

- **위치** `src/app/api/auth/onboarding/route.ts:224` · 축 `signup-manual` · 반증 0/2
- **근거**

```
route.ts:222-237
  if (referralCodeCandidate) {
    try {
      await processReferralOnSignup({ code: referralCodeCandidate, ... });   // ← 반환값을 받지 않는다
    } catch (referralError) {
      console.error("[onboarding] referral attribution failed", referralError);
    }
  }

referral.ts:148-152
  const normalized = normalizeReferralCode(input.code);
  if (!normalized) return { ok: false, reason: "invalid_code" };
  const referralCode = await prisma.referralCode.findUnique({ where: { code: normalized } });
  if (!referralCode) return { ok: false, reason: "invalid_code" };

route.ts:245  return NextResponse.json({ ok: true, bridgeToken });   // 추천 결과 필드 없음
```

- **영향** 온보딩 폼이 「추천 코드 입력 시 가입 환영 +30 크레딧이 적립됩니다」(onboarding/page.tsx:313-315)라고 약속해 놓고, 코드가 한 글자라도 틀리면 가입은 성공하고 +30 은 들어오지 않으며 사용자는 이유를 알 방법이 없다. invalid_code 는 console 에도 안 찍히므로 운영자도 「몇 명이 오타로 보상을 놓쳤는지」를 영원히 알 수 없다. 사후 입력 UI도 없어(rewards-client.tsx 에는 복사 버튼만, 입력란 0개) 복구 불가. 프로덕션에서 추천 코드 28개·클릭 4회에 성사 1건, FRIEND_REFERRAL 클레임 0건이라는 수치와 정합한다.

- **수리 제안** processReferralOnSignup 의 결과를 받아 (a) `{ok:false, reason}` 을 반드시 console.warn 으로 남기고, (b) 응답에 `referral: {ok, reason}` 을 실어 온보딩 클라이언트가 「입력하신 추천 코드를 찾을 수 없어 보너스가 적용되지 않았습니다」를 토스트로 띄우게 한다. 더 나은 형태는 제출 전 검증: 코드 존재 여부만 알려주는 공개 엔드포인트(`GET /api/referral/validate?code=`)를 두고 입력란에서 즉시 초록/빨강 피드백.

### M4. 귀속 실패가 전부 무음 — 반환값을 버리고, 로그도 행도 사용자 피드백도 없다

- **위치** `src/app/api/auth/onboarding/route.ts:224` · 축 `signup-onboarding` · 반증 0/2
- **근거**

```
const referralCodeCandidate =
    parsed.data.referralCode?.trim() || request.cookies.get("smoat_ref")?.value;
  if (referralCodeCandidate) {
    try {
      await processReferralOnSignup({ ... });   // ← 반환값을 받지 않는다
    } catch (referralError) {
      console.error("[onboarding] referral attribution failed", referralError);
    }
  }

// referral.ts:149,152,155,164 — 실패는 예외가 아니라 조용한 반환값이다
  if (!normalized) return { ok: false, reason: "invalid_code" };
  const referralCode = await prisma.referralCode.findUnique({ where: { code: normalized } });
  if (!referralCode) return { ok: false, reason: "invalid_code" };
  if (referrerAcademyId === input.referredAcademyId) return { ok: false, reason: "self_referral" };
  if (existing) return { ok: false, reason: "already_referred" };
```

- **영향** 오타·만료·존재하지 않는 코드로 가입하면 신규 학원은 화면에서 약속받은 +30 크레딧을 못 받는데, 사용자는 성공 화면으로 넘어가고(응답은 항상 {ok:true,bridgeToken}) 서버 로그에도 아무것도 남지 않으며 DB 에도 시도 흔적이 0이다. console.error 는 '예외가 던져졌을 때'만 찍히는데 위 4가지 실패는 전부 정상 반환이라 절대 찍히지 않는다. 결과적으로 귀속률이 0%로 붕괴해도 계기가 전혀 없다(실측: referrals 평생 1건, 실패 로그·행 0건).

- **수리 제안** processReferralOnSignup 의 결과를 받아 (a) reason 별로 구조화 로그를 남기고, (b) 응답에 referral:{ok,reason,status} 를 실어 온보딩 완료 화면/토스트에서 '추천 코드가 확인되지 않아 환영 보너스가 적용되지 않았습니다'를 노출하며, (c) 최소한 실패 시도를 남길 수 있게 폼 제출 전 코드 유효성 확인 엔드포인트(POST /api/referral/validate)를 붙여 입력 즉시 초록/빨강으로 검증한다.

### M5. HELD 로 잡히면 신규 학원의 환영 보너스까지 무음 보류되고, 당사자·관리자 어느 쪽에도 알림이 없다

- **위치** `src/lib/growth/referral.ts:203` · 축 `signup-onboarding` · 반증 0/2
- **근거**

```
  const status: "GRANTED" | "HELD" = fraud.shouldHold ? "HELD" : "GRANTED";
  ...
      if (status === "GRANTED") {        // ← 지급도 알림도 전부 이 if 안에만 있다
        const referrerGrant = await grantBonusCreditsTx(...);
        const referredGrant = await grantBonusCreditsTx(...);
        ...
        await createNotification({ ... category: "REFERRAL", type: "REFERRAL_WELCOME_BONUS" ... }, tx);
      }

// referral-fraud.ts:111-125 — 동일 IP 반복 1건만으로도 60점(=HOLD 임계) 자동 보류
      if (sameIp > 0) { signals.push({ code: "SAME_IP_REPEAT", ... weight: 60 }); }
```

- **영향** 추천인의 fraud 신호(동일 IP 재가입, 24시간 5건 초과, 월 20건 초과) 때문에 아무 잘못 없는 신규 학원의 +30 환영 보너스까지 지급이 보류되는데, 신규 학원에는 REFERRAL_WELCOME_BONUS 알림이 발송되지 않아 '왜 30이 없지'를 알 방법이 없다. 관리자에게도 HELD 발생 알림이 없어(getHeldReferrals 를 사람이 열어봐야 함) 아무도 안 열면 영구 미지급이 된다. /register 배지 '추천 코드 적용됨 · 가입 시 +30 크레딧'과 온보딩 문구는 이 경우 사실과 다른 약속이 된다.

- **수리 제안** HELD 분기에도 (a) 신규 학원에 '환영 보너스 검토 중' 알림, (b) 추천인에 '추천 확인 중' 알림, (c) 어드민 채널로 HELD 발생 통지를 추가하고, HELD 건에 검토 SLA(예: 72시간 무처리 시 자동 승인 또는 에스컬레이션)를 건다.

### M6. 잔액이 부족하면 0크레딧만 회수하고도 어드민에 "회수 완료"로 보고된다 (미회수 부채 은닉)

- **위치** `src/lib/growth/credit-grant.ts:171` · 축 `grant` · 반증 1/2
- **근거**

```
credit-grant.ts:171-174 `const reversible = Math.min(amount, current.balance);\n  const shortfall = amount - reversible;\n\n  if (reversible > 0) {` — shortfall 은 오직 원장 metadata 의 `unreversedShortfall` 에만 기록되고(206-213) 반환값 `GrantResult` 에는 없다. 호출부 referral.ts:425-444 는 `clawbackCreditsTx` 결과를 아예 받지 않고 버린 뒤 447 `return { ok: true };`. UI 는 src/components/admin/referral-management-client.tsx:255 `if (res.success) toast.success("추천 보상을 회수했습니다.");`
```

- **영향** 부정 추천으로 받은 크레딧을 이미 다 써버린 학원(=전형적인 어뷰저)은 클로백해도 실제 회수액이 0인데 관리자 화면은 성공으로 표시된다. 더 나쁜 것은 어드민 집계가 `status IN ('GRANTED','APPROVED')` 로만 creditsIssued 를 계산하므로(src/actions/admin/referrals.ts:167-176) CLAWED_BACK 전환 즉시 발행액에서 80이 통째로 빠져, 실제로는 회수하지 못한 크레딧이 장부에서 사라진다. 부정 지급 규모를 어드민이 영구히 과소 인식한다.

- **수리 제안** `clawbackCreditsTx` 의 `GrantResult` 에 `reversedAmount`/`shortfall` 을 추가해 반환하고, `clawbackReferral` 이 이를 받아 `Referral` 에 실제 회수액 컬럼(예: clawedBackAmount)으로 남긴 뒤 `ReferralAdminActionResult` 로 올려, UI 는 shortfall>0 이면 "30 중 0 크레딧만 회수됨(잔액 부족)" 경고 토스트를 띄운다. 어드민 creditsIssued 도 CLAWED_BACK 의 미회수분을 더해 계산한다.

### M7. 추천 귀속/지급 실패가 완전 무음이고 재시도·정합 복구 경로가 0건이다

- **위치** `src/app/api/auth/onboarding/route.ts:232` · 축 `grant` · 반증 1/2
- **근거**

```
onboarding/route.ts:222-236 `try {\n      await processReferralOnSignup({ ... });\n    } catch (referralError) {\n      console.error("[onboarding] referral attribution failed", referralError);\n    }` — 삼킨 뒤 그대로 `NextResponse.json({ ok: true, bridgeToken })`. referral.ts:279 는 P2002 이외의 오류를 `throw e` 로 올려보내므로 트랜잭션 타임아웃/커넥션 오류는 전부 이 catch 로 떨어진다. src/lib/prisma.ts:30 `return new PrismaClient().$extends({...})` — transactionOptions 미지정이라 인터랙티브 트랜잭션은 기본 timeout 5s / maxWait 2s 이며, 이 트랜잭션은 referral create + code update + 지급 2회(각 upsert+create) + referral update + code update + director 조회 + 알림 2건 = 약 12 왕복이다. 게다가 prisma.ts:33-44 의 재시도 확장은 `$allOperations` 에 걸려 있어 트랜잭션 **내부** 쿼리가 일시 오류를 만나면 200/400/800ms 를 자체 소진해 5s 타임아웃을 앞당긴다(파일 주석 8-9행이 "Supabase 풀러는 유휴 시 일시 중단"을 명시).
```

- **영향** 가입은 정상 완료되고 사용자에게는 아무 오류도 보이지 않는데, 추천 귀속 행 자체가 생기지 않아 양측 보상 80크레딧이 통째로 증발한다. Referral 행이 없으므로 어드민 화면에도 나타나지 않고, HELD 대기열에도 안 잡히며, 재처리 잡·정합 스크립트도 존재하지 않는다(src/app/api/cron/·scripts/ 에 referral 참조 0건). 추천인은 "친구가 가입했는데 보상이 안 들어왔다"고만 인식하고, 운영자는 원인을 찾을 수단이 로그뿐이다. 평생 성사 1건뿐인 현 상황에서 이 무음 실패가 몇 건 섞였는지 사후 확인이 불가능하다.

- **수리 제안** ① `prisma.$transaction(fn, { timeout: 15000, maxWait: 5000 })` 로 여유를 주고 알림 생성 2건은 트랜잭션 밖(지급 커밋 후 best-effort)으로 뺀다. ② 실패 시 `ReferralAttributionFailure`(referredAcademyId, code, error) 같은 대기 행을 남기고 크론에서 재처리하거나, 최소한 어드민 화면에 "귀속 실패" 목록을 노출한다. ③ 지금 당장은 `academies` 중 smoat_ref 로 들어왔으나 referrals 행이 없는 건을 찾을 수 없으므로, 실패 시 academy.settings 에 실패 코드를 기록해 사후 정합이 가능하게 한다.

### M8. 승인·반려·회수 후 목록과 '보류' 배지가 갱신되지 않는다 (프롭 스냅샷 고착)

- **위치** `src/components/admin/referral-management-client.tsx:125` · 축 `admin` · 반증 0/2
- **근거**

```
const [overview, setOverview] = useState(initialOverview);
const [held, setHeld] = useState(initialHeld);
// ...파일 전체에 useRouter/router.refresh/useEffect 동기화가 단 한 곳도 없음(grep "router|refresh" → 0건)
// HeldRow.run(): 성공 시 toast 만 띄우고 held 상태를 갱신하지 않는다(347-351)
```

- **영향** 서버액션은 revalidatePath("/admin/referrals")(referrals.ts:333/370/409)를 부르므로 서버 트리는 재렌더되어 새 프롭이 내려오지만, useState 초기값은 이후 프롭 변경을 무시한다. 결과적으로 승인한 보류 건이 '보류 심사' 목록에 그대로 남고 탭의 빨간 배지 숫자도 줄지 않으며, 추천 현황의 상태 뱃지·통계 카드(지급 크레딧 등)도 옛 값 그대로다. 심사자는 처리 여부를 화면으로 확인할 수 없어 재클릭하게 되고, 두 번째 호출은 '보류 상태인 추천만 승인할 수 있습니다'(referrals.ts:316) 로 실패해 '승인이 안 됐다'고 오판하기 쉽다(실제로는 1회 지급 완료). 참고로 미션 탭은 프롭을 직접 읽어(424, 492) 이 문제가 없다 — 즉 결함은 overview/held 두 탭에 국한된다.

- **수리 제안** 각 뮤테이션 성공 후 이미 있는 로더를 재사용해 재조회하라(`loadHeldPage(held.page)` + `loadOverviewPage(overview.page)`). 콜백을 HeldRow/OverviewRow 로 내려주거나, 최소한 useRouter().refresh() + 프롭 동기화(useEffect 로 setHeld(initialHeld))를 붙인다.

### M9. 크레딧을 발행/회수하는 서버액션에 SUPER_ADMIN 역할 게이트가 없다 (코드베이스 관례 이탈)

- **위치** `src/actions/admin/referrals.ts:302` · 축 `admin` · 반증 0/2
- **근거**

```
export async function approveReferral(...) {
  const session = await requireAdminAuth();   // 302 — 역할 인자 없음
// 동일 패턴: 341 rejectReferral, 378 clawbackReferral, 450 upsertMission, 533 toggleMission, 590 sendAnnouncement
// 대조군: src/actions/admin/credits.ts:36 `const admin = await requireAdminAuth("SUPER_ADMIN")`,
//        credit-products.ts:40/148/..., printable-coupons.ts:197 등 돈을 만지는 액션은 모두 역할 인자를 넘긴다.
```

- **영향** requireAdminAuth(src/lib/auth-admin.ts:92-99)는 인자가 없으면 role 검사를 건너뛰므로 role="SUPPORT" 관리자도 (1) 보류 추천 승인으로 크레딧 실지급, (2) 미션 보상액을 최대 100,000 까지 변경(upsertMission 스키마 431줄) → 전 학원이 매일 청구 가능, (3) 전 학원(245곳) 대상 공지 일괄 발송을 할 수 있다. 원장(스태프 NextAuth 세션)은 yshin-admin-session 쿠키가 없어 requireAdminAuth 가 throw 하므로 원장 계정 구멍은 없다. 실측상 super_admins 는 SUPER_ADMIN 1명뿐이라 현재 악용 가능한 계정은 없고 잠재 결함이지만, SUPPORT 계정을 하나 만드는 순간 크레딧 발행 권한이 함께 열린다.

- **수리 제안** 돈·전체 발송에 닿는 여섯 액션(approveReferral·rejectReferral·clawbackReferral·upsertMission·toggleMission·sendAnnouncement)에 `requireAdminAuth("SUPER_ADMIN")` 을 적용한다. 읽기 액션은 현행 유지해도 무방하다.

### M10. 학생 리포트 공유 패널이 KAKAO_SHARE 추천 미션 보상을 발화하고, 학부모에게 추천 마케팅 문구를 보낸다

- **위치** `src/components/exam-report/report/share-panel.tsx:157` · 축 `missions` · 반증 0/2
- **근거**

```
<KakaoShareButton link={shareUrl} className="w-full" />  ← title/description/recordMission 미지정. 기본값은 recordMission=true 이고 카드 자구는 "SMOAT — AI 영어 문제 생성" / "추천 코드로 가입하면 두 학원 모두 크레딧을 받아요"(kakao-share-button.tsx:75,103-105,121). 형제 호출부는 정확히 이걸 피하고 있다 — rail-exam-share-block.tsx:240-246 은 `recordMission={false}` + 리포트 전용 자구를 명시하고, invite-kit-sheet.tsx:11 주석은 "KakaoShareButton 은 추천(리퍼럴) 문구·미션 보상 호출이 하드코딩돼 있어"라며 사용을 회피한다.
```

- **영향** (1) 학부모에게 나가는 리포트 공유 카드에 원장 대상 추천 크레딧 마케팅 문구가 실려 나간다. (2) 추천 링크를 공유한 적이 없는 원장이 학부모 공유만으로 KAKAO_SHARE 10크레딧을 수령해 「추천 링크 카카오톡 공유」 미션이 완료 처리된다(POST /api/missions/share → 크레딧 거래 description "미션 보상: 추천 링크 카카오톡 공유"). 지급 액수는 1회 10크레딧으로 유계지만 미션 통계·완료 상태가 오염된다. recordMission 탈출구는 26-09-03 에 추가됐는데 이 호출부만 갱신되지 않았다(share-panel 최종 커밋 3f155ca6, 26-07-07).

- **수리 제안** share-panel.tsx:157 을 `recordMission={false}` + 리포트용 title/description/buttonTitle 로 교체(rail-exam-share-block.tsx:240 과 동일 계약). 근본적으로는 KakaoShareButton 의 기본값을 recordMission=false 로 뒤집고 추천 화면에서만 명시적으로 true 를 넘기게 해 「기본값이 과금 부작용」인 구조를 없앤다.

### M11. HELD·REJECTED·CLAWED_BACK 추천은 알림이 0건 — 실패·회수가 양측에 완전히 무음

- **위치** `src/lib/growth/referral.ts:203` · 축 `missions` · 반증 0/2
- **근거**

```
if (status === "GRANTED") { ... createNotification(REFERRAL_FRIEND_JOINED) ... createNotification(REFERRAL_WELCOME_BONUS) ... }  ← else 분기 없음. rejectHeldReferral(:375-395)은 updateMany 로 상태만 REJECTED 로 바꾸고 알림 없음. clawbackReferral(:398-450)은 clawbackCreditsTx 로 양측 크레딧을 되돌리면서도 createNotification 호출이 전혀 없다(같은 파일의 approveHeldReferral 만 :350-366 에서 알림을 만든다).
```

- **영향** fraudScore >= 60(constants.ts:26)로 HELD 된 추천은 추천인도 신규 학원도 아무 통지를 못 받는다. 신규 학원 입장에서는 추천 코드를 넣었는데 환영 30크레딧이 안 들어오고 이유도 없다(문의 유발·이탈). 회수(clawback)는 더 나쁘다 — 이미 지급된 50/30 크레딧이 잔액에서 사라지는데 알림이 없어 원장은 크레딧이 소리 없이 줄었다고 인식한다. 현재 prod 에는 HELD/REJECTED/CLAWED_BACK 행이 0건이라 잠복 상태지만, 부정 방지 게이트가 처음 작동하는 순간 그대로 터진다.

- **수리 제안** processReferralOnSignup 에 status==="HELD" 분기를 추가해 양측에 「검토 중」 알림(REFERRAL_HELD)을 남기고, rejectHeldReferral/clawbackReferral 에도 사유(reviewNote) 포함 알림을 트랜잭션 안에서 생성한다. 최소한 크레딧이 차감되는 clawback 은 알림 필수.

### M12. ONBOARD_PROFILE 조건이 logoUrl 인데 이를 채울 수단이 「자유 텍스트 URL 1칸(선택)」뿐 — 245곳 중 2곳만 조건 충족, 평생 클레임 0건

- **위치** `src/lib/growth/missions.ts:62` · 축 `missions` · 반증 0/2
- **근거**

```
case MISSION_KEYS.ONBOARD_PROFILE: return ctx.logoUrl ? { met:true } : { met:false, reason:"학원 로고를 등록하면 받을 수 있어요" };  ← 조건 입력 표면은 account-tab.tsx:355 의 `<FieldLabel>로고 URL (선택)</FieldLabel>` + `<input type="url" placeholder="https://...">` 단 하나다(파일 업로드 없음, 크레딧 언급 없음, 라벨이 「선택」).
```

- **영향** 원장이 로고를 등록하려면 이미지를 외부 어딘가에 호스팅해 https URL 을 손으로 붙여넣어야 한다. 실측 academies 245곳 중 logoUrl 보유 2곳(0.8%), 그 2곳조차 ONBOARD_PROFILE 을 클레임하지 않았다(재방문 클릭이 필요 — 결함 #1과 복합). 결과: 30크레딧 미션이 서비스 개시 이후 단 한 번도 지급된 적이 없다. 「죽은 미션」의 원인은 트리거 부재가 아니라 조건 도달 불가 + 수령 동선 부재다(클레임 경로 자체는 POST /api/missions/ONBOARD_PROFILE/claim 로 살아 있다).

- **수리 제안** (a) 조건을 실제로 달성 가능한 것으로 교체(학원명+주소+연락처+대표과목 등 이미 채워진 필드 조합) 하거나 Supabase 스토리지 업로드 위젯을 설치하고, (b) 설정 화면 로고 필드 옆에 「등록하면 +30 크레딧」 배지를 달아 미션과 조건 표면을 연결한다. (c) logoUrl 저장 성공 시 서버에서 claimMission(ONBOARD_PROFILE) 을 자동 호출.

### M13. 카카오 가입(원장 59%)에서 이메일·전화가 전부 자기신고 → weight 100짜리 자가추천 신호 2개가 무력화

- **위치** `src/app/api/auth/onboarding/route.ts:75` · 축 `security` · 반증 1/2
- **근거**

```
onboarding/route.ts:75-80 —
  if (payload.provider === "google") {
    const payloadEmail = payload.email?.trim().toLowerCase();
    if (!payloadEmail || payloadEmail !== directorEmail) {
      return NextResponse.json({ error: "email_mismatch" }, { status: 400 });
    }
  }

kakao/route.ts:79 — authorizeUrl.searchParams.set("scope", "profile_nickname profile_image");
kakao/route.ts:181-186 — // Email cannot come from Kakao (biz scope gate), so the user supplies it during onboarding. … email: null,

onboarding/route.ts:22 — directorPhone: z.string().regex(phoneRegex, "invalid_phone")  // 형식만 검사, SMS 인증 없음
prisma/schema.prisma model Staff — emailVerified 컬럼 자체가 없음

referral-fraud.ts:70-76, 88-94 — SAME_DIRECTOR_PHONE / SAME_DIRECTOR_EMAIL 각 weight 100 (이 두 개가 자가추천 탐지의 전부)
```

- **영향** 부정탐지의 주력 신호 2개(각 100점, 즉 단독으로 HELD 확정)가 공격자가 키보드로 아무 값이나 쳐 넣으면 그대로 우회된다. 프로덕션 원장 245명 중 카카오 145명(59%)이 이 경로다. 자가추천 1건당 가짜 학원에 50(가입)+30(환영)=80, 추천인에게 50 → 총 130 크레딧이 자동 지급되며 어떤 신호도 켜지지 않는다.

- **수리 제안** (a) 카카오 비즈앱 승인을 받아 account_email scope를 획득하고, 그 전까지는 카카오 온보딩에 이메일 소유확인(인증메일 클릭) 또는 휴대폰 본인확인을 붙여 directorEmail/directorPhone을 검증된 값으로만 확정한다. (b) 검증되지 않은 식별자로 들어온 가입은 추천 보상을 GRANTED가 아니라 무조건 HELD로 라우팅하도록 evaluateReferralFraud에 `UNVERIFIED_IDENTITY`(weight 60) 신호를 추가한다 — 검증이 붙기 전까지의 최소 안전장치.

### M14. VELOCITY 가중치(40)가 보류 임계(60)보다 낮아, 대량 추천이 속도 신호만으로는 절대 보류되지 않는다

- **위치** `src/lib/growth/referral-fraud.ts:102` · 축 `security` · 반증 1/2
- **근거**

```
constants.ts:26 — export const REFERRAL_HOLD_FRAUD_SCORE = 60;
constants.ts:30-31 — REFERRAL_VELOCITY_WINDOW_HOURS = 24; REFERRAL_VELOCITY_MAX = 5;
constants.ts:28 — REFERRAL_MAX_REWARDED_PER_MONTH = 20;

referral-fraud.ts:102-108 —
  if (recentCount >= REFERRAL_VELOCITY_MAX) {
    signals.push({ code: "VELOCITY", detail: `최근 24시간 내 추천 ${recentCount}건`, weight: 40 });
  }
referral-fraud.ts:144-145 —
  const score = Math.min(100, signals.reduce((sum, s) => sum + s.weight, 0));
  return { score, signals, shouldHold: score >= REFERRAL_HOLD_FRAUD_SCORE };

또한 월 상한은 추천인 학원 **단위**다:
referral-fraud.ts:129-135 — where: { referrerAcademyId: input.referrerAcademyId, ... } (플랫폼 전역 상한 없음)
```

- **영향** F1·F2로 100점/60점 신호를 모두 회피한 공격자에게 남는 유일한 브레이크가 VELOCITY인데, 40점이라 단독으로는 절대 60을 못 넘는다. 24시간에 5건이든 50건이든 전부 GRANTED. 실제 브레이크는 MONTHLY_CAP(60점) 하나뿐이라 추천인 학원 1개당 월 20건 × 80크레딧 = 1,600크레딧이 무심사 자동 지급되고, 가짜 학원들 자신도 각각 새 추천인이 될 수 있어(코드는 학원마다 자동 발급) 전체 규모에는 상한이 없다.

- **수리 제안** (a) VELOCITY 가중치를 60 이상으로 올리거나(속도 이상은 그 자체로 심사 사유), 단계형으로 만든다(≥5 → 40, ≥8 → 70). (b) MONTHLY_CAP을 "넘으면 HELD"가 아니라 하드 상한으로 바꾸고, 플랫폼 전역 일일 지급 상한(신규 학원 수 대비 비율)을 추가한다. (c) 신규 가입 학원이 즉시 추천인이 될 수 없도록 최소 활동 요건(예: 결제 이력 또는 실사용 N일)을 코드 발급 조건에 건다.

### M15. POST /api/referral/click 은 미인증 무제한 DB 쓰기 — 쿠키 디듀프는 쿠키를 안 보내면 그만

- **위치** `src/app/api/referral/click/route.ts:28` · 축 `security` · 반증 1/2
- **근거**

```
click/route.ts:9-16 (주석이 스스로 자백) —
  // PUBLIC endpoint (no auth) … (b) dedupe per browser via a short-lived cookie …
  // (A true edge rate-limiter is a recommended follow-up.)
click/route.ts:28-38 —
  if (code && request.cookies.get(CLICK_DEDUPE_COOKIE)?.value !== code) {
    await recordReferralClick(code).catch(...);
    res.cookies.set(CLICK_DEDUPE_COOKIE, code, { httpOnly: true, sameSite: "lax", maxAge: 21600, path: "/" });
  }
referral.ts:105-116 —
  await prisma.referralCode.updateMany({ where: { code: normalized }, data: { totalClicks: { increment: 1 } } });

레이트리밋 인프라는 이 경로에 없음: 리포 전체에서 rate-limit 구현은 src/lib/printable-coupon-claim.ts 하나뿐이고, middleware.ts 파일이 존재하지 않으며(find 결과 0건), vercel.json 에도 WAF/limit 설정이 없다.
```

- **영향** 디듀프의 유일한 근거가 요청에 실려 오는 쿠키라, 쿠키를 보내지 않는 클라이언트(curl 루프)에는 아무 제약이 없다. 유효 코드 하나를 아는 사람이면 누구나 (a) 그 원장 대시보드의 totalClicks를 임의 숫자로 오염시켜 성과 지표를 거짓말로 만들고, (b) 서버리스 환경에서 미인증 DB write를 무한 증폭시켜 함수 호출·DB 비용을 태울 수 있다. 링크는 카카오톡 공유용이라 코드 노출 자체가 정상 시나리오다.

- **수리 제안** (a) IP 기준 fixed-window 레이트리밋을 붙인다 — 같은 리포의 `consumeRateLimit("ip", ip, {windowMs, max})`(src/lib/printable-coupon-claim.ts)를 그대로 재사용할 수 있다. (b) 서버측 디듀프 키를 쿠키가 아니라 (code, ipHash, 시간버킷) 조합으로 두어 클라이언트가 초기화할 수 없게 한다. (c) totalClicks를 실시간 증분 대신 원시 이벤트 적재 후 집계로 바꾸면 오염을 사후 정정할 수 있다.

### M16. 추천 코드가 「리워드 페이지를 직접 연 사람」에게만 존재한다 — 245개원 중 217곳(88.6%)은 코드 자체가 없음

- **위치** `src/lib/growth/referral.ts:46` · 축 `reachability` · 반증 1/2
- **근거**

```
referral.ts:46 `export async function getOrCreateReferralCode(academyId, createdByStaffId?) { const existing = await prisma.referralCode.findUnique(...); if (existing) return existing; ... prisma.referralCode.create(...) }`
referral.ts:81 `const referralCode = await getOrCreateReferralCode(academyId);` (getReferralStats 내부)
api/referral/route.ts:14 `const stats = await getReferralStats(staff.academyId);`
rewards-client.tsx:74 `const res = await fetch("/api/referral", { cache: "no-store" });`
grep 실측: `getOrCreateReferralCode` 의 리포 전체 호출자 = getReferralStats 1개, `getReferralStats` 호출자 = /api/referral 1개, `"/api/referral"` 소비자 = rewards-client.tsx 1개.
DB 실측(2026-09-04): academies 245 / referral_codes 28 / '/director/rewards' PAGE_VIEW 를 남긴 학원 29 / 그 방문 없이 생성된 코드 0건(codes_without_view=0).
```

- **영향** 「원장이 추천 링크를 얻는다」는 사슬의 0번째 고리가 사실상 끊겨 있다. 코드는 사전 발급되지 않고 페이지 방문 시 지연 생성되므로, 어드민이 학원 목록을 보며 코드를 안내할 수도 없고, 원장이 다른 경로(카톡 상담·세미나)에서 '내 코드'를 물어봐도 답할 자료가 DB에 없다. 프로그램 전체 성과가 3개월간 추천 1건인 근본 원인이 품질이 아니라 도달성임을 실측이 가리킨다.

- **수리 제안** 코드 발급을 페이지 방문에서 분리한다. (a) 온보딩 완료 트랜잭션(`src/app/api/auth/onboarding/route.ts`)에서 `getOrCreateReferralCode(academyId, staffId)` 를 함께 호출해 전 학원에 코드를 선발급하고, (b) 기존 217개원에 대해 1회성 백필 스크립트를 돌린다(코드 생성은 부작용이 없는 순수 발급이므로 안전). 그러면 어드민·크레딧 페이지·알림 어디서든 '내 추천 코드'를 즉시 노출할 수 있게 된다.

### M17. 앱 전체에서 리워드/추천으로 가는 진입점이 사이드바 1곳뿐 — 크레딧이 부족한 순간에도 유도가 없다

- **위치** `src/components/layout/nav-config.ts:378` · 축 `reachability` · 반증 1/2
- **근거**

```
grep -rln "리워드|추천 코드|크레딧 미션" src/app/(director)/ src/components/ → 매치 파일이 rewards/page.tsx, rewards/rewards-client.tsx, growth/kakao-share-button.tsx, layout/nav-config.ts 4개뿐.
nav-config.ts:378 `{ label: "리워드", icon: Gift, href: `${basePath}/rewards`, directorOnly: true },`
크레딧 관리 페이지 `src/app/(director)/director/credits/page.tsx`(583줄) 안에 '리워드'·'미션'·'추천' 문자열 0건.
크레딧 부족 토스트들도 리워드로 보내지 않는다 — 예: `src/components/exams/exam-detail-client-parts/deployment-tab-parts/boost-button.tsx:66` `` `크레딧이 부족합니다. (보유 ${body.balance} / 필요 ${body.required})` `` (액션 링크 없음), `src/components/workbench/analysis-report/webtoon-picker-modal.tsx:387` 동일.
랜딩/마케팅(src/app/page.tsx 및 하위) 에도 추천 프로그램 언급 0건.
DB 실측: /director/credits 508뷰·71개원 vs /director/rewards 140뷰·29개원.
```

- **영향** 크레딧이 바닥나 결제 의사가 가장 높은 순간(생성 실패 토스트, 크레딧 관리 페이지)에 '추천하면 +50' 이라는 무료 획득 경로가 한 번도 제시되지 않는다. 리워드 도달률이 크레딧 페이지 도달률의 41% 에 그치는 이유가 이 배선 부재로 설명된다.

- **수리 제안** (1) 크레딧 부족 토스트에 `action: { label: "무료로 받기", onClick: () => router.push("/director/rewards") }` 추가, (2) `/director/credits` 상단에 '미션·추천으로 크레딧 받기' 배너 카드 1개(내 코드 + 링크 복사 인라인), (3) `src/components/site-banners/templates/` 에 referral 템플릿을 추가해 전사 배너로 1회 고지.

### M18. 추천 코드가 가입 시 발급되지 않고 리워드 화면 최초 방문 때만 lazy 생성 — 출시 후 가입 학원 87%가 추천 링크를 가진 적이 없다

- **위치** `src/lib/growth/referral.ts:81` · 축 `live-forensics` · 반증 1/2
- **근거**

```
referral.ts:80-81 `export async function getReferralStats(academyId: string): Promise<ReferralStats> {\n  const referralCode = await getOrCreateReferralCode(academyId);` — grep 전수 결과 `getOrCreateReferralCode` 호출부는 이 한 줄뿐이고, 그 호출자는 `GET /api/referral`(src/app/api/referral/route.ts:14 `const stats = await getReferralStats(staff.academyId);`) 뿐이며, 그 호출자는 `rewards-client.tsx:74 const res = await fetch("/api/referral", { cache: "no-store" });` 뿐이다. src/app/api/auth/onboarding/route.ts 에는 발급 호출이 없다.
프로덕션 실측: `SELECT COUNT(*) FROM academies` = 245, `SELECT COUNT(*) FROM referral_codes` = 28 (11.4%). 출시일(2026-06-18) 이후 가입 학원 127개 중 코드 보유 17개, 미보유 110개(86.6%). 월별: 26-06 가입 94개 중 코드 5개, 26-07 36개 중 9개, 26-08 35개 중 5개, 26-09 12개 중 **0개**.
발급 시점 실측(referral_codes JOIN academies): n=28, 학원생성→코드생성 지연 60초 이내 1건 / 1일 이내 15건 / 1일 초과 12건, min 0일·max 95.992일·avg 23.099일. 출시 후 가입분만 보면 n=17, 60초 이내 1건, min 29.5초, max 2,941,747초(34.0일).
28행 전부 `createdByStaffId IS NULL` — referral.ts:81 이 staffId 인자 없이 부르는 경로(referral.ts:46 `getOrCreateReferralCode(academyId, createdByStaffId?)`)로만 생성됐음을 확정한다.
```

- **영향** 「원장이 추천 링크를 얻는다」는 사슬의 0번째 고리가 87%에서 조용히 끊긴다. 코드가 없으면 링크도, 카카오 공유도, 귀속도 불가능하다. 출시 후 78일간 전 플랫폼 클릭 4회·귀속 1건(127개원 대비 0.79%)이라는 실적은 전환율 문제가 아니라 유통 문제다. 오류 로그도 500도 남지 않아 계기상 완전히 무증상이다.

- **수리 제안** 온보딩 트랜잭션 커밋 직후(processReferralOnSignup 호출 부근, onboarding/route.ts:224 인접)에서 `getOrCreateReferralCode(academy.id, staff.id)` 를 best-effort 로 호출해 가입 즉시 코드를 확정하고, 기존 245개 학원 전체에 1회 백필한다(코드 생성은 credit 부작용이 없어 안전). 그 다음에야 「링크를 보여주는 표면」(가입 완료 화면·대시보드 배너·알림)을 붙일 가치가 생긴다.

### M19. 추천 코드가 무효/중복/자가여도 신규 원장에게 아무 통보가 없고, 입력한 코드는 어디에도 저장되지 않는다

- **위치** `src/app/api/auth/onboarding/route.ts:222` · 축 `e2e-trace` · 반증 0/2
- **근거**

```
  if (referralCodeCandidate) {
    try {
      await processReferralOnSignup({ ... });   // :224 — 반환값을 받지도 않는다
    } catch (referralError) {
      console.error("[onboarding] referral attribution failed", referralError);   // :235
    }
  }
  ...
  return NextResponse.json({ ok: true, bridgeToken });   // :245 — referral 결과 미포함

// referral.ts 의 조용한 4갈래 early return:
  if (!normalized) return { ok: false, reason: "invalid_code" };        // :149
  if (!referralCode) return { ok: false, reason: "invalid_code" };      // :152
  if (referrerAcademyId === input.referredAcademyId) return {..."self_referral"};  // :155-157
  if (existing) return { ok: false, reason: "already_referred" };       // :164
```

- **영향** 온보딩 화면은 「추천 코드 입력 시 가입 환영 +30 크레딧이 적립됩니다」(onboarding/page.tsx:313-315)라고 약속하고, /register 배지도 「추천 코드 적용됨 · 가입 시 +30 크레딧」(register/page.tsx:158)이라고 못 박는다. 그런데 코드에 오타가 하나만 있어도(코드 알파벳은 0/O/1/I/L 을 뺀 31자라 전사 오류가 잦다) 지급은 전혀 없고 화면에도 응답에도 오류가 없으며, 사용자가 무엇을 입력했는지 DB 어디에도 남지 않아 사후 구제·원인 규명이 원천적으로 불가능하다. 추천인 쪽도 「가입했다는데 왜 크레딧이 없냐」는 문의를 받게 되고, 운영자는 대조할 데이터가 없다.

- **수리 제안** (1) `const referralResult = await processReferralOnSignup(...)` 로 결과를 받아 응답 JSON 에 `referral: { ok, reason, status }` 를 실어 보내고, 온보딩 클라이언트가 invalid_code 일 때 「추천 코드를 확인해 주세요」를 인라인으로 띄운다(가입 자체는 계속 진행). (2) 코드가 무효여도 입력값 원문을 `academies.settings.onboarding.referralCodeAttempted` 에 남겨 사후 수동 귀속이 가능하게 한다. (3) 이상적으로는 온보딩 폼에서 코드 입력 시 실시간 검증 엔드포인트로 유효성을 표시한다.

### M20. HELD 판정 시 신규 학원은 약속된 +30을 못 받고 양쪽 모두 알림이 0건 — 화면상 「추천 실패」와 구분 불가

- **위치** `src/lib/growth/referral.ts:203` · 축 `e2e-trace` · 반증 1/2
- **근거**

```
      const status: "GRANTED" | "HELD" = fraud.shouldHold ? "HELD" : "GRANTED";   // :174
      ...
      if (status === "GRANTED") {          // :203 — 이 블록 안에 지급·카운터·알림 2건이 전부 들어 있다
        const referrerGrant = await grantBonusCreditsTx(...);
        const referredGrant = await grantBonusCreditsTx(...);
        await tx.referralCode.update({ ... totalRewarded ... });
        if (referrerDirectorId) { await createNotification({ type: "REFERRAL_FRIEND_JOINED" ... }) }   // :239
        if (input.referredStaffId) { await createNotification({ type: "REFERRAL_WELCOME_BONUS" ... }) } // :259
      }
      // HELD 면 여기까지 오지 않는다 — 알림 없음, 지급 없음, 사용자 통보 없음

// 원장 화면은 heldCount 를 계산은 하지만(referral.ts:87,99) 절대 그리지 않는다:
  <ReferralStat label="가입" value={referral.totalSignups} suffix="명" />        // rewards-client.tsx:427
  <ReferralStat label="보상" value={referral.rewardedCount} suffix="건" />      // :428
  <ReferralStat label="적립" value={referral.creditsEarned} suffix="크레딧" />  // :429
```

- **영향** 부정 점수 60점 이상이면(같은 IP 반복 1건이면 즉시 60점 — referral-fraud.ts:120-124) 보상이 관리자 검토 큐로 넘어가는데, 이 사실을 아는 사람이 아무도 없다. 신규 원장은 가입 화면이 약속한 +30 크레딧을 받지 못한 채 어떤 안내도 못 받고, 추천인 화면에는 「가입 1명 / 보상 0건」만 떠서 오귀속·실패와 구분이 안 된다. 관리자도 /admin/referrals 를 능동적으로 들여다보지 않으면 대기 건을 영원히 모른다(알림·배지 없음). 정당한 추천(예: 같은 학원가 건물의 두 원장, 같은 공용 IP)이 조용히 묻힌다.

- **수리 제안** HELD 분기에도 (a) 신규 학원에 「추천 보상은 확인 후 지급됩니다」 알림, (b) 추천인에게 「검토 중 1건」 알림을 생성하고, (c) rewards-client 의 stat 그리드에 heldCount(「검토 중」)를 추가한다. 관리자 쪽에는 HELD 발생 시 관리자 알림/배지를 띄운다.

### M21. 첫 자가추천은 부정 점수 0으로 항상 즉시 지급된다 — IP 대조가 「이 추천인의 이전 referral 행」과만 이뤄진다

- **위치** `src/lib/growth/referral-fraud.ts:112` · 축 `e2e-trace` · 반증 1/2
- **근거**

```
  if (input.signupIp) {
    const sameIp = await prisma.referral.count({
      where: { referrerAcademyId: input.referrerAcademyId, signupIp: input.signupIp },   // :113
    });
    if (sameIp > 0) { signals.push({ code: "SAME_IP_REPEAT", ..., weight: 60 }); }
  }
// 추천인 학원 자신의 가입 IP·기기와는 대조하지 않는다(Academy/Staff 에 signupIp 컬럼이 없다).
// 자가추천 하드 가드는 사실상 전화번호/이메일 일치뿐:
  if (refPhone && newPhone && refPhone === newPhone) { ... weight: 100 }   // :70-76
  if (normalize(refEmail) === normalize(newEmail)) { ... weight: 100 }     // :88-94

// 실측(프로덕션 유일 1건):
//  status=GRANTED, fraudScore=0, fraudSignals=[], signupIp=112.154.21.175
```

- **영향** 원장이 자기 노트북에서 다른 이메일·다른 전화번호로 두 번째 「학원」을 만들면 첫 건은 신호가 하나도 잡히지 않아(sameIp 는 이전 referral 행이 없어 0) 즉시 50+30=80 크레딧이 지급된다. 방어선은 두 번째 시도부터만 작동한다. B2B 라 악용 유인이 낮다는 설계 전제에 기대고 있으나, 신규 학원은 가입 크레딧(getSignupCredits)까지 함께 받으므로 계정 하나당 총 이득이 80보다 크다.

- **수리 제안** Academy 또는 Staff 에 가입 IP/UA 를 저장하고, 추천인 학원의 가입 IP·현재 세션 IP 와 신규 가입 IP 를 대조하는 신호를 추가한다(가중치 60). 또는 첫 N건은 소액 지연 지급(가입 후 7일 + 첫 생성 1건 조건)으로 바꿔 즉시 현금화 유인을 없앤다.

### M22. 추천 코드는 원장이 「리워드」 페이지를 열어야 비로소 생성된다 — 245개원 중 28개(11%)만 코드를 보유

- **위치** `src/lib/growth/referral.ts:81` · 축 `e2e-trace` · 반증 1/2
- **근거**

```
export async function getReferralStats(academyId: string): Promise<ReferralStats> {
  const referralCode = await getOrCreateReferralCode(academyId);   // :81 — GET 요청의 부수효과로 코드 생성
  ...
}
// 호출자는 오직 이 GET 뿐:
//   src/app/api/referral/route.ts:14  const stats = await getReferralStats(staff.academyId);
// 온보딩(route.ts:137-214)에서는 신규 학원에 ReferralCode 를 만들지 않는다.

// 실측: academies 245 / referral_codes 28 (11%) / 그중 클릭 1건 이상인 코드 1개
```

- **영향** 프로그램의 존재 자체가 「좌측 nav 의 리워드 메뉴를 눌러본 원장」에게만 열린다. 89%의 학원은 코드조차 없고, 코드가 없으니 링크도 공유도 없다. 실측 신규 가입 245건(26-05 이후) 대비 추천 성사 1건이라는 결과는 지급 로직의 결함이 아니라 이 진입 병목의 산술적 귀결이다. 실제로 미션 클레임을 한 번이라도 한 학원은 12개원뿐이다.

- **수리 제안** 온보딩 트랜잭션 커밋 직후 `getOrCreateReferralCode(academy.id)` 를 호출해 전 학원에 코드를 선발급하고, 가입 완료·첫 생성 완료 시점에 「동료 원장께 30크레딧 선물」 알림/배너를 밀어넣어 리워드 페이지로 유도한다(현재는 어떤 진입 유도도 없다).


## 7. 확정 결함 — MINOR (62건)

| # | 결함 | 위치 | 수리 요지 |
|---|---|---|---|
| m1 | createdByStaffId 가 영구 null — 발급 주체 감사추적이 통째로 비어 있다 | `src/lib/growth/referral.ts:81` | `getReferralStats(academyId, staffId?)` 로 시그니처를 넓히고 route.ts:14 를 `getReferralStats(staff.academyId, staff.id)` 로, referral.ts:81 을 `getOrCreateReferralCode(academyId, staffId)` 로 배선한다. |
| m2 | totalClicks 를 API 로 내려보내지만 원장 화면 어디에도 표시하지 않는다 | `src/app/(director)/director/rewards/rewards-client.tsx:424` | 통계 그리드를 4칸으로 늘려 `<ReferralStat label="링크 열람" value={referral.totalClicks} suffix="회" />` 를 추가한다. |
| m3 | OAuth 왕복의 추천코드 캐리어가 클라이언트 쿠키 단 하나 — state/redirectTo 에 ref 를 태우지 않는다 | `src/app/(auth)/register/page.tsx:70` | OAuth 진입 시 `ref` 를 서버가 신뢰하는 채널에도 동시에 태운다. Kakao 는 `encodeState` 에 `ref` 를 추가하고 콜백에서 `parseState` 로 복원, Google 은 `redirectTo` 의 `/auth/callback` 쿼리에 `ref` 를 넣어 `/auth/onboarding` 리다이렉트(auth/callback/ro |
| m4 | 클릭 카운터는 아무 화면에도 노출되지 않는 write-only 데이터 — 무인증 DB 쓰기만 남았다 | `src/app/(director)/director/rewards/rewards-client.tsx:427` | 둘 중 하나로 정리한다. (a) 노출: ReferralStat 을 4칸으로 늘려 `클릭 {totalClicks}회` 를 함께 보여주고 클릭→가입 전환율을 원장에게 준다. (b) 폐기: 노출 계획이 없으면 `/api/referral/click` 라우트와 register 의 fetch(57-63행)를 제거해 무인증 쓰기 표면을 없앤다. |
| m5 | 클릭 카운터의 유일한 남용 방지가 자기 브라우저 쿠키라 임의 조작이 가능 | `src/app/api/referral/click/route.ts:29` | 카운터를 노출할 계획이면 IP+코드 기준 레이트리밋(Upstash/Vercel KV 등)이나 최소한 IP 해시 단위 일일 상한을 붙이고, 봇 UA 를 제외한다. 노출하지 않을 계획이면 엔드포인트를 제거한다. |
| m6 | OAuth 취소·오류 복귀 시 ?ref 가 유실되어 「추천 코드 적용됨 +30 크레딧」 배지가 사라진다 | `src/app/api/auth/kakao/route.ts:46` | 두 errorRedirect 헬퍼가 원 요청의 `ref`(또는 요청 쿠키의 smoat_ref)를 읽어 복귀 URL 에 다시 붙이거나, 배지 렌더 조건을 `searchParams.get("ref")` 대신 「URL ref ?? 쿠키 값」으로 바꿔 쿠키만 남아도 배지가 뜨게 한다. |
| m7 | '추천 코드 적용됨 · +30 크레딧' 배지가 검증 없이 뜬다 — 존재하지 않는 코드에도 동일 | `src/app/(auth)/register/page.tsx:155` | 코드 존재 여부만 반환하는 읽기 전용 공개 엔드포인트를 만들고(레이트리밋 필수) 배지를 검증 결과에 종속시킨다. 검증 전에는 「추천 코드 확인 중」, 실패 시 「이 추천 코드를 찾을 수 없습니다」로 표시. |
| m8 | 프리필된 추천 코드를 사용자가 지워도 쿠키가 되살려 강제 귀속한다 | `src/app/api/auth/onboarding/route.ts:220` | 폼이 실제로 제출됐는지와 값이 비었는지를 구분한다. `referralCode` 키가 payload 에 존재하면(빈 문자열 포함) 그 값을 진실로 삼고, 키 자체가 없을 때만 쿠키 폴백을 쓴다. |
| m9 | 귀속 성공 후에도 smoat_ref 쿠키를 지우지 않아 30일간 잔존한다 | `src/app/api/auth/onboarding/route.ts:237` | 귀속을 시도한 뒤(성공·실패 무관) 응답에서 `res.cookies.set(REFERRAL_COOKIE, "", { maxAge: 0, path: "/" })` 로 쿠키를 소각한다. 온보딩 라우트가 현재 NextResponse.json 을 그대로 반환하므로 한 줄이면 된다. |
| m10 | 학원 생성 트랜잭션 밖에서 귀속을 시도하고 예외를 삼키는데, 사후 복구·수동 귀속 경로가 0이다 | `src/app/api/auth/onboarding/route.ts:216` | (a) 실패 시도를 남기는 테이블/상태(예: Referral status='FAILED' 또는 별도 referral_attempts)를 만들어 어드민 큐에 노출하고, (b) 어드민에 '수동 귀속(학원 + 코드 지정 → 검증 후 GRANTED)' 액션을 추가하며, (c) 온보딩 응답에 귀속 결과를 실어 클라이언트가 실패 시 1회 재시도(POST /api/re |
| m11 | 사용자가 프리필된 추천 코드를 지워도 쿠키가 대신 귀속한다 | `src/app/api/auth/onboarding/route.ts:220` | 폼이 추천 코드 필드를 '명시적으로 보냈는지'를 구분해라(예: referralCodeTouched 플래그, 또는 프리필된 경우 필드가 제출되면 그 값만 신뢰하고 쿠키 폴백은 필드 미노출 경로에서만 사용). 프리필된 값을 비운 제출은 귀속 포기로 처리한다. |
| m12 | 이미 만료된(또는 만료 예정) 잔액에 보상을 얹으면 지급 즉시 소멸한다 — RIDE 지급이 expiresAt 을 전혀 보지 않음 | `src/lib/growth/credit-grant.ts:113` | `grantBonusCreditsTx` 진입부에서 (a) 만료된 잔액이면 먼저 sweep 을 돌려 0으로 정리하고 expiresAt=NULL 로 만든 뒤 지급하거나, (b) RIDE 분기의 upsert update 에도 `"expiresAt" = CASE WHEN credit_balances."expiresAt" IS NULL OR credit_balanc |
| m13 | 클로백해도 totalRewarded 가 차감되지 않아 코드별 누적 발행액이 단조 증가한다 | `src/lib/growth/referral.ts:425` | `clawbackReferral` 트랜잭션 안에서 `tx.referralCode.update({ where: { id: referral.referralCodeId }, data: { totalRewarded: { decrement: 실제회수액 } } })` 를 수행하거나(#1 의 실제 회수액과 연동), 아예 캐시 카운터를 폐기하고 항상 referrals 에 |
| m14 | HELD 로 보류되면 양측 모두 아무 통보를 받지 못하고, 원장 화면에도 보류 사실이 표시되지 않는다 | `src/lib/growth/referral.ts:203` | HELD 시 추천인에게 "검토 중" 알림을 보내고, rewards-client 통계에 heldCount("검토 중 N건")를 추가한다. rejectHeldReferral 에도 사유를 담은 알림을 발송하고, 어드민 대기열에 SLA(예: 7일 초과 HELD 배지)를 노출한다. |
| m15 | 불변식 bonusCredits <= balance 가 이미 14개 학원에서 깨져 있다 (클로백 클램프 로직의 전제) | `src/lib/growth/credit-grant.ts:182` | deductCredits 에서 소비 시 `bonusCredits = GREATEST(bonusCredits - cost, 0)` 를 함께 적용하거나, 필드 의미를 "누계"로 확정해 이름을 바꾸고(totalBonusGranted) 회수 로직이 잔량 대신 원장 기반으로 계산하게 한다. |
| m16 | VELOCITY(24시간 5건) 신호는 가중치 40 < 임계 60이라 어떤 판정도 바꾸지 못한다 — 속도 제한이 사실상 미집행 | `src/lib/growth/referral-fraud.ts:102` | VELOCITY weight 를 60 이상으로 올리거나(단독 hold), 임계와 분리된 '하드 스로틀'로 승격해 `shouldHold ||= recentCount >= REFERRAL_VELOCITY_MAX` 형태로 점수와 무관하게 hold 시킨다. 지금처럼 40으로 두면 이 신호는 로그용 장식일 뿐이다. |
| m17 | HELD 는 완전 무음 — 추천인·피추천 학원 어느 쪽에도 알림이 없고 원장 화면에 heldCount 가 렌더되지 않는다 | `src/lib/growth/referral.ts:203` | HELD 분기에 '검토 중' 알림(추천인)과 '보너스 확인 중' 안내(피추천 학원)를 추가하고, rewards-client 통계에 heldCount 를 '심사 중 N건'으로 노출한다. 관리자 쪽에는 HELD 신규 발생 시 알림/배지를 붙인다. |
| m18 | HELD 판정은 추천인의 사정(월 상한·속도·IP)인데 피추천 학원의 환영 크레딧 30까지 함께 막힌다 | `src/lib/growth/referral.ts:213` | 피추천 측 환영 보너스는 추천인 귀속 신호(MONTHLY_CAP/VELOCITY)만으로는 보류하지 않도록 분리한다 — 예: hold 사유가 자기추천 계열(PHONE/EMAIL/SAME_IP)일 때만 양측 보류, 상한·속도 계열이면 피추천 30은 지급하고 추천인 50만 보류. |
| m19 | signupIp 를 x-forwarded-for 최좌측 값 그대로 신뢰 — 플랫폼 신뢰 헤더 미사용, 부재 시 신호가 무음 소멸 | `src/app/api/auth/onboarding/route.ts:231` | 플랫폼 신뢰 헤더 우선 순서로 바꾼다 — `x-vercel-forwarded-for` → `x-real-ip` → XFF 최좌측 순, 그리고 XFF 를 쓸 경우 신뢰 프록시 홉 수만큼 **오른쪽에서** 세어 뽑는다. 아울러 IP 를 단독 60점 신호로 두기보다 UA/디바이스 핑거프린트와 결합해 가중치를 재배분한다. |
| m20 | signupUserAgent 는 수집·저장만 되고 부정 점수에 전혀 쓰이지 않는다(FraudInput 에 필드 자체가 없음) | `src/lib/growth/referral-fraud.ts:24` | FraudInput 에 signupUserAgent 를 추가하고 '동일 추천인의 과거 referral 과 UA 완전일치' 또는 '추천인 원장의 최근 로그인 UA 와 일치' 신호를 30~60 가중치로 넣는다. IP 와 AND 조합하면 오탐도 낮다. |
| m21 | 회수 프롬프트를 '취소'해도 크레딧 회수가 그대로 실행된다 (되돌릴 수 없음) | `src/components/admin/referral-management-client.tsx:251` | 취소를 중단으로 해석하라: `const reason = window.prompt(...); if (reason === null) return;` 로 분기하고, 회수 전에 공지 발송과 동일하게 `window.confirm('...비가역적으로 크레딧을 회수합니다')` 를 추가한다. 사유는 회수의 성격상 서버 스키마에서도 필수(min(1))로 올리는 것이 맞다. |
| m22 | 회수해도 referral_codes.totalRewarded 가 되돌아가지 않아 카운터가 영구 과대계상된다 | `src/lib/growth/referral.ts:404` | clawbackReferral 트랜잭션 안에서 `tx.referralCode.update({ data: { totalRewarded: { decrement: referral.referrerReward + referral.referredReward } } })` 를 수행하거나(0 미만 방지 필요), 아예 totalRewarded 를 파생 집계로 강등하고 re |
| m23 | 잔액 부족으로 일부만 회수돼도 화면·통계는 전액 회수로 표기된다 | `src/lib/growth/credit-grant.ts:171` | clawbackCreditsTx 의 shortfall 을 Referral 에 반영(예: clawbackShortfall 컬럼)하고 목록 뱃지를 '부분 회수(-N)' 로 구분하거나, 최소한 회수 결과 토스트에 실제 회수액/미회수액을 반환해 표시한다. |
| m24 | 반려(REJECTED)는 종착 상태 — 오반려를 콘솔에서 되돌릴 방법이 없다 | `src/lib/growth/referral.ts:381` | REJECTED → HELD 되돌리기(감사로그 동반) 액션을 추가하거나, 반려에 확인 다이얼로그를 붙이고 서버에서도 사유를 필수화한다. |
| m25 | 승인 시 신규 학원(피추천자)에게는 알림이 가지 않는다 — 가입 자동지급 경로와 비대칭 | `src/lib/growth/referral.ts:350` | approveHeldReferral 에도 가입 경로와 동일한 REFERRAL_WELCOME_BONUS 알림을 추가한다(referredStaffId 가 없으면 getAcademyDirectorStaffId(referredAcademyId) 로 대체). 반려 시에도 최소 1건의 안내를 남길지 정책 결정 필요. |
| m26 | 감사로그를 트랜잭션 밖에서 써서, 로그 실패가 '처리 실패'처럼 보이게 만든다 | `src/actions/admin/referrals.ts:323` | 감사행을 lib 의 $transaction 안으로 넣거나(가장 안전), 최소한 audit create 를 try/catch 로 감싸 실패를 로깅만 하고 액션은 성공으로 반환한다. 아울러 클라이언트 run()/onClawback 에 try/catch 를 둬 서버액션 rejection(인증 만료 포함)도 토스트로 보이게 한다. |
| m27 | 추천 현황 목록에 상태 필터·검색이 없다 (통계 카드가 필터처럼 보임) | `src/components/admin/referral-management-client.tsx:192` | getReferralOverview 에 status/검색어 파라미터를 추가하고 StatCard 를 토글 필터로 연결한다(다른 어드민 목록과 동일 패턴). |
| m28 | claimable 상태와 잠금 상태의 버튼 자구가 동일 — ONCE 미션의 「받기」 라벨은 코드상 도달 불가(50크레딧 129개 학원 미수령) | `src/app/(director)/director/rewards/rewards-client.tsx:243` | claimable=true 일 때는 ctaLabel 을 무시하고 「+N 크레딧 받기」로 강제 치환하고, 카드에 claimable 배지(테두리/펄스)를 부여해 이동형 CTA와 시각적으로 분리한다. 또는 조건 충족 시점(첫 CONSUMPTION 커밋·logoUrl 저장)에 서버에서 자동 claimMission 을 호출해 재방문 클릭 자체를 없앤다. |
| m29 | AcademyMissionClaim.missionKey 가 FK 없는 자유 문자열 + upsertMission 이 key/cadence 를 자유 문자열로 덮어쓴다 | `src/actions/admin/referrals.ts:479` | cadence/category 를 z.enum 으로 잠그고, upsertMission 에서 기존 레코드의 key 변경을 금지(또는 claim 마이그레이션 동반)한다. 장기적으로 AcademyMissionClaim.missionKey 에 CreditMission.key FK 를 건다. |
| m30 | signupIp/signupUserAgent 원문을 저장해 놓고 어디에도 노출하지 않고 파기 로직도 없다 — 최소수집·파기 위반이자 심사 불능 | `src/lib/growth/referral.ts:192` | (a) IP는 원문 대신 솔트 해시(예: HMAC(signupIp, 서버비밀))로 저장한다 — SAME_IP_REPEAT은 동등 비교만 하므로 해시로 완전히 동일하게 동작한다. UA는 브라우저/OS 계열로 축약 저장. (b) 90일 경과 행의 signupIp/signupUserAgent를 NULL로 미는 정리 잡을 추가한다(vercel.json crons) |
| m31 | 추천·미션 API에 역할 검증이 없어 TEACHER 계정이 학원 크레딧을 적립하고 추천 코드를 발급·조회한다 | `src/app/api/missions/share/route.ts:9` | (a) 4개 라우트에 `if (staff.role !== "DIRECTOR") return 403` 을 쿠폰 라우트와 동일한 형태로 추가한다. (b) `GET /api/referral`이 코드를 생성하는 부작용은 명시적인 `POST /api/referral/code`(원장 전용)로 분리하고, GET은 없으면 null을 반환하게 한다. |
| m32 | 크레딧을 발행·회수하는 어드민 추천 액션이 bare requireAdminAuth() — SUPPORT 역할도 통과 | `src/actions/admin/referrals.ts:302` | 금전 이동을 일으키는 3개 액션(approveReferral:302, rejectReferral:341, clawbackReferral:378)의 호출을 `requireAdminAuth("SUPER_ADMIN")` 으로 바꾼다. 읽기(148,221,265)는 현행 유지해도 무방하다. |
| m33 | 추천 쿠키 스터핑 — /register?ref= 방문만으로 30일 last-touch 귀속이 덮어써지고, 쿠키에 Secure 플래그가 없다 | `src/app/(auth)/register/page.tsx:53` | (a) 쿠키에 `;secure` 를 추가한다. (b) 기존 smoat_ref 가 있으면 덮어쓰지 않는 first-touch 정책으로 바꾸거나, 최소한 값+타임스탬프를 저장해 온보딩에서 가장 오래된 유효 코드를 쓴다. (c) 30일은 B2B 학원 가입 리드타임에 비해 과하다 — 7~14일로 줄이면 스터핑 잔존 기간이 함께 줄어든다. |
| m34 | 회원가입 화면(/register)에 추천 코드 입력란이 없다 — 링크가 아닌 「코드」를 받은 사람은 온보딩 마지막 화면까지 가야 입력 지점을 만난다 | `src/app/(auth)/register/page.tsx:42` | /register 에 '추천 코드가 있나요?' 접이식 입력란을 추가하고, 입력 시 register/page.tsx:53 과 동일하게 `smoat_ref` 쿠키를 심어 온보딩까지 전달한다(온보딩 route.ts:221 이 이미 쿠키를 폴백으로 읽으므로 서버 변경 불필요). 온보딩의 「추천 코드」 필드도 optional 회색 처리 대신 +30 크레딧 배지와 함 |
| m35 | 사이드바 「리워드」에 미수령 미션 배지가 없다 — 매일 리셋되는 출석 미션을 알릴 수단이 0 | `src/components/layout/admin-shell.tsx:584` | 이미 있는 `getStaffHasNewAnnouncements` 관용구를 그대로 복제한다 — `getMissionsForAcademy` 결과에서 `claimable && !completed` 개수를 반환하는 경량 서버 액션을 만들고, admin-shell 에 `hasClaimableMissions` 상태를 추가해 `showNewDot={... || (ite |
| m36 | 카카오 공유 버튼이 「공유하지 않아도」 KAKAO_SHARE 10크레딧을 지급한다 (교차축: 보상 무결성) | `src/components/growth/kakao-share-button.tsx:121` | 이 축의 결함은 아니지만 보상 무결성 축으로 반드시 인계할 것. 최소 조치는 클립보드 폴백 경로에서 `recordShare()` 를 떼어내고(복사 ≠ 공유), 카카오 경로는 `sendDefault` 의 성공 콜백/`Kakao.Share.sendDefault` 대신 `sendScrap` 의 serverCallback(카카오 공유 서버 콜백)을 쓰거나, 아예  |
| m37 | 네비 라벨 「리워드」와 페이지 제목 「크레딧 미션」이 불일치한다 | `src/app/(director)/director/rewards/page.tsx:7` | 라벨을 「크레딧 미션」 또는 「크레딧 받기」로 통일하고 nav-config·metadata·h1·매뉴얼 그룹명을 한 문자열로 맞춘다(다른 메뉴처럼 director-glossary.ts 단일 소스로 뽑는 것이 이 리포의 관용구). |
| m38 | 미션 판 자체의 도달률 4.9% — 조건을 충족한 133개원 중 4개원만 첫생성 보상을 받았다 | `src/app/(director)/director/rewards/rewards-client.tsx:74` | 조건 충족·미청구 미션이 있으면 서버에서 감지해 대시보드 상단 넛지 + Notification(category=MISSION)을 선제 발송하라(알림 엔진은 이미 있고 1,706행이 정상 발행 중이다). 최소한 첫 CONSUMPTION 발생 시점에 ONBOARD_FIRST_GENERATION 을 자동 클레임 처리하는 것도 가능하다 — 조건 재검증(missio |
| m39 | referral_codes.totalRewarded 는 「건수」가 아니라 「크레딧 합」을 누적한다 — 필드명과 의미 불일치(잠재 오표기) | `src/lib/growth/referral.ts:234` | 컬럼을 `totalRewardedCredits` 로 개명(또는 prisma/schema.prisma 에 `// 누적 지급 크레딧 합(건수 아님)` 주석 명시)하고, 건수가 필요하면 referrals 집계(referral.ts:86 `rewardedCount`)를 쓰도록 못 박아라. |
| m40 | 수집만 하고 아무도 읽지 않는 계기 — totalClicks(전 플랫폼 누적 4회)는 원장·어드민 어느 화면에도 노출되지 않는다 | `src/app/(director)/director/rewards/rewards-client.tsx:427` | 원장 카드에 「링크 열림 N회」를 추가(4칸 그리드)하고, 어드민 통계에 코드 카운터 3종(clicks/signups/rewarded)을 노출하라. 지표가 보여야 결함 1 같은 유통 단절이 다음엔 첫 주에 잡힌다. |
| m41 | 자가추천 IP 신호는 첫 시도에서 구조적으로 발화 불가 — 가입 IP를 남기는 테이블이 referrals 하나뿐 | `src/lib/growth/referral-fraud.ts:112` | 온보딩 시 staff 또는 academies 에 가입 IP(해시)를 저장하고, evaluateReferralFraud 에서 추천인 원장의 가입 IP와 신규 가입 IP를 직접 대조하는 신호(weight 60)를 추가하라. 지금은 referrals 안에서만 순환 비교하고 있다. |
| m42 | 추천 트랜잭션이 실패하면 추천 자체가 통째로 증발하고 로그 한 줄만 남는다 (Prisma 인터랙티브 트랜잭션 기본 5초) | `src/lib/growth/referral.ts:277` | `prisma.$transaction(fn, { timeout: 15000, maxWait: 5000 })` 로 여유를 주고, 알림 2건은 트랜잭션 밖(after-commit)으로 빼서 임계 경로를 지급 4쿼리로 줄인다. 더불어 실패 시 `academies.settings.onboarding.referralPending = { code, error }` 를 |
| m43 | 추천 링크 클릭 수(totalClicks)를 원장이 볼 수 있는 화면이 없다 — 수집만 하고 아무도 안 본다 | `src/app/(director)/director/rewards/rewards-client.tsx:427` | stat 그리드를 4칸으로 늘려 「클릭」과 「검토 중(heldCount)」을 함께 노출한다. 표시할 계획이 없다면 반대로 무인증 write 엔드포인트를 없애는 편이 안전하다. |
| m44 | smoat_ref 쿠키가 귀속 성공 후에도 삭제되지 않아 30일간 같은 브라우저의 다음 가입에 자동 적용된다 | `src/app/api/auth/onboarding/route.ts:221` | 온보딩 응답에서 `res.cookies.set(REFERRAL_COOKIE, "", { maxAge: 0, path: "/" })` 로 소진 처리한다(현재 :245 가 값만 담은 새 응답이라 쿠키 조작 여지가 있다). 또한 :221 의 문자열 리터럴 `"smoat_ref"` 를 `REFERRAL_COOKIE` 상수로 교체해 상수 변경 시 조용히 어긋나는 것 |
| m45 | ONBOARD_PROFILE(30크레딧) 미션은 사실상 달성 불가 — 로고 등록 UI 가 URL 텍스트 입력뿐이라 245개원 중 2곳만 조건 충족 | `src/lib/growth/missions.ts:62` | settings 에 실제 이미지 업로더(Supabase Storage)를 붙이거나, 조건을 실제로 달성 가능한 값(예: 학원 대표 전화·주소 보강, 반 1개 생성)으로 바꾼다. |
| m46 | 카카오 SDK 로드 전에 버튼을 누르면 조용히 클립보드 폴백으로 빠진다 (sdkReady 가 게이트에 쓰이지 않음) | `src/components/growth/kakao-share-button.tsx:97` | `disabled={busy || (Boolean(KAKAO_JS_KEY) && !sdkReady)}` 로 SDK 준비 전 클릭을 막고, 준비 중임을 스피너로 표시한다. |
| m47 | 카카오 공유를 취소해도 KAKAO_SHARE 10크레딧이 지급된다 (sendDefault 는 결과를 돌려주지 않는데 무조건 기록) | `src/components/growth/kakao-share-button.tsx:121` | 지표 신뢰도를 위해 최소한 클립보드 폴백 경로와 SDK 경로의 클레임을 구분해 기록하거나(metadata.channel), 보상 조건을 「공유한 링크가 최초로 클릭됨(totalClicks>0)」으로 옮긴다. |
| m48 | 카카오 공유 카드 이미지가 OG 카드가 아니라 파비콘과 바이트 단위로 동일한 파일 | `src/components/growth/kakao-share-button.tsx:106` | 1200×630(또는 800×400) 추천 전용 OG 카드를 별도 파일로 만들어 imageUrl 과 layout 의 openGraph.images 에 함께 연결한다. |
| m49 | 추천 경로에만 레이트리밋이 없다 — 같은 grantBonusCreditsTx 를 쓰는 형제 경로(실물 쿠폰)는 DB 기반 리미터를 이미 갖고 있다 | `src/lib/printable-coupon-claim.ts:72` | `consumeRateLimit` 를 growth 공용 유틸로 승격해 `/api/referral/click`(scope=ip) 과 `/api/auth/onboarding`(scope=ip) 에 붙인다. 새 테이블 없이 기존 printable_coupon_claim_rate_limits 스키마 패턴을 재사용하거나 범용 테이블로 일반화한다. |
| m50 | 월 상한 신호가 HELD·REJECTED·CLAWED_BACK 을 세지 않아, 부정으로 회수될수록 상한이 되살아난다 | `src/lib/growth/referral-fraud.ts:129` | 월 상한 카운트를 「보상이 실제로 나간 적 있는 상태」(GRANTED, APPROVED, CLAWED_BACK)로 넓히고, 심사 적체를 막으려면 HELD 도 별도 카운트로 상한에 반영한다. 승인 시점(approveHeldReferral)에도 상한을 재검증해야 한다. |
| m51 | 보상 0크레딧 미션은 어드민 UI 로 저장은 되지만 영구히 클레임 불가 — 사용자에겐 「아직 적립할 수 없어요」로만 보인다 | `src/lib/growth/credit-grant.ts:60` | upsertMissionSchema 의 rewardCredits 를 `min(1)` 로 올리거나(0 보상은 비활성 토글로 표현), claimMission 에서 `mission.rewardCredits <= 0` 이면 지급을 건너뛰고 `{ ok:false, reason:"not_claimable" }` 를 돌려 화면에 정확한 문구가 뜨게 한다. |
| m52 | 알림 배지가 30초마다 4쿼리(2왕복) 엔드포인트를 폴링 — 하루 1.7건 생성되는 알림을 위해 | `src/components/growth/notification-bell.tsx:40` | unseenCount 를 앞의 Promise.all 로 합치거나(lastSeenAt 을 서브쿼리로 내려 1쿼리로 축약) 폴링 주기를 5분 이상으로 늘리고, notifyNotificationsChanged 이벤트 + visibilitychange 복귀 시 즉시 갱신에 의존한다. 배지 정확도가 중요하면 폴링 대신 페이지 전환 시 1회 조회로 바꾼다. |
| m53 | ONBOARD_FIRST_GENERATION 의 실제 조건은 「임의의 크레딧 소비 1건」 — 카드 문구·이동 링크와 어긋난다 | `src/lib/growth/missions.ts:51` | 조건을 `creditTransaction.count({ academyId, type: "CONSUMPTION", operationType: { in: [문제 생성 op 목록] } })` 로 좁히거나, 반대로 카피를 「첫 AI 작업 실행」으로 바꿔 조건과 문구를 일치시킨다. |
| m54 | 온보딩이 만드는 CreditBalance 는 expiresAt 이 없어(212/246), 「진짜 무기한은 두지 않는다」는 크레딧 만료 정책과 정면으로 어긋난다 | `src/app/api/auth/onboarding/route.ts:188` | 온보딩의 creditBalance.create 에 `expiresAt: NO_EXPIRY_FALLBACK` 을 넣어 정책을 한 곳에서 지키고, grantBonusCreditsTx 의 RIDE 분기에서 지급 직전 `sweepExpiredCredits`(또는 동등한 SQL 가드)를 돌려 「이미 만료된 잔액에 새 보상을 얹지 않는다」를 보장한다. 소멸이 보상 크 |
| m55 | 리워드 페이지를 열었는데도 코드가 생성되지 않은 학원이 실재한다 — 화면은 회색 박스로 끝나고 재시도가 없다 | `src/app/(director)/director/rewards/rewards-client.tsx:75` | (a) fetchReferral 에 실패 상태를 만들고 화면에 「다시 시도」 버튼을 렌더한다(res.ok 아님/catch 모두). (b) 근본적으로는 코드 발급을 화면 fetch 에서 떼어내 온보딩 트랜잭션(`src/app/api/auth/onboarding/route.ts` 학원 생성 직후) 또는 백필 스크립트로 옮긴다 — 그러면 이 실패가 코드 부재로  |
| m56 | 보상 지급 통보가 인앱 알림 전용 — 유일한 성공 사례의 추천인은 24일째 자기가 50크레딧을 받은 걸 모른다 | `src/lib/growth/notifications.ts:33` | 보상 성사 시 인앱 알림과 함께 out-of-app 채널(카카오 알림톡 또는 이메일)을 1건 발송한다. 단 `staff.marketing_consent` 는 247명 중 53명(21%)만 true 이고 추천 당사자 2명 모두 false 이므로, 「보상 지급 안내」를 마케팅이 아닌 거래성 통지로 분류·발송하는 정책을 먼저 확정할 것. 최소 조치로는 원장 대시 |
| m57 | 클릭이 카운터로만 남아 귀속 유실을 사후 진단할 수 없다 — 같은 리포의 프로모션 링크는 익명 방문을 행으로 남긴다 | `src/lib/growth/referral.ts:109` | CreditPromotionLinkEvent 를 그대로 본떠 ReferralLinkEvent(kind VIEW|SIGNUP_START, code, visitorKey=ip+ua+날짜 해시, createdAt) 를 추가하고 /api/referral/click 에서 카운터와 함께 행을 적재한다. 온보딩 귀속 시 같은 visitorKey 를 대조하면 쿠키가 끊긴 |
| m58 | 카톡으로 보낸 추천 링크는 카카오 인앱브라우저에서 열리고, 그 안의 「Google로 시작」은 구글이 차단한다 — 앱 전체에 인앱 감지·외부 브라우저 유도 0건 | `src/components/growth/kakao-share-button.tsx:107` | ① /register 마운트 시 인앱 웹뷰 UA(KAKAOTALK/Instagram/FB_IAB/Line 등)를 감지해 「외부 브라우저로 열기」 배너 + 안드로이드 intent:// 스킴 / iOS 링크 복사 안내를 띄우고, 그 상태에서는 Google 버튼을 비활성·후순위로 강등한다. ② 카카오 공유 카드에 androidExecutionParams/iosE |
| m59 | 모바일 헤더에 알림 벨·크레딧 배지가 없다 — 추천 보상의 유일한 통보가 햄버거 서랍 안에 숨는다 | `src/components/layout/admin-shell.tsx:638` | 모바일 헤더 오른쪽의 `size-10` 자리 표시자(admin-shell.tsx:808)를 NotificationBell(+CreditBadge 축약형)로 교체하고, 미읽음이 있으면 햄버거 버튼에도 점 배지를 얹는다. |
| m60 | 크레딧을 찾아 실제로 몰려간 화면(/director/credits, 71개 학원·508뷰)에 추천으로 가는 링크가 0개다 | `src/app/(director)/director/credits/page.tsx:1` | /director/credits 상단(및 크레딧 부족 토스트·결제 모달)에 「추천으로 +50 크레딧 벌기」 인라인 카드와 /director/rewards#referral 링크를 배치한다. 크레딧 소진 임계 도달 시 알림으로도 한 번 노출한다. |
| m61 | 사이드바 고정 영역의 깜빡이는 「무료 크레딧 신청하기」가 추천 프로그램을 시각적으로 압도한다 | `src/components/layout/admin-shell/sidebar-top-actions.tsx:154` | 두 프로그램을 하나의 「크레딧 얻기」 표면으로 통합하거나, 최소한 리워드 항목에 미수령 보상 배지를 달아 동일한 시각 가중치를 준다. 피드백 CTA의 무한 펄스는 조건부(크레딧 부족 시)로 강등한다. |
| m62 | 온보딩 토큰 15분 만료 — 지인이 6개 필드를 채우는 사이 만료되면 입력값 전부 소실, 에러 박스에 복귀 링크조차 없다 | `src/lib/onboarding-token.ts:26` | ① 만료 임박(예: 12분)에 토큰을 조용히 갱신하거나 TTL 을 60분으로 늘린다. ② 만료 에러에 「다시 인증하기」 버튼(registerHref, 이미 :72-74 에 계산돼 있다)을 붙인다. ③ 폼 입력을 sessionStorage 에 임시 보존해 재인증 후 복원한다. |

## 8. 관찰 · INFO (28건)

| # | 항목 | 위치 |
|---|---|---|
| i1 | GET /api/referral 에 역할 검사가 없다 — 강사(TEACHER)도 학원 추천 코드를 생성·조회할 수 있다 | `src/app/api/referral/route.ts:9` |
| i2 | totalRewarded 는 「건수」가 아니라 「크레딧 합」인데 이름·타입이 건수처럼 읽힌다 | `src/lib/growth/referral.ts:234` |
| i3 | [규명] 「리트영어학원」 코드 2개는 제약 위반이 아니라 동명 별개 학원 2곳이다 | `prisma/schema.prisma:2943` |
| i4 | [검증] 코드 엔트로피·충돌·동시성은 안전하다 | `src/lib/growth/referral.ts:50` |
| i5 | [관찰] 실측 totalClicks=4 의 정체와, 코드 발급률 11%의 진짜 원인 | `src/lib/growth/referral.ts:80` |
| i6 | 온보딩 라우트가 REFERRAL_COOKIE 상수 대신 문자열 리터럴을 쓴다 | `src/app/api/auth/onboarding/route.ts:221` |
| i7 | 이메일/비밀번호 회원가입 경로는 존재하지 않는다 — 귀속 로직은 소셜 온보딩 단일 경로에만 있다 | `src/app/(auth)/register/page.tsx:169` |
| i8 | 온보딩 API 가 REFERRAL_COOKIE 상수 대신 쿠키명을 하드코딩 | `src/app/api/auth/onboarding/route.ts:221` |
| i9 | 추천 코드 입력값에 형식 검증이 전혀 없다 (클라 대문자는 CSS 뿐) | `src/app/auth/onboarding/page.tsx:304` |
| i10 | 온보딩을 우회하는 학원 생성 경로(approveRegistration)에는 귀속이 없으나, 실측상 휴면 경로다 | `src/actions/admin/registrations.ts:99` |
| i11 | referral_codes.totalRewarded 는 "건수"가 아니라 크레딧 합인데 이름·형제 필드와 의미가 어긋난 채 API 로 노출된다 | `src/lib/growth/referral.ts:234` |
| i12 | (검증 통과) 실제 지급 1건과 미션 77건 모두 원장·잔액·알림이 완전 정합 | `src/lib/growth/credit-grant.ts:122` |
| i13 | 월 상한 초과분은 REJECT 가 아니라 HELD 이며, 승인 시 상한 재검증이 없다 | `src/lib/growth/referral.ts:293` |
| i14 | 부정 탐지·HELD 심사 경로는 프로덕션에서 단 한 번도 실행된 적이 없다(사실상 미검증 코드) | `src/lib/growth/referral-fraud.ts:46` |
| i15 | 이 콘솔은 프로덕션에서 단 한 번도 뮤테이션에 사용된 적이 없다 | `src/actions/admin/referrals.ts:25` |
| i16 | lockedReason 은 서버가 계산하지만 화면에 절대 렌더되지 않는다(actionUrl 있는 미션은 항상 버튼 분기로 흡수) | `src/app/(director)/director/rewards/rewards-client.tsx:252` |
| i17 | 어드민이 만든 신규 미션은 조건 평가가 무조건 통과라 즉시 무제한 클레임 가능 | `src/lib/growth/missions.ts:70` |
| i18 | KAKAO_SHARE 는 실제 공유 성공과 무관하게 버튼 클릭만으로 지급된다 | `src/components/growth/kakao-share-button.tsx:121` |
| i19 | 알림은 만들어지고 읽는 UI 도 있으나 실제 읽힘율이 극단적으로 낮다(REFERRAL 2건 모두 미읽음) | `src/lib/growth/notifications.ts:176` |
| i20 | 온보딩의 referralCode 입력에 길이·문자 제약이 없다(클릭 라우트는 32자 캡) — 방어 비대칭 | `src/app/api/auth/onboarding/route.ts:25` |
| i21 | 플랫폼 어디에도 미들웨어/엣지 레이트리밋이 없다 — 학원 생성(가입 크레딧 50) 경로가 무제한 | `src/app/api/auth/onboarding/route.ts:52` |
| i22 | 「리트영어학원」은 서로 다른 두 academyId 로 중복 존재하며 각각 별도 추천 코드를 보유한다 — 코드가 원장이 아니라 학원 행에 묶인 구조의 부작용 | `prisma/schema.prisma` |
| i23 | 스키마 드리프트 0 · 유일한 추천 1건은 전 구간 무결 · growth 마이그레이션은 _prisma_migrations 에 기록 없음 | `prisma/migrations-manual/20260618_growth_referral_missions_notifications.sql` |
| i24 | referral_codes.totalRewarded 는 「건수」가 아니라 「크레딧 합」 — 필드명과 의미가 어긋난 채 API 계약에 노출된다 | `src/lib/growth/referral.ts:234` |
| i25 | 추천 링크만 계측 인프라를 못 쓴다 — 프로모 링크에는 방문자 단위 이벤트 로그와 관리자 모니터링이 이미 있다 | `src/lib/promo-link-events.ts:47` |
| i26 | 실측상 유효한 성장 채널은 추천이 아니라 실물 쿠폰이다 — 쿠폰 12건 vs 추천 1건, 전단지 쿠폰 100장은 0건 | `src/lib/printable-coupon-claim.ts:144` |
| i27 | 어드민 공지 팬아웃은 주석과 달리 「전 스태프 단일 createMany」이며 멱등성·그룹키·회수·만료가 전부 없다 | `src/lib/growth/notifications.ts:112` |
| i28 | 미션 판의 실사용은 파워유저 1인의 트레드밀 — DAILY_CHECKIN 69건 중 43건(62%)이 한 학원 | `src/lib/growth/missions.ts:167` |

## 9. 적대 검증에서 반증된 주장 (33건 — 결함 아님으로 판정)

감사 에이전트가 제기했으나 반증 에이전트가 코드/DB 로 뒤집은 항목이다. **이 목록은 "안심해도 되는 것"의 기록**이며, 같은 의심이 재발할 때 재조사를 막는다.

| 제기된 주장 | 원 심각도 | 반증 사유 |
|---|---|---|
| 추천 코드를 포착하는 지점이 /register 단 한 곳 — 랜딩·SEO 경유 유입은 전부 무귀속으로 증발 | major | 반증: 주장의 grep 관측(?ref 판독부 1곳, 미들웨어 0건, 랜딩 CTA bare 링크)은 사실이나, 영향 판정과 1번 재현이 코드와 모순되어 결함으로 성립하지 않는다. (1) register/page.tsx:49-56 의 useEffect 는 /register?ref=CODE 에 도착하는 즉시 document.cookie 로 smoat_ref 를 path=/, max-age 30일(constants.ts:40)로 기록한다. 재현 1은 "링크를 열고 랜딩 |
| 30일 귀속 창은 iOS/Safari 에서 실제로는 7일 — document.cookie 로 심어 ITP 캡에 걸린다 | major | 반증: 인용된 코드 자체는 정확하다(register/page.tsx:52-56, constants.ts:39-40 모두 축자 일치, `smoat_ref` 를 쓰는 곳은 전 리포에서 register/page.tsx:53 단 한 곳뿐 — 서버 Set-Cookie·middleware 폴백 없음 확인). 그러나 「무귀속 가입」이라는 결론과 major 등급은 주장자가 놓친 상위 경로 때문에 성립하지 않는다. (1) 쿠키는 귀속의 유일한 채널이 아니라 프리필용이고, 폼 입 |
| /register 에 추천 코드 수동 입력란이 없다 — 링크 없이 코드만 받은 사람은 칠 곳이 없다 | major | 반증: 인용된 코드 자체는 전부 실재하나(register/page.tsx:42, grep 0건, onboarding:304-312, rewards-client:387-388), 주장의 핵심 영향("코드만 받은 사람은 칠 곳이 없다", "전량 유실")이 실제 호출 그래프와 어긋난다. ① src/app/api/auth/onboarding/route.ts:220-221 에서 `parsed.data.referralCode?.trim() || request.cookies |
| 추천 코드에 형식 검증이 전무 — 구두점만 섞인 문자열이 남의 코드에 우연 매칭될 수 있다 | major | 반증: 인용문 4건은 모두 실재한다(route.ts:25 / onboarding page.tsx:26 / referral.ts:39-41 / constants.ts:34-36). 그러나 그 위에 세운 (a)~(d) 결함 주장은 실제 호출 그래프와 맞지 않는다. **(c) 는 사실오인이다 — 알파벳을 잘못 읽었다.** `REFERRAL_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"` 은 혼동쌍의 **양쪽을 모두** 제거한 |
| ref 코드의 유일한 운반체가 클라이언트 JS 쿠키 — OAuth state/redirectTo 채널이 비어 있어 브라우저가 바뀌면 귀속이 통째로 사라진다 | major | 반증: 인용문은 전부 줄 단위로 정확하지만, 「위치(register/page.tsx:70)」와 「원인(OAuth state/redirectTo 채널 공백)」과 「피해(브라우저 바뀌면 귀속 소실)」가 서로 이어지지 않는다. 세 갈래로 반증된다. ■ 반증 1 — same-browser 왕복은 쿠키가 이미 완전히 커버한다(state 채널의 추가 이득 = 0) smoat_ref 는 우리 오리진의 1st-party 쿠키(`path=/;samesite=lax`, page. |
| 귀속 성공 후에도 smoat_ref 쿠키를 지우지 않아 30일간 후속 가입에 재사용된다 | minor | 반증: 코드 사실("귀속 후 smoat_ref 를 만료시키지 않는다")은 맞지만, 결함으로 성립시키는 영향 주장("번호가 다르면 그대로 GRANTED 되어 +50 이 또 나간다")이 실제 호출 그래프에서 이미 차단돼 있다. src/lib/growth/referral-fraud.ts:111-125 의 SAME_IP_REPEAT 는 weight 60 이고 constants.ts:26 의 REFERRAL_HOLD_FRAUD_SCORE 도 60, referral-fra |
| (반증) FRIEND_REFERRAL 클레임 0건은 결함이 아니라 설계 — EVENT cadence 는 버튼 클레임이 불가능하며 보상은 추천 엔진이 직접 지급한다 | info | 반증: 주장이 전부 검증됨 — 즉 "FRIEND_REFERRAL 클레임 0건"은 결함이 아니다. (1) 인용 코드 실재: missions.ts:123-129 에 `} else if (m.cadence === "EVENT") { // Not button-claimable (auto-granted by the system, e.g. referral). completed = m.key === MISSION_KEYS.FRIEND_REFERRAL ? grantedRefe |
| SELF_SAME_ACADEMY(weight 100) 은 도달 불가능한 죽은 분기 | info | 반증: 인용된 코드·줄번호·호출그래프는 전부 실제와 일치한다(referral-fraud.ts:50-56 분기 존재, referral.ts:155-157 가드가 :166 호출보다 선행, evaluateReferralFraud 호출부는 리포 전수 grep 결과 referral.ts:166 단 1곳 — 어드민/크론 우회 호출부 없음). 따라서 "분기가 발화하지 않는다"는 기계적 관찰 자체는 참이다. 그럼에도 결함으로는 반증된다. (1) 주장이 내세운 유일한 피해 서술 |
| 전화·이메일 대조 대상이 추천인 학원의 '가장 오래된 DIRECTOR 1명'뿐 | minor | 반증: 인용된 코드는 실재한다(referral-fraud.ts:58-65 축자 일치). 그러나 「결함」으로서의 주장은 네 갈래 모두 무너진다. **(A) 재현 절차가 제품 안에서 불가능하다 — 「두 번째 DIRECTOR 추가」 경로가 없다.** `role: "DIRECTOR"` 로 staff 를 만드는 코드는 전 리포에 단 2곳이며, 둘 다 **새 Academy 를 만드는 같은 트랜잭션 안**이다: - `src/app/api/auth/onboarding/rout |
| 미션 클레임 API 3종에 역할 검사가 없어 TEACHER 등 비원장 스태프도 학원 미션을 소진할 수 있다 | minor | 반증: 인용된 코드는 모두 실재하고 정확하다(claim/route.ts:12-22, checkin:9-17, share:9-17 에 role 검사 없음 · missions.ts:223 `if (staffId)` → recipientStaffId · notifications.ts:180 수신자 한정 · (director)/layout.tsx:29 · nav-config.ts:378). 상위 래퍼도 실제로 없다 — src/proxy.ts:100-109 matcher |
| signupIp를 x-forwarded-for 최좌측에서 취함 → 남은 유일한 60점 신호 SAME_IP_REPEAT을 헤더 한 줄로 무력화 가능 | major | 반증: 인용문 자체는 실재하고(onboarding/route.ts:231, coupons/printable/claim/route.ts:29-30, referral-fraud.ts:111-126 weight 60, constants.ts:26=60) 호출 그래프도 맞다(processReferralOnSignup·evaluateReferralFraud 모두 호출부 1개, middleware 부재). 그러나 결함 성립 근거 3축이 코드로 반증된다. (1) 대조군이 허 |
| 인컨텍스트 매뉴얼 퀵액세스가 기본 OFF라 08-rewards 6장짜리 안내가 사실상 미도달 | minor | 반증: 인용 코드 2건(manual-quick-access-preferences.ts:4-7, manual-quick-access-host.tsx:74-76)은 축자 실재하고 게이트(host.tsx:154 `if (!enabled || groups.length <= 0) return null;`)도 실재한다. 그러나 결함의 본체인 "08-rewards 6장이 옵트인 뒤에 숨어 미도달"은 두 개의 놓친 경로로 반증된다. (1) 매뉴얼은 상시 사이드바 항목이다 —  |
| 리워드 매뉴얼이 「받는 쪽은 코드를 어디에 넣는가」를 설명하지 않는다 | minor | 반증: 인용문 자체는 정확하나(006.svg·005.svg 축자 일치 확인), 이 주장이 결함으로 성립하는 근거인 **영향 진술이 코드로 반증된다**. 주장자는 `/auth/onboarding` 경로를 통째로 놓쳤다. 1) 「받은 사람은 회원가입 화면에 입력란이 없어 귀속에 실패한다」 → 거짓. 입력란은 존재한다. - `src/app/auth/onboarding/page.tsx:304-314` `<Field label="추천 코드" optional …>` / ` |
| 모바일에서 리워드는 정상 노출되나 추천 링크 전문을 확인할 방법이 없다 | info | 반증: 인용 코드(rewards-client.tsx:400-405)는 실재하나, 주장의 재현 절차와 영향 서사가 둘 다 틀렸다. (1) Tailwind `truncate`(overflow:hidden;text-overflow:ellipsis;white-space:nowrap)는 시각적 클리핑일 뿐 DOM 텍스트 노드는 전체 URL을 담고 있어, 모바일 롱프레스 후 전체 선택·복사 시 잘리지 않은 전문이 나온다 — "전체 텍스트를 선택할 수 없다"는 검증되지 않은 |
| ONBOARD_PROFILE(30크레딧) 미션은 프로덕션에서 사실상 획득 불가 — 조건 충족 학원이 245개 중 2개 | major | 반증: 인용문 자체는 진짜다. `src/lib/growth/missions.ts:61-65` 는 주장한 그대로 존재하고, 다른 호출부·래퍼·자동지급 경로도 없다(`ONBOARD_PROFILE` 전체 참조는 `constants.ts:47,111,116` 와 `missions.ts:62,85` 뿐). `credit_missions` 실측도 isActive=true·rewardCredits=30·sortOrder=40 이고 클레임 0건이 맞다. 그런데 이 결함을 「m |
| 클로백 거래에 operationType 이 없어 회수분이 REFERRAL_* 집계에서 사라진다 | minor | 반증: 인용 코드는 축자 일치하나(credit-grant.ts:196-214 에 operationType 없음, ClawbackParams 141-149 에 필드 자체가 없어 호출자가 넘길 수도 없음), 주장한 영향 흐름이 실제 호출 그래프와 불일치한다. (1) `operationType LIKE 'REFERRAL%'` 로 집계하는 대시보드/정산 코드가 코드베이스에 0건이다 — `grep -rn REFERRAL src/ | grep -v src/lib/growt |
| 카카오 원탭 공유가 프로덕션에서 무음으로 「링크 복사」로 강등 — 유일한 배포 채널이 죽어 있다 | critical | 반증: 인용된 코드 자체는 정확하다. `src/components/growth/kakao-share-button.tsx` 42/98/99/118/119/133/155행이 주장한 그대로 존재하고, 호출 그래프도 맞다(rewards-client.tsx:422 · rail-exam-share-block.tsx:250 · share-panel.tsx:157). 그러나 critical 판정을 떠받치는 **유일한 사실 전제 — 「프로덕션에 NEXT_PUBLIC_KAKAO_ |
| 스모트 소식 팬아웃이 만료 없이 알림함의 95%를 영구 점유 — 추천/미션 보상 알림이 구조적으로 묻힌다 | major | 반증: 코드 사실은 맞지만 결함의 본체인 "추천/미션 보상 알림이 구조적으로 묻힌다"는 실측으로 반증됨. [참인 부분] src/lib/announcements/notify.ts:45-59 의 createMany 는 expiresAt 을 넘기지 않는다(다른 생성 경로 notifications.ts:49/103/141 은 전부 전달). notifications.ts:27 에 expiresAt 필드가 있고 notExpired()(:168-173)가 archivedAt |
| 팝오버를 여는 것만으로 lastSeenAt=now — 목록에 뜨지도 않은 알림까지 배지에서 영구 소거된다 | major | 반증: 코드 인용 3곳(notification-bell.tsx:124-146, notifications.ts:231-238, 190-192)은 모두 원문 그대로 정확하다. 그러나 「영구 소거·조용히 소멸」이라는 결론과 그 근거 2개가 실측으로 무너진다. (1) 제시된 「실증」이 사실과 반대다. 일단영어 원장 cmsom2tk10002jy04pf5e8hq0 의 알림은 **평생 총 5건**이고, lastSeenAt=2026-08-11T12:04:19.389Z 시점에  |
| 보상 알림 채널의 실제 도달률 0 — 원장 235명 중 199명(85%)이 벨을 평생 한 번도 연 적이 없고, 유일한 추천인의 lastSeenAt 은 추천 하루 전에 멈춰 있다 | major | 반증: 주장의 원시 수치(235/36/199, lastSeenAt 값, readAt=null)는 실측 일치하고 방법론도 건전하다(read_without_state=0, 벨 팝오버와 /director/notifications 둘 다 lastSeenAt upsert). 그러나 표제·인과·심각도가 실측으로 무너진다. 【1】「도달률 0」이 거짓 — 추천 알림 2건 중 1건은 72초 만에 도달했다. refute-notifreach-D.sql `referred_side_s |
| 전 원장 대상 대량 알림 발송(8회·1,607행)이 감사로그에 0건 — 「감사로그 0건 ⇒ 콘솔 미사용」 이라는 이전 결론이 성립하지 않는다 | major | 반증: 주장의 사슬 두 마디 중 **load-bearing 인 (2)번이 사실과 다르다**. 「감사로그를 안 쓰는 관리자 액션이 존재하므로 추론 방식이 무효」라는 논증은, 문제의 1,607행을 만든 경로가 **추천·미션 콘솔이 아니라 완전히 다른 모듈**이고, 추천 콘솔은 **자기 액션 전부를 감사로그에 남기며**, 게다가 콘솔 미사용을 뒷받침하는 **독립 증거가 하나 더 있다**는 사실 앞에서 무너진다. **(a) 추천·미션 콘솔의 6개 뮤테이션은 전부 Adm |
| 추천 랜딩(/register)이 자체 메타데이터가 없어 canonical 을 홈("/")으로 선언하고 OG 이미지가 아예 없다 | minor | 반증: 주장의 핵심 절반인 "OG 이미지가 아예 없다"가 **거짓**이며, 그 위에 세운 영향("썸네일이 없고")과 재현("이미지 없는 홈 카드가 뜬다")도 함께 무너진다. **1) 반증의 결정타 — `src/app/opengraph-image.tsx` 가 존재한다.** 주장이 제시한 탐색 방법 `rg -n "images:" src/lib/seo/config.ts src/app/layout.tsx` → 0건 은 **방법론 자체가 틀렸다**. Next.js 는 ` |
| 성장 마이그레이션에 staff 참조 3종의 FK 가 통째로 빠져 있다 (createdByStaffId / referredStaffId / claimedByStaffId) | minor | 반증: 주장의 **관찰 사실은 전부 맞다**. 다만 "결함"으로는 성립하지 않아 반증한다. **사실 확인(주장 그대로 참)** - `prisma/migrations-manual/20260618_growth_referral_missions_notifications.sql:14` `"createdByStaffId" TEXT,` · `:30` `"referredStaffId" TEXT,` · `:80` `"claimedByStaffId" TEXT,` — 컬럼만 있고  |
| 부정탐지가 「비활성 원장」의 전화·이메일로 자가추천을 판정한다 (같은 기능 안에서 원장 정의가 두 갈래) | minor | 반증: 인용된 코드 차이 자체는 사실이다. referral-fraud.ts:59-63 은 `where: { academyId, role: "DIRECTOR" }` 에 `isActive` 가 없고, notifications.ts:59-62 는 `isActive: true` 를 건다. 그러나 결함(=동작 이상)으로서의 주장은 세 겹으로 반증된다. ■ 반증 1 — 주장이 전제한 「원장 교체」 상태는 프로덕션에 0건이고, 애초에 만들어질 수 없다. DB 실측(.tmp- |
| 추천 보상에 활성화 게이트가 없다 — 유일한 피추천 학원은 가입 3분 만에 이탈, 80크레딧이 그대로 잠자고 있다 | major | 반증: 코드 사실("referral.ts:174/203 에 활성화·결제 조건이 없다")은 맞지만, 이를 major 결함으로 만든 **영향 서술의 핵심 수치와 인과가 실측과 어긋난다**. 세 축에서 반증한다. **1) "80크레딧이 3분짜리 계정에 지급됐다" — 거짓.** 추천 프로그램이 그 계정에 준 건 30이다. 프로덕션 credit_transactions 실측(추천 양측 전수): - `일단영어(cmsom2tjr…)`: `ALLOCATION 50 / "Free |
| 프로덕션에서 가장 유력한 추천 대상인 다지점 원장을 제품이 두 번 막는다 — 실사례 타임라인 확보 | major | 반증: 코드 인용과 타임라인 실측은 정확하나, 「결함」이라는 결론이 성립하지 않는다. [사실 확인 — 주장이 맞는 부분] - src/lib/growth/referral-fraud.ts:70-76 축자 일치, weight 100. src/lib/growth/constants.ts:26 `REFERRAL_HOLD_FRAUD_SCORE = 60` → 100 ≥ 60 이므로 HELD 판정 자체는 맞다. - src/app/api/auth/onboarding/route.t |
| 코드 보유 28개 중 4개가 내부·테스트 계정 — 실외부 도달은 24개원(9.8%), 클릭이 발생한 코드는 그중 단 1개 | minor | 반증: 두 축 모두에서 주장이 성립하지 않는다. (1) 제품 결함이 아니다. 인용 위치 `src/lib/growth/referral.ts:81` 은 `export async function getReferralStats(academyId: string)` — **단일 학원의 자기 통계**만 읽어 오는 함수라 "포트폴리오 도달률"과 아무 관계가 없다. 리포 전체에 「11% 도달」류의 집계를 계산하는 코드는 존재하지 않는다. `src/actions/admin/ref |
| credit_transactions 의 balanceAfter 체인이 동시 차감에서 18건 깨져 있다 — 보상 분쟁을 원장 스냅샷으로 검증할 수 없다 | minor | 반증: 숫자(25,868쌍 중 18건 broken)는 정확히 재현했으나, 그 18건은 「원장 값이 틀린 것」이 아니라 「정렬 키가 커밋 순서가 아닌 것」이다. 네 갈래로 반증한다. ■ 1. 인용한 메커니즘 자체가 사실이 아니다 주장: "원자 UPDATE 의 반환값을 스냅샷으로 적는다". 실제 src/lib/credits.ts:130~166 은 UPDATE 의 반환값을 쓰지 않는다. L133 `const result = await tx.creditBalance.u |
| 크레딧 잔액과 원장의 드리프트가 2개 학원에 존재한다 (원장 없는 시드 잔액) | info | 반증: 수치는 그대로 재현되지만(246개원 중 drifted 2, 1078·150 정확히 일치) **결함이 아니며, 지목한 위치와 인과가 둘 다 틀렸다.** **1) 위치 오귀속 — credit-grant.ts:102 은 드리프트를 만들 수 없다.** `grantBonusCreditsTx` 는 RIDE 분기(102행 `tx.creditBalance.upsert`)든 EXTEND 분기(85행 raw upsert)든, **같은 트랜잭션 안에서 122행 `tx.cre |
| 첫 추천이 성공하는 순간 「동료 원장님 추천하기 +50」 카드가 영구 「완료」로 잠겨 CTA가 사라진다 — 반복 추천은 월 20건까지 계속 지급되는데도 | major | 반증: 기계적 사실(missions.ts:128 의 completed=grantedReferrals>0, rewards-client.tsx:291-296 의 완료 칩 대체)은 맞으나, 「추천 유도 표면이 사라진다 → 재추천 동기 0」이라는 결함의 실체가 성립하지 않는다. (1) 사라지는 「추천하기」 버튼이 하는 일은 같은 페이지 앵커 스크롤뿐이다 — rewards-client.tsx:216-241 handleCta 에서 FRIEND_REFERRAL 은 isDai |
| 「링크를 직접 복사해 주세요」라고 안내하지만 화면의 링크는 truncate 로 잘려 전문을 읽을 수 없다 | minor | 반증: 주장의 관찰(클래스명·줄번호·토스트 문구)은 정확하나, 결함의 핵심 인과가 세 지점에서 끊긴다. (1) `truncate` 는 선택·복사를 막지 않는다 — 결정적 오류. Tailwind `truncate` = `overflow:hidden; text-overflow:ellipsis; white-space:nowrap` 이고 ellipsis 는 페인트 단계 효과다. rewards-client.tsx:402-403 은 `<span className="min- |
| 카카오 공유 카드에 추천인이 누구인지가 없고, 설명은 링크에 이미 박힌 코드를 다시 입력하라는 것처럼 읽힌다 | minor | 반증: 주장의 관찰 1개(rewards-client.tsx:422 가 오버라이드 없이 호출 → 추천 카드 기본 자구에 학원명 없음)는 사실이나, 결함 성립 근거로 든 3개 메커니즘이 모두 코드/매체 사실과 어긋난다. (1) 「원장·학원 이름을 넘길 자리 자체가 없다」는 거짓 — title/description/buttonTitle 은 자유 문자열 prop(kakao-share-button.tsx:55-57)이고 이름 주입 실사용례가 존재한다: rail-stude |
| [관찰] 실제로 돌아간 성장 채널은 추천이 아니라 프로모션 번들 링크였다 — 26-07 한 달에 방문 1,229명·수령 785건 | info | 반증: 원시 카운트(VIEW 1,305/고유 1,229, CLAIM 785/고유 763, 2026-07-07~07-31, 같은 기간 referrals 0건, TOP_UP operationType 집계 3,400/585/80/11,325)는 전부 실측과 정확히 일치했다. 그러나 주장의 실체를 이루는 해석 3개가 코드·DB로 반박된다. (1) 「수령 785건」은 거짓이다. 번들 promo-6c9639 「얼리버드 시크릿 할인」의 구성원 프로모션 4행 전부가 credi |
---

## 10. 우선순위 로드맵

### P0 — 지금 새는 것
1. **자가추천 방어 보강** (§5 C1 · M13 · M21). 최소 조치: 검증되지 않은 식별자(카카오 가입 = 원장 59%)로 들어온 귀속에 `UNVERIFIED_IDENTITY` 신호(weight 60)를 추가해 자동 HELD 로 라우팅. 근본 조치: 추천인 학원의 가입 IP/UA 를 저장해 1회차부터 대조 가능하게 한다.
2. **`share-panel.tsx:157` 에 `recordMission={false}` + 리포트 전용 자구** (M10). 학부모에게 나가는 리포트 공유 카드에 원장용 추천 마케팅 문구가 실리고, 추천을 공유한 적 없는 원장이 KAKAO_SHARE 10크레딧을 받는다. 형제 호출부 2곳은 이미 올바르게 넘기고 있어 이 한 곳만 갱신되지 않았다.
3. **어드민 회수 프롬프트의 「취소」가 회수를 막지 않는다** (m21). `window.prompt(...) ?? undefined` 는 취소(null)를 undefined 로 바꿔 그대로 실행한다. 되돌릴 수 없는 크레딧 회수라 즉시 수리 대상.
4. **어드민 돈 액션 6종에 `requireAdminAuth("SUPER_ADMIN")`** (M9). 같은 리포의 `credits.ts:36` 은 이미 그렇게 하고 있고 추천 쪽만 빠졌다. 현재 SUPPORT 계정이 0명이라 실피해는 없으나, 계정 하나 만드는 순간 열린다.

### P1 — 프로그램이 안 도는 이유
5. **코드 선발급** (M1 · M16 · M18 · M22). 온보딩 커밋 시 `getOrCreateReferralCode` 를 함께 호출하고, 기존 217개원에 1회성 백필. 발급은 부작용 없는 순수 연산이라 안전하다.
6. **귀속 실패를 말하게 하기** (M3 · M4 · M19). `processReferralOnSignup` 의 반환값을 받아 (a) reason 별 구조화 로그, (b) 온보딩 응답에 `referral:{ok,reason}` 을 실어 「추천 코드를 찾을 수 없어 보너스가 적용되지 않았습니다」 토스트. 가능하면 입력 즉시 검증 엔드포인트.
7. **진입점 배선** (M17). 크레딧 부족 토스트에 「무료로 받기 →/director/rewards」 액션, `/director/credits` 상단에 추천 카드. 크레딧 페이지는 리워드의 2.4배가 방문한다.
8. **HELD/REJECTED/CLAWED_BACK 알림** (M5 · M11 · M20). 특히 크레딧이 차감되는 clawback 은 무음 금지.

### P2 — 정합·계기
9. 클로백 실회수액(`shortfall`)을 반환·기록하고 어드민 집계에 반영 (M6).
10. 어드민 화면 뮤테이션 후 재조회 (M8 — 현재 `useState(initialProps)` 스냅샷 고착).
11. `ONBOARD_PROFILE` 조건 교체 또는 로고 업로드 위젯 (M12).
12. `/api/referral/click` 에 IP 레이트리밋 (M15). 같은 리포의 `printable-coupon-claim.ts` 리미터를 재사용 가능.
13. `smoat_ref` 쿠키를 귀속 후 만료 (M2).
14. VELOCITY 가중치 40 → 60+ 또는 단계형 (M14).

---

## 11. 재현 방법

```bash
# 프로덕션 DB 조회(읽기 전용). SQL 은 `-- LABEL:` 헤더 + `----` 구분자
npx tsx .tmp-crm/q.ts .tmp-referral-audit/probe1.sql

# 감사 함대 재주행 / 재개
Workflow({ scriptPath: "<세션>/workflows/scripts/referral-system-audit-wf_2bae4c58-07f.js",
           resumeFromRunId: "wf_2bae4c58-07f" })
```

원자료: `.tmp-referral-audit/confirmed.json`(113건 전문) · `refuted.json`(33건) · `dims.json`(축별 판정·동작 요약) · `probe*.sql` / `out*.txt`.
