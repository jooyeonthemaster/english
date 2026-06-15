/* ============================================================
   smoat IR Deck — 차트 · 지도 · 체험 데모 인터랙션
   ============================================================ */
(function () {
  "use strict";

  /* ============================================================
     1. 계절성 차트 (S05 · S16) — 네이버 데이터랩 모티프 재구성
     주간 52포인트, 시험기간 피크 + 방학 트로프. 결정적 의사난수.
  ============================================================ */
  const W = 1040, H = 360, PAD_L = 46, PAD_R = 14, PAD_T = 18, PAD_B = 40;
  const PW = W - PAD_L - PAD_R, PH = H - PAD_T - PAD_B;

  function prand(i, salt) {
    return (((i * 9301 + salt * 49297) % 233280) / 233280);
  }

  // 주차(0~51) → 수요 강도(0~1). 6월 시작(기말 직전) 기준.
  // 피크: 기말(0~3주·25~27주), 중간(14~17주·40~43주) / 트로프: 8월(8~11주), 1~2월(30~35주)
  function intensity(w) {
    const peaks = [
      { c: 1.5, w: 2.6, h: 1.0 },   // 6월말~7월초 기말
      { c: 16, w: 3.0, h: 0.85 },   // 9월말~10월 중간
      { c: 25.5, w: 2.8, h: 0.95 }, // 11월말~12월초 기말
      { c: 42, w: 3.2, h: 0.9 },    // 4월말~5월 중간
      { c: 48.5, w: 2.6, h: 0.85 }, // 6월 기말(이듬해)
    ];
    let v = 0.06;
    for (const p of peaks) {
      v += p.h * Math.exp(-Math.pow(w - p.c, 2) / (2 * p.w * p.w));
    }
    // 방학 트로프 감쇠
    if (w >= 8 && w <= 12) v *= 0.32;   // 8월
    if (w >= 30 && w <= 36) v *= 0.22;  // 1~2월
    return Math.min(1, v);
  }

  function seriesPoints(scale, salt, jag) {
    const pts = [];
    for (let w = 0; w < 52; w++) {
      const base = intensity(w) * scale;
      const noise = (prand(w, salt) - 0.5) * jag * (0.25 + base);
      // 주중/주말 톱니(데이터랩 특유의 지그재그)
      const saw = (w % 2 === 0 ? 1 : -1) * jag * 0.35 * base;
      const v = Math.max(0.015, base + noise + saw);
      const x = PAD_L + (w / 51) * PW;
      const y = PAD_T + PH - v * PH;
      pts.push(x.toFixed(1) + "," + y.toFixed(1));
    }
    return pts.join(" ");
  }

  function el(tag, attrs) {
    const n = document.createElementNS("http://www.w3.org/2000/svg", tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    return n;
  }

  function buildAxes(svg) {
    // 그리드 + 축 라벨
    [0, 0.25, 0.5, 0.75, 1].forEach((g) => {
      const y = PAD_T + PH - g * PH;
      svg.appendChild(el("line", { x1: PAD_L, y1: y, x2: W - PAD_R, y2: y, stroke: "rgba(150,180,230,0.12)", "stroke-width": 1 }));
      const t = el("text", { x: PAD_L - 8, y: y + 4, "text-anchor": "end", class: "ax-label" });
      t.textContent = String(Math.round(g * 100));
      svg.appendChild(t);
    });
    const months = ["25.06", "25.09", "25.12", "26.03", "26.06"];
    months.forEach((m, i) => {
      const x = PAD_L + (i / (months.length - 1)) * PW;
      const t = el("text", { x: x, y: H - 12, "text-anchor": i === 0 ? "start" : i === months.length - 1 ? "end" : "middle", class: "ax-label" });
      t.textContent = m;
      svg.appendChild(t);
    });
  }

  function buildPeakBands(svg, withTags) {
    const bands = [
      { from: 0, to: 3.6, tag: "기말" },
      { from: 13.5, to: 18, tag: "중간" },
      { from: 24, to: 27.5, tag: "기말" },
      { from: 40.5, to: 44.5, tag: "중간" },
      { from: 47.5, to: 50.5, tag: "기말" },
    ];
    bands.forEach((b) => {
      const x1 = PAD_L + (b.from / 51) * PW;
      const x2 = PAD_L + (b.to / 51) * PW;
      svg.appendChild(el("rect", { x: x1, y: PAD_T, width: x2 - x1, height: PH, class: "peak-band" }));
      if (withTags) {
        const t = el("text", { x: (x1 + x2) / 2, y: PAD_T + 16, "text-anchor": "middle", class: "peak-tag" });
        t.textContent = b.tag;
        svg.appendChild(t);
      }
    });
  }

  function polyline(svg, pts, color, width, dash) {
    const p = el("polyline", {
      points: pts, fill: "none", stroke: color, "stroke-width": width,
      "stroke-linejoin": "round", "stroke-linecap": "round",
    });
    if (dash) p.setAttribute("stroke-dasharray", dash);
    svg.appendChild(p);
    return p;
  }

  function animateLine(p, dur, delay) {
    const len = p.getTotalLength();
    p.style.strokeDasharray = len;
    p.style.strokeDashoffset = len;
    p.getBoundingClientRect();
    p.style.transition = "stroke-dashoffset " + dur + "ms cubic-bezier(.16,1,.3,1) " + (delay || 0) + "ms";
    p.style.strokeDashoffset = "0";
  }

  /* ---- S05: 경쟁 3사 ---- */
  const svg1 = document.getElementById("season-1");
  let s1lines = null;
  if (svg1) {
    buildAxes(svg1);
    s1lines = [
      polyline(svg1, seriesPoints(0.88, 7, 0.16), "#f0568f", 2.6),
      polyline(svg1, seriesPoints(0.46, 13, 0.13), "#34c97a", 2.4),
      polyline(svg1, seriesPoints(0.26, 29, 0.1), "#9a7bf7", 2.2),
    ];
    s1lines.forEach((p) => { p.style.opacity = "0"; });
  }

  /* ---- S16: smart 펄스 + moat 베이스라인 ---- */
  const svg2 = document.getElementById("season-2");
  let s2pulse = null, s2base = null;
  if (svg2) {
    buildAxes(svg2);
    buildPeakBands(svg2, false);
    s2pulse = polyline(svg2, seriesPoints(0.8, 7, 0.14), "#5aa7f7", 2.4);
    s2pulse.style.opacity = "0";
    // moat 누적 베이스라인: 분기마다 계약이 쌓이는 계단형 상승
    const steps = [];
    let lvl = 0.06;
    for (let w = 0; w < 52; w++) {
      if (w === 9 || w === 19 || w === 29 || w === 39 || w === 47) lvl += 0.085;
      const x = PAD_L + (w / 51) * PW;
      const y = PAD_T + PH - lvl * PH;
      steps.push(x.toFixed(1) + "," + y.toFixed(1));
    }
    s2base = polyline(svg2, steps.join(" "), "#37e0b0", 3.4);
    s2base.style.opacity = "0";
  }

  /* 스텝 연동 — 슬라이드 deck:step 이벤트 */
  function bindChart(slideSel, handler) {
    const slide = document.querySelector(slideSel);
    if (!slide) return;
    slide.addEventListener("deck:step", (e) => handler(e.detail.step));
  }

  let s1drawn = false, s1banded = false;
  bindChart(".s05", (step) => {
    if (step >= 1 && !s1drawn && s1lines) {
      s1drawn = true;
      s1lines.forEach((p, i) => {
        p.style.opacity = "1";
        animateLine(p, 1900, i * 260);
      });
    }
    if (step >= 2 && !s1banded && svg1) {
      s1banded = true;
      // 밴드를 별도 그룹에 그려 페이드 인 (라인 뒤로)
      const tmp = document.createElementNS("http://www.w3.org/2000/svg", "g");
      svg1.insertBefore(tmp, svg1.firstChild);
      buildPeakBands({ appendChild: (n) => tmp.appendChild(n) }, true);
      tmp.style.opacity = "0";
      tmp.style.transition = "opacity 0.9s ease";
      tmp.getBoundingClientRect();
      tmp.style.opacity = "1";
    }
  });

  let s2p = false, s2b = false;
  bindChart(".s16", (step) => {
    if (step >= 0 && !s2p && s2pulse) {
      s2p = true;
      s2pulse.style.opacity = "0.55";
      animateLine(s2pulse, 1600, 200);
    }
    if (step >= 1 && !s2b && s2base) {
      s2b = true;
      s2base.style.opacity = "1";
      animateLine(s2base, 1800, 100);
    }
  });

  /* ============================================================
     2. S15 — 서울 25개 자치구 그리드 (3슬롯 점등)
  ============================================================ */
  const mapGrid = document.getElementById("map-grid");
  if (mapGrid) {
    const GU = ["강남", "서초", "송파", "강동", "광진", "성동", "용산", "마포", "서대문", "은평",
      "종로", "중구", "성북", "강북", "도봉", "노원", "중랑", "동대문", "영등포", "동작",
      "관악", "금천", "구로", "양천", "강서"];
    const lit = new Set(["강남", "서초", "송파", "노원", "양천", "마포"]);
    GU.forEach((name) => {
      const c = document.createElement("div");
      c.className = "mg-cell" + (lit.has(name) ? " lit" : "");
      c.innerHTML = '<div class="mg-dots"><i></i><i></i><i></i></div>' + name;
      mapGrid.appendChild(c);
    });
  }

  /* ============================================================
     3. S09 — 체험 데모
  ============================================================ */
  const D = window.DEMO_DATA;
  if (!D) return;

  /* ---- 탭 전환 ---- */
  const tabs = document.querySelectorAll(".demo-tab");
  const paneGen = document.getElementById("pane-gen");
  const paneWb = document.getElementById("pane-wb");
  tabs.forEach((t) =>
    t.addEventListener("click", () => {
      tabs.forEach((x) => x.classList.toggle("on", x === t));
      const isGen = t.dataset.tab === "gen";
      paneGen.classList.toggle("hide", !isGen);
      paneWb.classList.toggle("hide", isGen);
      if (!isGen) renderCloze();
    })
  );

  /* ---- 지문 표시 ---- */
  const passageBox = document.getElementById("demo-passage-box");
  if (passageBox) passageBox.textContent = D.passage;

  /* ---- 유형 선택 ---- */
  const typesBox = document.getElementById("demo-types");
  let pickedType = "빈칸 추론";
  Object.keys(D.questions).forEach((name, i) => {
    const b = document.createElement("button");
    b.className = "type-pick" + (i === 0 ? " on" : "");
    b.textContent = name;
    b.addEventListener("click", () => {
      pickedType = name;
      typesBox.querySelectorAll(".type-pick").forEach((x) => x.classList.toggle("on", x === b));
    });
    typesBox.appendChild(b);
  });

  /* ---- 난이도 ---- */
  let pickedDiff = "중급";
  document.querySelectorAll(".diff-chip").forEach((c) =>
    c.addEventListener("click", () => {
      pickedDiff = c.dataset.v;
      document.querySelectorAll(".diff-chip").forEach((x) => x.classList.toggle("on", x === c));
    })
  );

  /* ---- 생성 시뮬레이션 ---- */
  const goBtn = document.getElementById("demo-go");
  const progress = document.getElementById("demo-progress");
  const out = document.getElementById("demo-out");
  let running = false;

  goBtn.addEventListener("click", () => {
    if (running) return;
    running = true;
    goBtn.disabled = true;
    out.innerHTML = "";
    let pi = 0;
    progress.textContent = "";

    (function phaseTick() {
      if (pi < D.phases.length) {
        progress.innerHTML = "▸ " + D.phases[pi];
        pi++;
        setTimeout(phaseTick, 520 + Math.random() * 280);
      } else {
        progress.innerHTML = '<span class="ok">✓ 생성 완료 — 품질 게이트 통과 · 2크레딧 차감</span>';
        renderQuestion();
      }
    })();
  });

  function renderQuestion() {
    const q = D.questions[pickedType];
    const card = document.createElement("div");
    card.className = "qcard";
    card.innerHTML =
      '<div class="q-head"><span class="q-badge">Q1</span><span class="q-cat">' + q.cat +
      '</span><span class="q-cat">' + pickedType + '</span><span class="q-diff">' + pickedDiff + "</span></div>" +
      '<div class="q-direction"></div>' +
      '<div class="q-passage">' + q.passage + "</div>" +
      '<div class="q-options"></div>' +
      '<button class="q-reveal-btn">정답 · 해설 보기</button>' +
      '<div class="q-answer"></div>';
    out.appendChild(card);

    const dirEl = card.querySelector(".q-direction");
    window.deckType(dirEl, q.direction, 16, () => {
      const optsEl = card.querySelector(".q-options");
      const circled = ["①", "②", "③", "④", "⑤"];
      q.options.forEach((o, i) => {
        setTimeout(() => {
          const d = document.createElement("div");
          d.className = "q-opt";
          d.dataset.idx = i + 1;
          d.innerHTML = "<span>" + circled[i] + "</span><span>" + o + "</span>";
          d.style.opacity = "0";
          d.style.transform = "translateY(8px)";
          d.style.transition = "all .45s cubic-bezier(.16,1,.3,1)";
          optsEl.appendChild(d);
          requestAnimationFrame(() => {
            d.style.opacity = "1";
            d.style.transform = "translateY(0)";
          });
        }, i * 160);
      });
      setTimeout(() => {
        running = false;
        goBtn.disabled = false;
      }, q.options.length * 160 + 300);
    });

    const revealBtn = card.querySelector(".q-reveal-btn");
    const ansEl = card.querySelector(".q-answer");
    revealBtn.addEventListener("click", () => {
      const open = ansEl.classList.toggle("open");
      revealBtn.textContent = open ? "정답 · 해설 접기" : "정답 · 해설 보기";
      if (open && !ansEl.dataset.filled) {
        ansEl.dataset.filled = "1";
        const circled = ["①", "②", "③", "④", "⑤"];
        ansEl.innerHTML =
          '<div class="qa-row"><span class="qa-k">정답</span> ' + circled[q.answer - 1] + "</div>" +
          '<div class="qa-row"><span class="qa-k">해설</span> ' + q.explanation + "</div>" +
          '<div class="qa-row"><span class="qa-k wrong">오답 해설</span><br/>' + q.wrong.join("<br/>") + "</div>";
        card.querySelector('.q-opt[data-idx="' + q.answer + '"]').classList.add("correct-reveal");
      }
    });
  }

  /* ---- 워크북 결정론 변형 (mulberry32 — 실제 엔진과 동일 계열 PRNG) ---- */
  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const STOP = new Set(["the", "a", "an", "of", "in", "to", "is", "are", "was", "were", "that", "this", "and", "or", "but", "it", "its", "from", "for", "with", "than", "who", "what", "we", "our", "they", "their", "them", "one's", "own", "not", "far", "less", "more", "when", "where", "into", "by", "on"]);

  let wbSeed = 1;
  const densityInput = document.getElementById("wb-density");
  const densityV = document.getElementById("wb-density-v");
  const seedLabel = document.getElementById("wb-seed");
  const sheet = document.getElementById("wb-sheet");
  const bank = document.getElementById("wb-bank");

  function renderCloze() {
    if (!sheet) return;
    const density = parseInt(densityInput.value, 10) / 100;
    const rng = mulberry32(wbSeed * 1000003 + Math.round(density * 100));
    const tokens = D.passage.split(/(\s+)/);
    // 후보: 5자 이상 내용어
    const cand = [];
    tokens.forEach((tk, i) => {
      const w = tk.replace(/[^A-Za-z']/g, "");
      if (w.length >= 5 && !STOP.has(w.toLowerCase())) cand.push(i);
    });
    // 시드 셔플 후 밀도만큼 선택
    const shuffled = cand.slice();
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const pickN = Math.max(3, Math.round(cand.length * density));
    const picked = new Set(shuffled.slice(0, pickN));

    let n = 0;
    const bankWords = [];
    const html = tokens
      .map((tk, i) => {
        if (!picked.has(i)) return tk;
        n++;
        const w = tk.replace(/[^A-Za-z']/g, "");
        bankWords.push(w);
        const tail = tk.replace(/^[A-Za-z']+/, "");
        return '<span class="wb-blank"><sup>' + n + "</sup>" + w + "</span>" + tail;
      })
      .join("");
    sheet.innerHTML = html;
    bankWords.sort();
    bank.innerHTML = "<span>단어 은행</span>" + bankWords.map((w) => "<span>" + w + "</span>").join("");
    seedLabel.textContent = "seed " + wbSeed;
    densityV.textContent = densityInput.value + "%";
  }

  if (densityInput) {
    densityInput.addEventListener("input", renderCloze);
    document.getElementById("wb-reroll").addEventListener("click", () => {
      wbSeed++;
      renderCloze();
    });
  }
})();
