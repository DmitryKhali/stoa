/* Στοά — интерактив: портик, оракул, игра о власти, ниши, хронология, собрание, упражнения */
(function () {
  'use strict';

  const D = window.STOA_DATA;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (a, b) => a + Math.random() * (b - a);
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const hasGsap = !!window.gsap;
  const anim = hasGsap && !reduced;
  if (hasGsap && window.ScrollTrigger) gsap.registerPlugin(ScrollTrigger);

  const byId = Object.fromEntries(D.thinkers.map(t => [t.id, t]));
  const workById = Object.fromEntries(D.works.map(w => [w.id, w]));
  const themeById = Object.fromEntries(D.themes.map(t => [t.id, t]));

  function plural(n, f) {
    const a = Math.abs(n) % 100, b = a % 10;
    if (a > 10 && a < 20) return f[2];
    if (b > 1 && b < 5) return f[1];
    if (b === 1) return f[0];
    return f[2];
  }
  const fmt = n => n.toLocaleString('ru-RU');
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const sourceOf = q => {
    const w = workById[q.work];
    return (w ? w.title : '') + (q.ref ? ', ' + q.ref : '');
  };
  const initial = t => (/[Α-Ωἀ-ῼ]/.test(t.orig) ? t.orig : t.short).trim()[0].replace('М', 'Μ');

  /* ———————— Венок (избранное) ———————— */
  const Wreath = {
    key: 'stoa.wreath',
    set: new Set(),
    load() { try { this.set = new Set(JSON.parse(localStorage.getItem(this.key) || '[]')); } catch (e) { this.set = new Set(); } },
    save() { try { localStorage.setItem(this.key, JSON.stringify([...this.set])); } catch (e) { /* хранилище недоступно */ } },
    has(id) { return this.set.has(id); },
    toggle(id) { this.set.has(id) ? this.set.delete(id) : this.set.add(id); this.save(); this.sync(); return this.set.has(id); },
    sync() {
      const n = this.set.size;
      $('#wreathCount').textContent = n;
      $('#wreathWord').textContent = plural(n, ['изречение', 'изречения', 'изречений']);
      $$('[data-fav]').forEach(b => b.setAttribute('aria-pressed', this.has(b.dataset.fav) ? 'true' : 'false'));
    }
  };
  Wreath.load();

  /* ———————— Тост и копирование ———————— */
  let toastTimer = 0;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('is-on'), 2200);
  }
  function copyQuote(q) {
    const text = '«' + q.text + '»\n— ' + byId[q.by].name + ', ' + sourceOf(q);
    const fallback = () => {
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      ta.remove();
      toast(ok ? 'Скопировано' : 'Выделите текст и скопируйте вручную');
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => toast('Скопировано'), fallback);
    } else fallback();
  }

  /* ———————— Разбивка текста ———————— */
  function splitChars(el) {
    if (el.dataset.splitDone) return $$('.char', el);
    const words = el.textContent.trim().split(/\s+/);
    el.innerHTML = words.map(w => '<span class="word">' + [...w].map(c => '<span class="char">' + esc(c) + '</span>').join('') + '</span>').join(' ');
    el.dataset.splitDone = '1';
    return $$('.char', el);
  }
  function splitWords(el) {
    const words = el.textContent.trim().split(/\s+/);
    el.innerHTML = words.map(w => '<span class="word">' + esc(w) + '</span>').join(' ');
    return $$('.word', el);
  }

  /* ———————— Прокрутка: родная, без перехвата колеса ———————— */
  function scrollToEl(target, offset) {
    if (!target) return;
    const y = target.getBoundingClientRect().top + window.scrollY + (offset || 0);
    window.scrollTo({ top: Math.max(0, y), behavior: reduced ? 'auto' : 'smooth' });
  }
  document.addEventListener('click', e => {
    const a = e.target.closest('a[href^="#"]');
    if (!a) return;
    const id = a.getAttribute('href').slice(1);
    const target = id ? document.getElementById(id) : null;
    if (!target) return;
    e.preventDefault();
    closeMenu();
    scrollToEl(target, id === 'top' ? 0 : -10);
    if (id === 'oracle' && a.closest('.hero')) setTimeout(() => Oracle.draw(), 900);
  });

  /* ———————— Навигация ———————— */
  const nav = $('#nav');
  const burger = $('#burger');
  function closeMenu() { nav.classList.remove('is-open'); burger.setAttribute('aria-expanded', 'false'); }
  burger.addEventListener('click', () => {
    const open = !nav.classList.contains('is-open');
    nav.classList.toggle('is-open', open);
    burger.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
  let lastY = 0, navTick = false;
  window.addEventListener('scroll', () => {
    if (navTick) return;
    navTick = true;
    requestAnimationFrame(() => {
      navTick = false;
      const y = window.scrollY, heroH = Hero.el.offsetHeight;
      nav.classList.toggle('is-solid', y > heroH - 90);
      if (!nav.classList.contains('is-open')) {
        if (y > heroH && y > lastY + 4) nav.classList.add('is-hidden');
        else if (y < lastY - 4) nav.classList.remove('is-hidden');
      }
      Hero.scrollP = clamp(y / heroH, 0, 1);
      lastY = y;
    });
  }, { passive: true });

  if ('IntersectionObserver' in window) {
    const darks = new Set();
    const dio = new IntersectionObserver(entries => {
      entries.forEach(en => en.isIntersecting ? darks.add(en.target) : darks.delete(en.target));
      nav.classList.toggle('on-dark', darks.size > 0);
    }, { rootMargin: '0px 0px -94% 0px' });
    $$('.band.is-dark, .footer').forEach(b => dio.observe(b));
    const navLinks = $$('[data-nav]');
    const io = new IntersectionObserver(entries => {
      entries.forEach(en => {
        if (en.isIntersecting) navLinks.forEach(l => l.classList.toggle('is-active', l.dataset.nav === en.target.id));
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    navLinks.forEach(l => { const s = document.getElementById(l.dataset.nav); if (s) io.observe(s); });
  }

  /* ———————— Курсор и магниты ———————— */
  const cursor = $('.cursor');
  const ring = $('.cursor__ring'), dot = $('.cursor__dot'), clabel = $('.cursor__label');
  const mouse = { x: innerWidth / 2, y: innerHeight / 2, rx: innerWidth / 2, ry: innerHeight / 2 };
  if (fine) {
    document.body.classList.add('has-cursor');
    let ringOn = false;
    const ringLoop = () => {
      mouse.rx = lerp(mouse.rx, mouse.x, 0.2);
      mouse.ry = lerp(mouse.ry, mouse.y, 0.2);
      ring.style.transform = 'translate3d(' + mouse.rx + 'px,' + mouse.ry + 'px,0) translate(-50%,-50%)';
      if (Math.abs(mouse.rx - mouse.x) + Math.abs(mouse.ry - mouse.y) > 0.3) requestAnimationFrame(ringLoop);
      else ringOn = false;
    };
    window.addEventListener('pointermove', e => {
      mouse.x = e.clientX; mouse.y = e.clientY;
      dot.style.transform = 'translate3d(' + mouse.x + 'px,' + mouse.y + 'px,0) translate(-50%,-50%)';
      if (!ringOn) { ringOn = true; requestAnimationFrame(ringLoop); }
    }, { passive: true });
    window.addEventListener('pointerdown', () => cursor.classList.add('is-down'));
    window.addEventListener('pointerup', () => cursor.classList.remove('is-down'));
    document.addEventListener('pointerover', e => {
      const t = e.target.closest('[data-cursor], a, button, [role="button"], select, input, .tile, .chip');
      const lab = t && t.closest('[data-cursor]');
      cursor.classList.toggle('is-hover', !!t && !lab);
      cursor.classList.toggle('is-label', !!lab);
      if (lab) clabel.textContent = lab.dataset.cursor;
    });
    $$('[data-magnetic]').forEach(el => {
      el.addEventListener('pointermove', e => {
        const r = el.getBoundingClientRect();
        const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
        el.style.transform = 'translate(' + dx * 0.22 + 'px,' + dy * 0.3 + 'px)';
      });
      el.addEventListener('pointerleave', () => {
        if (hasGsap) gsap.to(el, { x: 0, y: 0, duration: 0.8, ease: 'elastic.out(1, 0.4)', clearProps: 'transform' });
        else el.style.transform = '';
      });
    });
  }

  /* ———————— Портик: фото бюста на фоне размытой Стои ———————— */
  const BUSTS = D.thinkers.filter(t => t.photo && t.photo.kind === 'bust');
  const Hero = {
    el: $('#top'),
    bg: $('#heroBg'),
    wrap: $('#heroBusts'),
    idx: Math.max(0, BUSTS.findIndex(t => t.id === 'marcus')),
    frames: [],
    mx: 0, my: 0, tmx: 0, tmy: 0, scrollP: 0, lastSp: -1,
    visible: true, running: false, busy: false,
    init() {
      this.wrap.innerHTML = BUSTS.map((t, i) => {
        const p = t.photo;
        return '<div class="bust' + (i === this.idx ? ' is-on' : '') + '" style="--ar:' + p.w + '/' + p.h + ';--h:' + p.hero + '">' +
          '<div class="bust__anim"><div class="bust__par">' +
          '<img src="' + p.src + '" alt="" width="' + p.w + '" height="' + p.h + '" decoding="async"' + (i === this.idx ? ' fetchpriority="high"' : ' loading="lazy"') + '>' +
          '<span class="bust__light" style="-webkit-mask-image:url(' + p.src + ');mask-image:url(' + p.src + ')"><i></i></span>' +
          '</div></div></div>';
      }).join('');
      this.frames = $$('.bust', this.wrap);
      this.setText(BUSTS[this.idx], false);
      window.addEventListener('pointermove', e => {
        this.tmx = (e.clientX / innerWidth) * 2 - 1;
        this.tmy = (e.clientY / innerHeight) * 2 - 1;
        this.kick();
      }, { passive: true });
      window.addEventListener('scroll', () => this.kick(), { passive: true });
      if ('IntersectionObserver' in window) {
        new IntersectionObserver(([en]) => { this.visible = en.isIntersecting; if (this.visible) this.kick(); }).observe(this.el);
      }
      this.el.addEventListener('click', e => {
        if (e.target.closest('a')) return;
        if (e.target.closest('#bustNext') || innerWidth <= 900 || e.clientX < innerWidth * 0.55) this.next();
      });
      this.kick();
      const img = $('img', this.frames[this.idx]);
      return img.decode ? img.decode().catch(() => {}) : Promise.resolve();
    },
    kick() {
      if (this.running || !this.visible || reduced) return;
      this.running = true;
      requestAnimationFrame(() => this.loop());
    },
    loop() {
      this.mx = lerp(this.mx, this.tmx, 0.07);
      this.my = lerp(this.my, this.tmy, 0.07);
      const sp = this.scrollP, H = this.el.offsetHeight;
      this.bg.style.transform = 'translate3d(' + (-this.mx * 18).toFixed(2) + 'px,' + (-this.my * 12 + sp * H * 0.18).toFixed(2) + 'px,0) scale(' + (1.08 + sp * 0.06).toFixed(4) + ')';
      const f = this.frames[this.idx];
      $('.bust__par', f).style.transform = 'translate3d(' + (this.mx * 12).toFixed(2) + 'px,' + (this.my * 8 + sp * H * 0.28).toFixed(2) + 'px,0)';
      $('.bust__light i', f).style.transform = 'translate3d(' + (this.mx * 26).toFixed(2) + '%,' + (this.my * 22).toFixed(2) + '%,0)';
      const moving = Math.abs(this.mx - this.tmx) + Math.abs(this.my - this.tmy) > 0.002;
      if (this.visible && (moving || this.lastSp !== sp)) { this.lastSp = sp; requestAnimationFrame(() => this.loop()); }
      else this.running = false;
    },
    setText(t, animate) {
      const name = $('#heroName'), meta = $('#heroMeta'), qt = $('#heroQuoteText'), qb = $('#heroQuoteBy');
      const swap = () => {
        name.textContent = t.name;
        meta.textContent = t.years + ' · ' + t.epithet;
        qt.textContent = t.motto;
        qb.textContent = '— ' + t.name;
      };
      if (!animate || !anim) { swap(); return; }
      gsap.to([name, meta, '#heroQuote'], {
        opacity: 0, y: -10, duration: 0.35, stagger: 0.05, ease: 'power2.in',
        onComplete: () => { swap(); gsap.fromTo([name, meta, '#heroQuote'], { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.8, stagger: 0.07, ease: 'expo.out' }); }
      });
    },
    next() {
      if (this.busy) return;
      this.busy = true;
      const from = this.frames[this.idx];
      this.idx = (this.idx + 1) % BUSTS.length;
      const to = this.frames[this.idx];
      const t = BUSTS[this.idx];
      const img = $('img', to);
      img.loading = 'eager';
      const go = () => {
        this.setText(t, true);
        Dust.burst();
        to.classList.add('is-on');
        this.lastSp = -1;
        this.kick();
        if (!anim) { from.classList.remove('is-on'); this.busy = false; return; }
        gsap.to($('.bust__anim', from), { opacity: 0, y: -24, scale: 0.97, duration: 0.6, ease: 'power2.in', onComplete: () => { from.classList.remove('is-on'); gsap.set($('.bust__anim', from), { clearProps: 'all' }); } });
        gsap.fromTo($('.bust__anim', to), { opacity: 0, y: 46, scale: 1.04 }, { opacity: 1, y: 0, scale: 1, duration: 1.4, delay: 0.3, ease: 'expo.out', onComplete: () => { this.busy = false; } });
      };
      (img.decode ? img.decode().catch(() => {}) : Promise.resolve()).then(go);
    }
  };

  /* ———————— Пылинки в луче ———————— */
  const Dust = {
    c: $('#heroDust'), ctx: null, ps: [], w: 0, h: 0, sprite: null,
    init() {
      if (reduced) return;
      this.ctx = this.c.getContext('2d');
      const s = document.createElement('canvas'); s.width = s.height = 32;
      const g = s.getContext('2d');
      const grd = g.createRadialGradient(16, 16, 0, 16, 16, 16);
      grd.addColorStop(0, 'rgba(255,248,232,1)'); grd.addColorStop(0.35, 'rgba(255,240,215,0.45)'); grd.addColorStop(1, 'rgba(255,240,215,0)');
      g.fillStyle = grd; g.fillRect(0, 0, 32, 32);
      this.sprite = s;
      this.resize();
      window.addEventListener('resize', () => this.resize());
      const n = innerWidth < 700 ? 22 : 42;
      for (let i = 0; i < n; i++) this.ps.push(this.spawn(true));
      requestAnimationFrame(t => this.loop(t));
    },
    resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      this.w = this.c.clientWidth; this.h = this.c.clientHeight;
      this.c.width = this.w * dpr; this.c.height = this.h * dpr;
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    },
    spawn(any) {
      return { x: rand(0, this.w), y: any ? rand(0, this.h) : this.h + 10, r: rand(1, 3.2), vx: rand(-0.08, 0.08), vy: rand(-0.32, -0.08), a: rand(0.15, 0.55), ph: rand(0, 6.28), dx: 0, dy: 0 };
    },
    burst() { for (const p of this.ps) { p.dx += rand(-3, 3); p.dy += rand(-3, 1); } },
    loop(t) {
      requestAnimationFrame(tt => this.loop(tt));
      if (!Hero.visible) return;
      const ctx = this.ctx;
      ctx.clearRect(0, 0, this.w, this.h);
      const top = this.c.getBoundingClientRect().top;
      const mx = mouse.x, my = mouse.y - top;
      for (const p of this.ps) {
        const ddx = p.x - mx, ddy = p.y - my, d2 = ddx * ddx + ddy * ddy;
        if (d2 < 14000) { const f = (14000 - d2) / 14000 * 0.6, d = Math.sqrt(d2 + 1); p.dx += ddx / d * f; p.dy += ddy / d * f; }
        p.dx *= 0.94; p.dy *= 0.94;
        p.x += p.vx + p.dx + Math.sin(t * 0.0006 + p.ph) * 0.15;
        p.y += p.vy + p.dy;
        if (p.y < -10 || p.x < -20 || p.x > this.w + 20) Object.assign(p, this.spawn(false));
        ctx.globalAlpha = p.a * (0.6 + 0.4 * Math.sin(t * 0.002 + p.ph * 3));
        const s = p.r * 4;
        ctx.drawImage(this.sprite, p.x - s / 2, p.y - s / 2, s, s);
      }
      ctx.globalAlpha = 1;
    }
  };

  /* ———————— Портрет: бюст, гравюра или пустая ниша ———————— */
  function portraitHTML(t, i, big) {
    const p = t.photo;
    let inner;
    if (p && p.kind === 'bust') {
      inner = '<img class="pt__bust" src="' + p.src + '" alt="Бюст: ' + esc(t.name) + '" width="' + p.w + '" height="' + p.h + '" loading="lazy" decoding="async" style="--ar:' + p.w + '/' + p.h + ';--h:' + p.hero + '">';
    } else if (p && p.kind === 'engraving') {
      inner = '<img class="pt__print" src="' + p.src + '" alt="' + esc(t.name) + ', гравюра" width="' + p.w + '" height="' + p.h + '" loading="lazy" decoding="async">';
    } else {
      inner = '<span class="pt__mono" aria-hidden="true">' + esc(initial(t)) + '</span><span class="pt__none">' + esc(t.note || 'Портрет не сохранился') + '</span>';
    }
    return '<div class="pt' + (p ? ' pt--' + p.kind : ' pt--none') + (big ? ' pt--big' : '') + '" style="--bgx:' + ((i * 23) % 100) + '%">' + inner + '<span class="pt__light"></span></div>';
  }

  /* ———————— Пролог ———————— */
  function buildMeanderPath(w, h, n) {
    const tw = w / n, b = h - 4, t = 4;
    let d = 'M0 ' + b + ' H' + w;
    for (let k = 0; k < n; k++) {
      const x = k * tw;
      d += ' M' + (x + tw * 0.75) + ' ' + b + ' V' + t + ' H' + (x + tw * 0.13) + ' V' + (b - (b - t) * 0.28) + ' H' + (x + tw * 0.5) + ' V' + (t + (b - t) * 0.42) + ' H' + (x + tw * 0.35);
    }
    return d;
  }
  const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
  function runLoader(ready) {
    const loader = $('#loader');
    const path = $('#loaderPath');
    path.setAttribute('d', buildMeanderPath(240, 40, 8));
    path.setAttribute('pathLength', '1');
    path.style.strokeDasharray = '1';
    path.style.strokeDashoffset = '1';
    const count = $('#loaderCount');
    let k = 0;
    const iv = setInterval(() => { k = Math.min(9, k + 1); count.textContent = ROMAN[k]; }, 110);
    const finish = () => {
      clearInterval(iv);
      count.textContent = 'X';
      if (!anim) { loader.remove(); Intro(); return; }
      gsap.timeline({ onComplete: () => loader.remove() })
        .to('.loader__word span', { y: -30, opacity: 0, duration: 0.5, stagger: 0.05, ease: 'power3.in' })
        .to([path, count], { opacity: 0, duration: 0.3 }, '<')
        .to(loader, { clipPath: 'inset(0 0 100% 0)', duration: 1.0, ease: 'expo.inOut' }, '-=0.1')
        .add(Intro, '-=0.7');
    };
    if (anim) {
      loader.style.clipPath = 'inset(0 0 0% 0)';
      gsap.to(path, { strokeDashoffset: 0, duration: 1.1, ease: 'power2.inOut' });
      gsap.to('.loader__word span', { y: 0, opacity: 1, duration: 0.9, stagger: 0.1, ease: 'expo.out', delay: 0.1 });
    } else {
      path.style.strokeDashoffset = '0';
      $$('.loader__word span').forEach(s => { s.style.opacity = 1; s.style.transform = 'none'; });
    }
    const minTime = new Promise(r => setTimeout(r, reduced ? 50 : 1200));
    const maxTime = new Promise(r => setTimeout(r, 3500));
    Promise.race([Promise.all([ready, minTime]), maxTime]).then(finish);
  }

  function Intro() {
    if (!anim) return;
    const chars = splitChars($('.hero__word'));
    gsap.timeline()
      .from('#heroBg img', { scale: 1.2, opacity: 0, duration: 2.2, ease: 'expo.out' }, 0)
      .from('.bust.is-on .bust__anim', { y: 80, opacity: 0, scale: 1.06, duration: 2, ease: 'expo.out' }, 0.1)
      .from(chars, { yPercent: 110, opacity: 0, rotate: 6, duration: 1.4, stagger: 0.08, ease: 'expo.out' }, 0.35)
      .from('.hero__eyebrow', { opacity: 0, y: 16, duration: 1, ease: 'expo.out' }, 0.5)
      .from('#heroQuote', { opacity: 0, y: 24, duration: 1.2, ease: 'expo.out' }, 0.75)
      .from('.hero__cta .btn', { opacity: 0, y: 20, duration: 1, stagger: 0.08, ease: 'expo.out' }, 0.95)
      .from('.hero__label', { opacity: 0, x: -20, duration: 1.2, ease: 'expo.out' }, 1.05)
      .from('.hero__scroll', { opacity: 0, duration: 1 }, 1.3);
  }

  /* ———————— Оракул ———————— */
  const Oracle = {
    stage: $('#ostraconStage'),
    filter: '',
    bag: [],
    current: null,
    busy: false,
    init() {
      const chips = $('#oracleChips');
      const list = [{ id: '', short: 'Все голоса' }].concat(D.thinkers);
      chips.innerHTML = list.map(t => '<button class="chip' + (t.id === '' ? ' is-active' : '') + '" data-thinker="' + t.id + '">' + esc(t.short) + '</button>').join('');
      chips.addEventListener('click', e => {
        const b = e.target.closest('.chip'); if (!b) return;
        $$('.chip', chips).forEach(c => c.classList.toggle('is-active', c === b));
        this.filter = b.dataset.thinker;
        this.bag = [];
        this.draw();
      });
      $('#drawBtn').addEventListener('click', () => this.draw());
      this.stage.addEventListener('click', () => this.draw());
      $('#copyBtn').addEventListener('click', () => this.current && copyQuote(this.current));
      $('#favBtn').addEventListener('click', () => {
        if (!this.current) return;
        const on = Wreath.toggle(this.current.id);
        toast(on ? 'Вплетено в венок' : 'Убрано из венка');
        Anthology.render(true);
      });
      window.addEventListener('keydown', e => {
        if (e.code !== 'Space' || e.target.closest('input, textarea, select, button, a') || !$('#sheet').hidden) return;
        const r = $('#oracle').getBoundingClientRect();
        if (r.top < innerHeight * 0.6 && r.bottom > innerHeight * 0.4) { e.preventDefault(); this.draw(); }
      });
      const now = new Date();
      const key = now.getFullYear() * 1000 + Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 864e5);
      const dq = D.quotes[(key * 2654435761 >>> 0) % D.quotes.length];
      $('#dailyDate').textContent = now.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
      $('#dailyText').textContent = '«' + dq.text + '»';
      $('#dailyBy').textContent = byId[dq.by].name + ' · ' + sourceOf(dq);
      this.show(this.pick(), false);
    },
    pick() {
      const pool = D.quotes.filter(q => !this.filter || q.by === this.filter);
      if (!this.bag.length) {
        this.bag = pool.map(q => q.id);
        for (let i = this.bag.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [this.bag[i], this.bag[j]] = [this.bag[j], this.bag[i]]; }
        if (this.current && this.bag.length > 1 && this.bag[this.bag.length - 1] === this.current.id) this.bag.unshift(this.bag.pop());
      }
      const id = this.bag.pop();
      return D.quotes.find(q => q.id === id);
    },
    shape() {
      const n = 15 + Math.floor(Math.random() * 6);
      const pts = [];
      const off = rand(0, Math.PI * 2);
      for (let i = 0; i < n; i++) {
        const a = off + (i / n) * Math.PI * 2 + rand(-0.12, 0.12);
        const c = Math.cos(a), s = Math.sin(a);
        const rx = 50 - rand(0, 6.5) - (Math.random() < 0.18 ? rand(3, 6) : 0);
        const ry = 50 - rand(0, 7);
        const x = 50 + rx * Math.sign(c) * Math.pow(Math.abs(c), 0.42);
        const y = 50 + ry * Math.sign(s) * Math.pow(Math.abs(s), 0.42);
        pts.push(x.toFixed(2) + '% ' + y.toFixed(2) + '%');
      }
      return 'polygon(' + pts.join(', ') + ')';
    },
    build(q) {
      const t = byId[q.by];
      const h = document.createElement('div');
      h.className = 'ostracon-holder';
      h.style.setProperty('--shard', this.shape());
      h.innerHTML =
        '<div class="ostracon__edge"></div>' +
        '<figure class="ostracon" style="margin:0">' +
        '<blockquote class="ostracon__text' + (q.text.length > 230 ? ' is-long' : '') + '">' + esc(q.text) + '</blockquote>' +
        (q.orig ? '<p class="ostracon__orig">' + esc(q.orig) + '</p>' : '') +
        '<figcaption class="ostracon__by">' + esc(t.name) + '<span>' + esc(sourceOf(q)) + '</span></figcaption>' +
        '</figure>';
      h.style.transform = 'rotate(' + rand(-2.2, 2.2).toFixed(2) + 'deg)';
      return h;
    },
    shatter(holder) {
      const stage = this.stage;
      const sr = stage.getBoundingClientRect(), hr = holder.getBoundingClientRect();
      const W = hr.width, H = hr.height;
      const left = hr.left - sr.left, top = hr.top - sr.top;
      const cx = W * rand(0.38, 0.62), cy = H * rand(0.38, 0.62);
      const K = 6;
      const angles = [];
      for (let i = 0; i < K; i++) angles.push((i / K) * Math.PI * 2 + rand(-0.3, 0.3));
      angles.sort((a, b) => a - b);
      const R = Math.max(W, H) * 1.6, r0 = Math.min(W, H) * rand(0.24, 0.34);
      const P = (a, r) => (cx + Math.cos(a) * r).toFixed(1) + 'px ' + (cy + Math.sin(a) * r).toFixed(1) + 'px';
      const clone = holder.cloneNode(true);
      clone.style.transform = '';
      const pieces = [];
      for (let i = 0; i < K; i++) {
        const a0 = angles[i], a1 = angles[(i + 1) % K] + (i === K - 1 ? Math.PI * 2 : 0);
        const am = (a0 + a1) / 2;
        const polys = [
          ['polygon(' + cx + 'px ' + cy + 'px, ' + P(a0, r0) + ', ' + P(am, r0 * 1.08) + ', ' + P(a1, r0) + ')', 0.55],
          ['polygon(' + P(a0, r0) + ', ' + P(a0, R) + ', ' + P(a1, R) + ', ' + P(a1, r0) + ', ' + P(am, r0 * 1.08) + ')', 1]
        ];
        for (const [poly, far] of polys) {
          const p = document.createElement('div');
          p.className = 'shard-piece';
          p.style.cssText = 'left:' + left + 'px;top:' + top + 'px;width:' + W + 'px;height:' + H + 'px;clip-path:' + poly + ';';
          const c = clone.cloneNode(true);
          c.style.width = W + 'px';
          p.appendChild(c);
          stage.appendChild(p);
          pieces.push({ el: p, a: am, far });
        }
      }
      holder.remove();
      pieces.forEach(pc => {
        const speed = rand(260, 520) * pc.far;
        const vx = Math.cos(pc.a) * speed, vy = Math.sin(pc.a) * speed - rand(120, 260);
        const rot = rand(-90, 90), g = 1500;
        const o = { t: 0 };
        gsap.to(o, {
          t: 1, duration: rand(0.8, 1.1), ease: 'none',
          onUpdate: () => {
            const tt = o.t;
            pc.el.style.transform = 'translate3d(' + (vx * tt) + 'px,' + (vy * tt + 0.5 * g * tt * tt) + 'px,0) rotate(' + rot * tt + 'deg)';
            pc.el.style.opacity = String(1 - Math.max(0, (tt - 0.45) / 0.55));
          },
          onComplete: () => pc.el.remove()
        });
      });
    },
    reveal(holder) {
      const words = splitWords($('.ostracon__text', holder));
      const stagger = Math.min(0.045, 1.1 / Math.max(1, words.length));
      gsap.fromTo(holder, { y: 90, rotateX: 50, scale: 0.92, opacity: 0 }, { y: 0, rotateX: 0, scale: 1, opacity: 1, duration: 1.1, ease: 'expo.out' });
      gsap.fromTo(words, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.7, stagger, ease: 'power2.out', delay: 0.25 });
      gsap.fromTo($$('.ostracon__orig, .ostracon__by', holder), { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.8, stagger: 0.1, delay: 0.45 + words.length * stagger * 0.7, ease: 'expo.out' });
    },
    show(q, animate) {
      this.current = q;
      const holder = this.build(q);
      this.stage.appendChild(holder);
      $('#favBtn').dataset.fav = q.id;
      Wreath.sync();
      if (animate && anim) this.reveal(holder);
    },
    draw() {
      if (this.busy) return;
      this.busy = true;
      const old = $('.ostracon-holder', this.stage);
      const q = this.pick();
      if (old && anim) {
        this.stage.style.minHeight = this.stage.offsetHeight + 'px';
        gsap.to(old, {
          scale: 1.03, duration: 0.09, yoyo: true, repeat: 1, ease: 'power1.inOut',
          onComplete: () => {
            this.shatter(old);
            setTimeout(() => { this.show(q, true); this.stage.style.minHeight = ''; this.busy = false; }, 240);
          }
        });
      } else {
        if (old) old.remove();
        this.show(q, false);
        this.busy = false;
      }
    }
  };

  /* ———————— Что в нашей власти ———————— */
  function amphoraSVG(svg, id) {
    const R = [[16, 14], [15, 22], [11, 30], [11, 56], [22, 78], [52, 102], [76, 136], [78, 160], [70, 196], [48, 232], [24, 256], [16, 266], [24, 276], [26, 288]];
    const pts = R.map(([x, y]) => [100 + x, y]).concat(R.slice().reverse().map(([x, y]) => [100 - x, y]));
    let d = 'M' + pts[0][0] + ' ' + pts[0][1];
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
      const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      d += ' C' + c1.map(v => v.toFixed(1)).join(' ') + ' ' + c2.map(v => v.toFixed(1)).join(' ') + ' ' + p2.join(' ');
    }
    d += 'Z';
    svg.innerHTML =
      '<defs>' +
      '<linearGradient id="ag' + id + '" x1="0" x2="1"><stop offset="0" stop-color="#7d4426"/><stop offset=".38" stop-color="#cf8b5d"/><stop offset=".62" stop-color="#bd7246"/><stop offset="1" stop-color="#6a361c"/></linearGradient>' +
      '<pattern id="am' + id + '" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M0 21H24M18 21V3H3V15H12V9H8" fill="none" stroke="#c98a5c" stroke-width="1.8"/></pattern>' +
      '<clipPath id="ac' + id + '"><path d="' + d + '"/></clipPath>' +
      '</defs>' +
      '<path d="M85 40 C 52 40, 44 70, 58 104" fill="none" stroke="#9a5532" stroke-width="7" stroke-linecap="round"/>' +
      '<path d="M115 40 C 148 40, 156 70, 142 104" fill="none" stroke="#9a5532" stroke-width="7" stroke-linecap="round"/>' +
      '<path d="' + d + '" fill="url(#ag' + id + ')"/>' +
      '<g clip-path="url(#ac' + id + ')">' +
      '<rect x="0" y="118" width="200" height="30" fill="#1d130d"/><rect x="0" y="121" width="200" height="24" fill="url(#am' + id + ')"/>' +
      '<rect x="0" y="196" width="200" height="110" fill="#1d130d" opacity=".92"/>' +
      '<rect x="0" y="0" width="200" height="16" fill="#1d130d" opacity=".9"/>' +
      '<rect x="0" y="0" width="200" height="300" fill="url(#ag' + id + ')" opacity=".18"/>' +
      '</g>' +
      '<ellipse cx="100" cy="14" rx="16" ry="3.5" fill="#2a170d"/>';
  }

  const Sorter = {
    items: [], i: 0, score: 0, counts: { mine: 0, not: 0 }, busy: false,
    init() {
      $$('.sorter__vessel .amphora').forEach((s, k) => amphoraSVG(s, k));
      $('#sorterTotal').textContent = D.control.length;
      $$('.sorter__vessel').forEach(v => {
        v.addEventListener('click', () => this.sort(v.dataset.side));
        v.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.sort(v.dataset.side); } });
      });
      window.addEventListener('keydown', e => {
        if (e.target.closest('input, textarea, select') || !$('#sheet').hidden) return;
        const r = $('#sorter').getBoundingClientRect();
        if (r.top > innerHeight * 0.8 || r.bottom < innerHeight * 0.2) return;
        if (e.key === 'ArrowLeft') { e.preventDefault(); this.sort('mine'); }
        if (e.key === 'ArrowRight') { e.preventDefault(); this.sort('not'); }
      });
      this.reset();
    },
    reset() {
      this.items = D.control.slice().sort(() => Math.random() - 0.5);
      this.i = 0; this.score = 0; this.counts = { mine: 0, not: 0 };
      $$('[data-count]').forEach(c => { c.textContent = '0'; });
      $('#sorterFeedback').innerHTML = '';
      this.renderDeck();
    },
    renderDeck() {
      const deck = $('#sorterDeck');
      $('#sorterNum').textContent = Math.min(this.i + 1, this.items.length);
      if (this.i >= this.items.length) {
        deck.innerHTML = '';
        $('#sorterFeedback').innerHTML =
          '<span class="sorter__done"><span class="sorter__done-score">' + this.score + ' / ' + this.items.length + '</span>' +
          '<span>«Что же нужно делать? Распоряжаться наилучшим образом тем, что в нашей власти, а всем прочим — так, как оно происходит само». Эпиктет, Беседы I, 1</span>' +
          '<button class="btn btn--ghost btn--sm" id="sorterAgain">Ещё раз</button></span>';
        $('#sorterAgain').addEventListener('click', () => this.reset());
        return;
      }
      const rest = this.items.slice(this.i, this.i + 3).reverse();
      deck.innerHTML = '<div class="sorter__deck-shadow">' + rest.map((it, k) => {
        const depth = rest.length - 1 - k;
        return '<div class="tile' + (depth === 0 ? ' is-top' : '') + '" style="transform:translate(' + depth * 7 + 'px,' + depth * 9 + 'px) rotate(' + (depth ? (depth % 2 ? 4 : -3) : 0) + 'deg);opacity:' + (1 - depth * 0.22) + '"' + (depth === 0 ? ' data-cursor="Тяните"' : '') + '>' + esc(it.text) + '</div>';
      }).join('') + '</div>';
      const top = $('.tile.is-top', deck);
      if (top) {
        this.drag(top);
        if (anim) gsap.from(top, { scale: 0.9, opacity: 0, duration: 0.6, ease: 'expo.out' });
      }
    },
    drag(tile) {
      let sx = 0, sy = 0, dx = 0, dy = 0, on = false, target = null;
      const vessels = $$('.sorter__vessel');
      const hit = () => {
        const r = tile.getBoundingClientRect();
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        let best = null, bd = 1e9;
        vessels.forEach(v => {
          const vr = v.getBoundingClientRect();
          const d = Math.hypot(cx - (vr.left + vr.width / 2), cy - (vr.top + vr.height / 2));
          if (d < bd) { bd = d; best = v; }
        });
        return bd < 220 ? best : null;
      };
      tile.addEventListener('pointerdown', e => {
        on = true; sx = e.clientX; sy = e.clientY; dx = dy = 0;
        tile.setPointerCapture(e.pointerId);
        tile.classList.add('is-dragging');
      });
      tile.addEventListener('pointermove', e => {
        if (!on) return;
        dx = e.clientX - sx; dy = e.clientY - sy;
        tile.style.transform = 'translate(' + dx + 'px,' + dy + 'px) rotate(' + dx * 0.04 + 'deg)';
        const t = hit();
        if (t !== target) { vessels.forEach(v => v.classList.toggle('is-target', v === t)); target = t; }
      });
      const up = () => {
        if (!on) return;
        on = false;
        tile.classList.remove('is-dragging');
        vessels.forEach(v => v.classList.remove('is-target'));
        if (target && Math.hypot(dx, dy) > 40) this.sort(target.dataset.side, tile);
        else if (hasGsap) { tile.style.transform = ''; gsap.fromTo(tile, { x: dx, y: dy }, { x: 0, y: 0, duration: 0.7, ease: 'elastic.out(1, 0.5)' }); }
        else tile.style.transform = '';
        target = null;
      };
      tile.addEventListener('pointerup', up);
      tile.addEventListener('pointercancel', up);
    },
    sort(side, tileEl) {
      if (this.i >= this.items.length || this.busy) return;
      this.busy = true;
      const it = this.items[this.i];
      const ok = it.mine === (side === 'mine');
      if (ok) this.score++;
      this.counts[side]++;
      const vessel = $('.sorter__vessel[data-side="' + side + '"]');
      const tile = tileEl || $('#sorterDeck .tile.is-top');
      $('#sorterFeedback').innerHTML = '<b class="' + (ok ? 'ok' : 'no') + '">' + (ok ? 'Верно' : (it.mine ? 'Это в нашей власти' : 'Это не в нашей власти')) + '</b>' + esc(it.why);
      const finish = () => {
        $('[data-count="' + side + '"]', vessel).textContent = this.counts[side];
        this.i++;
        this.busy = false;
        this.renderDeck();
      };
      if (anim && tile) {
        const tr = tile.getBoundingClientRect(), vr = $('.amphora', vessel).getBoundingClientRect();
        const tx = vr.left + vr.width / 2 - (tr.left + tr.width / 2), ty = vr.top + vr.height * 0.06 - (tr.top + tr.height / 2);
        const m = new DOMMatrix(getComputedStyle(tile).transform);
        tile.style.transform = '';
        gsap.set(tile, { x: m.e, y: m.f });
        gsap.timeline({ onComplete: finish })
          .to(tile, { x: '+=' + tx * 0.5, y: '+=' + (ty - 120), rotate: side === 'mine' ? -25 : 25, scale: 0.7, duration: 0.35, ease: 'power2.out' })
          .to(tile, { x: '+=' + tx * 0.5, y: '+=' + 140, scale: 0.12, opacity: 0, duration: 0.3, ease: 'power2.in' })
          .to($('.amphora', vessel), { rotate: 7, duration: 0.09, yoyo: true, repeat: 3, ease: 'sine.inOut', transformOrigin: '50% 100%' }, '-=0.08');
      } else finish();
    }
  };

  function initStatement() {
    const el = $('#statement');
    const words = splitWords(el);
    const mine = ['мнение,', 'стремление,', 'желание,', 'уклонение.'];
    const not = ['тело,', 'имущество,', 'репутация,', 'должности.'];
    words.forEach(w => {
      const t = w.textContent.toLowerCase();
      if (mine.includes(t)) w.classList.add('w-mine');
      if (not.includes(t)) w.classList.add('w-not');
    });
    if (anim && window.ScrollTrigger) {
      gsap.fromTo(words, { opacity: 0.16 }, {
        opacity: 1, stagger: 0.12, ease: 'none',
        scrollTrigger: { trigger: el, start: 'top 82%', end: 'bottom 45%', scrub: true }
      });
    }
  }

  /* ———————— Мыслители ———————— */
  const Thinkers = {
    init() {
      const wrap = $('#niches');
      wrap.innerHTML = D.thinkers.map((t, i) =>
        '<article class="niche" tabindex="0" role="button" data-i="' + i + '" aria-label="' + esc(t.name) + ' — подробнее" data-cursor="Открыть">' +
        '<div class="niche__arch">' + portraitHTML(t, i) + '<span class="niche__orig">' + esc(t.orig) + '</span></div>' +
        '<div class="niche__plaque"><span class="niche__era">' + esc(t.era) + '</span>' +
        '<h3 class="niche__name">' + esc(t.name) + '</h3>' +
        '<p class="niche__years">' + esc(t.years) + '</p>' +
        '<p class="niche__epithet">' + esc(t.epithet) + '</p></div></article>'
      ).join('');
      $$('.niche').forEach(n => {
        const i = +n.dataset.i;
        const pt = $('.pt', n);
        if (fine) {
          n.addEventListener('pointermove', e => {
            const r = pt.getBoundingClientRect();
            const u = (e.clientX - r.left) / r.width, v = (e.clientY - r.top) / r.height;
            pt.style.setProperty('--mx', (u * 100).toFixed(1) + '%');
            pt.style.setProperty('--my', (v * 100).toFixed(1) + '%');
            pt.style.setProperty('--tx', ((u - 0.5) * 12).toFixed(1) + 'px');
          });
        }
        n.addEventListener('click', e => Sheet.open(i, e));
        n.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); Sheet.open(i, null); } });
      });
    }
  };

  const Sheet = {
    el: $('#sheet'), lastFocus: null,
    open(i, ev) {
      const t = D.thinkers[i];
      this.lastFocus = document.activeElement;
      const qs = D.quotes.filter(q => q.by === t.id);
      const ws = D.works.filter(w => t.works.includes(w.id));
      $('#sheetPortrait').innerHTML = portraitHTML(t, i, true) + '<span class="sheet__orig">' + esc(t.orig) + '</span>' +
        (t.photo ? '<span class="sheet__credit">' + esc(t.photo.credit) + '</span>' : '');
      $('#sheetBody').innerHTML =
        '<p class="sheet__era">' + esc(t.era) + ' · ' + esc(t.epithet) + '</p>' +
        '<h2 class="sheet__name" id="sheetName">' + esc(t.name) + '</h2>' +
        '<p class="sheet__meta">' + esc(t.years) + ' · ' + esc(t.place) + '</p>' +
        '<p class="sheet__lead">' + esc(t.lead) + '</p>' +
        '<div class="sheet__bio">' + t.bio.map(p => '<p>' + esc(p) + '</p>').join('') + '</div>' +
        (t.note ? '<p class="sheet__note">' + esc(t.note) + '.</p>' : '') +
        '<h3 class="sheet__h">Главные мысли</h3><ul class="sheet__ideas">' + t.ideas.map(x => '<li>' + esc(x) + '</li>').join('') + '</ul>' +
        '<h3 class="sheet__h">Источники</h3><div class="sheet__works">' + ws.map(w => '<button class="chip" data-work="' + w.id + '">' + esc(w.title) + '</button>').join('') + '</div>' +
        '<h3 class="sheet__h">Изречения</h3><div class="sheet__quotes">' + qs.slice(0, 5).map(q => '<figure class="sheet__q"><p>«' + esc(q.text) + '»</p><cite>' + esc(sourceOf(q)) + '</cite></figure>').join('') + '</div>' +
        '<div class="sheet__all"><button class="btn btn--solid btn--sm" data-all="' + t.id + '">Все изречения: ' + qs.length + '</button></div>';
      $$('[data-work]', this.el).forEach(b => b.addEventListener('click', () => { this.close(); Anthology.apply({ work: b.dataset.work }); }));
      $('[data-all]', this.el).addEventListener('click', () => { this.close(); Anthology.apply({ thinker: t.id }); });
      this.el.hidden = false;
      $('#sheetBody').scrollTop = 0;
      document.documentElement.style.overflow = 'hidden';
      if (anim) {
        const x = ev ? ev.clientX : innerWidth / 2, y = ev ? ev.clientY : innerHeight / 2;
        gsap.fromTo('.sheet__backdrop', { opacity: 0 }, { opacity: 1, duration: 0.5 });
        gsap.fromTo('.sheet__panel', { clipPath: 'circle(0px at ' + x + 'px ' + y + 'px)' }, { clipPath: 'circle(' + Math.hypot(innerWidth, innerHeight) + 'px at ' + x + 'px ' + y + 'px)', duration: 0.9, ease: 'expo.inOut', clearProps: 'clipPath' });
        gsap.from('#sheetBody > *', { opacity: 0, y: 24, duration: 0.9, stagger: 0.04, delay: 0.3, ease: 'expo.out' });
        gsap.fromTo('#sheetPortrait .pt', { scale: 1.1 }, { scale: 1, duration: 1.6, ease: 'expo.out' });
      }
      $('.sheet__close', this.el).focus();
    },
    close() {
      if (this.el.hidden) return;
      const done = () => {
        this.el.hidden = true;
        document.documentElement.style.overflow = '';
        if (this.lastFocus && this.lastFocus.focus) this.lastFocus.focus({ preventScroll: true });
      };
      if (anim) {
        gsap.to('.sheet__panel', { opacity: 0, y: 30, duration: 0.4, ease: 'power2.in', onComplete: () => { gsap.set('.sheet__panel', { clearProps: 'opacity,transform' }); done(); } });
        gsap.to('.sheet__backdrop', { opacity: 0, duration: 0.4 });
      } else done();
    },
    init() {
      this.el.addEventListener('click', e => { if (e.target.closest('[data-close]')) this.close(); });
      window.addEventListener('keydown', e => {
        if (this.el.hidden) return;
        if (e.key === 'Escape') this.close();
        if (e.key === 'Tab') {
          const f = $$('button, a[href], [tabindex]:not([tabindex="-1"])', this.el).filter(x => x.offsetParent !== null);
          if (!f.length) return;
          if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
          else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
        }
      });
    }
  };

  /* ———————— Хронология ———————— */
  const Timeline = {
    init() {
      $('#chronosTrack').innerHTML = D.timeline.map(ev => {
        const t = ev.by ? byId[ev.by] : null;
        const face = t && t.photo ? '<span class="event__face' + (t.photo.kind === 'engraving' ? ' event__face--print' : '') + '"><img src="' + t.photo.src + '" alt="" loading="lazy" decoding="async"></span>' : '';
        return '<li class="event">' +
          '<span class="event__year">' + esc(ev.year) + '</span>' +
          '<span class="event__dot"></span>' + face +
          '<h3 class="event__title">' + esc(ev.title) + '</h3>' +
          '<p class="event__text">' + esc(ev.text) + '</p></li>';
      }).join('');
      const pin = $('.chronos__pin'), track = $('#chronosTrack'), bar = $('#chronosBar');
      const events = $$('.event', track);
      if (anim && window.ScrollTrigger && innerWidth > 900) {
        const dist = () => Math.max(0, track.scrollWidth - innerWidth);
        let lastOn = -1;
        gsap.to(track, {
          x: () => -dist(), ease: 'none',
          scrollTrigger: {
            trigger: pin, pin: true, start: 'top top', end: () => '+=' + dist(), scrub: 0.6, invalidateOnRefresh: true,
            onUpdate: self => {
              bar.style.transform = 'scaleX(' + self.progress.toFixed(4) + ')';
              const on = Math.floor(self.progress * (events.length - 1) + 2.2);
              if (on !== lastOn) { lastOn = on; events.forEach((ev, k) => ev.classList.toggle('is-on', k < on)); }
            }
          }
        });
      } else {
        events.forEach(ev => ev.classList.add('is-on'));
        bar.style.transform = 'scaleX(1)';
      }
    }
  };

  /* ———————— Библиотека ———————— */
  function initLibrary() {
    const shelf = $('#shelf');
    shelf.innerHTML = D.works.map(w => {
      const n = D.quotes.filter(q => q.work === w.id).length;
      const author = w.by ? byId[w.by].name : 'собрание фрагментов';
      return '<article class="scroll" tabindex="0">' +
        '<span class="scroll__tag">' + esc(w.orig) + '</span>' +
        '<div class="scroll__rod"></div>' +
        '<div class="scroll__sheet"><div class="scroll__head"><span class="scroll__orig">' + esc(w.orig) + '</span>' +
        '<h3 class="scroll__title">' + esc(w.title) + '</h3>' +
        '<p class="scroll__meta">' + esc(author) + ' · ' + esc(w.date) + ' · ' + esc(w.form) + '</p></div>' +
        '<div class="scroll__more"><div class="scroll__more-in"><p class="scroll__desc">' + esc(w.desc) + '</p>' +
        (n ? '<button class="scroll__btn" data-work="' + w.id + '">' + n + ' ' + plural(n, ['изречение', 'изречения', 'изречений']) + '</button>' : '') +
        '</div></div></div>' +
        '<div class="scroll__rod scroll__rod--bottom"></div></article>';
    }).join('');
    shelf.addEventListener('click', e => {
      const b = e.target.closest('[data-work]');
      if (b) { Anthology.apply({ work: b.dataset.work }); return; }
      const s = e.target.closest('.scroll');
      if (s && !fine) s.classList.toggle('is-open');
    });
  }

  /* ———————— Собрание ———————— */
  const ICON_LAUREL = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21c-4-2-7-6-7-11M12 21c4-2 7-6 7-11M6.5 13c-2 0-3-1-3.5-2.5 1.5-.3 3 .3 3.5 2.5zm-1-4C3.6 8.6 3 7.2 3.2 5.8c1.4.5 2.3 1.6 2.3 3.2zm11 4c2 0 3-1 3.5-2.5-1.5-.3-3 .3-3.5 2.5zm1-4c1.9-.4 2.5-1.8 2.3-3.2-1.4.5-2.3 1.6-2.3 3.2z"/></svg>';
  const ICON_COPY = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="12"/><path d="M16 8V4H4v12h4"/></svg>';
  const Anthology = {
    st: { q: '', thinker: '', theme: '', work: '', wreath: false, limit: 12 },
    init() {
      $('#fThinker').innerHTML += D.thinkers.map(t => '<option value="' + t.id + '">' + esc(t.name) + '</option>').join('');
      $('#fTheme').innerHTML += D.themes.map(t => '<option value="' + t.id + '">' + esc(t.name) + '</option>').join('');
      $('#fWork').innerHTML += D.works.filter(w => D.quotes.some(q => q.work === w.id)).map(w => '<option value="' + w.id + '">' + esc(w.title) + '</option>').join('');
      let tm = 0;
      $('#search').addEventListener('input', e => { clearTimeout(tm); tm = setTimeout(() => { this.st.q = e.target.value; this.st.limit = 12; this.render(); }, 160); });
      $('#fThinker').addEventListener('change', e => { this.st.thinker = e.target.value; this.st.limit = 12; this.render(); });
      $('#fTheme').addEventListener('change', e => { this.st.theme = e.target.value; this.st.limit = 12; this.render(); });
      $('#fWork').addEventListener('change', e => { this.st.work = e.target.value; this.st.limit = 12; this.render(); });
      $('#fWreath').addEventListener('click', e => {
        this.st.wreath = !this.st.wreath;
        e.currentTarget.setAttribute('aria-pressed', this.st.wreath ? 'true' : 'false');
        this.st.limit = 12; this.render();
      });
      $('#moreBtn').addEventListener('click', () => { this.st.limit += 12; this.render(false, true); });
      $('#wreathLink').addEventListener('click', () => setTimeout(() => this.apply({ wreath: true }, true), 50));
      const grid = $('#qgrid');
      grid.addEventListener('click', e => {
        const fav = e.target.closest('[data-fav]');
        if (fav) { const on = Wreath.toggle(fav.dataset.fav); toast(on ? 'Вплетено в венок' : 'Убрано из венка'); if (this.st.wreath) this.render(); return; }
        const cp = e.target.closest('[data-copy]');
        if (cp) { copyQuote(D.quotes.find(q => q.id === cp.dataset.copy)); return; }
        const tg = e.target.closest('[data-theme]');
        if (tg) this.apply({ theme: tg.dataset.theme }, true);
      });
      if (fine) grid.addEventListener('pointermove', e => {
        const c = e.target.closest('.qcard'); if (!c) return;
        const r = c.getBoundingClientRect();
        c.style.setProperty('--mx', (e.clientX - r.left) + 'px');
        c.style.setProperty('--my', (e.clientY - r.top) + 'px');
      });
      this.render(true);
    },
    apply(o, stay) {
      Object.assign(this.st, { q: '', thinker: '', theme: '', work: '', wreath: false }, o, { limit: 12 });
      $('#search').value = '';
      $('#fThinker').value = this.st.thinker;
      $('#fTheme').value = this.st.theme;
      $('#fWork').value = this.st.work;
      $('#fWreath').setAttribute('aria-pressed', this.st.wreath ? 'true' : 'false');
      this.render();
      if (!stay) scrollToEl($('#anthology'), -10);
    },
    list() {
      const norm = s => s.toLowerCase().replace(/ё/g, 'е');
      const q = norm(this.st.q.trim());
      return D.quotes.filter(x =>
        (!this.st.thinker || x.by === this.st.thinker) &&
        (!this.st.theme || x.themes.includes(this.st.theme)) &&
        (!this.st.work || x.work === this.st.work) &&
        (!this.st.wreath || Wreath.has(x.id)) &&
        (!q || norm(x.text + ' ' + x.orig + ' ' + byId[x.by].name + ' ' + sourceOf(x)).includes(q))
      );
    },
    card(x) {
      const t = byId[x.by];
      return '<article class="qcard' + (x.text.length < 72 ? ' qcard--dark' : '') + '" data-id="' + x.id + '">' +
        '<p class="qcard__meta">' + esc(t.short) + '<span class="qcard__ref">' + esc(sourceOf(x)) + '</span></p>' +
        '<p class="qcard__text">' + esc(x.text) + '</p>' +
        (x.orig ? '<p class="qcard__orig">' + esc(x.orig) + '</p>' : '') +
        '<div class="qcard__foot"><div class="qcard__tags">' + x.themes.map(th => '<button class="qcard__tag" data-theme="' + th + '">' + esc(themeById[th].name) + '</button>').join('') + '</div>' +
        '<div class="qcard__actions"><button class="qcard__icon" data-copy="' + x.id + '" aria-label="Скопировать">' + ICON_COPY + '</button>' +
        '<button class="qcard__icon" data-fav="' + x.id + '" aria-pressed="' + (Wreath.has(x.id) ? 'true' : 'false') + '" aria-label="В венок">' + ICON_LAUREL + '</button></div></div></article>';
    },
    render(first, more) {
      const items = this.list();
      const grid = $('#qgrid');
      const shown = items.slice(0, this.st.limit);
      const prev = more ? grid.children.length : 0;
      if (!items.length) {
        grid.innerHTML = '<p class="anthology__empty">' + (this.st.wreath ? 'Венок пока пуст. Отметьте лавровым листом изречение в оракуле или здесь.' : 'Ничего не нашлось. Попробуйте другое слово.') + '</p>';
      } else if (more) {
        grid.insertAdjacentHTML('beforeend', shown.slice(prev).map(x => this.card(x)).join(''));
      } else {
        grid.innerHTML = shown.map(x => this.card(x)).join('');
      }
      const filtered = this.st.q || this.st.thinker || this.st.theme || this.st.work || this.st.wreath;
      $('#anthologyCount').innerHTML = (filtered ? 'Найдено: ' : 'В собрании: ') + items.length + ' ' + plural(items.length, ['изречение', 'изречения', 'изречений']) +
        (filtered ? '<button id="resetFilters">Сбросить</button>' : '');
      const rb = $('#resetFilters'); if (rb) rb.addEventListener('click', () => this.apply({}, true));
      $('#moreBtn').hidden = shown.length >= items.length;
      if (!first && anim) {
        const cards = Array.from(grid.children).slice(prev);
        gsap.fromTo(cards, { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.7, stagger: 0.03, ease: 'expo.out' });
      }
      if (window.ScrollTrigger && !first) ScrollTrigger.refresh();
    }
  };

  /* ———————— Упражнения и memento mori ———————— */
  function initPractices() {
    $('#practices').innerHTML = D.practices.map(p =>
      '<article class="practice"><span class="practice__orig">' + esc(p.orig) + '</span>' +
      '<h3 class="practice__name">' + esc(p.name) + '</h3>' +
      '<p class="practice__text">' + esc(p.text) + '</p>' +
      '<p class="practice__src">' + esc(p.src) + '</p></article>'
    ).join('');
  }

  const Memento = {
    c: $('#mementoGrid'), anim: 1,
    init() {
      $('#age').addEventListener('input', () => { this.anim = 1; this.draw(); });
      let rt = 0;
      window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => this.draw(), 150); });
      if ('IntersectionObserver' in window && !reduced) {
        const io = new IntersectionObserver(([en]) => {
          if (!en.isIntersecting) return;
          io.disconnect();
          const t0 = performance.now();
          const step = t => { this.anim = clamp((t - t0) / 1600, 0, 1); this.draw(); if (this.anim < 1) requestAnimationFrame(step); };
          requestAnimationFrame(step);
        }, { threshold: 0.3 });
        this.anim = 0;
        io.observe(this.c);
      }
      this.draw();
    },
    draw() {
      const age = clamp(parseInt($('#age').value, 10) || 0, 0, 99);
      const total = 80 * 52, lived = Math.min(total, Math.round(age * 52.18));
      const c = this.c, dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = c.clientWidth || 400, h = c.clientHeight || w * 80 / 52;
      if (c.width !== Math.round(w * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
      const g = c.getContext('2d');
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);
      const cell = w / 52, gap = Math.max(0.8, cell * 0.22), s = cell - gap, rowH = h / 80;
      const shown = Math.floor(lived * (1 - Math.pow(1 - this.anim, 3)));
      g.fillStyle = '#8d6443';
      for (let i = 0; i < shown; i++) g.fillRect((i % 52) * cell, Math.floor(i / 52) * rowH, s, s);
      g.strokeStyle = 'rgba(39,36,31,0.22)'; g.lineWidth = 0.6;
      g.beginPath();
      for (let i = shown; i < total; i++) {
        if (i === lived && this.anim >= 1) continue;
        g.rect((i % 52) * cell + 0.3, Math.floor(i / 52) * rowH + 0.3, s - 0.6, s - 0.6);
      }
      g.stroke();
      if (this.anim >= 1 && lived < total) { g.fillStyle = '#27241f'; g.fillRect((lived % 52) * cell - 0.5, Math.floor(lived / 52) * rowH - 0.5, s + 1, s + 1); }
      const left = total - lived;
      $('#mementoStats').innerHTML = 'Прожито <b>' + fmt(lived) + '</b> ' + plural(lived, ['неделя', 'недели', 'недель']) +
        '. Впереди — около <b>' + fmt(left) + '</b>, если доживёте до восьмидесяти. Это <b>' + Math.round(lived / total * 100) + '%</b> пути.';
    }
  };

  /* ———————— Появление секций ———————— */
  function initReveals() {
    if (!anim || !window.ScrollTrigger) return;
    $$('.sec-head__title[data-split], .footer__ru[data-split]').forEach(el => {
      const chars = splitChars(el);
      $$('.word', el).forEach(w => { w.style.overflow = 'hidden'; w.style.paddingBottom = '0.08em'; w.style.verticalAlign = 'top'; });
      gsap.from(chars, { yPercent: 105, duration: 1.1, stagger: 0.02, ease: 'expo.out', scrollTrigger: { trigger: el, start: 'top 88%', once: true } });
    });
    $$('.sec-head').forEach(h => {
      gsap.from($$('.sec-head__num, .sec-head__gr, .sec-head__lead', h), { opacity: 0, y: 18, duration: 1, stagger: 0.08, ease: 'expo.out', scrollTrigger: { trigger: h, start: 'top 85%', once: true } });
    });
    const batch = (sel, from) => ScrollTrigger.batch(sel, {
      start: 'top 92%', once: true,
      onEnter: els => gsap.fromTo(els, Object.assign({ opacity: 0, y: 40 }, from), { opacity: 1, y: 0, rotate: 0, duration: 1.1, stagger: 0.08, ease: 'expo.out' })
    });
    batch('.niche', { y: 60 });
    batch('.scroll', { y: 50, rotate: -1.5 });
    batch('.practice', {});
    gsap.from('.memento__grid', { opacity: 0, y: 30, duration: 1.2, ease: 'expo.out', scrollTrigger: { trigger: '.memento', start: 'top 80%', once: true } });
    gsap.from('.sorter__vessel', { opacity: 0, y: 60, duration: 1.2, stagger: 0.15, ease: 'expo.out', scrollTrigger: { trigger: '#sorter', start: 'top 85%', once: true } });
    gsap.to('.hero__inner', { yPercent: -16, opacity: 0.15, ease: 'none', scrollTrigger: { trigger: '#top', start: 'top top', end: 'bottom top', scrub: true } });
  }

  /* ———————— Запуск ———————— */
  const fontsReady = document.fonts && document.fonts.ready ? document.fonts.ready.catch(() => {}) : Promise.resolve();
  const heroReady = Hero.init();
  runLoader(Promise.all([fontsReady, heroReady]));
  Dust.init();
  Oracle.init();
  initStatement();
  Sorter.init();
  Thinkers.init();
  Sheet.init();
  Timeline.init();
  initLibrary();
  Anthology.init();
  initPractices();
  Memento.init();
  Wreath.sync();
  fontsReady.then(() => { initReveals(); if (window.ScrollTrigger) ScrollTrigger.refresh(); });
})();
