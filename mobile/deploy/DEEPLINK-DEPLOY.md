# 딥링크 웹서버 배치 가이드 (Android App Links · iOS Universal Links)

이 디렉터리(`mobile/deploy/`)의 두 파일은 **웹서버(www.smoat.co.kr)의 `/.well-known/` 경로에 배치되어야** 앱 딥링크(App Links / Universal Links)가 동작합니다. 다만 이 앱 저장소는 `mobile/` 밖 파일을 수정하지 않는 원칙을 지키므로, 여기서는 **산출물만 생성**하고 실제 배치는 이 문서로 웹 담당에게 위임합니다.

| 파일 | 배치 URL(최종) | 대상 |
| --- | --- | --- |
| `assetlinks.json` | `https://www.smoat.co.kr/.well-known/assetlinks.json` | Android App Links (Digital Asset Links) |
| `apple-app-site-association` | `https://www.smoat.co.kr/.well-known/apple-app-site-association` | iOS Universal Links (AASA, 확장자 없음) |

- 패키지/번들 ID: `kr.co.smoat.student` (`mobile/android/app/build.gradle` applicationId·`mobile/capacitor.config.ts` appId 실측 일치)
- v1 딥링크 범위: **`/g` 및 `/g/*`만** (자동로그인 `https://www.smoat.co.kr/g?ac=<>&sc=<>` 포함). `/t`·`/a`는 autoVerify 대상에서 제외합니다(원장·학부모 브라우저 링크 강탈 방지 — 인앱 도달은 RouteGuard가 허용, 명시적 앱열기는 커스텀 스킴 `smoat://`).
- App Links 매니페스트 intent-filter(host=www.smoat.co.kr, autoVerify=true, /g·/g/\*)와 커스텀 스킴(`smoat://`)은 `mobile/android/app/src/main/AndroidManifest.xml`(U2 소유)에 있습니다. 이 문서는 그 대응 웹서버 측 산출물입니다.

## `assetlinks.json` 지문 출처 (JSON에는 주석을 못 넣어 여기 명기)

`sha256_cert_fingerprints`에 넣은 값은 **이 개발기의 디버그 키스토어에서 직접 재추출**한 것입니다. v1은 사이드로드 APK(디버그 서명)로 딥링크를 검증하기 위한 값입니다.

```
keytool -list -v \
  -keystore "C:/Users/jooye/.android/debug.keystore" \
  -alias androiddebugkey -storepass android -keypass android
```

추출 결과(재추출로 대조 완료):

```
SHA256: 92:21:4B:25:E8:C5:FB:79:56:3C:CE:B4:12:ED:BD:09:2D:A9:A7:A2:F5:CB:18:B2:81:11:55:B4:4C:34:2A:90
```

- `sha256_cert_fingerprints`는 **배열**이므로 지문을 여러 개 병존시킬 수 있습니다(디버그 + Play App Signing 등). 릴리스 전환 시 5장을 참고하십시오.
- `apple-app-site-association`의 `<TEAMID>`는 Apple 개발자 계정 발급 후 **10자리 Team ID**로 치환해야 실동작합니다(현재는 플레이스홀더).

---

## 1. `.well-known` 배치 (서빙 요건 + Next.js/Vercel 예시)

두 파일 모두 다음 조건을 **동시에** 만족해야 검증기가 읽습니다.

- **HTTPS**로 서빙(유효 인증서), 정확히 **HTTP 200**.
- **리다이렉트 금지.** Android 검증기와 Apple 페치는 `.well-known` 파일을 가져올 때 리다이렉트를 따라가지 않습니다. `www.smoat.co.kr` 호스트에서 **직접 200**이 나와야 합니다(apex→www 또는 www→apex 리다이렉트 뒤에 두면 실패 — 4절 참고).
- **Content-Type: `application/json`.**
  - `assetlinks.json`은 `.json` 확장자라 대부분 자동으로 `application/json`이 됩니다.
  - `apple-app-site-association`은 **확장자가 없어** 정적 서빙 시 `application/json`이 보장되지 않습니다 → 반드시 명시적으로 지정해야 합니다.
- **인증 불필요**(공개 접근). 미들웨어/로그인 게이트가 `/.well-known/*`를 가로채지 않도록 예외 처리하십시오.

