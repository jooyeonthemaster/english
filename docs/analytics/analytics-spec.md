# 스모트 유입 분석(1st-party Analytics) + 관리자 결제 정합 — 확정 스펙

> 정본. 함대는 이 문서만 믿는다. 채팅 맥락·추측으로 수치/경로/필드를 만들지 마라 — **스펙에 없는 필드·경로·숫자 창작 = critical**.
> 작성 26-09-17 · 필살기 · 감독 본체.
>
> **코드로 끝나지 않는 일**(시드 청소·CRON_SECRET·마이그레이션 선적용·GSC·GA4·픽셀 실사격·법무)은
> **`docs/analytics/ops-checklist.md`** 가 정본이다. 배포 전에 그 문서의 🚫 항목을 먼저 닫는다.

---

## 0. 목표와 성공조건

**문제(실측)**
- 유입 계측 0 — `/api/track` 은 로그인 스태프 전용(`getStaffSession()` 없으면 204 폐기), referrer/UTM 캡처 0건, 추적 스크립트 0건. 9월 가입 74곳 중 경로 아는 곳 1곳.
- 관리자 결제 표/대시보드에서 `PENDING`(결제창만 열고 이탈한 건 포함)이 매출에 합산. 실측(26-09-17 전체 누적): COMPLETED 34건 1,710,600원 vs **PENDING 51건 3,999,400원**, WAITING_FOR_DEPOSIT 14건 693,000원.

**끝났다의 정의**
1. 공개/앱 전 페이지(관리자 제외)의 방문이 `analytics_*` 테이블에 세션·유입경로·기기·지역과 함께 쌓인다.
2. `/admin/analytics/*` 에서 실시간 접속자·유입 채널/SNS·UTM·인기 페이지·요일×시간·기기·지역·전환(가입·결제)·세션 여정·추적 링크·픽셀/검색엔진 상태를 볼 수 있다.
3. 픽셀(GA4·GTM·Google Ads·Meta·네이버·카카오·TikTok·Clarity)을 **관리자 화면에서 ID 입력만으로** 켤 수 있고(재배포 불필요), 가입·결제 전환 이벤트가 픽셀로 발사된다.
4. 관리자 매출 집계는 **실제 결제 완료분만** 센다. 결제 행 클릭 → 그 학원의 결제 이력 전체 + 회원 상세 이동 버튼.
5. 게이트: `tsc` 신규 오류 0 · 분류기 단위테스트 · 수집 E2E(익명 방문→DB 행→대시보드 표시) · 음성테스트.

---

## 1. 불변식 (위반 = critical)

- **I1 KST**: DB 타임스탬프는 `timestamp(3)` UTC. 모든 일/시간/요일 버킷은 `("col" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Seoul'` 로 변환 후 자른다. JS 쪽 `setHours(0)` 금지 — 기간 경계는 `src/lib/analytics/time.ts` 헬퍼만 쓴다.
- **I2 관리자 제외**: `/admin*` 경로는 클라이언트·서버 양쪽에서 수집하지 않는다.
- **I3 PII 0**: IP 원문 저장 금지. 이메일·이름·전화 등 쿼리스트링 값 저장 금지(아래 §3.4 정화 규칙). visitor/session id 는 클라이언트 난수.
- **I4 추적 실패는 사용자에게 안 보인다**: 수집 API 는 항상 204/200, 클라이언트 트래커는 모든 예외를 삼킨다. 페이지 렌더를 막지 않는다(서버 컴포넌트 DB 읽기 추가 금지 — 루트 레이아웃은 정적 유지).
- **I5 비용**: SSE·웹소켓 신설 금지. 실시간은 관리자 화면이 **보일 때만** 폴링(10초). 방문자 쪽 하트비트는 탭이 보이고 최근 조작이 있을 때만, 2분 주기.
- **I6 무회귀**: 기존 `ActivityTracker`·`/api/track`·`app_events` 는 건드리지 않는다(회원 상세 활동 타임라인이 의존). 기존 테이블 ALTER 0건.
- **I7 서버 액션으로 대시보드 데이터를 병렬 로딩하지 않는다** — Next 서버 액션은 클라이언트당 직렬 큐라 패널 N개가 줄을 선다. 리포트는 전부 `GET /api/admin/analytics/*` 라우트 핸들러 + `requireAdminAuth()`.
- **I8 내부 트래픽**: 관리자 쿠키(`yshin-admin-session`) 보유 방문, 운영 호스트(`smoat.co.kr`,`www.smoat.co.kr`)가 아닌 호스트의 방문은 `isInternal=true`. 대시보드 기본값은 내부 제외. (예외: env `ANALYTICS_COUNT_NONPROD=1` 이면 비운영 호스트도 외부로 취급 — 로컬 게이트 전용.)
- **I9 매출 정의**: 관리자 콘솔 매출은 전부 `src/lib/admin-revenue.ts` 헬퍼(§9.2 D1) — 충전 결제액(COMPLETED+REFUNDED, 결제일 `COALESCE(paidAt, completedAt)`, `COALESCE(paidAmount, price)`) − 환불(REFUNDED, 환불일) + 구독 PAID + 무통장 MANUAL_GRANT. PENDING·WAITING_FOR_DEPOSIT·FAILED·CANCELLED 는 매출 아님. 유입 분석의 「학원 귀속 매출」도 같은 정의(단 구독·수동지급은 학원 귀속 불가 → 충전만).

---

## 2. 데이터 모델 (신규 6테이블, 추가 전용)

SQL 정본: `prisma/migrations-manual/20260917_analytics.sql` (CREATE TABLE/INDEX IF NOT EXISTS 만). Prisma 모델은 `schema.prisma` 말미 「Analytics」 블록. **기존 모델에 relation 필드 추가 금지**(I6) — academyId/staffId 는 인덱스만 있는 느슨한 참조.

컬럼명은 리포 관례대로 camelCase 따옴표 컬럼(Prisma 기본 매핑).

### 2.1 `analytics_visitors` — 브라우저 1개
| 필드 | 타입 | 설명 |
|---|---|---|
| id | text PK | 클라이언트 난수(쿠키 `smoat_vid`) |
| firstSeenAt / lastSeenAt | timestamp | |
| sessionCount / pageviewCount | int | |
| firstSessionId | text? | 최초 세션 |
| firstChannel / firstSource / firstMedium / firstCampaign | text? | **최초 유입(first-touch)** 비정규화 |
| firstReferrerHost / firstLandingPath / firstTrackedLink | text? | |
| academyId / staffId / linkedAt | text?/text?/timestamp? | 로그인·가입 후 연결(최초 1회, NULL 일 때만 채움) |

### 2.2 `analytics_sessions` — 방문 1회(30분 무활동 시 종료, 새 캠페인 유입 시 새 세션)
`id`(클라 난수) · `visitorId` · `startedAt` · `lastSeenAt` · `engagedMs`(int, 탭이 보인 누적 체류) · `pageviews` · `eventsCount` · `isNewVisitor` · `entryPath` · `entryTitle?` · `exitPath?` · `hostname` · `referrer?`(외부 referrer 전체, 2000자 절단) · `referrerHost?` · `channel`(§4) · `source?` · `medium?` · `campaign?` · `term?` · `content?` · `clickIdType?`(gclid|gbraid|wbraid|fbclid|NaPm|n_media|ttclid|msclkid|dclid|twclid|li_fat_id) · `trackedLink?`(slug) · `landingQuery?`(정화된 쿼리, 1000자) · `deviceType?`(mobile|tablet|desktop) · `browser?` · `browserVersion?` · `os?` · `inApp?`(§4.3) · `screen?`("390x844") · `language?` · `timezone?` · `country?` · `region?`(ISO 3166-2 하위코드, 예 "11") · `city?` · `academyId?` · `staffId?` · `isInternal`(bool) · `hasConversion`(bool)

인덱스: `(startedAt)`, `(lastSeenAt)`, `(visitorId, startedAt)`, `(channel, startedAt)`, `(academyId)`.

### 2.3 `analytics_events` — 페이지뷰/커스텀 이벤트
`id`(클라 난수, PK) · `sessionId` · `visitorId` · `type`('pageview'|'event') · `name?`(이벤트명) · `path`(정규화, 500자) · `title?`(300자) · `area`(§3.5) · `prevPath?`(같은 세션 직전 내부 경로) · `engagedMs?`(이 페이지 체류, 이탈/다음 이동 시 갱신) · `scrollPct?`(최대 스크롤 %) · `props?`(jsonb, 2KB) · `createdAt`

인덱스: `(createdAt)`, `(sessionId, createdAt)`, `(type, createdAt)`, `(name, createdAt)`, `(path, createdAt)`.

