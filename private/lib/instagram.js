'use strict';

const config = require('../config');

// Instagram feed proxy: scrapes the profile page with Playwright to get the
// latest posts, caches them, and exposes them at /api/instagram. Falls back
// gracefully to an empty list (the frontend then renders its static cards).
const instagramCache = { posts: [], fetchedAt: 0 };

let instagramBrowserPromise = null;

async function getInstagramBrowser() {
  if (!instagramBrowserPromise) {
    const { chromium } = require('playwright');
    instagramBrowserPromise = chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });
  }
  return instagramBrowserPromise;
}

async function scrapeInstagramWithPlaywright() {
  const browser = await getInstagramBrowser();
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
    locale: 'es-ES'
  });
  try {
    const page = await context.newPage();
    await page.goto(`https://www.instagram.com/${config.instagramUser}/`, {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });
    try {
      await page.waitForSelector('a[href*="/p/"], a[href*="/reel/"]', { timeout: 15000 });
    } catch (_) {
      // selector may not appear if a login wall shows; extraction handles that
    }
    const grid = await page.evaluate(() => {
      const seen = new Set();
      const out = [];
      for (const a of document.querySelectorAll('a[href*="/p/"], a[href*="/reel/"]')) {
        const m = a.href.match(/\/(?:p|reel)\/([A-Za-z0-9_-]+)/);
        if (!m || seen.has(m[1])) continue;
        seen.add(m[1]);
        const img = a.querySelector('img');
        out.push({
          link: a.href,
          thumbnail: img ? img.currentSrc || img.src || '' : ''
        });
        if (out.length >= 3) break;
      }
      return out;
    });

    const posts = [];
    for (const entry of grid) {
      let title = '';
      try {
        // Open each post and read the real caption from its page metadata
        // (the profile grid only exposes auto-generated image alt text).
        await page.goto(entry.link, { waitUntil: 'domcontentloaded', timeout: 30000 });
        title = await page.evaluate(() => {
          const m = document.querySelector('meta[name="description"]') ||
                   document.querySelector('meta[property="og:description"]');
          if (!m || !m.content) return '';
          const start = m.content.indexOf(': "');
          if (start === -1) return m.content;
          const inner = m.content.slice(start + 3);
          const end = inner.lastIndexOf('"');
          return end > 0 ? inner.slice(0, end).trim() : inner.trim();
        });
      } catch (err) {
        console.error('[instagram] caption fetch failed:', err.message);
      }
      posts.push({ title, link: entry.link, thumbnail: entry.thumbnail });
    }
    return posts;
  } finally {
    await context.close();
  }
}

async function fetchInstagramPosts() {
  try {
    const posts = await scrapeInstagramWithPlaywright();
    return posts;
  } catch (err) {
    console.error('[instagram] Playwright scrape failed:', err.message);
    instagramBrowserPromise = null;
    return [];
  }
}

async function getInstagramPosts() {
  const now = Date.now();
  if (instagramCache.posts.length && now - instagramCache.fetchedAt < config.instagramCacheTtlMs) {
    return instagramCache.posts;
  }
  const posts = await fetchInstagramPosts();
  instagramCache.posts = posts;
  instagramCache.fetchedAt = now;
  return posts;
}

module.exports = { getInstagramPosts };
