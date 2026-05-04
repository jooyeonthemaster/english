import { test, expect, type Page } from "@playwright/test";

/**
 * WebKit regression tests for PassageAnnotationEditor popup positioning.
 *
 * Background: Safari/WebKit's Selection.getRangeAt(0).getBoundingClientRect()
 * returns the first client-rect of a multi-rect selection (when the range
 * crosses inline marks/spans), producing wildly wrong popup coordinates.
 * Chromium returns the union rect, hiding the bug there.
 *
 * The fix replaces the DOM rect math with ProseMirror's editor.view.coordsAtPos.
 * These tests pin that behaviour so a regression here trips before deploy.
 */

const HARNESS_URL = "/dev/annotation-editor";

/** Drag from one screen point to another using mouse events with intermediate steps */
async function dragSelect(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  // Multi-step move so the selection is actually built up (Safari is picky)
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 6 });
  await page.mouse.move(to.x, to.y, { steps: 6 });
  await page.mouse.up();
}

/** Get the bounding rect of the current DOM selection inside the editor */
async function getSelectionRect(page: Page) {
  return page.evaluate(() => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
  });
}

test.describe("Annotation popup positioning (WebKit)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(HARNESS_URL);
    // Editor renders client-side; wait for ProseMirror to mount
    await page.waitForSelector(".ProseMirror", { state: "visible" });
    // Wait an extra tick for content to render
    await page.waitForTimeout(200);
  });

  test("toolbar appears directly under selection on simple drag", async ({ page }) => {
    await selectWordInEditor(page, "important");

    // Toolbar should now be visible (waitFor inside helper)
    const toolbar = page.locator('[data-popup]');
    await expect(toolbar).toBeVisible({ timeout: 2000 });

    const selRect = await getSelectionRect(page);
    expect(selRect, "selection should exist").not.toBeNull();

    const toolbarBox = await toolbar.boundingBox();
    expect(toolbarBox, "toolbar should have a bounding box").not.toBeNull();
    if (!selRect || !toolbarBox) return;

    // Toolbar center X should be within ±50px of selection center
    const selCenterX = (selRect.left + selRect.right) / 2;
    const toolbarCenterX = toolbarBox.x + toolbarBox.width / 2;
    expect(
      Math.abs(toolbarCenterX - selCenterX),
      `toolbar X drift: toolbar=${toolbarCenterX} selection=${selCenterX}`,
    ).toBeLessThan(50);

    // Toolbar top should be within 4-40px BELOW selection bottom
    const gap = toolbarBox.y - selRect.bottom;
    expect(
      gap,
      `toolbar should sit just below selection (gap=${gap}px). Was the popup pushed off into negative coordinates? Classic Safari rect bug.`,
    ).toBeGreaterThan(-5);
    expect(gap, `toolbar shouldn't float far below selection (gap=${gap}px)`).toBeLessThan(60);
  });

  test("memo popup appears at same anchor after marking", async ({ page }) => {
    await selectWordInEditor(page, "important");

    // Click "어휘" (vocab) marking button in toolbar
    await page.locator('[data-popup] button', { hasText: "어휘" }).first().click();

    // Memo input should now be visible
    const memoInput = page.getByPlaceholder("메모 (Enter 저장, Esc 건너뛰기)");
    await expect(memoInput).toBeVisible({ timeout: 1500 });

    // Verify it's positioned reasonably (not at viewport corner)
    const popup = page.locator('[data-popup]');
    const box = await popup.boundingBox();
    expect(box).not.toBeNull();
    if (!box) return;
    expect(box.x, "memo popup x should not collapse to 0").toBeGreaterThan(50);
    expect(box.y, "memo popup y should not collapse to 0").toBeGreaterThan(50);
  });

  test("clicking an existing mark reopens edit popup at its location", async ({ page }) => {
    // Mark a word first via deterministic selection (no dblclick lottery)
    await selectWordInEditor(page, "important");
    await page.locator('[data-popup] button', { hasText: "어휘" }).first().click();
    await page.getByPlaceholder("메모 (Enter 저장, Esc 건너뛰기)").press("Escape");

    // Now click the marked span
    const marked = page.locator(".ann-vocab").first();
    await expect(marked).toBeVisible();
    const markedBox = await marked.boundingBox();
    expect(markedBox).not.toBeNull();
    if (!markedBox) return;

    // Click center of marked span (default position) so ProseMirror resolves
    // to a position that definitely has the mark applied. {x:5,y:5} could land
    // on a span boundary where ProseMirror sees plain text instead.
    await marked.click();

    // Edit popup should appear
    const popup = page.locator('[data-popup]');
    await expect(popup).toBeVisible({ timeout: 2000 });

    const popupBox = await popup.boundingBox();
    expect(popupBox).not.toBeNull();
    if (!popupBox) return;

    // Popup should be near the marked word (within 160px horizontally, just below)
    const markedCenterX = markedBox.x + markedBox.width / 2;
    const popupCenterX = popupBox.x + popupBox.width / 2;
    expect(
      Math.abs(popupCenterX - markedCenterX),
      `edit popup X drift from marked word: popup=${popupCenterX} marked=${markedCenterX}`,
    ).toBeLessThan(160);

    const verticalGap = popupBox.y - (markedBox.y + markedBox.height);
    expect(verticalGap, `edit popup should sit below the marked word (gap=${verticalGap}px)`)
      .toBeGreaterThan(-10);
  });

  test("annotation persists into harness state after marking", async ({ page }) => {
    await selectWordInEditor(page, "important");
    await page.locator('[data-popup] button', { hasText: "문법" }).first().click();
    await page.getByPlaceholder("메모 (Enter 저장, Esc 건너뛰기)").press("Escape");

    const json = await page.locator('[data-testid="annotations-json"]').textContent();
    expect(json, "annotations JSON should be present").toBeTruthy();
    const parsed = JSON.parse(json ?? "[]");
    expect(parsed).toHaveLength(1);
    expect(parsed[0].type).toBe("grammar");
    expect(parsed[0].text).toBe("important");
  });
});