### 2.4 `analytics_conversions` — 전환(서버 판정, 멱등)
`id` · `type`('signup'|'purchase') · `refId`(signup=academyId, purchase=creditTopUpId) · UNIQUE(type, refId) · `academyId` · `visitorId?` · `sessionId?` · `value`(int KRW, signup=0) · `occurredAt`(가입/결제 시각) · `firedAt?`(**픽셀 발사 확인 시각** — §14 D17 로 의미 변경. insert 시 NULL, 클라이언트 ack 를 받은 순간에만 채운다. 서버가 발사를 「지시」한 시점이 아니다 — 픽셀 로드 전에 이탈하면 그 전환은 매체에 영영 전달되지 않으므로 지시 시각을 적으면 그 손실이 보이지 않는다) · `createdAt`

### 2.5 `analytics_tracked_links` — 추적 링크(`/go/[slug]`)
`id` · `slug` UNIQUE(`^[a-z0-9][a-z0-9-]{1,40}$`) · `label` · `destination`(내부 경로 `/...` 만 허용 — 오픈 리다이렉트 금지) · `utmSource` · `utmMedium` · `utmCampaign?` · `utmContent?` · `utmTerm?` · `note?` · `isActive` · `clicks` · `createdBy?` · `createdAt` · `updatedAt`

### 2.6 `analytics_link_clicks`
`id` · `linkId` · `slug` · `referrerHost?` · `deviceType?` · `os?` · `inApp?` · `country?` · `region?` · `isBot` · `createdAt` · 인덱스 `(linkId, createdAt)`, `(createdAt)`

---

## 3. 수집 프로토콜

### 3.1 클라이언트 트래커 — `src/components/analytics/site-analytics.tsx`
- 루트 레이아웃(`src/app/layout.tsx`)의 `<body>` 안에 1회 마운트. `usePathname()` 만 사용(`useSearchParams` 금지 — 정적 페이지 CSR 강등). 쿼리는 `window.location.search`.
- `/admin` 으로 시작하면 아무것도 안 한다(I2).
- **visitor id**: 쿠키 `smoat_vid`(2년, `SameSite=Lax`, `Secure` on https, path=/) + localStorage 백업. 없으면 생성 → `nv=true`.
- **session**: localStorage `smoat_ses = {id, last, camp}`. 새 세션 조건: 없음 | `now-last > 30분` | 이번 진입에 utm_source/utm_campaign/클릭ID 가 있고 저장된 `camp` 와 다름. 탭 간 공유.
- **자기/결제/로그인 복귀 referrer 무시**: referrer host 가 운영 호스트, `*.vercel.app`, localhost, 결제·인증 도메인(§4.4 IGNORE) 이면 새 세션 사유가 아니다.
- **히트 전송** `POST /api/collect` (`text/plain` JSON):
  - 페이지뷰: 경로 변경 즉시 `fetch(keepalive)` — 응답을 읽어 전환 지시(§6.3) 처리.
  - 체류/스크롤·커스텀 이벤트·하트비트: 큐에 모았다가 `visibilitychange(hidden)`/`pagehide` 에 `sendBeacon`, 또는 하트비트 주기에 함께.
  - 하트비트: 탭 visible && 최근 5분 내 조작(pointer/key/scroll) 있을 때 **120초 주기**.
- 본문:
```json
{ "v":1, "vid":"…", "sid":"…", "nv":true, "ns":true,
  "ctx": {"ref":"<document.referrer>","url":"<location.href>","sw":390,"sh":844,"lang":"ko-KR","tz":"Asia/Seoul"},
  "hits":[
    {"t":"pv","id":"<eid>","p":"/features","ti":"기능 | SMOAT","pp":"/","ts":1726560000000},
    {"t":"eng","id":"<eid of pv>","ms":34000,"sc":80,"ts":…},
    {"t":"ev","id":"<eid>","n":"cta_click","p":"/","pr":{"label":"무료로 시작"},"ts":…},
    {"t":"hb","p":"/features","ts":…}
  ] }
```
  `ctx` 는 `ns=true` 인 첫 전송에만. id 형식 `^[A-Za-z0-9_-]{12,40}$`.
- **자동 이벤트**: 외부 링크 클릭(`outbound`, props.host), 파일 다운로드(`download`, .pdf/.hwp/.hwpx/.docx/.xlsx/.zip), `data-track="이름"` 속성 요소 클릭(`cta_click`, props.label=속성값 또는 텍스트 40자), 가입 페이지 진입은 경로로 판정(§7).
- **공개 API** `window.smoatTrack(name, props)` 와 모듈 함수 `trackEvent(name, props)`(`src/lib/analytics/client.ts`).

### 3.2 수집 API — `src/app/api/collect/route.ts`
- `runtime` 기본(nodejs), `dynamic="force-dynamic"`. 본문 16KB 초과·파싱 실패·검증 실패 → 204.
- 봇 UA(§4.5) → 204. `hits` 최대 30개. ts 는 `[now-24h, now]` 로 클램프.
- 처리 순서(트랜잭션 불필요, 각각 멱등):
  1. 세션 upsert — `INSERT … ON CONFLICT (id) DO UPDATE SET lastSeenAt=GREATEST(...), pageviews=pageviews+Δ, exitPath=…, engagedMs=engagedMs+Δ` (Raw SQL, `Prisma.sql`).
     신규 세션일 때만 분류(§4)·UA 파싱·지오(§3.3)·정화 쿼리 저장.
  2. 방문자 upsert — 신규면 first-touch 필드 채움, `sessionCount` 는 신규 세션일 때만 +1.
  3. 이벤트 `INSERT … ON CONFLICT (id) DO NOTHING`; `eng` 는 `UPDATE analytics_events SET engagedMs=GREATEST(COALESCE(engagedMs,0),$ms), scrollPct=GREATEST(...) WHERE id=$id AND sessionId=$sid`.
  4. 계정 연결: 요청에 NextAuth 세션 쿠키가 있으면 `getStaffSession()` 으로 staff/academy 를 얻어 `UPDATE … SET academyId, staffId, linkedAt WHERE id=$ AND academyId IS NULL` (세션·방문자 각각).
  5. 전환 판정(§6) — 연결된 academyId 가 있을 때만.
- 응답: `pv` 가 포함된 요청은 `200 {"c":[{"type":"signup"},{"type":"purchase","value":49500,"id":"…"}]}`(발사할 전환 없으면 `{"c":[]}`), 그 외 204. 헤더 `Cache-Control: no-store`.

### 3.3 지오 — Vercel 헤더
`x-vercel-ip-country`, `x-vercel-ip-country-region`, `x-vercel-ip-city`(URL 인코딩 → decode). 로컬엔 없음 → null. 시·도 표시명 매핑은 `src/lib/analytics/geo.ts` (11 서울, 26 부산, 27 대구, 28 인천, 29 광주, 30 대전, 31 울산, 50 세종, 41 경기, 42/51 강원, 43 충북, 44 충남, 45/52 전북, 46 전남, 47 경북, 48 경남, 49 제주).

### 3.4 경로·쿼리 정화 — `src/lib/analytics/sanitize.ts`
- path: 소문자화 안 함, 최대 500자, 끝 슬래시 제거(루트 제외), 연속 슬래시 정리.
- 동적 세그먼트 그룹핑은 **리포트 단계**에서 수행(`pathGroup()`): cuid(`c[a-z0-9]{20,}`)·uuid·숫자 ID·20자 이상 토큰 → `:id`. 원본 path 는 저장 유지.
- 쿼리: 허용 키만 보존 — `utm_source, utm_medium, utm_campaign, utm_term, utm_content, gclid, gbraid, wbraid, fbclid, NaPm, n_media, n_query, n_rank, n_ad_group, n_ad, n_keyword, n_campaign_type, ttclid, msclkid, dclid, twclid, li_fat_id, sl, ref`. 값 200자 절단. 이메일 패턴 값은 버림.
- referrer: `http(s)` 만, 쿼리 중 `q`/`query`/`wd` 등 검색어는 보존하지 않는다(개인 검색어 PII 가능) — host + pathname 만 저장.

### 3.5 영역(area) — 경로 접두사
`/admin`→수집 안 함 · `/director`→director · `/teacher`→teacher · `/student`→student · `/parent`→parent · `/tutor`→tutor · `/g`→drill(단어 훈련 학생앱) · `/login`,`/signup`,`/register`,`/auth`,`/forgot*`,`/reset*` → auth · 그 외 → marketing. (정확한 가입 경로는 §7 에서 확정.)

---

## 4. 채널 분류 — `src/lib/analytics/classify.ts` (순수 함수, 단위테스트 필수)

### 4.1 채널 enum (표시명)
| channel | 표시명 |
|---|---|
| organic_search | 검색(자연) |
| paid_search | 검색 광고 |
| organic_social | SNS |
| paid_social | SNS 광고 |
| video | 동영상 |
| community | 블로그·카페·커뮤니티 |
| messenger | 메신저 공유 |
| ai | AI 검색·어시스턴트 |
| email | 이메일 |
| display | 디스플레이 광고 |
| referral | 외부 사이트 |
| direct | 직접 방문 |

