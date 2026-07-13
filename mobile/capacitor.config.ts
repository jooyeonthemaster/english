import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'kr.co.smoat.student',
  appName: 'SMOAT 학습',
  webDir: 'www',
  // 원격 페인트 전 백지 대신 지면색(#f6f5f1, gd.css --gd-paper 실측)으로 채워 흰 플래시 제거.
  backgroundColor: '#f6f5f1',
  server: {
    // 로드 전략: server.url 직결. 경로 '/g'(학생 앱 루트)를 반드시 포함 — 루트 '/'는 마케팅 홈이라 금지.
    // server.url은 원격 호스트를 서버 오리진으로 취급해 네이티브 브리지를 주입하므로,
    // 원격 /g 페이지에서도 @capacitor/app·network·향후 push 플러그인이 생존한다(#7454 회피).
    url: 'https://www.smoat.co.kr/g',
    // 원격 로드 실패(오프라인/서버 다운) 시 로컬 폴백. www/ 루트 기준 상대경로로 해석되므로 파일명만 기입.
    errorPath: 'offline.html',
    // 재시도 내비게이션이 WebView 내에서 열리도록 정규 호스트(www)만 허용목록에 둔다.
    // apex 'smoat.co.kr'는 의도적으로 제외 — RouteGuardPlugin.APP_HOST가 www 단일값이라
    // apex를 허용하면 경로 화이트리스트(/g·/t·/a) 게이팅을 우회해 apex의 비학생 화면
    // (예: smoat.co.kr/director)이 앱 내에서 열릴 수 있다. server.url·errorPath·프로브가
    // 전부 www라 apex는 폴백/복구에 불필요하므로 제거해도 아키텍처 불변.
    allowNavigation: ['www.smoat.co.kr'],
    // 원격이 https라 콜드스타트부터 웹뷰 오리진이 smoat.co.kr → grammar-drill-session
    // (Secure·SameSite=Lax·HttpOnly host-only 90d) 쿠키가 완전한 1st-party로 세션 자동복원.
    androidScheme: 'https'
    // iosScheme/cleartext는 명시하지 않음 — 기본값(capacitor/false) 유지로 혼합콘텐츠·쿠키 정합 보존.
  },
  // 전역 backgroundColor를 Android에서 override(동일 지면색) — 원격 페인트 전 백지 방지 체인.
  android: {
    backgroundColor: '#f6f5f1'
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      // 반드시 true. 원격 /g 페이지엔 SplashScreen.hide()를 호출할 우리 브리지 JS가 없으므로
      // false면 스플래시가 영구 고착(+오프라인 시 offline.html 마스킹, capacitor-plugins#1280).
      launchAutoHide: true,
      launchFadeOutDuration: 300,
      backgroundColor: '#f6f5f1',
      // 계기판·미니멀 — 스피너/이모지 금지.
      showSpinner: false,
      androidScaleType: 'CENTER_CROP',
      splashFullScreen: false,
      splashImmersive: false
    },
    Keyboard: {
      // 로그인 코드입력 중앙 폼(/g는 min-h-dvh + justify-center)이 키보드에 가리지 않도록
      // WebView 전체를 리사이즈. adjustResize 매니페스트 설정(U2)과 정합. @capacitor/keyboard(deps) 필요.
      resize: 'native'
    }
  }
};

export default config;