### 방식 A — App Router 라우트 핸들러 (권장, 가장 견고)

확장자 없는 AASA의 Content-Type 문제와 `public/` 닷폴더 서빙 모호성을 모두 회피합니다. 아래 두 파일을 웹 저장소(`smoat.co.kr` Next.js 앱)에 추가합니다. **JSON 본문은 `mobile/deploy/`의 두 파일이 단일 소스**이므로 그대로 복사하십시오.

`src/app/.well-known/assetlinks.json/route.ts`
```ts
import { NextResponse } from "next/server";

// Android App Links — Digital Asset Links.
// 단일 소스: mobile/deploy/assetlinks.json 을 그대로 복사한다.
const STATEMENTS = [
  {
    relation: ["delegate_permission/common.handle_all_urls"],
    target: {
      namespace: "android_app",
      package_name: "kr.co.smoat.student",
      sha256_cert_fingerprints: [
        "92:21:4B:25:E8:C5:FB:79:56:3C:CE:B4:12:ED:BD:09:2D:A9:A7:A2:F5:CB:18:B2:81:11:55:B4:4C:34:2A:90",
      ],
    },
  },
];

export const dynamic = "force-static"; // 정적 생성 — 요청마다 재실행 불필요

export function GET() {
  // NextResponse.json이 Content-Type: application/json 을 설정한다.
  return NextResponse.json(STATEMENTS);
}
```

`src/app/.well-known/apple-app-site-association/route.ts`
```ts
import { NextResponse } from "next/server";

// Apple Universal Links — AASA. 라우트 핸들러라 확장자 없는 경로도 문제없다.
// 단일 소스: mobile/deploy/apple-app-site-association. <TEAMID>는 발급 후 10자로 치환.
const AASA = {
  applinks: {
    details: [
      {
        appIDs: ["<TEAMID>.kr.co.smoat.student"],
        components: [{ "/": "/g" }, { "/": "/g/*" }],
      },
    ],
  },
};

export const dynamic = "force-static";

export function GET() {
  // AASA는 반드시 application/json — NextResponse.json이 보장한다.
  return NextResponse.json(AASA);
}
```

> 미들웨어(`src/middleware.ts`)가 있다면 `matcher`에서 `/.well-known/*`를 제외하거나, 미들웨어 상단에서 해당 경로를 조기 통과시켜 로그인/리다이렉트에 걸리지 않게 하십시오.

### 방식 B — `public/.well-known/` 정적 파일 + `headers()`

정적 파일을 선호하면 두 파일을 웹 저장소의 `public/.well-known/`에 복사합니다.

```
public/.well-known/assetlinks.json                 (mobile/deploy/assetlinks.json 복사)
public/.well-known/apple-app-site-association       (mobile/deploy/apple-app-site-association 복사)
```

그리고 `next.config.ts`에 `headers()`를 추가해 **AASA의 Content-Type을 강제**합니다. 현재 `next.config.ts`에는 `rewrites()`·`redirects()`만 있고 `headers()`는 없으므로 신설하면 됩니다.

```ts
// next.config.ts — 기존 rewrites()/redirects() 옆에 추가
async headers() {
  return [
    {
      // 확장자 없는 AASA는 정적 서빙 시 application/json이 보장되지 않아 강제 지정.
      source: "/.well-known/apple-app-site-association",
      headers: [{ key: "Content-Type", value: "application/json" }],
    },
    // assetlinks.json은 .json 확장자라 별도 지정 없이도 application/json으로 서빙됨.
  ];
}
```

> 주의: 일부 Next.js 버전은 `public/` 하위 **닷폴더(`.well-known`)** 서빙에 이력이 있습니다. 200/Content-Type이 뜨지 않으면 방식 A(라우트 핸들러)로 전환하십시오. **방식 A가 가장 확실합니다.**

배치 후에는 반드시 2절의 검증을 수행해 실제 200·MIME·무리다이렉트를 확인하십시오.

---

## 2. 검증 (배치 후 필수)

### 2-1. 원시 서빙 확인 (리다이렉트/MIME)

```bash
# 리다이렉트 없이 200 + application/json 이어야 한다.
curl -sSIL https://www.smoat.co.kr/.well-known/assetlinks.json
curl -sSIL https://www.smoat.co.kr/.well-known/apple-app-site-association
# 본문 확인
curl -sS   https://www.smoat.co.kr/.well-known/assetlinks.json
curl -sS   https://www.smoat.co.kr/.well-known/apple-app-site-association
```

