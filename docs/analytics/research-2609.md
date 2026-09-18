# 자체 웹 분석(1st-party analytics) + 광고 픽셀 설치 리서치 — 2026-09

- 작성일: 2026-09-17 (KST)
- 대상: smoat.co.kr (Next.js 16 App Router, Vercel 배포, 학원 원장 대상 B2B SaaS)
- 목적: ① 오픈소스 분석 도구의 기능을 전수 비교해 **우리가 복제할 기능 체크리스트**를 뽑고 ② 한국 유입 채널·인앱 브라우저·광고 픽셀·법적 요건을 **구현 가능한 수준의 정확도**로 정리한다.

## 조사 방법과 표기 규칙

- **소스 코드 직접 확인**: Umami·Plausible·Rybbit·OpenPanel·Swetrix·Liwan·Medama 저장소의 기본 브랜치를 내려받아 식별자 해시·세션·이탈률·실시간 창·채널 분류 코드를 직접 읽었다(블로그 요약 아님). PostHog·Matomo는 해당 파일만 raw로 받아 확인.
- **공식 문서 원문**: Google/Meta/네이버/카카오/Microsoft/Vercel/Next.js/개인정보보호위원회 문서는 가능한 한 원문(HTML·PDF·GitHub raw)을 받아 확인했다.
- **실측**: 리퍼러 정책(Referrer-Policy 헤더·`<meta name="referrer">`)은 2026-09-17 로컬 PC에서 `curl`로 PC/모바일 UA 두 벌로 측정. isbot·ua-parser-js 동작은 npm 설치 후 노드로 실행해 측정.
- 표기
  - **[실측]** 직접 실행·측정한 결과
  - **[추론]** 근거에서 논리적으로 도출했으나 직접 확인하지 못한 것
  - **[미확인]** 공식 근거를 찾지 못했거나 2차 출처뿐인 것 — 구현 전에 실측 필요
- GitHub 스타 수·최신 릴리스는 2026-09-17 GitHub REST API(`api.github.com/repos/...`) 조회값.

---

## 0. 핵심 결론 (먼저 읽을 것)

