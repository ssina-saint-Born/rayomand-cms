# Rayomand CMS

A bilingual (English / Persian) publishing & commerce platform with its own mail
server, a theme/frontend package system with license verification, a mobile API,
and a native Kotlin Multiplatform mobile app.

> **License:** Source-available and free to self-host. Copying, redistribution,
> resale, and forking-for-resale are **not** permitted. See [LICENSE](LICENSE)
> and the [License](#-license) section below.

- [English](#-english)
- [فارسی](#-فارسی)

---

## 🇬🇧 English

### What it is

Rayomand CMS is a self-contained content and commerce platform. It is not a
WordPress fork and shares none of its look: the admin ("Studio") is a modern
React app, and the stack is built around PostgreSQL instead of MySQL. It is
designed to run on a single server with one process tree — the web server and
the mail engine start and stop together.

### Features

- **Bilingual by design** — full English and Persian (RTL) UI, per-user language.
- **Content modeling** — posts, pages, custom content types, terms/taxonomy,
  a block editor, menus, revisions, media library.
- **Commerce** — products, cart, checkout, coupons, orders, downloads, shipping
  zones and tax classes (Iran province/city data included).
- **SEO** — per-page metadata, Open Graph, JSON-LD, `sitemap.xml`, `robots.txt`,
  RSS feed.
- **Built-in mail server** — SMTP (25/587/465), IMAP (143/993), POP3 (110/995),
  DKIM, and a native webmail client. No external SMTP relay required.
- **SMS** — 12 gateway integrations plus a custom HTTP gateway.
- **Theme & frontend packages** — install declarative themes (T1), prebuilt
  static apps (T2), or SSR/Node frontends (T3) with per-file integrity checks and
  Ed25519 license verification. Foreign-CMS packages (T4) are rejected.
- **Mobile API** — bearer-token API for the app: auth, bootstrap, notifications,
  content, moderation, device management.
- **Access & auth** — sessions, roles (administrator/editor/author/subscriber),
  OTP login, password reset, IP/user blocking, CSV/Excel/VCF export.

### Tech stack

| Layer | Technology |
| --- | --- |
| Web | Next.js 14 (App Router), React 18, TypeScript |
| Styling | Tailwind CSS |
| Database | PostgreSQL 14+ |
| Mail | Custom engine (SMTP/IMAP/POP3), `mailauth`, `mailparser`, `smtp-server` |
| Mobile | Kotlin Multiplatform + Compose Multiplatform (Android + iOS) |

### Installation — Docker (recommended)

`compose.yaml` is the normal standalone stack: the app plus a bundled
PostgreSQL container, with host mappings for the web port and the mail ports.
There is no external mail relay and no separate database server.

```bash
git clone https://github.com/ssina-saint-Born/rayomand-cms.git
cd rayomand-cms

cp .env.example .env
./scripts/configure-docker.sh      # or: bash scripts/configure-docker.sh
docker compose up -d --build
```

`configure-docker.sh` writes the one database setting, `DATABASE_URL`, and
generates an independent `SETUP_TOKEN` and `MAIL_SESSION_SECRET`. If an older
`.env` still has split `POSTGRES_DB` / `POSTGRES_USER` / `POSTGRES_PASSWORD` /
`POSTGRES_PORT` values, it converts them into `DATABASE_URL` and removes the
split entries. Pass `--web-port 8080` (or set `WEB_PORT` in `.env`) to publish
a different web port; the default is 3131.

Then open **http://localhost:3131** and paste your `SETUP_TOKEN` to create the
first administrator account.

Notes:

- The app container is granted only `NET_BIND_SERVICE` so the mail daemon can
  bind privileged ports; it runs as an unprivileged user.
- Host ports 25/587/465/143/993/110/995 come from the app container. For
  **inbound mail** from the internet, port 25 must be reachable; if another
  mail server on the host already owns it, the stack still runs but external
  inbound SMTP for Rayomand is not reachable until you choose which server owns
  that port (see the Coolify section for the same trade-off).
- Named volumes keep PostgreSQL data, frontends, uploads, downloads and app data
  (mail and logs) across rebuilds.

### Deployment — Coolify (`compose.coolify.yaml`)

Use Coolify's **Docker Compose** build pack in **normal** mode (not Raw Compose);
Coolify then adds the Traefik labels that terminate HTTPS.

1. Create a resource from the public repository
   `https://github.com/ssina-saint-Born/rayomand-cms`.
2. Set **Base Directory** to `/` and **Compose location** to
   `/compose.coolify.yaml`.
3. Set the domain on service `app`, port `3131`.
4. Add exactly three environment variables:

   | Variable | Value |
   | --- | --- |
   | `DATABASE_URL` | `postgresql://rayomand:<password>@postgres:5432/rayomand` |
   | `SETUP_TOKEN` | `openssl rand -hex 32` |
   | `MAIL_SESSION_SECRET` | a different `openssl rand -hex 32` |

   The database host is the Compose service name `postgres`. Generate each
   secret separately and never reuse one value for another purpose. If you
   paste a URL whose host is something else (a Coolify-generated name or an
   external server), the bundled stack ignores the host and connects to its own
   `postgres` service using the same username, password and database name; use
   `compose.external-db.yaml` to target a truly external database.
5. Deploy. The first build takes a few minutes.

`compose.coolify.yaml` bundles PostgreSQL and publishes **no** host web or mail
ports — Traefik routes to the internal `app:3131`. Named volumes keep the
database, frontends, uploads, downloads and mail/app data across redeploys.

For automatic deploys, enable the GitHub webhook in Coolify and add it in the
repository settings; each push to `main` then triggers a redeploy. No GitHub
Actions workflow is needed for this.

**Running next to another mail server (for example Stalwart).** Ports 25 and the
other mail ports are already open on such a host, and Stalwart owns them.
`compose.coolify.yaml` publishes no host mail ports, so it cannot collide with
Stalwart: the Rayomand web UI, webmail client and outbound mail work inside its
own container network. External inbound SMTP/IMAP to Rayomand will not be
reachable in that arrangement — that is a routing decision, not a bug. If you
want Rayomand to own inbound mail for a domain, decide deliberately which mail
server owns each public port and the matching DNS/MX records; two servers cannot
bind the same host IP:port.

### Deployment — existing PostgreSQL (`compose.external-db.yaml`)

`compose.external-db.yaml` runs the app alone against a PostgreSQL server you
already operate, and publishes the web and mail host ports:

```bash
cp .env.example .env
# set DATABASE_URL to your server, e.g.
#   DATABASE_URL=postgresql://rayomand:<password>@127.0.0.1:5432/rayomand
# then generate the two secrets (independent openssl rand -hex 32 values)
docker compose -f compose.external-db.yaml up -d --build
```

This file is not the Coolify default; use `compose.coolify.yaml` there, or omit
its mail mappings if another mail server on the host already owns those ports.

### Installation — bare metal / VPS (systemd)

Requirements: Linux, Node 18+, and root or sudo. PostgreSQL 14+ is installed by
the provisioning script when it is missing.

```bash
git clone https://github.com/ssina-saint-Born/rayomand-cms.git /opt/rayomand
cd /opt/rayomand

sudo bash scripts/provision-postgres.sh   # installs/starts PostgreSQL 14+, creates role + database, writes DATABASE_URL
sudo env WEB_PORT=3131 bash ./install.sh --yes
# or, interactive:
./install.sh
```

`provision-postgres.sh` uses apt, dnf, yum or apk, creates a dedicated
`rayomand` role and database, and writes `DATABASE_URL`, `SETUP_TOKEN` and
`MAIL_SESSION_SECRET` into `.env`. Skip it when PostgreSQL already runs: export
`DATABASE_URL` (`DATABASE_URL=... ./install.sh --yes`) or let the installer ask
for it.

`install.sh` requires one `DATABASE_URL`, normalizes any old split `.env`
fields into that URL, generates `SETUP_TOKEN` and `MAIL_SESSION_SECRET` when
missing, and writes `.env` with mode 600. It also runs preflight checks (Node,
database reachability, free ports, outbound port 25), runs `npm ci` and
`npm run build`, and installs a `rayomand.service` systemd unit with
`CAP_NET_BIND_SERVICE` so mail can bind 25/143/110 without root.

After install:

1. Open `http://<server>:3131`.
2. Paste `SETUP_TOKEN` from `.env` to create the owner.
3. **Studio → Mail** → add your domain and create the `no-reply` mailbox.
4. Publish the MX, SPF, DKIM and DMARC DNS records shown in Studio → Mail.

```bash
sudo journalctl -u rayomand -f     # logs
./install.sh --uninstall           # remove service, keep data
```

Bare-metal data lives in `data/` (mail and logs), `public/uploads/`,
`public/downloads/` and `public/frontends/` inside the install directory.

### Secrets and the setup token

| Variable | What it is | Lifetime |
| --- | --- | --- |
| `DATABASE_URL` | PostgreSQL connection URL; contains the database password | Permanent and sensitive |
| `SETUP_TOKEN` | One-time bootstrap secret for `/api/auth/setup` | Only until the first owner exists |
| `MAIL_SESSION_SECRET` | Signs webmail session cookies and is the primary key for encrypted at-rest mail settings | Permanent; keep private and unchanged |

`SETUP_TOKEN` is not a login token, a database password, a mobile bearer token
or a GitHub PAT. Only `/api/auth/setup` checks it, and only while no CMS user
exists; once the first owner is created it grants nothing. Compose still
requires it to be non-empty, so keep a private random 64-hex-character value and
never reuse it.

`MAIL_SESSION_SECRET` must stay unchanged: rotating it invalidates webmail
sessions and can make stored mail secrets unreadable unless they are re-entered.
`MAIL_SECRET_KEY` is an optional advanced override for at-rest mail encryption
only. Do not reuse any of these values for another purpose.

### Mail DNS (for real delivery)

| Record | Value |
| --- | --- |
| MX | your server, for each hosted domain |
| SPF | `v=spf1 a mx -all` (use `~all` while testing) |
| DKIM | the TXT record generated by Studio → Mail |
| DMARC | start with `p=none`, tighten later |
| PTR | reverse DNS matching your hostname (Gmail requires it) |

TLS certificates for SMTP/IMAP are obtained automatically via ACME DNS-01 once
a domain is added (configure DNS provider credentials in Studio → Mail → TLS).

### Mobile app (Kotlin Multiplatform + Compose)

The app talks to the CMS's `/api/mobile/*` endpoints with a bearer token. Source
lives under [`mobile/`](mobile/). See [mobile/README.md](mobile/README.md) for
full details.

**Install the CMS from your phone (mobile installer 1.2.0):** on the sign-in
screen tap **"Install the CMS on your server"**. The app asks for server
address, SSH user, install directory and web port, then produces a ready-to-run
command that clones or updates this repository and starts the stack — copy it
and run it over SSH. The app never opens the SSH connection, so no server
credentials pass through the phone.

The generated commands are idempotent (they `git pull --ff-only` when the
directory already exists):

- **Docker:** runs `scripts/configure-docker.sh --web-port PORT`, which writes
  one `DATABASE_URL` and generates `SETUP_TOKEN` plus `MAIL_SESSION_SECRET`,
  then `docker compose up -d --build`.
- **Bare metal:** runs `scripts/provision-postgres.sh`, which installs
  PostgreSQL 14+ from apt, dnf, yum or apk when missing, starts it, creates a
  dedicated `rayomand` role and database, and writes `DATABASE_URL` and the two
  secrets. Then `install.sh --yes` runs with your `WEB_PORT`. Node 18+ remains a
  prerequisite.

Both forms shell-quote every input, and an invalid web port is rejected and
falls back to 3131.

**Build it yourself:** JDK 17 and Android SDK (platform 35) for Android; macOS +
Xcode 15+ for iOS. A prebuilt APK appears on the
[**Releases**](https://github.com/ssina-saint-Born/rayomand-cms/releases) page
only when a build has been attached there; the 1.2.0 installer changes live in
this source tree, so build from here if no matching artifact exists.

```bash
cd mobile
./gradlew :composeApp:assembleDebug
# APK: composeApp/build/outputs/apk/debug/composeApp-debug.apk

adb install -r composeApp/build/outputs/apk/debug/composeApp-debug.apk
```

> A release APK built from this tree is signed with the standard Android debug
> key. That is fine for sideloading and testing; for a Play Store release, sign
> it with your own keystore (`./gradlew :composeApp:assembleRelease` with a
> signing config).

On an emulator the CMS is reached at `http://10.0.2.2:3131` (the default server
address). On a physical device, set the server address to your LAN IP or domain
on the sign-in screen. For iOS, build the framework on a Mac:

```bash
cd mobile
./gradlew :composeApp:linkDebugFrameworkIosSimulatorArm64
```

Then create an Xcode app that uses `MainViewController()` from `ComposeApp`.
iOS builds require Apple signing and cannot be distributed as a plain file, so
no prebuilt iOS binary is provided — build it on a Mac for the App Store.

### Updating

```bash
git pull
./scripts/configure-docker.sh      # only if the environment changed
docker compose up -d --build
```

Bare metal:

```bash
git pull
./install.sh
```

Database migrations are forward-only and run automatically on the first request.

### License

This project is **source-available, not open-source**. You may **use and
self-host it freely** — including commercially on your own or your clients'
sites — and modify it for **private internal use**.

You may **not**:

- copy, redistribute, publish, or sub-license the software or a substantial
  portion of it;
- sell, resell, rent, or commercially exploit the software or a derivative as a
  product;
- fork and rebrand it, or sell it after only minor changes;
- offer it as a hosted/managed service or in a paid theme/template bundle.

For redistribution, resale, or white-labeling, a separate commercial license is
required. See [LICENSE](LICENSE) for the full terms.

### Project structure

```
app/            Next.js routes (studio admin, storefront, API, auth)
components/     React UI (Studio admin, shop, blocks)
lib/            Core logic (db, auth, posts, comments, mail, theme, shop, seo…)
mobile/         Kotlin Multiplatform app (androidMain / iosMain / commonMain)
vendor/         Reference license server + packaging tools (no private key)
public/         Brand assets (built frontends are gitignored)
scripts/        Installer helpers, mail daemon, smoke tests
install.sh      Bare-metal installer
compose.yaml    Standalone Docker stack (bundled PostgreSQL, host web + mail ports)
compose.coolify.yaml        Coolify Docker Compose stack (no host web/mail ports)
compose.external-db.yaml    App-only stack for an existing PostgreSQL server
Dockerfile      Multi-stage production image
```

---

## 🇮🇷 فارسی

### این پروژه چیست

رایومند یک پلتفرم یکپارچه برای انتشار محتوا و فروشگاه اینترنتی است، با پشتیبانی
کامل از دو زبان فارسی و انگلیسی. این پروژه فورک وردپرس نیست و ظاهر آن هم شبیه
وردپرس نیست: پنل مدیریت («استودیو») یک اپلیکیشن مدرن React است و پایگاه داده
PostgreSQL جای MySQL را گرفته است. برای اجرا روی یک سرور واحد طراحی شده؛ وب‌سرور
و موتور ایمیل در یک فرایند والد با هم بالا می‌آیند و با هم خاموش می‌شوند.

### امکانات

- **دوزبانه از پایه** — رابط کامل انگلیسی و فارسی (راست‌به‌چپ)، زبان به‌ازای هر کاریر.
- **مدل‌سازی محتوا** — نوشته‌ها، برگه‌ها، انواع محتوای دلخواه، دسته/برچسب،
  ویرایشگر بلوکی، فهرست‌ها، نسخه‌ها، کتابخانهٔ رسانه.
- **فروشگاه** — محصولات، سبد خرید، تسویه‌حساب، کد تخفیف، سفارش‌ها، دانلود،
  مناطق ارسال و رده‌های مالیات (شامل دادهٔ استان/شهر ایران).
- **سئو** — متادیتای هر صفحه، Open Graph، JSON-LD، `sitemap.xml`، `robots.txt`،
  فید RSS.
- **سرور ایمیل داخلی** — SMTP (25/587/465)، IMAP (143/993)، POP3 (110/995)،
  DKIM، و کلاینت وب‌میل بومی. نیازی به رلهٔ SMTP خارجی نیست.
- **پیامک** — اتصال به ۱۲ درگاه آماده به‌علاوهٔ یک درگاه HTTP سفارشی.
- **بستهٔ قالب و فرانت‌اند** — نصب قالب‌های اعلانی (T1)، اپ‌های استاتیک آمادهٔ
  اجرا (T2)، یا فرانت‌اند SSR/Node (T3) با بررسی صحت فایل‌ها و تأیید لایسنس با
  امضای Ed25519. بسته‌های مربوط به CMS دیگر (T4) رد می‌شوند.
- **API موبایل** — API توکن‌محور برای اپ: احراز هویت، بوت‌استرپ، اعلان‌ها،
  محتوا، مدیریت نظرات، مدیریت دستگاه‌ها.
- **دسترسی و احراز هویت** — نشست‌ها، نقش‌ها (مدیر/ویرایشگر/نویسنده/مشترک)،
  ورود با کد یک‌بارمصرف، بازیابی رمز، مسدودسازی IP/کاربر، خروجی Excel/CSV/VCF.

### پشتهٔ فناوری

| لایه | فناوری |
| --- | --- |
| وب | Next.js 14 (App Router)، React 18، TypeScript |
| استایل | Tailwind CSS |
| پایگاه داده | PostgreSQL نسخهٔ ۱۴ به بالا |
| ایمیل | موتور اختصاصی (SMTP/IMAP/POP3)، `mailauth`، `mailparser`، `smtp-server` |
| موبایل | Kotlin Multiplatform + Compose Multiplatform (اندروید و iOS) |

### نصب با داکر (پیشنهادی)

فایل `compose.yaml` پشتهٔ معمول و مستقل است: اپ به‌همراه PostgreSQL درون‌ساز، با
نگاشت پورت وب و پورت‌های ایمیل روی میزبان. رلهٔ ایمیل خارجی و سرور دیتابیس جدا
لازم نیست.

```bash
git clone https://github.com/ssina-saint-Born/rayomand-cms.git
cd rayomand-cms

cp .env.example .env
./scripts/configure-docker.sh      # یا: bash scripts/configure-docker.sh
docker compose up -d --build
```

`configure-docker.sh` تنها تنظیم دیتابیس یعنی `DATABASE_URL` را می‌نویسد و دو
کلید مستقل `SETUP_TOKEN` و `MAIL_SESSION_SECRET` را می‌سازد. اگر در `.env` قدیمی
مقادیر جداگانهٔ `POSTGRES_DB` / `POSTGRES_USER` / `POSTGRES_PASSWORD` /
`POSTGRES_PORT` باشد، آن‌ها را به `DATABASE_URL` تبدیل و حذف می‌کند. برای پورت وب
دیگر از `--web-port 8080` (یا `WEB_PORT` در `.env`) استفاده کنید؛ پیش‌فرض ۳۱۳۱
است.

سپس **http://localhost:3131** را باز کنید و `SETUP_TOKEN` را وارد کنید تا
حساب مدیر نخست ساخته شود.

نکات:

- کانتینر اپ فقط مجوز `NET_BIND_SERVICE` می‌گیرد تا موتور ایمیل بتواند به
  پورت‌های ویژه bind شود؛ خود کانتینر با کاربر غیرروت اجرا می‌شود.
- پورت‌های میزبان ۲۵/۵۸۷/۴۶۵/۱۴۳/۹۹۳/۱۱۰/۹۹۵ از کانتینر اپ منتشر می‌شوند.
  برای **دریافت ایمیل** از اینترنت، پورت ۲۵ باید قابل دسترسی باشد؛ اگر سرور
  ایمیل دیگری روی میزبان از قبل آن را در اختیار دارد، پشته باز هم اجرا می‌شود اما
  SMTP ورودی بیرونی رایومند در دسترس نیست تا خودتان تصمیم بگیرید کدام سرور مالک
  آن پورت باشد (همان تصمیم در بخش Coolify توضیح داده شده است).
- volumeهای نام‌دار دادهٔ PostgreSQL، فرانت‌اندها، آپلودها، دانلودها و دادهٔ اپ
  (ایمیل و لاگ) را در بازسازی‌ها نگه می‌دارند.

### استقرار با Coolify (`compose.coolify.yaml`)

در Coolify از بستهٔ ساخت **Docker Compose** در حالت **معمولی** (نه Raw Compose)
استفاده کنید؛ در این حالت Coolify برچسب‌های Traefik را برای HTTPS اضافه می‌کند.

1. یک منبع از مخزن عمومی `https://github.com/ssina-saint-Born/rayomand-cms`
   بسازید.
2. **Base Directory** را `/` و **Compose location** را `/compose.coolify.yaml`
   بگذارید.
3. دامنه را روی سرویس `app` و پورت `3131` تنظیم کنید.
4. دقیقاً سه متغیر محیطی اضافه کنید:

   | متغیر | مقدار |
   | --- | --- |
   | `DATABASE_URL` | `postgresql://rayomand:<password>@postgres:5432/rayomand` |
   | `SETUP_TOKEN` | یک `openssl rand -hex 32` |
   | `MAIL_SESSION_SECRET` | یک `openssl rand -hex 32` جداگانه |

   میزبان دیتابیس نام سرویس Compose یعنی `postgres` است. هر کلید را جداگانه
   بسازید و هیچ‌کدام را برای کاربرد دیگری استفاده نکنید.
5. استقرار را اجرا کنید. نخستین ساخت چند دقیقه طول می‌کشد.

`compose.coolify.yaml` خودش PostgreSQL را همراه دارد و هیچ پورت وب یا ایمیلی روی
میزبان منتشر نمی‌کند — Traefik به `app:3131` داخلی مسیر می‌دهد. volumeهای نام‌دار
دیتابیس، فرانت‌اندها، آپلودها، دانلودها و دادهٔ ایمیل/اپ را در بازاستقرارها نگه
می‌دارند.

برای استقرار خودکار، webhook گیت‌هاب را در Coolify فعال و در تنظیمات مخزن ثبت
کنید؛ آن‌گاه هر push به `main` بازاستقرار را راه می‌اندازد. برای این کار به
workflow گیت‌هاب اکشنز نیازی نیست.

**اجرای هم‌زمان با سرور ایمیل دیگر (مثلاً Stalwart).** در چنین میزبانی پورت ۲۵ و
دیگر پورت‌های ایمیل از قبل باز و در اختیار Stalwart هستند. `compose.coolify.yaml`
هیچ پورت ایمیلی روی میزبان منتشر نمی‌کند، پس با Stalwart تعارض ندارد: رابط وب،
کلاینت وب‌میل و ارسال ایمیل رایومند در شبکهٔ کانتینری مستقل خود کار می‌کنند.
دریافت SMTP/IMAP بیرونی به رایومند در این چیدمان در دسترس نخواهد بود و این یک
تصمیم مسیریابی است، نه باگ. اگر می‌خواهید رایومند دریافت ایمیل یک دامنه را بر
عهده بگیرد، باید آگاهانه مشخص کنید کدام سرور مالک هر پورت عمومی و رکوردهای
DNS/MX متناظر است؛ دو سرور نمی‌توانند روی یک IP:port میزبان bind شوند.

### استقرار روی PostgreSQL موجود (`compose.external-db.yaml`)

`compose.external-db.yaml` فقط اپ را روی سرور PostgreSQL موجود شما اجرا می‌کند و
پورت وب و ایمیل را روی میزبان منتشر می‌کند:

```bash
cp .env.example .env
# DATABASE_URL را به سرور خود تنظیم کنید، مثلاً:
#   DATABASE_URL=postgresql://rayomand:<password>@127.0.0.1:5432/rayomand
# سپس دو کلید مستقل بسازید (هر کدام openssl rand -hex 32)
docker compose -f compose.external-db.yaml up -d --build
```

این فایل پیش‌فرض Coolify نیست؛ آنجا از `compose.coolify.yaml` استفاده کنید یا
اگر سرور ایمیل دیگری روی میزبان مالک آن پورت‌هاست، نگاشت‌های ایمیل این فایل را
حذف کنید.

### نصب روی سرور مستقیم (systemd)

پیش‌نیازها: لینوکس، Node نسخهٔ ۱۸ به بالا، و دسترسی root یا sudo. اگر PostgreSQL
۱۴ به بالا نصب نباشد، اسکریپت آماده‌سازی آن را نصب می‌کند.

```bash
git clone https://github.com/ssina-saint-Born/rayomand-cms.git /opt/rayomand
cd /opt/rayomand

sudo bash scripts/provision-postgres.sh   # نصب/اجرای PostgreSQL ۱۴+، ساخت role و database، نوشتن DATABASE_URL
sudo env WEB_PORT=3131 bash ./install.sh --yes
# یا تعاملی:
./install.sh
```

`provision-postgres.sh` از apt، dnf، yum یا apk استفاده می‌کند، role و database
اختصاصی `rayomand` را می‌سازد و `DATABASE_URL`، `SETUP_TOKEN` و
`MAIL_SESSION_SECRET` را در `.env` می‌نویسد. اگر PostgreSQL از قبل در حال اجراست،
از آن صرف‌نظر کنید: `DATABASE_URL` را export کنید
(`DATABASE_URL=... ./install.sh --yes`) یا بگذارید نصب‌کننده آن را بپرسد.

`install.sh` یک `DATABASE_URL` لازم دارد، فیلدهای جداگانهٔ قدیمی `.env` را به همان
URL تبدیل می‌کند، در صورت نبود `SETUP_TOKEN` و `MAIL_SESSION_SECRET` آن‌ها را
می‌سازد و `.env` را با مجوز ۶۰۰ می‌نویسد. هم‌چنین بررسی‌های اولیه (Node، دسترسی
دیتابیس، آزاد بودن پورت‌ها، پورت ۲۵ خروجی) را انجام می‌دهد، `npm ci` و
`npm run build` را اجرا می‌کند و سرویس `rayomand.service` را با
`CAP_NET_BIND_SERVICE` نصب می‌کند تا ایمیل بدون root به پورت‌های ۲۵/۱۴۳/۱۱۰
دسترسی داشته باشد.

پس از نصب:

1. آدرس `http://<server>:3131` را باز کنید.
2. `SETUP_TOKEN` را از `.env` وارد کنید تا حساب مالک ساخته شود.
3. **استودیو ← ایمیل** ← دامنه‌تان را اضافه کنید و صندوق `no-reply` را بسازید.
4. رکوردهای DNS مربوط به MX، SPF، DKIM و DMARC را که در استودیو ← ایمیل نشان
   داده می‌شود منتشر کنید.

```bash
sudo journalctl -u rayomand -f     # مشاهدهٔ لاگ‌ها
./install.sh --uninstall           # حذف سرویس، حفظ داده‌ها
```

دادهٔ نصب مستقیم در `data/` (ایمیل و لاگ)، `public/uploads/`،
`public/downloads/` و `public/frontends/` در پوشهٔ نصب قرار دارد.

### کلیدها و توکن نصب

| متغیر | چیست | طول عمر |
| --- | --- | --- |
| `DATABASE_URL` | نشانی اتصال PostgreSQL؛ شامل رمز دیتابیس | دائمی و حساس |
| `SETUP_TOKEN` | کلید یک‌بارمصرف راه‌اندازی برای `/api/auth/setup` | فقط تا ساخت نخستین مالک |
| `MAIL_SESSION_SECRET` | امضای کوکی نشست وب‌میل و کلید اصلی رمزنگاری تنظیمات ایمیل در حالت ساکن | دائمی؛ خصوصی و بدون تغییر بماند |

`SETUP_TOKEN` توکن ورود، رمز دیتابیس، توکن Bearer موبایل یا PAT گیت‌هاب نیست.
تنها `/api/auth/setup` آن را بررسی می‌کند و فقط تا وقتی هیچ کاربری وجود ندارد؛ پس
از ساخت نخستین مالک هیچ دسترسی‌ای نمی‌دهد. Compose هنوز لازم دارد که این مقدار
خالی نباشد؛ یک مقدار تصادفی خصوصی ۶۴ کاراکتری نگه دارید و هرگز دوباره استفاده
نکنید.

`MAIL_SESSION_SECRET` باید بدون تغییر بماند: تغییر آن نشست‌های وب‌میل را باطل
می‌کند و می‌تواند کلیدهای ذخیره‌شدهٔ ایمیل را ناخوانا کند مگر آن‌که دوباره وارد
شوند. `MAIL_SECRET_KEY` یک بازنویسی پیشرفته و اختیاری فقط برای رمزنگاری ایمیل در
حالت ساکن است. هیچ‌یک از این مقادیر را برای کاربرد دیگری به‌کار نبرید.

### DNS ایمیل (برای ارسال واقعی)

| رکورد | مقدار |
| --- | --- |
| MX | سرور شما، برای هر دامنهٔ میزبانی‌شده |
| SPF | `v=spf1 a mx -all` (هنگام تست از `~all` استفاده کنید) |
| DKIM | رکورد TXT که استودیو ← ایمیل می‌سازد |
| DMARC | با `p=none` شروع کنید و بعداً سخت‌گیرتر کنید |
| PTR | رکورد DNS معکوس هم‌نام با هاست شما (Gmail الزام می‌کند) |

گواهی TLS برای SMTP/IMAP پس از افزودن دامنه به‌صورت خودکار با ACME DNS-01
گرفته می‌شود (اطلاعات ارائه‌دهندهٔ DNS را در استودیو ← ایمیل ← TLS تنظیم کنید).

### اپلیکیشن موبایل (Kotlin Multiplatform + Compose)

اپ با توکن Bearer به نقطه‌پایان‌های `/api/mobile/*` در CMS وصل می‌شود. کد منبع
در پوشهٔ [`mobile/`](mobile/) قرار دارد و جزئیات کامل در
[mobile/README.md](mobile/README.md) آمده است.

**پیش‌نیاز ساخت:** JDK 17 و Android SDK (پلتفرم ۳۵) برای اندروید؛ macOS و
Xcode 15 به بالا برای iOS. فایل APK آماده فقط وقتی در صفحهٔ
[**Releases**](https://github.com/ssina-saint-Born/rayomand-cms/releases) موجود
است که بیلدی ضمیمه شده باشد؛ تغییرات نصب‌کنندهٔ نسخهٔ ۱٫۲٫۰ در همین کد منبع است،
پس اگر فایل متناظری نبود از همین درخت بسازید.

**نصب CMS از روی گوشی (نصب‌کنندهٔ موبایل نسخهٔ ۱٫۲٫۰):** در صفحهٔ ورود روی
**«Install the CMS on your server»** بزنید. اپ آدرس سرور، کاربر SSH، مسیر نصب و
پورت وب را می‌پرسد و سپس دستور آمادهٔ اجرایی می‌سازد که این مخزن را clone یا
به‌روزرسانی کرده و پشته را بالا می‌آورد — دستور را کپی کنید و با SSH اجرا کنید.
خود اپ هرگز اتصال SSH باز نمی‌کند، پس هیچ رمز سروری از گوشی عبور نمی‌کند.

دستورهای تولیدشده idempotent هستند (اگر پوشه از قبل باشد `git pull --ff-only`
اجرا می‌شود):

- **Docker:** `scripts/configure-docker.sh --web-port PORT` را اجرا می‌کند که یک
  `DATABASE_URL` می‌نویسد و `SETUP_TOKEN` و `MAIL_SESSION_SECRET` را می‌سازد،
  سپس `docker compose up -d --build`.
- **نصب مستقیم:** `scripts/provision-postgres.sh` را اجرا می‌کند که در صورت نبود
  PostgreSQL ۱۴+ را از apt، dnf، yum یا apk نصب می‌کند، آن را اجرا می‌کند، role و
  database اختصاصی `rayomand` را می‌سازد و `DATABASE_URL` و دو کلید را می‌نویسد.
  سپس `install.sh --yes` با `WEB_PORT` شما اجرا می‌شود. Node 18+ همچنان پیش‌نیاز
  است.

در هر دو حالت ورودی‌ها با shell quote امن می‌شوند و پورت وب نامعتبر رد شده و به
۳۱۳۱ برمی‌گردد.

```bash
cd mobile
./gradlew :composeApp:assembleDebug
# فایل APK: composeApp/build/outputs/apk/debug/composeApp-debug.apk

adb install -r composeApp/build/outputs/apk/debug/composeApp-debug.apk
```

> APK ساخته‌شده از همین درخت با کلید دیباگ استاندارد اندروید امضا می‌شود. برای نصب
> دستی و تست مناسب است؛ برای انتشار در Google Play آن را با کلید خودتان امضا کنید
> (`./gradlew :composeApp:assembleRelease` همراه با تنظیمات امضا).

روی شبیه‌ساز، CMS از آدرس `http://10.0.2.2:3131` در دسترس است (آدرس پیش‌فرض در
صفحهٔ ورود). روی دستگاه واقعی، آدرس سرور را در صفحهٔ ورود به IP محلی یا دامنهٔ
خود تغییر دهید. برای iOS، فریم‌ورک را روی مک بسازید:

```bash
cd mobile
./gradlew :composeApp:linkDebugFrameworkIosSimulatorArm64
```

سپس یک اپ Xcode بسازید که از `MainViewController()` متعلق به `ComposeApp`
استفاده کند. ساخت iOS نیاز به امضای اپل دارد و فایل خام قابل توزیع نیست، بنابراین
هیچ باینری آمادهٔ iOS ارائه نمی‌شود — آن را روی مک برای App Store بسازید.

### به‌روزرسانی

```bash
git pull
./scripts/configure-docker.sh      # فقط اگر محیط تغییر کرده باشد
docker compose up -d --build
```

نصب مستقیم:

```bash
git pull
./install.sh
```

مهاجرت‌های پایگاه داده فقط رو به جلو هستند و به‌صورت خودکار در نخستین درخواست
اجرا می‌شوند.

### مجوز

این پروژه **source-available** است، نه open-source. شما می‌توانید آزادانه **از
آن استفاده کنید و خودتان میزبانی کنید** — از جمله به‌صورت تجاری برای خودتان یا
مشتریان‌تان — و برای **استفادهٔ خصوصی داخلی** آن را تغییر دهید.

اما **مجاز نیستید**:

- نرم‌افزار یا بخش مهمی از آن را کپی، توزیع، منتشر یا زیرمجوز دهید؛
- نرم‌افزار یا مشتقات آن را به‌عنوان محصول بفروشید، دوباره بفروشید، اجاره دهید یا
  بهره‌برداری تجاری کنید؛
- آن را فورک کنید و با نام/برند دیگر منتشر کنید، یا با تغییرات جزئی بفروشید؛
- آن را به‌عنوان سرویس میزبانی‌شده/مدیریت‌شده یا در قالب بستهٔ قالب/پوستهٔ
  پرداختی عرضه کنید.

برای توزیع مجدد، فروش مجدد یا white-label نیاز به مجوز تجاری جداگانه است. متن
کامل در فایل [LICENSE](LICENSE) آمده است.

### ساختار پروژه

```
app/            مسیرهای Next.js (استودیو، فروشگاه، API، احراز هویت)
components/     رابط React (استودیو، فروشگاه، بلوک‌ها)
lib/            منطق اصلی (db، auth، posts، comments، mail، theme، shop، seo…)
mobile/         اپ Kotlin Multiplatform (androidMain / iosMain / commonMain)
vendor/         سرور مرجع صدور لایسنس + ابزار بسته‌بندی (بدون کلید خصوصی)
public/         دارایی‌های برند (فرانت‌اندهای ساخته‌شده در git نیستند)
scripts/        ابزار نصب، دیمن ایمیل، تست‌های smoke
install.sh      نصب‌کنندهٔ مستقیم
compose.yaml    پشتهٔ مستقل Docker (PostgreSQL همراه، پورت وب و ایمیل روی میزبان)
compose.coolify.yaml        پشتهٔ Docker Compose برای Coolify (بدون پورت وب/ایمیل روی میزبان)
compose.external-db.yaml    پشتهٔ فقط‌اپ برای PostgreSQL موجود
Dockerfile      ایمیج چندمرحله‌ای تولید
```

---

Copyright © 2026 Rayomand Technology. All rights reserved.
