/* ══════════════════════════════════════════════════════════════
   MAIN JS — nav, mobile burger, scroll reveal, matrix rain,
   ticker, shared helpers (cache, sanitizer, extractor), SW
   ══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ── Mobile burger ─────────────────────────────────────── */
  var burger = document.getElementById('navBurger');
  var links = document.getElementById('navLinks');
  if (burger && links) {
    burger.addEventListener('click', function () {
      var open = links.classList.toggle('open');
      burger.classList.toggle('open', open);
      burger.setAttribute('aria-expanded', open);
    });
    links.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', function () {
        links.classList.remove('open');
        burger.classList.remove('open');
      });
    });
  }

  /* ── Scroll reveal ──────────────────────────────────────── */
  var revealEls = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window && !prefersReduced) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          en.target.classList.add('visible');
          io.unobserve(en.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    revealEls.forEach(function (el) { io.observe(el); });
  } else {
    revealEls.forEach(function (el) { el.classList.add('visible'); });
  }

  /* ── Matrix rain (hero canvas) ──────────────────────────── */
  var canvas = document.getElementById('matrixCanvas');
  if (canvas && !prefersReduced) {
    var ctx = canvas.getContext('2d');
    var chars = '01アイウエオカキクケコサシスセソ<>{}[]#$%&*+=/\\;:!?';
    var fontSize = 15;
    var columns = 0;
    var drops = [];
    var running = true;

    function resize() {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
      columns = Math.floor(canvas.width / fontSize);
      drops = new Array(columns).fill(0).map(function () { return Math.random() * -60; });
    }

    function draw() {
      if (!running) return;
      ctx.fillStyle = 'rgba(4, 8, 16, 0.085)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.font = fontSize + 'px "Share Tech Mono", monospace';
      for (var i = 0; i < drops.length; i++) {
        var ch = chars[Math.floor(Math.random() * chars.length)];
        var x = i * fontSize;
        var y = drops[i] * fontSize;
        ctx.fillStyle = Math.random() > 0.975 ? '#9ffcff' : 'rgba(0, 240, 255, 0.5)';
        ctx.fillText(ch, x, y);
        if (y > canvas.height && Math.random() > 0.976) drops[i] = 0;
        drops[i]++;
      }
      requestAnimationFrame(draw);
    }

    resize();
    window.addEventListener('resize', resize);
    requestAnimationFrame(draw);
    document.addEventListener('visibilitychange', function () {
      running = !document.hidden;
      if (running) requestAnimationFrame(draw);
    });
  }

  /* ── Ticker: duplicate content for seamless loop ────────── */
  var move = document.querySelector('.ticker-move');
  if (move && move.children.length > 0) {
    move.innerHTML += move.innerHTML;
  }

  /* ── Footer year ────────────────────────────────────────── */
  var yr = document.getElementById('year');
  if (yr) yr.textContent = new Date().getFullYear();

  /* ── Close mobile menu on outside click ─────────────────── */
  document.addEventListener('click', function (e) {
    if (links && links.classList.contains('open') &&
        !links.contains(e.target) && !burger.contains(e.target)) {
      links.classList.remove('open');
      burger.classList.remove('open');
    }
  });

  /* ── Service worker registration (offline support) ──────── */
  if ('serviceWorker' in navigator &&
      (location.protocol === 'https:' ||
       location.hostname === 'localhost' ||
       location.hostname === '127.0.0.1')) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () { /* non-fatal */ });
    });
  }

  /* ══════════════════════════════════════════════════════════
     SHARED HELPERS — used by news.js and article.js
     ══════════════════════════════════════════════════════════ */
  var ART_PREFIX = 'cnb-full-';
  var MAX_CACHED = 40;

  function hashId(str) {
    var h = 5381;
    str = String(str || '');
    for (var i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
    return h.toString(36);
  }

  function stripHtml(html) {
    var d = document.createElement('div');
    d.innerHTML = html;
    return (d.textContent || d.innerText || '').trim();
  }

  function escapeHtml(s) {
    var map = {};
    map['&'] = '&' + 'amp;';
    map['<'] = '&' + 'lt;';
    map['>'] = '&' + 'gt;';
    map['"'] = '&' + 'quot;';
    map["'"] = '&' + '#39;';
    return String(s || '').replace(/[&<>"']/g, function (c) { return map[c]; });
  }

  function timeAgo(dateStr) {
    var d = new Date(dateStr);
    if (isNaN(d.getTime())) return 'recently';
    var s = Math.floor((Date.now() - d.getTime()) / 1000);
    if (s < 60) return 'just now';
    var m = Math.floor(s / 60);
    if (m < 60) return m + 'm ago';
    var h = Math.floor(m / 60);
    if (h < 24) return h + 'h ago';
    var dd = Math.floor(h / 24);
    if (dd < 30) return dd + 'd ago';
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  }

  /* ── Article full-content cache (localStorage) ───────────── */
  var artCache = {
    load: function (id) {
      try { return JSON.parse(localStorage.getItem(ART_PREFIX + id) || 'null'); }
      catch (e) { return null; }
    },
    save: function (id, html, image) {
      try {
        localStorage.setItem(ART_PREFIX + id, JSON.stringify({
          t: Date.now(), html: html, image: image || ''
        }));
        pruneCache();
      } catch (e) { /* quota exceeded — ignore */ }
    }
  };

  function pruneCache() {
    try {
      var keys = [];
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf(ART_PREFIX) === 0) keys.push(k);
      }
      if (keys.length <= MAX_CACHED) return;
      var entries = keys.map(function (k) {
        var t = 0;
        try { t = (JSON.parse(localStorage.getItem(k)) || {}).t || 0; } catch (e) {}
        return { k: k, t: t };
      }).sort(function (a, b) { return b.t - a.t; });
      entries.slice(MAX_CACHED).forEach(function (en) { localStorage.removeItem(en.k); });
    } catch (e) {}
  }

  /* ── Sanitize extracted HTML before rendering/storing ────── */
  var KILL_TAGS = 'script,style,iframe,frame,form,input,button,select,textarea,object,embed,link,meta,noscript,svg,video,audio,ins,nav,aside';

  function sanitizeFrag(frag, baseUrl) {
    frag.querySelectorAll(KILL_TAGS).forEach(function (el) { el.remove(); });
    frag.querySelectorAll('*').forEach(function (el) {
      Array.prototype.slice.call(el.attributes).forEach(function (at) {
        var n = at.name.toLowerCase();
        if (n.indexOf('on') === 0 || n === 'style' || n === 'class' || n === 'id' || n === 'srcset') {
          el.removeAttribute(at.name);
        }
      });
      var tag = el.tagName.toLowerCase();
      if (tag === 'a') {
        el.setAttribute('href', absolutize(el.getAttribute('href') || '#', baseUrl));
        el.setAttribute('target', '_blank');
        el.setAttribute('rel', 'noopener noreferrer');
      }
      if (tag === 'img') {
        var src = el.getAttribute('data-src') || el.getAttribute('src');
        if (src) {
          el.setAttribute('src', absolutize(src, baseUrl));
          el.setAttribute('loading', 'lazy');
          el.style.maxWidth = '100%';
          el.style.height = 'auto';
          el.style.borderRadius = '8px';
          el.addEventListener('error', function () { el.remove(); });
        } else {
          el.remove();
        }
      }
    });
    return frag;
  }

  function absolutize(u, base) {
    try { return new URL(u, base).href; } catch (e) { return u; }
  }

  /* ── Readability-style content extraction ────────────────── */
  var PAGE_JUNK = 'script,style,nav,header,footer,aside,form,noscript,iframe,svg,' +
    '[role=navigation],[role=banner],[role=contentinfo],' +
    '.sidebar,.comments,#comments,.related,.share,.social,.ad,.ads,.advert,.promo,.newsletter';

  var CONTENT_SELECTORS = [
    'article', '.entry-content', '.post-content', '.article-body', '.article__body',
    '.article-content', '.td-post-content', '.story-body', '.postBody',
    '#article-body', '.markdown-body', 'main', '.content'
  ];

  function extractContent(htmlText, baseUrl) {
    var doc = new DOMParser().parseFromString(htmlText, 'text/html');
    if (!doc || !doc.body) return null;

    // og:image for the hero
    var og = doc.querySelector('meta[property="og:image"],meta[name="og:image"]');
    var image = og ? absolutize(og.getAttribute('content') || '', baseUrl) : '';

    doc.querySelectorAll(PAGE_JUNK).forEach(function (el) { el.remove(); });

    var best = null, bestScore = -1;
    CONTENT_SELECTORS.forEach(function (sel) {
      try {
        doc.querySelectorAll(sel).forEach(function (el) {
          var ps = el.querySelectorAll('p').length;
          if (!ps) return;
          var textLen = (el.textContent || '').trim().length;
          var score = ps * 40 + Math.min(textLen, 12000) * 0.08;
          if (score > bestScore) { best = el; bestScore = score; }
        });
      } catch (e) { /* bad selector — skip */ }
    });

    var frag = document.createElement('div');
    if (best) {
      best.querySelectorAll('p,h2,h3,h4,img,figure,blockquote,ul,ol,pre').forEach(function (el) {
        frag.appendChild(el.cloneNode(true));
      });
    }
    if ((frag.textContent || '').trim().length < 300) {
      frag = document.createElement('div');
      doc.querySelectorAll('p').forEach(function (p) {
        if ((p.textContent || '').trim().length > 60) frag.appendChild(p.cloneNode(true));
      });
    }

    if (!image) {
      var fi = frag.querySelector('img');
      image = fi ? (fi.getAttribute('src') || '') : '';
    }
    return { frag: frag, image: image };
  }

  /* ── Card image fallback chain (called from inline onerror) ──
     image → thum.io screenshot (set at render) → source favicon → letter */
  window.cardImgFail = function (el) {
    if (!el.dataset.fbdone) {
      el.dataset.fbdone = '1';
      var host = '';
      try { host = new URL(el.dataset.src || '').hostname; } catch (e) {}
      if (host) {
        el.src = 'https://www.google.com/s2/favicons?sz=128&domain=' + encodeURIComponent(host);
        return;
      }
    }
    // final fallback: letter placeholder
    var letter = (el.dataset.letter || 'C').toUpperCase();
    if (letter.length > 1) letter = letter.charAt(0); // guard against escaped junk
    el.outerHTML = '<div class="no-img">' + letter + '</div>';
  };

  /* ── Export ──────────────────────────────────────────────── */
  window.CNB = {
    observeCards: function (grid) {
      var cards = grid.querySelectorAll('.news-card:not(.visible)');
      if (!('IntersectionObserver' in window) || prefersReduced) {
        cards.forEach(function (c) { c.classList.add('visible'); });
        return;
      }
      var io2 = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) {
            var sibs = Array.prototype.indexOf.call(en.target.parentNode.children, en.target);
            en.target.style.setProperty('--d', (sibs % 3) * 0.09 + 's');
            en.target.classList.add('visible');
            io2.unobserve(en.target);
          }
        });
      }, { threshold: 0.08, rootMargin: '0px 0px -20px 0px' });
      cards.forEach(function (c) { io2.observe(c); });
    },
    stripHtml: stripHtml,
    escapeHtml: escapeHtml,
    timeAgo: timeAgo,
    hashId: hashId,
    artCache: artCache,
    sanitizeFrag: sanitizeFrag,
    extractContent: extractContent
  };
})();
