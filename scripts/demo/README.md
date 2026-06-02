# 이용가이드 영상 파이프라인 (녹화 → 합성)

운영 사이트를 **Playwright로 자동 녹화**하고, 그 영상에 **Remotion으로 자막·줌·하이라이트 애니메이션**을 입혀 mp4로 렌더링합니다. 전 과정이 이 레포 안 코드로 완결됩니다.

## 1. 녹화

```bash
# 운영 사이트에 로그인해서 director-tour 플로우를 녹화
DEMO_BASE_URL=https://<운영도메인> \
DEMO_EMAIL=<아이디> DEMO_PASSWORD=<비번> \
npm run demo:record -- director-tour

# 모든 플로우 녹화
npm run demo:record -- --all
```

산출물:
- `public/recordings/<flow>.webm` — 원본 화면 녹화 (1920×1080, 30fps)
- `public/recordings/<flow>.timeline.json` — 자막/줌/하이라이트 타임라인
- `remotion/guideManifest.ts` — 자동 재생성 (Remotion이 읽는 메타데이터)

> 녹화 시 OS 커서는 안 잡히므로 **가짜 커서 + 클릭 리플**을 페이지에 주입해 영상에 함께 담습니다. 마우스도 부드럽게 이동합니다.

## 2. 미리보기 & 편집

```bash
npm run remotion:preview   # Remotion Studio. "Guide-<flow>" 컴포지션 선택
```

자막/줌 타이밍을 바꾸려면 → `scripts/demo/flows.ts`의 플로우를 수정하고 다시 녹화하거나,
`public/recordings/<flow>.timeline.json`을 직접 손보고 `npm run demo:manifest` 실행.

## 3. mp4 출력

```bash
npm run demo:render -- Guide-director-tour out/director-tour.mp4
```

## 새 플로우 추가

`scripts/demo/flows.ts`에서 `Flow` 객체를 만들고 `FLOWS`에 추가:

```ts
const examCreate: Flow = {
  name: "exam-create",
  setup: login,
  async run(stage) {
    stage.chapter("시험지 만들기");
    await stage.goto("/director/exams");
    stage.caption("시험 목록", "여기서 새 시험지를 생성합니다");
    await stage.click('text=새 시험');      // 안정적인 셀렉터 사용 (text=/role=)
    await stage.zoomTo('#exam-title');       // 특정 영역으로 줌인
    await stage.type('#exam-title', '6월 모의고사');
    await stage.zoomOut();
    await stage.highlight('button:has-text("저장")');
  },
};
```

### Stage API
- `goto(url)` / `wait(ms)`
- `caption(text, subtitle?)` / `clearCaption()` / `chapter(text)`
- `moveTo(sel)` / `click(sel)` / `type(sel, text, {clear})`
- `zoomTo(sel, scale?)` / `zoomOut()` / `highlight(sel)`

셀렉터는 CSS 클래스보다 `text=`, `role=`, `#id` 처럼 안정적인 걸 쓰세요. UI가 바뀌면 플로우만 다시 돌리면 영상이 재생성됩니다.
