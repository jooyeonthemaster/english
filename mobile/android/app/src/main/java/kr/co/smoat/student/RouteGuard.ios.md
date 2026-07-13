# RouteGuard — iOS 대칭 구현 스펙 (RouteGuard.swift)

이 문서는 Android `RouteGuardPlugin.java`(같은 디렉터리)의 **iOS 대칭 구현 스펙**입니다.
iOS 실빌드는 GitHub Actions macOS 러너(`mobile/ci/mobile-ios.yml`, U7)에서 수행하며,
Windows 개발기에서는 CocoaPods/Xcode를 검증할 수 없어 **여기에 구현하지 않고 스펙만** 둡니다.
`ios/`는 에페메랄(CI에서 `npx cap add ios`로 재생성)이므로 이 스펙을 참조해
그 시점에 `ios/App/App/RouteGuardPlugin.swift`로 옮겨 구현합니다.

> 아래 iOS 훅 시그니처는 **[추론] 미검증**입니다. 이 개발기에 macOS·Xcode·Capacitor iOS
> 파드가 없어 실제 `CAPPlugin` API 표면을 대조하지 못했습니다. macOS 러너에서
> `node_modules/@capacitor/ios/.../CAPPlugin` 헤더/소스로 정확한 시그니처를 반드시 재확인한 뒤
> 구현합니다.

## 1. 목적 — Android와 동일한 3분기 판정

원격 셸(server.url = `https://www.smoat.co.kr/g`)에는 우리 JS를 얹을 수 없으므로,
네이티브 내비게이션 가드가 유일 경로입니다. Android `shouldOverrideLoad(Uri)`와
**의미적으로 동일**하게 판정합니다.

| 판정 | Android 반환 | 의미 | iOS 미러(예상) |
|------|-------------|------|----------------|
| 외부 호스트 | `null` | Capacitor 기본(= 시스템 브라우저 위임) | `nil` |
| 허용 경로(같은 호스트) | `false` | WebView 내 로드 허용 | `NSNumber(false)` |
| 그 외 같은 호스트(`/director`·마케팅 `/`) | `true` | 조용히 차단, 현재 페이지 유지 | `NSNumber(true)` |

`WKWebView`의 `WKNavigationDelegate`를 통째로 교체하지 않습니다(브리지 파손).
Capacitor 공식 플러그인 훅만 오버라이드합니다.

## 2. 훅 시그니처 [추론 — macOS에서 재확인 필수]

Capacitor iOS `CAPPlugin`이 Android `shouldOverrideLoad(Uri)`에 대응해 노출한다고
**추정**되는 훅:

```swift
// [추론] 미검증 — 실제 시그니처는 Capacitor iOS 소스로 재확인할 것.
// Android Boolean(true=차단 / false=허용 / null=기본)에 대응해 iOS는
// NSNumber?(true / false / nil)로 반환한다고 추정.
@objc public func shouldOverrideLoad(_ navigationAction: WKNavigationAction) -> NSNumber? {
    guard let url = navigationAction.request.url else { return nil }
    return decide(url)   // NSNumber? 로 매핑
}
```

만약 위 훅이 Capacitor iOS에 없다면(재확인 결과에 따라), 대안은
`CAPBridgeViewController`의 내비게이션 델리게이트에 얹는
**capacitor 공식 확장 지점**을 사용하되, 델리게이트 전체 교체는 금지합니다.

## 3. 미러할 allowlist 로직 (Android 소스가 단일 진실)

`RouteGuardPlugin.java`의 `isAllowedPath`를 그대로 이식합니다. 값이 어긋나지 않도록
Android 파일을 진실의 원천으로 삼아 대조합니다.

- 상수 `APP_HOST = "www.smoat.co.kr"`.
- `url.host != APP_HOST` → `nil`(외부 위임).
- `path`(쿼리 제외)가 아래 중 하나면 `false`(허용):
  - `"/g"` 또는 `"/g/"` 프리픽스 (학생 표면)
  - `"/t"` 또는 `"/t/"` 프리픽스 (시험)
  - `"/a"` 또는 `"/a/"` 프리픽스 (답안)
  - `"/api"` 또는 `"/api/"` 프리픽스
  - `"/_next/"` 프리픽스
  - `"/favicon"`·`"/manifest"` 프리픽스
  - 정적 확장자: `.js .css .png .jpg .jpeg .gif .webp .svg .ico .woff .woff2 .ttf .json .map .txt`
- 그 외 같은 호스트 → `true`(차단, 현재 페이지 유지).

```swift
private func decide(_ url: URL) -> NSNumber? {
    guard let host = url.host else { return nil }
    if host != "www.smoat.co.kr" { return nil }          // 외부 위임
    let path = url.path                                   // 쿼리 제외
    return NSNumber(value: !isAllowedPath(path))          // 허용=false / 차단=true
}
```

`isAllowedPath`는 Java와 동일한 접두/확장자 판정을 Swift로 옮깁니다.
이 allowlist는 스토어 컴플라이언스('무제한 웹 접근=아니오', Apple 4+ 등급)의
사실적 토대이므로 Android와 **정확히 일치**해야 합니다.

## 4. 딥링크 패리티 (MainActivity.route/resolve 대응)

Android의 `MainActivity.route()/resolve()`에 대응하는 iOS 진입점:

- **Universal Links (App Links 대응)**: `AASA`(`mobile/deploy/apple-app-site-association`, U5)에
  `/g`·`/g/*`가 등록됨. `AppDelegate`(또는 SceneDelegate)의
  `application(_:continue:restorationHandler:)`에서 `userActivity.webpageURL`을 받아
  `resolve` 후 브리지 WebView로 로드.
- **커스텀 스킴 `smoat://`**: `application(_:open:options:)`에서 URL을 받아
  Android `resolve()`와 동일 규칙으로 `smoat://g?ac=A&sc=B` →
  `https://www.smoat.co.kr/g?ac=A&sc=B` 매핑 후 로드.
- 원격 `/g`의 `?ac&sc` 자동로그인 useEffect가 로그인을 수행하므로, iOS 셸도
  **URL만 정확히 로드**하고 로그인 로직은 원격에 위임합니다.
- entitlement `com.apple.developer.associated-domains`(`applinks:www.smoat.co.kr`)는
  `mobile/ios-overlay/App.entitlements`(U7)에 자리표시자로 준비됨.

## 5. 빌드/검증 맥락

- iOS 실빌드·서명은 Apple 계정 발급 후 GH Actions macOS 러너에서 수행(U7).
- 이 스펙은 그 시점의 구현 계약이며, Windows에서 `ios/` 생성·커밋은 금지입니다.
- 구현 후 Android `RouteGuardPlugin.java`와 allowlist를 diff로 대조해 드리프트 0을 확인합니다.