### 4.2 판정 순서 (첫 매치 채택)
입력: `{referrerHost, referrerPath, query(정화), inApp, trackedLink}` → `{channel, source, medium, campaign, term, content, clickIdType}`
1. **utm_medium/utm_source 존재** — medium 정규화(소문자·trim):
   - `^(cpc|ppc|paid|paidsearch|paid_search|sa|keyword|search_ad)$` 또는 `^(.*cp.*|ppc|retargeting|paid.*)$` → 소스가 SNS 목록이면 paid_social, 아니면 paid_search
   - `display|banner|cpm|interstitial|expandable|gdn|da` → display
   - `social|sns|social-network|social-media|sm|social network|social media|organic_social` → organic_social (소스가 동영상 목록이면 video)
   - `email|e-mail|e_mail|newsletter|mail|edm` → email
   - `messenger|kakao|chat|share|kakaotalk` → messenger
   - `community|blog|cafe|forum` → community
   - `ai|llm|chatbot` → ai
   - `referral|link|partner|affiliate|qr|offline|print|poster|flyer` → referral
   - medium 이 없거나 미상 → **source 로 host 분류(아래 3)를 재사용**, 그래도 없으면 referral
   - source = utm_source 원문 소문자(40자), campaign/term/content 원문(100자).
2. **클릭 ID**(utm 없음): `gclid|gbraid|wbraid` → paid_search/google · `NaPm` 또는 `n_media` → paid_search/naver · `msclkid` → paid_search/bing · `ttclid` → paid_social/tiktok · `twclid` → paid_social/x · `li_fat_id` → paid_social/linkedin · `dclid` → display/google · `fbclid` → **organic_social**/facebook(또는 referrer 로 instagram/threads) — fbclid 는 오가닉 공유에도 붙으므로 광고로 단정 금지.
3. **referrer host** (www./m. 접두 제거 후 접미 매칭):
   - organic_search: `google.*`(단 mail/docs/drive/accounts/gemini 제외) → google · `search.naver.com`, `m.search.naver.com`, `naver.com`(블로그·카페·메일·in 제외) → naver · `search.daum.net`, `daum.net` → daum · `bing.com` → bing · `search.yahoo.com`/`yahoo.com` → yahoo · `duckduckgo.com` · `ecosia.org` · `zum.com` · `baidu.com` · `yandex.*` · `search.brave.com` · `startpage.com`
   - community: `blog.naver.com`, `m.blog.naver.com`, `in.naver.com` → naver_blog · `cafe.naver.com`, `m.cafe.naver.com` → naver_cafe · `cafe.daum.net` → daum_cafe · `tistory.com` → tistory · `brunch.co.kr` → brunch · `velog.io` · `band.us` → band · `everytime.kr` → everytime · `dcinside.com` · `clien.net` · `ppomppu.co.kr` · `reddit.com` · `medium.com` · `post.naver.com` → naver_post
   - organic_social: `instagram.com`, `l.instagram.com` → instagram · `facebook.com`, `l.facebook.com`, `lm.facebook.com` → facebook · `threads.net`, `threads.com`, `l.threads.com` → threads · `t.co`, `x.com`, `twitter.com` → x · `tiktok.com` → tiktok · `linkedin.com`, `lnkd.in` → linkedin · `pinterest.*` → pinterest · `story.kakao.com` → kakaostory
   - video: `youtube.com`, `youtu.be`, `m.youtube.com` → youtube · `tv.naver.com`, `chzzk.naver.com` → naver_tv · `vimeo.com`
   - messenger: `pf.kakao.com`(카카오 채널) → kakao_channel · `open.kakao.com` → kakao_openchat · `talk.kakao.com`, `kakaotalk` → kakaotalk · `line.me` → line · `t.me`, `telegram.org` → telegram · `discord.com` → discord · `slack.com` → slack
   - ai: `chatgpt.com`, `chat.openai.com` → chatgpt · `perplexity.ai` → perplexity · `gemini.google.com`, `bard.google.com` → gemini · `claude.ai` → claude · `copilot.microsoft.com` → copilot · `wrtn.ai` → wrtn · `chat.deepseek.com` → deepseek · `grok.com` → grok · `you.com` · `phind.com` · `meta.ai` · `poe.com` · `liner.space` · `cue.search.naver.com` → naver_cue
   - email: `mail.naver.com` → naver_mail · `mail.google.com` → gmail · `mail.daum.net` → daum_mail · `outlook.live.com`, `outlook.office.com` → outlook
   - 그 외 외부 host → referral(source = host)
4. **referrer 없음 + 인앱 UA**: `kakaotalk` → messenger/kakaotalk · `line` → messenger/line · `instagram` → organic_social/instagram · `facebook` → organic_social/facebook · `threads` → organic_social/threads · `band` → community/band · `everytime` → community/everytime · `tiktok` → organic_social/tiktok · `naver` → direct/naver_app · `daum` → direct/daum_app
5. 그 외 → direct/(direct)

utm_source 가 host 형태(`chatgpt.com`)면 3의 host 표로 source/채널 보정(ChatGPT 는 `utm_source=chatgpt.com` 을 붙인다).

### 4.3 인앱 브라우저 UA 토큰 — `src/lib/analytics/user-agent.ts`
`KAKAOTALK`→kakaotalk · `NAVER(inapp`→naver · `Instagram`→instagram · `FBAN|FBAV|FB_IAB|FBIOS`→facebook · `Barcelona`→threads · `Line/`→line · `BAND/`→band · `DaumApps`→daum · `everytimeApp`→everytime · `musical_ly|BytedanceWebview|trill_`→tiktok · `Snapchat`→snapchat · `MicroMessenger`→wechat · `Whale/` 는 인앱 아님(browser=whale).
browser: Whale, SamsungBrowser, Edg, OPR, Firefox/FxiOS, CriOS/Chrome, Safari · os: iOS(iPhone|iPad|iPod), Android, Windows, macOS, ChromeOS, Linux · deviceType: iPad/Tablet/(Android 이면서 Mobile 없음)→tablet, Mobi|iPhone|Android→mobile, 그 외 desktop. 리포 의존성 추가 없이 정규식으로.

### 4.4 무시 referrer (새 세션·채널 근거 아님)
운영 호스트, `*.vercel.app`, `localhost`, 결제: `portone.io`, `iamport.kr`, `inicis.com`, `kcp.co.kr`, `tosspayments.com`, `toss.im`, `kakaopay.com`, `pay.naver.com`, `danalpay.com`, `nicepay.co.kr`, `payco.com`, 인증: `accounts.google.com`, `kauth.kakao.com`, `accounts.kakao.com`, `nid.naver.com`.

### 4.5 봇
정규식(대소문자 무시): `bot|crawl|spider|slurp|mediapartners|headless|lighthouse|pagespeed|preview|facebookexternalhit|embedly|quora link|whatsapp|telegrambot|discordbot|kakaotalk-scrap|yeti|daum(oa)?|bingpreview|petalbot|semrush|ahrefs|mj12|dotbot|gptbot|claudebot|perplexitybot|bytespider|amazonbot|applebot|google-inspectiontool|chrome-lighthouse|python-requests|curl|wget|axios|node-fetch|go-http-client|java/|okhttp|playwright|puppeteer|phantomjs|selenium` · UA 없음. 단 `HeadlessChrome` 인데 env `ANALYTICS_COUNT_NONPROD=1` 이면 통과(게이트 전용).

---

## 5. 리포트 정의 (대시보드 공통)

- **기간**: `range` = `today|yesterday|7d|30d|90d|custom(from,to: YYYY-MM-DD KST)`. 비교 = 직전 동일 길이 기간.
- **필터**(URL 쿼리, 세션 기준 AND): `channel, source, campaign, medium, device, browser, os, inApp, country, region, entry(진입경로), page(해당 경로를 본 세션), area, loggedIn(yes|no), internal(include)`.
- **방문자(UV)** = 기간 내 세션의 distinct visitorId · **방문(세션)** = 세션 수 · **페이지뷰** = type='pageview' 이벤트 수
- **페이지뷰 정의 2벌(26-09-18 정정)**: 위 정의는 「페이지별 PV」에만 그대로 적용된다.
  - *추이·일자별 PV* = **그날 시작한 세션의 `pageviews` 합**(세션 귀속 — 자정을 넘긴 세션의 PV 는 시작일에 전부 계상)
  - *페이지별 PV* = **`pageview` 이벤트 수**(발생 시각 귀속)
  현재 데이터로는 자정을 넘긴 세션이 0건이라 두 값이 같지만 운영에서는 갈린다. 두 숫자가 어긋나 보인다는 신고가 오면 이 정의 차이를 먼저 확인할 것(둘 다 의도된 값이다).
