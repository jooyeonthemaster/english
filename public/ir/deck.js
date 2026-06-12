/* ============================================================
   smoat IR Deck Engine
   - 스텝 기반 리빌: 슬라이드 내 [data-s="n"] 요소는 step >= n 일 때 .on
   - 네비게이션: 키보드(←→/Space/PgUp·Dn/Home/End) + 화면 클릭 + HUD 버튼
   - 인터랙티브 영역([data-ui]) 내부 클릭은 네비게이션에서 제외
   - URL 해시(#5.2)로 위치 저장/복원
   ============================================================ */
(function () {
  "use strict";

  const root = document.getElementById("deck");
  const slides = Array.from(root.querySelectorAll(".slide"));
  const defs = slides.map((el) => ({
    el,
    steps: Math.max(1, parseInt(el.dataset.steps || "1", 10)),
    act: el.dataset.act || "",
    theme: el.dataset.theme || "light",
  }));

  let pos = { s: 0, k: 0 };
  let animLock = false;

  /* ---------- HUD refs ---------- */
  const hudAct = document.getElementById("hud-act");
  const hudNum = document.getElementById("hud-num");
  const hudTotal = document.getElementById("hud-total");
  const hudDots = document.getElementById("hud-dots");
  const hudBar = document.getElementById("hud-bar");
  const btnPrev = document.getElementById("nav-prev");
  const btnNext = document.getElementById("nav-next");
  const tocBtn = document.getElementById("hud-toc-btn");
  const tocPanel = document.getElementById("toc");

  hudTotal.textContent = String(defs.length).padStart(2, "0");
  const totalSteps = defs.reduce((a, d) => a + d.steps, 0);

  /* ---------- 위치 복원 ---------- */
  (function restore() {
    const m = location.hash.match(/^#(\d+)(?:\.(\d+))?$/);
    if (m) {
      const s = Math.min(parseInt(m[1], 10), defs.length - 1);
      const k = Math.min(parseInt(m[2] || "0", 10), defs[s].steps - 1);
      pos = { s, k };
    }
  })();

  /* ---------- 렌더 ---------- */
  function applySteps(def, k) {
    def.el.querySelectorAll("[data-s]").forEach((n) => {
      const at = parseInt(n.dataset.s, 10);
      const until = n.dataset.sUntil ? parseInt(n.dataset.sUntil, 10) : Infinity;
      const on = k >= at && k < until;
      if (on && !n.classList.contains("on")) {
        n.classList.add("on");
        fireReveal(n);
      } else if (!on) {
        n.classList.remove("on");
      }
    });
    // 무대 양보: data-dim-at — 해당 스텝부터 잔류 강등(흐려짐, 삭제 금지)
    def.el.querySelectorAll("[data-dim-at]").forEach((n) => {
      n.classList.toggle("dimmed", k >= parseInt(n.dataset.dimAt, 10));
    });
    // 슬라이드에 현재 스텝 노출 (스텝 분기 CSS/JS 훅용)
    def.el.dataset.step = String(k);
    def.el.dispatchEvent(new CustomEvent("deck:step", { detail: { step: k } }));
  }

  function render(prevS) {
    const def = defs[pos.s];
    defs.forEach((d, i) => {
      d.el.classList.toggle("active", i === pos.s);
      d.el.classList.toggle("was", i === prevS && i !== pos.s);
    });
    applySteps(def, pos.k);

    document.body.dataset.theme = def.theme;

    /* HUD */
    hudAct.textContent = def.act;
    hudNum.textContent = String(pos.s + 1).padStart(2, "0");
    hudDots.innerHTML = "";
    if (def.steps > 1) {
      for (let i = 0; i < def.steps; i++) {
        const d = document.createElement("span");
        d.className = "hud-dot" + (i <= pos.k ? " on" : "");
        hudDots.appendChild(d);
      }
    }
    const done = defs.slice(0, pos.s).reduce((a, d) => a + d.steps, 0) + pos.k + 1;
    hudBar.style.width = (done / totalSteps) * 100 + "%";
    btnPrev.classList.toggle("dim", pos.s === 0 && pos.k === 0);
    const last = pos.s === defs.length - 1 && pos.k === defs[pos.s].steps - 1;
    btnNext.classList.toggle("dim", last);

    history.replaceState(null, "", "#" + pos.s + "." + pos.k);
  }

  /* ---------- 이동 ---------- */
  function go(s, k) {
    const prevS = pos.s;
    pos = { s, k };
    if (prevS !== s) {
      animLock = true;
      setTimeout(() => (animLock = false), 520);
    }
    render(prevS);
  }
  function markMoved() {
    document.body.classList.add("moved");
  }
  function next() {
    if (animLock) return;
    markMoved();
    const d = defs[pos.s];
    if (pos.k < d.steps - 1) go(pos.s, pos.k + 1);
    else if (pos.s < defs.length - 1) go(pos.s + 1, 0);
  }
  function prev() {
    if (animLock) return;
    markMoved();
    if (pos.k > 0) go(pos.s, pos.k - 1);
    else if (pos.s > 0) go(pos.s - 1, defs[pos.s - 1].steps - 1);
  }

  /* ---------- 입력 ---------- */
  window.addEventListener("keydown", (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key;
    if (["PageDown", "ArrowRight", "ArrowDown", " ", "Enter"].includes(k)) {
      if (e.target.closest("[data-ui]")) return;
      e.preventDefault();
      if (!e.repeat) next();
    } else if (["PageUp", "ArrowLeft", "ArrowUp", "Backspace"].includes(k)) {
      e.preventDefault();
      if (!e.repeat) prev();
    } else if (k === "f" || k === "F") {
      e.preventDefault();
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen();
    } else if (k === "Home") {
      e.preventDefault();
      go(0, 0);
    } else if (k === "End") {
      e.preventDefault();
      go(defs.length - 1, 0);
    } else if (k === "Escape") {
      tocPanel.classList.remove("open");
    }
  });

  root.addEventListener("click", (e) => {
    if (e.target.closest("[data-ui], a, button, input, textarea, select")) return;
    // 좌측 18% 클릭 = 이전, 그 외 = 다음
    if (e.clientX < window.innerWidth * 0.18) prev();
    else next();
  });

  btnPrev.addEventListener("click", prev);
  btnNext.addEventListener("click", next);

  /* ---------- 목차 ---------- */
  (function buildToc() {
    const groups = [];
    defs.forEach((d, i) => {
      const last = groups[groups.length - 1];
      if (!last || last.act !== d.act) groups.push({ act: d.act, items: [] });
      const title = d.el.dataset.title || d.act;
      groups[groups.length - 1].items.push({ i, title });
    });
    const frag = document.createDocumentFragment();
    groups.forEach((g) => {
      const h = document.createElement("div");
      h.className = "toc-act";
      h.textContent = g.act;
      frag.appendChild(h);
      g.items.forEach((it) => {
        const b = document.createElement("button");
        b.className = "toc-item";
        b.innerHTML =
          '<span class="toc-n">' + String(it.i + 1).padStart(2, "0") + "</span>" + it.title;
        b.addEventListener("click", () => {
          tocPanel.classList.remove("open");
          go(it.i, 0);
        });
        frag.appendChild(b);
      });
    });
    tocPanel.querySelector(".toc-list").appendChild(frag);
    tocBtn.addEventListener("click", () => tocPanel.classList.toggle("open"));
    tocPanel.addEventListener("click", (e) => {
      if (e.target === tocPanel) tocPanel.classList.remove("open");
    });
  })();

  /* ---------- 리빌 이펙트: 카운트업 / SVG 드로우 / 바 성장 ---------- */
  function fireReveal(node) {
    node.querySelectorAll("[data-count]").forEach(countUp);
    if (node.hasAttribute("data-count")) countUp(node);
    node.querySelectorAll("[data-draw]").forEach(drawPath);
    if (node.hasAttribute("data-draw")) drawPath(node);
    node.querySelectorAll("[data-grow]").forEach(growBar);
    if (node.hasAttribute("data-grow")) growBar(node);
  }

  function countUp(el) {
    if (el.dataset.counted) return;
    el.dataset.counted = "1";
    const target = parseFloat(el.dataset.count);
    const decimals = (el.dataset.count.split(".")[1] || "").length;
    const dur = parseInt(el.dataset.dur || "1300", 10);
    const fmt = el.dataset.fmt || "comma"; // comma | plain
    const t0 = performance.now();
    function frame(t) {
      const p = Math.min(1, (t - t0) / dur);
      const e = 1 - Math.pow(1 - p, 4); // easeOutQuart
      const v = target * e;
      el.textContent =
        fmt === "comma"
          ? v.toLocaleString("ko-KR", {
              minimumFractionDigits: decimals,
              maximumFractionDigits: decimals,
            })
          : v.toFixed(decimals);
      if (p < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  function drawPath(el) {
    if (el.dataset.drawn) return;
    el.dataset.drawn = "1";
    const len = el.getTotalLength ? el.getTotalLength() : 0;
    if (!len) return;
    el.style.strokeDasharray = len;
    el.style.strokeDashoffset = len;
    el.getBoundingClientRect();
    el.style.transition =
      "stroke-dashoffset " + (el.dataset.dur || 1600) + "ms cubic-bezier(.16,1,.3,1) " + (el.dataset.delay || 0) + "ms";
    el.style.strokeDashoffset = "0";
  }

  function growBar(el) {
    if (el.dataset.grown) return;
    el.dataset.grown = "1";
    const w = el.dataset.grow;
    el.getBoundingClientRect();
    requestAnimationFrame(() => {
      if (el.dataset.axis === "y") el.style.height = w;
      else el.style.width = w;
    });
  }

  /* 타이핑 효과 — window.deckType(el, text, speed) 전역 제공 (데모 섹션용) */
  window.deckType = function (el, text, speed, done) {
    let i = 0;
    el.textContent = "";
    el.classList.add("typing");
    (function tick() {
      if (i <= text.length) {
        el.textContent = text.slice(0, i);
        i++;
        setTimeout(tick, speed || 14);
      } else {
        el.classList.remove("typing");
        if (done) done();
      }
    })();
  };

  window.deckGo = go; // 데모/디버그용
  window.deckNext = next;

  /* ---------- 초기화 ---------- */
  document.body.classList.add("ready");
  render(-1);
})();
