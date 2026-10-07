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

  /* ———————— Тост ———————— */
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

  /* ———————— Разбивка текста на буквы ———————— */
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

  /* ———————— Плавная прокрутка ———————— */
  let lenis = null;
  if (window.Lenis && !reduced) {
    lenis = new Lenis({ lerp: 0.085, smoothWheel: true, wheelMultiplier: 0.95 });
    if (hasGsap) {
      lenis.on('scroll', () => window.ScrollTrigger && ScrollTrigger.update());
      gsap.ticker.add(t => lenis.raf(t * 1000));
      gsap.ticker.lagSmoothing(0);
    } else {
      const raf = t => { lenis.raf(t); requestAnimationFrame(raf); };
      requestAnimationFrame(raf);
    }
  }
  function scrollToEl(target, offset) {
    if (!target) return;
    if (lenis) lenis.scrollTo(target, { offset: offset || 0, duration: 1.6, easing: t => 1 - Math.pow(1 - t, 4) });
    else target.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' });
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
  let lastY = 0;
  function onScrollNav(y) {
    const heroH = $('#top').offsetHeight;
    nav.classList.toggle('is-solid', y > heroH - 90);
    if (!nav.classList.contains('is-open')) nav.classList.toggle('is-hidden', y > heroH && y > lastY + 2);
    if (y < lastY - 2) nav.classList.remove('is-hidden');
    lastY = y;
  }
  if (lenis) lenis.on('scroll', e => onScrollNav(e.scroll));
  else window.addEventListener('scroll', () => onScrollNav(window.scrollY), { passive: true });

  if ('IntersectionObserver' in window) {
    const darks = new Set();
    const dio = new IntersectionObserver(entries => {
      entries.forEach(en => en.isIntersecting ? darks.add(en.target) : darks.delete(en.target));
      nav.classList.toggle('on-dark', darks.size > 0);
    }, { rootMargin: '0px 0px -94% 0px' });
    $$('.band.is-dark, .footer').forEach(b => dio.observe(b));
  }
  const navLinks = $$('[data-nav]');
  if ('IntersectionObserver' in window) {
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
  const mouse = { x: innerWidth / 2, y: innerHeight / 2, rx: innerWidth / 2, ry: innerHeight / 2, has: false };
  if (fine) {
    document.body.classList.add('has-cursor');
    window.addEventListener('pointermove', e => {
      mouse.x = e.clientX; mouse.y = e.clientY; mouse.has = true;
      dot.style.transform = 'translate(' + mouse.x + 'px,' + mouse.y + 'px) translate(-50%,-50%)';
    }, { passive: true });
    window.addEventListener('pointerdown', () => cursor.classList.add('is-down'));
    window.addEventListener('pointerup', () => cursor.classList.remove('is-down'));
    document.addEventListener('pointerover', e => {
      const t = e.target.closest('[data-cursor], a, button, [role="button"], select, input, .niche, .tile, .chip');
      const lab = t && t.closest('[data-cursor]');
      cursor.classList.toggle('is-hover', !!t && !lab);
      cursor.classList.toggle('is-label', !!lab);
      if (lab) clabel.textContent = lab.dataset.cursor;
    });
    (function loop() {
      mouse.rx = lerp(mouse.rx, mouse.x, 0.16);
      mouse.ry = lerp(mouse.ry, mouse.y, 0.16);
      ring.style.transform = 'translate(' + mouse.rx + 'px,' + mouse.ry + 'px) translate(-50%,-50%)';
      requestAnimationFrame(loop);
    })();

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

  /* ———————— Портик: бюст ———————— */
  const Hero = {
    el: $('#top'),
    canvas: $('#heroGL'),
    r: null,
    q: 0.55,
    visible: true,
    mx: 0, my: 0, tmx: 0, tmy: 0,
    idx: D.thinkers.findIndex(t => t.id === 'marcus'),
    bust: null, from: null, to: null, morph: 1, morphStart: 0,
    expo: 0, expoTarget: 0.62,
    scrollP: 0,
    frames: [], last: 0,
    init() {
      try {
        this.r = new StoaGL.StoaRenderer(this.canvas, { bgScale: 3 });
      } catch (e) {
        console.warn(e);
        this.canvas.style.background = 'radial-gradient(70% 80% at 30% 40%, #cfc8bb, #8f877b)';
        return false;
      }
      this.bust = Object.assign({}, D.thinkers[this.idx].bust);
      this.resize();
      window.addEventListener('resize', () => this.resize());
      window.addEventListener('pointermove', e => {
        this.tmx = (e.clientX / innerWidth) * 2 - 1;
        this.tmy = (e.clientY / innerHeight) * 2 - 1;
      }, { passive: true });
      if ('IntersectionObserver' in window) {
        new IntersectionObserver(([en]) => { this.visible = en.isIntersecting; }).observe(this.el);
      }
      this.el.addEventListener('click', e => {
        if (e.target.closest('a, .hero__inner .btn')) return;
        const r = this.el.getBoundingClientRect();
        const fx = (e.clientX - r.left) / r.width;
        if (e.target.closest('#bustNext') || (innerWidth > 900 ? fx < 0.55 : true)) this.next();
      });
      this.render(performance.now());
      requestAnimationFrame(t => this.loop(t));
      return true;
    },
    resize() {
      if (!this.r) return;
      const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      let rw = w * dpr * this.q, rh = h * dpr * this.q;
      const cap = 1250000 / (rw * rh);
      if (cap < 1) { rw *= Math.sqrt(cap); rh *= Math.sqrt(cap); }
      this.r.resize(rw, rh);
    },
    next() {
      this.idx = (this.idx + 1) % D.thinkers.length;
      const t = D.thinkers[this.idx];
      this.from = Object.assign({}, this.bust, { tint: this.bust.tint.slice() });
      this.to = t.bust;
      this.morph = 0;
      this.morphStart = performance.now();
      Dust.burst();
      const name = $('#heroName'), meta = $('#heroMeta'), qt = $('#heroQuoteText'), qb = $('#heroQuoteBy');
      const swap = () => {
        name.textContent = t.name;
        meta.textContent = t.years + ' · ' + t.epithet;
        qt.textContent = t.motto;
        qb.textContent = '— ' + t.name;
      };
      if (hasGsap && !reduced) {
        gsap.to([name, meta, '#heroQuote'], {
          opacity: 0, y: -10, duration: 0.35, stagger: 0.05, ease: 'power2.in',
          onComplete: () => { swap(); gsap.fromTo([name, meta, '#heroQuote'], { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.8, stagger: 0.07, ease: 'expo.out' }); }
        });
      } else swap();
    },
    state(now) {
      const aspect = this.canvas.clientWidth / Math.max(1, this.canvas.clientHeight);
      const wide = aspect >= 1.05;
      const sp = this.scrollP;
      const mx = this.mx, my = this.my;
      const az = -0.62 + mx * 0.75, el = 0.6 - my * 0.18;
      const sway = reduced ? 0 : Math.sin(now * 0.00035) * 0.035;
      const s = {
        time: now * 0.001,
        light: [Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)],
        yaw: wide ? 0.72 : 0.5,
        head: [mx * 0.3 + sway, 0.05 + my * 0.07],
        bust: this.bust,
        expo: this.expo,
        blur: 1.5
      };
      if (wide) {
        s.shift = -0.42 * aspect;
        s.camPos = [0.04 + mx * 0.06, 2.28 - my * 0.03 + sp * 0.12, 1.4 - sp * 0.25];
        s.camTgt = [0, 2.12 + sp * 0.05, 0];
        s.focal = 1.9;
      } else {
        s.shift = 0;
        const dist = clamp(1.25 / aspect, 2.2, 3.4);
        s.camPos = [mx * 0.05, 2.3 + sp * 0.1, dist - sp * 0.3];
        s.camTgt = [0, 2.35 - dist * 0.3, 0];
        s.focal = 1.85;
      }
      return s;
    },
    render(now) {
      if (!this.r) return;
      this.r.draw(this.state(now));
    },
    loop(now) {
      requestAnimationFrame(t => this.loop(t));
      const dt = now - (this.last || now);
      this.last = now;
      if (!this.visible) return;
      this.mx = lerp(this.mx, this.tmx, 0.06);
      this.my = lerp(this.my, this.tmy, 0.06);
      this.expo = lerp(this.expo, this.expoTarget, 0.05);
      if (this.morph < 1) {
        this.morph = clamp((now - this.morphStart) / 1700, 0, 1);
        const e = this.morph < 0.5 ? 4 * this.morph ** 3 : 1 - Math.pow(-2 * this.morph + 2, 3) / 2;
        this.bust = StoaGL.lerpBust(this.from, this.to, e);
      }
      this.render(now);
      // адаптивное качество: держим ~55–60 кадров
      if (dt > 0 && dt < 200) {
        this.frames.push(dt);
        if (this.frames.length > 40) {
          const avg = this.frames.reduce((a, b) => a + b, 0) / this.frames.length;
          this.frames.length = 0;
          const old = this.q;
          if (avg > 21) this.q = Math.max(0.3, this.q * 0.86);
          else if (avg < 15 && this.q < 0.8) this.q = Math.min(0.8, this.q * 1.07);
          if (old !== this.q) this.resize();
        }
      }
    }
  };

  /* ———————— Пылинки в луче ———————— */
  const Dust = {
    c: $('#heroDust'), ctx: null, ps: [], w: 0, h: 0, sprite: null,
    init() {
      this.ctx = this.c.getContext('2d');
      const s = document.createElement('canvas'); s.width = s.height = 32;
      const g = s.getContext('2d');
      const grd = g.createRadialGradient(16, 16, 0, 16, 16, 16);
      grd.addColorStop(0, 'rgba(255,248,232,1)'); grd.addColorStop(0.35, 'rgba(255,240,215,0.5)'); grd.addColorStop(1, 'rgba(255,240,215,0)');
      g.fillStyle = grd; g.fillRect(0, 0, 32, 32);
      this.sprite = s;
      this.resize();
      window.addEventListener('resize', () => this.resize());
      const n = innerWidth < 700 ? 34 : 70;
      for (let i = 0; i < n; i++) this.ps.push(this.spawn(true));
      if (!reduced) requestAnimationFrame(t => this.loop(t));
    },
    resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.w = this.c.clientWidth; this.h = this.c.clientHeight;
      this.c.width = this.w * dpr; this.c.height = this.h * dpr;
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    },
    spawn(any) {
      return { x: rand(0, this.w), y: any ? rand(0, this.h) : this.h + 10, r: rand(1, 3.4), vx: rand(-0.08, 0.08), vy: rand(-0.35, -0.08), a: rand(0.15, 0.6), ph: rand(0, 6.28), dx: 0, dy: 0 };
    },
    burst() {
      for (const p of this.ps) { p.dx += rand(-3, 3); p.dy += rand(-3, 1); }
    },
    loop(t) {
      requestAnimationFrame(tt => this.loop(tt));
      if (!Hero.visible) return;
      const ctx = this.ctx;
      ctx.clearRect(0, 0, this.w, this.h);
      const r = this.c.getBoundingClientRect();
      const mx = mouse.x - r.left, my = mouse.y - r.top;
      for (const p of this.ps) {
        const ddx = p.x - mx, ddy = p.y - my, d2 = ddx * ddx + ddy * ddy;
        if (d2 < 14000) { const f = (14000 - d2) / 14000 * 0.6; p.dx += ddx / Math.sqrt(d2 + 1) * f; p.dy += ddy / Math.sqrt(d2 + 1) * f; }
        p.dx *= 0.94; p.dy *= 0.94;
        p.x += p.vx + p.dx + Math.sin(t * 0.0006 + p.ph) * 0.15;
        p.y += p.vy + p.dy;
        if (p.y < -10 || p.x < -20 || p.x > this.w + 20) Object.assign(p, this.spawn(false));
        const tw = 0.6 + 0.4 * Math.sin(t * 0.002 + p.ph * 3);
        ctx.globalAlpha = p.a * tw;
        const s = p.r * 4;
        ctx.drawImage(this.sprite, p.x - s / 2, p.y - s / 2, s, s);
      }
      ctx.globalAlpha = 1;
    }
  };

  /* ———————— Портреты в нишах ———————— */
  const Portraits = {
    r: null, canvas: null, W: 360, H: 458, ok: false, pending: null, raf: 0, urls: {},
    init() {
      if (this.r !== null) return this.ok;
      this.canvas = document.createElement('canvas');
      try {
        this.r = new StoaGL.StoaRenderer(this.canvas, { preserve: true, bgScale: 2.5 });
        this.r.resize(this.W, this.H);
        this.ok = true;
      } catch (e) { this.r = false; this.ok = false; }
      return this.ok;
    },
    opts(t, i, lx, ly, hx) {
      const flip = i % 2 ? -1 : 1;
      const yaw = flip * 0.42;
      return {
        bust: t.bust, cut: true, yaw,
        head: [hx || 0, 0.05],
        light: [lx == null ? -0.55 * flip : lx, ly == null ? 0.62 : ly, 0.7],
        camPos: [0, 2.1, 2.3], camTgt: [0, 1.98, 0], focal: 2.1,
        bgRot: i * 0.9 + 0.3, blur: 1.2, expo: 0.62, time: i * 3
      };
    },
    paint(target, t, i, lx, ly, hx) {
      if (!this.ok) return;
      this.r.draw(this.opts(t, i, lx, ly, hx));
      const ctx = target.getContext('2d');
      ctx.drawImage(this.canvas, 0, 0, target.width, target.height);
    },
    url(t, i) {
      if (this.urls[t.id]) return this.urls[t.id];
      const c = document.createElement('canvas'); c.width = 104; c.height = 132;
      this.paint(c, t, i);
      this.urls[t.id] = c.toDataURL('image/jpeg', 0.85);
      return this.urls[t.id];
    },
    big(target, t, i) {
      if (!this.ok) return;
      this.r.resize(620, 790);
      this.r.draw(this.opts(t, i));
      target.width = 620; target.height = 790;
      target.getContext('2d').drawImage(this.canvas, 0, 0);
      this.r.resize(this.W, this.H);
    },
    queue(fn) {
      this.pending = fn;
      if (!this.raf) this.raf = requestAnimationFrame(() => { this.raf = 0; const f = this.pending; this.pending = null; if (f) f(); });
    }
  };

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
    const iv = setInterval(() => { k = Math.min(9, k + 1); count.textContent = ROMAN[k]; }, 120);
    const finish = () => {
      clearInterval(iv);
      count.textContent = 'X';
      if (!hasGsap || reduced) { loader.remove(); Intro(); return; }
      const tl = gsap.timeline({ onComplete: () => loader.remove() });
      tl.to('.loader__word span', { y: -30, opacity: 0, duration: 0.5, stagger: 0.05, ease: 'power3.in' })
        .to([path, count], { opacity: 0, duration: 0.3 }, '<')
        .to(loader, { clipPath: 'inset(0 0 100% 0)', duration: 1.1, ease: 'expo.inOut' }, '-=0.1')
        .add(Intro, '-=0.75');
    };
    if (hasGsap && !reduced) {
      loader.style.clipPath = 'inset(0 0 0% 0)';
      gsap.to(path, { strokeDashoffset: 0, duration: 1.3, ease: 'power2.inOut' });
      gsap.to('.loader__word span', { y: 0, opacity: 1, duration: 0.9, stagger: 0.1, ease: 'expo.out', delay: 0.15 });
    } else {
      path.style.strokeDashoffset = '0';
      $$('.loader__word span').forEach(s => { s.style.opacity = 1; s.style.transform = 'none'; });
    }
    const minTime = new Promise(r => setTimeout(r, reduced ? 50 : 1500));
    const maxTime = new Promise(r => setTimeout(r, 4500));
    Promise.race([Promise.all([ready, minTime]), maxTime]).then(finish);
  }

  function Intro() {
    if (!hasGsap || reduced) { Hero.expoTarget = 0.62; Hero.expo = 0.62; return; }
    const chars = splitChars($('.hero__word'));
    const tl = gsap.timeline();
    tl.from(chars, { yPercent: 110, opacity: 0, rotate: 6, duration: 1.4, stagger: 0.08, ease: 'expo.out' })
      .from('.hero__eyebrow', { opacity: 0, y: 16, duration: 1, ease: 'expo.out' }, 0.15)
      .from('#heroQuote', { opacity: 0, y: 24, duration: 1.2, ease: 'expo.out' }, 0.45)
      .from('.hero__cta .btn', { opacity: 0, y: 20, duration: 1, stagger: 0.08, ease: 'expo.out' }, 0.65)
      .from('.hero__label', { opacity: 0, x: -20, duration: 1.2, ease: 'expo.out' }, 0.8)
      .from('.hero__scroll', { opacity: 0, duration: 1 }, 1.1);
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
      // изречение дня
      const now = new Date();
      const key = now.getFullYear() * 1000 + Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 864e5);
      const dq = D.quotes[(key * 2654435761 >>> 0) % D.quotes.length];
      $('#dailyDate').textContent = now.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
      $('#dailyText').textContent = '«' + dq.text + '»';
      $('#dailyBy').textContent = byId[dq.by].name + ' · ' + sourceOf(dq);
      // первый черепок лежит сразу
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
        const k = 0.42;
        const rx = 50 - rand(0, 6.5) - (Math.random() < 0.18 ? rand(3, 6) : 0);
        const ry = 50 - rand(0, 7);
        const x = 50 + rx * Math.sign(c) * Math.pow(Math.abs(c), k);
        const y = 50 + ry * Math.sign(s) * Math.pow(Math.abs(s), k);
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
      const K = 7;
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
          t: 1, duration: rand(0.8, 1.15), ease: 'none',
          onUpdate: () => {
            const tt = o.t;
            pc.el.style.transform = 'translate(' + (vx * tt) + 'px,' + (vy * tt + 0.5 * g * tt * tt) + 'px) rotate(' + rot * tt + 'deg)';
            pc.el.style.opacity = String(1 - Math.max(0, (tt - 0.45) / 0.55));
          },
          onComplete: () => pc.el.remove()
        });
      });
    },
    reveal(holder) {
      const text = $('.ostracon__text', holder);
      const chars = splitChars(text);
      const stagger = Math.min(0.022, 1.3 / Math.max(1, chars.length));
      gsap.fromTo(holder, { y: 90, rotateX: 55, scale: 0.92, opacity: 0 }, { y: 0, rotateX: 0, scale: 1, opacity: 1, duration: 1.15, ease: 'expo.out' });
      gsap.fromTo(chars, { opacity: 0, filter: 'blur(6px)', y: 6 }, { opacity: 1, filter: 'blur(0px)', y: 0, duration: 0.6, stagger, ease: 'power2.out', delay: 0.25, clearProps: 'filter' });
      gsap.fromTo($$('.ostracon__orig, .ostracon__by', holder), { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.8, stagger: 0.1, delay: 0.5 + chars.length * stagger * 0.6, ease: 'expo.out' });
    },
    show(q, animate) {
      this.current = q;
      const holder = this.build(q);
      this.stage.appendChild(holder);
      $('#favBtn').dataset.fav = q.id;
      Wreath.sync();
      if (animate && hasGsap && !reduced) this.reveal(holder);
    },
    draw() {
      if (this.busy) return;
      this.busy = true;
      const old = $('.ostracon-holder', this.stage);
      const q = this.pick();
      if (old && hasGsap && !reduced) {
        this.stage.style.minHeight = this.stage.offsetHeight + 'px';
        gsap.to(old, {
          scale: 1.03, duration: 0.09, yoyo: true, repeat: 1, ease: 'power1.inOut',
          onComplete: () => {
            this.shatter(old);
            setTimeout(() => { this.show(q, true); this.stage.style.minHeight = ''; this.busy = false; }, 260);
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
    items: [], i: 0, score: 0, counts: { mine: 0, not: 0 },
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
        const n = this.items.length;
        deck.innerHTML = '';
        $('#sorterFeedback').innerHTML =
          '<span class="sorter__done"><span class="sorter__done-score">' + this.score + ' / ' + n + '</span>' +
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
        if (hasGsap && !reduced) gsap.from(top, { scale: 0.9, opacity: 0, duration: 0.6, ease: 'expo.out' });
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
        else if (hasGsap) gsap.to(tile, { x: 0, y: 0, rotate: 0, duration: 0.7, ease: 'elastic.out(1, 0.5)', onStart: () => { tile.style.transform = ''; gsap.set(tile, { x: dx, y: dy }); } });
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
      if (hasGsap && !reduced && tile) {
        const tr = tile.getBoundingClientRect(), vr = $('.amphora', vessel).getBoundingClientRect();
        const cur = gsap.getProperty(tile, 'x') || 0, curY = gsap.getProperty(tile, 'y') || 0;
        const tx = vr.left + vr.width / 2 - (tr.left + tr.width / 2), ty = vr.top + vr.height * 0.06 - (tr.top + tr.height / 2);
        tile.style.transform = '';
        gsap.set(tile, { x: cur, y: curY });
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
    if (hasGsap && window.ScrollTrigger && !reduced) {
      gsap.fromTo(words, { opacity: 0.14 }, {
        opacity: 1, stagger: 0.12, ease: 'none',
        scrollTrigger: { trigger: el, start: 'top 82%', end: 'bottom 42%', scrub: 0.6 }
      });
    }
  }

  /* ———————— Мыслители ———————— */
  const Thinkers = {
    init() {
      const wrap = $('#niches');
      wrap.innerHTML = D.thinkers.map((t, i) =>
        '<article class="niche" tabindex="0" role="button" data-i="' + i + '" aria-label="' + esc(t.name) + ' — подробнее" data-cursor="Открыть">' +
        '<div class="niche__arch"><canvas width="360" height="458"></canvas><span class="niche__orig">' + esc(t.orig) + '</span></div>' +
        '<div class="niche__plaque"><span class="niche__era">' + esc(t.era) + '</span>' +
        '<h3 class="niche__name">' + esc(t.name) + '</h3>' +
        '<p class="niche__years">' + esc(t.years) + '</p>' +
        '<p class="niche__epithet">' + esc(t.epithet) + '</p></div></article>'
      ).join('');
      const paintAll = () => {
        if (!Portraits.init()) {
          $$('.niche canvas').forEach((c, i) => {
            const g = c.getContext('2d'); g.fillStyle = '#bdb5a8'; g.fillRect(0, 0, c.width, c.height);
            g.fillStyle = '#6e665b'; g.font = '160px "GFS Didot", serif'; g.textAlign = 'center'; g.fillText(D.thinkers[i].orig[0], 180, 280);
          });
          return;
        }
        $$('.niche').forEach((n, i) => {
          setTimeout(() => Portraits.paint($('canvas', n), D.thinkers[i], i), i * 40);
        });
        setTimeout(() => Timeline.faces(), 420);
      };
      if ('IntersectionObserver' in window) {
        const io = new IntersectionObserver(([en]) => { if (en.isIntersecting) { io.disconnect(); paintAll(); } }, { rootMargin: '900px 0px' });
        io.observe(wrap);
      } else paintAll();

      $$('.niche').forEach(n => {
        const i = +n.dataset.i, t = D.thinkers[i], c = $('canvas', n);
        if (fine) {
          n.addEventListener('pointermove', e => {
            if (!Portraits.ok) return;
            const r = c.getBoundingClientRect();
            const u = (e.clientX - r.left) / r.width, v = (e.clientY - r.top) / r.height;
            Portraits.queue(() => Portraits.paint(c, t, i, (u - 0.5) * 2.2, 0.75 - (v - 0.5) * 1.1, (u - 0.5) * 0.5));
          });
          n.addEventListener('pointerleave', () => { if (Portraits.ok) Portraits.queue(() => Portraits.paint(c, t, i)); });
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
      $('#sheetOrig').textContent = t.orig;
      $('#sheetBody').innerHTML =
        '<p class="sheet__era">' + esc(t.era) + ' · ' + esc(t.epithet) + '</p>' +
        '<h2 class="sheet__name" id="sheetName">' + esc(t.name) + '</h2>' +
        '<p class="sheet__meta">' + esc(t.years) + ' · ' + esc(t.place) + '</p>' +
        '<p class="sheet__lead">' + esc(t.lead) + '</p>' +
        '<div class="sheet__bio">' + t.bio.map(p => '<p>' + esc(p) + '</p>').join('') + '</div>' +
        '<h3 class="sheet__h">Главные мысли</h3><ul class="sheet__ideas">' + t.ideas.map(x => '<li>' + esc(x) + '</li>').join('') + '</ul>' +
        '<h3 class="sheet__h">Источники</h3><div class="sheet__works">' + ws.map(w => '<button class="chip" data-work="' + w.id + '">' + esc(w.title) + '</button>').join('') + '</div>' +
        '<h3 class="sheet__h">Изречения</h3><div class="sheet__quotes">' + qs.slice(0, 5).map(q => '<figure class="sheet__q"><p>«' + esc(q.text) + '»</p><cite>' + esc(sourceOf(q)) + '</cite></figure>').join('') + '</div>' +
        '<div class="sheet__all"><button class="btn btn--solid btn--sm" data-all="' + t.id + '">Все изречения: ' + qs.length + '</button></div>';
      $$('[data-work]', this.el).forEach(b => b.addEventListener('click', () => { this.close(); Anthology.apply({ work: b.dataset.work }); }));
      $('[data-all]', this.el).addEventListener('click', () => { this.close(); Anthology.apply({ thinker: t.id }); });
      this.el.hidden = false;
      $('#sheetBody').scrollTop = 0;
      if (lenis) lenis.stop();
      document.documentElement.style.overflow = 'hidden';
      Portraits.init();
      Portraits.big($('#sheetCanvas'), t, i);
      if (hasGsap && !reduced) {
        const x = ev ? ev.clientX : innerWidth / 2, y = ev ? ev.clientY : innerHeight / 2;
        gsap.fromTo('.sheet__backdrop', { opacity: 0 }, { opacity: 1, duration: 0.5 });
        gsap.fromTo('.sheet__panel', { clipPath: 'circle(0px at ' + x + 'px ' + y + 'px)' }, { clipPath: 'circle(' + Math.hypot(innerWidth, innerHeight) + 'px at ' + x + 'px ' + y + 'px)', duration: 1.0, ease: 'expo.inOut', clearProps: 'clipPath' });
        gsap.from('#sheetBody > *', { opacity: 0, y: 24, duration: 0.9, stagger: 0.04, delay: 0.35, ease: 'expo.out' });
        gsap.fromTo('#sheetCanvas', { scale: 1.12 }, { scale: 1, duration: 1.6, ease: 'expo.out' });
      }
      $('.sheet__close', this.el).focus();
    },
    close() {
      if (this.el.hidden) return;
      const done = () => {
        this.el.hidden = true;
        document.documentElement.style.overflow = '';
        if (lenis) lenis.start();
        if (this.lastFocus && this.lastFocus.focus) this.lastFocus.focus();
      };
      if (hasGsap && !reduced) {
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
      $('#chronosTrack').innerHTML = D.timeline.map(ev =>
        '<li class="event"' + (ev.by ? ' data-by="' + ev.by + '"' : '') + '>' +
        '<span class="event__year">' + esc(ev.year) + '</span>' +
        '<span class="event__dot"></span>' +
        (ev.by ? '<span class="event__face"><img alt="" width="52" height="66"></span>' : '') +
        '<h3 class="event__title">' + esc(ev.title) + '</h3>' +
        '<p class="event__text">' + esc(ev.text) + '</p></li>'
      ).join('');
      const pin = $('.chronos__pin'), track = $('#chronosTrack'), bar = $('#chronosBar');
      const events = $$('.event', track);
      if (hasGsap && window.ScrollTrigger && innerWidth > 900 && !reduced) {
        const dist = () => Math.max(0, track.scrollWidth - innerWidth);
        gsap.to(track, {
          x: () => -dist(), ease: 'none',
          scrollTrigger: {
            trigger: pin, pin: true, start: 'top top', end: () => '+=' + dist(), scrub: 0.8, invalidateOnRefresh: true,
            onUpdate: self => {
              bar.style.transform = 'scaleX(' + self.progress + ')';
              const x = -dist() * self.progress;
              events.forEach(ev => ev.classList.toggle('is-on', ev.offsetLeft + x < innerWidth * 0.62));
            }
          }
        });
      } else {
        events.forEach(ev => ev.classList.add('is-on'));
        bar.style.transform = 'scaleX(1)';
      }
    },
    faces() {
      $$('.event[data-by]').forEach(ev => {
        const i = D.thinkers.findIndex(t => t.id === ev.dataset.by);
        const img = $('img', ev);
        if (img && i >= 0 && Portraits.ok) img.src = Portraits.url(D.thinkers[i], i);
      });
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
      grid.addEventListener('pointermove', e => {
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
      const dark = x.text.length < 72;
      return '<article class="qcard' + (dark ? ' qcard--dark' : '') + '" data-id="' + x.id + '">' +
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
      if (!first && hasGsap && !reduced) {
        const cards = Array.from(grid.children).slice(prev);
        gsap.fromTo(cards, { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.8, stagger: 0.04, ease: 'expo.out' });
      }
      if (window.ScrollTrigger) ScrollTrigger.refresh();
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
    c: $('#mementoGrid'), anim: 1, drawn: false,
    init() {
      const input = $('#age');
      input.addEventListener('input', () => { this.anim = 1; this.draw(); });
      window.addEventListener('resize', () => this.draw());
      if ('IntersectionObserver' in window && !reduced) {
        const io = new IntersectionObserver(([en]) => {
          if (!en.isIntersecting) return;
          io.disconnect();
          const t0 = performance.now();
          const step = t => { this.anim = clamp((t - t0) / 1800, 0, 1); this.draw(); if (this.anim < 1) requestAnimationFrame(step); };
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
      c.width = w * dpr; c.height = h * dpr;
      const g = c.getContext('2d');
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);
      const cs = getComputedStyle(document.body);
      const accent = cs.getPropertyValue('--accent').trim() || '#8d6443';
      const cell = w / 52, gap = Math.max(0.8, cell * 0.22), s = cell - gap;
      const shown = Math.floor(lived * (1 - Math.pow(1 - this.anim, 3)));
      for (let i = 0; i < total; i++) {
        const x = (i % 52) * cell, y = Math.floor(i / 52) * (h / 80);
        if (i < shown) { g.fillStyle = accent; g.fillRect(x, y, s, s); }
        else if (i === lived && this.anim >= 1) { g.fillStyle = '#27241f'; g.fillRect(x - 0.5, y - 0.5, s + 1, s + 1); }
        else { g.strokeStyle = 'rgba(39,36,31,0.22)'; g.lineWidth = 0.6; g.strokeRect(x + 0.3, y + 0.3, s - 0.6, s - 0.6); }
      }
      const left = total - lived;
      $('#mementoStats').innerHTML = 'Прожито <b>' + fmt(lived) + '</b> ' + plural(lived, ['неделя', 'недели', 'недель']) +
        '. Впереди — около <b>' + fmt(left) + '</b>, если доживёте до восьмидесяти. Это <b>' + Math.round(lived / total * 100) + '%</b> пути.';
    }
  };

  /* ———————— Появление секций ———————— */
  function initReveals() {
    if (!hasGsap || !window.ScrollTrigger || reduced) return;
    $$('.sec-head__title[data-split], .footer__ru[data-split]').forEach(el => {
      const chars = splitChars(el);
      $$('.word', el).forEach(w => { w.style.overflow = 'hidden'; w.style.paddingBottom = '0.08em'; w.style.verticalAlign = 'top'; });
      gsap.from(chars, { yPercent: 105, duration: 1.2, stagger: 0.022, ease: 'expo.out', scrollTrigger: { trigger: el, start: 'top 88%', once: true } });
    });
    $$('.sec-head').forEach(h => {
      const parts = $$('.sec-head__num, .sec-head__gr, .sec-head__lead', h);
      gsap.from(parts, { opacity: 0, y: 18, duration: 1, stagger: 0.08, ease: 'expo.out', scrollTrigger: { trigger: h, start: 'top 85%', once: true } });
    });
    const batch = (sel, vars) => ScrollTrigger.batch(sel, {
      start: 'top 90%', once: true,
      onEnter: els => gsap.fromTo(els, Object.assign({ opacity: 0, y: 40 }, vars.from), Object.assign({ opacity: 1, y: 0, duration: 1.1, stagger: 0.08, ease: 'expo.out' }, vars.to))
    });
    batch('.niche', { from: { y: 60 }, to: {} });
    batch('.scroll', { from: { y: 50, rotate: -1.5 }, to: { rotate: 0 } });
    batch('.practice', { from: {}, to: {} });
    gsap.from('.memento__grid', { opacity: 0, scale: 0.96, duration: 1.4, ease: 'expo.out', scrollTrigger: { trigger: '.memento', start: 'top 80%', once: true } });
    gsap.from('.sorter__vessel', { opacity: 0, y: 60, duration: 1.2, stagger: 0.15, ease: 'expo.out', scrollTrigger: { trigger: '#sorter', start: 'top 85%', once: true } });
    // портик уходит — бюст приближается
    ScrollTrigger.create({ trigger: '#top', start: 'top top', end: 'bottom top', scrub: true, onUpdate: s => { Hero.scrollP = s.progress; } });
    gsap.to('.hero__inner', { yPercent: -18, opacity: 0.2, ease: 'none', scrollTrigger: { trigger: '#top', start: 'top top', end: 'bottom top', scrub: true } });
    $$('.meander').forEach(m => gsap.fromTo(m, { backgroundPositionX: '0px' }, { backgroundPositionX: '-240px', ease: 'none', scrollTrigger: { trigger: m, start: 'top bottom', end: 'bottom top', scrub: true } }));
  }

  /* ———————— Запуск ———————— */
  const fontsReady = document.fonts && document.fonts.ready ? document.fonts.ready.catch(() => {}) : Promise.resolve();
  let glOk = false;
  const glReady = new Promise(res => requestAnimationFrame(() => { glOk = Hero.init(); res(); }));
  runLoader(Promise.all([fontsReady, glReady]));
  Hero.expoTarget = 0.62;

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
  window.__stoa = { Hero, Portraits, Oracle, Anthology };
})();