- **이탈률** = `pageviews<=1 AND eventsCount=0 AND engagedMs<10000` 세션 비율 · **참여 세션율** = 1-이탈률
- **평균 체류** = 세션 `engagedMs` 평균(0 제외 안 함) · **세션당 페이지**
- **실시간** = 비내부 세션 중 `lastSeenAt >= now()-5분`
- **신규 방문자** = `isNewVisitor=true` 세션 비율
- 시간 버킷: 기간 ≤ 2일이면 시간별, 아니면 일별(KST). 빈 버킷은 0 으로 채운다.

---

## 6. 전환 (가입·결제) — 서버 판정 + 픽셀 발사 지시

### 6.1 가입(signup)
수집 API 가 academyId 를 방문자에 **처음 연결**할 때(또는 연결돼 있고) 그 학원 `academies.createdAt >= now()-2일` 이고 conversions 에 (signup, academyId) 가 없으면 INSERT(value 0, occurredAt=academy.createdAt, visitorId/sessionId=현재) → 응답 `c` 에 `{type:"signup"}`.

### 6.2 결제(purchase)
연결된 academyId 에 대해 `credit_top_ups` 중 `status='COMPLETED' AND COALESCE(completedAt,paidAt) >= now()-7일` 이고 conversions 에 (purchase, topUpId) 가 없는 건 → INSERT(value=COALESCE(paidAmount,price)) → 응답 `c` 에 `{type:"purchase", value, id:topUpId}`. 한 요청 최대 3건.
조회 비용: 로그인 사용자 페이지뷰(`t=pv` 포함 요청)에서만 수행.

### 6.3 클라이언트 처리
`c` 를 받으면 `firePixelConversion(type, value, id)` → 설정된 픽셀 전부에 발사(§8.3), 1st-party 이벤트 `signup_complete`/`purchase_complete` 를 큐에 추가.
**ack(§14 D17)**: 발사 직후 히트 `{t:"ack", id:"<conversionId>"}` 를 보내고 서버가 그때 `firedAt` 을 채운다(응답 `c` 항목에 `cid` 포함). `firedAt IS NULL` 이며 `occurredAt` 이 7일 이내인 전환은 다음 페이지뷰 응답에 다시 실린다 — 픽셀 로드(유휴 2초 + 설정 조회) 전에 이탈한 전환을 다음 방문에서 만회한다.

### 6.4 귀속(attribution) — 리포트 단계
- **최초 유입(first-touch)**: 학원에 연결된 방문자 중 `firstSeenAt <= academy.createdAt` 인 가장 이른 방문자의 first* 필드.
- **가입 직전 유입(last non-direct)**: 그 학원 방문자들의 세션 중 `startedAt <= academy.createdAt` 이고 channel≠direct 인 가장 늦은 세션. 없으면 가장 늦은 세션.
- 둘 다 없으면 「추적 시작 전 가입」.
- 매출 귀속 = 학원의 COMPLETED top-up 합(I9).

---

## 7. 가입 퍼널

단계: ① 방문자(기간 내 비내부 visitor) → ② 가입/로그인 화면 진입(auth area 페이지뷰가 있는 visitor) → ③ 가입 완료(signup 전환 또는 연결 academy.createdAt 이 기간 내) → ④ 첫 결제(해당 학원의 첫 COMPLETED top-up 이 기간 내).
### 7.1 확정 가입 경로(정찰 26-09-17)
- 셀프 가입은 **소셜 전용**: `/register`(Google·Kakao 버튼) → `/auth/callback` 또는 `/api/auth/kakao` → 신규면 `/auth/onboarding` → `POST /api/auth/onboarding`(academy·staff 생성, `src/app/api/auth/onboarding/route.ts:137-214`) → `signIn("social-bridge")` → `/director/studio`.
- 랜딩 `LoginModal` 소셜 버튼도 같은 콜백 → 신규면 온보딩.
- 관리자 승인 가입(`src/actions/admin/registrations.ts`)은 방문 흐름 밖(귀속 불가 — 「추적 시작 전/수동 가입」).
- 퍼널 ② = `area='auth'` 페이지뷰가 있는 방문자. ③ 판정은 §6.1(서버) — 가입 직후 첫 로그인 페이지뷰(`/director/studio`)에서 성립.

---

## 8. 픽셀·태그

### 8.1 설정 저장
`platform_settings` key `analytics_pixels` (JSON): `{ ga4Id, gtmId, googleAdsId, googleAdsSignupLabel, googleAdsPurchaseLabel, metaPixelId, naverAnalyticsId, naverAdsConversionId, kakaoPixelId, tiktokPixelId, clarityId, enabled: bool }`. env `NEXT_PUBLIC_*` 동명 값이 있으면 **DB 값 우선, 없을 때 env 폴백**.
형식 검증: GA4 `^G-[A-Z0-9]{4,15}$` · GTM `^GTM-[A-Z0-9]{4,10}$` · Ads `^AW-\d{6,15}$` · Meta `^\d{10,20}$` · Naver(애널리틱스·광고 공통) `^[a-z0-9_]{4,40}$`(대소문자 허용) · Kakao `^\d{10,25}$` · TikTok `^[A-Z0-9]{10,30}$` · Clarity `^[a-z0-9]{6,20}$`.
**네이버 2필드(§14 D14)**: `naverAnalyticsId`=애널리틱스 발급ID(방문 통계), `naverAdsConversionId`=검색광고·GFA 공통키(전환). wcslog.js 는 1회만 로드하고 발사 직전에 `wcs_add["wa"]` 를 바꿔 끼운다 — 둘 다 설정하면 PV 로그가 2개 나가는 것이 정상이고(공식 가이드 07), `wcs.trans` 전환은 **공통키로만** 보낸다. env 는 `NEXT_PUBLIC_NAVER_ANALYTICS_ID`·`NEXT_PUBLIC_NAVER_ADS_CONVERSION_ID`.

### 8.2 공개 설정 API — `GET /api/analytics/config`
응답 `{pixels:{…활성 ID만}}`, 헤더 `Cache-Control: public, s-maxage=300, stale-while-revalidate=600`. DB 오류 시 env 폴백.

### 8.3 로더 — `src/components/analytics/marketing-pixels.tsx`
- 트래커와 함께 루트 레이아웃에 마운트. `/admin` 에선 로드 안 함. `requestIdleCallback`(없으면 2초 타임아웃) 후 config fetch → 스크립트 주입.
- 경로 변경마다: GA4 `gtag('event','page_view',{page_location,page_title})`(config 에서 `send_page_view:false`) · Meta `fbq('track','PageView')` · 네이버 `wcs_do()` · 카카오 `kakaoPixel(id).pageView()` · TikTok `ttq.page()` · Clarity 자동 · GTM `dataLayer.push({event:'page_view'})`.
- 전환: signup → GA4 `sign_up` / Ads conversion(send_to=`${adsId}/${label}`) / Meta `CompleteRegistration` / 카카오 `completeRegistration()` / 네이버 `wcs.trans{type:'sign_up'}`(공통키) / TikTok `CompleteRegistration` / dataLayer `sign_up`. purchase → GA4 `purchase{transaction_id,value,currency:'KRW'}` / Ads / Meta `Purchase{value,currency:'KRW'}` / 카카오 `purchase({total_price,currency:'KRW'})` / 네이버 `wcs.trans{type:'purchase',id,value}` / TikTok **`Purchase`**(구 `CompletePayment` — 2025-05 개명, 공식 권장 명칭. 레거시는 백엔드 자동 변환) / dataLayer `purchase`.
- `page_title` 은 `document.title` 이 빈 동안(경로 전환 직후 metadata 커밋 전) 기다렸다가 보내고, 끝내 비면 **키 자체를 생략**한다(빈 문자열로 덮어쓰면 GA4 가 (not set)). 대기 헬퍼는 rAF 2회 → `<title>` MutationObserver, 상한 1초.
- Meta 는 `init` 전에 `fbq('set','autoConfig',false,<id>)` 로 자동 고급매칭(폼 입력 해시 전송)을 끈다.
- 방문 분석 거부(거부 쿠키·GPC·저장소 차단)는 route·pageview·conversion·flush **모든 진입점에서 재확인**한다 — 거부 순간 같은 문서 안에서 즉시 정지(phase=off·큐 비움·Clarity stop)하고, `smoat:analytics-consent` 이벤트로도 통지받는다.
- 정확한 스니펫은 `docs/analytics/research-2609.md` §5 를 따른다.

