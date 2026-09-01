# Chaos Cartel — Railway Deployment Guide

The app is **PostgreSQL-native**. Locally it runs against Docker Compose (or any Postgres); on Railway it uses the managed Postgres plugin. Stripe auto-switches from **preview mode** to **LIVE** the moment `STRIPE_SECRET_KEY` is set.

---

## 1. Local dev (Docker Compose)

```bash
git clone <your-repo> chaos-cartel && cd chaos-cartel

# Start Postgres in the background
docker compose up -d

# Copy env and install
cp .env.example .env
npm install

# Boot the app — it will auto-create tables and seed on first run
npm run dev
```

Visit http://localhost:5000. Login to admin at `/#/admin/login` with `admin` / `chaoscartel`.

Everything works in **preview mode** (fake Stripe checkout) until you set `STRIPE_SECRET_KEY` in `.env`.

To wipe and start fresh: `docker compose down -v && docker compose up -d`.

---

## 2. Push to GitHub

```bash
cd chaos-cartel
git init
git add -A
git commit -m "Initial Chaos Cartel commit"
gh repo create chaos-cartel --public --source=. --push
# or manually: git remote add origin git@github.com:you/chaos-cartel.git && git push -u origin main
```

---

## 3. Deploy to Railway

1. Go to https://railway.app → **New Project → Deploy from GitHub repo** → pick `chaos-cartel`.
2. On the service, click **+ Add → Database → PostgreSQL**. Railway automatically injects `DATABASE_URL` into your service.
3. Under **Variables**, add:

   | Variable                | Value                                             |
   | ----------------------- | ------------------------------------------------- |
   | `NODE_ENV`              | `production`                                      |
   | `SESSION_SECRET`        | any 32+ char random string                        |
   | `ADMIN_USERNAME`        | `admin` (or your choice)                          |
   | `ADMIN_PASSWORD`        | **strong password** (change from default)         |
   | `STRIPE_SECRET_KEY`     | `sk_live_...` (from Stripe → Developers → API keys) |
   | `STRIPE_PUBLISHABLE_KEY` | `pk_live_51UABJwDhVAJGC8p6f9y5QAQSLuQxw5iQQNKexRWou55msdMvhmbTrHG2VDXOb0aZH8fkZ2QOqRI8rzauHnUUwnwp001EY270Hi` |
   | `STRIPE_WEBHOOK_SECRET` | `whsec_...` (from step 4, add after first deploy) |

4. Railway builds using `railway.json` (`npm install && npm run build`, then `node dist/index.cjs`). On first boot, the app **auto-creates all tables** and seeds the 3 events, 3 products, 3 crew members, and admin user.

5. Once deployed, grab the Railway public URL (e.g. `chaos-cartel-production.up.railway.app`) and:
   - In **Stripe Dashboard → Developers → Webhooks**, add endpoint `https://<railway-url>/api/webhooks/stripe` and select events: `checkout.session.completed`.
   - Copy the resulting `whsec_...` and add it as `STRIPE_WEBHOOK_SECRET` in Railway variables. Redeploy.

---

## 4. Point ChaosCartel.net at Railway

1. In Railway → your service → **Settings → Networking → Custom Domain**. Add `chaoscartel.net` and `www.chaoscartel.net`.
2. Railway shows you a CNAME target (like `xyz.up.railway.app`).
3. In Cloudflare (your registrar):
   - `www` → CNAME → `xyz.up.railway.app` — proxy **DNS only** (grey cloud, not orange)
   - `@` (root) → Cloudflare Flattening or CNAME to same target
4. Wait 5–15 min. Railway auto-issues a Let's Encrypt cert.

---

## 5. Post-launch checklist

- [ ] Log into `/#/admin/login` with production credentials
- [ ] Confirm 3 events show on homepage
- [ ] Book a $1 spectator ticket end-to-end with a real card — money hits Stripe
- [ ] Verify `checkout.session.completed` webhook fires (Stripe Dashboard → Webhooks → recent deliveries)
- [ ] After successful test, refund it in Stripe
- [ ] Update event dates, prices, and slot counts in admin
- [ ] Upload real crew photos (or delete the "TBD Driver" / "TBD Coach" placeholders)
- [ ] Turn on Cloudflare proxy (orange cloud) for DDoS + caching once DNS is verified

---

## Data model reference

Tables auto-created by `bootstrapSchema()` on boot:

- `users` — admin login (bcrypt password)
- `events` — drift events, prices, slot counts
- `registrations` — booking + waiver + tech inspection + Stripe session
- `products` — merch items with variant JSON
- `orders` — merch orders with Stripe session
- `crew_members` — team roster

Postgres indexes are created for `events.slug`, `registrations.stripe_session_id`, `orders.stripe_session_id`, and `products.slug`.

## Troubleshooting

**Build fails on Railway** — check the deploy log for `npm run build` output. Missing env vars won't fail build (they're only needed at runtime).

**`DATABASE_URL is required` at boot** — you didn't add the Postgres plugin, or Railway didn't inject it into the service. Fix: **+ Add → Database → PostgreSQL** on the same project.

**Stripe payments succeed but ticket status stays `pending`** — the webhook is missing or wrong secret. Check Stripe Dashboard → Webhooks → recent deliveries for 4xx responses.

**Session cookie not persisting on Railway** — set `SESSION_SECRET` and redeploy. Cookies use `secure: true` in production, which requires HTTPS (Railway provides this by default).

**Change admin password** — update `ADMIN_PASSWORD` env var, restart the service, then log in with new creds. Note: this only sets the password for a **new** admin user; if `admin` already exists, delete it via `psql` first or add a UI flow.
