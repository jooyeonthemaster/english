# 푸시 알림 설정 가이드 — SMOAT 학생 앱 (Android / iOS)

이 문서는 **푸시 알림을 나중에 켜기 위한 준비 가이드**입니다. v1(사이드로드 · 최초 스토어 제출) 범위에서 푸시 알림은 **설치하지 않았습니다.** 아래 절차는 실제로 푸시를 활성화할 때 그대로 따라 하시면 됩니다.

- 대상 패키지: `kr.co.smoat.student`
- 셸 로드 전략: `server.url = https://www.smoat.co.kr/g` (원격 셸, U1 `capacitor.config.ts`)
- 기준 버전: Capacitor 8.4.1 · Android compileSdk/targetSdk 36 · minSdk 24

---

## 0. 스코프 — 지금은 "준비만" 입니다

푸시 알림 플러그인(`@capacitor/push-notifications`)을 **설치하지 않은 상태**를 의도적으로 유지합니다. 이유는 하나입니다. **아무것도 추가하지 않는 것**이 `assembleDebug` 빌드 그린을 **구조적으로** 보장하기 때문입니다.

- `@capacitor/push-notifications` 를 설치하면 `firebase-messaging` 과 Google Play Services 전이 의존이 딸려 들어옵니다.
- 이 전이 의존이 들어오는 순간, 리소스 병합 · gms 플러그인 · 매니페스트 병합 지점이 늘어나 빌드 회귀 위험이 생깁니다.
- 따라서 v1 에서는 **문서와 자리표시자 파일만** 두고, 플러그인은 넣지 않습니다.

### 현재 저장소 상태 (활성화 전)

| 항목 | 상태 |
| --- | --- |
| `@capacitor/push-notifications` | **미설치** (mobile/package.json 에 없음) |
| 실제 `google-services.json` | **없음** (커밋 금지) |
| `mobile/android/app/google-services.json.example` | 있음 — 형태 참고용 더미 |
| `mobile/www/push.js` | **만들지 않음** (아래 3-3 참고) |
| `build.gradle` 수정 | **없음** (조건부 gms 로직이 이미 존재) |

---

## 1. build.gradle 은 왜 수정하지 않아도 되는가

스캐폴드 `mobile/android/app/build.gradle` 하단(L47-54)에 이미 **조건부 gms 적용** 로직이 있습니다. 실제 코드는 다음과 같습니다.

```gradle
try {
    def servicesJSON = file('google-services.json')
    if (servicesJSON.text) {
        apply plugin: 'com.google.gms.google-services'
    }
} catch(Exception e) {
    logger.info("google-services.json not found, google-services plugin not applied. Push Notifications won't work")
}
```

동작을 풀어 보면 이렇습니다.

- `google-services.json` 이 **없으면** `file(...).text` 접근이 예외를 던지고, `catch` 가 이를 삼켜 **gms 플러그인이 적용되지 않습니다.** → 빌드 그린.
- `google-services.json` 이 **있으면** 그 시점부터 `com.google.gms.google-services` 플러그인이 적용되고, 키/패키지 검증이 빌드 파이프라인에 들어옵니다.

즉, **`build.gradle` 은 손대지 않습니다.** 파일 하나(`google-services.json`)의 존재 여부만으로 켜고 끌 수 있게 이미 배선돼 있습니다. 이는 "작동 중인 `build.gradle`/`variables.gradle`/`settings.gradle` 은 편집하지 않는다"는 빌드 그린 절대조건과도 정합합니다.

---

## 2. 활성화 절차 (Android)

### 2-1. Firebase 프로젝트 생성 및 `google-services.json` 배치

