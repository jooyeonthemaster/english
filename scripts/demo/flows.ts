/**
 * Guide-video flows. Each flow scripts a real journey through the deployed site.
 *
 * Add a new flow object and append it to FLOWS. Run one with:
 *   DEMO_EMAIL=... DEMO_PASSWORD=... npm run demo:record -- <flow-name>
 *
 * Selectors below match src/app/(auth)/login/page.tsx. Adjust per-page selectors
 * to whatever is stable in the deployed UI (prefer text= / role= over CSS classes).
 */
import type { Flow, Stage } from "./recorder";

/** Logs in as staff/director. Runs in `setup` so the login keystrokes aren't in final timing. */
async function login(stage: Stage) {
  const email = process.env.DEMO_EMAIL ?? "jooyeon";
  const password = process.env.DEMO_PASSWORD ?? "jooyeon";
  await stage.goto("/login");
  await stage.type("#email", email, { clear: true });
  await stage.type("#password", password, { clear: true });
  await stage.click('button[type="submit"]');
  await stage.page.waitForURL(/\/(director|teacher)/, { timeout: 30000 }).catch(() => {});
  await stage.wait(1500);
}

const directorTour: Flow = {
  name: "director-tour",
  setup: login,
  async run(stage) {
    stage.chapter("원장 대시보드 둘러보기");

    await stage.goto("/director");
    stage.caption("원장 대시보드", "학원 현황을 한눈에 확인합니다");
    await stage.wait(2200);

    // Example interactions — replace selectors with real, stable ones from the live UI.
    stage.caption("원생 관리로 이동");
    await stage.goto("/director/students");
    await stage.wait(1500);
    stage.caption("원생 목록", "등록·반편성·출결을 이곳에서 관리합니다");
    await stage.wait(2500);
    stage.clearCaption();

    stage.chapter("AI 워크벤치");
    await stage.goto("/director/workbench");
    stage.caption("AI 워크벤치", "지문·문항을 AI로 생성하고 시험지를 만듭니다");
    await stage.wait(3000);
    stage.clearCaption();
  },
};

export const FLOWS: Flow[] = [directorTour];

export function findFlow(name: string): Flow | undefined {
  return FLOWS.find((f) => f.name === name);
}
