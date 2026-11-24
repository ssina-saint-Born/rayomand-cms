// SEO / technical-metadata smoke test for Rayomand CMS.
// Runs against a live dev/prod server. Usage:
//   node seo-smoke.mjs [baseUrl]
// Requires a configured DATABASE_URL (it reads a published post + term slug).

import { Pool } from "pg";

const BASE = (process.argv[2] || process.env.SEO_BASE || "http://localhost:3000").replace(/\/+$/, "");

let pass = 0;
let fail = 0;
const results = [];

function check(name, cond, detail = "") {
  if (cond) {
    pass++;
    results.push(`  PASS  ${name}`);
  } else {
    fail++;
    results.push(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

async function get(path) {
  const res = await fetch(BASE + path, { redirect: "manual" });
  const text = await res.text();
  return { res, text, status: res.status };
}

function meta(html, attr, val) {
  const re = new RegExp(`<meta[^>]+${attr}=["']${val.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'][^>]*>`, "i");
  const m = html.match(re);
  if (!m) return null;
  const content = m[0].match(/content=["']([^"']*)["']/i);
  return content ? content[1] : "";
}

function linkRel(html, rel) {
  const re = new RegExp(`<link[^>]+rel=["']${rel}["'][^>]*>`, "i");
  const m = html.match(re);
  if (!m) return null;
  const href = m[0].match(/href=["']([^"']*)["']/i);
  return href ? href[1] : "";
}

function jsonLdBlocks(html) {
  const out = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    try {
      out.push(JSON.parse(m[1].replace(/\\u003c/g, "<")));
    } catch {
      out.push({ __parseError: true, raw: m[1] });
    }
  }
  return out;
}

function hasType(blocks, type) {
  return blocks.some((b) => b && (b["@type"] === type || (Array.isArray(b["@type"]) && b["@type"].includes(type))));
}

async function main() {
  console.log(`SEO smoke test against ${BASE}\n`);

  // ---- robots.txt ----
  const robots = await get("/robots.txt");
  check("robots.txt responds 200", robots.status === 200, `status ${robots.status}`);
  check("robots.txt disallows /studio", /Disallow:\s*\/studio/i.test(robots.text));
  check("robots.txt disallows /api", /Disallow:\s*\/api/i.test(robots.text));
  check("robots.txt references sitemap", /Sitemap:\s*https?:\/\//i.test(robots.text));

  // ---- sitemap.xml ----
  const sitemap = await get("/sitemap.xml");
  check("sitemap.xml responds 200", sitemap.status === 200, `status ${sitemap.status}`);
  check("sitemap.xml is XML urlset", /<urlset/i.test(sitemap.text));
  const urlCount = (sitemap.text.match(/<url>/g) || []).length;
  check("sitemap.xml contains URLs", urlCount > 0, `${urlCount} urls`);
  check("sitemap.xml excludes /studio", !/<loc>[^<]*\/studio/.test(sitemap.text));

  // ---- Discover a published post from the DB ----
  let slug = null;
  let termSlug = null;
  try {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const p = await pool.query("SELECT slug FROM posts WHERE status='publish' AND type='post' ORDER BY published_at DESC LIMIT 1");
    slug = p.rows[0]?.slug || null;
    const t = await pool.query("SELECT slug FROM terms WHERE taxonomy='category' LIMIT 1");
    termSlug = t.rows[0]?.slug || null;
    await pool.end();
  } catch (e) {
    console.log(`  (db lookup skipped: ${e.message})`);
  }

  // ---- Home page ----
  const home = await get("/");
  check("home responds 200", home.status === 200, `status ${home.status}`);
  check("home has <title>", /<title>[^<]+<\/title>/i.test(home.text));
  check("home has meta description", !!meta(home.text, "name", "description"));
  check("home has og:title", !!meta(home.text, "property", "og:title"));
  check("home has og:url", !!meta(home.text, "property", "og:url"));
  check("home has twitter:card", !!meta(home.text, "name", "twitter:card"));
  check("home has canonical", !!linkRel(home.text, "canonical"));
  const homeLd = jsonLdBlocks(home.text);
  check("home JSON-LD parses", homeLd.length > 0 && !homeLd.some((b) => b.__parseError));
  check("home has WebSite schema", hasType(homeLd, "WebSite"));
  check("home has Organization schema", hasType(homeLd, "Organization"));

  // ---- Article page ----
  if (slug) {
    const art = await get(`/read/${slug}`);
    check("article responds 200", art.status === 200, `status ${art.status}`);
    check("article has canonical", !!linkRel(art.text, "canonical"));
    check("article canonical points to /read/", (linkRel(art.text, "canonical") || "").includes(`/read/${slug}`));
    check("article og:type=article", (meta(art.text, "property", "og:type") || "") === "article");
    check("article has og:title", !!meta(art.text, "property", "og:title"));
    check("article has meta description", !!meta(art.text, "name", "description"));
    const artLd = jsonLdBlocks(art.text);
    check("article JSON-LD parses", artLd.length > 0 && !artLd.some((b) => b.__parseError));
    check("article has Article/WebPage schema", hasType(artLd, "Article") || hasType(artLd, "WebPage"));
    const article = artLd.find((b) => b["@type"] === "Article" || b["@type"] === "WebPage");
    check("article schema has datePublished", !!(article && article.datePublished));
    check("article schema has headline", !!(article && article.headline));
    check("article has breadcrumb schema", hasType(artLd, "BreadcrumbList"));
    // exactly one h1 in the article body
    const h1count = (art.text.match(/<h1[\s>]/gi) || []).length;
    check("article has a single <h1>", h1count === 1, `${h1count} h1 tags`);
  } else {
    console.log("  (no published post found; article checks skipped)");
  }

  // ---- Category archive ----
  if (termSlug) {
    const cat = await get(`/topics/${termSlug}`);
    check("category responds 200", cat.status === 200, `status ${cat.status}`);
    check("category has canonical", !!linkRel(cat.text, "canonical"));
    const catLd = jsonLdBlocks(cat.text);
    check("category has CollectionPage schema", hasType(catLd, "CollectionPage"));
  }

  // ---- Search page is noindex ----
  const search = await get("/search?s=test");
  check("search responds 200", search.status === 200, `status ${search.status}`);
  const searchRobots = meta(search.text, "name", "robots") || "";
  check("search is noindex", /noindex/i.test(searchRobots), `robots="${searchRobots}"`);

  // ---- 404 for a missing slug ----
  const missing = await get("/read/definitely-not-a-real-slug-xyz");
  check("missing post returns 404", missing.status === 404, `status ${missing.status}`);

  // ---- RSS feed ----
  const feed = await get("/journal/feed");
  check("feed responds 200", feed.status === 200, `status ${feed.status}`);
  check("feed is RSS", /<rss/i.test(feed.text));

  console.log(results.join("\n"));
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error("Smoke test crashed:", e);
  process.exit(1);
});