### 8.4 로드 범위·민감 경로 (정찰 26-09-17 확정)
- CSP·보안 헤더 **없음**(`next.config.ts`·`vercel.json`) → 헤더 수정 불필요.
- 픽셀은 **허용 영역에서만 로드**: `marketing` · `/register` · `/login` · `director` · `teacher`. 경로 판정은 **소문자로 정규화해서** 한다(`/T/<토큰>` 같은 대소문자 우회 차단).
- **Clarity 만 더 좁다(§14 D13)**: `marketing` · `/register` · `/login` 에서만 주입·녹화한다. 원장·강사 화면으로 이동하면 `clarity("stop")`, 그 화면에서 첫 진입하면 아예 주입하지 않는다.
- **로드 금지**(토큰·미성년자·민감 쿼리): `/auth/complete`·`/auth/onboarding`(쿼리 `token=`), `/t/*`·`/r/*`·`/a/*`(경로에 공유 토큰), `/g*`(학생 쿠키·`?ac=&sc=`), `/student*`·`/parent*`·`/tutor*`(학생·학부모), `/credits/promo/*`, `/coupon*`, `/admin*`. 로드 후 금지 경로로 이동하면 그 경로에서는 pageview 를 보내지 않는다(이미 로드된 스크립트는 제거 불가 — 자동 수집 기능 끄기: GA4 `send_page_view:false`, Clarity 는 금지 경로에서 `clarity("stop")` 가능 시 호출).
- GA4 `page_location` 은 허용 쿼리만 남긴 URL(§3.4)로 명시 전달.
- 서버 측 전환 API(Meta CAPI 등)는 이번 범위 밖 — 클라이언트 픽셀 + 1st-party 서버 판정(§6)으로 대체.

---

## 9. 관리자 결제 정합 (정찰 결과로 감독이 확정 — §9.x 에 기입)

### 9.1 확정 사실 (정찰 26-09-17)
- 결제 표는 `/admin/credit-plans`(「결제 관리」) — `src/components/admin/credit-topups-admin-client.tsx`(1837줄). 행 클릭은 이미 「결제 상세」 Dialog(`TopUpDetailPanel`)를 연다. 없는 것: **그 학원의 결제 이력 목록**, **회원 상세 링크**.
- 회원 상세 `/admin/members/[id]` 의 id 는 **원장 Staff.id**(학원 id 아님). 행 데이터 `topUp.academy.staff[0].id`(원장, `take:1`, orderBy 없음).
- `/admin/academies/[academyId]` 는 학원 id 라우트로 별도 존재.
- `get-member-purchases.ts` 는 staff id 기준, 페이지네이션 없음.

### 9.2 감사 확정 결함과 결정 (26-09-17 매출 감사 에이전트 → 감독 실DB 대조)
실측: PENDING 51건 3,999,400원·WAITING 14건 693,000원 — **전부 생성 1시간 초과(이탈/만료)**. REFUNDED 2건(각 19,800, 당일 환불). 부분취소 0건. COMPLETED 행은 paidAt·completedAt·paidAmount 결측 0. 학원 status TRIAL 293 / ACTIVE 14. 구독 결제 0건.

| # | 결함 | 위치 | 결정 |
|---|---|---|---|
| F1 | 「결제 관리」 **오늘 결제** 카드가 상태 필터 없이 전 상태 합산 + `createdAt` + 서버 로컬 자정 | `src/lib/admin-credit-topups.ts:181-189` | COMPLETED/REFUNDED 결제액(`admin-revenue.ts`) · `paidAt` · KST 자정 |
| F2 | 「대기」 카드가 이탈한 PENDING·만료 WAITING 을 영구 누적 | `admin-credit-topups.ts:190-192` | **DB 상태는 바꾸지 않는다**(D3). 시간창 이내 = 「진행 중」, 초과 = 「미완료(이탈·만료)」로 분리 표시. **판정·자구 정본은 `src/lib/admin-topup-progress.ts` 의 `classifyTopUpProgress()` 하나**(26-09-18 확정, 아래 각주) |
| F3 | 표 「결제금액」이 PENDING/FAILED 의 주문 금액을 결제액처럼 표시 | `credit-topups-admin-client.tsx:1097-1099` | 헤더 「주문금액」, 미결제 상태는 회색·취소선 없이 흐리게 |
| F4 | 매출 정의 3벌(대시보드·원가·BEP) 불일치, 환불이 결제일 매출을 소급 삭제 | `dashboard.ts:335-366`, `operations-cost.ts:99-229`, `free-credit-bep.ts` | 단일 헬퍼 `src/lib/admin-revenue.ts` — 결제일 gross, 환불일 차감(D1) |
| F5 | 대시보드 「전체 활성」 = status ACTIVE(14곳) — 소셜 가입 TRIAL 293곳 누락 | `dashboard.ts:160` | `status NOT IN ('SUSPENDED','DEACTIVATED')`(D6) |
| F6 | 「크레딧 소진 임박」 ACTIVE 만 | `dashboard.ts:195-205` | 동일 D6 |
| F7 | 「크레딧 소모」 실패 자동환불 미차감 | `dashboard.ts:369-375` | `REFUND AND referenceType='CREDIT_TRANSACTION'` 만 차감 — **실DB로 referenceType 분포 확인 후** |
| F8 | 「입금 대기」 만료 주문 포함 · 「미확인 입금」이 목록(ACTION=FAILED 포함)과 불일치 | `dashboard.ts:125-130` | 대기는 매칭 시간창 이내만, 미확인은 목록 정의와 일치 |
| F9 | 「체험 종료 임박」 항상 빈 목록(전 체험 7/1 종료) | `dashboard.ts:206-214` | 「최근 가입 학원(7일)」 목록으로 교체(회원 상세 링크)(D5) |
| F10 | 원가 분석 가짜 MRR(만료 TRIAL 포함) | `operations-cost.ts:162-165,325-328` | ACTIVE && currentPeriodEnd > now |
| F11 | 원가 분석 크레딧 사용량이 충전 환불 회수분까지 차감 | `operations-cost.ts:294-318` | REFUND 는 referenceType CREDIT_TRANSACTION 만 |
| F12 | 기능별 마진이 하드코딩 팩 단가 | `feature-margin.ts:165-203` | 실DB 확인 후 결정 — 근거 없으면 라벨로 「정가 기준」 명시만 |
| F13 | BEP: NOT referenceType NULL 제외 의심·MANUAL_GRANT 불일치 | `free-credit-bep.ts:80-131` | **실DB 로 재현 확인 후** 수정 |
| F14 | 회원 상세 30일 사용/스파크라인 KST 이중 변환(−9h) | `get-member-detail.ts:85` | `AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Seoul'` |
| F15 | 거래 유형 라벨 오해(ALLOCATION=「월 정기 지급」인데 실제 가입 무료 지급), 「보너스」 라벨 | `admin-members-labels.ts:28-37`, `member-detail-client.tsx:109-112` | 실데이터 확인 후 라벨 정정 |
| F16 | CSV 내보내기·가입일 필터 시간대 | `export-members.ts:29-39`, `members-list-client.tsx:211-212` | `timeZone:'Asia/Seoul'` |
| F17 | 추천 「지급 완료」 GRANTED 만(APPROVED 누락), 「총 전환」 라벨 | `referrals.ts:171-193` | GRANTED+APPROVED, 「추천 가입」 |
| F18 | 입금 대기 주문 100건 절단 무표시 | `bank-deposits/route.ts:40-52` | 절단 시 「100건+」 표기 |

**F2 각주 — 미완료 결제 판정의 단일 진실원 (26-09-18 확정)**
같은 PENDING/WAITING 주문 1건이 네 화면에서 시간창 2벌(60분·30분)·자구 4벌(「시간 초과」/「미완료(이탈·만료)」/「만료」/「입금대기」)로 불리던 것을 하나로 묶는다.
- 판정 함수: `classifyTopUpProgress(status, createdAt, now)` → `'in_progress' | 'stale' | 'n/a'` (`src/lib/admin-topup-progress.ts`)
- **시간창은 상태별로 다르다**: `PENDING`(결제창 이탈) = `PENDING_STALE_MINUTES` 60분 · `WAITING_FOR_DEPOSIT`(무통장) = 자동 매칭 시간창 `NEXT_PUBLIC_BANK_DEPOSIT_MATCH_WINDOW_MINUTES`(기본 30분). 무통장에 60분을 쓰면 매칭이 끝난 뒤 30분 동안 「진행 중」으로 남는다.
- **표시 자구는 「진행 중」 / 「미완료(이탈·만료)」 둘뿐**이다. 대시보드 힌트의 「시간 초과」, 무통장 화면의 「만료」, 회원 상세의 「입금대기」도 이 자구로 맞춘다(원 DB 상태는 툴팁에 `원 상태: 입금대기(WAITING_FOR_DEPOSIT) · 생성 30분 초과` 형태로 남긴다).
- 매칭창 값은 이미 `NEXT_PUBLIC_` 이라 서버·클라이언트가 같은 값을 읽는다 — 추가 배선이 필요 없다.
- 각 화면의 자체 상수·자체 판정(예: `credit-topups-admin-client.tsx` 의 `BANK_WINDOW_MINUTES`, `academy-payment-history.tsx` 의 60분 재선언)은 **전부 이 함수 호출로 교체**한다.