- `-I`(HEAD) 응답에 `HTTP/2 200`, `content-type: application/json`이 보이고, `location:`(리다이렉트) 헤더가 **없어야** 합니다.

### 2-2. Android — Google Digital Asset Links API

Google이 파일을 파싱할 수 있는지 확인합니다(브라우저로 열어도 됩니다).

```
https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://www.smoat.co.kr&relation=delegate_permission/common.handle_all_urls
```

- 응답 `statements`에 `kr.co.smoat.student`와 위 SHA256 지문이 그대로 나오면 성공입니다. `maxAge` 필드가 있으면 정상 파싱된 것입니다.

### 2-3. Android — 온디바이스 검증 상태

앱 설치(사이드로드) 후:

```bash
# 도메인 재검증 트리거
adb shell pm verify-app-links --re-verify kr.co.smoat.student

# 검증 상태 조회 — www.smoat.co.kr 가 "verified" 여야 함
adb shell pm get-app-links kr.co.smoat.student
```

- `get-app-links` 출력에서 `www.smoat.co.kr` 옆 상태가 `verified`면 링크 탭 시 앱이 자동으로 열립니다. `none`/`1024`(미검증) 등이면 assetlinks 서빙(2-1/2-2)을 다시 점검하십시오(무리다이렉트·MIME·지문 일치).
- 참고: 검증 실패라도 3절 폴백으로 기능 손실은 없습니다(크롬에서 웹 로그인).

### 2-4. Android — 수동 인텐트 라우팅 테스트

검증과 무관하게 인텐트 라우팅 자체를 확인합니다.

```bash
# App Links(https): 검증 성공 시 앱 자동 오픈, 미검증이면 앱 선택 다이얼로그가 뜰 수 있음
# 주의: URL은 반드시 작은따옴표로 감쌉니다 — 그러지 않으면 기기 셸이 '&'를 백그라운드
# 연산자로 해석해 URL이 '?ac=TEST'에서 잘리고 sc가 유실됩니다(자동로그인 테스트 거짓 실패).
adb shell am start -a android.intent.action.VIEW \
  -c android.intent.category.BROWSABLE \
  -d 'https://www.smoat.co.kr/g?ac=TEST&sc=TEST'

# 커스텀 스킴(smoat://): 검증 여부와 무관하게 항상 앱 오픈 (U2 RouteGuard가 /g로 로드)
adb shell am start -a android.intent.action.VIEW \
  -c android.intent.category.BROWSABLE \
  -d 'smoat://g?ac=TEST&sc=TEST'
```

- 앱이 열려 `/g`가 로드되고, `?ac`·`sc`가 프리필되면 원격 `/g`의 자동로그인 useEffect가 1회 로그인을 수행합니다(셸은 URL만 정확히 loadUrl).

### 2-5. iOS — AASA 확인

- Apple CDN 캐시 확인(배포 후 반영까지 지연 가능):
  ```
  https://app-site-association.cdn-apple.com/a/v1/www.smoat.co.kr
  ```
- macOS/기기에서(앱 설치 후): `swcutil dl -d www.smoat.co.kr`
- `<TEAMID>`가 실제 Team ID로 치환되어 있어야 iOS가 매칭합니다. 치환 전에는 형식 검증만 가능합니다.

---

## 3. 3단 폴백 (딥링크 실패해도 기능 손실 0)

딥링크는 "있으면 좋은" 경로이며, 어느 단계가 실패해도 학생 학습 흐름은 끊기지 않도록 3단으로 설계했습니다.

1. **App Links 검증 성공 → 앱 오픈.** `https://www.smoat.co.kr/g...` 링크 탭 시 스모트 학습 앱이 바로 열리고, `?ac`·`sc`가 있으면 자동로그인됩니다.
2. **검증 실패/미설치 → 크롬에서 `/g` 웹 로그인.** 같은 URL이 브라우저에서 열려 **동일한 자동로그인**이 동작합니다. 앱 대비 기능 손실이 없습니다(원격 `/g`가 단일 소스). 온디바이스 검증이 늦거나 실패해도 학생은 그대로 학습할 수 있습니다.
3. **커스텀 스킴 `smoat://` → 항상 앱 오픈.** 교사 공유 카드의 "앱에서 열기" 버튼 등 명시적 앱 진입에 사용합니다. `smoat://g?ac=A&sc=B` → `https://www.smoat.co.kr/g?ac=A&sc=B`로 정규화되어 로드됩니다(U2 RouteGuard `resolve()`). autoVerify가 필요 없어 assetlinks 상태와 무관하게 항상 동작합니다.

