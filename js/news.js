/* ══════════════════════════════════════════════════════════════════
   NEWS ENGINE — live cybersecurity news, no API key required
   10 balanced sources (each capped so no single one dominates):
     · The Hacker News      · BleepingComputer
     · SecurityWeek         · The Register (Security)
     · Krebs on Security    · Help Net Security
     · GBHackers            · CISA Advisories
     · Schneier on Security · Hacker News (Algolia API)
   Card images: RSS image → first <img> in content → thum.io live
   screenshot → source favicon → letter placeholder.
   ══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var FEEDS = [
    { name: 'The Hacker News', url: 'https://feeds.feedburner.com/TheHackersNews' },
    { name: 'BleepingComputer', url: 'https://www.bleepingcomputer.com/feed/' },
    { name: 'SecurityWeek', url: 'https://www.securityweek.com/feed/' },
    { name: 'The Register', url: 'https://www.theregister.com/security/headlines.atom' },
    { name: 'Krebs on Security', url: 'https://krebsonsecurity.com/feed/' },
    { name: 'Help Net Security', url: 'https://www.helpnetsecurity.com/feed/' },
    { name: 'GBHackers', url: 'https://gbhackers.com/feed/' },
    { name: 'CISA', url: 'https://www.cisa.gov/cybersecurity-advisories/all.xml' },
    { name: 'Schneier on Security', url: 'https://schneier.com/blog/atom.xml' }
  ];
  var HN_API = 'https://hn.algolia.com/api/v1/search_by_date?query=security&tags=story&hitsPerPage=10';

  var PER_SOURCE_MAX = 8;   // balance: max items shown per source
  var REFRESH_MS = 5 * 60 * 1000;
  var allArticles = [];
  var activeFilter = 'all';
  var activeQuery = '';
  var lastUpdated = null;

  /* ── Category detection ─────────────────────────────────────── */
  var CATEGORY_RULES = [
    ['ransomware', /ransomware|ransom|lockbit|akira|extortion/i],
    ['malware', /malware|trojan|botnet|backdoor|infostealer|rootkit|worm|spyware/i],
    ['data breach', /breach|leak|exfiltrat|data.?theft|dump|credentials/i],
    ['vulnerability', /vulnerab|CVE-|zero.?day|0day|patch|exploit|flaw/i],
    ['phishing', /phish|scam|fraud|social.?engineering|BEC/i],
    ['ai security', /\bAI\b|artificial.?intelligence|LLM|machine.?learning|chatbot|deepfake/i],
    ['privacy', /privacy|GDPR|surveillance|tracking|cookie/i]
  ];

  function detectCategory(article) {
    var text = (article.title + ' ' + article.description).toLowerCase();
    for (var i = 0; i < CATEGORY_RULES.length; i++) {
      if (CATEGORY_RULES[i][1].test(text)) return CATEGORY_RULES[i][0];
    }
    return 'security';
  }

  /* ── Image helpers ───────────────────────────────────────────── */
  /* First <img src> inside feed HTML content (The Hacker News has this) */
  function imgFromHtml(html) {
    if (!html) return '';
    var m = /<img[^>]+src=["']([^"']+)["']/i.exec(html);
    return m ? m[1] : '';
  }

  function resolveImage(a) {
    return a.image || imgFromHtml(a.content) || imgFromHtml(a.description) || '';
  }

  /* ── Fetch helpers ──────────────────────────────────────────── */
  function fetchTimeout(url, ms) {
    var ctrl = new AbortController();
    var t = setTimeout(function () { ctrl.abort(); }, ms || 9000);
    return fetch(url, { signal: ctrl.signal }).finally(function () { clearTimeout(t); });
  }

  /* Namespaced-tag lookup (content:encoded, media:content, …) */
  function getTagNS(item, localName) {
    var els = item.getElementsByTagName('*');
    for (var i = 0; i < els.length; i++) {
      var ln = els[i].localName || els[i].tagName.replace(/^.*:/, '');
      if (ln === localName) return els[i];
    }
    return null;
  }

  /* Best image from media:content / media:thumbnail / enclosure */
  function mediaImage(item) {
    var mc = getTagNS(item, 'content');
    if (mc) {
      var best = null, bestW = -1;
      // possibly multiple media:content siblings — same localName, iterate
      var els = item.getElementsByTagName('*');
      for (var i = 0; i < els.length; i++) {
        var ln = els[i].localName || els[i].tagName.replace(/^.*:/, '');
        if (ln === 'content' && els[i].getAttribute('url')) {
          var w = parseInt(els[i].getAttribute('width') || '0', 10) || 0;
          if (w > bestW) { best = els[i]; bestW = w; }
        }
      }
      if (best) return best.getAttribute('url');
      if (mc.getAttribute('url')) return mc.getAttribute('url');
    }
    var mt = getTagNS(item, 'thumbnail');
    if (mt) return mt.getAttribute('url') || '';
    var enc = item.querySelector('enclosure');
    if (enc) return enc.getAttribute('url') || '';
    var th = item.querySelector('thumbnail');
    if (th) return th.getAttribute('url') || '';
    return '';
  }

  /* RSS via rss2json (returns clean JSON) */
  function fetchRss2Json(feedUrl) {
    return fetchTimeout('https://api.rss2json.com/v1/api.json?rss_url=' + encodeURIComponent(feedUrl), 9000)
      .then(function (r) { if (!r.ok) throw 0; return r.json(); })
      .then(function (data) {
        if (data.status !== 'ok' || !data.items) throw 0;
        return data.items.map(function (it) {
          return {
            title: it.title,
            description: it.description || '',
            content: it.content || it.description || '',
            link: it.link,
            date: it.pubDate,
            source: data.feed && data.feed.title ? data.feed.title : 'Feed',
            image: (it.thumbnail || (it.enclosure && it.enclosure.link) || '')
          };
        });
      });
  }

  /* RSS/Atom via allorigins + client-side XML parse */
  function fetchRssProxy(feedUrl) {
    return fetchTimeout('https://api.allorigins.win/raw?url=' + encodeURIComponent(feedUrl), 10000)
      .then(function (r) { if (!r.ok) throw 0; return r.text(); })
      .then(function (xmlText) {
        var doc = new DOMParser().parseFromString(xmlText, 'text/xml');
        if (doc.querySelector('parsererror')) throw 0;
        var items = doc.querySelectorAll('item');
        if (!items.length) items = doc.querySelectorAll('entry');
        var out = [];
        var feedTitle = (doc.querySelector('channel > title') || doc.querySelector('feed > title') || {}).textContent || 'Feed';
        items.forEach(function (it) {
          var get = function (tag) {
            var el = it.querySelector(tag);
            return el ? (el.textContent || '').trim() : '';
          };
          var linkEl = it.querySelector('link');
          var link = linkEl ? (linkEl.textContent || linkEl.getAttribute('href') || '') : '';
          var description = get('description') || get('summary') || '';
          out.push({
            title: get('title'),
            description: description,
            content: (getTagNS(it, 'encoded') && getTagNS(it, 'encoded').textContent) || description,
            link: link,
            date: get('pubDate') || get('published') || get('updated') || '',
            source: feedTitle,
            image: mediaImage(it)
          });
        });
        if (!out.length) throw 0;
        return out;
      });
  }

  function fetchFeed(feed) {
    return fetchRss2Json(feed.url)
      .catch(function () { return fetchRssProxy(feed.url); })
      .catch(function () { return []; })
      .then(function (items) {
        // cap per feed for balance
        return items.slice(0, PER_SOURCE_MAX).map(function (a) {
          a.source = a.source || feed.name;
          return a;
        });
      });
  }

  /* HN Algolia — CORS-friendly, no key */
  function fetchHN() {
    return fetchTimeout(HN_API, 9000)
      .then(function (r) { if (!r.ok) throw 0; return r.json(); })
      .then(function (data) {
        return (data.hits || []).map(function (h) {
          return {
            title: h.title || '',
            description: 'Discussed on Hacker News — ' + (h.points || 0) + ' points, ' + (h.num_comments || 0) + ' comments.',
            content: '',
            link: h.url || ('https://news.ycombinator.com/item?id=' + h.objectID),
            date: new Date(h.created_at_i * 1000).toISOString(),
            source: 'Hacker News',
            image: ''
          };
        });
      })
      .catch(function () { return []; });
  }

  /* ── Merge, dedupe, categorise ──────────────────────────────── */
  function mergeArticles(lists) {
    var seen = {};
    var merged = [];
    var hash = window.CNB ? window.CNB.hashId : function (s) { return String(s).length; };
    lists.forEach(function (list) {
      list.forEach(function (a) {
        if (!a.title || !a.link) return;
        var key = a.title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 80);
        if (seen[key]) return;
        seen[key] = true;
        a.category = detectCategory(a);
        a.id = 'a' + hash(a.link);
        a.image = resolveImage(a);
        merged.push(a);
      });
    });
    merged.sort(function (x, y) { return new Date(y.date) - new Date(x.date); });
    return merged;
  }

  /* ── Rendering ───────────────────────────────────────────────── */
  function cardImgHtml(a) {
    var esc = window.CNB ? window.CNB.escapeHtml : String;
    var letter = esc(String(a.source || 'C').charAt(0).toUpperCase());
    // 1. RSS/content image → 2. thum.io live screenshot → 3. favicon → 4. letter
    var src = a.image || ('https://image.thum.io/get/width/640/crop/400/noanimate/' + a.link);
    return '<img src="' + esc(src) + '" alt="" loading="lazy" data-src="' + esc(a.link) +
           '" data-letter="' + letter + '" onerror="cardImgFail(this)">';
  }

  function cardHtml(a) {
    var esc = window.CNB ? window.CNB.escapeHtml : String;
    var desc = (window.CNB ? window.CNB.stripHtml(a.description) : a.description).slice(0, 260);
    var ago = window.CNB ? window.CNB.timeAgo(a.date) : '';
    return (
      '<article class="news-card" data-id="' + a.id + '">' +
        '<div class="card-img">' + cardImgHtml(a) +
          '<span class="card-tag">' + esc(a.category) + '</span>' +
        '</div>' +
        '<div class="card-body">' +
          '<div class="card-meta">' +
            '<span class="src">' + esc(a.source) + '</span><span class="sep">//</span><span>' + ago + '</span>' +
          '</div>' +
          '<h3>' + esc(a.title) + '</h3>' +
          '<p class="card-desc">' + esc(desc) + '</p>' +
          '<div class="card-foot">' +
            '<a class="read-link" href="article.html?id=' + a.id + '">Read <i class="fas fa-arrow-right"></i></a>' +
            '<a href="' + esc(a.link) + '" target="_blank" rel="noopener noreferrer" title="Open original source"><i class="fas fa-external-link-alt" style="color:var(--text-3);font-size:.8rem"></i></a>' +
          '</div>' +
        '</div>' +
      '</article>'
    );
  }

  function renderSkeletons(n) {
    var grid = document.getElementById('newsGrid');
    if (!grid) return;
    var html = '';
    for (var i = 0; i < (n || 6); i++) {
      html += '<div class="skeleton-card"><div class="sk-img skeleton"></div><div class="sk-lines"><div class="sk-line skeleton"></div><div class="sk-line w60 skeleton"></div><div class="sk-line w40 skeleton"></div></div></div>';
    }
    grid.innerHTML = html;
  }

  function renderFeed() {
    var grid = document.getElementById('newsGrid');
    if (!grid) return;

    var list = allArticles.filter(function (a) {
      var okFilter = activeFilter === 'all' || a.category === activeFilter;
      var okQuery = !activeQuery ||
        (a.title + ' ' + a.description).toLowerCase().indexOf(activeQuery) !== -1;
      return okFilter && okQuery;
    });

    if (!list.length) {
      grid.innerHTML =
        '<div class="feed-status" style="grid-column:1/-1">' +
        '<i class="fas fa-satellite-dish"></i>' +
        '<h3>No stories match</h3>' +
        '<p>Try a different keyword or category.</p></div>';
      return;
    }

    grid.innerHTML = list.slice(0, 36).map(cardHtml).join('');
    if (window.CNB) window.CNB.observeCards(grid);
  }

  function renderTicker() {
    var track = document.getElementById('tickerItems');
    if (!track || !allArticles.length) return;
    var esc = window.CNB ? window.CNB.escapeHtml : String;
    var items = allArticles.slice(0, 10).map(function (a) {
      return '<a href="article.html?id=' + a.id + '"><span class="src">[' + esc(a.source) + ']</span>' + esc(a.title.length > 90 ? a.title.slice(0, 90) + '…' : a.title) + '</a>';
    }).join('');
    track.innerHTML = items;
    track.innerHTML += track.innerHTML;
  }

  function renderUpdated() {
    var el = document.getElementById('updatedNote');
    if (el && lastUpdated) {
      el.innerHTML = 'LAST SYNC <b>' + (window.CNB ? window.CNB.timeAgo(lastUpdated) : 'ok') + '</b>';
    }
  }

  function updateFilterChips() {
    var chips = document.getElementById('filterChips');
    if (!chips) return;
    var cats = {};
    allArticles.forEach(function (a) { cats[a.category] = true; });
    var order = ['all', 'ransomware', 'malware', 'data breach', 'vulnerability', 'phishing', 'ai security', 'privacy', 'security'];
    var html = order.filter(function (c) { return c === 'all' || cats[c]; })
      .map(function (c) {
        return '<button class="chip' + (c === activeFilter ? ' active' : '') + '" data-cat="' + c + '">' + c + '</button>';
      }).join('');
    chips.innerHTML = html;

    chips.querySelectorAll('.chip').forEach(function (b) {
      b.addEventListener('click', function () {
        activeFilter = b.getAttribute('data-cat');
        chips.querySelectorAll('.chip').forEach(function (x) { x.classList.remove('active'); });
        b.classList.add('active');
        renderFeed();
      });
    });
  }

  /* ── Persist: lean session list + prewarm offline reader ────── */
  function persistArticles() {
    try {
      var lean = allArticles.map(function (a) {
        return {
          id: a.id, title: a.title, link: a.link,
          description: String(a.description || '').slice(0, 800),
          date: a.date, source: a.source, image: a.image, category: a.category
        };
      });
      sessionStorage.setItem('cnb-articles', JSON.stringify(lean));
    } catch (e) { /* storage full — non-fatal */ }

    if (!window.CNB) return;
    allArticles.forEach(function (a) {
      if (!a.content || a.content.length < 400) return;
      var cached = window.CNB.artCache.load(a.id);
      if (cached) return;
      try {
        var frag = document.createElement('div');
        frag.innerHTML = a.content;
        window.CNB.sanitizeFrag(frag, a.link);
        if ((frag.textContent || '').trim().length > 250) {
          window.CNB.artCache.save(a.id, frag.innerHTML, a.image);
        }
      } catch (e) { /* skip this one */ }
    });
  }

  /* ── Load everything ─────────────────────────────────────────── */
  function loadNews(showSkeleton) {
    if (showSkeleton !== false) renderSkeletons(6);

    var jobs = FEEDS.map(fetchFeed);
    jobs.push(fetchHN());

    return Promise.all(jobs)
      .then(function (lists) {
        allArticles = mergeArticles(lists);
        lastUpdated = new Date().toISOString();

        if (!allArticles.length) {
          var grid = document.getElementById('newsGrid');
          if (grid) {
            grid.innerHTML =
              '<div class="feed-status" style="grid-column:1/-1">' +
              '<i class="fas fa-plug-circle-xmark"></i>' +
              '<h3>Live feeds unreachable</h3>' +
              '<p>The free news proxies may be rate-limited. Hit refresh to try again.</p>' +
              '<button class="btn btn-ghost" onclick="location.reload()"><i class="fas fa-rotate-right"></i> Retry</button></div>';
          }
          return;
        }

        persistArticles();
        renderTicker();
        updateFilterChips();
        renderFeed();
        renderUpdated();
      })
      .catch(function (err) {
        console.warn('News load error:', err);
      });
  }

  /* ── Search wiring ───────────────────────────────────────────── */
  var searchInput = document.getElementById('searchInput');
  var searchDebounce = null;
  if (searchInput) {
    searchInput.addEventListener('input', function () {
      clearTimeout(searchDebounce);
      searchDebounce = setTimeout(function () {
        activeQuery = searchInput.value.trim().toLowerCase();
        renderFeed();
      }, 280);
    });
  }

  /* ── Refresh button + auto-refresh ───────────────────────────── */
  var refreshBtn = document.getElementById('refreshBtn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', function () {
      var icon = refreshBtn.querySelector('i');
      if (icon) icon.classList.add('fa-spin');
      refreshBtn.disabled = true;
      loadNews(false).then(function () {
        if (icon) icon.classList.remove('fa-spin');
        refreshBtn.disabled = false;
      });
    });
  }

  setInterval(function () { loadNews(false); }, REFRESH_MS);
  setInterval(renderUpdated, 30000);

  /* Kick off */
  document.addEventListener('DOMContentLoaded', function () { loadNews(true); });
  if (document.readyState !== 'loading') loadNews(true);
})();