**결정 원장**
- D1 매출 = `admin-revenue.ts`(결제일 gross − 환불일 환불 + 구독 PAID + MANUAL_GRANT).
  - **D1 각주 — 일 단위 순매출은 음수가 될 수 있다(26-09-18 확정)**. 환불은 환불일에 차감하므로 결제가 없고 환불만 있는 날은 net < 0 이다(실데이터: 2026-06-10 KST −19,800 — 06/09 22:47 결제, 06/10 00:25 환불로 자정을 넘긴 건). 표시 계층 규약:
    1. **증감률 분모는 항상 `Math.abs(previous)`**. 부호가 바뀌는 전이(음수→양수, 양수→음수)는 % 대신 「이전 ₩-19,800」처럼 절대값을 적는다(§13 S3 의 KPI 규칙과 같은 형태). `previous===0 && current<0` 은 「신규(초록)」가 아니다.
    2. **차트**는 음수일을 0 막대로 숨기지 않는다 — 0선 아래로 그리거나 최소 2px 회색 막대 + 「환불 −N」 툴팁. 합계 옆에 「환불 차감 포함」.
    3. **비율**(마진·전환율)은 분모 매출이 0 이하이면 0.0% 가 아니라 `null` 로 두고 화면에 「—」 또는 「환불 차감일」 배지를 쓴다.
    4. 재발 방지 게이트는 오늘/어제가 아니라 **전 기간 스캔**(`HAVING SUM(net) < 0`)으로 음수일을 찾아 그 날짜를 고정 픽스처로 쓴다 — 14일 창만 보면 영원히 못 잡는다.
- D2 내부·테스트 계정은 매출에서 **제외하지 않는다**(정책 결정 대기) — 해당 금액만 보고.
- D3 오래된 PENDING/WAITING 의 DB 상태 변경(만료 배치) **금지** — 표시 분류만.
- D4 MANUAL_GRANT 전환 가드(AMBIGUOUS·세미나 보증금) — **보고만**, 흐름 변경 금지.
- D5 「체험 종료 임박」 → 「최근 가입 학원(7일)」.
- D6 활성 학원 = status NOT IN ('SUSPENDED','DEACTIVATED').
- 결제·충전·환불 **실행 흐름(PortOne·웹훅·무통장 매칭) 코드는 한 줄도 바꾸지 않는다** — 집계·표시만.

### 9.3 결제 행 → 학원 결제 이력 (신규)
- 기존 「결제 상세」 Dialog(`TopUpDetailPanel`) **최상단**에 「이 학원 결제 이력」 요약 + 목록 + 버튼 2개:
  - 「회원 상세」 → `/admin/members/{원장 staffId}`(원장 없으면 비활성 + 사유 툴팁)
  - 「학원 상세」 → `/admin/academies/{academyId}`
- 데이터: `GET /api/admin/credits/academies/[academyId]/top-ups` → `{ academy:{id,name,directorStaffId,directorName,createdAt}, summary:{paidTotal, paidCount, refundTotal, refundCount, firstPaidAt, lastPaidAt, pendingRecent, abandoned}, items:[{id, orderNo, createdAt, paidAt, status, price, paidAmount, creditAmount, paymentMethod, orderName}], total }` (최신순, `items` 최대 200). 금액 합계는 D1 정의.
  - `total`(26-09-18 정본화) = **이 학원 충전 주문 전체 건수**. `items` 는 200건에서 잘리므로 화면이 「200건+」 절단을 표시하려면 이 값이 필요하다. `summary` 합계는 절단 전 전체를 돈다(200건째에서 매출이 잘리지 않는다).
  - 유닛이 스펙에 없던 필드를 추가한 사례다. 규칙은 「스펙에 없는 필드 창작 금지」지만 **이 건은 실해가 없고 필요해서 정본에 흡수**했다(§13 「필드 추가 규칙 예외」 참조). 앞으로도 필요하면 먼저 스펙을 고치고 구현한다.
- 목록 행 클릭 = 그 결제 건으로 상세 전환(`selectTopUp`).
- 새 UI 는 **별도 파일**(`src/components/admin/credit-topups/academy-payment-history.tsx`) — 1837줄 파일에는 import·배치 몇 줄만.

---

## 10. 관리자 UI 라우트

`/admin/analytics` 하위(공통 레이아웃 = 탭 + 기간/필터 바, 감독 소유):
| 경로 | 내용 | 데이터 API |
|---|---|---|
| `/admin/analytics` | 개요: KPI 카드(방문자·방문·페이지뷰·이탈률·평균체류·세션당PV·가입·결제·귀속매출, 이전기간 대비) + 추이 차트(이전기간 겹침) + 실시간 미니카드 + 상위 채널/페이지/소스 5개 | `overview` |
| `/admin/analytics/realtime` | 현재 접속자 수(5분)·분당 PV 30분·지금 보는 페이지·지금 유입 소스·활성 세션 목록(경로/채널/기기/지역/체류)·최근 이벤트 피드. 10초 폴링(보일 때만) | `realtime` |
| `/admin/analytics/acquisition` | 채널·소스·referrer host·referrer 전체·UTM(소스/매체/캠페인/콘텐츠/키워드)·인앱 브라우저·AI 유입·클릭ID. 각 행: 방문자·방문·이탈률·평균체류·가입·전환율·매출. 행 클릭 = 필터 | `acquisition` |
| `/admin/analytics/pages` | 인기 페이지(PV·방문자·평균체류·스크롤·**종료율**)·진입 페이지(세션·이탈률·가입)·종료 페이지·영역(area) 비중·페이지 흐름(선택 경로의 이전/다음 페이지 Top) · 경로 그룹핑 토글 | `pages` |
| `/admin/analytics/audience` | 기기·브라우저·OS·인앱·화면·언어·국가·시도·도시·신규/재방문·로그인/비로그인 + **요일×시간 히트맵** + 최근 90일 일별 방문 캘린더 | `audience`(heatmap·hourly 포함) |
| `/admin/analytics/conversions` | 퍼널(§7)·채널별 가입/결제/매출·가입 학원 목록(가입일·학원·원장→회원상세 링크·최초 유입·직전 유입·가입까지 방문 수·일수·첫 결제·누적 매출)·커스텀 이벤트 표 | `conversions` |
| `/admin/analytics/sessions` | 세션 탐색기(최신순, 필터, 페이지네이션) + 세션 여정 드로어(이벤트 타임라인, 방문자의 다른 세션, 연결 학원 링크) | `sessions`, `session` |
| `/admin/analytics/links` | 추적 링크 CRUD·복사·QR 없음·클릭수·유입 세션·가입·매출, UTM 링크 빌더 | `links` (+ POST/PATCH/DELETE) |
| `/admin/analytics/setup` | 픽셀 ID 설정 폼+형식검증+상태 · 수집 상태(최근 24h 히트, 마지막 수집 시각) · 검색엔진/사이트맵 패널(사이트맵 URL 수·섹션별, robots/llms 링크, 소유확인 메타, GSC 연결 실검사 결과, 네이버 서치어드바이저 안내) · 개인정보처리방침 고지 체크 · **「운영 조치」 섹션**(아래 `ops`) | `setup` |

**setup 리포트 계약 확장 — `ops`(26-09-18 선반영, 구현은 setup 유닛 몫)**
배포 후 운영자가 해야 할 일이 화면·문서 어디에도 없어 전부 구전이었다. 절차 정본은 `docs/analytics/ops-checklist.md` 로 옮겼고, **상태를 코드가 읽을 수 있는 항목만** setup 응답에 싣는다:
```
ops: {
  pixelsConfigured: number,          // 입력된 픽셀 ID 개수
  gscConnected: boolean,             // 실검사 결과(gscConfigured() 아님 — 권한을 안 본다)
  cronSecretConfigured: boolean,     // GET /api/cron/analytics-retention 401 본문과 같은 값
  retentionLastRun: {                // platform_settings["analytics_retention_last_run"] · 없으면 null
    startedAt, cutoff, truncated,
    deleted: { events, sessions, linkClicks, visitors },
    remaining: { … }, anonymized
  } | null,
  seedSessions: number,              // hostname='qa.seed' 세션 수 — 0 이 아니면 합성 데이터가 살아 있다
  conversions: number,               // analytics_conversions 총 건수(0 이면 전환이 한 번도 발사되지 않은 것)
  checklistUrl: "docs/analytics/ops-checklist.md"
}
```
화면은 값이 있는 항목은 값으로 보여주고(예: 「보유기간 마지막 집행 2026-09-18 03:30 · 삭제 0건」), 나머지는 체크리스트 링크로 건다. `retentionLastRun === null` 이면 **「한 번도 집행된 적 없음」** 경고를 띄운다 — 「매일 조용히 401」이 이렇게만 드러난다.

