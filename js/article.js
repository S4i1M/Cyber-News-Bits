/* ══════════════════════════════════════════════════════════════════
   ARTICLE READER — full story inside the site, cached for offline.
   Pipeline:
     1. meta from session cache (or HN fallback)
     2. full content from localStorage cache  → render (offline OK)
     3. else fetch source via free CORS proxies → extract →
        sanitize → render → cache for next time
     4. never navigates away — external link only on user click
   ══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  function $(id) { return document.getElementById(id); }

  function esc(s) { return window.CNB ? window.CNB.escapeHtml(s) : String(s); }
  function strip(s) { return window.CNB ? window.CNB.stripHtml(s) : String(s); }
  function timeAgo(s) { return window.CNB ? window.CNB.timeAgo(s) : s; }

  /* ── Fetch with timeout + proxy chain ────────────────────────── */
  function fetchTimeout(url, ms) {
    var ctrl = new AbortController();
    var t = setTimeout(function () { ctrl.abort(); }, ms || 15000);
    return fetch(url, { signal: ctrl.signal }).finally(function () { clearTimeout(t); });
  }

  var PROXIES = [
    'https://api.allorigins.win/raw?url=',
    'https://api.codetabs.com/v1/proxy?quest='
  ];

  function fetchArticleHtml(articleUrl) {
    var i = 0;
    function tryNext() {
      if (i >= PROXIES.length) return Promise.reject(new Error('proxies exhausted'));
      var p = PROXIES[i++];
      return fetchTimeout(p + encodeURIComponent(articleUrl), 18000)
        .then(function (r) { if (!r.ok) throw 0; return r.text(); })
        .then(function (txt) {
          if (!txt || txt.length < 600) throw 0;
          return txt;
        })
        .catch(tryNext);
    }
    return tryNext();
  }

  /* ── Render helpers ──────────────────────────────────────────── */
  function renderMeta(a) {
    document.title = a.title + ' | Cyber News Bits';
    $('artTitle').textContent = a.title;
    $('artTag').textContent = a.category || 'security';
    $('artSource').textContent = a.source || '';
    $('artDate').textContent = timeAgo(a.date);

    if (a.image) setHeroImage(a.image);

    if (a.link) {
      var cta = $('artCta');
      cta.style.display = 'flex';
      $('artLink').href = a.link;
    }
  }

  function setHeroImage(url) {
    if (!url) return;
    $('artImgWrap').innerHTML =
      '<img src="' + esc(url) + '" alt="" onerror="this.parentNode.innerHTML=\'<div class=no-img>CNB</div>\'">';
  }

  function readingTime(html) {
    var words = strip(html).split(/\s+/).filter(Boolean).length;
    return Math.max(1, Math.round(words / 200));
  }

  function renderBody(html, fromCache) {
    var body = $('artBody');
    body.innerHTML = html;

    $('readTime').innerHTML = '<i class="fas fa-clock"></i> ' + readingTime(html) + ' min read';
    if (fromCache) {
      var badge = $('cacheBadge');
      badge.style.display = 'inline-flex';
      badge.title = 'Read from your local cache — available offline';
    }
    // reveal animation
    body.classList.add('loaded');
  }

  function renderLoading() {
    $('artBody').innerHTML =
      '<p><span class="sk-line skeleton" style="display:block;margin:0 0 1rem"></span>' +
      '<span class="sk-line skeleton" style="display:block;margin:0 0 1rem"></span>' +
      '<span class="sk-line w60 skeleton" style="display:block"></span></p>';
  }

  function renderFallback(a, reason) {
    // Last resort: show the summary in-site + clear path to source
    var body = $('artBody');
    var text = strip(a.description || '');
    body.innerHTML = text
      ? '<p>' + esc(text) + '</p>'
      : '<p>The full story couldn\'t be extracted automatically.</p>';
    body.innerHTML +=
      '<div class="article-cta" style="display:flex">' +
      '<p><i class="fas fa-circle-info" style="color:var(--accent)"></i> ' +
      (reason === 'offline' ? 'You\'re offline and this story isn\'t cached yet.' :
        'Live extraction hit a rate limit — you can read it at the source.') + '</p>' +
      '</div>';
    if (a.link) $('artCta').style.display = 'flex';
  }

  /* ── The pipeline ─────────────────────────────────────────────── */
  function start(a) {
    renderMeta(a);

    // 1. Cached full content?
    var full = window.CNB ? window.CNB.artCache.load(a.id) : null;
    if (full && full.html) {
      renderBody(full.html, true);
      return; // instant, offline-capable
    }

    // 2. Fetch + extract
    renderLoading();
    fetchArticleHtml(a.link)
      .then(function (htmlText) {
        var ex = window.CNB ? window.CNB.extractContent(htmlText, a.link) : null;
        if (!ex || (ex.frag.textContent || '').trim().length < 250) throw new Error('extraction failed');

        window.CNB.sanitizeFrag(ex.frag, a.link);
        var cleanHtml = ex.frag.innerHTML;

        // hero image: feed image > og:image > first content image
        if (!a.image && ex.image) {
          setHeroImage(ex.image);
        }

        renderBody(cleanHtml, false);
        window.CNB.artCache.save(a.id, cleanHtml, a.image || ex.image || '');
      })
      .catch(function () {
        // 3. No cache + fetch failed → summary in-site, source on request
        renderFallback(a, navigator.onLine === false ? 'offline' : 'limited');
      });
  }

  /* ── Reading progress bar ─────────────────────────────────────── */
  var bar = $('readProgress');
  if (bar) {
    window.addEventListener('scroll', function () {
      var h = document.documentElement;
      var max = h.scrollHeight - h.clientHeight;
      bar.style.width = (max > 0 ? (h.scrollTop / max) * 100 : 0) + '%';
    }, { passive: true });
  }

  /* ── Boot ─────────────────────────────────────────────────────── */
  var id = new URLSearchParams(window.location.search).get('id');
  var articles = [];
  try { articles = JSON.parse(sessionStorage.getItem('cnb-articles') || '[]'); } catch (e) {}

  function findById(list, wanted) {
    for (var i = 0; i < list.length; i++) if (list[i].id === wanted) return list[i];
    return null;
  }

  var meta = id ? findById(articles, id) : null;

  if (meta) {
    start(meta);
  } else {
    // Direct visit / expired session — recover meta from the HN API
    $('artTitle').textContent = 'Locating story…';
    fetchTimeout('https://hn.algolia.com/api/v1/search_by_date?query=security&tags=story&hitsPerPage=50', 10000)
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var hash = window.CNB ? window.CNB.hashId : function (s) { return String(s).length; };
        var hits = (data.hits || []).map(function (h) {
          var link = h.url || ('https://news.ycombinator.com/item?id=' + h.objectID);
          return {
            id: 'a' + hash(link),
            title: h.title || '',
            description: h.story_text || 'Discussed on Hacker News.',
            link: link,
            date: new Date(h.created_at_i * 1000).toISOString(),
            source: 'Hacker News',
            image: '',
            category: 'security',
            content: ''
          };
        });
        var found = id ? findById(hits, id) : null;
        if (found) {
          start(found);
        } else {
          $('artTitle').textContent = 'Story not found';
          $('artBody').innerHTML =
            '<p>This story has rolled out of the live cache. Head back to the feed for the latest threats.</p>';
        }
      })
      .catch(function () {
        $('artTitle').textContent = 'Story not found';
        $('artBody').innerHTML =
          '<p>Couldn\'t reach the network to locate this story. Open the feed and try again.</p>';
      });
  }
})();