/**
 * Deterministically select a word in the editor and trigger pointerup so the
 * editor's selection-handling code path runs (just like a real user drag).
 *
 * Why not page.dblclick(text)? Word boundaries differ between WebKit and
 * Chromium, and `getByText("important")` can match the wrapping <p> element
 * causing dblclick to land on a random word. This helper finds the exact text
 * node, picks the substring offsets, and dispatches the proper events.
 */
async function selectWordInEditor(page: Page, word: string) {
  // Set DOM selection at the exact substring inside .ProseMirror
  await page.evaluate((targetWord) => {
    const root = document.querySelector(".ProseMirror");
    if (!root) throw new Error("ProseMirror root not found");
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    while ((node = walker.nextNode())) {
      const text = node.nodeValue ?? "";
      const idx = text.indexOf(targetWord);
      if (idx !== -1) {
        const range = document.createRange();
        range.setStart(node, idx);
        range.setEnd(node, idx + targetWord.length);
        const sel = window.getSelection();
        if (!sel) throw new Error("no selection");
        sel.removeAllRanges();
        sel.addRange(range);
        return;
      }
    }
    throw new Error(`word "${targetWord}" not found in editor`);
  }, word);

  // Fire pointerup on the editor — that's what the popup logic listens for
  await page.evaluate(() => {
    const root = document.querySelector(".ProseMirror");
    if (!root) return;
    const rect = root.getBoundingClientRect();
    root.dispatchEvent(
      new PointerEvent("pointerup", {
        bubbles: true,
        clientX: rect.left + 10,
        clientY: rect.top + 10,
        pointerType: "mouse",
      }),
    );
  });

  // Wait for the toolbar to appear (rAF + state update)
  await page.locator('[data-popup]').waitFor({ state: "visible", timeout: 1500 });
}