**정본 정정(26-09-18 — 구현이 옳고 스펙이 틀렸던 항목)**
- 인기 페이지 표의 지표는 **종료율**이다(그 경로를 본 세션 중 그 경로에서 끝난 비율 = `exits / 해당 경로를 본 세션`). 「이탈률」(1페이지·무참여 세션 비율)은 **진입 페이지 표에만** 있다. 화면 설명도 이미 종료율로 맞게 쓰여 있었다.
- `heatmap` 라우트는 존재하지 않는다. 요일×시간 히트맵과 시간대별(hourly) 분포는 `audience` 응답 한 벌에 함께 실린다 — 두 수치가 같은 스캔에서 나와 서로 어긋날 수 없으므로 **합친 구현이 옳다**(라우트를 나누지 말 것).

대시보드(`/admin`)에는 「지금 접속 N명 · 오늘 방문자 N · 오늘 가입 귀속」 미니카드(감독 소유, 60초 폴링 없이 페이지 자동새로고침에 편승).

---

## 11. 파일 소유권 (함대 격리)

| 소유 | 파일 |
|---|---|
| 감독(토대) | `prisma/schema.prisma`(Analytics 블록), `prisma/migrations-manual/20260917_analytics.sql`, `src/lib/analytics/{types,time,classify,user-agent,geo,sanitize,filters,db,channels}.ts`, `src/app/api/collect/route.ts`, `src/components/analytics/site-analytics.tsx`, `src/lib/analytics/client.ts`, `src/app/layout.tsx`, `src/components/admin/admin-shell.tsx`, `src/app/(admin)/admin/analytics/layout.tsx`, `src/components/admin/analytics/shared/*`, 견본 `overview` |
| 유닛 | 각자 `src/lib/analytics/reports/<unit>.ts`, `src/app/api/admin/analytics/<unit>/route.ts`, `src/app/(admin)/admin/analytics/<unit>/page.tsx`, `src/components/admin/analytics/<unit>/*` |

---

## 12. 게이트

- G1 `npx tsc --noEmit` 신규 오류 0(기준선 대비).
- G2 `classify`/`user-agent`/`sanitize` 단위테스트(`scripts/run-unit-tests.mjs` 규약) — 음성테스트: 규칙 하나를 일부러 깨서 RED 확인.
  - 케이스 정본은 `scripts/analytics-gate-classify.ts`(단독 실행 `npx tsx scripts/analytics-gate-classify.ts`), CI 진입점은 `tests/unit/analytics-classify.test.mjs` 다. 후자는 전자를 실제로 실행해 전건 통과 + 케이스 수 하한(100)을 확인한다 — **케이스를 테스트 파일로 복사하지 말 것**(정본이 둘이 되면 규칙을 고치는 사람이 스크립트만 고쳐 테스트가 옛 규칙을 계속 통과시킨다).
  - 26-09-18 실측: 단독 100/100 · `npm run test:unit` 안에서도 ✔(실행 대상 140건). 음성테스트로 기대값 1건을 어긋나게 하면 `FAIL naver search` 본문과 함께 RED.
- G3 수집 E2E: dev 서버(env `ANALYTICS_COUNT_NONPROD=1`)에 Playwright 로 referrer/UTM/인앱 UA 시나리오 방문 → DB 행의 channel/source 기대값 일치 → 관리자 JWT 쿠키로 각 리포트 API 200 + 수치 반영. 테스트 visitor id 접두 `qa-` → 게이트 종료 시 삭제.
- G4 화면 캡처 검수(각 analytics 페이지 데스크톱/모바일).
- G5 결제 정합: PENDING 을 포함하던 모든 합계가 COMPLETED 기준으로 바뀌었음을 실DB 쿼리로 대조.

---

## 13. 감독 처리 원장 (구현 함대 wf_99017fd4-3e4 이후, 26-09-17)

검수·수정 함대는 아래를 **이미 처리된 것**으로 취급한다(재수정 금지, 결함이 있으면 지적만).

| # | 처리 | 파일 |
|---|---|---|
| S1 | 모바일(≤767px) recharts 폭 0 — 공용 시계열 차트를 `responsive` prop 으로 교체(ResponsiveContainer 금지). 원인 전역 CSS `globals.css:2376` 은 **수정하지 않음**(기존 관리자·앱 차트 영향 범위 미측정 → 보고만) | `shared/timeseries-chart.tsx` |
| S2 | 공용 분해표 좁은 카드에서 숫자 열 잘림 → 최소폭 제거, 라벨 열 `w-full max-w-0` 말줄임 | `shared/breakdown-table.tsx` |
| S3 | KPI 증감: 직전 값 <10 이고 변화율 ≥300% 면 「이전 N」 표기 | `shared/kpi-card.tsx` |
| S4 | `<MarketingPixels />` 루트 레이아웃 마운트 | `src/app/layout.tsx` |
| S5 | 결제 관리 SSE 시그니처에 stats 포함(60분 경과·KST 자정에도 카드 갱신) | `api/admin/credits/top-ups/stream/route.ts` |
| S6 | `admin-revenue.ts` 에 `subscriptionRevenueWhere`·`manualGrantRevenueWhere`·`subscriptionPaidAt`·`manualGrantAt` export, `PENDING_STALE_MINUTES` 는 클라이언트 공용 `src/lib/admin-revenue-constants.ts` 로 이동(재수출 유지). **dashboard.ts·operations-cost.ts 에 복사된 조건은 아직 헬퍼 호출로 교체 안 됨 → 해당 유닛 수정 대상** | `src/lib/admin-revenue.ts`, `src/lib/admin-revenue-constants.ts` |
| S7 | 거부 수단: 거부 쿠키 `smoat_analytics_optout=1` · GPC · 쿠키/localStorage 모두 차단 시 트래커·픽셀 미실행. 개인정보처리방침 10항 쿠키 안내 위에 거부 토글 | `src/lib/analytics/consent.ts`, `client.ts`, `marketing-pixels.tsx`, `components/analytics/analytics-optout-toggle.tsx`, `components/legal/privacy-analytics-notice.tsx` |
| S8 | 보유기간 집행 크론 `/api/cron/analytics-retention`(매일 03:30 KST, CRON_SECRET) — 이벤트·세션·링크클릭 365일 초과 삭제, 미연결 방문자 삭제, 연결 방문자·전환·링크 설정은 보존. **26-09-18 강화 → 정본은 §15**(배치 삭제·집행 기록·연결 방문자 익명화·드라이런·인덱스) | `src/app/api/cron/analytics-retention/route.ts`, `vercel.json` |
| S9 | tsc 전체 0 오류(신규 파일 154개 포함 확인) | — |

**외부 사건 기록**: 26-09-17 22:46~22:53 KST, `credit_top_ups` 의 PENDING 전량이 CANCELLED/FAILED 로 일괄 변경됨(failureMessage 「결제창 이탈 — 결제가 진행되지 않아 자동으로 취소 처리했습니다」, portoneStatus READY/NOT_FOUND/FAILED, 41/56건 cancelledAt NULL). 이 세션의 에이전트 도구 호출 전수 스캔 결과 쓰기 0건, 저장소 코드·git 전 이력에 해당 문구 없음 → **이 작업 밖의 변경**. §9.2 의 「PENDING 51건」은 변경 전 실측이며 현재 PENDING 은 0에 가깝다. 표시 로직(60분 분류)은 그대로 유효.

**결정 추가**
- D7 퍼널 ④ 「첫 결제」 = 기간 내 가입(추적) 학원 중 **지금까지** 결제 1건 이상(코호트 전환). 기간 내 첫 결제 기준 아님.
- D8 전환·귀속 집계(가입·매출)는 내부 트래픽 토글과 무관(견본 overview 와 동일) — 화면에 명시.
- D9 추적 링크: 클릭 >0 인 링크 slug 변경 금지(409), 삭제는 클릭 0 일 때만 실삭제·아니면 비활성.
- D10 세션 탐색기 페이지 번호 파라미터는 `page` 가 아니다(공용 필터 `page`=본 페이지와 충돌) — 유닛 구현 이름 유지.
- D11 GA4 향상된 측정 「브라우저 기록 기반 페이지 변경」은 코드로 끌 수 없음 → 관리자 픽셀 패널 경고 + 운영자 조치 항목(GA4 관리 화면에서 끄기).

**필드 추가 규칙 예외(26-09-18)**: 「스펙에 없는 필드 창작 = critical」 규칙을 유닛마다 다르게 지켰다 — A1 은 §9.3 응답에 `total`(절단 표시용)을 스펙 수정 없이 추가했고 다른 유닛은 필요한 필드를 포기했다. 이번엔 `total` 을 정본에 흡수하는 쪽으로 정리했다(§9.3). 규칙 자체는 유지한다: **필요하면 스펙을 먼저 고치고 구현한다.**

---

