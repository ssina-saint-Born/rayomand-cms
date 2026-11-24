# Rayomand CMS — Frontend and Theme Integration Specification

**Document revision:** 1.0 · **Source snapshot reviewed:** 2026-11-17

**Audience:** an AI coding assistant or developer building a public website for the existing Rayomand CMS publishing and commerce application.

**Goal:** published articles, pages, navigation, media and store products are read from the real CMS; customer interactions use its existing authentication, cart, orders and secure-download workflows. The new website is a presentation layer, not a replacement database or a mock store.

> This document describes the current custom Next.js application. It is not a Rayomand Core REST API specification, a Commerce compatibility promise or a PHP theme specification. Where a necessary integration capability is absent, it is explicitly labeled **Requires backend change**. The document itself does not implement those changes.

## Contents

1. [Instructions to the implementing AI](#1-instructions-to-the-implementing-ai)
2. [Architecture and integration choices](#2-architecture-and-integration-choices)
3. [Public website and administration routes](#3-public-website-and-administration-routes)
4. [HTTP, authentication and localization contracts](#4-http-authentication-and-localization-contracts)
5. [Entity names, identifiers and TypeScript contracts](#5-entity-names-identifiers-and-typescript-contracts)
6. [Publishing, pages, archives, menus and media](#6-publishing-pages-archives-menus-and-media)
7. [Block content rendering](#7-block-content-rendering)
8. [Catalog, products and variations](#8-catalog-products-and-variations)
9. [Basket, coupons and checkout](#9-basket-coupons-and-checkout)
10. [Receipts, account and reviews](#10-receipts-account-and-reviews)
11. [Digital downloads and newsletter](#11-digital-downloads-and-newsletter)
12. [Complete implemented API route reference](#12-complete-implemented-api-route-reference)
13. [PostgreSQL schema and relationships](#13-postgresql-schema-and-relationships)
14. [Adding and selecting a new theme](#14-adding-and-selecting-a-new-theme)
15. [Fresh publication, caching, SEO and UI requirements](#15-fresh-publication-caching-seo-and-ui-requirements)
16. [Explicit backend extensions and release blockers](#16-explicit-backend-extensions-and-release-blockers)
17. [Implementation examples](#17-implementation-examples)
18. [Local setup and deployment](#18-local-setup-and-deployment)
19. [Acceptance tests and AI delivery checklist](#19-acceptance-tests-and-ai-delivery-checklist)
20. [Source navigation](#20-source-navigation)

## 1. Instructions to the implementing AI

Use the following brief when handing this document to an AI:

> Build a production-oriented, responsive English/Persian public website for Rayomand CMS using the real contracts in this document. Prefer integration into the existing Next.js App Router project. Keep the CMS administration, database schema, authorization and commerce transactions intact. Implement the public routes, all supported block renderers, article/page archives, navigation, product catalog and variations, basket/coupons, manual-payment checkout, authorized receipts, customer account, reviews and secure digital downloads. Reuse the CMS data layer on the server and its existing same-origin APIs in browser components. Do not seed production data, invent endpoints or fabricate payment success. Do not connect a browser to PostgreSQL. Do not expose drafts, private content, customer information or download tokens. Clearly report backend changes needed to meet the security and integration requirements below. Verify the website in a browser with a dedicated test database, including English, Persian RTL, empty states and failure cases.

### 1.1 Non-negotiable rules

- Public content comes from `posts`, `terms`, `media`, `menus` and `menu_items` through the existing server functions or public API.
- Store content comes from `products` and the storefront API. Products are not records in the `posts` table.
- Never hard-code database IDs, product inventories, customer records, testimonials, orders or download URLs as live data.
- A database with no records is valid. Render intentional empty states rather than sample content.
- Visitors must never receive `DATABASE_URL`, `POSTGRES_PASSWORD`, `SETUP_TOKEN`, SMTP credentials or session tokens through JavaScript, HTML, public configuration or analytics.
- Use the current native URL prefixes. No old URL aliases are implemented.
- Preserve English API enum values and exact JSON property names, even in Persian mode.
- Do not translate author-created titles, descriptions, names, menu labels, addresses, filenames or other stored content automatically.
- Never obtain visitor-facing data by authenticating all requests as the administrator.
- Prices, stock, coupon eligibility, order ownership, download eligibility and grant consumption are server decisions.
- Do not silently replace a failed real service with mock data, a pretend mail sender or a fake payment gateway.
- Do not execute untrusted template packages or dynamically import arbitrary files selected by a database value.

### 1.2 Implemented versus absent

| Implemented now | Not implemented as a general capability |
| --- | --- |
| Next.js publishing and commerce UI, PostgreSQL, cookie sessions | Rayomand Core PHP theme/plugin execution |
| Structured block arrays and block-style editor | Full Gutenberg serialization or plugin compatibility |
| Public content/storefront/download APIs | Rayomand Core or Commerce standard REST contracts |
| Compiled theme color/font definitions | Upload/install a frontend theme ZIP |
| Manual payment options and server-created orders | Online card processing, Stripe/PayPal or verified gateway callbacks |
| SMTP transport with actual acceptance/error reporting | A mail log being proof of inbox delivery |
| English/Persian interface localization | Separate translated content entries or locale-specific content relations |
| Dynamic current public pages | A publishing webhook, automatic ISR invalidation or a scheduled-publishing worker |
| Protected local download handler and file grants | Remote file fetching, object-storage signed URLs or large-file streaming/range support |

## 2. Architecture and integration choices

### 2.1 Recommended: a theme inside the existing application

```text
Visitor browser
  ├─ GET public Next.js pages → server rendering
  │                              └─ lib/posts, lib/menus, lib/options,
  │                                 lib/woo/* → lib/db → PostgreSQL
  ├─ fetch same-origin /api/* → route handler
  │                            └─ authentication + validation + business rules
  │                               → PostgreSQL / local storage / SMTP
  └─ /uploads/* → public media assets

Content editor → /studio/* → management APIs → same PostgreSQL database
```

Use React Server Components for content and layout reads. Use client components for forms, basket updates, checkout, language switching and download dialogs. This avoids a second application needing to duplicate the CMS session or transaction behavior.

Relevant current boundaries:

- `app/(site)` owns the publishing presentation.
- `app/(shop)` owns the store presentation and supplies `StoreProvider`.
- Parentheses in these folders are Next.js route groups, not URL segments.
- `app/layout.tsx` supplies the language provider, document direction, fonts and brand metadata.
- `app/studio` and `app/api` are not theme replacement targets.
- `lib/db.ts` is server-only in architectural terms. Do not import it or a module that uses it into a `"use client"` component.
- Keep database-facing route handlers in the Node.js runtime. They are not Edge-compatible merely because the UI is Next.js.

### 2.2 Alternative: a separate frontend with a same-origin gateway

A separate React/Next.js application can be used, but it requires deliberate routing and cookie forwarding.

```text
Public origin
  /                         → frontend application
  /read/*, /collection/* ... → frontend application
  /studio/*                 → original CMS application
  /api/auth/*               → original CMS application
  /api/content/*            → original CMS application
  /api/storefront/*          → original CMS application
  /api/commerce/*            → original CMS application
  /api/downloads/*           → original CMS application
  /uploads/*                → CMS media storage
  /downloads/*              → CMS denial rule, never raw static delivery
```

**Requires infrastructure/backend work:** reverse proxy or Backend-for-Frontend (BFF), forwarding the request body, method, cookies and every upstream `Set-Cookie` header. Do not combine multiple `Set-Cookie` headers into a comma-separated string. Downloads require binary/body/header forwarding, not JSON parsing.

Key requirements:

1. The browser sees a single public origin. Relative `/api/...` URLs must reach the CMS, not the separate frontend's 404 page.
2. Forward `rm_session`, `wc_cart` and `rayomand_locale` as needed; never make the HttpOnly cookies readable to browser JavaScript.
3. Keep scheme/host information consistent. Download emails derive their origin from the CMS request URL; the proxy must make generated links point to the public origin, not an internal service address.
4. Do not expose the CMS upstream as an unrestricted proxy target. Use fixed allowlisted paths and upstream origin; never accept an arbitrary upstream URL from user input.
5. Preserve the distinction between public reads and authenticated reads. A frontend server request is not automatically authenticated just because it comes from the frontend.
6. Do not assume CORS is configured. Direct browser requests from one origin to a different CMS origin are not an existing supported authentication contract.
7. Private file paths must not be exposed by an independent static file server that bypasses the CMS middleware.

A BFF still uses CMS APIs for writes. Direct SQL writes would bypass publication rules, revisions, stock handling, cart locks, order access and download limits.

### 2.3 Data flow matrix

| UI feature | Read source | Mutation source | Persistence |
| --- | --- | --- | --- |
| Site title, selected theme, homepage configuration | Server `getSettings()` | Administrator settings API | `options` |
| Articles and pages | Server publishing functions or `/api/content/posts`, `/pages` | Contributor+ content API | `posts`, `revisions`, `term_relationships` |
| Navigation | `getMenuByLocation("primary")` or menu API | Editor+ menu API | `menus`, `menu_items` |
| Public media | Media API and `/uploads/*` | Author+ media API | `media` plus filesystem |
| Catalog | Storefront product API | Editor+ commerce product API | `products`, product taxonomies |
| Basket | Storefront cart API | Same cart API | `cart_items`, cart coupon option |
| Checkout | Basket/settings APIs | Storefront checkout API | `orders`, `order_items`, profile and coupon records |
| Receipt/account | Authorized order/account APIs | Account profile PUT | Orders, users, `customer_profiles` |
| Product reviews | Product detail response | Storefront reviews POST | `reviews`, product rating aggregates |
| Free/purchased eligible downloads | Product `state`, account download list | Download API; file GET consumes grants | `downloads`, `download_tokens`, `download_token_files` |
| Newsletter | Public storefront settings flag | Newsletter subscribe POST | `subscribers` |

## 3. Public website and administration routes

### 3.1 Required public route map

Braces below are placeholders, not literal URL characters. Build URLs using values returned by the CMS and encode path/query components correctly.

| URL | Purpose | Identity/query | Data binding |
| --- | --- | --- | --- |
| `/` | Homepage | `page` for article archive pagination | Site settings; published posts or configured published homepage |
| `/read/{slug}` | Article or authored page | Post/page slug; current precedence is post first, page second | `posts` with `type=post` or `page` |
| `/topics/{slug}` | Article category archive | `terms.slug`, taxonomy `category`; `page` | Resolve term, then published posts by numeric category ID |
| `/labels/{slug}` | Article tag archive | Taxonomy `tag`; `page` | Resolve term, then published posts by numeric tag ID |
| `/creators/{slug}` | Author archive | `users.username`, not display name; `page` | Resolve author, then published posts by numeric author ID |
| `/search?s={text}` | Publishing search page | `s`, `page` | Current page searches published articles; content search API can search articles and pages |
| `/journal/feed` | RSS feed | No theme JSON contract | HTTP RSS; current feed contains up to 20 published articles |
| `/collection` | Catalog | Current browser initializes `search`, `category`, `tag`, `free`; use storefront queries for filtering/sorting/pagination | Published, non-hidden catalog products |
| `/collection/items/{slug}` | Product detail | Product slug; API accepts ID or slug | Product, offer state, reviews, related items |
| `/basket` | Basket | HttpOnly cart cookie | Storefront cart API |
| `/purchase` | Checkout | Cart cookie, optional session | Settings, cart, customer profile, checkout POST |
| `/purchase/receipt/{id}?key={access_token}` | Receipt | Numeric database order ID; bearer access key for guest | Authorized storefront order GET |
| `/account` | Customer account | Session cookie | Storefront account API |
| `/auth/sign-in` | Shared authentication page | Existing page has login/register/first-owner modes | Auth API; current successful submit navigates to `/studio` |
| `/files/access?token={token}` | Emailed download landing page | Bearer download token | Download token metadata and supplied file URLs |
| `/files/ready?token={token}` | Redirect-download landing page | Bearer download token | Token metadata, redirect text/time, file controls |
| `/uploads/{stored_name}` | Public media | Media `stored_name` | Files in `public/uploads` |
| `/downloads/{anything}` | Protected storage path | Never a visitor file link | Current middleware returns 403 |

For a customer-facing sign-in experience, a new template may provide its own login UI using the existing login/register APIs and navigate to `/account` afterward. The existing `/auth/sign-in` page does not implement a verified generic `returnTo` query contract. If adding one, allow only same-origin destinations; do not introduce an open redirect.

No separate public `/pages/{slug}`, product taxonomy archive path, generic `/{slug}` authored page or locale-prefixed `/fa/...` route exists. For product category links use `/collection?category={slug-or-id}`; for product tag links use `/collection?tag={slug-or-id}`.

### 3.2 Reserved administration paths

Keep these accessible to authorized staff and do not create public page slugs that replace them:

- `/studio`
- `/studio/posts`, `/studio/pages`
- `/studio/editor/new`, `/studio/editor/{id}`
- `/studio/categories`, `/studio/tags`, `/studio/comments`, `/studio/media`
- `/studio/users`, `/studio/profile`
- `/studio/menus`, `/studio/themes`, `/studio/settings`, `/studio/tools`
- `/studio/extensions`, `/studio/updates`
- `/studio/commerce`
- `/studio/commerce/products`, `/studio/commerce/products/new`, `/studio/commerce/products/{id}`
- `/studio/commerce/orders`, `/studio/commerce/orders/{id}`
- `/studio/commerce/coupons`, `/studio/commerce/customers`, `/studio/commerce/reviews`
- `/studio/commerce/reports`, `/studio/commerce/settings`
- `/studio/downloads`, `/studio/downloads/settings`, `/studio/downloads/subscribers`, `/studio/downloads/emails`

Management API authorization, not a hidden link or route name, is the security boundary. `/studio/extensions` and `/studio/updates` are not proof of arbitrary plugin installation or automatic update infrastructure.

### 3.3 Removed URL conventions

Do not generate `/rm-login`, `/rm-admin`, `/api/wp/v2`, `/api/wc/v3`, `/api/wc/store`, `/api/downloads`, `/shop`, `/product`, `/cart`, `/checkout`, `/my-account`, `/order-received`, `/download-link`, `/download-ready`, `/category`, `/tag`, `/author`, `/feed` or bare authored `/{slug}` links. These were replaced, not retained as compatibility aliases.

Some internal source names, cookie names, theme slugs and export metadata still use older names. They are not public routing contracts and must not be casually renamed by a theme implementation.

## 4. HTTP, authentication and localization contracts

### 4.1 API transport

- Normal API requests and successful responses are JSON.
- A successful response is the data itself; there is no common `{data: ...}` envelope.
- `ok(data, status)` returns `data` directly, usually status 200; creates commonly use 201.
- Common error response:

```json
{
  "error": "Human-readable message in the selected interface language",
  "message_key": "English source message",
  "code": 403
}
```

- Download workflow errors can add flags and omit `code`. Do not require every failure payload to have all three common fields.
- Test `response.ok` before interpreting success data. Status 401 means authentication is needed; 403 means access/eligibility is denied; 404 means not found; file grant failures use 410; SMTP download-link failure uses 503.
- There are no declared Rayomand Core pagination headers, `title.rendered`, `content.rendered`, `price_html`, OAuth, JWT bearer tokens or Commerce consumer keys.
- Pagination response names differ across subsystems. Do not use one unchecked generic pagination type.
- IDs and prices are JSON numbers. Many flag fields are integer `0`/`1`; normalize with `Boolean(value)` rather than `value === true`.
- Dates are generally ISO-formatted strings; nullable timestamps must remain nullable.
- Do not parse `/api/downloads/file`, RSS or CSV exports as JSON on success.

### 4.2 Exact cookie contract

| Cookie | Meaning | Current lifetime/attributes |
| --- | --- | --- |
| `rm_session` | CMS session token referencing `sessions.token` | 14 days, HttpOnly, SameSite=Lax, Path=/, Secure when `NODE_ENV=production` |
| `wc_cart` | Opaque browser cart key | 30 days, HttpOnly, SameSite=Lax, Path=/; current implementation does not set Secure |
| `rayomand_locale` | Interface language `en` or `fa` | One year, readable by language UI, SameSite=Lax, Path=/, Secure on HTTPS |

Never manufacture or store a user ID in place of either session or cart cookie. The browser should use `credentials: "same-origin"` for same-origin requests. Cookie handling is automatic in browser fetch; a server-side fetch needs explicit, scoped forwarding when authentication is desired.

Login does not currently promise merging an anonymous cart with a user-specific saved cart. Cart identity remains the opaque cookie key.

### 4.3 Authentication endpoints

| Operation | Request | Success | Important behavior |
| --- | --- | --- | --- |
| `POST /api/auth/login` | `{username, password}` | `{user: User}` | Username/email input supported by authentication; sets session cookie; incorrect credentials 401 |
| `GET /api/auth/me` | No body | `{user: User \| null}` | Anonymous response is 200 with `user: null` |
| `POST /api/auth/logout` | No required body | `{loggedOut: true}` | Removes current session and clears its cookie |
| `POST /api/auth/register` | `{username, email, password}` | `{id, username}`, 201 | Requires `users_can_register`; password at least 12 characters; only subscriber/customer role, never trust a submitted role |
| `GET /api/auth/setup` | No body | `{required: boolean}` | Whether zero users exist |
| `POST /api/auth/setup` | `{setup_token, username, email, password, site_title?}` | `{id, username}`, 201 | Bootstrap only; requires private server `SETUP_TOKEN`; first administrator creation protected by transaction/advisory lock |

First-owner setup is not a feature to embed in a public theme's configuration. Do not distribute the setup token. Once users exist, setup cannot create another owner.

There is no documented password-reset, OAuth or social-login endpoint. Do not design a working-looking form that sends requests to nonexistent routes.

### 4.4 Role and access model

Rank order: administrator 5, editor 4, author 3, contributor 2, subscriber/customer 1.

- `canEdit`: contributor and above.
- `canPublish`: author and above.
- `canManage`: editor and above.
- Author/contributor content mutations are constrained to their own posts unless editor+.
- Content list/get APIs can expose non-published records to contributor+ accounts. Public pages must explicitly request/filter `status=publish`, even when a staff member is browsing the public website.
- Site settings, bootstrap/health, users list, download administration and refunds require administrator where specified below.
- Store management generally requires editor+; settings/refunds require administrator.
- The current private-content API policy is rank-based; do not promise a fully featured per-post ACL or signed preview mechanism.

### 4.5 English/Persian requirements

- Locale values are exactly `en` and `fa`; default is `en`.
- Use `LanguageProvider`, `useI18n()` and `getTranslator()` when integrated.
- Root `<html lang>` equals the locale; direction is `ltr` for English and `rtl` for Persian.
- Language switching writes `rayomand_locale`, updates the document and refreshes server-rendered content.
- Local Vazirmatn assets are available through `@fontsource/vazirmatn`.
- API error messages use the locale cookie, not an existing `?lang=fa` API contract.
- Translate UI labels, buttons, statuses as displayed labels, dialogs and validation messages. Keep submitted enums such as `publish`, `on-hold`, `cod`, `product_cat` unchanged.
- Do not change SKU, URLs, email addresses or numeric database IDs to Persian digits in transport. Display formatting may be localized while the underlying value stays unchanged.
- Use CSS logical spacing/inset properties, keyboard-friendly dialogs and LTR treatment for emails/URLs/codes within RTL layouts.

## 5. Entity names, identifiers and TypeScript contracts

### 5.1 Identifier namespace table

| Value | Exact meaning | Never confuse with |
| --- | --- | --- |
| `Post.id` | Numeric ID in `posts`; posts/pages share the table | Product ID, slug or block ID |
| `Post.slug` | Authored URL segment | Numeric ID; not guaranteed globally unique across types |
| `Post.author_id` | `users.id` | Username/display name |
| `Post.featured_media_id` | Nullable `media.id` | Image URL or product file index |
| `Term.id` | Numeric ID in `terms` | Taxonomy name or term slug |
| `Product.id` | Numeric ID in `products` | Post ID; numbers can overlap |
| `Product.parent_id` | Parent product ID for a variation | Parent post ID |
| `variation_id` | ID of a product with type `variation`; `0` means none | Attribute index or selected file index |
| `Product.children[]` | Product IDs for a grouped product | Array of full products or variation IDs by default |
| `Product.images[].id` | Optional media reference | Required identity for every product image |
| `files[]` index / `f` / `file_index` | Zero-based position in the target product's files array | Media ID, product ID or a stable file UUID |
| `Block.id` | Client/editor string identity | A SQL record ID |
| `MenuItem.object_id` | Linked object ID interpreted using `type` | Menu item ID |
| `MenuItem.parent_id` | Parent menu item ID; `0` is root | Parent page or menu ID |
| `Order.id` | Numeric database order ID | Human-facing `Order.number` |
| `Order.number` | Display string from sequence starting at 1001 | URL ID; use returned `id` in receipt links |
| `Order.access_token` | Secret bearer order-access key | Session token, email or order number |
| `CartView.key` | Opaque cart key associated with `wc_cart` | User ID or authorization for an order |
| Download `token` | Secret bearer token, currently 48 hex characters | Order key, user session or file ID |
| `customer_id` / store `user_id` = `0` | Guest sentinel where used | A real user row |
| Comment `user_id = null` | Guest comment | Store guest sentinel necessarily being null |

Use typed keys such as `post:${id}` and `product:${id}` in client caches. For a cart line, use the pair `${product_id}:${variation_id}`. Do not key every entity globally by a number alone.

### 5.2 Publishing types

These describe current JSON, including hydrated fields that may be present. A public DTO should project only public author fields.

```ts
type Role = "administrator" | "editor" | "author" | "contributor" | "subscriber" | "customer";
type PostStatus = "publish" | "draft" | "pending" | "private" | "future" | "trash";
type PostType = "post" | "page";

interface User {
  id: number;
  username: string;
  email: string;
  display_name: string;
  role: Role;
  bio: string;
  created_at: string;
}
interface Block {
  id: string;
  type: string;
  attrs: Record<string, unknown>;
}
interface TaxonomyTerm {
  id: number;
  taxonomy: "category" | "tag" | "product_cat" | "product_tag";
  name: string;
  slug: string;
  description: string;
  parent_id: number;
  count?: number;
}
interface Media {
  id: number;
  filename: string;
  stored_name: string;
  mime: string;
  size: number;
  width: number | null;
  height: number | null;
  alt: string;
  caption: string;
  title: string;
  uploaded_by: number | null;
  created_at: string;
  url?: string;
}
interface Post {
  id: number;
  type: PostType;
  title: string;
  slug: string;
  content: Block[];
  excerpt: string;
  status: PostStatus;
  author_id: number;
  parent_id: number;
  featured_media_id: number | null;
  comment_status: "open" | "closed";
  sticky: number;
  format: string;
  menu_order: number;
  created_at: string;
  updated_at: string;
  published_at: string | null;
  author?: User;
  categories?: TaxonomyTerm[];
  tags?: TaxonomyTerm[];
  featured_media?: Media | null;
  comment_count?: number;
}
interface ContentList {
  items: Post[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
}
interface MenuItem {
  id: number;
  menu_id: number;
  label: string;
  url: string;
  type: "custom" | "page" | "post" | "category";
  object_id: number | null;
  parent_id: number;
  position: number;
}
interface Menu {
  id: number;
  name: string;
  location: string;
  items?: MenuItem[];
}
```

The source `Term` TypeScript type currently lists only `category` and `tag`; commerce also returns `product_cat` and `product_tag`. A frontend adapter may widen the type as above without changing the database taxonomy strings.

Comments contain `id`, `post_id`, nullable `user_id`, `author_name`, `author_email`, `author_url`, `content`, `status`, `parent_id`, `created_at`, and optionally `post_title`. Render only approved comments, and never display guest email addresses publicly.

### 5.3 Product contract

```ts
interface ProductImage {
  id?: number;
  src: string;
  alt?: string;
}
interface ProductFile {
  name: string;
  file: string;
}
interface Product {
  id: number;
  type: "simple" | "variable" | "variation" | "grouped" | "external";
  parent_id: number;
  name: string;
  slug: string;
  description: string;
  short_description: string;
  status: string;
  sku: string;
  regular_price: number | null;
  sale_price: number | null;
  price: number | null;
  stock_status: string;
  stock_quantity: number | null;
  manage_stock: number;
  virtual: number;
  downloadable: number;
  featured: number;
  catalog_visibility: string;
  weight: string;
  images: ProductImage[];
  attributes: Array<Record<string, unknown>>;
  default_attributes: Array<Record<string, unknown>>;
  children: number[];
  files: ProductFile[];
  download_limit: number;
  download_expiry: number;
  tax_status: string;
  rating_count: number;
  average_rating: number;
  total_sales: number;
  created_at: string;
  updated_at: string;
  categories?: Array<{id: number; name: string; slug: string}>;
  tags?: Array<{id: number; name: string; slug: string}>;
  variations?: Product[];
  grouped?: Product[];
  free_download?: boolean;
  on_sale?: boolean;
  download_count?: number;
}
interface ProductList {
  items: Product[];
  total: number;
  pages: number;
}
interface LimitResult {
  active: boolean;
  allowed: boolean;
  remaining: number | null;
  amount: number;
  freq: string;
  scope: string;
  error: string;
}
interface OfferState {
  offered: boolean;
  requireLogin: boolean;
  loginMessage: string;
  capture: boolean;
  limit: LimitResult;
  limitText: string;
  owned: boolean;
  count: number;
  countText: string;
}
interface ProductDetail {
  product: Product;
  state: OfferState;
  reviews: Review[];
  related: Product[];
  settings: Record<string, unknown>;
}
interface Review {
  id: number;
  product_id: number;
  user_id: number;
  author_name: string;
  author_email: string;
  rating: number;
  content: string;
  status: string;
  verified: number;
  created_at: string;
  product_name?: string;
}
```

`files[].file` is storage metadata, not an authorized public download URL. Product descriptions are strings, not publishing block arrays or `{rendered: ...}` objects. Default to escaped text with preserved line breaks; interpreting a description as HTML requires an explicit secure content policy.

### 5.4 Cart, addresses and order contract

```ts
interface Address {
  first_name?: string;
  last_name?: string;
  company?: string;
  address_1?: string;
  address_2?: string;
  city?: string;
  state?: string;
  postcode?: string;
  country?: string;
  email?: string;
  phone?: string;
}
interface CartLine {
  cart_key: string;
  product_id: number;
  variation_id: number;
  quantity: number;
  product: Product;
  unit_price: number;
  line_subtotal: number;
  line_total: number;
}
interface CartTotals {
  subtotal: number;
  discount_total: number;
  shipping_total: number;
  tax_total: number;
  total: number;
  coupon_code: string | null;
  free_shipping: boolean;
  needs_shipping: boolean;
}
interface CartView {
  key: string;
  items: CartLine[];
  totals: CartTotals;
  count: number;
}
type OrderStatus = "pending" | "processing" | "on-hold" | "completed" | "cancelled" | "refunded" | "failed";
interface OrderItem {
  id: number;
  order_id: number;
  product_id: number;
  variation_id: number;
  name: string;
  quantity: number;
  subtotal: number;
  total: number;
  tax: number;
  sku: string;
}
interface OrderNote {
  id: number;
  order_id: number;
  author: string;
  content: string;
  is_customer_note: number;
  created_at: string;
}
interface OrderRefund {
  id: number;
  order_id: number;
  amount: number;
  reason: string;
  created_at: string;
}
interface Order {
  id: number;
  number: string;
  status: OrderStatus;
  customer_id: number;
  billing: Address;
  shipping: Address;
  payment_method: string;
  payment_method_title: string;
  transaction_id: string;
  currency: string;
  discount_total: number;
  shipping_total: number;
  cart_tax: number;
  total: number;
  total_tax: number;
  customer_note: string;
  refunded_total: number;
  created_at: string;
  updated_at: string;
  paid_at: string | null;
  access_token: string;
  items: OrderItem[];
  notes: OrderNote[];
  refunds: OrderRefund[];
  customer: {id: number; username: string; email: string; display_name: string} | null;
}
```

These are wire-model types, not permission to publish all fields. Public receipt/account views must avoid rendering internal notes, tokens and unrelated customer information. Server-side DTO filtering is required to remove those fields from public network responses where appropriate.

## 6. Publishing, pages, archives, menus and media

### 6.1 Article and page listing

```text
GET /api/content/posts?status=publish&page=1&per_page=10
GET /api/content/pages?status=publish&page=1&per_page=10
GET /api/content/posts?status=publish&category={term_id}&page=1
GET /api/content/posts?status=publish&tag={term_id}
GET /api/content/posts?status=publish&author={user_id}
GET /api/content/posts?status=publish&search={text}
```

Accepted query names are `status`, `page`, `per_page`, `search`, `category`, `tag`, `author`. Categories, tags and authors are numeric IDs here, not slugs. The collection path chooses the type; `?type=page` is not the publishing type-selection contract.

Anonymous/subscriber/customer list requests are forced to `publish`. Contributor+ list requests default to `any` unless `status` is explicitly supplied. Therefore the public frontend always supplies `status=publish` and verifies that rendered records are published.

Ordering is sticky first, then `published_at` descending, then numeric ID descending. Content API does not implement generic `orderby`/`order`, or a supported slug filter. Its `per_page` is not capped like storefront pagination; use positive, reasonable page sizes.

### 6.2 Detail and slug resolution

- `GET /api/content/posts/{id}` and `/pages/{id}` accept numeric post-table IDs.
- These routes share the underlying detail handler; do not assume the route alone validates `Post.type`.
- **There is no implemented `GET /api/content/posts?slug=...` lookup contract.** An ignored query must not be interpreted as a successful slug lookup.
- Integrated Next.js themes should use `getPostBySlug(slug, "post")`, then `getPostBySlug(slug, "page")`, and enforce publication before rendering or returning metadata.
- Separate headless frontends need a public slug resolver adapter, described in section 16. A paginated list scan is only a bounded workaround, not an efficient complete resolver.
- Numeric IDs are write/reference identities; slugs are navigation identities.
- Existing slug generation is not a universal uniqueness guarantee. Post and page slugs can collide; products have an independent slug namespace. Current `/read` precedence is post first.
- A newly authored title/slug may change the canonical URL. Do not assume automatic redirects from an old slug.

### 6.3 Homepage and publishing settings

Current server `getSettings()` supplies:

```text
site_title, tagline, admin_email, theme, permalink_structure,
posts_per_page, default_comment_status, comment_moderation,
date_format, time_format, timezone,
show_on_front, page_on_front, page_for_posts,
blog_public, users_can_register, default_role, site_icon,
default_category, default_post_format, privacy_page_id
```

Defaults include `site_title="Rayomand CMS"`, `posts_per_page=10`, `show_on_front="posts"`, `theme="twentytwentyfive"`, timezone `UTC`, and permalink structure `/read/{slug}`. Stored option values are strings; `getSettings` converts relevant flags/numbers. Page IDs in options can be empty strings: convert and validate before use.

- `show_on_front="posts"`: show the published article archive.
- `show_on_front="page"` with `page_on_front`: fetch that numeric post-table ID, verify that it is the intended published page, then render blocks.
- `page_for_posts` is stored but does not currently establish a special blog-index URL. A theme can add that behavior only as an explicitly implemented routing feature.
- `permalink_structure` is not a current arbitrary routing engine. The administration displays `/read/{slug}`; the API does not expose it as a writable path convention.
- **`GET /api/content/settings` requires administrator.** Do not call it from a public browser to bootstrap the site or expose an administrator session to make it work.
- Integrated layouts read settings on the server and pass a safe allowlist to client components. A separate frontend needs a safe public-settings adapter.
- Do not publish `admin_email` or every arbitrary option as theme bootstrap data.

### 6.4 Taxonomies and author archives

- `GET /api/content/categories` returns an array of article category terms.
- `GET /api/content/tags` returns an array of article tag terms.
- Resolve a slug by finding its exact term in the appropriate taxonomy, then query posts by term ID.
- Individual category/tag routes currently have PATCH/DELETE only, not GET.
- Product categories/tags are returned by `/api/storefront/settings`, not by the article category/tag API.
- Integrated author pages resolve `users.username` using the server data layer. There is no anonymous users-list endpoint or dedicated public author resolver.
- A separate frontend can use hydrated article author fields for known authors, but a complete author-by-username route needs an adapter.
- Keep content taxonomy links under `/topics` or `/labels`; store taxonomy links filter `/collection`.

### 6.5 Search behavior

`GET /api/content/search?search={text}` also accepts `s`. It returns:

```ts
{ items: Array<{id: number; title: string; url: string; type: "post" | "page"}>; total: number }
```

It searches up to 20 published articles and 20 published pages. `total` is the returned result count, not an unlimited global search count. Blank text returns `{items: [], total: 0}`. It does not search products; use storefront product search for products.

The existing public `/search?s=...&page=...` page searches published articles only and supports archive pagination. A new template may deliberately combine publishing and product results, but must call the separate real data sources and label the types accurately.

Current SQL search uses `LIKE`; do not promise case-insensitive full-text search, relevance scores or language-aware stemming.

### 6.6 Menus

- `GET /api/content/menus` returns hydrated `Menu[]`.
- Select the menu with `location === "primary"` for the current header convention.
- Alternatively use server `getMenuByLocation("primary")`.
- Sort items using `position`, not a guessed `sort_order` field.
- Follow the stored `url` after validating its protocol and destination policy. `object_id` is a reference, not necessarily the visitor URL.
- Render root items with `parent_id=0`; nested menus use menu item IDs and must handle orphan references without crashing.
- Current saving deletes/reinserts menu items, changing item IDs. Do not persist those IDs as permanent frontend navigation identities or assume nested parent references survive every save correctly.
- Footer menus or other locations can be conventions selected by a new theme, but are not automatically registered slots in a Rayomand Core theme engine.
- Missing menus should produce a simple valid header or an empty navigation state, not fake database entries.

### 6.7 Media

- `GET /api/content/media` returns `Media[]`; `GET /api/content/media/{id}` returns one media record.
- Use `media.url` when available; otherwise the current storage convention is `/uploads/{stored_name}`.
- `filename` is the original upload name; `stored_name` is the storage identity. Do not use the original name as the storage path.
- Featured media is joined from `featured_media_id`. It can be null; image dimensions may also be null.
- Public media upload uses author+ `POST /api/content/media` with `multipart/form-data` field **`file`**, maximum 20 MiB. Do not manually set a multipart boundary.
- Accepted MIME types: PNG, JPEG, GIF, WebP, PDF, plain text, MP3, MP4 and ZIP using their corresponding MIME strings.
- Editing alt/caption/title uses PATCH; removing media uses DELETE and ownership rules.
- A public theme ordinarily does not need media upload privileges.
- Files under `/uploads` are public. Never put paid/protected downloadable goods there and then rely on a hidden URL for protection.

### 6.8 Comments

Public list:

```text
GET /api/content/comments?post={post_id}&page=1&per_page=20
```

Response is `{items: Comment[], total: number}`. Anonymous users get approved comments; editor+ can obtain other statuses. Public templates should explicitly filter `approved` before rendering and avoid forwarding editor moderation responses as public data.

Public create request:

```ts
{
  post: number;
  content: string;
  author_name?: string;
  author_email?: string;
  author_url?: string;
  parent?: number;
}
```

`post_id` and `parent_id` are also accepted. Session user identity overrides guest author fields. Guest name/email and nonempty content are required. The post must exist and have comments open. Success is `{id, status}`, 201. If moderation is enabled, ordinary submissions become pending; show a moderation acknowledgement, not an immediately approved comment.

**Current gaps:** individual comment GET is public without status filtering; comment creation does not independently enforce a published parent post. These require backend hardening for a safe public release. Hiding pending comments in the UI does not fix exposure through an API.

## 7. Block content rendering

### 7.1 Storage and format

`posts.content` and revision content are JSON serialized into SQL TEXT. Publishing APIs return parsed `Block[]`:

```json
[
  {"id":"block-introduction","type":"heading","attrs":{"text":"Introduction","level":2}},
  {"id":"block-copy","type":"paragraph","attrs":{"text":"The text written by the editor."}},
  {"id":"block-image","type":"image","attrs":{"url":"/uploads/image-file.png","alt":"Descriptive alternative text","caption":"Editor caption"}}
]
```

This is an illustrative schema example, not existing seeded content or an actual file guaranteed to exist.

Preserve block order and string IDs. Do not parse Gutenberg HTML comments, treat block IDs as SQL IDs or expect `core/paragraph` names. Current block types are the simple strings below.

### 7.2 Supported block matrix

| `type` | Current `attrs` | Rendering requirement |
| --- | --- | --- |
| `paragraph` | `text`, optional `align` | Escaped paragraph text; align center/right when requested |
| `heading` | `text`, `level`, optional `align` | Semantic h1–h6; clamp level; escaped text |
| `image` | `url`, `alt`, `caption` | Responsive image/figure; alt/caption support |
| `gallery` | `images: [{url, alt}]` | Responsive gallery, safe image URLs, accessible images |
| `list` | `ordered`, `items: string[]` | ol/ul with escaped li text |
| `quote` | `text`, `citation` | Blockquote and citation |
| `pullquote` | `text` | Styled blockquote, not unsafe HTML |
| `code` | `text` | pre/code with escaped content |
| `verse` | `text` | Preserve newlines and whitespace |
| `separator` | No required attrs | Semantic hr |
| `spacer` | `height`, default 40 | Bounded responsive spacing |
| `html` | `html` | Parser-based sanitization or escaped fallback; never raw trusted-by-default insertion |
| `buttons` | `buttons: [{text, url}]` | Accessible links styled as buttons; safe destination policy |
| `cover` | `url`, `text` | Image cover with readable overlay text and responsive sizing |
| `embed` | `url` | Current renderer is a safe external link, not an arbitrary iframe/video execution engine |

These 15 type names are defined by `lib/block-defs.ts`. Preserve their exact names and attribute structures.

### 7.3 Security and graceful handling

- Plain text rendering must use React escaping; do not inject paragraph/heading/quote text through `dangerouslySetInnerHTML`.
- Validate link/image URLs at the rendering boundary. Reject unsafe schemes such as `javascript:`; configure accepted media origins if remote images are permitted.
- The existing `sanitizeHtml` function is regex-based. It is **not a sufficient production security guarantee** for adversarial HTML. Use a vetted parser-based sanitizer with a strict tag/attribute/URL allowlist before enabling HTML blocks publicly.
- Until that sanitizer is implemented, display HTML block source as escaped text or another explicit safe fallback. Do not quietly drop all article blocks because one block is unsupported.
- Unknown types should not crash the page. Current renderer returns nothing for them; a new theme may provide an accessible unsupported-block fallback and an internal diagnostic, without exposing private payloads.
- Rich inline marks, nested block trees, reusable blocks and arbitrary embeds are not part of the current schema.
- Use `blocksToPlainText` for excerpts/search descriptions where appropriate, not `JSON.stringify(content)` as visible copy.
- Product descriptions and comments are separate string formats and should not be run through a publishing block parser.

## 8. Catalog, products and variations

### 8.1 Public settings

`GET /api/storefront/settings` returns an object containing:

```text
currency, currency_pos, thousand_sep, decimal_sep, num_decimals,
enable_coupons, calc_taxes, tax_rate,
shipping_flat_cost, shipping_free_min, shipping_pickup,
enable_guest_checkout, enable_reviews, review_rating_required, shop_columns,
disable_ecommerce, enable_downloads,
payments: [{id, title, description}],
categories: product_cat terms[], tags: product_tag terms[],
downloads: {public download display/capture settings}
```

Exact nested `downloads` keys:

```text
button_text, link_text, badge_text, hide_badge, download_counts,
include_archive_items, hide_readmore, owned_include,
show_filename, file_list_text, display_single, display_multi, checkbox_error_text,
button_class, button_css, link_class, link_css,
capture_email_title, capture_email_title_bg, capture_email_title_colour,
capture_email_placeholder, capture_email_button, capture_email_body,
capture_email_subscribe, newsletter_enable,
docviewer_enable, docviewer_link_text
```

This is the visitor-safe store settings endpoint, not the general publishing site settings endpoint. It does not expose all eligibility/limit rules or the registration setting.

Treat stored display copy as content. Restrict CSS/class customization to a safe presentation policy; never evaluate it as JavaScript or use it as unsanitized HTML.

### 8.2 Catalog queries and response

```text
GET /api/storefront/products?search={text}&category={slug-or-id}&page=1&per_page=12
GET /api/storefront/products?tag={slug-or-id}&featured=1
GET /api/storefront/products?on_sale=1
GET /api/storefront/products?free=1
GET /api/storefront/products?orderby=price&order=asc
```

Accepted: `search`, `category`, `tag`, `featured`, `on_sale`, `free`, `orderby`, `order`, `page`, `per_page`.

- Default page size 12; maximum page size 100; page at least 1.
- Sorting keys: `date`, `title`, `price`, `popularity`, `rating`, `menu_order`, `modified`. Current `menu_order` sorting maps to ID, not a dedicated product ordering column.
- Default `orderby=date`, `order=desc`.
- Response: `{items, total, pages}`; there is no publishing-style `totalPages` property.
- Catalog excludes variation rows, unpublished products and `catalog_visibility="hidden"`.
- Current visibility handling is not a complete Commerce catalog/search-visibility matrix.
- The `free` filter/raw `free_download` flag is only a candidate signal; complete download eligibility is in `OfferState` and the server download operation.

### 8.3 Product detail

```text
GET /api/storefront/products/{id-or-slug}
```

The folder name is `[id]`, but the handler accepts a numeric ID or a nonnumeric slug. Numeric path strings are treated as IDs; avoid numeric-only product slugs or implement an explicit resolver if required.

Success:

```ts
{
  product: Product;
  state: OfferState;
  reviews: Review[];
  related: Product[];
  settings: {
    button_text: string;
    badge_text: string;
    hide_badge: number;
    download_counts: number;
    show_filename: number;
    file_list_text: string;
    display_single: string;
    display_multi: string;
    docviewer_enable: number;
    docviewer_link_text: string;
    download_history_enable: number;
  };
}
```

Current detail handler rejects unpublished products but does not reject hidden products. Decide the release visibility policy on the server; a client-side hidden filter cannot protect a directly requested detail endpoint. Nested variations/grouped hydration also needs publication filtering for a strict public response.

`state` is personalized by session, ownership and limits. Do not globally cache a product detail response and serve one customer's ownership or remaining allowance to another visitor.

### 8.4 Product-type presentation

| Type | Required UI behavior |
| --- | --- |
| `simple` | Display price/stock, quantity, buy or eligible download action |
| `variable` | Select an actual published variation product; use parent `product_id` plus selected `variation_id` |
| `variation` | Normally selected through parent detail, not listed as a catalog card |
| `grouped` | Display hydrated `grouped` child products and add individual supported children; do not add the parent as a cart line |
| `external` | Do not send directly to basket. The current schema does not establish a complete external affiliate URL/button contract; require explicit backend fields/integration before showing a working external purchase link |

Current attribute structures written by the product editor:

```ts
// Parent product
attributes: [{name: string, slug: string, options: string[], variation: boolean}]
// Variation product
attributes: [{name: string, option: string}]
```

Variation attributes are values, not taxonomy IDs. `default_attributes` is stored JSON but is not a guaranteed comprehensive selection/matching engine. A template must deliberately resolve a valid selectable variation and keep price, SKU, stock and files aligned with it.

For downloads of a selected variation, submit the parent `product_id` and the selected child `variation_id`; selected file indexes refer to the variation's files. The server validates the parent/child relationship and eligibility. Parent detail state alone must not be treated as final authorization for every variation.

### 8.5 Prices and stock

- Numeric amounts are in the configured currency's major units, not cents.
- Use `currency`, `currency_pos`, separators and `num_decimals` for display.
- Position values: `left`, `right`, `left_space`, `right_space`.
- `sale_price=null` is no sale; zero is a real numeric amount and must not disappear because of a truthiness check.
- `on_sale` is computed when sale and regular prices exist and sale is lower.
- Stock can be unmanaged or have null quantity. A null quantity is not automatically zero.
- Never allow an optimistic displayed quantity to override server rejection for stock or publication.
- Catalog cards may show availability, but checkout must always revalidate live state.
- Database amounts use NUMERIC(18,4); existing business calculations round in their own functions. Avoid recalculating payable totals in the UI and sending them as authoritative amounts.

## 9. Basket, coupons and checkout

### 9.1 Basket operations

| Method and URL | Body/query | Result |
| --- | --- | --- |
| `GET /api/storefront/cart` | Optional `shipping_method=pickup` | `CartView` |
| `POST /api/storefront/cart` | `{product_id, quantity?, variation_id?}` | Updated `CartView` |
| `PATCH /api/storefront/cart` | `{product_id, variation_id, quantity}` | Updated `CartView`; nonpositive quantity removes line |
| `DELETE /api/storefront/cart` | `?product_id={id}&variation_id={id-or-0}` | Updated `CartView` |
| `DELETE /api/storefront/cart?clear=1` | No body | Empty `CartView` |
| `POST /api/storefront/cart/coupon` | `{code}` | Updated `CartView` |
| `DELETE /api/storefront/cart/coupon` | No body | Updated `CartView` without coupon |

Do not send `cart_key` or user ID to choose someone else's cart. Use the cookie supplied by the server.

Server behavior includes publication, variation-parent, type, quantity and stock validation. Variables require selection; grouped/external parents cannot be added directly. Cart transactions use advisory locks. Apply the returned full CartView after each mutation rather than fabricating totals locally.

`count` is the sum of quantities, not just `items.length`. Cart UI keys use both product and variation IDs.

### 9.2 Shipping, tax and coupons

- `needs_shipping` is true when at least one line is neither virtual nor downloadable.
- Enabled pickup uses `shipping_method="pickup"` and zero shipping cost.
- Other ordinary shipping uses configured flat cost unless a free-shipping coupon/threshold applies. Do not invent shipping method IDs such as `flat_rate:1`.
- Server cart/checkout totals are authoritative: subtotal, discount, shipping, tax and payable total.
- Coupon types include `percent`, `fixed_cart`, `fixed_product` with server eligibility/limits/expiry.
- A single cart coupon is currently stored under an option key tied to the cart; no general multi-coupon stack is promised.
- Hide unavailable coupon/purchase controls using public settings, but let the server enforce the actual operation.
- There is no established address-dependent carrier quotation, tax jurisdiction engine or stock reservation service.

### 9.3 Checkout request

```ts
{
  billing: {
    first_name: string;
    last_name: string;
    email: string;
    address_1: string;
    city: string;
    country: string;
    company?: string;
    address_2?: string;
    state?: string;
    postcode?: string;
    phone?: string;
  };
  shipping?: Address;
  ship_to_different?: boolean;
  payment_method?: "cod" | "bacs" | "cheque";
  customer_note?: string;
  shipping_method?: string;
}
```

Send to `POST /api/storefront/checkout`. Current billing validation requires first name, last name, email, address line 1, city and country, including for a digital basket. Do not assume the backend accepts an email-only digital checkout.

The server obtains customer ID from the session and items/totals from the current cart. Do **not** send or trust `customer_id`, `items`, `price`, `total`, `status`, `paid_at` or `transaction_id` as frontend-controlled order authorization.

Behavior:

1. Reject purchases when `disable_ecommerce` is enabled.
2. Reject unauthenticated checkout when guest checkout is disabled.
3. Validate billing and nonempty cart.
4. Lock/recheck cart, products, stock, prices and coupon eligibility; create a real order transactionally.
5. Attempt a real confirmation email.
6. Return `{order: Order, email_warning?: string}`, status 201.

If `email_warning` is present, the order **has been created**. Explain that mail failed; do not retry checkout to compensate for a mail failure.

### 9.4 Payment reality

Only configured manual methods are returned by `settings.payments`:

- `cod`: cash on delivery.
- `bacs`: direct bank transfer, requires instructions.
- `cheque`: check payments, requires instructions.

All payment methods default to disabled. No enabled method is a legitimate empty/configuration state.

Positive-value manual-payment orders remain `on-hold` and unpaid until store confirmation. Zero-total orders can complete using the internal free-payment path. Do not call a receipt screen “Payment successful” merely because an order was created. There is no live online card gateway, transaction verification callback or automatic transfer-of-funds refund.

Paid status transitions (`processing`/`completed`) update stock/sales using backend rules. A template never directly sets these states or adjusts stock. Manual refunds record accounting information; funds must be transferred through the actual payment channel.

### 9.5 Checkout UX safety

- Disable submit while a checkout request is in progress.
- Preserve form input on validation/service failure.
- Refresh basket when price/stock/coupon state has changed.
- Do not automatically retry POST checkout after an uncertain network outcome; no general idempotency-key API is implemented.
- Authorized customers can check account orders; a guest network failure may require explicit support/recovery rather than guessing an order key.
- Navigate using `order.id` and the returned `order.access_token` for guest access. Existing receipt UI also supports an `email_not_sent=1` presentation query when mail failed; that query is not authorization.
- Exclude access keys from analytics, referrers and shared screenshots; set a restrictive Referrer-Policy on sensitive pages.

## 10. Receipts, account and reviews

### 10.1 Authorized order retrieval

```text
GET /api/storefront/orders
GET /api/storefront/orders/{id}?key={access_token}
```

List requires a signed-in user and returns `{items: Order[]}` for that customer, currently up to 100 orders. No public all-orders list exists.

Detail allows:

- the signed-in order owner (`order.customer_id === currentUser.id`), or
- an exact valid bearer `key`, or
- an administrator.

An email address is not authorization. Unknown ID returns 404; unauthorized access returns 403. Use database `order.id` in routes; numeric strings are interpreted as database IDs, not display order numbers.

Current hydrated orders include notes, including internal notes. A public receipt should display only appropriate customer-facing fields, and the backend must filter internal notes from customer responses for actual privacy. Hiding them in HTML does not remove them from the JSON response.

### 10.2 Customer account

`GET /api/storefront/account` requires a session and returns:

```ts
{
  user: {id: number; username: string; email: string; display_name: string};
  profile: {billing: Address; shipping: Address};
  orders: Order[];
  freeDownloads: Array<{product: Product; state: OfferState}>;
  history: Array<Record<string, unknown>>;
  historyEnabled: boolean;
  historyTitle: string;
  historyMessage: string;
}
```

Download history returns up to 200 `downloads` rows with `product_name` and `product_slug` added. In this endpoint, `files` remains the database's serialized JSON string, unlike the parsed arrays returned in the administrator download log. Parse it explicitly if displaying filenames. Create a fresh token through the download workflow rather than treating history as a reusable file URL.

`PUT /api/storefront/account` accepts `{billing?, shipping?}` and returns the saved `{billing, shipping}`. Missing address groups preserve the current group. Updating billing email does not change the user's login email.

For the user's email/display name/bio/password, use owner-authorized `PATCH /api/content/users/{user.id}` with documented fields. Do not submit a role from a public account form.

When downloads or history are disabled, honor server flags/empty arrays. A purchased item becomes download-eligible only under current ownership/offer rules; not every historical order gives entitlement regardless of status.

### 10.3 Product reviews

Read reviews from `GET /api/storefront/products/{id-or-slug}`. There is no storefront reviews GET list endpoint.

Create via `POST /api/storefront/reviews`:

```ts
{
  product_id: number;
  author_name?: string;
  author_email?: string;
  rating?: number;
  content: string;
}
```

- Review feature must be enabled; rating can be required by settings.
- Session name/email override guest fields.
- Guest name/email and nonempty review text are required.
- Current rating is rounded and clamped to 1–5; invalid/omitted values can fall back to 5 if not otherwise required.
- Current new reviews are approved immediately.
- `verified=1` is based on a signed-in customer's paid-status order containing that product; guest claims do not establish verification.
- Do not let the frontend set `verified`, review status or user ID.
- Display author name, rating, content, date and verified badge where applicable; never display reviewer email.
- Current POST checks product existence, not full publication eligibility. Backend publication validation is a release-hardening requirement.

## 11. Digital downloads and newsletter

### 11.1 Eligibility is a workflow, not a static link

Use `ProductDetail.state` and account offer states to explain the available action. A positive `free_download` flag or a zero price alone is not authorization.

`OfferState` includes:

- `offered`: server considers this product eligible under master settings, inclusion/exclusion and ownership rules.
- `requireLogin`, `loginMessage`: authentication requirement.
- `capture`: email capture requirement.
- `limit`: active allowance, remaining count, scope/frequency/error.
- `limitText`: configured human-readable remaining allowance.
- `owned`: ownership inferred from paid-status orders.
- `count`, `countText`: recorded download-request count.

Rules include product/category/tag inclusions and exclusions, on-sale inclusion policy, purchased-item inclusion, per-product overrides and login/capture/limit settings. Limits use product, role or global precedence and UTC period boundaries for day/week/month/year/lifetime.

Guest limits identified by email are not strong verified identity; changing an email does not constitute a secure identity-proof system. Do not market that mechanism as fraud-proof enforcement.

### 11.2 Download initiation

`POST /api/downloads/download`:

```ts
{
  product_id: number;
  variation_id?: number;
  email?: string;
  name?: string;
  files?: number[];
  view?: boolean;
}
```

`files` contains **zero-based array indexes** in the target product/variation `files` array. Missing or empty `files` currently selects all files. If your UI requires at least one checkbox selection, enforce that before submitting an empty array; otherwise the backend will treat it as all files. Nonempty selections are validated and deduplicated.

The parent/variation relation is validated. Eligibility, login, capture, limits and master download settings are rechecked on the server. Do not send a new token created in browser code.

Important nonstandard error states:

| Status | Payload flags | Required UX |
| --- | --- | --- |
| 403 | `require_login: true`, `error`, `message_key` | Offer sign-in without losing selected product/variation/files |
| 400 | `capture_required: true`, `error`, `message_key` | Show email/capture form and resubmit explicitly |
| 403 | `limit_reached: true`, `error`, `message_key`, optional `redirect_url` | Show limit explanation; redirect only to verified same-origin destination |
| 503 | Common failure message | Real SMTP email-link failure; do not say email was sent |
| 400/404 | Common failure message | Unavailable product, files, settings or invalid selection |

### 11.3 Three success modes

**Direct mode (`download_type_option=0`):**

```ts
{
  type: "direct";
  files: Array<{name: string; url: string}>;
  zip: {name: string; url: string} | null;
}
```

URLs point to `/api/downloads/file?token=...&f=...`. Use the returned URL rather than building it from `ProductFile.file`. Multiple selected files may have a force-ZIP response. Do not both download the ZIP and automatically consume all individual links.

**Email-link mode (`download_type_option=1`):**

```ts
{type: "email"; message: string}
```

The real SMTP server must accept the message. Its link is `/files/access?token=...`. SMTP acceptance is not proof of eventual inbox delivery. On send failure the newly created token is removed and the request fails.

**Redirect mode (`download_type_option=2`):**

```ts
{type: "redirect"; url: string}
```

Default target is `/files/ready?token=...`; the configured page must be same-origin. A separately hosted frontend must serve any configured landing page and preserve its query parameters.

Download tracking is recorded when the workflow issues a direct/link/redirect download request, not necessarily when every byte finishes downloading. Counts are not a verified transfer-completion metric.

### 11.4 Token landing page contract

`GET /api/downloads/token?token={token}`:

Valid response:

```ts
{
  ok: true;
  product: {id: number; name: string; slug: string; images: ProductImage[]; files: ProductFile[]};
  expires_at: string;
  redirect_text: string;
  redirect_time: number;
  file_urls: string[];
  zip_url: string | null;
}
```

Invalid/missing/used/expired token normally returns status **200**:

```ts
{ok: false; reason: "missing" | "used" | "expired"; message: string}
```

Master downloads disabled returns 403; a missing referenced product can return 404. Inspect both HTTP status and the `ok` discriminant.

The returned `product.files` is the remaining selected subset. Its array position is **not** necessarily the original `f` index. Pair it with the returned `file_urls` in order; never regenerate `f` from the subset index.

Current token metadata handler does not fully enforce the same publication check as binary file delivery. File GET still checks product publication. Harden the metadata response before a release if unpublished details must remain confidential.

### 11.5 Binary file delivery and consumption

Supported URLs:

```text
GET /api/downloads/file?token={token}&f={original-file-index}
GET /api/downloads/file?token={token}&zip=1
GET /api/downloads/file?token={token}&zip=1&files={comma-separated-original-indexes}
GET /api/downloads/file?token={token}&f={index}&view=1
```

- The file handler restricts local resolved paths to descendants of `public` using realpath checks.
- Normal download consumes the selected file grant atomically. Once all grants are consumed, the token is used. Replaying a consumed/expired grant fails with 410.
- ZIP consumes its selected grants; do not assume each individual URL remains valid afterward.
- Token missing: 403. Invalid/expired/consumed: 410. Product/file missing: 404. Master downloads disabled: 403.
- `view=1` does not consume a grant; PDFs can be inline, other types are attachments. This is a specific current policy, not a universally enforced one-view limit.
- Responses include Content-Type, Content-Disposition, Content-Length, `Cache-Control: private, no-store`, and `X-Content-Type-Options: nosniff`.
- Success is binary bytes. Preserve filename/content type in a download or same-origin navigation.
- Never prefetch binary token URLs with Next.js link prefetching, a crawler, a preview fetch, a service worker or analytics. A GET can spend the grant.
- Do not fetch the file once to test it and then navigate to it again; the second request may be a replay.
- Token links are bearer access. Use noindex, restrictive referrers and no third-party analytics on landing/receipt pages.

### 11.6 Storage and file identity limitations

- Current handler reads local files under `public`; it does not fetch external HTTPS `files[].file` values.
- The intended protected storage is `public/downloads`, with `/downloads/*` denied by middleware.
- Other public folders do not become protected merely because a product references a file there. Keep protected goods in the denied namespace, and ensure proxy/static configuration preserves that denial.
- A product file has no stable UUID. Reordering/replacing its files after issuing a token can change what a saved index refers to. A stable immutable file-identity migration would require backend work.
- Current ZIP generation is buffered in memory, not a streaming archive service. Large-file/range/resume support needs explicit implementation.
- `Product.download_limit` and `download_expiry` columns exist, but do not assume full Commerce entitlement enforcement for them. Verified current authorization comes from offer rules, the configured limits and token file grants.
- Existing ZIP assembly can skip unreadable members while consuming the requested selection if at least one file is available. Do not claim guaranteed all-or-nothing complete ZIP delivery without a backend change.

### 11.7 Newsletter and email capture

`POST /api/downloads/subscribe` accepts `{email, name?}` and returns `{ok: true, already: boolean}`. It requires newsletter signup enabled. A repeated subscribed email yields `already=true`.

Download capture may subscribe an email according to administrator capture settings. The current download request does not establish a separate per-request newsletter-consent boolean contract. Do not invent a checkbox payload that the server ignores. Explicit consent and unsubscribe/self-service verification flows, if required, need backend work and an appropriate privacy policy.

Subscriber lists, mail logs, download logs and full download settings are administrator-only. Never use them as public frontend data.

## 12. Complete implemented API route reference

This section inventories all current API route paths. `{id}` means the dynamic numeric ID unless the row says otherwise. Access labels describe existing guards, not a general endorsement of every exposed field. Public does not mean safe to republish every response field; see section 16.

### 12.1 Authentication (5 route paths)

| Path | Methods | Access | Contract |
| --- | --- | --- | --- |
| `/api/auth/login` | POST | Public | `{username,password}` → `{user}`; sets session |
| `/api/auth/logout` | POST | Current browser/session | No required body → `{loggedOut:true}` |
| `/api/auth/me` | GET | Public/session-aware | `{user: User|null}` |
| `/api/auth/register` | POST | Public when registration enabled | `{username,email,password}` → `{id,username}`, 201 |
| `/api/auth/setup` | GET, POST | GET public; POST private setup token + zero users | GET `{required}`; POST bootstrap body → `{id,username}`, 201 |

### 12.2 Publishing/content (22 route paths)

| Path | Methods | Access | Query/body and success |
| --- | --- | --- | --- |
| `/api/content/posts` | GET, POST | GET public/session-aware; POST contributor+ | GET query in section 6 → `ContentList`; POST content-write body → `Post`, 201 |
| `/api/content/posts/{id}` | GET, PATCH, DELETE | Published GET public; nonpublished GET contributor+; write own/editor+ | GET/PATCH `Post`; DELETE trash/restore `Post`, or force `{deleted:true,id}` |
| `/api/content/pages` | GET, POST | Same as posts | Same contract with created/listed type `page` |
| `/api/content/pages/{id}` | GET, PATCH, DELETE | Same underlying detail/write rules as posts | Numeric ID from shared posts table; check returned type |
| `/api/content/categories` | GET, POST | GET public; POST editor+ | GET `Term[]`; POST `{name,slug?,description?,parent_id?}` → `Term`, 201 |
| `/api/content/categories/{id}` | PATCH, DELETE | Editor+ | PATCH term fields → `Term`; DELETE `{deleted:true,id}`; no GET |
| `/api/content/tags` | GET, POST | GET public; POST editor+ | Same term contract, taxonomy `tag` |
| `/api/content/tags/{id}` | PATCH, DELETE | Editor+ | Same term mutation contract; no GET |
| `/api/content/comments` | GET, POST | GET public/session-aware; POST public/session-aware | GET `post,status,page,per_page` → `{items,total}`; POST section 6 → `{id,status}`, 201 |
| `/api/content/comments/{id}` | GET, PATCH, DELETE | GET currently public/unfiltered; writes editor+ | GET `Comment`; PATCH `{status}` → `Comment`; DELETE `{deleted:true,id}` |
| `/api/content/media` | GET, POST | GET public; POST author+ | GET `Media[]`; multipart `file` POST → `Media`, 201 |
| `/api/content/media/{id}` | GET, PATCH, DELETE | GET public; PATCH author+; DELETE owner or editor+ with author-level guard | PATCH `{alt?,caption?,title?}` → `Media`; DELETE `{deleted:true,id}` |
| `/api/content/menus` | GET, POST | GET public; POST editor+ | GET `Menu[]`; POST `{name,location?}` → `Menu`, 201 |
| `/api/content/menus/{id}` | GET, PUT, DELETE | GET public; writes editor+ | PUT `{name?,location?,items?}` → `Menu`; DELETE `{deleted:true,id}` |
| `/api/content/users` | GET, POST | Administrator | GET `User[]`; POST `{username,email,password,display_name?,role?,bio?}` → `{id}`, 201 |
| `/api/content/users/{id}` | GET, PATCH, DELETE | GET/PATCH owner or administrator; DELETE administrator except self | GET `User`; PATCH `{email?,display_name?,bio?,password?,role?}` → `User`, role admin-only; DELETE `{deleted:true,id}` |
| `/api/content/settings` | GET, POST | Administrator | GET site settings; POST supported setting fields → updated settings; permalink pattern not writable |
| `/api/content/themes` | GET, POST | GET public; POST administrator | GET `(ThemeDef & {active:boolean})[]`; POST `{activate:slug}` → `{activated:slug}` |
| `/api/content/search` | GET | Public | `search` or `s` → `{items:[{id,title,url,type}],total}`; bounded results |
| `/api/content/health` | GET | Administrator | `{database:{engine,connected,name,version},storage,smtp,redis}`; not public bootstrap |
| `/api/content/tools/export` | GET | Administrator | JSON download of content/options/menu data; not a complete database/storage backup |
| `/api/content/tools/import` | POST | Administrator | Export-style JSON with `posts` array → `{importedPosts,importedTerms,importedComments}` |

**Content-write body:** `title`, `slug`, `content: Block[]`, `excerpt`, `status`, `author_id`, `parent_id`, `featured_media_id`, `comment_status`, `sticky`, `format`, `menu_order`, `category_ids: number[]`, `tag_ids: number[]`. The server chooses `type` from the collection path. Contributor publication requests are coerced to pending if their role cannot publish. Editor+ can choose author ID; lower roles cannot assign arbitrary ownership.

DELETE post/page defaults to trash. `?action=restore` restores to draft. `?force=1` requires editor+ and permanently deletes. This is not a storefront action.

**Menu items PUT body:** entries use `label`, `url`, optional `type`, `object_id`, `parent_id`; array order supplies `position`. Full item saves replace the list and IDs.

**Export/import caveats:** export contains raw serialized `posts.content`, terms, relationships, comments, menus, menu items and options, with legacy generator/file-name metadata. Import consumes posts/terms/relationships/comments, remaps IDs and does not restore every exported field, options, menus, store orders or storage assets. Do not feed ordinary parsed API `Post[]` into import assuming it is the export format. This is not WXR/XML import or complete disaster recovery.

### 12.3 Storefront (10 route paths)

| Path | Methods | Access | Query/body and success |
| --- | --- | --- | --- |
| `/api/storefront/settings` | GET | Public | Public store/download display settings + payments/categories/tags |
| `/api/storefront/products` | GET | Public | Catalog queries in section 8 → `{items,total,pages}` |
| `/api/storefront/products/{id}` | GET | Public/session-aware | Numeric ID or nonnumeric slug → `{product,state,reviews,related,settings}` |
| `/api/storefront/cart` | GET, POST, PATCH, DELETE | Browser cart-cookie scope | Section 9 → `CartView` |
| `/api/storefront/cart/coupon` | POST, DELETE | Browser cart-cookie scope | POST `{code}` / DELETE none → `CartView` |
| `/api/storefront/checkout` | POST | Browser cart scope; guest setting/session rules | Billing/checkout body → `{order,email_warning?}`, 201 |
| `/api/storefront/orders` | GET | Signed-in customer | `{items: own Order[]}` |
| `/api/storefront/orders/{id}` | GET | Owner, valid `key`, or administrator | Numeric database order ID; `?key=...` → `Order` |
| `/api/storefront/account` | GET, PUT | Signed-in user | GET account payload; PUT `{billing?,shipping?}` → profile |
| `/api/storefront/reviews` | POST | Public/session-aware when reviews enabled | Review body → `Review`, 201; no GET |

### 12.4 Commerce management (13 route paths)

These are for the CMS administration or a deliberately authorized management client. A public theme must not need them for visitor reads.

| Path | Methods | Minimum access | Query/body and success |
| --- | --- | --- | --- |
| `/api/commerce/products` | GET, POST | Editor | GET `search,status,type,category,orderby,order,page,per_page` → `{items,total,pages}`; POST product fields → `Product`, 201 |
| `/api/commerce/products/{id}` | GET, PATCH, DELETE | Editor | GET `Product`; PATCH product fields → `Product`; DELETE `{deleted:true}` |
| `/api/commerce/orders` | GET | Editor | `status` (can be comma-separated), `customer`, `search`, `page`, `per_page` → `{items,total,pages}` |
| `/api/commerce/orders/{id}` | GET, PATCH | Editor | GET `Order`; PATCH `{status}` → `Order` with server state/stock effects |
| `/api/commerce/orders/{id}/notes` | POST | Editor | `{content,is_customer_note?}` → hydrated `Order`, 201, not a bare note object |
| `/api/commerce/orders/{id}/refunds` | POST | Administrator | `{amount,reason?}` → hydrated `Order`, 201; accounting/manual refund only |
| `/api/commerce/coupons` | GET, POST | Editor | GET `{items:Coupon[]}`; POST coupon-write fields → `Coupon`, 201 |
| `/api/commerce/coupons/{id}` | PATCH, DELETE | Editor | PATCH coupon fields → `Coupon`; DELETE `{deleted:true}`; no GET |
| `/api/commerce/customers` | GET | Editor | `search` → `{items: customer summaries[]}` with profile/order spending data |
| `/api/commerce/reviews` | GET | Editor | `product_id`, `status` (default `any`) → `{items:Review[]}` |
| `/api/commerce/reviews/{id}` | PATCH, DELETE | Editor | PATCH `{status}` → `{updated:true}`; DELETE `{deleted:true}`; no GET |
| `/api/commerce/reports` | GET | Editor | `days` default 30 → report object; `format=csv` → orders CSV download |
| `/api/commerce/settings` | GET, POST | Administrator | Full commerce settings / JSON patch → merged full settings |

**Product-write fields:** `type,parent_id,name,slug,description,short_description,status,sku,regular_price,sale_price,price,stock_status,stock_quantity,manage_stock,virtual,downloadable,featured,catalog_visibility,weight,images,attributes,default_attributes,children,files,download_limit,download_expiry,tax_status,categories,tags`.

Categories/tags here accept arrays of numeric IDs, `{id}` objects or `{name}` objects; named terms can be created under product taxonomy. This differs from publishing `category_ids`/`tag_ids`. Variations are created/patched as separate product records with `type="variation"` and `parent_id`; posting a guessed `variations` array does not automatically persist all children.

**Coupon-write fields:** use `code,discount_type,amount,description,usage_limit,individual_use,free_shipping,minimum_amount,maximum_amount,product_ids,category_ids,expiry_date,enabled`. `usage_count`, ID and creation timestamp are server/record state, not visitor-controlled checkout fields.

**Customer summaries:** customer/subscriber user identity fields plus `order_count,total_spent,billing,shipping` for management. Never publish the list.

**Commerce report object:** `summary`, `downloads`, `series`, `top`, `statuses`, `categories`.

- `summary`: `days,orders,items_sold,gross_sales,net_sales,refunds,shipping,discounts,average_order`.
- `downloads`: `total,period,unique,byMethod:[{method,c}]`.
- `series`: `[{date,orders,sales,downloads}]`.
- `top`: `[{id,name,qty,sales}]`.
- `statuses`: object mapping order status to count.
- `categories`: `[{name,sales,qty}]`.

### 12.5 Downloads (8 route paths)

| Path | Methods | Access | Query/body and success |
| --- | --- | --- | --- |
| `/api/downloads/download` | POST | Public/session-aware under eligibility rules | Initiation body → direct/email/redirect union in section 11 |
| `/api/downloads/token` | GET | Bearer download token | `token` → valid metadata or `{ok:false,reason,message}` |
| `/api/downloads/file` | GET | Bearer token + permitted file grants | `token,f,zip,files,view` → binary, or error JSON |
| `/api/downloads/subscribe` | POST | Public when newsletter enabled | `{email,name?}` → `{ok:true,already:boolean}` |
| `/api/downloads/settings` | GET, POST | Administrator | Full download settings / JSON patch → merged full settings |
| `/api/downloads/stats` | GET | Administrator | `days`, `product_id`, `page`; `format=csv` → CSV; otherwise `{summary,series,top,log}` |
| `/api/downloads/subscribers` | GET, POST, PATCH, DELETE | Administrator | GET `{items}`; POST `{email,name?}` subscribes; PATCH `{email}` unsubscribes; DELETE `?id=...` deletes; writes return refreshed `{items}` |
| `/api/downloads/emails` | GET | Administrator | `{items: email_log records[]}`, most recent up to 200 |

Download stats `summary` has `total,period,unique,byMethod`; `series` has date/order/sales/download counts; `top` has product `id,name,downloads`; `log` is `{items,total,pages}`. Log items contain `downloads` row fields, parsed `files: string[]`, plus `product_name` and `username`. These are request issuance/logging statistics, not proof of completed file transfers.

**Total implemented route paths in this source snapshot: 69** (5 authentication + 22 content + 10 storefront + 13 commerce + 8 downloads + 11 Sentinel login). Unsupported methods must not be assumed to exist simply because another route in the same subsystem supports them.

### 12.6 Sentinel login (11 route paths)

Sentinel adds passwordless and password authentication on top of the existing session cookie (`rm_session`). Every response is a Sentinel envelope: `{success, message, data}`. Failures return HTTP 400 with `success:false` and a Persian `message` (also mirrored to `message_key` for the shared client helper). Successful logins set the same `rm_session` cookie used by `/studio` and the rest of the API.

| Path | Methods | Access | Query/body and success |
| --- | --- | --- | --- |
| `/api/access/authenticate` | POST | Public | `{identifier, force_otp?, forget?}` → `{has_account, has_password, login_method: "password"|"otp", jwt?, ttl?, back_url?}`; blocked identifiers and firewall limits rejected |
| `/api/access/login/password` | POST | Public | `{identifier, password}` → `{user_id, ...}`; sets session; wrong password 400 |
| `/api/access/login/otp` | POST | Public | `{jwt, code}` → `{user_id, ...}`; verifies the OTP bound to `jwt`, creates the account on first login, sets session |
| `/api/access/auth/forgot/verify` | POST | Public | `{jwt, code}` → `{jwt, reset_key}`; marks the OTP verified and issues a single-use reset key |
| `/api/access/auth/forgot/change` | POST | Public | `{jwt, reset_key, password_1, password_2}` → success; sets the new password and logs in; reset key is single-use |
| `/api/access/account/mobile` | GET, POST | Current session | GET → `{mobile}`; POST `{mobile}` validates/unblocks/uniqueness and renames the username; changing it requires re-login |
| `/api/access/settings` | GET, POST, PUT | Administrator | GET `{sections, gateways}`; POST `{sections, gateways}` merges and mirrors `general.wordpress_*` into core options; PUT `{action:"test_sms"|"test_channel", identifier, channel?}` sends a test code |
| `/api/access/blocks` | GET, POST | Administrator | GET `page,per_page` → `{blocks,total,pages}`; POST `{action:"add",identifier}` or `{action:"delete",block_id}`; system blocks (`blocked_by` null) cannot be deleted |
| `/api/access/users` | GET | Administrator | `page,per_page,search` → `{users,total,pages}`; each user includes `mobile` |
| `/api/access/export/excel` | GET | Administrator | XLSX download (`application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`) with RTL sheet, frozen header, Persian labels |
| `/api/access/export/vcf` | GET | Administrator | `text/vcard` download of users that have a mobile |

**Checkout coupling:** `general.commerce_checkout_registration_required` drives guest checkout. `no` allows guest orders without an account; `yes_automatic` creates a customer from the billing details and requires a valid Iranian mobile (`billing.phone`), rejecting a mobile/email that already has an account; `yes_redirect` refuses anonymous checkout and requires sign-in first. In every mode `billing.phone` is validated and normalized to `+98…` before being stored on the order, the profile and the account.

## 13. PostgreSQL schema and relationships

### 13.1 Connection rules

- PostgreSQL is the only application database. Redis is not required.
- `lib/db.ts` uses `pg`, a pool of up to 10 connections, parameterized queries and transaction-bound connections through AsyncLocalStorage.
- Migrations initialize through a database advisory lock and `schema_migrations`; version 1 applies the schema, version 2 adds `orders.access_token`.
- Do not run a second automatic schema initializer with a different table design from a frontend project.
- Connect through server `DATABASE_URL` only. Browser code has no SQL connection contract.
- Backend functions maintain revisions, term synchronization, session expiry, order stock/sales, coupons and download file grants. Read/write through those functions and APIs rather than bypassing their invariants.

### 13.2 Storage type conventions

- Entity `id` fields normally use INTEGER identity primary keys. IDs are independent per table.
- Currency/rating aggregates generally use NUMERIC(18,4). The server converts numeric and int8/count results to JavaScript numbers.
- Most timestamps are ISO strings in TEXT columns, not native PostgreSQL timestamp columns. `schema_migrations.applied_at` is TIMESTAMPTZ.
- JSON fields below are serialized TEXT, **not JSONB**. API/server hydration parses them into objects/arrays.
- Flags commonly use INTEGER 0/1, not SQL BOOLEAN.
- Parentless hierarchy uses `parent_id=0`. Many guest store IDs use 0; nullable fields are separately listed.
- Foreign-key constraints cover selected ownership relations only. A logical relation in the diagram is not a claim that SQL enforces it.

### 13.3 Logical relationship map

```text
users.id
  ├─ posts.author_id
  ├─ comments.user_id (nullable guest)
  ├─ media.uploaded_by (nullable)
  ├─ sessions.user_id
  ├─ revisions.author_id (nullable)
  ├─ orders.customer_id (0 guest)
  ├─ customer_profiles.user_id
  ├─ reviews.user_id (0 guest)
  └─ downloads/download_tokens.user_id (0 guest)

posts.id
  ├─ comments.post_id
  ├─ revisions.post_id
  ├─ postmeta.post_id
  ├─ posts.parent_id
  └─ term_relationships.post_id, ONLY taxonomy category/tag
posts.featured_media_id → media.id

products.id
  ├─ products.parent_id (variation → parent)
  ├─ products.children JSON (grouped → child IDs)
  ├─ cart_items.product_id / variation_id
  ├─ order_items.product_id / variation_id
  ├─ reviews.product_id
  ├─ downloads/download_tokens.product_id / variation_id
  └─ term_relationships.post_id, ONLY taxonomy product_cat/product_tag

terms.id → term_relationships.term_id
menus.id → menu_items.menu_id
menu_items.id → menu_items.parent_id
orders.id → order_items/order_notes/order_refunds.order_id
download_tokens.token → download_token_files.token
wc_cart cookie → cart_items.cart_key
rm_session cookie → sessions.token → users.id
```

### 13.4 Critical taxonomy namespace warning

`term_relationships.post_id` is overloaded: it represents either `posts.id` or `products.id`. The taxonomy distinguishes the namespaces:

- publishing: `category`, `tag`;
- commerce: `product_cat`, `product_tag`.

A product and a post can both have ID 7. Do not join relationships based on numeric ID alone. Include the expected taxonomy whenever resolving relationships. Do not add an unconditional foreign key from `term_relationships.post_id` to `posts.id`.

Current post/product deletion code can delete relationships broadly by ID, creating a collision-related data-loss risk. Fixing that is a separate backend migration/hardening task. A frontend document must not imply that this shared join table already has safe independent namespace constraints.

### 13.5 Complete table/column dictionary

`PK` identifies primary key fields; `JSON text` means serialized JSON stored in TEXT. Column names below are actual application schema names.

#### Publishing, identity and navigation

| Table | Columns | Key/relations and frontend use |
| --- | --- | --- |
| `users` | `id,username,email,password_hash,display_name,role,bio,created_at` | PK `id`; username/email unique including lowercase indexes; password hash private; public author DTO is a subset |
| `posts` | `id,type,title,slug,content,excerpt,status,author_id,parent_id,featured_media_id,comment_status,sticky,format,menu_order,created_at,updated_at,published_at` | PK `id`; `content` JSON text; `featured_media_id,published_at` nullable; pages/articles share IDs |
| `terms` | `id,taxonomy,name,slug,description,parent_id` | PK `id`; separate taxonomy namespaces; term slug index is not a universal unique constraint |
| `term_relationships` | `post_id,term_id` | Composite PK; overloaded entity reference; taxonomy-aware joins required |
| `comments` | `id,post_id,user_id,author_name,author_email,author_url,content,status,parent_id,created_at` | PK `id`; nullable `user_id`; public UI uses approved subset and omits email |
| `media` | `id,filename,stored_name,mime,size,width,height,alt,caption,title,uploaded_by,created_at` | PK `id`; nullable dimensions/uploader; `url` is hydrated, not a stored column |
| `options` | `name,value` | PK text `name`; settings stored as string or serialized JSON; arbitrary option values are not public configuration |
| `menus` | `id,name,location` | PK `id`; header convention `location=primary` |
| `menu_items` | `id,menu_id,label,url,type,object_id,parent_id,position` | PK `id`; nullable `object_id`; position comes from saved array order |
| `sessions` | `token,user_id,created_at,expires_at` | PK text secret `token`; expiry index; server authorization only |
| `revisions` | `id,post_id,title,content,author_id,created_at` | PK `id`; nullable author; JSON text content; no dedicated public revisions API |
| `postmeta` | `id,post_id,key,value` | PK `id`; nullable value; no generic public meta API contract |
| `schema_migrations` | `version,applied_at` | PK `version`; server migration ledger, not UI content |

#### Commerce and customers

| Table | Columns | Key/relations and frontend use |
| --- | --- | --- |
| `products` | `id,type,parent_id,name,slug,description,short_description,status,sku,regular_price,sale_price,price,stock_status,stock_quantity,manage_stock,virtual,downloadable,featured,catalog_visibility,weight,images,attributes,default_attributes,children,files,download_limit,download_expiry,tax_status,rating_count,average_rating,total_sales,created_at,updated_at` | PK `id`; nullable sale price/stock quantity; `images,attributes,default_attributes,children,files` JSON text; stock nonnegative constraint |
| `orders` | `id,number,status,customer_id,billing,shipping,payment_method,payment_method_title,transaction_id,currency,discount_total,shipping_total,cart_tax,total,total_tax,customer_note,refunded_total,created_at,updated_at,paid_at,access_token` | PK `id`; unique display number; JSON text billing/shipping; nullable `paid_at`; access_token added by migration 2 and private |
| `order_items` | `id,order_id,product_id,variation_id,name,quantity,subtotal,total,tax,sku` | PK `id`; FK order with cascade; immutable order-line snapshot rather than always current product display |
| `order_notes` | `id,order_id,author,content,is_customer_note,created_at` | PK `id`; FK order with cascade; distinguish customer note from internal note |
| `order_refunds` | `id,order_id,amount,reason,created_at` | PK `id`; FK order with cascade; manual accounting record |
| `coupons` | `id,code,discount_type,amount,description,usage_limit,usage_count,individual_use,free_shipping,minimum_amount,maximum_amount,product_ids,category_ids,expiry_date,enabled,created_at` | PK `id`; unique/lowercase code index; JSON text ID arrays; nullable expiry date |
| `cart_items` | `cart_key,product_id,variation_id,quantity,created_at` | Composite PK all three identity columns; quantity > 0; cookie-key cart scope |
| `reviews` | `id,product_id,user_id,author_name,author_email,rating,content,status,verified,created_at` | PK `id`; 0 guest user; approved rating aggregates; omit email publicly |
| `customer_profiles` | `user_id,billing,shipping` | PK `user_id`; JSON text addresses; authenticated customer-only data |

#### Downloads, subscribers and mail

| Table | Columns | Key/relations and frontend use |
| --- | --- | --- |
| `downloads` | `id,product_id,variation_id,user_id,email,ip,method,files,created_at` | PK `id`; JSON text filename log; issuance/tracking record, not an entitlement URL |
| `download_tokens` | `token,product_id,variation_id,user_id,email,expires_at,used_at,created_at` | PK secret text token; nullable `used_at`; current initiation can bind target variation as product_id with variation_id=0, so resolve via server rather than inventing token SQL |
| `download_token_files` | `token,file_index,consumed_at` | Composite PK; token FK with cascade; nullable consumption timestamp; zero-based file grant |
| `subscribers` | `id,email,name,source,subscribed,created_at` | PK `id`; unique email; source includes newsletter/admin/capture workflow; no public list |
| `email_log` | `id,to_email,subject,heading,body,type,created_at,status,message_id,error` | PK `id`; real SMTP status/error metadata; message bodies can contain secrets/PII; administrator only |

There is also `order_number_sequence`, starting at 1001, separate from order ID generation. A PostgreSQL database backup plus persistent media/download storage backup is required for real recovery; the content-export API is not a substitute.

### 13.6 Settings persistence names

- Publishing settings: individual names in `options`, read through `getSettings`/`getOption`.
- Commerce settings: `options.name="shop_settings"`, serialized JSON merged with `SHOP_DEFAULTS`.
- Download settings: `options.name="downloads_settings"`, serialized JSON merged with `DOWNLOADS_DEFAULTS`.
- Applied cart coupon: internal option name `shop_cart_coupon_${cart_key}`.
- Per-product download overrides currently live in `downloads_settings.indy_items`, keyed by string product ID. Do not assume a generic product-meta REST endpoint controls them.

`disable_ecommerce` is a download/settings rule surfaced by the storefront settings endpoint; `enable_downloads` comes from commerce settings. Use the public resolved flags, not a guessed table column on each product.

## 14. Adding and selecting a new theme

### 14.1 What a theme currently means

`lib/themes.ts` contains compiled definitions with:

```ts
interface ThemeDef {
  slug: string;
  name: string;
  description: string;
  bg: string;
  text: string;
  accent: string;
  headerBg: string;
  headerText: string;
  font: string;
}
```

Current stored slugs/display names:

| Stored slug | Display name |
| --- | --- |
| `twentytwentyfive` | Meadow |
| `twentytwentyfour` | Sandstone |
| `twentytwentythree` | Evening |
| `classic` | Linen |

These are current internal identifiers, not installed Rayomand Core themes. `GET /api/content/themes` lists definitions with `active`. Administrator `POST {activate: slug}` selects one; unknown slugs are rejected. Unknown settings lookup falls back to the first definition.

The current theme setting changes palette/font values used by existing components. It does **not** select an independently uploaded React application, install a ZIP or load PHP templates.

### 14.2 Fastest supported way to add a new design

1. Keep the existing APIs, data libraries and database untouched unless fixing an explicitly identified backend requirement.
2. Implement or replace the public layout/components inside `app/(site)` and `app/(shop)`.
3. Preserve `LanguageProvider` and `StoreProvider` boundaries where their hooks are used.
4. Reuse real reads/writes described above; do not rewrite the transaction engine in frontend components.
5. Scope new CSS to public layout roots/components so the theme does not alter administration forms, editor dialogs or login layout unintentionally.
6. For a new palette option, add a trusted compiled `ThemeDef` with a stable slug to the current registry and use administrator activation.
7. Build/deploy the Next.js application. Installing the design is currently a code deployment, not a visitor upload action.

A palette entry alone does not implement new layouts. Conversely, replacing public layout code can change the website even if the selected palette slug stays the same.

### 14.3 Multiple complete frontend templates

**Requires backend/application change:** add an allowlisted compiled component registry keyed by stable theme slug, with a fixed interface for header, footer, content archive/detail, catalog/detail and commerce pages. Resolve the selected slug on the server. Pass safe data objects to components; do not let templates execute arbitrary database strings as import paths.

A proposed template package contract could contain:

- Stable `slug`, display `name`, version and explicitly supported CMS contract revision.
- Trusted source components for each public route slot.
- Scoped styles, responsive tokens and English/Persian translation resources.
- Block-type support declaration and safe unknown-block fallback.
- Asset paths and image-origin policy.
- Documented requirements for product types, cart/account/download features.
- Migration-free installation instructions unless backend additions are separately reviewed.
- Browser acceptance tests and uninstall/rollback instructions preserving content data.

This is a design recommendation, not an existing manifest schema or installation endpoint. Do not claim that `/api/content/themes` currently accepts package files. If a ZIP installer is later built, it requires signature/trust policy, path validation, dependency review and deployment isolation; it must not extract/execute arbitrary visitor uploads inside the running application.

### 14.4 Required visual and functional coverage

A compatible complete public template must include:

- Header/site identity, real primary navigation, language switch, search and optional basket/account controls.
- Homepage, article/page detail, publishing archives and intentional no-content states.
- All current block types with responsive media, readable typography and safe HTML policy.
- Catalog filters/search/sort/pagination; product images/price/stock/reviews/related products.
- Valid variation selection and grouped child presentation.
- Basket editing/coupon/shipping totals and checkout with real manual-payment instructions.
- Correct unpaid/paid/status receipt labels and authorized account screens.
- Download offer/login/capture/selection/direct/email/redirect/PDF/expired-token states.
- Newsletter form when enabled, without false consent or mail-delivery claims.
- Footer with configured policy/content links rather than fabricated legal pages.
- 404, unavailable product, authorization failure, service error and offline/network uncertainty states.

## 15. Fresh publication, caching, SEO and UI requirements

### 15.1 Publication freshness

The existing public pages/API handlers generally use `dynamic="force-dynamic"`. Published changes become visible on a new request; this is not a WebSocket/push notification promise for an already-open page.

For the fastest reliable integration:

- Server data reads happen per public request.
- API fetches that must stay fresh use `cache: "no-store"`.
- Do not hard-code an article/product list at build time using `generateStaticParams` and then assume later publications appear automatically.
- Refresh browser query state after successful mutations or language changes.
- When admin publishes/updates content, subsequent visitor loads must read the updated database without rebuilding the website.
- Publishing a `future` status does not automatically schedule a worker to switch it to `publish`. Do not expose future posts merely because a date has passed.

If adding ISR/CDN caching, **Requires backend/infrastructure work:** define explicit invalidation on article/page/product/menu/settings writes. Invalidate detail, list, archives, related items, home, feed and sitemap where relevant. TTL-based refresh is an alternative, but document its maximum delay rather than calling it immediate publication.

Never shared-cache personalized product `state`, cart, checkout, order/account responses or download token/file responses. Setting browser fetch `no-store` alone does not configure every reverse-proxy/CDN cache.

### 15.2 SEO and index boundaries

- Render article/page/product content on the server for indexable pages when possible.
- Generate title, description, canonical URL and Open Graph image from authorized published records, not from a second mock content source.
- Use `/read/{slug}` and `/collection/items/{slug}` canonicals.
- Verify visibility before generating metadata; private titles should not leak through metadata even if page rendering rejects the body.
- Product structured data must reflect the real price/currency/stock/reviews; do not fabricate ratings or paid order outcomes.
- `blog_public` can inform an implemented robots policy; do not assume the option automatically creates a robots.txt endpoint.
- Sitemap/robots/JSON-LD endpoints are not established by this document as current APIs. Add them explicitly if required, using only published/allowed records.
- Exclude `/studio`, `/api`, sign-in/account/basket/checkout, keyed receipts, token landing pages and protected files from indexing as appropriate.
- Do not publish email addresses, access tokens or internal notes in structured data.
- Locale cookie changes interface copy, not separate multilingual article identity. Do not invent translated canonical/hreflang page pairs without real translated content.

### 15.3 Brand and assets

- Service identity is **Rayomand CMS**. The site's editable `site_title` may be used as public site identity; administrative/product-service attribution should not be mislabeled Rayomand Core.
- Original logo: `/rayomand-logo.png`, with transparent background.
- Use an image with `object-fit: contain`; do not add an opaque black tile behind the artwork.
- Existing assets: `/favicon.ico`, `/rayomand-icon-32.png`, `/rayomand-icon-192.png`, `/rayomand-apple-icon.png`.
- Preserve root metadata/icon declarations when adding a theme.
- Avoid font downloads from third-party services when the bundled Persian font suffices.

### 15.4 Responsive/accessibility standards

- Functional phone/tablet/desktop layouts in both directions; no unintended horizontal overflow.
- Semantic navigation, headings, main/footer landmarks, labels and real buttons for actions.
- Keyboard access, visible focus, modal focus management/escape behavior and meaningful alerts/status announcements.
- Alt text and readable contrast; image placeholders must not substitute fake product imagery.
- Respect `prefers-reduced-motion`; modern micro-animations should not block interactions or hide errors.
- Loading, empty, error and disabled states for every API-driven feature.
- Long Persian/English names, mixed-direction email/SKU, missing images and zero prices must be usable.
- Avoid broad CSS selectors that break Studio/editor controls.

## 16. Explicit backend extensions and release blockers

### 16.1 Optional integration adapters — not implemented endpoints

The names below are **proposals only**. A frontend must not call them until their backend implementation exists and is tested.

| Proposed endpoint | Proposed purpose/contract |
| --- | --- |
| `GET /api/public/site` | Safe site bootstrap: allowlisted title/tagline/theme/page IDs/registration/public policy settings and primary menu, plus resolved public storefront settings; never all options |
| `GET /api/public/content?slug={slug}&type={post-or-page}` | Exact type/slug resolver returning only published content and safe public author/media DTO; explicit 404 and collision policy |
| `GET /api/public/creators/{username}` | Safe author identity and published archive; no private email/roles/session fields |

For an integrated theme these HTTP adapters are optional because server functions can perform the reads. For a separate headless template they remove missing slug/bootstrap/author contracts. Implementing them requires explicit source changes; this document is not evidence that they are live.

Suggested safe bootstrap fields:

```ts
{
  site: {
    title: string;
    tagline: string;
    postsPerPage: number;
    homeMode: "posts" | "page";
    homePageId: number | null;
    registrationEnabled: boolean;
    publicIndexing: boolean;
    privacyPageId: number | null;
    iconUrl: string | null;
  };
  theme: ThemeDef;
  primaryMenu: Menu | null;
  storefront: Record<string, unknown>;
}
```

These camelCase fields are a **proposed adapter DTO**, not current `/api/content/settings` property names. Preserve this distinction in generated code.

### 16.2 Current safety gaps requiring backend attention

Do not claim production security solely because a new theme hides unsafe UI fields.

| Observed source limitation | Required release action |
| --- | --- |
| Current `/read/{slug}` permits private records; configured homepage can render an arbitrary fetched status; detail metadata is not consistently visibility-filtered | Enforce published-only public rendering and metadata, with a separately authorized preview mechanism if needed |
| Authenticated content lists can return nonpublished records; staff browsing is not automatically a public context | Explicit `status=publish` and server public DTOs for all public rendering |
| Public comment detail lacks moderation filtering; comments/reviews creation lacks full publication checks | Validate parent visibility and approved-only public detail on the backend |
| Public hydrated authors/comments/reviews can contain emails; products include raw file paths; authorized orders include internal notes | Project safe DTOs before network delivery; hide-only client filtering is not sufficient privacy enforcement |
| Product detail allows hidden records; nested variation/grouped hydration lacks strict public filtering | Define catalog/detail visibility policy and sanitize nested publication state server-side |
| Token metadata can reveal referenced product details despite differing file-delivery publication checks | Align metadata authorization/publication checks with delivery policy |
| HTML sanitizer is regex-based | Vetted parser sanitizer, safe URL validation and an appropriate CSP; safe fallback before enabling HTML |
| Most mutation routes lack a uniform CSRF/origin-validation layer; SameSite=Lax alone is not a complete documented CSRF strategy | Add and test same-origin/CSRF defenses across state-changing endpoints; setup's Origin check is not global middleware |
| Cart cookie currently lacks Secure | Harden production cookie transport with HTTPS/Secure; preserve HttpOnly and scoped forwarding |
| No general rate-limiting/bot protection is established | Add appropriate controls for auth, comments, reviews, capture, newsletter and download issuance |
| Overloaded term relation IDs and broad deletion risk | Taxonomy-scoped deletion and/or reviewed namespace migration |
| File indexes can outlive file-list edits; ZIP can skip unreadable members | Stable file identities/versioning and complete-selection behavior if required |
| Protected local folder can be bypassed by an incorrectly configured static/proxy service | Preserve `/downloads/*` denial and prefer storage outside generic public roots in a future reviewed change |

Any backend hardening performed by the implementing AI should be explicit, scoped, tested and reported separately from theme styling. Do not silently rewrite database identifiers or invalidate existing sessions/tokens without a reviewed migration.

### 16.3 Additional features that need deliberate implementation

- Online payment gateway + signed callbacks + idempotency/reconciliation.
- Checkout idempotency keys and guest uncertain-outcome recovery.
- True scheduled publishing and publication events.
- Full frontend-template registry/installation loader.
- Translation-linked content entities and locale-prefixed routes.
- Robust slug uniqueness/redirect history.
- Object-storage downloads, immutable file IDs, large-file streaming and resume/range support.
- Consent tracking, verified newsletter opt-in and self-service unsubscribe.
- Public site bootstrap/slug/author adapters for a separate frontend.

These must not appear as working frontend controls backed by guessed routes.

## 17. Implementation examples

The examples demonstrate current contracts and explicit design choices. They do not seed records or implement the proposed adapters.

### 17.1 Same-origin JSON client preserving workflow flags

```ts
type ApiErrorPayload = {
  error?: string;
  message_key?: string;
  code?: number;
  require_login?: boolean;
  capture_required?: boolean;
  limit_reached?: boolean;
  redirect_url?: string;
};
class CmsRequestError extends Error {
  constructor(public status: number, public payload: ApiErrorPayload) {
    super(payload.error || `Request failed (${status})`);
  }
}
async function cmsJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!path.startsWith("/api/")) throw new Error("A same-origin CMS API path is required");
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (typeof init.body === "string") headers.set("Content-Type", "application/json");
  const response = await fetch(path, {
    ...init,
    headers,
    credentials: "same-origin",
    cache: "no-store",
  });
  const payload = await response.json();
  if (!response.ok) throw new CmsRequestError(response.status, payload);
  return payload as T;
}
```

Use a separate binary/navigation flow for file downloads and export files. For production, handle non-JSON proxy/service failures separately rather than presenting a JSON parser exception to the visitor. The existing `lib/client.ts` can be reused; preserve extra download flags if designing a new wrapper.

### 17.2 Public list and product reads

```ts
const query = new URLSearchParams({
  status: "publish",
  page: String(page),
  per_page: "10",
});
const articles = await cmsJson<ContentList>(`/api/content/posts?${query}`);
const visibleArticles = articles.items.filter(post => post.status === "publish");

const catalogQuery = new URLSearchParams({page: String(page), per_page: "12"});
if (category) catalogQuery.set("category", category);
if (search) catalogQuery.set("search", search);
const catalog = await cmsJson<ProductList>(`/api/storefront/products?${catalogQuery}`);
const detail = await cmsJson<ProductDetail>(
  `/api/storefront/products/${encodeURIComponent(productSlug)}`
);
```

Use `articles.totalPages` for publishing and `catalog.pages` for products. This product detail call is session-aware; do not put it into a shared personalized-response cache.

### 17.3 Integrated server article/page lookup

This is a public visibility-aware data read, not a complete component file:

```ts
import {notFound} from "next/navigation";
import {getPostBySlug} from "@/lib/posts";

async function loadPublishedContent(slug: string) {
  const article = await getPostBySlug(slug, "post");
  const record = article || await getPostBySlug(slug, "page");
  if (!record || record.status !== "publish") notFound();
  return record;
}
```

Use the same publication check when generating metadata. Render with a secure block renderer as specified in section 7. Preserve current post-first collision precedence unless an explicit routing/uniqueness change is implemented. Do not serialize the full hydrated author into a client component when only display name/username/bio are needed.

Server `listPosts(...)` returns `{items,total}`, not the HTTP `ContentList` envelope. Compute pagination or use the route adapter deliberately; do not conflate the two types.

### 17.4 Basket mutation using loaded product IDs

```ts
const cart = await cmsJson<CartView>("/api/storefront/cart", {
  method: "POST",
  body: JSON.stringify({
    product_id: detail.product.id,
    variation_id: selectedVariation?.id ?? 0,
    quantity,
  }),
});
```

A variable product must have a selected valid variation before this request. Update the store context with the returned `cart`, not a locally calculated substitute.

### 17.5 Checkout and receipt navigation

```ts
const result = await cmsJson<{order: Order; email_warning?: string}>(
  "/api/storefront/checkout",
  {
    method: "POST",
    body: JSON.stringify({
      billing,
      shipping,
      ship_to_different: shipToDifferent,
      payment_method: selectedPaymentId,
      customer_note: customerNote,
      shipping_method: pickup ? "pickup" : undefined,
    }),
  }
);
const receiptQuery = new URLSearchParams({key: result.order.access_token});
if (result.email_warning) receiptQuery.set("email_not_sent", "1");
router.push(`/purchase/receipt/${result.order.id}?${receiptQuery}`);
```

This records an order; it does not prove funds were paid. Do not log `receiptQuery` or add it to analytics.

### 17.6 Download union handling

```ts
type DownloadResult =
  | {type: "direct"; files: Array<{name: string; url: string}>; zip: {name: string; url: string} | null}
  | {type: "email"; message: string}
  | {type: "redirect"; url: string};

const result = await cmsJson<DownloadResult>("/api/downloads/download", {
  method: "POST",
  body: JSON.stringify({
    product_id: parentProduct.id,
    variation_id: selectedVariation?.id ?? 0,
    files: selectedOriginalFileIndexes,
    email,
    name,
  }),
});
if (result.type === "email") {
  showAcceptedMessage(result.message);
} else if (result.type === "redirect") {
  const destination = new URL(result.url, window.location.origin);
  if (destination.origin !== window.location.origin) throw new Error("Invalid download destination");
  window.location.assign(destination.pathname + destination.search);
} else {
  showExplicitDownloadLinks(result.files, result.zip);
}
```

`showAcceptedMessage` and `showExplicitDownloadLinks` represent UI functions you implement, not existing CMS APIs. Render download links as ordinary non-prefetched anchors, with an explicit user action, and do not navigate to both ZIP and individual files automatically.

For failed requests, branch on `CmsRequestError.payload.require_login`, `capture_required` or `limit_reached`. Do not discard the payload and reduce every workflow state to a generic toast.

### 17.7 Filesystem/media paths with a separate frontend

Public media URLs such as `/uploads/...` need the same-origin gateway route. Do not blindly prepend the internal database host or an internal service URL. Resolve returned API URLs against the configured public origin at the server/gateway boundary and validate the destination. Token/download URLs are returned by the CMS and must preserve their exact query parameters.

## 18. Local setup and deployment

### 18.1 Existing project baseline

- Next.js 14.2.15, React 18.3.1, TypeScript 5.4.5.
- Tailwind CSS 3.4.10.
- Node.js: use the project's supported modern runtime, at least 24.15 as stated by its launcher; verify build/test compatibility rather than downgrading existing runtime without need.
- PostgreSQL 17 through the existing local Docker setup.
- `pg`, Nodemailer and local Vazirmatn font dependency.
- Scripts: `dev`, `build`, `start`, `db:setup`, `test:woo`.

From the application root:

```bash
npm ci
npm run db:setup
npm run dev -- -p 3005
```

On Windows `start-local.cmd` installs dependencies when needed, runs database setup and starts development. Its default dev command does not guarantee port 3005; an explicit `-p` option selects that port.

Production:

```bash
npm run build
npm run start -- -p 3005
```

These are operator commands, not instructions to execute against an unrelated or populated database automatically.

### 18.2 Environment variables

The existing `.env.example` declares:

```text
POSTGRES_DB
POSTGRES_USER
POSTGRES_PASSWORD
POSTGRES_PORT
DATABASE_URL
SETUP_TOKEN
SMTP_HOST
SMTP_PORT
SMTP_SECURE
SMTP_USER
SMTP_PASSWORD
SMTP_FROM
```

Local setup defaults include database/user names `noma` and port 55432, but credentials are private generated/configured values. Do not infer production credentials from those names or copy secrets into this document.

- `DATABASE_URL` is server-only and must target the intended database.
- `SETUP_TOKEN` is first-owner setup authorization and must stay private.
- SMTP variables must configure a real sender if email workflows are enabled.
- No `NEXT_PUBLIC_DATABASE_URL` or frontend database password is valid.
- A separate frontend might introduce a server-only CMS upstream origin setting; that is a new frontend deployment setting, not an existing secret automatically read by the CMS.

### 18.3 Production infrastructure requirements

- HTTPS is required for secure production sessions.
- Preserve request public origin and cookies across proxy/BFF boundaries.
- Persistent storage for uploads and protected downloads; containers with ephemeral filesystem alone are insufficient.
- No static-export-only deployment for the complete CMS: authentication, PostgreSQL, checkout, SMTP and downloads require a server runtime.
- Database backups, storage backups, migration monitoring and SMTP failure observability.
- No raw public serving of protected download folders.
- Ensure network/storage limits are adequate for buffered file/ZIP handling; do not promise large-file scalability without changes.
- Restrict caches/logs/analytics on personalized and bearer-token endpoints.
- Complete section 16 hardening before claiming the site is safe for an untrusted public production environment.

### 18.4 Test isolation

The main application database must not be seeded for theme testing. Use an isolated test database and fixtures; clean up only the database/files created by that test run. Do not reset/drop the main database, restore an archive over source or delete unfamiliar QA files.

Existing verification resources:

- `woo-smoke.mjs`: real PostgreSQL/API/download/SMTP workflow checks.
- `browser-smoke.mjs`: real browser publishing/commerce/localization checks.
- `npm run test:woo`: runs the smoke entrypoint.

The native-route application had a successful production build and isolated PostgreSQL/SMTP/browser suite before this document was written. A future theme implementation must rerun appropriate checks against its own changes; this historical result is not a test of a yet-to-be-built template.

## 19. Acceptance tests and AI delivery checklist

### 19.1 Data and publishing

- [ ] Empty production database produces useful empty states without inserting sample records.
- [ ] Publish an article in an isolated test database; it appears on home/archive and `/read/{slug}` on the next fresh request without redeployment.
- [ ] Update title, slug, excerpt, blocks and featured media; correct data and URLs are shown.
- [ ] Draft/pending/private/future/trash bodies and titles are not exposed through public pages, metadata, feeds or proposed public adapters.
- [ ] Staff visiting the public website does not cause drafts to enter public caches.
- [ ] Published pages render as pages; post/page collision behavior is deliberate and tested.
- [ ] Topics/labels/creators query the right numeric identities and namespaces.
- [ ] Menu edits appear, order is correct and invalid/orphan links do not break navigation.
- [ ] Search result scope and pagination match the actual endpoints.
- [ ] Every supported block renders; unsafe HTML/URLs and unknown types are handled safely.
- [ ] Long content, missing images, null dimensions and empty taxonomy lists are usable.

### 19.2 Store and money

- [ ] Published visible products appear; unpublished and disallowed hidden/nested records are not leaked.
- [ ] Product changes appear on fresh request; no hard-coded sample catalog.
- [ ] Variable selection uses the actual child ID and correct price/stock/files.
- [ ] Grouped parent is not directly added to cart; unsupported external purchase behavior is not fabricated.
- [ ] Basket identity remains in the real cookie; another cart cannot be selected by a submitted ID/key.
- [ ] Quantity, removal, clear, coupon success/failure and shipping recalculate server totals.
- [ ] Zero price, sale-price null versus zero, unmanaged stock and stock errors are handled correctly.
- [ ] Disabled purchasing/guest checkout/coupons/payment methods produce correct UI and real server rejection.
- [ ] Manual-payment checkout creates an unpaid order, not a fake paid success.
- [ ] Free checkout, price/stock changes and concurrent submissions are tested.
- [ ] SMTP checkout failure still shows the created order and mail warning without duplicate checkout.
- [ ] Receipt uses `order.id`; guest key/owner/admin access works and unauthorized/email-only access fails.
- [ ] Internal notes/access keys/customer PII are not exposed through public DTOs or analytics.

### 19.3 Authentication, downloads and account

- [ ] Login/logout/me and enabled/disabled registration work with real sessions.
- [ ] Public registration cannot create elevated roles.
- [ ] English/Persian cookie and server/client UI stay in sync across refresh.
- [ ] Account access requires login; profile updates do not silently alter login identity.
- [ ] Reviews use server verification/moderation and hide email addresses.
- [ ] Download master switch, login/capture requirements, limits and exclusions are honored.
- [ ] Selected original file indexes remain aligned for variations and token metadata subsets.
- [ ] Direct, email and redirect success modes all use returned native URLs.
- [ ] Real SMTP acceptance and failure are distinguished from delivered-to-inbox claims.
- [ ] Normal file/ZIP consumption, expiry, missing files and replay 410 are tested.
- [ ] No download token URL is prefetched or spent by a preview/analytics fetch.
- [ ] PDF view policy and unreadable ZIP-member behavior are represented honestly.
- [ ] `/downloads/*` is denied even behind the deployment proxy/static layer.
- [ ] Newsletter enabled/disabled/repeated-email states work; consent is not falsely represented.

### 19.4 UI, routing and delivery

- [ ] All native public routes work and no new link/request uses removed classic-style paths.
- [ ] Studio/editor/commerce administration remains functional after CSS/layout changes.
- [ ] Transparent original logo and all favicon assets are preserved.
- [ ] Mobile/desktop English and Persian RTL layouts are browser-tested with no runtime exceptions or unintended overflow.
- [ ] Keyboard dialogs, focus, announcements, forms and reduced motion are verified.
- [ ] API service errors/non-JSON failures/uncertain checkout outcomes have useful real states.
- [ ] Public content is server-rendered or otherwise has a deliberate SEO strategy; indexing excludes private/sensitive routes.
- [ ] No secrets, session/cart tokens, order keys or private mail data enter delivered archives/public assets.
- [ ] Main database remains untouched; only owned isolated fixtures are cleaned up.
- [ ] Build, type checks, API tests and actual browser feature tests pass.
- [ ] Delivery lists implemented theme features, explicitly added backend changes and unresolved release blockers. Do not report an unsupported feature as complete.

## 20. Source navigation

Paths below are relative to the application root. These files are the source of truth if the application evolves beyond this snapshot.

| Concern | Source files |
| --- | --- |
| Schema and migrations | `lib/schema.ts`, `lib/db.ts` |
| Publishing entities/role ranks | `lib/types.ts` |
| Auth/session/permissions | `lib/auth.ts`, `lib/users.ts`, `lib/password.ts`, `app/api/auth/*/route.ts` |
| JSON/error helpers | `lib/api.ts`, `lib/client.ts` |
| Publishing queries/writes | `lib/posts.ts`, `lib/api-posts.ts` |
| Taxonomies/comments/media/menus | `lib/terms.ts`, `lib/api-terms.ts`, `lib/comments.ts`, `lib/media.ts`, `lib/menus.ts` |
| Publishing settings/theme definitions | `lib/options.ts`, `lib/themes.ts` |
| Blocks and current renderer | `lib/block-defs.ts`, `lib/blocks.tsx` |
| Root language/brand metadata | `app/layout.tsx`, `components/LanguageProvider.tsx`, `components/BrandMark.tsx` |
| Interface localization | `lib/i18n.ts`, `lib/i18n-server.ts`, `lib/messages-fa.ts` |
| Public publishing layouts/routes | `app/(site)/layout.tsx`, `app/(site)/page.tsx`, `app/(site)/read/[slug]/page.tsx`, sibling archive routes |
| RSS | `app/journal/feed/route.ts` |
| Products and store settings | `lib/woo/products.ts`, `lib/woo/core.ts`, `lib/woo/schema.ts` |
| Basket and coupons | `lib/woo/cart.ts`, `lib/woo/cartKey.ts` |
| Orders/payments/ownership | `lib/woo/orders.ts`, `app/api/storefront/checkout/route.ts` |
| Customer/review/newsletter data | `lib/woo/people.ts` |
| Download eligibility/tokens/history | `lib/woo/downloads.ts`, `app/api/downloads/*/route.ts` |
| ZIP/local delivery | `lib/woo/zip.ts`, `app/api/downloads/file/route.ts`, `middleware.ts` |
| Real mail transport | `lib/mail.ts` |
| Reports | `lib/woo/reports.ts` |
| Store UI and context | `components/woo/StoreContext.tsx`, `ProductDetail.tsx`, `ShopBrowser.tsx`, `CheckoutPage.tsx`, `FreeDownloadButton.tsx`, `DownloadReadyPage.tsx` in the same folder |
| Product attribute write format | `components/woo/admin/ShopProductEditor.tsx` |
| Full API implementations | `app/api/content`, `app/api/storefront`, `app/api/commerce`, `app/api/downloads` |
| Local deployment/testing | `compose.yaml`, `.env.example`, `setup-database.mjs`, `start-local.cmd`, `woo-smoke.mjs`, `browser-smoke.mjs` |

**Definition of a compatible frontend:** a new presentation that reads the CMS's real published data, respects its exact identities and authorization flows, preserves administration and transactional behavior, and explicitly implements or reports any missing adapter/security capability. It is not a visual mockup pretending to be connected, nor an undocumented Rayomand Core theme replacement.