1. **어떤 오픈소스 도구도 한국 유입을 제대로 분류하지 못한다.** Umami의 검색엔진 목록에는 Naver·Daum이 아예 없어 네이버 검색 유입이 `referral`로 떨어진다([constants.ts](https://github.com/umami-software/umami/blob/master/src/lib/constants.ts)). GA4 소스 목록(Plausible·PostHog가 그대로 차용)에는 naver/daum/blog·cafe.naver.com/kakao.com은 있지만 **band.us, threads, x.com, in.naver.com, everytime.kr, wrtn.ai는 없다**([실측] GA4 원본 PDF grep). → 채널 분류는 **우리가 한국형 사전을 직접 유지**해야 한다(§3.6).
2. **GA4는 2026-05-13 "AI Assistant" 기본 채널을 신설**했다(medium=`ai-assistant`, campaign=`(ai-assistant)`, Google AI Overviews/AI Mode는 제외) — [GA4 새 기능 공지](https://support.google.com/analytics/answer/9164320?hl=en), [기본 채널 그룹](https://support.google.com/analytics/answer/9756891?hl=en).
3. **방문자 식별은 "일일 솔트 해시"가 업계 표준**이다: Plausible(SipHash, 일 단위 솔트, 직전 솔트 병행), PostHog 쿠키리스 모드(`hash(team_id, daily_salt, ip, ua, hostname)`), Swetrix(세션=일/프로필=월 솔트), OpenPanel(매일 00:00 크론 솔트), Liwan(일 단위), Rybbit(사이트별 옵트인 일 솔트). Umami는 기본 **월 단위** 솔트(`SALT_ROTATION` 기본 `month`). Medama만 해시 없이 **HTTP 캐시(If-Modified-Since) 트릭**을 쓴다.
4. **세션 = 무활동 30분**이 사실상 공통(Plausible·PostHog·Matomo·OpenPanel·Rybbit·Swetrix·Liwan). PostHog는 추가로 **최대 24시간** 상한. 예외: Umami는 "visit 시작 후 30분 또는 같은 정시(時) 버킷"에 가까운 구현이다(§1.2).
5. **"실시간 방문자" 창은 5분이 사실상 표준**(Plausible·Umami·OpenPanel·Rybbit·Swetrix). Matomo 카운트 위젯은 3분, 실시간 페이지 목록은 30분(Umami·OpenPanel도 실시간 페이지는 30분).
6. **이탈률 정의가 도구마다 다르다**: "페이지뷰 1회 & 커스텀 이벤트 0"(Umami), "페이지뷰 1회 & 상호작용 이벤트 0"(Plausible), "페이지뷰 1 & 오토캡처 0 & **10초 미만**"(PostHog), "5초 미만 체류"(Medama). → 우리 정의를 명시하고 대시보드 툴팁에 박아야 한다.
7. **Vercel은 지오 헤더를 무료로 준다**(`x-vercel-ip-country`, `-country-region`, `-city`(RFC3986 인코딩), `-latitude`, `-longitude`, `-timezone`, `-postal-code`, `-continent`). 단, **ISO 3166-2:KR은 강원 KR-42·전북 KR-45 그대로**이고 51/52는 **행정표준코드(법정동코드)** 쪽 변경이다. 두 코드 체계를 섞으면 안 된다(§6.3).
8. **네이버 광고 전환 스크립트의 현행은 `wcs.trans(_conv)`(신 스크립트)**, 구 `wcs.cnv()`와 같은 전환유형을 동시에 쓰면 **구 스크립트 전환이 영구 필터링**된다 — [naver/conversion-tracking 공식 가이드](https://naver.github.io/conversion-tracking/pages/01_script_guide_wcstrans/).
9. **한국법은 EU식 쿠키 배너를 일반 의무로 요구하지 않는다.** 다만 ① 처리방침에 자동수집장치(쿠키 등) 설치·운영·거부 사항은 **필수 기재**(법 제30조 제1항 제7호), ② 제3자 픽셀이 행태정보를 수집해 가도록 허용하면 **6개 항목 기재 권장**, ③ **개인을 식별해** 행태정보를 처리하면 동의 등 적법근거가 필요 — [개인정보 처리방침 작성지침 2026.4](https://www.privacy.go.kr/front/bbs/bbsView.do?bbsNo=BBSMSTR_000000000049&bbscttNo=20885), [PIPC 2024-01-31 보도자료](https://www.pipc.go.kr/np/cop/bbs/selectBoardArticle.do?bbsId=BS074&mCode=C020010000&nttId=9888). 학생(만 14세 미만 가능) 화면에는 광고 픽셀을 두지 않는 것이 권고 방향이며, **Microsoft Clarity는 18세 미만 대상 사이트에 쓰지 말라고 명시**한다(§5.9).
10. **네이버 서치어드바이저는 공개 분석 API가 없다.** 공개된 것은 **IndexNow**(누구나)와 **수집요청 API**(제휴 신청 필요)뿐 — §9.2.

---

## 1. 오픈소스 분석 도구 기능 패리티 매트릭스

### 1.1 저장소 개요

| 도구 | GitHub | 스타(2026-09-17) | 라이선스 | 최신 릴리스 |
|---|---|---:|---|---|
| Umami | [umami-software/umami](https://github.com/umami-software/umami) | 38,877 | MIT | v3.4.0 (2026-09-17) |
| Plausible CE | [plausible/analytics](https://github.com/plausible/analytics) | 29,110 | AGPL-3.0 | v3.2.1 (2026-05-15) |
| PostHog | [PostHog/posthog](https://github.com/PostHog/posthog) | 39,830 | MIT Expat + `ee/` 별도 라이선스([LICENSE](https://github.com/PostHog/posthog/blob/master/LICENSE)) | 롤링 배포 |
| Matomo | [matomo-org/matomo](https://github.com/matomo-org/matomo) | 21,880 | GPL-3.0 | 5.13.0 (2026-08-16) |
| OpenPanel | [Openpanel-dev/openpanel](https://github.com/Openpanel-dev/openpanel) | 6,981 | AGPL-3.0 | (GitHub Release 없음, 태그 운용) |
| Rybbit | [rybbit-io/rybbit](https://github.com/rybbit-io/rybbit) | 13,016 | AGPL-3.0 | v2.9.0 (2026-09-12) |
| Swetrix | [Swetrix/swetrix](https://github.com/Swetrix/swetrix) | 1,200 | AGPL-3.0 | tracker-js@4.6.1 (2026-08-29) |
| Liwan | [explodingcamera/liwan](https://github.com/explodingcamera/liwan) | 209 | Apache-2.0 | liwan-v1.7.0 (2026-09-13) |
| Medama | [medama-io/medama](https://github.com/medama-io/medama) | 645 | core/dashboard Apache-2.0, tracker MIT([README](https://github.com/medama-io/medama)) | v0.6.2 (2026-01-18) |

### 1.2 핵심 지표 정의 (소스 코드 기준)

| 도구 | 방문자 식별 | 세션(방문) | 이탈률 | 체류시간 | 실시간 창 |
|---|---|---|---|---|---|
| **Umami 3.4** | 쿠키 없음. `sessionId = uuidv5(hash(websiteId, ip, userAgent, sessionSalt, distinctId, APP_SECRET))`, `sessionSalt`는 `SALT_ROTATION`(day/week/**month 기본**)의 기간 시작 시각 해시 — [send/route.ts](https://github.com/umami-software/umami/blob/master/src/app/api/send/route.ts), [crypto.ts](https://github.com/umami-software/umami/blob/master/src/lib/crypto.ts) | `visitId = uuid(sessionId, 해당 시각의 "정시(startOfHour)" 솔트)`. 트래커가 메모리에 든 캐시 토큰(`x-umami-cache`)을 재전송하는 동안은 같은 visit을 유지하되, 토큰의 `iat`(**visit 시작 시각**)로부터 1800초가 지나면 새 visit. 토큰은 메모리 보관이라 전체 새로고침 시 사라지고, 이때는 같은 시(時) 안이면 같은 visitId로 재계산된다 → 엄밀한 "무활동 30분" 세션이 아님 [실측 코드 해석] — [send/route.ts](https://github.com/umami-software/umami/blob/master/src/app/api/send/route.ts), [tracker](https://github.com/umami-software/umami/blob/master/src/tracker/index.ts) | visit 내 페이지뷰 수 = 1 **이고** 커스텀 이벤트 0 — [getWebsiteStats.ts](https://github.com/umami-software/umami/blob/master/src/queries/sql/getWebsiteStats.ts) | visit별 (마지막 − 첫) 이벤트 시각 합 ÷ visit 수(1페이지 visit는 0초로 포함) — 동 파일 | **활성 방문자 = 최근 5분 distinct session**([getActiveVisitors.ts](https://github.com/umami-software/umami/blob/master/src/queries/sql/getActiveVisitors.ts)); 실시간 화면은 최근 **30분**, 10초 갱신(`REALTIME_RANGE=30`, `REALTIME_INTERVAL=10000`, [constants.ts](https://github.com/umami-software/umami/blob/master/src/lib/constants.ts)) |
| **Plausible CE** | 쿠키·localStorage 없음. `SipHash(salt, user_agent <> ip <> domain <> root_domain)`, 솔트는 일 단위 교체·삭제, **직전 솔트로 계산한 ID도 함께 조회**(자정 경계 보정) — [event.ex](https://github.com/plausible/analytics/blob/master/lib/plausible/ingestion/event.ex), [data-policy](https://plausible.io/data-policy) | 무활동 30분 — [metrics-definitions](https://plausible.io/docs/metrics-definitions) | 세션 시작 시 `is_bounce=true`, **두 번째 페이지뷰** 또는 **interactive 커스텀 이벤트**가 오면 false — [cache_store.ex](https://github.com/plausible/analytics/blob/master/lib/plausible/session/cache_store.ex) | 1페이지 방문은 0초로 포함 — [metrics-definitions](https://plausible.io/docs/metrics-definitions). 별도로 Time on page·Scroll depth·Exit rate 지표 존재 | **Current visitors = 최근 5분**, 필터와 무관 — [metrics-definitions](https://plausible.io/docs/metrics-definitions) |
| **PostHog** | 기본: 1st-party 쿠키 `ph_<project_token>_posthog`(365일) + localStorage에 `distinct_id` — [persistence](https://posthog.com/docs/libraries/js/persistence). 쿠키리스(`cookieless_mode: "always"/"on_reject"`): 서버에서 `hash(team_id, daily_salt, ip_address, user_agent, hostname)` — [cookieless-tracking](https://posthog.com/tutorials/cookieless-tracking) | 무활동 30분 **또는** 최대 24시간 — [sessions](https://posthog.com/docs/data/sessions) | 페이지뷰 1 & 오토캡처 0 & **10초 미만** — [web analytics dashboard](https://posthog.com/docs/web-analytics/dashboard) | 평균 세션 시간(동 문서) | Live 탭: "last few minutes" 이벤트 스트림(알파) — [live](https://posthog.com/docs/web-analytics/live). 정확한 창 크기 [미확인] |
| **Matomo 5** | `_pk_id` 1st-party 쿠키 → 없으면 `config_id` = 해시(OS, 브라우저·버전, 플러그인, **IP**, 언어, 인스턴스 솔트, 핑거프린트) — [Settings.php](https://github.com/matomo-org/matomo/blob/5.x-dev/core/Tracker/Settings.php), [FAQ](https://matomo.org/faq/general/faq_21418/). 우선순위 User ID → 쿠키 → config_id | `visit_standard_length = 1800` — [global.ini.php](https://github.com/matomo-org/matomo/blob/5.x-dev/config/global.ini.php) | "페이지뷰가 1회뿐인 방문의 비율" — [lang/en.json](https://github.com/matomo-org/matomo/blob/5.x-dev/lang/en.json) | [미확인](소스 미확인) | 방문자 수 위젯 **3분**(`live_widget_visitor_count_last_minutes = 3`), 실시간 방문 위젯은 **30분·24시간** 집계 — [global.ini.php](https://github.com/matomo-org/matomo/blob/5.x-dev/config/global.ini.php), [Live/Controller.php](https://github.com/matomo-org/matomo/blob/5.x-dev/plugins/Live/Controller.php) |
| **OpenPanel** | 쿠키리스. `deviceId = hash("${ua}:${ip}:${origin}:${salt}")` — [profileId.ts](https://github.com/Openpanel-dev/openpanel/blob/main/packages/common/server/profileId.ts); 솔트는 **매일 00:00 크론**(`'0 0 * * *'`) 교체, current/previous 2개 병행 — [boot-cron.ts](https://github.com/Openpanel-dev/openpanel/blob/main/apps/worker/src/boot-cron.ts), [salt.service.ts](https://github.com/Openpanel-dev/openpanel/blob/main/packages/db/src/services/salt.service.ts) | 무활동 30분(`SESSION_TIMEOUT_MS` 기본 `1000*60*30`) — [session-buffer.ts](https://github.com/Openpanel-dev/openpanel/blob/main/packages/db/src/buffers/session-buffer.ts) | 세션 시작 `is_bounce=true`, `screen_view_count > 1`이면 false — 동 파일 | 세션 duration 컬럼 — 동 파일 | 활성 방문자 = **최근 5분** uniq(profile_id) — [event-buffer.ts](https://github.com/Openpanel-dev/openpanel/blob/main/packages/db/src/buffers/event-buffer.ts); 실시간 화면 **30분** — [realtime.ts](https://github.com/Openpanel-dev/openpanel/blob/main/packages/trpc/src/routers/realtime.ts) |
| **Rybbit 2.9** | `sha256(IP 버킷 + 버전 제거한 UA + (옵션) 일 솔트)` 앞 12자. **솔트는 사이트 설정 `saltUserIds` 옵트인**, 데이터센터 이그레스는 IP를 버킷팅, 인접 지문은 "sticky" 재부착 — [userIdService.ts](https://github.com/rybbit-io/rybbit/blob/master/server/src/services/userId/userIdService.ts) | 무활동 30분 — [definitions.mdx](https://github.com/rybbit-io/rybbit/blob/master/docs/content/docs/(docs)/definitions.mdx) | "한 페이지만 보고 상호작용 없이 떠난 세션 비율" — 동 문서 | 평균 세션 시간 — 동 문서 | 라이브 사용자 = 최근 `minutes`(기본 **5**) 분 distinct user — [getLiveUsercount.ts](https://github.com/rybbit-io/rybbit/blob/master/server/src/api/analytics/getLiveUsercount.ts) |
| **Swetrix** | 쿠키리스. `psid = hash(userAgent + ip + pid + salt)`; **세션 솔트 = 일 단위, 프로필 솔트 = 월 단위** — [salt.service.ts](https://github.com/Swetrix/swetrix/blob/main/backend/apps/cloud/src/analytics/salt.service.ts), [analytics.service.ts](https://github.com/Swetrix/swetrix/blob/main/backend/apps/cloud/src/analytics/analytics.service.ts) | Redis 세션 키 TTL `UNIQUE_SESSION_LIFE_TIME = 1800`초, 활동·하트비트마다 `EXPIRE`로 연장(= 무활동 30분) — [constants.ts](https://github.com/Swetrix/swetrix/blob/main/backend/apps/cloud/src/common/constants.ts), [analytics.service.ts `extendSessionTTL`](https://github.com/Swetrix/swetrix/blob/main/backend/apps/cloud/src/analytics/analytics.service.ts) | 세션 내 pageview `HAVING count() = 1` — [analytics.service.ts](https://github.com/Swetrix/swetrix/blob/main/backend/apps/cloud/src/analytics/analytics.service.ts) | 세션 duration(sdur) 평균 — 동 파일 | 온라인 = 최근 **5분** uniq(psid), pageview·custom_event 기준(`ONLINE_VISITORS_WINDOW_MINUTES = 5`) — 동 파일 |
| **Liwan 1.7** | 일 단위 솔트(설정 시각에 교체). 모드: Accurate(IP+UA+솔트+엔티티), 네트워크 기반(/24·/56 등), Random — [collected-data](https://liwan.dev/collected-data/) | 페이지뷰 간 간격 + 종료 신호, 최대 30분 — 동 문서 | "페이지뷰 1회 세션 비율" — [reports/mod.rs](https://github.com/explodingcamera/liwan/blob/main/src/app/core/reports/mod.rs) | "세션 내 페이지뷰 간 평균 시간" — 동 파일 | [미확인] |
| **Medama** | **해시·쿠키·IP 모두 미사용.** 스크립트 요청의 `Last-Modified`/`If-Modified-Since` 캐시 헤더로 신규/재방문 판정, 매일 리셋 — [unique-visitors](https://oss.medama.io/methodology/unique-visitors) | load/unload 비콘 쌍(Beacon ID는 페이지 로드마다 랜덤) — [metrics](https://oss.medama.io/methodology/metrics) | **5초 미만 체류**(unload 미수신 시 계산 제외) — [bounce-rate](https://oss.medama.io/methodology/bounce-rate) | unload 비콘의 체류 ms — [metrics](https://oss.medama.io/methodology/metrics) | "Real-Time Analytics"(창 [미확인]) |

> 설계 시사점: 우리는 **로그인 사용자(원장)**가 있으므로 "익명 해시 ID + 로그인 후 user_id 스티칭" 구조가 맞다. Umami 3.3.0의 "session identity stitching"([릴리스](https://github.com/umami-software/umami/releases/tag/v3.3.0)), Umami가 `distinctId`를 해시 입력에 넣는 방식([send/route.ts](https://github.com/umami-software/umami/blob/master/src/app/api/send/route.ts)), PostHog의 `identify()`가 참고 모델이다.

### 1.3 기능 유무 매트릭스

범례: ● 있음 / ◐ 부분·유료·클라우드 전용 / ○ 없음 / ? 미확인

| 기능 | Umami 3.4 | Plausible CE | PostHog | Matomo | OpenPanel | Rybbit | Swetrix | Liwan | Medama |
|---|---|---|---|---|---|---|---|---|---|
| 실시간(활성 방문자) | ● | ● | ● (Live, 알파) | ● | ● | ● | ● | ? | ● |
| 세션 목록/세션 상세 | ● (sessions) | ○ | ● | ● (Visits Log·Visitor Profile) | ● | ● | ● | ○ | ○ |
| 여정(Journeys/Paths/Sankey) | ● | ◐ (클라우드 "Funnels and user journeys") | ● | ◐ (Users Flow 유료) | ● (sankey) | ● | ● | ○ | ○ |
| 퍼널 | ● | ◐ (CE 제외) | ● | ◐ (Funnels 유료) | ● | ● | ● | ○ | ○ |
| 목표/커스텀 이벤트·속성 | ● | ● (Goals, Custom Properties) | ● | ● | ● | ● | ● | ● (이벤트) | ◐ (tagged events) |
| 리텐션/코호트 | ● (retention, cohorts) | ○ | ● | ◐ (Cohorts 유료) | ● (retention, cohorts) | ● | ? | ○ | ○ |
| 히트맵 | ● (v3.2.0 클릭·스크롤) | ○ | ● | ◐ (Heatmap & Session Recording 유료) | ? | ○ | ? | ○ | ○ |
| 세션 리플레이 | ● (v3.1.0) | ○ | ● | ◐ (유료) | ● | ● | ◐ (클라우드) | ○ | ○ |
| 웹 바이탈/성능 | ● (performance) | ○ | ● | ◐ (SEO Web Vitals 유료) | ? | ● | ● | ○ | ○ |
| 매출(Revenue) | ● | ◐ (Revenue Goals, CE 제외) | ● | ● (Ecommerce) | ● (revenue 이벤트) | ? | ◐ (클라우드) | ○ | ○ |
| UTM 5종 | ● | ● | ● | ● (캠페인) | ● | ● | ● | ● | ? |
| 진입/이탈 페이지 | ● | ● (+Exit rate) | ● (entry/end paths) | ● | ● | ● | ● | ● | ? |
| 채널 그룹 | ● | ● (GA4 기반) | ● (GA4 유사) | ● (채널 유형 + AI Assistant) | ? | ● | ? | ○ | ○ |
| 지오(국가/지역/도시) | ● | ● | ● (쿠키리스 모드에선 GeoIP 불가) | ● | ● | ● (+위경도) | ● | ● | ◐ (타임존 기반 국가만) |
| 디바이스/브라우저/OS | ● | ● | ● | ● | ● | ● | ● | ● | ● |
| 봇 필터 | ● isbot | ● UA+헤드리스 (+클라우드 DC IP) | ● (SDK 차단 + 쿼리타임 `$virt_is_bot`) | ● DeviceDetector | ● (device-detector 파생 목록) | ● 5계층 | ● isbot+α | ● | ? |
| 세그먼트 저장 | ● | ◐ (Shared Segments) | ● | ● | ● | ● | ? | ○ | ○ |
| 주석(Annotations) | ● (v3.4.0) | ◐ (Shared Annotations) | ● | ● | ? | ● | ? | ○ | ○ |
| 비교(기간 대비) | ● (compare) | ● | ● | ● | ● | ● | ● | ? | ? |
| Search Console 연동 | ○ | ● (검색어) [구현 파일 미확인] | ? | ◐ (Search Engine Keywords Performance 유료) | ● (settings gsc, seo) | ● (gsc) | ● (SEO 탭) | ○ | ○ |
| API/MCP | ● (MCP v3.4.0) | ● (Stats API) | ● | ● | ● (MCP) | ● (MCP) | ● | ? | ● (OpenAPI) |

근거
- Umami 리포트/화면: 소스 디렉터리 `(reports)/attribution·breakdown·funnels·goals·heatmaps·journeys·performance·retention·revenue·utm`, 사이트 화면 `annotations·cohorts·compare·realtime·replays·segments·sessions` [실측, [umami 저장소](https://github.com/umami-software/umami)]. 버전별 추가: 세그먼트·코호트·링크·픽셀 v3.0.0, 보드·세션 리플레이 v3.1.0, 히트맵 v3.2.0, 2FA·신원 스티칭 v3.3.0, 주석·MCP v3.4.0 — [Releases](https://github.com/umami-software/umami/releases).
- Plausible 유료/CE 구분: "Marketing funnels, user journeys, ecommerce revenue goals, SSO and sites API are not available"(CE), CE는 UA 기반 기본 봇 필터, 클라우드는 "~32K data center IP ranges" 제외 — [self-hosted 비교](https://plausible.io/self-hosted-web-analytics); 기능 플래그 목록 — [feature.ex](https://github.com/plausible/analytics/blob/master/lib/plausible/billing/feature.ex).
- PostHog Web Analytics(방문자·조회·세션·세션시간·이탈·경로·진입/종료·아웃바운드·채널·웹바이탈·리텐션) — [dashboard](https://posthog.com/docs/web-analytics/dashboard); 봇 — [managing-bot-traffic](https://posthog.com/docs/web-analytics/managing-bot-traffic).
- Matomo 유료 플러그인 18종(A/B Testing, Cohorts, Crash Analytics, Custom Reports, Form Analytics, Funnels, Heatmap & Session Recording, Media Analytics, Multi Channel Conversion Attribution, Search Engine Keywords Performance, SEO Web Vitals, Users Flow 등) — [plugins.matomo.org/premium](https://plugins.matomo.org/premium).
- OpenPanel 차트 유형 `funnel/retention/conversion/sankey/map` — [constants](https://github.com/Openpanel-dev/openpanel/blob/main/packages/constants/index.ts); 화면 라우트(cohorts, dashboards, events/conversions, groups, insights, pages, profiles, realtime, reports, seo, sessions, settings/gsc) [실측, 저장소 `apps/start/src/routes`]; 세션 리플레이·퍼널·코호트·쿠키리스 기본 — [README](https://github.com/Openpanel-dev/openpanel).
- Rybbit 화면 `bots, dashboards, errors, events, experiments, feature-flags, funnels, globe, goals, gsc, journeys, pages, performance, replay, reports, retention, sessions, users` [실측, 저장소 `client/src/app/[site]`]; 스스로 수행한 감사에서 171건 결함(고위험 22) 공개 — [FEATURE_AUDIT.md](https://github.com/rybbit-io/rybbit/blob/master/FEATURE_AUDIT.md) (셀프호스팅 신뢰도 참고).
- Swetrix 탭 `AskAI, Captcha, Errors, Experiments, FeatureFlags, Funnels, Goals, Journeys, Performance, Profiles, Replays, SEO, Sessions, Traffic` [실측, 저장소 `web/app/pages/Project/tabs`]; 기능 요약 — [README](https://github.com/Swetrix/swetrix).
- Liwan 지표 4종(Views, UniqueVisitors, BounceRate, AvgTimeOnSite)·차원(URL, 진입/이탈 URL, 호스트, 경로, 리퍼러, OS, 브라우저, 모바일, 국가, 도시, UTM) — [reports/mod.rs](https://github.com/explodingcamera/liwan/blob/main/src/app/core/reports/mod.rs).

### 1.4 채널 분류 구현 비교

| 도구 | 방식 | 한국 소스 반영 |
|---|---|---|
| **Plausible** | GA4 소스 카테고리 CSV(원문 그대로) + 자체 추가분. 순서: Cross-network → Paid Shopping → Paid Search(검색소스+유료 medium, 또는 google+`gclid`, bing+`msclkid`) → Paid Social → Paid Video → Display → Paid Other → Organic Shopping → Organic Social → Organic Video → **AI Assistants** → Organic Search → Email → Affiliates → Audio → SMS → Mobile Push → Referral → Direct — [acquisition.ex](https://github.com/plausible/analytics/blob/master/lib/plausible/ingestion/acquisition.ex). source는 `utm_source`/`source`/`ref` 파라미터 우선, 없으면 리퍼러를 RefInspector(Snowplow referer-parser)로 정규화 — [source.ex](https://github.com/plausible/analytics/blob/master/lib/plausible/ingestion/source.ex) | GA4 CSV의 naver/daum/blog·cafe·kin.naver.com/kakao.com 포함. RefInspector는 `search.naver.com`(query 파라미터), `search.daum.net`, `search.nate.com`을 검색엔진으로 인식하나 `m.search.naver.com`은 없음 [실측, `priv/ref_inspector/referers.yml` grep] |
| **PostHog** | GA4 유사 규칙표를 문서화. Paid 판정 = medium이 `cpc,cpm,cpv,cpa,ppc,retargeting` 또는 `paid*` 시작, 또는 `gclid`/`gad_source` 존재. AI 채널: `utm_source`가 AI 목록(chatgpt, claude, gemini, perplexity, copilot) 또는 referring_domain이 AI 목록 — [channel-type](https://posthog.com/docs/data/channel-type) | [channel_definitions.json](https://github.com/PostHog/posthog/blob/master/posthog/models/channel_type/channel_definitions.json)에 naver/daum/kakao.com/blog·cafe.naver.com/m.search.naver.com 포함 [실측 grep] |
| **Umami** | 우선순위: direct(리퍼러·쿼리 없음) → paidAds(`gclid=`, `fbclid`는 아님 — `ad_id=, aid=, dclid=, epik=, gclid=, li_fat_id=, msclkid=, ob_click_id=, pc_id=, rdt_cid=, scid=, ttclid=, twclid=, utm_medium=cpc/paid/paid_social, utm_source=google`) → referral(medium referral/app/link) → affiliate → sms → **llm**(chatgpt.com, claude.ai, copilot.microsoft.com, gemini.google.com, meta.ai, perplexity.ai) → search → social → email → shopping → video → 외부 도메인이면 referral — [getChannelMetrics.ts](https://github.com/umami-software/umami/blob/master/src/queries/sql/getChannelMetrics.ts), [constants.ts](https://github.com/umami-software/umami/blob/master/src/lib/constants.ts) | **SEARCH_DOMAINS에 naver·daum 없음**(baidu, bing, duckduckgo, ecosia, google., msn.com, search.brave.com, yandex.만 있음) → 네이버 검색이 referral로 분류됨 |
| **Rybbit** | UTM의 앱 번들ID(reverse-DNS) 분류 → Direct/Internal → Paid(medium·`gclid`·`gad_source`) × 소스 유형(ai/search/social/video/shopping) → Organic → medium 기반 — [getChannel.ts](https://github.com/rybbit-io/rybbit/blob/master/server/src/services/tracker/getChannel.ts) | 도메인 목록에 `naver.com`, `daum.net`, `kakaotalk.com`, 키워드 `naver`, `daum`, `kakao`, `kakaotalk` 포함 — [const.ts](https://github.com/rybbit-io/rybbit/blob/master/server/src/services/tracker/const.ts) |
| **Matomo** | 리퍼러 유형 상수: Direct Entry=1, Search Engine=2, Website=3, Campaign=6, Social Network=7, **AI Assistant=8** — [Common.php](https://github.com/matomo-org/matomo/blob/5.x-dev/core/Common.php). 목록은 [searchengine-and-social-list](https://github.com/matomo-org/searchengine-and-social-list) | SearchEngines.yml에 Daum(search.daum.net, q), Nate(search.nate.com, q, EUC-KR), Naver(search.naver.com, query). Socials.yml에 Threads(threads.net/l.threads.net/threads.com/l.threads.com)는 있으나 카카오·밴드 없음. AIAssistants.yml: ChatGPT(chatgpt.com, chat.openai.com, labs.openai.com), Claude(claude.ai), Copilot(copilot.microsoft.com), Deepseek(chat.deepseek.com), Gemini(gemini.google.com, bard.google.com), Grok(grok.com, x.com/i/grok), Perplexity(perplexity.ai), Meta AI(meta.ai), NotebookLM, Le Chat, Qwen, Baidu AI, Duck.ai 등 [실측] |
| **OpenPanel** | 리퍼러 사전(type: search/social/email…) — [referrers/index.ts](https://github.com/Openpanel-dev/openpanel/blob/main/packages/common/server/referrers/index.ts) | `search.naver.com`, `image.search.naver.com`, `search.daum.net`, `mail.naver.com`, `mail.daum.net` [실측 grep] |

### 1.5 우리가 복제할 기능 체크리스트

수집(ingest)
- [ ] 페이지뷰: 경로·쿼리(UTM/클릭ID 파싱 후 나머지 제거 옵션)·해시 제외 옵션·title·hostname — Umami tracker `exclude-search`/`exclude-hash` 참고([tracker](https://github.com/umami-software/umami/blob/master/src/tracker/index.ts))
- [ ] SPA 라우트 변경 자동 수집(`history.pushState/replaceState` 래핑 — Umami tracker와 동일 방식)
- [ ] 커스텀 이벤트 + 속성(JSON), interactive/non-interactive 구분(Plausible식 이탈 판정용)
- [ ] 클릭 ID 저장: `gclid, gad_source, fbclid, msclkid, ttclid, twclid, li_fat_id`(Umami 수집 목록) + **한국형 `NaPm`, `n_media…`, `kclid`, `k_campaign…`**(§3)
- [ ] 리퍼러 원문 + 정규화 source + channel(수집 시점에 계산·저장, Plausible 방식)
- [ ] 봇 필터(isbot + 헤드리스 + 데이터센터 IP/ASN + 속도 이상) 후 **별도 테이블에 봇 기록**(Rybbit·PostHog 방식, §8)
- [ ] 지오: Vercel 헤더(국가·ISO 지역·도시·타임존) — IP 원문은 저장하지 않음(§6)
- [ ] 디바이스/브라우저/OS/화면 크기/언어 + **인앱 브라우저 앱 이름**(§4)
- [ ] 방문자 식별: 일 솔트 해시(비로그인) + 로그인 user_id 스티칭, 솔트 current/previous 병행(Plausible·OpenPanel)
- [ ] 세션: 무활동 30분(+최대 24시간 상한 검토, PostHog)
- [ ] 웹 바이탈(LCP/INP/CLS/FCP/TTFB) — Umami는 `lcp, inp, cls, fcp, ttfb` 필드 수집([send/route.ts](https://github.com/umami-software/umami/blob/master/src/app/api/send/route.ts)); Next.js `useReportWebVitals`([analytics.mdx](https://github.com/vercel/next.js/blob/canary/docs/01-app/02-guides/analytics.mdx))
- [ ] 매출 이벤트(금액·통화 KRW·주문ID) — 크레딧 충전/구독 결제 연결

대시보드
- [ ] 실시간: 활성 방문자(최근 5분) + 최근 30분 분 단위 차트 + 실시간 페이지/리퍼러/국가
- [ ] 개요 KPI: 방문자·방문(세션)·페이지뷰·방문당 페이지·이탈률·평균 체류, **이전 기간 대비**
- [ ] 소스: 채널 그룹 / source / 리퍼러 원문 / UTM 5종 / 캠페인
- [ ] 페이지: 인기·진입·이탈 페이지, 이탈률(Exit rate = exits ÷ 해당 페이지 pageviews, Plausible 정의), 페이지 체류, 스크롤 깊이
- [ ] 지오(국가·시도·도시), 디바이스·브라우저·OS·인앱 앱
- [ ] 목표·전환율(= 목표 달성 unique visitor ÷ unique visitor, Plausible 정의)
- [ ] 퍼널(가입 → 첫 생성 → 첫 결제), 여정(Sankey), 리텐션 코호트(주간)
- [ ] 세션 목록·세션 타임라인(로그인 원장 단위)
- [ ] 세그먼트 저장, 주석(배포·광고 집행일), 봇 대시보드
- [ ] Search Console 검색어·페이지 연동(§9)
- [ ] (선택) 히트맵·리플레이는 **Microsoft Clarity로 외주**(무료, §5.9)

---

## 2. GA4 기본 채널 그룹 정의 (2026-09 현행)

출처: [Default channel group — Analytics Help](https://support.google.com/analytics/answer/9756891?hl=en) (원문 HTML을 받아 전문 확인). 문서는 "정의는 참고용이며 시장 변화에 따라 바뀔 수 있다", "대소문자 구분 없음", "편집 불가"라고 명시한다.

### 2.1 AI Assistant 채널 신설 (2026-05-13)

- 공지: "New AI Assistant traffic measurement … Medium: A new "ai-assistant" value is automatically assigned when the referrer matches a recognized AI Assistant / Channel Group: … "AI Assistant" channel / Campaign: … "(ai-assistant)" campaign name" — [What's new in GA, 2026-05-13](https://support.google.com/analytics/answer/9164320?hl=en)
- 채널 설명: "AI Assistant is the channel by which users arrive at your site from sources like ChatGPT, Gemini, Deepseek, Copilot, or Grok. It excludes Google's AI Overviews and AI Mode." 그리고 **Organic Search에 "Google's AI Overviews and AI Mode"가 포함**된다 — [9756891](https://support.google.com/analytics/answer/9756891?hl=en)
- 인식 AI 목록은 공개되지 않음 [미확인] — 업계 보도도 동일 지적([PPC Land](https://ppc.land/google-analytics-adds-ai-assistant-channel-for-chatgpt-gemini-claude/)).
- `utm_source=chatgpt.com`(medium 없음)이 붙은 방문이 AI Assistant로 가는지, 수동 태깅 규칙과의 우선순위 [미확인].

### 2.2 수동(Manual) 트래픽 규칙 — 문서 기재 순서 그대로

`PAID_MEDIUM = ^(.*cp.*|ppc|retargeting|paid.*)$`

| 채널 | 규칙(원문 요지) |
|---|---|
| Direct | Source = `(direct)` AND Medium ∈ (`(not set)`, `(none)`) |
| Cross-network | Campaign Name contains `cross-network` |
| Paid Shopping | (Source ∈ 쇼핑 사이트 목록 OR Campaign Name ~ `^(.*(([^a-df-z]\|^)shop\|shopping).*)$`) AND Medium ~ PAID_MEDIUM |
| Paid Search | Source ∈ 검색 사이트 목록 AND Medium ~ PAID_MEDIUM |
| Paid Social | Source ∈ 소셜 사이트 regex 목록 AND Medium ~ PAID_MEDIUM |
| Paid Video | Source ∈ 비디오 사이트 목록 AND Medium ~ PAID_MEDIUM |
| Display | Medium ∈ (`display`, `banner`, `expandable`, `interstitial`, `cpm`) |
| Paid Other | Medium ~ PAID_MEDIUM |
| Organic Shopping | Source ∈ 쇼핑 목록 OR Campaign name ~ shop 정규식 |
| Organic Social | Source ∈ 소셜 목록 OR Medium ∈ (`social`, `social-network`, `social-media`, `sm`, `social network`, `social media`) |
| Organic Video | Source ∈ 비디오 목록 OR Medium ~ `^(.*video.*)$` |
| Organic Search | Source ∈ `SOURCE_CATEGORY_SEARCH` OR Medium = `organic` |
| **AI Assistant** | Medium = `ai-assistant` (리퍼러가 AI 목록과 일치하면 medium=`ai-assistant`, campaign=`(ai-assistant)` 자동 설정) |
| Referral | Medium ∈ (`referral`, `app`, `link`) |
| Email | Source 또는 Medium = `email\|e-mail\|e_mail\|e mail` |
| Affiliates | Medium = `affiliate` |
| Audio | Medium = `audio` |
| SMS | Source = `sms` OR Medium = `sms` |
| Mobile Push Notifications | Medium ends with `push` OR contains `mobile`·`notification` OR Source = `firebase` |
| (Unassigned) | 어떤 규칙에도 해당하지 않음 / `(other)`는 카디널리티 초과 집계 행 |

- **평가 순서**: GA4 문서는 표 순서가 평가 순서라고 명시하지 않는다 [미확인]. 실무 구현은 Plausible의 순서를 참고(§1.4). 주의: GA4 표에서는 Organic Search가 Organic Video 뒤, AI Assistant가 Organic Search 뒤이지만 Plausible은 AI Assistants를 Organic Search **앞**에 둔다([acquisition.ex](https://github.com/plausible/analytics/blob/master/lib/plausible/ingestion/acquisition.ex)).
- Google Ads(자동 태깅)·DV360·CM360·SA360·Merchant Center 트래픽은 별도 규칙(플랫폼·네트워크·캠페인 유형 기반). SA360 Paid Search 엔진 목록에 **"naver"** 포함 — [9756891](https://support.google.com/analytics/answer/9756891?hl=en).

### 2.3 GA4 소스 카테고리 목록 (원본)

- 다운로드 링크(문서 내): [storage.googleapis.com/support-kms-prod/qn1xhBu8MVcZPIZ2WZMNdI40FtZXFPGYxj2K](https://storage.googleapis.com/support-kms-prod/qn1xhBu8MVcZPIZ2WZMNdI40FtZXFPGYxj2K) — 2026-09-17 기준 **27쪽 PDF**. 집계 [실측]: SOCIAL 592, SEARCH 129, SHOPPING 52, VIDEO 46.
- 동일 목록의 CSV 사본: [plausible/analytics priv/ga4-source-categories.csv](https://github.com/plausible/analytics/blob/master/priv/ga4-source-categories.csv)(카운트 일치 [실측]) — **구현 시 이 CSV를 그대로 가져다 쓰는 것이 가장 싸다.**
- 한국 관련 항목 [실측 grep]

| source | 카테고리 |
|---|---|
| `naver`, `naver.com`, `m.naver.com`, `m.search.naver.com` | SEARCH |
| `daum`, `daum.net` | SEARCH |
| `blog.naver.com`, `m.blog.naver.com`, `cafe.naver.com`, `m.cafe.naver.com`, `kin.naver.com`, `m.kin.naver.com` | SOCIAL |
| `shopping.naver.com`, `m.shopping.naver.com`, `msearch.shopping.naver.com`, `cr.shopping.naver.com`, `cr2.shopping.naver.com` | SHOPPING |
| `kakao`, `kakao.com`, `kakaocorp.com` | SOCIAL |
| `line`, `line.me` | SOCIAL |
| `instagram`, `l.instagram.com`, `facebook`, `l.facebook.com`, `lm.facebook.com`, `m.facebook.com`, `t.co`, `twitter`, `tiktok` | SOCIAL |
| `youtube`, `m.youtube.com` | VIDEO |
| **없음**: `band.us`, `zum`, `nate`, `threads*`, `x.com`, `in.naver.com`, `everytime.kr`, AI 도메인 전부 | — |

- 모순 주의: 채널 설명은 Organic Video 예시로 "YouTube, **TikTok**, or Vimeo"를 들지만, 소스 목록에서 `tiktok`은 **SOCIAL**이다 [실측].

---

## 3. 한국 리퍼러·소스 사전

### 3.1 리퍼러 정책 실측표 (2026-09-17 [실측])

리퍼러로 무엇이 넘어오는지는 **출발 페이지의 Referrer-Policy**가 결정한다. `unsafe-url`/`always` = 전체 URL(쿼리 포함), `strict-origin-when-cross-origin`/`origin` = 도메인만.

| 출발 페이지 | 응답 헤더/메타 | 우리 사이트가 받는 것 |
|---|---|---|
| `search.naver.com`, `m.search.naver.com` 검색결과 | `referrer-policy: strict-origin-when-cross-origin` + 동일 meta | `https://search.naver.com/` 또는 `https://m.search.naver.com/` — **검색어 없음** |
| `blog.naver.com/PostView.naver?...`, `m.blog.naver.com/...` | `referrer-policy: unsafe-url` + `<meta name="referrer" content="always">` | **전체 URL**(blogId·logNo 포함) → 어느 블로그 글에서 왔는지 식별 가능 [추론: 글 본문 링크에 `rel=noreferrer`가 없을 때] |
| `cafe.naver.com` 계열(섹션 페이지) | `referrer-policy: unsafe-url` | 전체 URL 가능성 [게시글 페이지 미측정] |
| `in.naver.com`(인플루언서) | `unsafe-url` + `meta always`, 그러나 페이지 내 링크에 `rel="noreferrer"` 존재 | 링크에 따라 **리퍼러 없음** 가능 |
| `search.daum.net`(PC) | `<meta name="referrer" content="always">` | 전체 URL(`q=` 검색어 포함) |
| `m.search.daum.net` | 정책 없음 → 브라우저 기본값(`strict-origin-when-cross-origin`) [추론] | 도메인만 |
| `www.band.us` | `referrer-policy: unsafe-url` | 전체 URL 가능 |
| `everytime.kr` | `<meta name="referrer" content="origin">` | 도메인만 |
| `pf.kakao.com`(카카오톡 채널 웹) | `<meta name="referrer" content="strict-origin-when-cross-origin">` | 도메인만 |
| `chatgpt.com` | `Referrer-Policy: strict-origin-when-cross-origin` | 도메인만(+ChatGPT가 붙이는 `utm_source`, §3.5) |
| `www.perplexity.ai` | `referrer-policy: strict-origin-when-cross-origin`(PC) | 도메인만 |
| `gemini.google.com` | `<meta name="referrer" content="origin">` | 도메인만 |
| `copilot.microsoft.com` | `<meta name="referrer" content="origin-when-cross-origin">` | 도메인만 |
| `wrtn.ai` | 정책 헤더 없음, 홈 링크에 `rel="noopener noreferrer"` | 링크에 따라 **리퍼러 없음** [대화 화면 미측정] |
| `lm.facebook.com/l.php?u=` (모바일 UA) | 302 → `m.facebook.com/flx/warn/?u=…` 경고 페이지 경유 | 리퍼러가 `m.facebook.com`일 가능성 [추론] |

측정 한계: 로그인 필요 화면(claude.ai 대화, Threads/Instagram 앱 내)은 측정 불가. 앱 내 WebView는 서버 헤더와 무관하게 앱이 리퍼러를 비울 수 있다(§4.3).

### 3.2 네이버

| 신호 | 의미 | 근거 |
|---|---|---|
| 리퍼러 `search.naver.com`, `m.search.naver.com` | 네이버 통합검색(검색어는 전달 안 됨) | [실측] §3.1; GA4 SEARCH 목록 |
| 리퍼러 `blog.naver.com`, `m.blog.naver.com` | 네이버 블로그(GA4는 SOCIAL) | GA4 목록 §2.3 |
| 리퍼러 `cafe.naver.com`, `m.cafe.naver.com` | 네이버 카페(GA4 SOCIAL) | GA4 목록 |
| 리퍼러 `in.naver.com` | 네이버 인플루언서 | [실측] 존재; GA4 목록엔 없음 |
| 리퍼러 `kin.naver.com` | 네이버 지식iN(GA4 SOCIAL) | GA4 목록 |
| 리퍼러 `mail.naver.com` | 네이버 메일 | [RefInspector referers.yml via Plausible](https://github.com/plausible/analytics/tree/master/priv/ref_inspector), [OpenPanel referrers](https://github.com/Openpanel-dev/openpanel/blob/main/packages/common/server/referrers/index.ts) |
| URL 파라미터 **`NaPm`** | **네이버 광고(검색광고 SA·성과형 디스플레이 GFA) 클릭**. 예: `NaPm=ct%3Dltfg01cg%7Cci%3D0za0003w4Ivz9giLF1oB%7Ctr%3Dsa%7Chk%3D…` (디코드: `ct=…|ci=…|tr=sa|hk=…`). **최종 랜딩까지 원문 그대로(인코딩/디코딩 없이) 유지돼야 전환추적이 됨**; 링크 URL에 `?`가 2개이거나 `#`가 있으면 동작 안 함 | [naver/conversion-tracking 01 가이드 FAQ Q1](https://naver.github.io/conversion-tracking/pages/01_script_guide_wcstrans/) |
| `NaPm` 내부 키 `ct`·`ci`·`tr`·`hk` | ct=캠페인 유형 값, ci=캠페인 ID, tr=유입 채널(sa=검색광고), hk=식별 해시 | 2차 출처 [미확인 공식]: [아이보스 Q&A](https://www.i-boss.co.kr/ab-2110-12634). `tr`의 GFA 등 다른 값 [미확인] |
| 자동 추적 URL 파라미터 `n_campaign_type, n_ad_group, n_media, n_ad, n_keyword, n_keyword_id, n_query, n_match, n_rank, n_ad_group_type` (+쇼핑검색 `n_mall_pid, n_mall_id`) | 네이버 검색광고 "자동 추적 URL 파라미터"(광고주가 켜야 함). `n_match`: 1 일치, 2 키워드 확장, 3 연관 검색, 4 일치_유사, 5 스마트블록 | 공식 대행사 공지(2023-09-18) [네이버 원문 미확인]: [가비아CNS 공지](https://m.diad.co.kr/Customer/NoticeView?idx=3165); `n_campaign_type=2`=쇼핑검색 사례 — [뉴스레터](https://maily.so/tumta/posts/2qzplgvwr4x) |
| 1st-party 쿠키 `NA_CO`, `NA_SA`, `NA_SAS`, `NA_SAC`, `NVADID` | `wcs.inflow()`가 광고 유입정보 저장용으로 심는 쿠키로 보임(이름은 wcslog.js 문자열) | [실측] `https://wcs.naver.net/wcslog.js` 정적 분석; 각 쿠키 의미·만료 [미확인] |
| 네이버 봇 UA `Yeti/1.1`, 광고 수집 `Ads-Naver`, 링크 미리보기 `Blueno` | 봇(방문자 집계 제외 대상) | [서치어드바이저 검색로봇 확인 방법](https://searchadvisor.naver.com/guide/seo-basic-firewall) |

### 3.3 다음/카카오

| 신호 | 의미 | 근거 |
|---|---|---|
| 리퍼러 `search.daum.net` | 다음 검색(PC는 검색어 포함 전체 URL) | [실측] §3.1; GA4 `daum.net` SEARCH; RefInspector·Matomo 목록(`q`) |
| 리퍼러 `m.search.daum.net` | 다음 모바일 검색 | [실측] 존재 |
| 리퍼러 `mail.daum.net`, `mail2.daum.net` | 다음 메일 | RefInspector 목록([Plausible priv](https://github.com/plausible/analytics/tree/master/priv/ref_inspector)) |
| 리퍼러 `pf.kakao.com` | 카카오톡 채널 웹 프로필(도메인만 전달) | [실측] |
| 리퍼러 `open.kakao.com` | 오픈채팅 웹(정책 헤더 없음) | [실측] |
| 리퍼러 `kakao.com` 계열 | GA4 `kakao.com` SOCIAL(정확 일치 목록이므로 서브도메인 매칭 여부 [미확인]) | GA4 목록 |
| 리퍼러 `story.kakao.com` | 카카오스토리 — UA 토큰 `KAKAOSTORY/`는 ua-parser-js가 인식 | [ua-parser-js 테스트 데이터](https://github.com/faisalman/ua-parser-js/blob/master/test/data/ua/browser/browser-all.json); 서비스 현황·리퍼러 [미확인] |
| **카카오톡 채팅방 링크** | 네이티브 앱 UI에서 열리므로 **리퍼러 없음이 일반적** | [추론] 출발 문서가 없음; 공식 문서 [미확인]. → **공유 링크엔 반드시 UTM** |
| 파라미터 **`kclid`** | **카카오 클릭 ID**. 모먼트(설정 시)·키워드광고(추적URL 설정 시)에서 자동 부착, 1st-party 쿠키로 저장되어 픽셀 전환과 매칭. **리다이렉트/단축URL/딥링크 랜딩은 미지원** | [카카오 비즈니스 가이드 — kclid](https://kakaobusiness.gitbook.io/main/tool/pixel-sdk/id-kclid), [랜딩 테스트](https://kakaobusiness.gitbook.io/main/ad/moment/intro/run/landingtest) |
| 카카오 키워드광고 추적URL | `utm_source`(매체), `utm_medium=keyword`, `utm_campaign`(프리미엄링크 타입), `utm_term`(검색어), `k_campaign`, `k_adgroup`, `k_media`(`PREMIUM_LINK_SEARCH`/`PREMIUM_LINK_CONTENT`), `k_keyword`, `k_keyword_id`, `k_keyword_type`(0 기본/1 확장), `k_query`, `k_creative`, `k_creativelink`, `k_rank`. 콘텐츠 매체 영역에서는 `utm_term/k_keyword/k_keyword_id/k_keyword_type/k_query` 미제공 | [카카오 고객센터 — 추적 URL은 무엇인가요?](https://cs.kakao.com/helps_html/1073200657?locale=ko), 테스트 URL 예시 `utm_source=kakao&utm_medium=keyword&utm_campaign=PREMIUM_LINK&…&kclid=…` — [키워드광고 광고 만들기](https://kakaobusiness.gitbook.io/main/ad/searchad/keywordad/start) |
| 구 다음 키워드광고 `DMKW`, `DMSKW`, `DMCOL` | 구 시스템 파라미터. **신 카카오 키워드광고는 `k_` 접두 파라미터** | [카카오 데브톡(2021-06-22 답변)](https://devtalk.kakao.com/t/url/116444) |

### 3.4 밴드·에브리타임·SNS·동영상

| 플랫폼 | 리퍼러 호스트 | 비고/근거 |
|---|---|---|
| 네이버 밴드 | `band.us` → `www.band.us` | `unsafe-url` [실측]. GA4 목록에 없음. 앱 내 링크는 인앱 WebView(§4) |
| 에브리타임 | `everytime.kr` | `meta origin` → 도메인만 [실측]. GA4 목록 없음 |
| Instagram | `l.instagram.com`(링크 셰이머), `instagram.com` | GA4 SOCIAL. `l.instagram.com/?u=` 잘못된 u는 instagram.com으로 302 [실측] |
| Threads | `threads.net`, `l.threads.net`, `threads.com`, `l.threads.com` | [Matomo Socials.yml](https://github.com/matomo-org/searchengine-and-social-list/blob/master/Socials.yml); Plausible은 `l.threads.com`→Threads, `threads`→SOCIAL([custom_sources.json](https://github.com/plausible/analytics/blob/master/priv/custom_sources.json), [acquisition.ex](https://github.com/plausible/analytics/blob/master/lib/plausible/ingestion/acquisition.ex)). GA4 목록 없음 |
| Facebook | `l.facebook.com`, `lm.facebook.com`, `m.facebook.com`, `facebook.com` | GA4 SOCIAL. 모바일 `lm.facebook.com/l.php`는 `m.facebook.com/flx/warn/` 경유 [실측] |
| YouTube | `youtube.com`, `m.youtube.com`, `youtube.com/redirect` | GA4 VIDEO |
| TikTok | `tiktok.com` | GA4 SOCIAL(설명과 모순, §2.3). 클릭ID `ttclid`(Umami PAID_AD_PARAMS) |
| X | `t.co`(링크 셰이머), `x.com`, `twitter.com` | GA4엔 `t.co`·`twitter`만; Plausible은 `x.com`→"X (Twitter)"; 클릭ID `twclid` |
| LINE | `line.me` | GA4 SOCIAL |
| 안드로이드 앱 리퍼러 | `android-app://<패키지명>` (예: `android-app://com.reddit.frontpage`) | Plausible이 scheme을 유효 리퍼러로 처리 — [source.ex](https://github.com/plausible/analytics/blob/master/lib/plausible/ingestion/source.ex). 한국 앱 패키지명 매핑 [미확인] |

### 3.5 AI 어시스턴트

| 서비스 | 리퍼러 호스트(구현 목록) | UTM 부착 | 근거 |
|---|---|---|---|
| ChatGPT | `chatgpt.com`, `chat.openai.com`(구) | **`utm_source=chatgpt.com`을 인용 링크에 자동 부착**(2025-06경 "More" 소스까지 확대 보도) | OpenAI Publishers FAQ(원문은 403으로 직접 열람 실패, 검색 스니펫으로 확인): [help.openai.com/12627856](https://help.openai.com/en/articles/12627856-publishers-and-developers-faq); 확대 보도 — [Search Engine Roundtable 2025-06-16](https://www.seroundtable.com/openai-chatgpt-analytics-update-39590.html) |
| Perplexity | `perplexity.ai`, `pplx.ai` | [미확인] | [Plausible custom_sources](https://github.com/plausible/analytics/blob/master/priv/custom_sources.json) |
| Gemini | `gemini.google.com`(구 `bard.google.com`) | [미확인] | Matomo AIAssistants.yml |
| Claude | `claude.ai` | [미확인] | 동상 |
| Microsoft Copilot | `copilot.microsoft.com`, `copilot.com` | [미확인] | Plausible custom_sources |
| DeepSeek | `chat.deepseek.com`, `deepseek.com` | [미확인] | Matomo·Plausible |
| Grok | `grok.com`, `x.com/i/grok`, `x.ai` | [미확인] | Matomo·Plausible |
| Meta AI | `meta.ai` | [미확인] | Umami LLM_DOMAINS, Matomo |
| 뤼튼(wrtn) | `wrtn.ai` | [미확인] — **어떤 OSS 목록에도 없음**, 홈페이지 링크에 `noreferrer` [실측] | — |
| Google AI Overviews / AI Mode | `google.com` | — | GA4는 **Organic Search로 분류**(§2.1) |

- 봇과 구분: `ChatGPT-User`(사용자 요청으로 페이지를 가져가는 에이전트)는 **isbot이 봇으로 판정** [실측] — 사람 클릭 유입과 다르다. PostHog는 AI 에이전트(GPTBot, ClaudeBot, PerplexityBot, ChatGPT-User)를 "측정할 가치가 있는 봇"으로 분리 집계 권장([managing-bot-traffic](https://posthog.com/docs/web-analytics/managing-bot-traffic)).

### 3.6 smoat 권장 분류기 (구현용 초안)

평가 순서(Plausible 순서 + 한국 규칙 삽입). `src`=utm_source 우선, 없으면 리퍼러 호스트.

1. **Paid – Naver**: 쿼리에 `NaPm` 존재 → `Paid Search`(네이버 검색광고; `tr=sa`) / 그 외 `tr` 값은 `Paid Other`로 보류 [미확인]
2. **Paid – Naver auto params**: `n_media`/`n_keyword` 존재 → `Paid Search`
3. **Paid – Kakao**: `kclid` 존재 → `k_media` 있으면 `Paid Search`(키워드), 없으면 `Paid Social`(모먼트) [추론]
4. **Paid – Google**: `gclid`/`gad_source`/`gbraid`/`wbraid` → `Paid Search`
5. **Paid – Meta/TikTok/X/MS/LinkedIn**: `fbclid`+유료 medium → `Paid Social` (**주의: `fbclid`는 오가닉 공유 링크에도 붙는다** — Umami가 `fbclid`를 PAID_AD_PARAMS에서 뺀 이유로 보임 [추론]); `ttclid`, `twclid`, `li_fat_id` → `Paid Social`; `msclkid` → `Paid Search`
6. GA4 manual 규칙(§2.2) — 유료 medium 판정
7. **AI Assistant**: 호스트/`utm_source` ∈ §3.5 목록
8. **Organic Search**: GA4 SEARCH 목록 + `search.naver.com`, `m.search.naver.com`, `search.daum.net`, `m.search.daum.net`, `search.zum.com` [zum 호스트 미확인], `search.nate.com`
9. **Organic Social**: GA4 SOCIAL 목록 + `band.us`, `www.band.us`, `threads.*`, `x.com`, `in.naver.com`, `everytime.kr`, `pf.kakao.com`, `open.kakao.com`, `story.kakao.com`
   - 하위 소스는 쪼개서 저장: `naver_blog`, `naver_cafe`, `naver_influencer`, `kakao_channel`, `kakao_openchat`, `band`, `everytime`, `instagram`, `threads`, `facebook`, `x`
10. Organic Video / Email / SMS / Push / Affiliate / Referral(외부 도메인) / Direct
11. **Direct 보정**: 리퍼러 없음 + UA가 인앱(카카오톡 등) → `Direct (in-app: KakaoTalk)`처럼 **인앱 앱명을 보조 차원으로 저장**(카카오톡 공유 유입이 Direct에 묻히는 문제 완화)

---

## 4. 인앱 브라우저 User-Agent 토큰

### 4.1 토큰 표

| 앱 | 식별 토큰(부분 문자열) | 예시 UA(발췌) | 근거 |
|---|---|---|---|
| 카카오톡 | `KAKAOTALK` | Android `…Mobile Safari/537.36;KAKAOTALK 2409760` / iOS `…Mobile/15E148 BizWebView KAKAOTALK 9.7.6` | [ua-parser-js 테스트](https://github.com/faisalman/ua-parser-js/blob/master/test/data/ua/browser/browser-all.json), 정규식 `kakao(?:talk\|story)[\/ ]` — [ua-parser.js](https://github.com/faisalman/ua-parser-js/blob/master/src/main/ua-parser.js). 카카오 로그인 문서에 "UserAgent에 KAKAOTALK 포함" 서술(검색 스니펫 확인, [Kakao Login Utilize](https://developers.kakao.com/docs/latest/en/kakaologin/utilize)). 다른 사이트 링크를 거쳐 들어오면 KAKAOTALK가 빠진다는 신고 — [데브톡](https://devtalk.kakao.com/t/useragent/113961) [미확인] |
| 카카오스토리 | `KAKAOSTORY/` | `…Mobile Safari/537.36 KAKAOSTORY/6.8.3_21046` | ua-parser-js 테스트 |
| 네이버 앱 | `NAVER(inapp;` | iOS `…Safari/605.1 NAVER(inapp; search; 720; 10.25.0; 11PRO)` / Android `…Whale/1.0.0.0 Crosswalk/26.90.3.21 Mobile Safari/537.36 NAVER(inapp; search; 1010; 11.11.2)` | ua-parser-js 테스트, 정규식 `(naver)\(.*?(\d+\.[\w\.]+).*\)`. **안드로이드 네이버앱 UA에 `Whale/1.0.0.0`이 들어 있어** 단순 `Whale` 매칭은 오분류 — ua-parser는 `whale(?!.+naver)`로 회피 |
| 다음 앱 | `DaumApps/` (+`DaumDevice/mobile`) | `…Mobile Safari/537.36 DaumApps/7.5.0 DaumDevice/mobile` | ua-parser-js 테스트, 정규식 `(daum)apps[\/ ]` |
| Instagram | `Instagram ` | `…Mobile/15E148 Instagram 142.0.0.22.109 (iPhone12,5; iOS 14_1; …)` | ua-parser-js 테스트, [inapp-spy](https://github.com/shalanah/inapp-spy/blob/main/src/regexAppName.ts) `/\bInstagram/i` |
| Facebook | `FBAN/`, `FBAV/`, `FB_IAB/`, `FB4A`, `FBIOS` | iOS `[FBAN/FBIOS;FBAV/91.0.0.41.73;…]` / Android `[FB_IAB/FB4A;FBAV/35.0.0.48.273;]` | ua-parser-js 정규식 `(?:fban\/fbios\|fb_iab\/fb4a)(?!.+fbav)\|;fbav\/…` |
| Messenger | `FB…/Messenger`, `FB_IAB`/`FBAN`(IABMV 제외) | — | inapp-spy |
| Threads | `Barcelona` | `…Mobile Safari/537.36 Barcelona 355.0.0.39.109 Android (34/14; …)` | inapp-spy `/\bBarcelona/i` 및 [테스트 UA](https://github.com/shalanah/inapp-spy/blob/main/src/tests/mobile.ts). ua-parser-js 2.0.10은 Threads를 이름 없이 "Chrome WebView"로만 인식 [실측] |
| LINE | `Line/` | iOS `…Mobile/15D100 Safari Line/8.4.1` / Android `…Line/6.5.1/IAB` | ua-parser-js; 외부 브라우저 열기 `openExternalBrowser=1` — [burndogfather 정리](https://burndogfather.com/271) |
| 네이버 밴드 | `band` (정확한 형식 [미확인]) | — | 국내 우회 스크립트 정규식에 `band` 포함 — [burndogfather](https://burndogfather.com/271) [2차 출처] |
| 에브리타임 | `everytimeapp` (정확한 형식 [미확인]) | — | 동상 정규식 `everytimeapp` [2차 출처] |
| ZUM 앱 | `zumapp` [미확인] | — | 동상 |
| TikTok | `musical_ly`, `trill_`, `BytedanceWebview`, `AppName/musical_ly` | `…Mobile/15E148 musical_ly_21.1.0 JsSdk/2.0 … BytedanceWebview/d8a21c6` | ua-parser-js 정규식 `(?:musical_ly\|trill)(?:.+app_?version\/\|_)`, inapp-spy `/musical_ly\|Bytedance/i` |
| Snapchat | `Snapchat/` | `…Mobile/15E148 Snapchat/12.33.0.36 (like Safari/…)` | ua-parser-js |
| WeChat | `MicroMessenger/` | `…MicroMessenger/6.3.6 NetType/WIFI Language/zh_CN` | ua-parser-js |
| X(Twitter) | `Twitter for iPhone`, `Twitter for Android` [2차] | — | [useragent.in](https://useragent.in/in-app-browser-user-agents) |
| LinkedIn | `[LinkedInApp]` | — | ua-parser-js, inapp-spy |
| WhatsApp | `WA4A/`, `WAiOS/` | — | ua-parser-js, inapp-spy |
| Google 앱 | `GSA/` | — | ua-parser-js |
| **네이버 웨일(인앱 아님)** | `Whale/` (단, `NAVER(` 동반 시 네이버 앱) | `…Chrome/76.0.3809.146 Whale/2.6.90.14 Safari/537.36` | ua-parser-js 테스트 |
| 범용 WebView 판정 | Android `; wv)` / iOS에서 `Safari/` 없음 | — | [inapp-spy regexInApp.ts](https://github.com/shalanah/inapp-spy/blob/main/src/regexInApp.ts) |

### 4.2 라이브러리 실측 (ua-parser-js 2.0.10, isbot 5.2.2) [실측]

| UA | isBot | ua-parser browser.name / type |
|---|---|---|
| 카카오톡 Android/iOS | false | `KAKAOTALK` / `inapp` |
| 네이버 앱 iOS | false | `NAVER` / `inapp` |
| 다음 앱 | false | `Daum` / `inapp` |
| Threads | false | `Chrome WebView` / `inapp` (앱 이름 미인식) |
| Instagram | false | `Instagram` / `inapp` |
| Facebook iOS | false | `Facebook` / `inapp` |
| 웨일 데스크톱 | false | `Whale` |
| 네이버 Yeti 봇(`Mozilla/5.0 (compatible; Yeti/1.1; +https://naver.me/spd)`) | **true** | — |
| Daum 봇(예시 UA) | true | — |
| `ChatGPT-User/1.0` | true | — |
| HeadlessChrome | true | `Chrome Headless` |

→ 권장: 서버에서 `ua-parser-js`로 1차 파싱 + **자체 보강 정규식**(Barcelona→Threads, band, everytimeapp) 추가. 브라우저 쪽 정밀 판정이 필요하면 [inapp-spy](https://github.com/shalanah/inapp-spy)(npm 5.0.10).

### 4.3 인앱 브라우저와 리퍼러

- 공식적으로 "인앱 브라우저가 리퍼러를 지운다"고 명시한 1차 문서는 찾지 못함 [미확인].
- 원리상 **채팅방·DM·앱 피드의 링크를 탭해 WebView가 새로 열리면 출발 웹 문서가 없으므로 `document.referrer`는 빈 값** [추론]. 카카오톡 공유 유입이 Direct로 잡히는 이유.
- 링크 셰이머를 거치는 경우(`l.instagram.com`, `l.facebook.com`, `t.co`)는 셰이머 도메인이 리퍼러가 될 수 있다 — GA4·Plausible 목록에 셰이머 도메인이 등재된 것이 방증 [추론].
- 대응: ① 우리가 뿌리는 모든 링크(카카오 채널 메시지, 밴드·카페 글, 인스타 프로필)에 **UTM 필수**, ② 첫 문서 요청의 HTTP `Referer` 헤더도 서버에서 함께 기록(클라이언트 `document.referrer`와 교차 검증), ③ 리퍼러 없음 + 인앱 UA면 "Direct(in-app)" 보조 분류(§3.6-11).
- 참고: PIPC 2024-01-31 정책방안은 인앱 브라우저 운영자에게 "이용자가 원하는 브라우저로 열 수 있는 대체 수단" 제공을 권고 — [보도자료](https://www.pipc.go.kr/np/cop/bbs/selectBoardArticle.do?bbsId=BS074&mCode=C020010000&nttId=9888).

---

## 5. 설치 스니펫·이벤트 API·CSP 도메인·Next.js 통합

### 5.0 Next.js 16 App Router 공통 원칙

- **`next/script` 전략**: `beforeInteractive`(루트 레이아웃에서만, head에 주입), `afterInteractive`(**기본값**, 일부 하이드레이션 후), `lazyOnload`(유휴 시간), `worker`(실험적) — [script.mdx](https://github.com/vercel/next.js/blob/canary/docs/01-app/03-api-reference/02-components/script.mdx). 분석/픽셀은 `afterInteractive`가 표준.
- **인라인 스크립트는 `id` 속성 필수**("An `id` property must be assigned for inline scripts") — [scripts.mdx](https://github.com/vercel/next.js/blob/canary/docs/01-app/02-guides/scripts.mdx).
- **CSP nonce**: Next.js 16은 `proxy.ts`(구 middleware)에서 요청마다 nonce 생성 → `Content-Security-Policy` 헤더와 `x-nonce` 헤더 설정 → Next가 렌더 시 자동으로 번들·`<Script nonce>`에 부착. **nonce를 쓰면 해당 페이지는 동적 렌더링이어야 함** — [content-security-policy.mdx](https://github.com/vercel/next.js/blob/canary/docs/01-app/02-guides/content-security-policy.mdx). 버전: next 16.3.5(2026-09-11, [npm](https://www.npmjs.com/package/next)).
- **`@next/third-parties/google`**(16.3.5): `<GoogleTagManager gtmId>`, `sendGTMEvent()`, `<GoogleAnalytics gaId>`, `sendGAEvent('event', name, params)` — 스크립트를 하이드레이션 후 로드 — [third-party-libraries.mdx](https://github.com/vercel/next.js/blob/canary/docs/01-app/02-guides/third-party-libraries.mdx).
- **SPA 라우트 변경 페이지뷰 — 도구별 자동 여부**

| 도구 | 라우트 변경 자동 수집 | 수동 호출 시 주의 | 근거 |
|---|---|---|---|
| GA4(gtag) | ● Enhanced measurement "Page changes based on browser history events" 켜면 자동 | 수동이면 `send_page_view:false` + 해당 옵션 끄기(중복 방지). **GTM 사용 시엔 GA 자동 history 추적을 켜지 말 것**(중복) | [GA4 SPA](https://developers.google.com/analytics/devguides/collection/ga4/single-page-applications), [views](https://developers.google.com/analytics/devguides/collection/ga4/views?client_type=gtag) |
| Meta Pixel | ● 기본으로 History API 리스너가 `pushState`마다 PageView 발사 | 수동 PageView를 또 보내면 중복. 끄려면 `fbq.disablePushState = true`(Meta는 비권장) | [Meta 개발자 블로그 2017](https://developers.facebook.com/ads/blog/post/2017/05/29/tagging-a-single-page-application-facebook-pixel/) |
| 네이버(wcslog) | 자동 여부 [미확인] — `wcs_do()`가 PV 전송 함수 | 라우트 변경마다 `wcs_do()` 호출이 일반적 [추론]. wcslog.js는 `document.referrer`·`location.href`를 매 호출 시 읽음, `wcs.setReferer()` 함수 존재 [실측 정적 분석] | [naver/conversion-tracking](https://naver.github.io/conversion-tracking/pages/01_script_guide_wcstrans/) |
| 카카오픽셀 | [미확인] | 라우트 변경마다 `kakaoPixel(id).pageView()` [추론] | [카카오 픽셀 설치](https://kakaobusiness.gitbook.io/main/tool/pixel-sdk/install) |
| TikTok | [미확인] | `ttq.page()` 재호출 [추론] | — |
| Clarity | [미확인] | — | — |

- 권장 구조: 루트 레이아웃에 `'use client'` `<RouteChangeTracker />` 1개(`usePathname`+`useSearchParams`, `Suspense`로 감쌈) → ① 1st-party `/api/collect` 페이지뷰 ② 자동 추적이 **없는** 벤더(네이버·카카오 등)만 수동 호출. GA4·Meta는 자동에 맡긴다. 벤더 SDK는 **동의/환경 플래그로 로드 자체를 게이트**(학생 화면 제외, §7).

### 5.1 Google tag (gtag.js) / GA4

설치(원문) — [gtagjs/install](https://developers.google.com/tag-platform/gtagjs/install)
```html
<!-- Google tag (gtag.js) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=TAG_ID"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());

  gtag('config', 'TAG_ID');
</script>
```
수동 페이지뷰(원문) — [views](https://developers.google.com/analytics/devguides/collection/ga4/views?client_type=gtag)
```js
gtag('config', 'TAG_ID', { send_page_view: false });
gtag('event', 'page_view', { page_title: '<Page Title>', page_location: '<Page Location>' });
```
권장 이벤트(원문 형식) — [GA4 이벤트 레퍼런스](https://developers.google.com/analytics/devguides/collection/ga4/reference/events?client_type=gtag)
```js
gtag("event", "sign_up", { method: "Google" });

// KRW 적용 예 (원문 구조, 값만 치환). value = Σ(price×quantity)
gtag("event", "purchase", {
  transaction_id: "T_12345",
  value: 50000,
  currency: "KRW",
  items: [{ item_id: "CREDIT_5000", item_name: "크레딧 5,000", price: 50000, quantity: 1 }]
});
```
- ID 위치: GA 관리 → 데이터 스트림 → 웹 → 측정 ID(`G-…`) [미확인 경로 표기, 일반 절차].
- 쿠키: `_ga`(2년, 사용자 구분), `_ga_<container-id>`(2년, 세션 상태) — [GA4 cookie usage](https://support.google.com/analytics/answer/11397207?hl=en).
- CSP(원문) — [Tag Platform CSP 가이드](https://developers.google.com/tag-platform/security/guides/csp)
  - `script-src-elem https://www.googletagmanager.com`
  - `img-src https://*.google-analytics.com https://www.googletagmanager.com https://*.g.doubleclick.net https://*.google.com https://*.google.<TLD>`
  - `connect-src https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com https://*.g.doubleclick.net https://*.google.com https://*.google.<TLD> https://pagead2.googlesyndication.com`
  - `frame-src https://www.googletagmanager.com`
- Next.js: `<GoogleAnalytics gaId="G-XYZ" />`를 루트 레이아웃에. "Google Analytics automatically tracks pageviews when the browser history state changes" + Enhanced Measurement 설정 확인 — [third-party-libraries.mdx](https://github.com/vercel/next.js/blob/canary/docs/01-app/02-guides/third-party-libraries.mdx).

### 5.2 Google Tag Manager

원문 — [GTM dataLayer 가이드](https://developers.google.com/tag-platform/tag-manager/datalayer)
```html
<!-- Google Tag Manager -->
<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','GTM-XXXXXX');</script>
<!-- End Google Tag Manager -->
```
- CSP: 컨테이너 태그는 `script-src-elem 'nonce-…'`, `img-src www.googletagmanager.com`, `connect-src www.googletagmanager.com www.google.com`; 미리보기 모드 추가 `style-src https://www.googletagmanager.com https://tagmanager.google.com https://fonts.googleapis.com`, `font-src https://fonts.gstatic.com data:` — [CSP 가이드](https://developers.google.com/tag-platform/security/guides/csp).
- **GTM은 커스텀 HTML 태그 때문에 CSP nonce/`strict-dynamic` 운용이 까다롭다** — 우리는 벤더를 코드로 직접 넣고 GTM은 쓰지 않는 쪽을 권장 [추론].
- Next.js: `<GoogleTagManager gtmId="GTM-XYZ" />`, `sendGTMEvent({ event, value })`, 옵션 `gtmScriptUrl`/`auth`/`preview`/`dataLayerName` — [third-party-libraries.mdx](https://github.com/vercel/next.js/blob/canary/docs/01-app/02-guides/third-party-libraries.mdx).

### 5.3 Google Ads 전환

이벤트 스니펫(원문) — [Google Ads 도움말 7548399](https://support.google.com/google-ads/answer/7548399?hl=en)
```html
<script>
  gtag('event', 'conversion', {
    'send_to': 'AW-CONVERSION_ID/CONVERSION_LABEL',
    'value': 0.0,
    'currency': 'USD',
    'transaction_id': ''
    // 'new_customer': true (선택)
  });
</script>
```
- 클릭 전환(원문 `gtag_report_conversion(url)` 콜백 패턴) — [6331304](https://support.google.com/google-ads/answer/6331304?hl=en). 우리 값: `currency: 'KRW'`.
- 태그는 GA4와 동일 gtag.js에 `gtag('config','AW-XXXXXXXXX')` 추가(일반 절차 [미확인 원문]).
- CSP(원문) — [CSP 가이드](https://developers.google.com/tag-platform/security/guides/csp)
  - `script-src-elem https://www.googleadservices.com https://www.google.com https://www.googletagmanager.com https://pagead2.googlesyndication.com https://googleads.g.doubleclick.net`
  - `img-src https://www.googletagmanager.com https://googleads.g.doubleclick.net https://www.google.com https://pagead2.googlesyndication.com https://www.googleadservices.com https://google.com https://www.google.<TLD>`
  - `connect-src https://pagead2.googlesyndication.com https://www.googleadservices.com https://googleads.g.doubleclick.net https://ad.doubleclick.net https://www.google.com https://google.com https://www.google.<TLD>`
  - `frame-src https://www.googletagmanager.com`

### 5.4 Meta Pixel

베이스 코드(원문) — [Meta Pixel Get Started](https://developers.facebook.com/docs/meta-pixel/get-started)
```html
<script>
  !function(f,b,e,v,n,t,s)
  {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
  n.callMethod.apply(n,arguments):n.queue.push(arguments)};
  if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
  n.queue=[];t=b.createElement(e);t.async=!0;
  t.src=v;s=b.getElementsByTagName(e)[0];
  s.parentNode.insertBefore(t,s)}(window, document,'script',
  'https://connect.facebook.net/en_US/fbevents.js');
  fbq('init', '{your-pixel-id-goes-here}');
  fbq('track', 'PageView');
</script>
<noscript>
  <img height="1" width="1" style="display:none"
       src="https://www.facebook.com/tr?id={your-pixel-id-goes-here}&ev=PageView&noscript=1"/>
</noscript>
```
표준 이벤트 — [Meta Pixel reference](https://developers.facebook.com/docs/meta-pixel/reference), [conversion-tracking](https://developers.facebook.com/docs/meta-pixel/implementation/conversion-tracking)
```js
fbq('track', 'CompleteRegistration', { value: 0, currency: 'KRW' }); // currency·value 선택
fbq('track', 'Lead');
fbq('track', 'InitiateCheckout', { value: 50000, currency: 'KRW', num_items: 1 });
fbq('track', 'Purchase', { value: 50000, currency: 'KRW' });        // Purchase는 currency·value 필수
fbq('track', 'Subscribe', { value: 50000, currency: 'KRW', predicted_ltv: 600000 });
fbq('trackCustom', 'FirstGeneration', { kind: 'worksheet' });
// Conversions API와 중복 제거: 4번째 인자로 eventID
fbq('track', 'Purchase', { value: 50000, currency: 'KRW' }, { eventID: 'order_123' });
```
- 필수/선택 파라미터 원문 요지: Purchase = `currency`·`value` 필수(카탈로그 광고는 `contents`/`content_ids`도), CompleteRegistration·Lead = `currency`·`value` 선택, InitiateCheckout = `content_ids, contents, currency, num_items, value` 선택, Subscribe/StartTrial = `currency, predicted_ltv, value` 선택. `eventID` 4번째 인자 권장(CAPI 병행 시) — [reference](https://developers.facebook.com/docs/meta-pixel/reference).
- ID 위치: Ads Manager → Events Manager — [get-started](https://developers.facebook.com/docs/meta-pixel/get-started).
- **SPA**: 기본 `pushState` 리스너가 PageView 자동 발사, `fbq.disablePushState = true`로 끔 — [Meta 개발자 블로그](https://developers.facebook.com/ads/blog/post/2017/05/29/tagging-a-single-page-application-facebook-pixel/).
- CSP: `script-src https://connect.facebook.net`, `img-src https://www.facebook.com`(베이스 코드의 src 기준). `connect-src https://www.facebook.com` 등 추가 필요 여부 [미확인 — CSP Report-Only로 실측 필요].
- 1st-party 쿠키 `_fbp`/`_fbc` 사용(만료 [미확인]).

### 5.5 네이버 애널리틱스 (analytics.naver.com)

- **광고 전환 스크립트를 이미 넣었어도 네이버 애널리틱스용 스크립트는 별도 설치**가 필요, 두 사이트ID(광고용 `s_…`, 애널리틱스 발급ID)로 **PV 로그가 2개 나가는 것이 정상** — [07 네이버 애널리틱스 설치가이드](https://naver.github.io/conversion-tracking/pages/07_naver_analytics_guide/).
- ID 위치: analytics.naver.com → 사이트 및 권한 관리 → 사이트 등록 → "발급ID"·"스크립트복사" — 동 문서.
- 스크립트 형태(애널리틱스 대시보드 발급본을 사용할 것. 아래는 공식 가이드의 PV 블록 구조) — [01 가이드 2.3](https://naver.github.io/conversion-tracking/pages/01_script_guide_wcstrans/)
```html
<script type="text/javascript" src="//wcs.naver.net/wcslog.js"></script>
<script type="text/javascript">
if (window.wcs) {
  if (!wcs_add) var wcs_add = {};
  wcs_add["wa"] = "발급ID";
  wcs_do(); // PV 전송
}
</script>
```
- 설치 확인: 크롬 확장 "네이버 전환 스크립트 어시스턴트" — [06 가이드](https://naver.github.io/conversion-tracking/pages/06_script_assistant_guide/).
- 전송 방식 [실측 wcslog.js 정적 분석]: 기본 `wcs.transport="beacon"` → `navigator.sendBeacon('https://wcs.naver.com/b')`, 폴백은 `https://wcs.naver.com/m?` 이미지 요청. 서버명 변수 `wcs_SerName="wcs.naver.com"`.
- CSP: `script-src https://wcs.naver.net`, `connect-src https://wcs.naver.com`(beacon), `img-src https://wcs.naver.com`(폴백) [실측 정적 분석 기반, 운영 전 Report-Only 확인].

### 5.6 네이버 광고 공통 전환 스크립트 — **현행: `wcs.trans` (신 스크립트)**

근거 전부: [네이버 광고 웹 전환 추적 Script 설치 가이드 (wcs.trans버전), Version 20260609_01](https://naver.github.io/conversion-tracking/pages/01_script_guide_wcstrans/), [cnv→trans 전환가이드](https://naver.github.io/conversion-tracking/pages/05_cnv_to_trans_guide/)

- 대상: 네이버 검색광고(SA) 프리미엄로그분석, 성과형 디스플레이광고(GFA) 전환추적.
- **신(trans)·구(cnv) 동시 설치 금지**: 같은 전환유형에서 trans 전환이 1번이라도 발생하면 **cnv 전환은 영구 필터링**(되돌릴 수 없음). 테스트 시 `test_add_to_cart`처럼 `test_` 접두 권장. cnv↔trans 매핑 존재: `purchase`, `sign_up`, `add_to_cart`, `lead`, `custom001`.
- 구 스크립트 형태(참고, 쓰지 말 것): `_nasa["cnv"] = wcs.cnv("1","결제 금액"); … wcs_do(_nasa);`

공통 + PV(모든 페이지)
```html
<script type="text/javascript" src="//wcs.naver.net/wcslog.js"></script>
<script type="text/javascript">
if (window.wcs) {
  if (!wcs_add) var wcs_add = {};
  wcs_add["wa"] = "AccountId";   // 네이버공통키(na_account_id), 예: s_로 시작
  wcs.inflow("smoat.co.kr");      // 광고 유입정보 쿠키 도메인(루트 도메인)
  wcs_do();                       // PV
}
</script>
```
전환(행동 완료 시점 권장)
```js
var _conv = {};
_conv.type = "sign_up";          // 회원가입 완료
wcs.trans(_conv);

var _conv = {};
_conv.type = "purchase";         // 구매: type + value 필수
_conv.id = "ORDER_20260917_001"; // 주문번호(권장)
_conv.value = "50000";           // string, 10억 이상은 10억으로 치환(2026-01-01~)
// _conv.currency = "KRW";       // 미지정 시 KRW
_conv.items = [{ id: "CREDIT_5000", name: "크레딧 5000", quantity: 1, payAmount: 50000 }];
wcs.trans(_conv);
```
- 전환유형 24종 + 사용자정의 10종(`custom001`~`custom010`). **광고보고서 제공(O)**: `purchase`, `sign_up`, `add_to_cart`, `schedule`, `add_to_wishlist`, `lead`, `view_content`, `subscribe`, `custom001~010`. 보고서 미제공(X): `begin_checkout`, `save_store`, `inquiry`, `call`, `view_product`, `search`, `share`, `clip_coupon`, `view_item_list`, `about_us`, `staff`, `location`, `promotion`, `add_contact_method`, `opt_in_marketing`, `review`.
- `item.name`에 따옴표가 있으면 스크립트 오류 가능 → 제거 권장.
- smoat 매핑 제안: 가입 `sign_up`, 체험/상담 신청 `lead`, 크레딧 결제·구독 `purchase`(+`subscribe`), 첫 문서 생성 `custom001`.
- ID 위치: 검색광고 → 도구 → 프리미엄 로그 분석 → "네이버공통키" / GFA → 도구 → 전환 추적 관리 / 신청 다음 영업일 메일.
- 전환 누락 1순위 원인: **리다이렉트 중 `NaPm` 소실/인코딩 변형** — Next.js `redirect()`/미들웨어에서 쿼리 보존 필수.
- 문의: NHN Data(공식 설치 아웃소싱) 1877-7035.

### 5.7 카카오 픽셀

근거: [카카오 비즈니스 가이드 — 픽셀 & SDK 설치](https://kakaobusiness.gitbook.io/main/tool/pixel-sdk/install)
```html
<script type="text/javascript" charset="UTF-8" src="//t1.daumcdn.net/kas/static/kp.js"></script>
<script type="text/javascript">
  kakaoPixel('Track ID').pageView();                 // 모든 페이지 권장
  kakaoPixel('Track ID').completeRegistration();     // 회원가입 완료 페이지
  kakaoPixel('Track ID').signUp();                   // 서비스 신청 완료
  kakaoPixel('Track ID').participation();            // 이벤트·프로모션 참여(잠재고객)
  kakaoPixel('Track ID').purchase({
    total_quantity: "1",   // optional
    total_price: "50000",  // optional
    currency: "KRW",       // optional, 기본 KRW
    products: [{ id: "CREDIT_5000", name: "크레딧 5000", quantity: "1", price: "50000" }]
  });
</script>
```
- 표준 이벤트 16종: `pageView, appLaunch, search, viewContent, login, completeRegistration, addToCart, addToWishList, viewCart, purchase, participation, preparation, tutorial, missionComplete, signUp, appInstall`. 각 이벤트에 `('태그값')` 인자로 태그 추가 가능. **전환 보고서 집계 대상**: completeRegistration, addToCart, addToWishList, viewCart, purchase, participation, preparation, tutorial, missionComplete, signUp, appInstall — 동 문서.
- ID 위치: 비즈니스 관리자센터 → 서비스/도구 → 픽셀 & SDK(Track ID) — 동 문서. 검수: [카카오 픽셀 헬퍼](https://kakaobusiness.gitbook.io/main/tool/pixel-sdk/pixel-helper).
- `kclid` 사용 시 **리다이렉트 없는 직랜딩** 필수(§3.3).
- CSP [실측, kp.js 정적 분석 2026-09-17]: `script-src https://t1.daumcdn.net`; 코드 내 엔드포인트 `https://bc.ad.daum.net/bc`, `https://bc.ds.kakao.com/bc`, `https://acid-api.ds.kakao.com/acid` → `connect-src`/`img-src` 후보; 3rd-party 쿠키 동기화 `https://t1.kakaocdn.net/kas/static/third-party/cookie/ct2.html` → `frame-src` 후보. 실제 사용 경로는 Report-Only로 확인 필요.

### 5.8 TikTok Pixel

- 베이스 코드 로더(원문 발췌, TikTok 공식 WordPress 플러그인 `tiktok-for-business` 소스) — [plugins.svn.wordpress.org/tiktok-for-business/trunk/pixel/Tt4b_Pixel_Class.php](https://plugins.svn.wordpress.org/tiktok-for-business/trunk/pixel/Tt4b_Pixel_Class.php)
```html
<script>
!function (w, d, t) {
  w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie"],ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e},ttq.load=function(e,n){var i="https://analytics.tiktok.com/i18n/pixel/events.js";ttq._i=ttq._i||{},ttq._i[e]=[],ttq._i[e]._u=i,ttq._t=ttq._t||{},ttq._t[e]=+new Date,ttq._o=ttq._o||{},ttq._o[e]=n||{};var o=document.createElement("script");o.type="text/javascript",o.async=!0,o.src=i+"?sdkid="+e+"&lib="+t;var a=document.getElementsByTagName("script")[0];a.parentNode.insertBefore(o,a)};
  ttq.load('PIXEL_ID');
  ttq.page();
}(window, document, 'ttq');
</script>
```
  (플러그인 원문에는 `ttq._partner="WordPress"` 지정이 들어 있으나 직접 설치 시 불필요 [추론]. Events Manager 발급 최신본은 `holdConsent/grantConsent` 등 메서드가 더 있을 수 있음 [미확인] — **실제 설치는 Events Manager 발급 코드를 사용**.)
- 표준 이벤트(2026-04 갱신): `AddPaymentInfo, AddToCart, AddToWishlist, ApplicationApproval, CompleteRegistration, Contact, CustomizeProduct, Download, FindLocation, InitiateCheckout, Purchase, Schedule, Search, StartTrial, SubmitApplication, SubmitForm, Subscribe, ViewContent` (`CompletePayment` → `Purchase` 권장) — [TikTok standard events](https://ads.tiktok.com/help/article/standard-events-parameters).
- 호출 예(구조 [추론]): `ttq.track('CompleteRegistration')`, `ttq.track('Purchase', { value: 50000, currency: 'KRW', contents: [...] })`.
- CSP: `script-src https://analytics.tiktok.com`; 수집 엔드포인트 도메인 [미확인].

### 5.9 Microsoft Clarity (무료 히트맵·세션 리플레이)

- 스니펫(원문, Microsoft 공식 WordPress 플러그인 소스) — [microsoft-clarity/clarity.php](https://plugins.svn.wordpress.org/microsoft-clarity/trunk/clarity.php)
```html
<script type="text/javascript">
  (function(c, l, a, r, i, t, y) {
    c[a] = c[a] || function() { (c[a].q = c[a].q || []).push(arguments) };
    t = l.createElement(r); t.async = 1; t.src = "https://www.clarity.ms/tag/" + i;
    y = l.getElementsByTagName(r)[0]; y.parentNode.insertBefore(t, y);
  })(window, document, "clarity", "script", "PROJECT_ID");
</script>
```
  (플러그인은 `?ref=wordpress`를 덧붙임. 직접 설치는 대시보드 Settings → Setup → "Get tracking code" 사용 — [clarity-setup](https://learn.microsoft.com/en-us/clarity/setup-and-installation/clarity-setup))
- npm: `@microsoft/clarity`(1.0.2) — `Clarity.init(projectId)`, `Clarity.identify("custom-id", "custom-session-id", "custom-page-id", "friendly-name")`(customId는 클라이언트에서 해시 후 전송), ID는 Clarity 프로젝트 → Settings → Overview — [npm README](https://www.npmjs.com/package/@microsoft/clarity).
- 이벤트/태그 API(원문): `window.clarity("event", "newsletterSignup")`, `window.clarity("set", "experiment", "experiment1")` — [clarity-api](https://learn.microsoft.com/en-us/clarity/setup-and-installation/clarity-api). 마스킹: `data-clarity-mask="true"`, `data-clarity-unmask="true"` — 동 문서.
- CSP(원문): `default-src 'self' https://*.clarity.ms https://c.bing.com 'unsafe-inline'` 또는 개별 `https://www.clarity.ms`, `https://c.bing.com`, `https://[a-z].clarity.ms` — [clarity-csp](https://learn.microsoft.com/en-us/clarity/setup-and-installation/clarity-csp). 수집 요청은 `POST https://www.clarity.ms/collect` — [clarity-setup](https://learn.microsoft.com/en-us/clarity/setup-and-installation/clarity-setup).
- 쿠키: 1st-party `_clck`(Clarity 사용자 ID), `_clsk`(페이지뷰→세션 연결); 3rd-party `CLID`, `ANONCHK`, `MR`, `MUID`, `SM` — [cookie-list](https://learn.microsoft.com/en-us/clarity/setup-and-installation/cookie-list).
- 동의: 2025-10-31부터 EEA·영국·스위스 방문엔 동의 신호 필수(한국은 해당 없음) — [consent-mode](https://learn.microsoft.com/en-us/clarity/setup-and-installation/consent-mode).
- **주의: "Clarity shouldn't be used on any websites/apps targeting users under the age of 18 globally."** → 학생 앱/학생 리포트 경로(`/r/…`, 학생 허브)에는 로드 금지, 원장용 화면에만 — [clarity-setup](https://learn.microsoft.com/en-us/clarity/setup-and-installation/clarity-setup). 기본적으로 민감 콘텐츠 마스킹, 봇 트래픽 기본 제외 — 동 문서.

### 5.10 X Pixel / LinkedIn Insight Tag (선택)

- X: 공식 도움말 페이지가 402로 열람 불가 → 스니펫·도메인 **[미확인]**. 일반적으로 `static.ads-twitter.com/uwt.js` 로더와 `twq('config', …)`/`twq('event', 'tw-…', {…})` 형식으로 알려져 있으나 원문 대조 필요 — [business.x.com 도움말](https://business.x.com/en/help/campaign-measurement-and-analytics/conversion-tracking-for-websites).
- LinkedIn: 도움말 원문에는 코드가 없고 Campaign Manager에서 복사하도록 안내 — [linkedin.com/help/lms/answer/a418880](https://www.linkedin.com/help/lms/answer/a418880). 도메인(`snap.licdn.com`, `px.ads.linkedin.com`) **[미확인]**.
- 학원 원장 타깃에서 두 매체 우선순위는 낮음 [추론].

### 5.11 CSP 도메인 요약표

| 벤더 | script-src | connect-src | img-src | frame-src | 확실도 |
|---|---|---|---|---|---|
| GA4 | www.googletagmanager.com | *.google-analytics.com, *.analytics.google.com, www.googletagmanager.com, *.g.doubleclick.net, *.google.com, pagead2.googlesyndication.com | *.google-analytics.com, www.googletagmanager.com, *.g.doubleclick.net, *.google.com | www.googletagmanager.com | 공식 |
| Google Ads | www.googleadservices.com, www.google.com, www.googletagmanager.com, pagead2.googlesyndication.com, googleads.g.doubleclick.net | pagead2.googlesyndication.com, www.googleadservices.com, googleads.g.doubleclick.net, ad.doubleclick.net, www.google.com, google.com | www.googletagmanager.com, googleads.g.doubleclick.net, www.google.com, pagead2.googlesyndication.com, www.googleadservices.com, google.com | www.googletagmanager.com | 공식 |
| GTM | nonce 기반 | www.googletagmanager.com, www.google.com | www.googletagmanager.com | — | 공식 |
| Meta | connect.facebook.net | [미확인] | www.facebook.com | — | 부분 |
| 네이버 WCS | wcs.naver.net | wcs.naver.com | wcs.naver.com | — | 실측(정적) |
| 카카오 | t1.daumcdn.net | bc.ad.daum.net, bc.ds.kakao.com, acid-api.ds.kakao.com (후보) | 동 후보 | t1.kakaocdn.net (후보) | 실측(정적) |
| TikTok | analytics.tiktok.com | [미확인] | [미확인] | — | 부분 |
| Clarity | *.clarity.ms, c.bing.com | *.clarity.ms, c.bing.com | *.clarity.ms, c.bing.com | — | 공식 |

→ 운영 절차: `Content-Security-Policy-Report-Only`로 1~2주 위반 보고 수집 → 확정.

---

## 6. Vercel 지오 헤더와 한국 지역 코드

### 6.1 요청 헤더 (원문 요지) — [Vercel Request headers](https://vercel.com/docs/headers/request-headers)

| 헤더 | 내용 |
|---|---|
| `x-vercel-ip-country` | ISO 3166-1 alpha-2 국가 코드 |
| `x-vercel-ip-country-region` | **ISO 3166-2 코드의 지역 부분**(최대 3자, 1단계 행정구역; 2단계가 있으면 덜 구체적인 쪽) → 한국은 `11`, `41`, `42` 등 |
| `x-vercel-ip-city` | 도시명, **비ASCII는 RFC3986 퍼센트 인코딩** → `decodeURIComponent` 필요 |
| `x-vercel-ip-latitude` / `x-vercel-ip-longitude` | 위도/경도(예 `37.7749`, `-122.4194`) |
| `x-vercel-ip-timezone` | IANA 타임존명(예 `America/Chicago`) |
| `x-vercel-ip-postal-code` | 사용자 위치 근처 우편번호 |
| `x-vercel-ip-continent` | 대륙 코드 `AF, AN, AS, EU, NA, OC, SA` |
| `x-forwarded-for` / `x-real-ip` / `x-vercel-forwarded-for` | 클라이언트 공인 IP. Vercel은 **외부에서 온 X-Forwarded-For를 덮어씀**(스푸핑 방지). 프록시를 Vercel 앞에 두면 `x-forwarded-for`는 덮일 수 있으니 `x-vercel-forwarded-for` 사용. 커스텀 XFF는 Enterprise Trusted Proxy 필요 |

- Umami도 Vercel 헤더를 1순위 지오 공급원 중 하나로 읽는다(`x-vercel-ip-country`, `-country-region`, `-city`; 지역은 `country-region` 형식으로 조합, 헤더는 latin1→utf-8 디코드) — [detect.ts](https://github.com/umami-software/umami/blob/master/src/lib/detect.ts).

### 6.2 `@vercel/functions` — [API Reference](https://vercel.com/docs/functions/functions-api-reference/vercel-functions-package)

```ts
import { geolocation, ipAddress } from '@vercel/functions';

export async function POST(request: Request) {
  const geo = geolocation(request);
  // { city, country, flag, countryRegion, region(= Vercel 리전 예 'iad1'), latitude, longitude, postalCode }
  const ip = ipAddress(request);
  // ...
}
```
- 주의: 반환 필드 `region`은 **사용자 지역이 아니라 Vercel 엣지 리전 ID**(`iad1`)이고, 사용자 시도는 `countryRegion` — 동 문서 예시.
- Next.js 15.1+에서는 후처리에 `waitUntil` 대신 `after()`(next/server) 권장 — 동 문서. → `/api/collect`에서 응답 먼저 반환 후 `after()`로 DB 적재.
- 로컬(`next dev`)에서 값이 비는지 [미확인] — 기본값 처리 필수.

### 6.3 ISO 3166-2:KR (현행) vs 행정표준코드(법정동 시도코드)

**두 체계를 섞지 말 것.** Vercel(`x-vercel-ip-country-region`)은 ISO 3166-2 지역 부분을 준다고 문서화되어 있다. 51/52는 **행정안전부 행정표준코드** 변경이다.

| 시도 | ISO 3166-2:KR | 행정표준코드(법정동 앞 2자리) |
|---|---|---|
| 서울특별시 | KR-11 | 11 |
| 부산광역시 | KR-26 | 26 |
| 대구광역시 | KR-27 | 27 |
| 인천광역시 | KR-28 | 28 |
| 광주광역시 | KR-29 | 29 |
| 대전광역시 | KR-30 | 30 |
| 울산광역시 | KR-31 | 31 |
| 세종특별자치시 | **KR-50** | **36** |
| 경기도 | KR-41 | 41 |
| 강원특별자치도 | **KR-42** (2023-11-23 ISO가 "special self-governing province"로 **범주명만 변경**, 코드 유지) | **51** (구 42, 2023-06-11 시행) |
| 충청북도 | KR-43 | 43 |
| 충청남도 | KR-44 | 44 |
| 전북특별자치도 | **KR-45** (ISO 목록은 여전히 "Jeollabuk-do / province" 표기) | **52** (구 45, 2024-01-18 시행) |
| 전라남도 | KR-46 | 46 |
| 경상북도 | KR-47 | 47 |
| 경상남도 | KR-48 | 48 |
| 제주특별자치도 | **KR-49** | **50** |

근거
- ISO 목록·변경 이력(2023-11-23 KR-42 범주 변경) — [Wikipedia ISO 3166-2:KR](https://en.wikipedia.org/wiki/ISO_3166-2:KR) (ISO OBP 원문 [https://www.iso.org/obp/ui/#iso:code:3166:KR](https://www.iso.org/obp/ui/#iso:code:3166:KR)은 403으로 직접 열람 실패).
- 강원특별자치도 행정동·법정동 코드 폐지/신설(2023-06-11 시행) — [행정안전부 공지](https://www.mois.go.kr/frt/bbs/type001/commonSelectBoardArticle.do?bbsId=BBSMSTR_000000000052&nttId=100684). 새 시도코드 51은 첨부 zip 내 수록 [원문 파일 미열람].
- 전북특별자치도 45→52(법정동 `4511110100`→`5211110100`, 시행 2024-01-18) — 공공 변경 데이터 정리본 [bs-koo/areacode](https://github.com/bs-koo/areacode/blob/main/context/%ED%96%89%EC%A0%95%EA%B5%AC%EC%97%AD%EC%BD%94%EB%93%9C/%EC%A0%84%EB%B6%81%ED%8A%B9%EB%B3%84%EC%9E%90%EC%B9%98%EB%8F%84_%EB%B3%80%EA%B2%BD%EB%8D%B0%EC%9D%B4%ED%84%B0.md) [2차 출처, 원문은 [행정표준코드관리시스템](https://www.code.go.kr/stdcode/regCodeL.do)].
- 세종 36(`3611000000`)·제주 50 법정동 코드 — [행정표준코드관리시스템](https://www.code.go.kr/stdcode/regCodeL.do) [세종은 검색 결과로 확인, 제주 50은 원문 대조 필요 [미확인]].
- **Vercel/지오IP 공급자가 실제로 강원에 `42`를 내는지 `51`을 내는지는 [미확인]** → 운영 데이터에서 `x-vercel-ip-country-region` 원값을 로그로 1주 수집해 확정. 매핑 테이블은 두 값을 모두 받아 "강원"으로 정규화.

---

## 7. 한국 법적 요건 — 분석 쿠키·광고 픽셀

### 7.1 법령·지침 체계

- **개인정보 보호법 제30조 제1항** 처리방침 필수 기재사항 중 **제7호 "인터넷 접속정보파일 등 개인정보를 자동으로 수집하는 장치의 설치·운영 및 그 거부에 관한 사항(해당하는 경우에만 정한다)"** — 작성지침 수록 조문, [개인정보 처리방침 작성지침(2025.4.) PDF](https://www.privacy.go.kr/front/bbs/bbsView.do?bbsNo=BBSMSTR_000000000049&bbscttNo=20806). 관계법령: 법 제30조·시행령 제31조 — [작성지침 2026.4.](https://www.privacy.go.kr/front/bbs/bbsView.do?bbsNo=BBSMSTR_000000000049&bbscttNo=20885).
- **개인정보 처리방침 작성지침 최신판 = 2026.4.** (2026-04-24 게시; 개정 이력: '20.12 발간 → '22.3 업종별(일반형·의료·**학원**·여행·공공) → '24.4 통합본 → '25.4 현행화 → '26.4 조건부 유형화 허용·변경사항 안내 방식 개선·생성형 AI 부록 신설) — [privacy.go.kr 2026 작성지침](https://www.privacy.go.kr/front/bbs/bbsView.do?bbsNo=BBSMSTR_000000000049&bbscttNo=20885). 같은 게시판에 "개인정보 처리방침 표준(안)(2026.2.)"도 있음 — [안내서 목록](https://www.privacy.go.kr/front/bbs/bbsList.do?bbsNo=BBSMSTR_000000000049).
- **맞춤형 광고 행태정보 정책 방안(PIPC, 2024-01-31)** — [보도자료](https://www.pipc.go.kr/np/cop/bbs/selectBoardArticle.do?bbsId=BS074&mCode=C020010000&nttId=9888)
  - 광고 매체 사업자(웹·앱 운영자 = 우리)에게: 제3자가 수집해 가는 행태정보를 **웹·앱별로 분리해 처리방침에 포함하도록 권고**, 개인정보 보호책임자가 **행태정보 수집도구 현황을 주기적으로 파악·점검**.
  - 주 이용자가 **만 14세 미만 아동**인 웹·앱은 맞춤형 광고 목적의 행태정보 수집도구를 **설치하지 않도록** 권고(요약 [2차 출처](https://intothesec.com/100)).
  - 성격: **권고·가이드라인**(구속력 있는 법령 아님). 민관협의체 구성 후 "개정된 맞춤형 광고 가이드라인을 연말에 발표할 예정"이라 했으나, **2026-09 현재 privacy.go.kr 안내서 목록 1쪽에서 개정 "맞춤형 광고 가이드라인" 게시를 확인하지 못함** [미확인 — 2쪽 이후·pipc.go.kr 추가 확인 필요].
  - 참고: 2017년 방통위 「온라인 맞춤형 광고 개인정보보호 가이드라인」이 기존 기준 — [KMCC](https://kmcc.go.kr/user.do?boardId=1099&boardSeq=44473&dc=30700&mode=view&page=A02030700).
  - 2023년 초안(비로그인 사이트도 첫 접속 시 동의, 유효기간 1/3/6개월)은 보도로만 존재하고 확정되지 않음 — [디지털투데이 2023-07-13](https://www.digitaltoday.co.kr/news/articleView.html?idxno=481585).

### 7.2 "옵트인 쿠키 배너가 필수인가?" — 결론

| 상황 | 동의 필요성 | 근거 |
|---|---|---|
| 1st-party 분석(쿠키 없음, 일 솔트 해시, IP 미저장, 개인 식별 안 함) | 법정 동의 **불필요로 보는 것이 지침 체계와 합치** [추론]. 처리방침에 자동수집장치 기재는 "해당하는 경우" 필수 | 법 제30조①7호; 작성지침 14항 |
| 제3자 픽셀(GA4·Meta·카카오·네이버)이 **개인을 식별하지 않고** 행태정보 수집 | 동의 **의무 명시 없음**(권고: 처리방침에 6개 항목 안내) | 2024-01-31 정책방안; 작성지침 15항 "해당시 권장" |
| **로그인 사용자 ID·이메일(해시 포함)과 결합**해 행태정보 처리(예: 픽셀 고급매칭, CAPI로 이메일 해시 전송, Clarity `identify`) | 개인정보 처리 → **적법근거(대표적으로 법 제15조①1호 동의) 필요**, 제3자 제공이면 제17조①1호 동의 | 작성지침 14항 작성예시(법적 근거란에 "제15조제1항제1호(동의)", 제공은 "제17조제1항제1호(동의)") — [2025.4 PDF](https://www.privacy.go.kr/front/bbs/bbsView.do?bbsNo=BBSMSTR_000000000049&bbscttNo=20806). 고급매칭의 "제3자 제공/위탁" 법적 성격 판단은 **법률 자문 필요** [미확인] |
| 만 14세 미만(학생) 대상 화면 | 맞춤형 광고 목적 수집도구 **미설치 권고**; 알고 있는 아동에게 맞춤형 광고 시 법정대리인 동의 | 정책방안; 작성지침 예시 ⑥항 |

→ **smoat 권장**: ① 1st-party 분석은 쿠키리스 해시로 배너 없이 운영 ② 광고 픽셀은 **원장용 공개 페이지·가입/결제 퍼널에만** 로드, 학생 앱·학생 리포트·공유 리포트(`/r/...`)에는 로드 금지 ③ 고급매칭(이메일/전화 해시)은 **동의 받기 전까지 끔** ④ 처리방침에 §7.4 문구 반영 ⑤ 개인정보 보호책임자가 분기 1회 수집도구 목록 점검(정책방안 권고).

### 7.3 처리방침 기재 항목 (작성지침 원문 요지)

- **14. 개인정보 자동 수집 장치의 설치·운영 및 거부에 관한 사항 [해당시 필수]**: 쿠키 등의 개념·활용 목적·수집 방법·거부 방법 기재.
  - 정보주체를 **식별하여** 행태정보 처리 시 — 수집·이용: ① 법적 근거 ② 수집 항목 ③ 수집 방법 ④ 수집 목적 ⑤ 보유·이용 기간 ⑥ 거부 방법 / 제3자 제공: ① 법적 근거 ② 제공받는 자 ③ 제공 항목 ④ 이용 목적 ⑤ 보유·이용 기간.
  - **식별하지 않고** 맞춤형 광고 목적 처리 시 — 안내 **권장**: ① 식별하지 않고 처리한다는 점 ② 수집 항목 ③ 수집 방법 ④ 수집 목적 ⑤ 보유·이용 기간 ⑥ 거부 방법 (제공 시 동일 구조).
  - 회원/비회원을 나눠 두 방식을 모두 쓰면 **둘 다 안내**하는 것이 바람직.
- **15. 자동 수집 장치를 통해 제3자가 행태정보를 수집하도록 허용하는 경우 [해당시 권장]**: ① 자동 수집 장치 명칭 ② 종류 ③ 수집해가는 사업자 ④ 수집해가는 행태정보 ⑤ 목적 ⑥ 거부 방법(웹브라우저·모바일 기기 차단 방법). 2026.4판은 "제3자 자동 수집 장치 설치 현황, 수집 필요성 및 수집 항목 등을 **주기적으로 확인·관리**할 것을 권장" 문장 추가.
- 출처: [작성지침 2026.4. PDF p.62~63](https://www.privacy.go.kr/front/bbs/bbsView.do?bbsNo=BBSMSTR_000000000049&bbscttNo=20885), [2025.4. PDF p.49~56](https://www.privacy.go.kr/front/bbs/bbsView.do?bbsNo=BBSMSTR_000000000049&bbscttNo=20806).

### 7.4 처리방침 문구 템플릿 (작성지침 예시 구조를 smoat에 맞춰 채운 초안 — 법무 검토 전)

> ⚠ `□□`는 확정 필요 값. 실제 도입하는 도구만 남기고 지울 것. 사업자 법인명은 각 사 약관으로 재확인 [미확인].

```markdown
## ○. 개인정보 자동 수집 장치의 설치·운영 및 거부에 관한 사항

① 회사는 서비스 이용 통계 분석과 서비스 개선을 위해 이용자의 웹사이트 이용 정보를
   자동으로 수집하는 장치(쿠키, 브라우저 저장소 및 이와 유사한 기술, 이하 "쿠키 등")를 사용합니다.
② 쿠키는 웹사이트를 운영하는 서버가 이용자의 브라우저에 보내는 소량의 정보로서
   이용자의 컴퓨터 또는 모바일 기기에 저장되며, 웹사이트 접속 시 브라우저에서 서버로 자동 전송됩니다.
③ 회사가 직접 운영하는 이용 통계 분석은 쿠키를 사용하지 않으며, 접속 IP 주소와 브라우저 정보를
   하루 단위로 교체·폐기되는 임의값과 함께 일방향 암호화(해시)하여 방문 횟수를 집계합니다.
   IP 주소 원문은 저장하지 않으며, 개인을 식별하지 않는 방식으로 처리합니다.
   - 수집 항목: 방문 페이지 주소, 유입 경로(리퍼러·캠페인 파라미터), 방문 일시, 브라우저·기기·운영체제 종류,
     화면 크기, 언어, IP 기반 국가·시도·시군구 수준의 대략적 위치
   - 수집 방법: 웹사이트 방문·이용 시 자동 수집
   - 수집 목적: 서비스 이용 통계 분석, 서비스 개선, 부정 이용(봇) 차단
   - 보유·이용 기간: 원시 기록 수집일로부터 □□개월 후 파기(집계 통계는 개인을 알아볼 수 없는 형태로 보관)
④ 로그인한 회원의 경우, 서비스 제공 및 이용 현황 분석을 위해 위 이용 기록을 회원 계정과 연결하여 처리할 수 있으며,
   이는 "처리하는 개인정보 항목"의 [서비스 이용기록]에 포함됩니다.
⑤ 이용자는 브라우저 설정을 통해 쿠키 저장을 허용·차단할 수 있습니다.
   ▶ 크롬(Chrome): 오른쪽 상단 '⋮' > 설정 > 개인정보 보호 및 보안 > 서드파티 쿠키
   ▶ 엣지(Edge): 오른쪽 상단 '…' > 설정 > 쿠키 및 사이트 권한 > 쿠키 및 사이트 데이터 관리 및 삭제
   ▶ 사파리(Safari, iOS): 설정 > Safari > 고급 > 모든 쿠키 차단
   ▶ 삼성 인터넷: 하단 '탭' > 비밀 모드 켜기
   다만 쿠키 저장을 거부할 경우 로그인 유지 등 일부 서비스 이용에 어려움이 있을 수 있습니다.

## ○. 행태정보의 처리 및 거부 등에 관한 사항

① 회사는 온라인 광고의 성과 측정과 관심 기반 광고 제공을 위해, 아래와 같이 개인을 식별하지 않는 방식으로
   행태정보를 처리합니다.
② 회사는 만 14세 미만 아동을 주 이용자로 하는 화면(학생용 화면 등)에는 맞춤형 광고 목적의
   행태정보 수집 도구를 설치하지 않으며, 아동의 행태정보를 맞춤형 광고 목적으로 수집하지 않습니다.
③ 회사는 사상, 신념, 병력 등 민감한 행태정보를 수집하지 않습니다.
④ 이용자는 웹브라우저의 쿠키 설정 변경 등을 통해 맞춤형 광고를 일괄 차단·허용할 수 있습니다.
   (크롬: 설정 > 개인정보 보호 및 보안 > 서드파티 쿠키 차단 / 시크릿 창 사용 등)
⑤ 행태정보 관련 문의·거부권 행사·피해 신고: 개인정보 보호책임자(□□팀, □□@smoat.co.kr, □□-□□□□-□□□□)

## ○. 제3자가 수집해가는 행태정보에 관한 사항

① 회사는 이용자가 웹사이트를 방문하거나 이용하는 경우, 광고 성과 측정과 마케팅을 위해
   아래 사업자가 자동 수집 장치를 통해 행태정보를 수집해가도록 허용하고 있습니다.

| 수집장치 명칭 | 종류 | 수집해가는 사업자 | 수집해가는 행태정보 | 목적 |
|---|---|---|---|---|
| Google 애널리틱스 / Google 태그 | 자바스크립트(웹페이지) | Google LLC | 웹사이트 방문·이용 이력, 브라우저·기기 정보, 쿠키 식별자(_ga 등) | 이용 통계 분석, 광고 성과 측정 |
| Google Ads 전환 태그 | 자바스크립트(웹페이지) | Google LLC | 광고 클릭 정보, 전환(가입·결제) 이력 | 광고 성과 측정·맞춤형 광고 |
| Meta 픽셀 | 자바스크립트(웹페이지) | Meta Platforms, Inc. | 방문·전환 이력, 브라우저 정보, 쿠키 식별자(_fbp 등) | 광고 성과 측정·맞춤형 광고 |
| 네이버 애널리틱스 / 네이버 광고 전환 스크립트 | 자바스크립트(웹페이지) | 네이버㈜ | 방문·전환 이력, 광고 유입 정보 | 이용 통계 분석, 광고 성과 측정 |
| 카카오 픽셀 | 자바스크립트(웹페이지) | ㈜카카오 | 방문·전환 이력, 광고 클릭 식별자(kclid) | 광고 성과 측정·맞춤형 광고 |
| Microsoft Clarity | 자바스크립트(웹페이지) | Microsoft Corporation | 페이지 내 클릭·스크롤·이동 기록(입력값 마스킹), 쿠키 식별자(_clck, _clsk) | 사용성 분석(원장용 화면에 한함) |

② 이용자는 브라우저의 쿠키 설정 변경 등을 통해 제3자가 수집해가는 행태정보를 차단할 수 있습니다.
   ▶ 크롬: ⋮ > 설정 > 개인정보 보호 및 보안 > 서드파티 쿠키 > 서드파티 쿠키 차단
   ▶ 엣지: … > 설정 > 개인정보, 검색 및 서비스 > 추적 방지(균형/엄격) 또는 쿠키 및 사이트 권한 > 타사 쿠키 차단
   ▶ 모든 쿠키 저장 차단: 크롬 '새 시크릿 창', 엣지 '새 InPrivate 창'
```
- 브라우저 차단 경로 문구는 작성지침 부록(쿠키 허용/차단, 제3자 행태정보 차단)을 옮긴 것 — [2026.4 작성지침](https://www.privacy.go.kr/front/bbs/bbsView.do?bbsNo=BBSMSTR_000000000049&bbscttNo=20885).
- GA4 쿠키 `_ga`/`_ga_<id>` 2년 — [GA4 cookie usage](https://support.google.com/analytics/answer/11397207?hl=en); Clarity 쿠키 — [cookie-list](https://learn.microsoft.com/en-us/clarity/setup-and-installation/cookie-list).
- 학원업종 작성지침 존재('22.3 업종별 발간, 2026.4 통합본에 학원 사례 포함) — 원장 회원 데이터 항목은 해당 사례 참고.

---

## 8. 봇 필터링

### 8.1 목록·라이브러리

| 항목 | 현황 | 근거 |
|---|---|---|
| **isbot** (npm) | 5.2.2(2026-08-27), 패턴 207개 [실측 `list.length`], Unlicense, ★1,160. API: `isBot`, `isBotNaive`, `getPattern`, `list`, `findBotMatch(es)`, `findBotPattern(s)`, `createIsBot`, `createIsBotFromList` | [omrilotan/isbot](https://github.com/omrilotan/isbot), [npm](https://www.npmjs.com/package/isbot). **Umami(`isbot ^5.2.2`)·Swetrix가 사용** — [umami package.json](https://github.com/umami-software/umami/blob/master/package.json), [swetrix analytics.service.ts](https://github.com/Swetrix/swetrix/blob/main/backend/apps/cloud/src/analytics/analytics.service.ts) |
| **Matomo DeviceDetector** | LGPL-3.0, ★3,528, 2026-09-17 푸시. Matomo는 `isBot()` 또는 IP 범위로 비인간 판정 | [matomo-org/device-detector](https://github.com/matomo-org/device-detector), [VisitExcluded.php](https://github.com/matomo-org/matomo/blob/5.x-dev/core/Tracker/VisitExcluded.php). OpenPanel은 이 목록에서 봇 목록을 생성(정상 런타임 토큰 제거) — [get-bots.ts](https://github.com/Openpanel-dev/openpanel/blob/main/apps/api/scripts/get-bots.ts) |
| **UAInspector**(Elixir 포트) | Plausible이 `Bot` 결과 + `Headless Chrome` 드롭 | [event.ex](https://github.com/plausible/analytics/blob/master/lib/plausible/ingestion/event.ex) |
| **crawler-user-agents** | MIT, ★1,403 | [monperrus/crawler-user-agents](https://github.com/monperrus/crawler-user-agents) |
| **ai.robots.txt** | AI 크롤러 목록, ★4,124 | [ai-robots-txt/ai.robots.txt](https://github.com/ai-robots-txt/ai.robots.txt) |
| **ua-parser-js** | 2.0.10(2026-05-21), 인앱·헤드리스 인식 | [faisalman/ua-parser-js](https://github.com/faisalman/ua-parser-js) |

### 8.2 기법 (도구별 실제 구현)

1. **UA 패턴**: isbot/DeviceDetector + `HeadlessChrome` — 위 표.
2. **데이터센터 IP/ASN**: Plausible 클라우드는 ~32K DC IP 대역 제외([비교](https://plausible.io/self-hosted-web-analytics)), 코드상 `ip_classification` `"dc_ip"`/`"threat_ip"` 드롭([event.ex](https://github.com/plausible/analytics/blob/master/lib/plausible/ingestion/event.ex)). Rybbit은 **큐레이션된 봇 사업자 ASN은 단독 차단, 일반 호스팅 ASN은 보조 증거로만**(VPN·사내망 오탐 방지) — [bot-detection.mdx](https://github.com/rybbit-io/rybbit/blob/master/docs/content/docs/(docs)/bot-detection.mdx).
3. **헤더 휴리스틱**: 브라우저 헤더 누락, fetch metadata 이상, 브라우저 주장 불일치, 오래된 Chrome 버전 — Rybbit `header_heuristics` — 동 문서.
4. **클라이언트 신호**: `navigator.webdriver` 등 자동화 API, 0/불가능한 창 크기, `800x600`·`1024x768` 기본 뷰포트, SwiftShader 렌더러, 빈 플러그인 목록 → 가중 점수 — Rybbit `client_signals` — 동 문서.
5. **속도 이상**: 동일 IP+UA 이벤트 과다, 동일 IP의 경로 수·UA 수·호스트 수 과다, 단일 UA의 사이트 전체 대량 — Rybbit `rate_anomaly` — 동 문서.
6. **리퍼러 스팸 블록리스트**: Plausible `ReferrerBlocklist.is_spammer?` — [event.ex](https://github.com/plausible/analytics/blob/master/lib/plausible/ingestion/event.ex); Matomo `isReferrerSpamExcluded` — [VisitExcluded.php](https://github.com/matomo-org/matomo/blob/5.x-dev/core/Tracker/VisitExcluded.php).
7. **프리페치 제외**: Matomo `isPrefetchDetected` — 동 파일. (Next.js `<Link>` 프리페치는 우리 수집 스크립트가 JS 실행 기반이면 영향 없음 [추론])
8. **드롭하지 말고 분리 저장**: Rybbit은 봇 이벤트를 별도 테이블(3개월 TTL)에 저장, PostHog는 쿼리 타임 `$virt_is_bot`·`$virt_bot_name`·`$virt_bot_operator`로 분류하고 Bots 탭 제공, 서버 로그를 `$http_log`로 보내 JS 미실행 봇까지 측정 — [Rybbit FEATURE_AUDIT](https://github.com/rybbit-io/rybbit/blob/master/FEATURE_AUDIT.md), [PostHog](https://posthog.com/docs/web-analytics/managing-bot-traffic).
9. **검증된 크롤러 판별(역DNS + IP 목록)**
   - 네이버 Yeti: UA `Mozilla/5.0 (compatible; Yeti/1.1; +https://naver.me/spd)` 또는 Chrome 형 `…(KHTML, like Gecko; compatible; Yeti/1.1; +https://naver.me/spd) Chrome/W.X.Y.Z…`; 역DNS가 `.naver.com`으로 끝나고 정방향 재조회 일치; IP 목록 [naverbot.json](https://searchadvisor.naver.com/doc/naverbot.json) — [검색로봇 확인 방법](https://searchadvisor.naver.com/guide/seo-basic-firewall).
   - Google: 역DNS `crawl-***.googlebot.com`, `geo-crawl-***.geo.googlebot.com`, `rate-limited-proxy-***.google.com`, `***.gae.googleusercontent.com` 등 + IP JSON `common-crawlers.json`, `special-crawlers.json`, `user-triggered-fetchers.json`, `user-triggered-fetchers-google.json`, `user-triggered-agents.json` — [Verify Google requests](https://developers.google.com/crawling/docs/crawlers-fetchers/verify-google-requests).
10. **자기 트래픽 제외**: 스태프 로그인 쿠키/계정 플래그로 제외(Rybbit "hiding own traffic" 문서 존재 — [docs 목록](https://github.com/rybbit-io/rybbit/tree/master/docs/content/docs/(docs))).

[실측] 한국 인앱 UA(카카오톡·네이버·다음·인스타·페북·스레드)는 isbot 5.2.2에서 **모두 false**(오탐 없음), Yeti·Daum 봇·ChatGPT-User·HeadlessChrome은 true — §4.2.

---

## 9. 검색 콘솔 API

### 9.1 Google Search Console API

- **인증**: OAuth 2.0만 지원. 스코프 `https://www.googleapis.com/auth/webmasters`(읽기/쓰기), `https://www.googleapis.com/auth/webmasters.readonly`(읽기) — [Authorize Requests](https://developers.google.com/webmaster-tools/v1/how-tos/authorizing).
- **권한 원칙**: "Your account must have the appropriate Search Console permission on a given property … in order to run searchAnalytics.query you need read permissions on that property." — [Prerequisites](https://developers.google.com/webmaster-tools/v1/prereqs).
- **서비스 계정 운용**: 서비스 계정 이메일(`…@<project>.iam.gserviceaccount.com`, JSON 키의 `client_email`)을 Search Console → 설정 → **사용자 및 권한 → 사용자 추가**로 등록해야 해당 속성에 접근 가능. 등록하지 않으면 403 [2차 출처: [IndexerNow](https://www.indexernow.com/fix/service-account-owner-gsc) 등; Google 1차 문서의 "서비스 계정" 명시 문장은 찾지 못함 → 위 prereqs의 권한 원칙으로 갈음]. ※ "Owner여야 한다"는 주장은 **Indexing API** 요건이며 Search Console API 전체에 일반화하면 안 됨.
- **메서드별 필요 권한/스코프**

| 메서드 | HTTP | 스코프 | 필요 속성 권한 |
|---|---|---|---|
| `searchanalytics.query` | `POST https://www.googleapis.com/webmasters/v3/sites/{siteUrl}/searchAnalytics/query` | readonly 또는 webmasters | 읽기 권한(Restricted 이상) — [query](https://developers.google.com/webmaster-tools/v1/searchanalytics/query), [prereqs](https://developers.google.com/webmaster-tools/v1/prereqs) |
| `sitemaps.list` | `GET …/sites/{siteUrl}/sitemaps` (옵션 `sitemapIndex`) | readonly 또는 webmasters | 읽기 — [sitemaps.list](https://developers.google.com/webmaster-tools/v1/sitemaps/list) |
| `sitemaps.submit` | `PUT …/sites/{siteUrl}/sitemaps/{feedpath}` (본문 없음, 성공 시 빈 응답) | **webmasters(쓰기)만** | **Owner 또는 Full user**(권한표 "Submit sitemap": Owner ✓, Full ✓, Restricted ✗) — [sitemaps.submit](https://developers.google.com/webmaster-tools/v1/sitemaps/submit), [권한표](https://support.google.com/webmasters/answer/2451999?hl=en) |

- `siteUrl` 형식: URL-prefix `https://www.example.com/` 또는 도메인 속성 `sc-domain:example.com`(경로 파라미터이므로 URL 인코딩) — 위 레퍼런스.
- `searchAnalytics.query` 요점: 날짜는 **PT(태평양시) 기준** `YYYY-MM-DD`; `rowLimit` 1–25,000(기본 1,000), `startRow`로 페이징; `type`(web 기본/discover/googleNews/…); `dataState`(`final` 기본, `all`, `hourly_all`); 클릭 수 내림차순(날짜 차원이면 날짜 오름차순); "모든 행을 보장하지 않고 상위 행만 반환" — [query](https://developers.google.com/webmaster-tools/v1/searchanalytics/query).
- 쿼터: Search Analytics 사이트당 1,200 QPM, 사용자당 1,200 QPM, 프로젝트당 40,000 QPM·30,000,000 QPD + 10분/1일 **load quota**(page·query 차원 그룹핑이 가장 비쌈, 기간이 길수록 비쌈, 같은 데이터 재조회 금지); 기타 리소스 사용자당 20 QPS·200 QPM — [Usage Limits](https://developers.google.com/webmaster-tools/limits).
- smoat 메모: 기존 사이트맵 크론 403 사망은 "서비스 계정이 속성 사용자로 추가되지 않음" 또는 "Restricted 권한으로 submit 시도"의 전형 증상 → **Full 이상으로 추가 + webmasters 스코프** 확인.

### 9.2 네이버 서치어드바이저 — API 현황 (2026-09)

| 기능 | 제공 여부 | 근거 |
|---|---|---|
| **IndexNow**(URL 갱신 알림) | **공개 제공**. `GET https://searchadvisor.naver.com/indexnow?url=…&key=…[&keyLocation=…]`, 다건 `POST /indexnow`(JSON: `host`, `key`, `keyLocation`, `urlList`). 응답 403(키 무효)·422(URL·키 불일치)·429(과다 요청). 키는 사이트 루트 파일 등으로 증명 | [페이지 갱신 요청하기](https://searchadvisor.naver.com/guide/indexnow-request), [API Key 생성](https://searchadvisor.naver.com/guide/indexnow-api-key); IndexNow 참여 엔진 목록에 naver 등재 — [indexnow.org searchengines.json](https://www.indexnow.org/searchengines.json), [FAQ](https://www.indexnow.org/faq) |
| **수집요청 API**(URL submit/verify) | **제휴 필요**. 네이버 제휴제안(제휴 구분 "웹사이트-수집요청 API") 승인 후 웹마스터도구에 accessToken 노출, `Authorization: Bearer`로 `https://apis.naver.com/searchadvisor/crawl-request/submit.json`·`verify.json` 호출. 소유확인 필수, TLS 1.2+, 일별 URL 수 제한 | [수집요청 API 명세 및 연동(2025-07-25 갱신)](https://searchadvisor.naver.com/guide/crawl-request-api) |
| 사이트맵 제출 API | **공개 API 없음**(웹마스터도구 화면에서 "요청 > 사이트맵 제출"만) [미확인: 부재를 명시한 문서는 없고, 가이드 전체 목록에서 해당 API 문서를 찾지 못함] | [RSS 및 사이트맵 제출](https://searchadvisor.naver.com/guide/request-feed), 가이드 목록(서치어드바이저 페이지 내 게시글 목록 [실측]) |
| 검색 노출·클릭 데이터 API | **공개 API 없음** [미확인, 위와 동일 기준]. 웹마스터도구 리포트("콘텐츠 노출 및 클릭")로만 확인 | [콘텐츠 노출 및 클릭 가이드](https://searchadvisor.naver.com/guide/report-expose-ctr) |

→ smoat 권장: 새 아티클 발행 시 **IndexNow를 네이버 엔드포인트(또는 `api.indexnow.org` 전역)로 1회 호출**(Bing·Yandex·Seznam 등에도 공유). 네이버 검색 유입 분석은 1st-party 리퍼러(`search.naver.com`)로만 가능(검색어는 전달되지 않음, §3.1).

---

## 부록 A. 구현 착수 전 실측이 필요한 [미확인] 목록

1. Vercel `x-vercel-ip-country-region`이 강원·전북에 `42/45`를 내는지 `51/52`를 내는지 (§6.3)
2. 카카오톡·밴드·에브리타임 인앱에서 링크를 열 때 `document.referrer`와 HTTP `Referer` 실제 값 (§4.3)
3. 밴드·에브리타임 인앱 UA 원문 (§4.1)
4. `NaPm`의 `tr` 값 목록(GFA 등)과 `ct` 의미 (§3.2)
5. Meta·카카오·TikTok 픽셀의 실제 `connect-src`/`img-src` 호출 도메인 — CSP Report-Only 1~2주 (§5.11)
6. 네이버 wcslog·카카오 픽셀·TikTok·Clarity의 SPA 라우트 변경 자동 PV 여부 (§5.0)
7. GA4 AI Assistant 채널의 인식 AI 목록, `utm_source=chatgpt.com` 세션의 최종 채널 (§2.1)
8. PIPC 개정 맞춤형 광고 가이드라인 발간 여부 (§7.1)
9. 픽셀 고급매칭(이메일 해시) 전송의 법적 성격(제3자 제공 vs 위탁) — 법률 자문 (§7.2)
10. 제주 법정동 시도코드 50 원문 대조 (§6.3)

## 부록 B. 주요 출처 목록

- 오픈소스: [Umami](https://github.com/umami-software/umami) · [Plausible](https://github.com/plausible/analytics) · [PostHog](https://github.com/PostHog/posthog) · [Matomo](https://github.com/matomo-org/matomo) · [OpenPanel](https://github.com/Openpanel-dev/openpanel) · [Rybbit](https://github.com/rybbit-io/rybbit) · [Swetrix](https://github.com/Swetrix/swetrix) · [Liwan](https://github.com/explodingcamera/liwan) · [Medama](https://github.com/medama-io/medama) · [Matomo 검색엔진·소셜·AI 목록](https://github.com/matomo-org/searchengine-and-social-list)
- GA4: [기본 채널 그룹](https://support.google.com/analytics/answer/9756891?hl=en) · [새 기능(2026-05-13 AI Assistant)](https://support.google.com/analytics/answer/9164320?hl=en) · [소스 카테고리 PDF](https://storage.googleapis.com/support-kms-prod/qn1xhBu8MVcZPIZ2WZMNdI40FtZXFPGYxj2K) · [gtag 설치](https://developers.google.com/tag-platform/gtagjs/install) · [페이지뷰](https://developers.google.com/analytics/devguides/collection/ga4/views?client_type=gtag) · [SPA](https://developers.google.com/analytics/devguides/collection/ga4/single-page-applications) · [이벤트 레퍼런스](https://developers.google.com/analytics/devguides/collection/ga4/reference/events?client_type=gtag) · [CSP](https://developers.google.com/tag-platform/security/guides/csp) · [GTM dataLayer](https://developers.google.com/tag-platform/tag-manager/datalayer) · [Google Ads 전환 7548399](https://support.google.com/google-ads/answer/7548399?hl=en) · [6331304](https://support.google.com/google-ads/answer/6331304?hl=en) · [GA 쿠키](https://support.google.com/analytics/answer/11397207?hl=en)
- Meta: [Pixel Get Started](https://developers.facebook.com/docs/meta-pixel/get-started) · [Reference](https://developers.facebook.com/docs/meta-pixel/reference) · [Conversion tracking](https://developers.facebook.com/docs/meta-pixel/implementation/conversion-tracking) · [SPA 블로그](https://developers.facebook.com/ads/blog/post/2017/05/29/tagging-a-single-page-application-facebook-pixel/)
- 네이버: [conversion-tracking 가이드(wcs.trans)](https://naver.github.io/conversion-tracking/pages/01_script_guide_wcstrans/) · [cnv→trans](https://naver.github.io/conversion-tracking/pages/05_cnv_to_trans_guide/) · [네이버 애널리틱스 설치](https://naver.github.io/conversion-tracking/pages/07_naver_analytics_guide/) · [저장소](https://github.com/naver/conversion-tracking) · [서치어드바이저 IndexNow](https://searchadvisor.naver.com/guide/indexnow-request) · [수집요청 API](https://searchadvisor.naver.com/guide/crawl-request-api) · [검색로봇 확인](https://searchadvisor.naver.com/guide/seo-basic-firewall) · [자동 추적 파라미터 공지(대행사)](https://m.diad.co.kr/Customer/NoticeView?idx=3165)
- 카카오: [픽셀 설치](https://kakaobusiness.gitbook.io/main/tool/pixel-sdk/install) · [kclid](https://kakaobusiness.gitbook.io/main/tool/pixel-sdk/id-kclid) · [추적 URL 파라미터](https://cs.kakao.com/helps_html/1073200657?locale=ko) · [키워드광고 광고 만들기](https://kakaobusiness.gitbook.io/main/ad/searchad/keywordad/start) · [데브톡 k_ 파라미터](https://devtalk.kakao.com/t/url/116444)
- TikTok: [표준 이벤트](https://ads.tiktok.com/help/article/standard-events-parameters) · [공식 WP 플러그인 소스](https://plugins.svn.wordpress.org/tiktok-for-business/trunk/)
- Microsoft Clarity: [설치](https://learn.microsoft.com/en-us/clarity/setup-and-installation/clarity-setup) · [CSP](https://learn.microsoft.com/en-us/clarity/setup-and-installation/clarity-csp) · [API](https://learn.microsoft.com/en-us/clarity/setup-and-installation/clarity-api) · [쿠키](https://learn.microsoft.com/en-us/clarity/setup-and-installation/cookie-list) · [Consent Mode](https://learn.microsoft.com/en-us/clarity/setup-and-installation/consent-mode) · [npm](https://www.npmjs.com/package/@microsoft/clarity) · [공식 WP 플러그인](https://plugins.svn.wordpress.org/microsoft-clarity/trunk/clarity.php)
- Next.js/Vercel: [third-party-libraries](https://github.com/vercel/next.js/blob/canary/docs/01-app/02-guides/third-party-libraries.mdx) · [scripts](https://github.com/vercel/next.js/blob/canary/docs/01-app/02-guides/scripts.mdx) · [Script API](https://github.com/vercel/next.js/blob/canary/docs/01-app/03-api-reference/02-components/script.mdx) · [CSP](https://github.com/vercel/next.js/blob/canary/docs/01-app/02-guides/content-security-policy.mdx) · [analytics](https://github.com/vercel/next.js/blob/canary/docs/01-app/02-guides/analytics.mdx) · [Vercel Request headers](https://vercel.com/docs/headers/request-headers) · [@vercel/functions](https://vercel.com/docs/functions/functions-api-reference/vercel-functions-package)
- UA/봇: [ua-parser-js](https://github.com/faisalman/ua-parser-js) · [inapp-spy](https://github.com/shalanah/inapp-spy) · [isbot](https://github.com/omrilotan/isbot) · [device-detector](https://github.com/matomo-org/device-detector) · [crawler-user-agents](https://github.com/monperrus/crawler-user-agents) · [ai.robots.txt](https://github.com/ai-robots-txt/ai.robots.txt) · [Google 크롤러 검증](https://developers.google.com/crawling/docs/crawlers-fetchers/verify-google-requests)
- 법·제도: [처리방침 작성지침 2026.4](https://www.privacy.go.kr/front/bbs/bbsView.do?bbsNo=BBSMSTR_000000000049&bbscttNo=20885) · [작성지침 2025.4](https://www.privacy.go.kr/front/bbs/bbsView.do?bbsNo=BBSMSTR_000000000049&bbscttNo=20806) · [PIPC 2024-01-31 보도자료](https://www.pipc.go.kr/np/cop/bbs/selectBoardArticle.do?bbsId=BS074&mCode=C020010000&nttId=9888) · [방통위 2017 가이드라인](https://kmcc.go.kr/user.do?boardId=1099&boardSeq=44473&dc=30700&mode=view&page=A02030700)
- 지역 코드: [ISO 3166-2:KR](https://en.wikipedia.org/wiki/ISO_3166-2:KR) · [행정안전부 강원 코드 변경 공지](https://www.mois.go.kr/frt/bbs/type001/commonSelectBoardArticle.do?bbsId=BBSMSTR_000000000052&nttId=100684) · [행정표준코드관리시스템](https://www.code.go.kr/stdcode/regCodeL.do)
- Search Console: [Authorize](https://developers.google.com/webmaster-tools/v1/how-tos/authorizing) · [Prerequisites](https://developers.google.com/webmaster-tools/v1/prereqs) · [searchanalytics.query](https://developers.google.com/webmaster-tools/v1/searchanalytics/query) · [sitemaps.submit](https://developers.google.com/webmaster-tools/v1/sitemaps/submit) · [sitemaps.list](https://developers.google.com/webmaster-tools/v1/sitemaps/list) · [Usage limits](https://developers.google.com/webmaster-tools/limits) · [권한표](https://support.google.com/webmasters/answer/2451999?hl=en)
- AI 유입: [OpenAI Publishers FAQ](https://help.openai.com/en/articles/12627856-publishers-and-developers-faq) · [SER 2025-06-16](https://www.seroundtable.com/openai-chatgpt-analytics-update-39590.html) · [PPC Land](https://ppc.land/google-analytics-adds-ai-assistant-channel-for-chatgpt-gemini-claude/)