> 정리: **https 링크는 App Links(검증 필요)로 "가능하면" 앱을 열고**, 실패 시 웹으로 자연 폴백하며, **명시적 앱 진입이 필요할 때만 `smoat://`**를 씁니다. `/t`·`/a`는 https autoVerify에서 제외했으므로 브라우저로 열리며, 학생은 앱 내 `/g` 내비게이션으로 도달합니다(RouteGuard 허용목록).

---

## 4. apex(smoat.co.kr) 도메인 관련 주의

- v1 딥링크는 **`www.smoat.co.kr`만** 대상으로 합니다(server.url·매니페스트 host 모두 www).
- 나중에 apex `smoat.co.kr`도 App Links/Universal Links host로 추가하려면 **`https://smoat.co.kr/.well-known/assetlinks.json`과 AASA를 apex 호스트에도 별도 배치**해야 합니다.
- **Android/Apple 모두 `.well-known` 페치 시 리다이렉트를 추종하지 않습니다.** 따라서 `smoat.co.kr → www.smoat.co.kr` 리다이렉트가 걸려 있으면 apex 호스트에 대한 검증은 실패합니다. apex를 지원하려면 리다이렉트 뒤가 아니라 apex에서 **직접 200**으로 같은 파일을 서빙해야 하고, 매니페스트 intent-filter/AASA에도 apex host를 추가해야 합니다.
- v1은 www 단일 호스트로 한정해 이 복잡성을 회피합니다.

---

## 5. 릴리스 전환 체크리스트 (스토어 출시 시)

v1의 assetlinks 지문은 **디버그 키스토어**의 것입니다. Play 스토어 출시 시:

1. **Play App Signing SHA-256 확보.** Play Console → 설정(Setup) → 앱 무결성(App integrity) → 앱 서명 키 인증서(App signing key certificate)의 **SHA-256 지문**을 복사합니다. (Play App Signing을 쓰면 실제 배포 APK는 Google이 재서명하므로, 온디바이스 검증에는 이 지문이 필요합니다.)
2. **`assetlinks.json`의 `sha256_cert_fingerprints` 배열에 Play App Signing SHA-256을 추가**합니다. 필요하면 업로드 키 SHA-256도 함께 넣을 수 있습니다(배열이라 병존 가능).
3. **디버그 지문 제거.** 프로덕션 assetlinks에 디버그 지문을 남겨두면 디버그 서명 APK가 링크를 가로챌 수 있으므로, 공개 출시본에서는 위 디버그 지문(`92:21:...:2A:90`)을 **제거**합니다. (내부 테스트 기간에는 디버그+Play 지문 병존이 편리합니다.)
4. **iOS `<TEAMID>` 치환.** `apple-app-site-association`의 `<TEAMID>`를 실제 10자리 Team ID로 바꾸고 재배포한 뒤, Apple CDN 캐시(2-5)가 갱신되었는지 확인합니다.
5. 배치 후 2절 검증을 다시 수행합니다(특히 `pm get-app-links`가 `verified`인지).

---

## 관련 파일 / 소유권

- 매니페스트 intent-filter(App Links autoVerify /g·/g/\*, 커스텀 스킴 `smoat://`), 커스텀 스킴 정규화 라우팅(`RouteGuardPlugin`·`MainActivity.route()`): `mobile/android/app/src/main/` (U2 소유). 이 문서는 그 웹서버 대응물입니다.
- 스토어 제출 문서(심사 노트·데모 계정 등)는 `mobile/store/`(U8 소유)에서 **이 파일들을 참조만** 하며 재생성하지 않습니다.
- assetlinks/AASA의 JSON 본문 단일 소스는 이 디렉터리의 `assetlinks.json`·`apple-app-site-association`입니다. 웹서버 배치 시 그대로 복사하십시오.
