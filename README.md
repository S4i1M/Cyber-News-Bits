# Cyber News Bits

Live cybersecurity news — real-time updates, zero API keys, runs entirely on GitHub Pages.

## What's New (v2.0)

- **Live news feed** — pulls real-time stories from The Hacker News, BleepingComputer and Hacker News (via the free Algolia API). No API key, no backend, no build step.
- **Auto-refresh** — the feed silently refreshes every 5 minutes; a manual refresh button is included too.
- **Dark / Light themes** — toggle in the navbar, saved to localStorage, remembers your choice across visits.
- **Search + category filters** — filter by ransomware, malware, data breach, vulnerability, phishing, AI security and privacy. Live search as you type.
- **Breaking news ticker** — scrolling headlines strip, pauses on hover.
- **Animations** — matrix rain hero, glitch title, glassmorphism cards, scroll-reveal with stagger, skeleton loading, animated terminal — all respecting `prefers-reduced-motion`.
- **Fully responsive** — slide-in mobile menu, adaptive grids, works from phone to desktop.

## Structure

```
├── index.html        # Live news feed (homepage)
├── article.html      # Article reader (loads from live feed cache)
├── about.html        # About page
├── services.html     # Services page
├── css/style.css     # Single stylesheet, both themes
├── js/theme.js       # Dark/light toggle + persistence
├── js/main.js        # Nav, matrix rain, scroll reveal, helpers
├── js/news.js        # Live feed engine (RSS + HN Algolia)
└── img/, assets/     # Logos and images
```

## How the live feed works (no backend!)

The site is 100% static. News is fetched in the browser:

1. **RSS feeds** (The Hacker News, BleepingComputer) are fetched via `api.rss2json.com` (free, no key), with an `allorigins.win` CORS-proxy fallback that parses the XML client-side.
2. **Hacker News** security stories come from the official Algolia HN Search API (CORS-enabled, free).
3. Articles are merged, de-duplicated, auto-categorised by keywords, and rendered.
4. Clicking a card opens `article.html`, which reads the story from the session cache (with a light HN refetch fallback).

If all feeds are rate-limited, a friendly retry screen appears — just hit refresh.

## Deploy on GitHub Pages

1. Push this repo to GitHub.
2. Settings → Pages → Source: `main` branch, root.
3. Done — your feed is live at `https://<username>.github.io/Cyber-News-Bits/`.

## Local preview

Any static server works:

```bash
python -m http.server 8000
# open http://localhost:8000
```

---

Copyright © Cyber News Bits — All Rights Reserved.

---

## What's New (v3.0) — In-site Reader + Offline Cache

- **Read full articles without leaving the site** — the article page now fetches the original story, extracts the main content (readability-style), and renders it inside Cyber News Bits with images. The original source is one click away, only if you want it.
- **Cached for offline reading** — every article you open is sanitized and saved to localStorage (up to 40 stories, oldest evicted). Re-open instantly, even with zero network. A "CACHED" badge shows when you're reading from your local copy.
- **Reading progress bar + reading time** — animated scroll progress at the top, estimated read time in the meta row.
- **Service worker (PWA)** — the whole site works offline: pages, styles, scripts and even the last successful news feed are cached. GitHub Pages serves HTTPS, so the worker registers automatically.
- **Security** — all fetched article HTML is sanitized client-side: scripts, styles, iframes, forms, inline handlers and srcset are stripped before render or caching; links open in new tabs with `rel="noopener"`.

### How the reader works

1. Feed render pre-warms the cache for sources that include full content in RSS (The Hacker News does).
2. Opening an article checks localStorage first → instant render.
3. Otherwise the story page is fetched through free CORS proxies (allorigins → codetabs), the main content extracted from the DOM, sanitized, rendered and cached.
4. If both fail, the summary still renders in-site with a clear note.

---

## What's New (v4.0) — 10 Balanced Sources + Images on Every Card

- **10 sources instead of 3** — The Hacker News, BleepingComputer, SecurityWeek, The Register, Krebs on Security, Help Net Security, GBHackers, CISA Advisories, Schneier on Security, plus Hacker News (Algolia). Each source is capped at 8 items so no single outlet dominates the feed.
- **Every card gets an image** via a 4-level fallback chain:
  1. Image provided by the feed (enclosure / media:content / thumbnail)
  2. First `<img>` inside the feed's article content (The Hacker News includes these)
  3. Live screenshot of the article via thum.io (free, no key)
  4. Source favicon (Google s2 service) → letter placeholder as last resort
- **Better media parsing** — the XML fallback parser now reads `media:content` / `media:thumbnail` (picks the largest width) in addition to enclosures.
- **Service worker v2** — caches screenshots and favicons so cards keep their images offline too.
- Dead sources degrade gracefully: any feed that fails just contributes zero items; the rest of the feed still loads.
