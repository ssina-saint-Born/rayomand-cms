# Theme delivery

Rayomand ships one content store and three ways to render it. A customer picks
whichever fits their team, and can switch later without touching content.

## Route 1 — Declarative themes (JSON only)

A theme is a single JSON document: design tokens, layout flags and an ordered
list of home-page sections. It contains no code, so installing one is a data
import, not a deployment.

```json
{
  "slug": "harbor",
  "name": "Harbor",
  "description": "Cool blue coastal pack.",
  "version": "1.0.0",
  "license": "free",
  "tokens": {
    "bg": "#eef4f8", "surface": "#ffffff", "text": "#1f3448", "muted": "#5c7288",
    "accent": "#2563a8", "accentText": "#ffffff",
    "headerBg": "#ffffff", "headerText": "#1f3448", "border": "#d5e2ec",
    "radius": 14, "font": "sans", "maxWidth": 860
  },
  "layout": {
    "header": "centered", "footer": "simple", "contentWidth": "narrow",
    "cardStyle": "flat", "showSearch": true, "showLanguage": true, "stickyHeader": false
  },
  "home": [
    { "type": "hero", "title": "Welcome to Harbor", "subtitle": "A calm blue reading room." },
    { "type": "latest", "title": "Fresh writing", "count": 6 }
  ]
}
```

Allowed values:

| Field | Values |
| --- | --- |
| `tokens.font` | `sans`, `serif`, `mono` |
| `tokens.radius` | 0–40 |
| `tokens.maxWidth` | 480–1400 |
| `layout.header` | `classic`, `centered`, `minimal` |
| `layout.footer` | `columns`, `simple` |
| `layout.contentWidth` | `narrow`, `wide` |
| `layout.cardStyle` | `soft`, `flat`, `outline` |
| `home[].type` | `hero`, `featured`, `latest`, `categories`, `cta` |

Every value is validated in `lib/theme/spec.ts`. Colours are checked against a
character allow-list, links must be site-relative or `http(s)`, and counts are
clamped — a pack cannot inject CSS, scripts or `javascript:` URLs.

Install via **Studio → Appearance → Themes → Install pack** (upload the JSON) or:

```
POST /api/content/themes/packs          { "pack": "<json string>" }
GET  /api/content/themes/packs
DELETE /api/content/themes/packs?slug=harbor
```

Built-in packs live in `lib/theme/builtin.ts`: Meadow, Sandstone, Evening and
Linen are free; Aurora and Monograph are premium (see licensing below).

## Route 2 — Coded themes

For teams that need custom React. Register a shell by slug in
`lib/theme/coded.ts` and implement it in
`components/site/theme/CodedShells.tsx`. The layout in `app/(site)/layout.tsx`
detects the coded shell and renders it instead of the declarative frame. The
palette still comes from theme tokens so accent colours stay consistent.

A worked example (`magazine`) ships with the CMS and is selectable immediately.

## Route 3 — Headless frontend

Render the site in a separate app. The content API is read-only, unauthenticated
and CORS-enabled; it only ever returns published content.

```
GET /api/public/posts?page=1&perPage=10&q=&category=&tag=
GET /api/public/post/{slug}
GET /api/public/categories
```

Responses include the active theme's `tokens` and `layout`, so a headless client
can mirror the same palette. Engine selection is stored in
`options.theme_engine` (`declarative` | `coded` | `headless`).

## Licensing premium themes

Premium themes are locked until a matching serial is activated. Verification is
offline — an Ed25519 signature check against a public key embedded in
`lib/theme/license.ts` — so a customer's site never calls the vendor.

Serial format:

```
RM1.<base64url(payload JSON)>.<base64url(signature)>
payload = { s: serialId, p: product, t: theme, i: issuedAt, e: expiresAt, n: sites, h: host }
```

Vendor side — mint a serial (private key never ships):

```
THEME_SIGNING_KEY=./private.pem npm run theme:mint -- \
  --product aurora --theme aurora --days 365 --sites 1 [--host example.com]
```

Omit `--days` for a perpetual license; pass `--product '*'` to unlock all themes.

Customer side — two equivalent ways to complete the purchase:

1. **Paste the serial**: Studio → Appearance → Themes → License, or
   `POST /api/content/themes/licenses { "serial": "RM1..." }`.
   `PUT` validates without activating; `DELETE ?serial=` removes it.
2. **Open the vendor's download link**:
   `GET /api/content/themes/bundle?serial=RM1...&theme=aurora`
   streams a ZIP containing `theme.json`, `manifest.json` and `INSTALL.txt`.
   The admin can inspect the JSON, then upload it as a pack.

A locked premium theme that is still the stored selection renders the free
fallback (Meadow) rather than breaking the site; the manager shows it as locked,
not active.
