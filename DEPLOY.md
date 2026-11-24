# Deploying Rayomand CMS

Three ways to run this in production. All of them run the **same** process
model: a Next.js server plus the built-in mail engine, under one parent
(`scripts/serve.ts`), so the site and mail start and stop together.

There is no external SMTP relay to configure. The CMS sends application email
from a mailbox that lives inside it.

**There is exactly one user-facing database setting:** `DATABASE_URL`, in the
form `postgresql://USER:PASSWORD@HOST:PORT/DATABASE`. Set it in uppercase,
exactly as written. Split `POSTGRES_DB` / `POSTGRES_USER` / `POSTGRES_PASSWORD` /
`POSTGRES_PORT` values are legacy: the scripts convert them automatically, but
do not add them by hand. Inside the bundled Docker stack, the official postgres
`*_FILE` variables are implementation detail, not user inputs.

- [Option A — bare metal / VPS with systemd](#option-a--bare-metal--vps-with-systemd)
- [Option B — Docker Compose](#option-b--docker-compose)
- [Option C — Coolify](#option-c--coolify)
- [Secrets and the setup token](#secrets-and-the-setup-token)
- [Mail engine: what runs, and what it needs](#mail-engine-what-runs-and-what-it-needs)
- [Updating](#updating)
- [Troubleshooting](#troubleshooting)

---

## Option A — bare metal / VPS with systemd

Requirements: Linux, Node 18+, and root (or sudo). PostgreSQL 14+ is installed by
the provisioning script when it is missing.

```bash
git clone https://github.com/ssina-saint-Born/rayomand-cms.git /opt/rayomand
cd /opt/rayomand

sudo bash scripts/provision-postgres.sh
sudo env WEB_PORT=3131 bash ./install.sh --yes
```

`scripts/provision-postgres.sh`:

- exits quietly if `DATABASE_URL` is already present in `.env`;
- installs PostgreSQL 14+ from apt, dnf, yum or apk when no server is available,
  starts it, and refuses to continue if the installed version is older than 14;
- creates a dedicated `rayomand` role and database (idempotently, and it resets
  the role password on rerun);
- writes `DATABASE_URL=postgresql://rayomand:<password>@127.0.0.1:<port>/rayomand`
  plus independent `SETUP_TOKEN` and `MAIL_SESSION_SECRET` values into `.env`.

If PostgreSQL already exists, skip that script and either export the URL or let
the installer ask:

```bash
DATABASE_URL=postgresql://user:password@127.0.0.1:5432/rayomand ./install.sh --yes
```

The installer walks through:

1. **Preflight** — checks Node, npm, database URL validity, write access, that
   the web port is free, and whether outbound port 25 is reachable. A busy port
   25 or blocked outbound 25 is a *warning*: the site still runs and local
   mailboxes still work; only external delivery is affected.
2. **Configuration** — requires one `DATABASE_URL`, normalizes legacy split
   fields into that URL, preserves existing secrets, generates `SETUP_TOKEN` and
   `MAIL_SESSION_SECRET` when missing, and writes `.env` with mode `600`.
3. **Dependencies + build** — `npm ci` and `npm run build`.
4. **Database** — verifies reachability. Schema migrations run on the first HTTP
   request, so an operator who starts PostgreSQL afterwards is fine.
5. **Service** — installs `/etc/systemd/system/rayomand.service` running
   `scripts/serve.ts` as the invoking user, with `AmbientCapabilities=CAP_NET_BIND_SERVICE`
   so the mail daemon can bind 25/143/110 without running as root.

Remove the service but keep data:

```bash
./install.sh --uninstall
```

### After install

1. Open `http://<server>:3131`.
2. Paste the `SETUP_TOKEN` from `.env` to create the owner account.
3. **Studio → Mail** → add your domain, then create the `no-reply` mailbox
   (the screen has a one-click "set up system mailbox" button).
4. Publish the MX, SPF and DKIM records the Mail screen shows at your DNS host.

Logs:

```bash
sudo journalctl -u rayomand -f
```

Bare-metal data persists under the install directory: `data/` (mail and logs),
`public/uploads/`, `public/downloads/` and `public/frontends/`.

---

## Option B — Docker Compose

`compose.yaml` is the normal standalone stack: the app plus a bundled
PostgreSQL container, with host mappings for the web port and the mail ports.

```bash
cp .env.example .env
./scripts/configure-docker.sh          # or: bash scripts/configure-docker.sh
docker compose up -d --build
```

`scripts/configure-docker.sh`:

- writes the single `DATABASE_URL` (replacing the example placeholder with a
  freshly generated password the first time);
- converts any legacy `POSTGRES_*` entries and removes them;
- generates `SETUP_TOKEN` and `MAIL_SESSION_SECRET` independently if absent;
- optionally sets `WEB_PORT` via `--web-port PORT` (default 3131, validated as
  1–65535);
- is idempotent — rerunning keeps the existing URL and secrets.

Open `http://localhost:3131` and paste `SETUP_TOKEN`.

For an existing PostgreSQL server, use the app-only file instead:

```bash
cp .env.example .env
# set DATABASE_URL to that server, then add the two secrets
docker compose -f compose.external-db.yaml up -d --build
```

Notes:

- The app container is granted **only** `NET_BIND_SERVICE` so the mail daemon can
  bind privileged ports. It runs as an unprivileged user, with `NoNewPrivileges`
  and a read-only system in the bare-metal unit; the container relies on the
  non-root user instead.
- `compose.yaml` and `compose.external-db.yaml` publish host ports
  25/587/465/143/993/110/995 and the web port. Inbound mail from the internet
  needs port 25 reachable; if another mail server on the host already owns it,
  the stack still runs, but external inbound SMTP to Rayomand is unreachable
  until you decide which server owns that port (see Option C).
- Named volumes keep PostgreSQL data (`pgdata`), `frontends`, `uploads`,
  `downloads` and app data (`appdata`, which holds mail and logs) across
  rebuilds.

---

## Option C — Coolify

Use Coolify's **Docker Compose** build pack in **normal** mode — not Raw
Compose, because Coolify must add the Traefik labels for HTTPS.

1. New resource → **Docker Compose** (from the public Git repository
   `https://github.com/ssina-saint-Born/rayomand-cms`).
2. **Base Directory:** `/`
3. **Compose location:** `/compose.coolify.yaml`
4. **Domain** — set it on service `app` and include the internal port:
   `https://cms.example.com:3131`. Coolify's Compose path assumes port 80 when
   the domain has no port, which routes to nothing and shows a self-signed
   certificate plus "no available server". The app also listens on port 80 as a
   fallback (`WEB_ALIAS_PORT`), so `https://cms.example.com` works too, but
   naming `:3131` is the unambiguous choice.
5. Environment variables — only these three are required:

   | Variable | Value |
   | --- | --- |
   | `DATABASE_URL` | `postgresql://rayomand:<password>@postgres:5432/rayomand` |
   | `SETUP_TOKEN` | `openssl rand -hex 32` |
   | `MAIL_SESSION_SECRET` | a second, separate `openssl rand -hex 32` |

   Generate both secrets with `openssl rand -hex 32` and never reuse one value
   for the other. The database host is the Compose service name `postgres`; the
   bundled stack ignores any other host in the URL and still connects to its own
   `postgres` service with the same credentials, so a Coolify-generated or
   external hostname will not break the deployment. Use
   `compose.external-db.yaml` to target an external database on purpose.
6. Deploy. Open the generated HTTPS domain and paste `SETUP_TOKEN` to create the
   owner.

`compose.coolify.yaml` bundles PostgreSQL and publishes **no** host web or mail
ports; Traefik reaches `app:3131` over the internal network, so HTTPS is handled
at the proxy. Named volumes (`pgdata`, `frontends`, `uploads`, `downloads`,
`appdata`) persist database, frontend, upload, download and mail/app data across
redeploys.

`app` is the first service in the file on purpose: Coolify attaches a domain to
the first service when none is selected, and the one-shot `postgres-init` exits
immediately, which would produce a self-signed certificate and "no available
server".

### If the domain shows "no available server" or an untrusted certificate

1. Open the resource → **Domains** and confirm the domain is on service `app`
   with port `3131` (`https://host:3131`).
2. Confirm the certificate in the browser is issued to your hostname, not
   `TRAEFIK DEFAULT CERT`. A self-signed default certificate means Traefik has no
   router for that host yet.
3. Server → Proxy → **Restart Proxy** after changing domains or the Compose file.
4. For Cloudflare, keep SSL/TLS mode on **Full (strict)**. "Flexible" makes
   Cloudflare talk HTTP to port 443 and is a common cause of this error.


### Automatic deploys

In Coolify, enable the webhook for the application and add it under the GitHub
repository's webhook settings. Public repositories need no GitHub Actions
workflow. After that, each push to `main` triggers a redeploy.

### Coexisting with Stalwart on the same host

If Stalwart already runs in Coolify, host ports 25 and the other mail ports are
open and owned by Stalwart — that arrangement is fine and nothing needs to be
stopped. `compose.coolify.yaml` publishes no host mail ports, so it cannot
collide with Stalwart: the Rayomand web UI, webmail client and **outbound** mail
work inside its own isolated container network.

**External inbound SMTP/IMAP to Rayomand will not be reachable** in that setup.
That is a deliberate routing decision, not a defect. If you want Rayomand to own
inbound mail for a domain, decide explicitly which mail server owns each public
port plus the matching DNS/MX records; two servers cannot bind the same host
IP:port. Choose one owner per port and point the domain's MX at it.

---

## Secrets and the setup token

| Variable | What it is | Lifetime |
| --- | --- | --- |
| `DATABASE_URL` | PostgreSQL connection URL; it contains the database password, so treat it as sensitive | Permanent |
| `SETUP_TOKEN` | One-time bootstrap secret checked only by `/api/auth/setup` while no CMS user exists | Until the first owner is created |
| `MAIL_SESSION_SECRET` | Signs webmail session cookies and is the primary key for encrypted at-rest mail settings | Permanent; private and unchanged |
| `MAIL_SECRET_KEY` | Optional advanced override for at-rest mail encryption only | Optional |

`SETUP_TOKEN` is **not** a login token, database password, mobile bearer token,
or GitHub PAT. It only creates the first owner. Once an owner exists it no longer
grants access. Compose still requires it to be non-empty, so keep a private
random 64-hex-character value and never reuse it for anything else.

`MAIL_SESSION_SECRET` must stay the same. Rotating it invalidates webmail
sessions and can make stored mail secrets unreadable unless they are re-entered.
Do not reuse these values for each other.

---

## Mail engine: what runs, and what it needs

`scripts/serve.ts` starts:

| Service | Default port | Purpose |
| --- | --- | --- |
| Web (Next.js) | 3131 | Admin, storefront, webmail, public API |
| SMTP inbound | 25 | Receives mail for your domains |
| Submission | 587 | Authenticated send from webmail |
| SMTPS | 465 | Implicit TLS submission |
| IMAP / IMAPS | 143 / 993 | Webmail and any IMAP client |
| POP3 / POP3S | 110 / 995 | POP3 clients |

Ports are overridable with the `MAIL_*_PORT` variables in `.env`; change the
internal port and any Compose host mapping together.

**DNS you must publish** (shown in Studio → Mail):

- `MX` → your server, for each hosted domain.
- `SPF`: `v=spf1 a mx -all` (or `~all` while testing).
- `DKIM`: the TXT record the Mail screen generates.
- `DMARC`: start with `p=none` and tighten after a week of clean reports.
- A `PTR` (reverse DNS) record matching your hostname — Gmail rejects mail
  whose HELO name does not resolve back to the sending IP.

TLS certificates for SMTP/IMAP are obtained automatically (ACME DNS-01) once a
domain is added; set the DNS provider credentials in Studio → Mail → TLS.

---

## Updating

Docker:

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

Migrations are forward-only and run on first request; there is no separate
migrate step. `npm run db:setup` (`setup-database.mjs`) also reads only
`DATABASE_URL`, migrates legacy split fields, and verifies reachability.

---

## Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| Site loads, mail never arrives | Inbound 25 is not routed to Rayomand (another mail server owns it, or `compose.coolify.yaml` publishes no mail ports), or a missing MX record |
| Mail to Gmail only fails | Missing/incorrect PTR, SPF, or DKIM |
| "Outbound 25 blocked" in installer | Ask your provider to enable port 25 |
| Service exits immediately | `journalctl -u rayomand` shows the error; often a bad `DATABASE_URL` |
| "DATABASE_URL is not a valid URL" | Use the full `postgresql://USER:PASSWORD@HOST:PORT/DATABASE` form |
| Setup page says already configured | A user exists; sign in instead of setting up again |
