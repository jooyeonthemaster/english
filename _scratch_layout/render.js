const { chromium } = require("playwright");
const path = require("path");

function injectArrows() {
  const svgNS = "http://www.w3.org/2000/svg";
  document.querySelectorAll(".page.arrows").forEach((pageEl) => {
    pageEl.style.position = "relative";
    const pr = pageEl.getBoundingClientRect();
    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("width", pr.width);
    svg.setAttribute("height", pr.height);
    svg.setAttribute("style", "position:absolute;left:0;top:0;overflow:visible;pointer-events:none;z-index:60;");
    pageEl.appendChild(svg);
    pageEl.querySelectorAll(".snt").forEach((snt) => {
      snt.querySelectorAll(".ck.anchor[data-arr]").forEach((ck) => {
        const id = ck.getAttribute("data-arr");
        const pt = snt.querySelector('.pt[data-arr-tgt="' + id + '"]');
        if (!pt) return;
        const en = ck.querySelector(".en");
        const er = en.getBoundingClientRect();
        const badge = pt.querySelector(".lkp") || pt;
        const br = badge.getBoundingClientRect();
        const color = getComputedStyle(ck).getPropertyValue("--c").trim() || "#333";
        // 내용을 가로지르지 않게 '왼쪽 여백(거터)'을 세로 통로로 사용:
        //   밑줄 왼쪽 → 살짝 아래로 → 왼쪽 여백으로 → 수직으로 내려가 → 설명 뱃지로(오른쪽 화살표)
        const x1 = er.left - pr.left + 1; // 밑줄 왼쪽
        const y1 = er.bottom - pr.top + 1;
        const y1b = y1 + 11; // 밑줄 바로 아래(줄 간격) 로 직각 낙하
        const bx = br.left - pr.left; // 뱃지 왼쪽(= 본문 좌측 끝)
        const by = br.top - pr.top + br.height / 2;
        const gutterId = Number(ck.getAttribute("data-arr")) || 1;
        const xg = Math.max(7, bx - 6 - (gutterId - 1) * 5); // 본문 왼쪽 빈 여백(연결마다 살짝 다른 통로)
        const endx = bx;
        const p = document.createElementNS(svgNS, "path");
        p.setAttribute("d", `M ${x1} ${y1} L ${x1} ${y1b} L ${xg} ${y1b} L ${xg} ${by} L ${endx} ${by}`);
        p.setAttribute("fill", "none");
        p.setAttribute("stroke", color);
        p.setAttribute("stroke-width", "1.2");
        p.setAttribute("opacity", "0.8");
        p.setAttribute("stroke-linejoin", "miter");
        svg.appendChild(p);
        // 화살표 머리: 뱃지로 들어가는 오른쪽 방향
        const ang = 0;
        const ah = 4.4, a1 = ang + Math.PI * 0.82, a2 = ang - Math.PI * 0.82;
        const tri = document.createElementNS(svgNS, "path");
        tri.setAttribute("d", `M ${endx} ${by} L ${endx + ah * Math.cos(a1)} ${by + ah * Math.sin(a1)} L ${endx + ah * Math.cos(a2)} ${by + ah * Math.sin(a2)} Z`);
        tri.setAttribute("fill", color);
        tri.setAttribute("opacity", "0.9");
        svg.appendChild(tri);
        const dot = document.createElementNS(svgNS, "circle");
        dot.setAttribute("cx", x1);
        dot.setAttribute("cy", y1);
        dot.setAttribute("r", "1.5");
        dot.setAttribute("fill", color);
        svg.appendChild(dot);
      });
    });
  });
}

(async () => {
  const dir = __dirname;
  const htmlPath = "file://" + path.join(dir, "annotated-redesign.html");
  const pdfPath = path.join(dir, "필기분석_레이아웃_개선안.pdf");
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(htmlPath, { waitUntil: "networkidle" });
  await page.emulateMedia({ media: "print" });
  await page.evaluate(injectArrows);
  await page.pdf({
    path: pdfPath,
    format: "A4",
    printBackground: true,
    margin: { top: "0", right: "0", bottom: "0", left: "0" },
  });
  await browser.close();
  console.log("PDF written:", pdfPath);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
