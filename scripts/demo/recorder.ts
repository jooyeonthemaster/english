/**
 * Screencast recorder for usage-guide videos.
 *
 * Drives the REAL deployed site with Playwright, records the session to webm,
 * and logs timestamped "marks" (captions, zoom targets, highlights) so the
 * Remotion `ScreencastScene` can overlay synced animations on top of the raw
 * footage.
 *
 * Two things Playwright does NOT do that we add here:
 *  1. It never captures the OS mouse cursor in recordVideo — so we inject a
 *     synthetic cursor div that follows the (synthetic) mouse events.
 *  2. Its mouse.move teleports — so `smoothMove` interpolates for natural motion.
 *
 * Output (per flow, into public/recordings so Remotion staticFile() can load it):
 *   public/recordings/<flow>.webm            raw footage @ 1920x1080
 *   public/recordings/<flow>.timeline.json   { flow, src, durationMs, fps, marks }
 */
import { chromium, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { mkdir, rename, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

export const REC_FPS = 30;
export const VIDEO_W = 1920;
export const VIDEO_H = 1080;

const OUT_DIR = join(process.cwd(), "public", "recordings");

export type Mark =
  | { tMs: number; type: "caption"; text: string; subtitle?: string }
  | { tMs: number; type: "caption-clear" }
  | { tMs: number; type: "zoom"; rect: Rect; scale?: number }
  | { tMs: number; type: "zoom-out" }
  | { tMs: number; type: "highlight"; rect: Rect }
  | { tMs: number; type: "chapter"; text: string };

type Rect = { x: number; y: number; width: number; height: number };

/** Injected into every page so the synthetic cursor + click ripple are captured on video. */
const CURSOR_INIT = `
(() => {
  if (window.__demoCursorInstalled) return;
  window.__demoCursorInstalled = true;
  const make = () => {
    const c = document.createElement('div');
    c.id = '__demo_cursor';
    c.style.cssText = [
      'position:fixed','left:0','top:0','width:22px','height:22px','z-index:2147483647',
      'pointer-events:none','transition:transform .04s linear','will-change:transform',
      "background:url('data:image/svg+xml;utf8," +
        encodeURIComponent('<svg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'22\\' height=\\'22\\' viewBox=\\'0 0 22 22\\'><path d=\\'M2 2 L2 17 L6.5 13 L9.5 19.5 L12.5 18 L9.5 11.5 L15 11.5 Z\\' fill=\\'black\\' stroke=\\'white\\' stroke-width=\\'1.5\\'/></svg>') +
        "') no-repeat",
    ].join(';');
    document.documentElement.appendChild(c);
    return c;
  };
  let cur = null;
  const ensure = () => (cur && cur.isConnected) ? cur : (cur = make());
  window.addEventListener('mousemove', (e) => {
    ensure().style.transform = 'translate(' + e.clientX + 'px,' + e.clientY + 'px)';
  }, true);
  window.addEventListener('mousedown', (e) => {
    const r = document.createElement('div');
    r.style.cssText = [
      'position:fixed','left:'+(e.clientX-14)+'px','top:'+(e.clientY-14)+'px',
      'width:28px','height:28px','border-radius:50%','z-index:2147483646','pointer-events:none',
      'border:2px solid rgba(59,130,246,.9)','background:rgba(59,130,246,.25)',
      'animation:__demo_ripple .5s ease-out forwards',
    ].join(';');
    document.documentElement.appendChild(r);
    setTimeout(() => r.remove(), 520);
  }, true);
  const st = document.createElement('style');
  st.textContent = '@keyframes __demo_ripple{from{transform:scale(.4);opacity:1}to{transform:scale(2.4);opacity:0}}';
  document.documentElement.appendChild(st);
})();
`;

/** High-level scripting surface a flow uses; every action also records a timeline mark. */
export class Stage {
  private marks: Mark[] = [];
  private start = Date.now();
  private cx = VIDEO_W / 2;
  private cy = VIDEO_H / 2;

  constructor(
    public page: Page,
    private flow: string,
  ) {}

  private now() {
    return Date.now() - this.start;
  }
  /** Reset the clock so t=0 lines up with the first visible frame (call after login/setup). */
  resetClock() {
    this.start = Date.now();
    this.marks = [];
  }

  async goto(url: string) {
    await this.page.goto(url, { waitUntil: "networkidle" }).catch(() => this.page.goto(url));
    await this.page.waitForTimeout(500);
  }

  /** Show a caption (auto-clears on the next `caption`). */
  caption(text: string, subtitle?: string) {
    this.marks.push({ tMs: this.now(), type: "caption", text, subtitle });
  }
  clearCaption() {
    this.marks.push({ tMs: this.now(), type: "caption-clear" });
  }
  /** Chapter title card marker (Remotion can render a lower-third / section break). */
  chapter(text: string) {
    this.marks.push({ tMs: this.now(), type: "chapter", text });
  }

  async wait(ms: number) {
    await this.page.waitForTimeout(ms);
  }

  /** Move the cursor smoothly to the center of a selector (no click). */
  async moveTo(selector: string, opts: { steps?: number } = {}) {
    const box = await this.boxOf(selector);
    await this.smoothMove(box.x + box.width / 2, box.y + box.height / 2, opts.steps);
  }

  /** Smoothly move + click an element, with a ripple recorded on video. */
  async click(selector: string, opts: { steps?: number } = {}) {
    const box = await this.boxOf(selector);
    const tx = box.x + box.width / 2;
    const ty = box.y + box.height / 2;
    await this.smoothMove(tx, ty, opts.steps);
    await this.page.waitForTimeout(180);
    await this.page.mouse.down();
    await this.page.mouse.up();
    await this.page.waitForTimeout(350);
  }

  /** Type into a focused field at a human cadence. */
  async type(selector: string, text: string, opts: { clear?: boolean; delay?: number } = {}) {
    await this.click(selector);
    if (opts.clear) {
      await this.page.keyboard.press("ControlOrMeta+A");
      await this.page.keyboard.press("Backspace");
    }
    await this.page.keyboard.type(text, { delay: opts.delay ?? 55 });
    await this.page.waitForTimeout(250);
  }

  /** Zoom the Remotion canvas onto an element (footage stays full-res; Remotion crops+scales). */
  async zoomTo(selector: string, scale = 1.8) {
    const box = await this.boxOf(selector);
    this.marks.push({ tMs: this.now(), type: "zoom", rect: box, scale });
  }
  zoomOut() {
    this.marks.push({ tMs: this.now(), type: "zoom-out" });
  }
  /** Draw an animated highlight box around an element. */
  async highlight(selector: string) {
    const box = await this.boxOf(selector);
    this.marks.push({ tMs: this.now(), type: "highlight", rect: box });
  }

  private async boxOf(selector: string): Promise<Rect> {
    const el = this.page.locator(selector).first();
    await el.scrollIntoViewIfNeeded().catch(() => {});
    await el.waitFor({ state: "visible", timeout: 15000 });
    const box = await el.boundingBox();
    if (!box) throw new Error(`No bounding box for selector: ${selector}`);
    return box;
  }

  private async smoothMove(tx: number, ty: number, steps = 24) {
    const fromX = this.cx;
    const fromY = this.cy;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; // easeInOutQuad
      await this.page.mouse.move(fromX + (tx - fromX) * e, fromY + (ty - fromY) * e);
      await this.page.waitForTimeout(12);
    }
    this.cx = tx;
    this.cy = ty;
  }

  /** @internal */ _drain(): Mark[] {
    return this.marks;
  }
}

export type Flow = {
  name: string;
  /** Optional login step; runs before the clock resets so it isn't in the final footage timing. */
  setup?: (stage: Stage) => Promise<void>;
  run: (stage: Stage) => Promise<void>;
};

export async function record(flow: Flow, baseURL: string): Promise<void> {
  await mkdir(OUT_DIR, { recursive: true });
  const browser: Browser = await chromium.launch({ headless: true });
  const context: BrowserContext = await browser.newContext({
    viewport: { width: VIDEO_W, height: VIDEO_H },
    deviceScaleFactor: 1,
    recordVideo: { dir: OUT_DIR, size: { width: VIDEO_W, height: VIDEO_H } },
    baseURL,
  });
  await context.addInitScript(CURSOR_INIT);
  const page = await context.newPage();
  const stage = new Stage(page, flow.name);

  try {
    if (flow.setup) await flow.setup(stage);
    stage.resetClock();
    await flow.run(stage);
  } finally {
    const video = page.video();
    await context.close(); // flushes the webm to disk
    await browser.close();

    const marks = stage._drain();
    const durationMs = marks.length ? marks[marks.length - 1].tMs + 1500 : 3000;

    // Playwright names the webm with a random hash; rename to <flow>.webm.
    const target = join(OUT_DIR, `${flow.name}.webm`);
    if (video) {
      const src = await video.path();
      await rename(src, target).catch(async () => {
        // fallback: pick the newest webm in OUT_DIR
        const files = (await readdir(OUT_DIR)).filter((f) => f.endsWith(".webm") && f !== `${flow.name}.webm`);
        if (files[0]) await rename(join(OUT_DIR, files[0]), target);
      });
    }
    const timeline = {
      flow: flow.name,
      src: `recordings/${flow.name}.webm`,
      durationMs,
      fps: REC_FPS,
      marks,
    };
    await writeFile(join(OUT_DIR, `${flow.name}.timeline.json`), JSON.stringify(timeline, null, 2));
    // eslint-disable-next-line no-console
    console.log(`✓ ${flow.name}: ${target} (${(durationMs / 1000).toFixed(1)}s, ${marks.length} marks)`);
  }
}