## 14. 검수 후 결정(감독 확정, 26-09-18) — 수정 함대는 이 결정을 따른다

- **D12 가입 전환율**: 정의(분자=기간 내 가입 학원의 귀속, 분모=기간 내 방문자)를 유지하되 열 이름을 「가입 수 / 방문자」로 바꾸고 각주에 「분자는 기간 밖 첫 방문도 포함 — 100% 를 넘을 수 있음」을 명시한다. 코호트 재정의는 차기.
- **D13 Microsoft Clarity**: `director`·`teacher` 영역에서는 **로드하지 않는다**(학생 이름·성적 화면 녹화 방지). 허용 영역은 marketing·/register·/login 뿐. 방침 문구도 이에 맞춘다.
- **D14 네이버 ID 분리**: `naverAnalyticsId`(wcslog `wa`)와 `naverAdsConversionId`(검색광고 전환) 2필드로 나눈다. §8.1 필드 목록·검증·패널·로더를 함께 갱신(둘 중 하나만 설정돼도 각각 동작).
- **D15 퍼널 ④ 첫 결제**: `status='COMPLETED'` 1건 이상인 학원만 결제로 센다(전액 환불만 있는 학원은 제외).
- **D16 BEP 내부 계정**: 무료 지급 원가·BEP 계산에서 내부·테스트 계정(`isInternalAccount`)을 제외하고 카드에 「내부·테스트 계정 제외」를 표기한다. 매출 집계는 D2 대로 제외하지 않는다(별도 표기만).
- **D17 전환 발사 확인(ack)**: `analytics_conversions.firedAt` 은 **픽셀 발사 확인 시각**으로 의미를 바꾼다. 서버는 insert 시 firedAt=NULL 로 두고, firedAt 이 NULL 이며 occurredAt 이 7일 이내인 전환은 다음 페이지뷰 응답에 다시 실어 보낸다. 클라이언트는 픽셀 발사 후 히트 `{t:"ack", id:"<conversionId>"}` 를 보내고 서버가 firedAt 을 채운다(응답 `c` 항목에 `cid` 포함).
- **D18 서버 수신 시각 보정**: 세션 `lastSeenAt` 과 「마지막 수집」 판정은 클라이언트 ts 가 아니라 **요청 수신 시각**을 쓴다(이벤트 `createdAt` 은 클라 ts 유지하되 미래·과대 과거는 클램프).
- **D19 표 CSV 내보내기**: 공용 분해표에 「CSV」 버튼(현재 화면 데이터 기준, UTF-8 BOM)을 단다.
- **D20 커스텀 이벤트 속성 분해**: 전환·가입 탭의 이벤트 표에서 이벤트를 펼치면 props 상위 값(outbound=host, download=file, cta_click=label)을 보여준다.
- 유보(사용자 결정 대기): 내부 계정 매출 제외(D2 유지) · 무통장 재연결 서버 가드(D4 유지) · visitor/session id HMAC 서명 · 리텐션 코호트·기간 비교·주석 등 차기 기능.

---

## 15. 보유기간·파기 집행 (26-09-18 확정 — S8 강화판)

운영 절차·체크리스트는 **`docs/analytics/ops-checklist.md`** 가 정본이다. 여기에는 계약만 적는다.

### 15.1 무엇을 언제 지우는가

| 대상 | 기준 컬럼 | 조치 |
|---|---|---|
| `analytics_events` | `createdAt` | 365일 초과 **삭제** |
| `analytics_sessions` | `lastSeenAt` | 365일 초과 **삭제** |
| `analytics_link_clicks` | `createdAt` | 365일 초과 **삭제** |
| `analytics_visitors` (계정 미연결) | `lastSeenAt` | 365일 초과 **삭제** |
| `analytics_visitors` (계정 연결) | `lastSeenAt` | 365일 초과면 **익명화** — `firstSessionId·firstChannel·firstSource·firstMedium·firstCampaign·firstReferrerHost·firstLandingPath·firstTrackedLink` 을 NULL 로. `academyId`·`staffId`·집계 카운트는 남는다 |
| `analytics_conversions` | — | **보존**(가입·결제 사실 — 매출 대조 근거) |
| `analytics_tracked_links` | — | **보존**(운영 설정) |

**방침 정합**: 개인정보처리방침 5·10항은 「최대 1년 보관 후 파기 또는 익명화」라고 단언한다. 위 표의 마지막 두 줄이 그 문장과 어긋나므로 **방침에 예외 두 문장이 반드시 들어가야 한다**(고지 우선 — 구현을 고지에 맞추는 쪽은 이미 익명화로 집행했다):
> 「계정에 연결된 방문 요약(유입 경로)은 계정이 활동 중인 동안 보관하며, 마지막 방문일로부터 1년이 지나면 유입 경로 항목을 삭제(익명화)합니다.」
> 「가입·결제 전환 기록은 결제·매출 증빙을 위해 관련 법령이 정한 기간 동안 보관합니다.」
*이 문구를 넣기 전에는 방침 페이지(`src/app/privacy/page.tsx`)와 구현이 서로 거짓말을 한다.*

### 15.2 집행 방식(라우트 계약)

- `GET|POST /api/cron/analytics-retention`. 인증 둘: `Authorization: Bearer <CRON_SECRET>`(Vercel Cron) **또는 관리자 세션 쿠키**(운영자 수동 실행).
- **비인증 401 본문에 `cronSecretConfigured`(true/false)를 싣는다.** 비밀값은 노출하지 않는다. 미설정이면 서버 로그에 경고 1줄 — 「매일 조용히 401」을 운영자가 알 방법이 없던 것이 이 결함의 핵심이었다.
- **배치 삭제**: 각 대상을 `DELETE … WHERE ctid IN (SELECT ctid … LIMIT 20000)` 루프로 지운다. 한 문장으로 1년치를 지우면 함수 상한에서 통째로 롤백되고 다음 날도 같은 크기라 파기가 **영구히 성립하지 않는다**. 자체 예산 240초(`maxDuration` 300)를 넘기면 중단하고 남은 건수를 `remaining` 에 실어 다음 실행이 이어받는다(`truncated:true`).
- **집행 기록**: 실행 결과 JSON 을 `platform_settings` 의 키 **`analytics_retention_last_run`** 에 upsert 한다. 모양: `{ ok, mode:"run"|"dry", cutoff, retentionDays, startedAt, durationMs, truncated, deleted:{events,sessions,linkClicks,visitors}, remaining:{…}, anonymized, anonymizeRemaining }`. 관리자 setup 화면은 이 키를 읽어 「마지막 집행 시각·삭제 건수」를 보여준다(없으면 「한 번도 집행된 적 없음」).
- **드라이런**: `?dry=1` 은 아무것도 지우지 않고 대상 건수만 센다. 관리자 세션에서는 `&days=N` 으로 cutoff 를 당겨 볼 수 있다(최대 3650). 「오늘 호출해 200·0건」은 아무것도 증명하지 않으므로 검증은 드라이런으로 한다.

### 15.3 인덱스

`prisma/migrations-manual/20260918_analytics_indexes.sql` — `analytics_visitors_lastSeenAt_idx`. 2026-09-18 EXPLAIN 실측에서 이 테이블만 `WHERE "lastSeenAt" < cutoff` 가 Seq Scan 이었다(pkey·firstSeenAt·academyId 3개뿐). `CONCURRENTLY` 는 `prisma db execute` 가 파일을 한 트랜잭션으로 보내 실패하므로 쓰지 않는다. **`schema.prisma` 에도 같은 `@@index([lastSeenAt])` 를 넣어야 drift 가 남지 않는다**(스키마 소유자 몫).
만들지 않은 것: `analytics_sessions("hostname")` — distinct 3개(qa.seed 860·localhost 7·127.0.0.1 1)로 선택도가 없어 플래너가 쓰지 않는다. 쓰기 비용만 늘린다.

### 15.4 남은 위험 — 1년 뒤 과거 귀속이 사후에 줄어든다

귀속 쿼리가 세션을 INNER JOIN 한다(`reports/attribution.ts` acquisitionCte, `conversions.ts`, `acquisition.ts`). 세션이 365일로 지워지면 방문자에 `first*` 가 남아 있어도 그 가입은 `acq` 에서 탈락해 **과거 기간의 「유입 추적 가입·귀속 매출」이 조용히 줄어든다**(2027-09 이후 발현). 조치는 유닛 소유 파일이라 이번 라운드에서 집행하지 않았다:
- `acquisitionCte` 의 세션 JOIN 을 LEFT JOIN 으로 바꾸고 채널·소스를 `COALESCE(v."firstChannel", s.channel)` 로 폴백한다(방문자에 이미 비정규화돼 있다 — §2.1).
- 같은 처리를 `conversions.ts`·`acquisition.ts` 에도 한다.
- 회귀 게이트: 세션만 지운 픽스처에서 가입 귀속 건수가 유지되는지 확인.