1. [Firebase 콘솔](https://console.firebase.google.com/)에서 프로젝트를 생성합니다.
2. Android 앱을 추가하면서 **패키지 이름에 `kr.co.smoat.student`** 를 입력합니다. (앱의 `applicationId` · `namespace` 와 정확히 일치해야 합니다.)
3. 발급된 **`google-services.json` 을 Firebase 콘솔에서 직접 내려받아** `mobile/android/app/google-services.json` 에 둡니다.
   - 형태는 같은 폴더의 `google-services.json.example` 로 확인할 수 있습니다. **단, `.example` 파일을 복사/이름변경 하지 마십시오.** `.example` 에는 주석과 가짜 값이 들어 있어 그대로 쓰면 빌드가 깨집니다. 반드시 콘솔 발급본을 쓰십시오.

> **커밋 금지 (중요):** 실제 `google-services.json` 은 저장소에 **절대 커밋하지 마십시오.** 커밋되면 위 1장의 try/catch 가 이를 감지해 gms 플러그인을 적용하고, 그 순간부터 키 검증 빌드 리스크가 생깁니다.
> 현재 `mobile/android/app/.gitignore` 는 `/build/*` 만 무시하고 **`google-services.json` 을 무시하지 않습니다.** 활성화 시 다음 한 줄을 `.gitignore` 에 추가해 실수 커밋을 막으시길 권장합니다.
> ```gitignore
> google-services.json
> ```

### 2-2. 플러그인 설치 및 동기화

```bash
cd mobile
npm i @capacitor/push-notifications@^8
npx cap sync android
```

- Capacitor 8 라인이므로 `@^8` 로 코어 버전과 정렬합니다.
- `npx cap sync android` 가 새 플러그인을 네이티브 프로젝트에 배선하고, `google-services.json` 존재로 gms 플러그인이 활성화됩니다.
- Android 13+(API 33) 대상에서는 런타임 `POST_NOTIFICATIONS` 권한이 필요합니다. `@capacitor/push-notifications` 8.x 가 매니페스트 병합으로 권한을 추가하며, 실제 요청은 아래 3-3 의 `requestPermissions()` 가 수행합니다.

### 2-3. (설치 후) 빌드 검증

```bash
cd mobile/android
# Windows PowerShell
$env:JAVA_HOME='C:/Program Files/Android/Android Studio/jbr'; ./gradlew assembleDebug
```

`BUILD SUCCESSFUL` 과 `app/build/outputs/apk/debug/app-debug.apk` 생성을 확인합니다. 상세 절차는 `mobile/BUILD.md`(U9) 를 참고하십시오.

---

## 3. 등록 · 수신 코드 (스니펫만 — 파일로 만들지 않습니다)

### 3-1. 왜 `mobile/www/push.js` 를 만들지 않는가

우리는 `server.url = https://www.smoat.co.kr/g` 로 **원격 셸** 전략을 씁니다. WebView 는 로컬 `www/` 가 아니라 원격 `/g` 페이지를 로드하므로, `mobile/www/push.js` 같은 로컬 스크립트는 **실행 지점이 없어 dead 코드**가 됩니다. 따라서 파일로 만들지 않습니다.

대신 아래 스니펫은 **원격 `/g` 웹앱(웹 담당)** 또는 **네이티브 `MainActivity`(U2)** 중 실행 지점이 있는 쪽에 배치합니다. `server.url` 하에서는 네이티브 브리지가 원격 페이지에 주입되므로, `/g` 웹앱 코드에서 `@capacitor/push-notifications` 를 정상 호출할 수 있습니다.

### 3-2. 등록 · 토큰 서버 전송 · 탭 라우팅 스니펫 (TypeScript)

```ts
import { PushNotifications } from '@capacitor/push-notifications';

// (1) 권한 요청 → 등록
export async function initPush() {
  let perm = await PushNotifications.checkPermissions();
  if (perm.receive === 'prompt') {
    perm = await PushNotifications.requestPermissions();
  }
  if (perm.receive !== 'granted') return; // 거부 시 조용히 종료
  await PushNotifications.register();
}

// (2) 등록 성공 → FCM 토큰을 "학생 세션과 함께" 서버에 등록
PushNotifications.addListener('registration', async (token) => {
  // 원격 /g 오리진(smoat.co.kr)에서 실행되므로 상대경로면 grammar-drill-session
  // (HttpOnly · 1st-party) 쿠키가 자동 동봉된다. 엔드포인트는 mobile/ 밖에 신설 필요(웹 담당 이관).
  await fetch('/api/push/register', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: token.value, platform: 'android' }),
  });
});

PushNotifications.addListener('registrationError', (err) => {
  console.error('푸시 등록 오류', err);
});

// (3) 알림 탭 → data.url 딥링크로 /g 이동
PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
  const url = action.notification.data?.url; // 예: https://www.smoat.co.kr/g/home
  if (url) window.location.href = url;
});
```

### 3-3. 배선 시 유의 사항 (원격 셸 특성)

- **서버 엔드포인트 신설:** 위 `/api/push/register` 는 **아직 존재하지 않습니다.** FCM 토큰을 학생 세션(학원코드/학생코드)에 묶어 저장하는 엔드포인트를 `mobile/` **밖**(원격 웹앱)에 새로 만들어야 하며, 이는 **웹 담당 이관** 사항입니다.
- **실수신 · 탭 라우팅 협조:** 원격 셸이므로 알림 **실수신**과 **탭 라우팅**은 활성화 시 **네이티브(MainActivity) 또는 원격 코드의 협조**가 필요합니다.
  - 콜드 스타트(앱이 꺼진 상태에서 알림 탭)에서는 원격 JS 리스너가 아직 로드되지 않았을 수 있습니다. 이 경우 U2 `MainActivity` 의 딥링크 처리(`route()` → `loadUrl(...)`)와 동일한 방식으로, 알림 페이로드의 목적지 URL 을 네이티브가 초기 로드 URL 로 넘기도록 배선하는 편이 안전합니다.
  - 페이로드 규약 예시: 발송 서버가 `data.url` 에 `https://www.smoat.co.kr/g/...`(필요 시 `?ac=...&sc=...` 자동로그인 프리필 포함)를 실어 보내면, 웹앱은 `window.location.href` 로, 네이티브는 `loadUrl` 로 동일 목적지에 도달합니다.

---

## 4. 활성화 절차 (iOS)

iOS 는 GitHub Actions macOS 러너에서 빌드하는 후속 과제입니다(에페메랄 `ios/`, Windows 개발기에서는 `cap add ios` 실행/커밋 금지). 푸시 활성화 시 다음이 필요합니다.

1. **Firebase APNs 인증키 등록:** Apple Developer 계정에서 APNs 인증키(`.p8`)를 발급받아 Firebase 콘솔(프로젝트 설정 → 클라우드 메시징 → Apple 앱 구성)에 등록합니다.
2. **Xcode Push capability:** iOS 앱 타깃에 **Push Notifications** capability 를 추가합니다.
3. **`aps-environment` entitlement:** `mobile/ios-overlay/App.entitlements`(U7 소유)에 `aps-environment`(개발=`development`, 배포=`production`) 를 채웁니다. v1 에서 이 파일은 "준비만" 상태의 자리표시자입니다. CI(`mobile/scripts/apply-ios-overlay.sh`)가 에페메랄 `ios/` 에 이 entitlement 를 덧입힙니다.
4. **`GoogleService-Info.plist`:** iOS 용 Firebase 구성 파일을 별도로 내려받아 iOS 앱 번들에 포함합니다(Android 의 `google-services.json` 과 대응). 이 역시 커밋하지 마십시오.

> Android 스캐폴드의 조건부 gms 로직(1장) 덕분에, iOS 를 활성화하더라도 **Android `build.gradle` 은 그대로 무수정**입니다.

---

## 5. 관련 유닛 교차 참조

| 주제 | 위치 |
| --- | --- |
| `server.url` · 셸 설정 | U1 `mobile/capacitor.config.ts` |
| 네이티브 딥링크 라우팅(`route()`/`loadUrl`) · `smoat://` 스킴 | U2 `MainActivity.java` |
| App Links(`assetlinks.json`) · 딥링크 서버 배치 가이드 | U5 `mobile/deploy/assetlinks.json` · `mobile/deploy/DEEPLINK-DEPLOY.md` |
| iOS entitlement(`aps-environment`) · CI 오버레이 | U7 `mobile/ios-overlay/App.entitlements` · `mobile/scripts/apply-ios-overlay.sh` |
| 빌드 · 사이드로드 절차 | U9 `mobile/BUILD.md` |

---

## 6. 활성화 4단계 체크리스트 (요약)

1. Firebase 프로젝트 생성(패키지 `kr.co.smoat.student`) → `google-services.json` 을 `mobile/android/app/` 에 배치(커밋 금지).
2. `cd mobile && npm i @capacitor/push-notifications@^8 && npx cap sync android`.
3. 등록·수신 스니펫(3-2)을 원격 `/g` 웹앱 또는 네이티브에 배선 + 서버 토큰 등록 엔드포인트 신설(웹 담당) + 탭 라우팅 협조(네이티브/원격).
4. iOS: APNs 인증키 등록 + Xcode Push capability + `aps-environment` entitlement(`mobile/ios-overlay/App.entitlements`, U7).
