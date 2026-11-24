# Deploying Rayomand CMS

Two supported ways to run this in production. Both run the **same** process
model: a Next.js server plus the built-in mail engine, under one parent
(`scripts/serve.ts`) so the site and mail start and stop together.

There is no external SMTP relay to configure. The CMS sends application email
from a mailbox that lives inside it.

---

## Option A — bare metal / VPS with systemd (recommended)

Requirements: Linux, Node 18+, PostgreSQL 14+ installed and running, root (or
sudo) for the service unit.

```bash
git clone <your-repo> /opt/rayomand
cd /opt/rayomand
./install.sh
```

The installer walks through:

1. **Preflight** — checks Node, npm, PostgreSQL, write access, that the web port
   and mail ports are free, and whether outbound port 25 is reachable.
   Port 25 blocked is a *warning*, not a failure: local mailboxes still work;
   only delivery to Gmail/Outlook is affected until your host unblocks it.
2. **Configuration** — writes `.env` with a random database password and a
   setup token (printed once). File mode is `600`.
3. **Dependencies + build** — `npm ci` and `npm run build`.
4. **Database** — verifies reachability. Schema migrations run on the first
   HTTP request, so an operator who starts PostgreSQL afterwards is fine.
5. **Service** — installs `/etc/systemd/system/rayomand.service` running
   `scripts/serve.ts` as the invoking user, with `AmbientCapabilities=CAP_NET_BIND_SERVICE`
   so the mail daemon can bind 25/143/110 without running as root.

Non-interactive install (CI, images):

```bash
./install.sh --yes
```

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

---

## Option B — Docker Compose

Two containers: PostgreSQL and the app. No external relay.

```bash
cp .env.example .env
# set POSTGRES_PASSWORD and SETUP_TOKEN in .env (openssl rand -hex 32)
docker compose up -d --build
```

Open `http://localhost:3131` and paste `SETUP_TOKEN`.

Notes:

- The app container is granted **only** `NET_BIND_SERVICE` so the mail daemon can
  bind privileged ports. It runs as an unprivileged user, with `NoNewPrivileges`
  and a read-only system in the bare-metal unit; the container relies on the
  non-root user instead.
- Inbound mail needs port 25 reachable from the internet. If a host MTA
  (postfix/exim) already owns 25 on the host, stop it or change the mapping.
- Frontend packages installed from a vendor persist in the `frontends` volume.

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

Ports are overridable with the `MAIL_*_PORT` variables in `.env`.

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

```bash
git pull
./install.sh          # rebuilds and restarts the service
```

Migrations are forward-only and run on first request; there is no separate
migrate step.

---

## Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| Site loads, mail never arrives | Port 25 blocked by the host, or missing MX record |
| Mail to Gmail only fails | Missing/incorrect PTR, SPF, or DKIM |
| "Outbound 25 blocked" in installer | Ask your provider to enable port 25 |
| Service exits immediately | `journalctl -u rayomand` shows the error; often a bad `DATABASE_URL` |
| Setup page says already configured | A user exists; sign in instead of setting up again |
