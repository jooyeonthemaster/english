/* ============================================================
   SMOAT LINE — deck engine
   컨셉: 슬라이드 = 공정(STATION). 상단 RAIL = 라인, 하단 READOUT = 물류(IN/OUT).
   코어(스케일·해시라우팅·스텝·입력·비디오 규율)는 검증된 구현 — 변경 금지.
   ============================================================ */
(() => {
  const stage = document.getElementById('stage');
  const slides = [...document.querySelectorAll('.slide')];
  const N = slides.length;
  let cur = 0, step = 0;

  /* ---------- scale to fit (zoom/DPI/late-chrome 대응) ---------- */
  let lastScale = 0;
  const fit = () => {
    const vw = window.visualViewport ? visualViewport.width : innerWidth;
    const vh = window.visualViewport ? visualViewport.height : innerHeight;
    const s = Math.min(vw / 1920, vh / 1080);
    if (Math.abs(s - lastScale) > 0.0005) { lastScale = s; stage.style.transform = `scale(${s})`; }
  };
  addEventListener('resize', fit);
  addEventListener('load', fit);
  if (window.visualViewport) visualViewport.addEventListener('resize', fit);
  fit(); requestAnimationFrame(fit); setTimeout(fit, 250); setInterval(fit, 800);

  /* ---------- hash routing ---------- */
  const parseHash = () => {
    const m = location.hash.match(/^#\/(\d+)(?:\/(\d+))?/);
    return m ? [Math.min(N - 1, Math.max(0, +m[1] - 1)), +(m[2] || 0)] : [0, 0];
  };
  const writeHash = () => history.replaceState(null, '', `#/${cur + 1}${step ? '/' + step : ''}`);

  /* ---------- steps ---------- */
  const stepsOf = (i) => {
    let mx = 0;
    slides[i].querySelectorAll('[data-step]').forEach((e) => { mx = Math.max(mx, +e.dataset.step || 0); });
    return mx;
  };
  const applySteps = () => {
    slides[cur].querySelectorAll('[data-step]').forEach((e) => {
      e.classList.toggle('on', (+e.dataset.step || 0) <= step);
    });
    slides[cur].dataset.curStep = String(step);
  };

  /* ---------- HUD refs ---------- */
  const hudSt   = document.getElementById('hud-st');
  const hudZone = document.getElementById('hud-zone');
  const hudPart = document.getElementById('hud-part');
  const hudTc   = document.getElementById('hud-tc');
  const rail    = document.getElementById('rail');
  const roIn    = document.getElementById('ro-in');
  const roOut   = document.getElementById('ro-out');
  const roNote  = document.getElementById('ro-note');
  const osd     = document.getElementById('osd');
  const sweep   = document.getElementById('sweep');
  const gflash  = document.getElementById('gridflash');

  /* ---------- RAIL 구축 ---------- */
  slides.forEach((s, i) => {
    const n = document.createElement('div');
    n.className = 'node';
    if (i > 0 && s.dataset.zone !== slides[i - 1].dataset.zone) n.classList.add('zstart');
    n.innerHTML = `<span class="pip"></span><span class="tip">${String(i + 1).padStart(2, '0')} · ${s.dataset.kr || ''}</span>`;
    n.addEventListener('click', (e) => { e.stopPropagation(); show(i); });
    rail.appendChild(n);
  });
  const railNodes = [...rail.querySelectorAll('.node')];

  /* ---------- LINE MAP (공정도) 구축 ---------- */
  const lm = document.getElementById('linemap');
  const lmZones = lm.querySelector('.zones');
  (() => {
    const groups = [];
    slides.forEach((s, i) => {
      const z = s.dataset.zone || '—';
      const last = groups[groups.length - 1];
      if (last && last.zone === z) last.items.push(i);
      else groups.push({ zone: z, en: s.dataset.zoneEn || '', items: [i] });
    });
    groups.forEach((g) => {
      const row = document.createElement('div');
      row.className = 'zrow';
      const cells = g.items.map((i) => {
        const s = slides[i];
        return `<div class="cell" data-i="${i}">
            <div class="n">${String(i + 1).padStart(2, '0')} · ${s.dataset.title || ''}</div>
            <div class="t">${s.dataset.kr || ''}</div>
            <div class="k">${s.dataset.out || ''}</div>
          </div>`;
      }).join('<div class="arrow">▸</div>');
      row.innerHTML = `<div class="zlab"><div class="zn">${g.zone}</div><div class="zd">${g.en}</div></div>
        <div class="zcells">${cells}</div>`;
      lmZones.appendChild(row);
    });
    lmZones.querySelectorAll('.cell').forEach((c) => {
      c.addEventListener('click', (e) => { e.stopPropagation(); lm.classList.remove('open'); show(+c.dataset.i); });
    });
  })();

  /* ---------- 표시 ---------- */
  const show = (i, st = 0, quiet = false) => {
    if (i < 0 || i >= N) return;
    const prev = cur;
    slides[cur].classList.remove('active');
    cur = i; step = Math.min(st, stepsOf(i));
    const s = slides[cur];
    s.classList.add('active');
    stage.classList.toggle('paper-mode', s.classList.contains('slide--paper'));
    applySteps(); writeHash();

    const num = String(cur + 1).padStart(2, '0');
    hudSt.innerHTML = `<b>${s.dataset.title || ''}</b> &nbsp;/&nbsp; ${num}—${String(N).padStart(2, '0')}`;
    hudZone.textContent = s.dataset.zone || '';
    hudPart.textContent = s.dataset.part || '';
    roIn.textContent = s.dataset.in || '—';
    roOut.textContent = s.dataset.out || '—';
    roNote.textContent = s.dataset.note || '';
    roNote.style.display = s.dataset.note ? '' : 'none';

    railNodes.forEach((n, k) => {
      n.classList.toggle('done', k <= cur);
      n.classList.toggle('here', k === cur);
    });

    if (!quiet && prev !== i) {
      osd.textContent = s.dataset.title || `ST ${num}`;
      osd.classList.remove('show'); void osd.offsetWidth; osd.classList.add('show');
      sweep.classList.remove('go'); void sweep.offsetWidth; sweep.classList.add('go');
      gflash.classList.remove('go'); void gflash.offsetWidth; gflash.classList.add('go');
    }

    // 미디어 규율: 현재 슬라이드 외 전부 정지
    slides.forEach((sl, k) => sl.querySelectorAll('video').forEach((v) => { if (k !== cur) v.pause(); }));
    s.dispatchEvent(new CustomEvent('slide:enter', { detail: { step } }));
  };

  const next  = () => { if (step < stepsOf(cur)) { step++; applySteps(); writeHash(); slides[cur].dispatchEvent(new CustomEvent('slide:step', { detail: { step } })); } else show(cur + 1); };
  const prevF = () => { if (step > 0) { step--; applySteps(); writeHash(); slides[cur].dispatchEvent(new CustomEvent('slide:step', { detail: { step } })); } else show(cur - 1, 99); };

  const toggleMap = () => {
    lm.classList.toggle('open');
    lmZones.querySelectorAll('.cell').forEach((c) => c.classList.toggle('here', +c.dataset.i === cur));
  };

  /* ---------- 러닝 타임코드 (세미나 페이스용) ---------- */
  const t0 = performance.now();
  setInterval(() => {
    const s = Math.floor((performance.now() - t0) / 1000);
    hudTc.textContent =
      `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  }, 500);

  /* ---------- 입력 ---------- */
  let numBuf = '', numT = 0;
  addEventListener('keydown', (e) => {
    const k = e.key;
    if (k === 'ArrowRight' || k === ' ' || k === 'PageDown') { e.preventDefault(); if (!lm.classList.contains('open')) next(); }
    else if (k === 'ArrowLeft' || k === 'PageUp') { e.preventDefault(); if (!lm.classList.contains('open')) prevF(); }
    else if (k === 'Home') show(0);
    else if (k === 'End') show(N - 1);
    else if (k.toLowerCase() === 'g' || k === 'Escape') toggleMap();
    else if (k.toLowerCase() === 'f') document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();
    else if (/^\d$/.test(k)) {
      numBuf += k; clearTimeout(numT);
      numT = setTimeout(() => { const n = +numBuf; numBuf = ''; if (n >= 1 && n <= N) show(n - 1); }, 620);
    }
  });
  addEventListener('click', (e) => {
    if (lm.classList.contains('open')) return;
    if (e.target.closest('a,button,input,select,textarea,video,[data-noadvance],.phone,.tablet,.no-adv,#rail')) return;
    (e.clientX / innerWidth > 0.3) ? next() : prevF();
  });
  let wheelLock = 0;
  addEventListener('wheel', (e) => {
    if (e.target.closest('[data-noadvance],.phone,.tablet,.scrollable')) return;
    const now = Date.now(); if (now - wheelLock < 650) return; wheelLock = now;
    e.deltaY > 0 ? next() : prevF();
  }, { passive: true });

  /* ---------- boot ---------- */
  const [i0, s0] = parseHash();
  slides.forEach((s) => s.classList.remove('active'));
  show(i0, s0, true);
  addEventListener('hashchange', () => {
    const [i, s] = parseHash();
    if (i !== cur || s !== step) show(i, s, true);
  });

  /* 슬라이드 스크립트에서 쓸 수 있는 최소 API */
  window.__deck = { show, next, prev: prevF, get cur() { return cur; }, get step() { return step; }, N };
})();
