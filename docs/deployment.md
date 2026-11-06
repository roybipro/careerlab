# Deploying CareerLab

This guide puts CareerLab on the internet with three hosted services. You do each step yourself
in your own browser.

| Part | Service | What it runs |
|---|---|---|
| Database | [Neon](https://neon.com) | PostgreSQL |
| API | [Render](https://render.com) | The FastAPI backend, built from `backend/Dockerfile` |
| Website | [Vercel](https://vercel.com) | The Next.js frontend, which forwards `/api/v1/*` to Render |

```
Browser --> Vercel (Next.js) --/api/v1/*--> Render (FastAPI) --> Neon (Postgres)
```

The browser only ever talks to the Vercel address. Vercel forwards API calls to Render, so the
session cookie belongs to the Vercel address and stays first-party.

**Secrets go only into these three sites' own forms.** The database password, the connection
string and `JWT_SECRET` are never typed into the repo, a chat, an issue or a pull request. This
repository is public. `render.yaml` holds no secrets: it names the settings and Render asks you
for the values.

**Order matters.** Each step produces a value the next one needs:

1. Neon gives you the database connection string.
2. Render needs that string, and gives you the API address.
3. Vercel needs the API address, and gives you the website address.
4. Render then needs the website address (`FRONTEND_ORIGIN`), so you go back once and set it.

Keep a scratch note open and write each value down as you go. Do not save it in the repo.

## What it costs

Prices and free allowances change, so check the current pricing pages before you start, and do
not assume a free tier stays free. At the time this was written the vendors' own pages said:

- Render: free web services spin down after 15 minutes without traffic, and each workspace gets
  750 free instance hours per calendar month ([Render free tier docs](https://render.com/docs/free)).
- Neon: the Free plan includes 1 GB of storage per project, 100 compute-hours per project per
  month, and computes suspend after 5 minutes of inactivity
  ([Neon plans](https://neon.com/docs/introduction/plans)).
- Vercel: the Hobby plan includes a fixed amount of usage per resource
  ([Vercel pricing](https://vercel.com/docs/pricing)). Read Vercel's current plan terms for what
  Hobby may be used for.

Current pricing: <https://render.com/pricing>, <https://neon.com/pricing>,
<https://vercel.com/pricing>.

## 1. Neon: create the database

1. Sign up or sign in at <https://console.neon.tech>.
2. Click **Create project** (or **New project**). Give it a name such as `careerlab`. Choose a
   region close to where you will put the Render service (for example AWS US West for Render's
   Oregon). Keep the default Postgres version and click **Create**.
3. When the project opens, click **Connect** in the top navigation. A **Connect to your branch**
   dialog opens.
4. Pick the default branch, the default role and the default database.
5. **Turn the Connection pooling toggle off.** Use the direct host for this app. CareerLab runs
   as one API instance with its own connection pool, and Neon's own guidance reserves the pooled
   endpoint for serverless functions that open many short-lived connections
   ([Neon connection pooling](https://neon.com/docs/connect/connection-pooling)). The pooled
   address has `-pooler` in the host name. Yours must not.
6. Copy the connection string. It looks like this (these are not real values):

   ```
   postgresql://USER:PASSWORD@ep-cool-darkness-123456.us-east-2.aws.neon.tech/DBNAME?sslmode=require
   ```

   Check it: the host has **no** `-pooler`, and it ends with `?sslmode=require`.
7. **Change the start to `postgresql+psycopg://`.** CareerLab names its driver explicitly (the
   `.env.example` file shows the same form). The value you will give Render is:

   ```
   postgresql+psycopg://USER:PASSWORD@ep-cool-darkness-123456.us-east-2.aws.neon.tech/DBNAME?sslmode=require
   ```

   If the password contains characters such as `@`, `/` or `#`, leave it exactly as Neon wrote
   it. Neon already escapes them in the string it shows. If the string also ends with
   `&channel_binding=require`, keep it.

You now have the value for `DATABASE_URL`. Neon suspends an idle database after 5 minutes on the
Free plan, so the first query after a pause adds a short delay (the app retries connections with
`pool_pre_ping`).

You do not create tables yourself. The API runs `alembic upgrade head` every time it starts.

## 2. Render: deploy the API

The repository's `render.yaml` describes the service, so you create it from a Blueprint.

1. Sign up or sign in at <https://dashboard.render.com>. Connect your GitHub account when asked,
   and allow access to the CareerLab repository (your fork or copy of it).
2. Click **New** and choose **Blueprint**.
3. Pick the repository and the branch to deploy (usually `main`). Render finds `render.yaml` at
   the repo root and shows one service, `careerlab-api`, on the **Free** plan.
4. Render asks for the values marked `sync: false`. Enter them in Render's form:

   | Setting | Value |
   |---|---|
   | `DATABASE_URL` | The `postgresql+psycopg://...` string from Neon step 7 |
   | `FRONTEND_ORIGIN` | Not known yet. Put a placeholder such as `https://example.com` and fix it in step 4 below |

   Render generates `JWT_SECRET` itself (`generateValue: true`, a random 256-bit value, which is
   44 characters, above the 32 the API requires) and fills the rest from the file:
   `COOKIE_SECURE=true`, `TRUST_PROXY=true`, `MAX_CONCURRENT_HASHES=2`. You never see or type the
   secret. See the [Blueprint spec](https://render.com/docs/blueprint-spec).
5. Click **Apply** (or **Deploy Blueprint**). Render builds `backend/Dockerfile` with
   `backend/` as the context, which takes a few minutes the first time.
6. Open the service, then its **Logs** tab. A good start shows the Alembic migrations running and
   then Uvicorn listening. Render gives the service an address at the top of its page, such as
   `https://careerlab-api-xxxx.onrender.com`. Copy it. This is your **Render URL**.
7. Check it works:
   - `https://<render-url>/health` returns `{"status":"ok"}`.
   - `https://<render-url>/docs` shows Swagger.

How the container starts: it runs `alembic upgrade head` and then `uvicorn` on `${PORT:-8000}`.
Render sets `PORT` (10000 by default, see
[Render environment variables](https://render.com/docs/environment-variables)) and requires the
service to listen on `0.0.0.0` ([Render web services](https://render.com/docs/web-services)). The
Dockerfile already does both, so you set nothing.

### If `DATABASE_URL` is missing or wrong

The API refuses to start and Render marks the deploy as failed. Open **Logs**. You will see one
of these near the end of the output:

- Not set at all: `ValidationError: 1 validation error for Settings`, then `DATABASE_URL`, then
  `Field required`.
- Set but blank: `DATABASE_URL is empty. Set it to your Postgres connection string...`
- Set to something that is not a URL: `Could not parse SQLAlchemy URL from given URL string`.
- A wrong host, user or password: `psycopg.OperationalError` with the server's message (for
  example `password authentication failed` or `could not translate host name`). Check you copied
  the whole string and did not change the host.

Fix the value under **Environment** in the service's page and Render redeploys. The same goes for
`JWT_SECRET` if you ever overwrite it with a short value: the error says it must be at least 32
characters.

Memory: Render's Blueprint spec lists the free plan as 0.1 CPU and 512 MB
([spec](https://render.com/docs/blueprint-spec)). One Argon2 hash uses about 64 MiB, so the
default of 4 at once could use about 260 MiB on top of Python itself. `render.yaml` sets
`MAX_CONCURRENT_HASHES=2` (about 130 MiB at peak). A request that cannot get a slot within 2
seconds gets a `429` and can simply be retried.

## 3. Vercel: deploy the website

1. Sign up or sign in at <https://vercel.com>. Connect your GitHub account when asked.
2. Click **Add New...** and choose **Project**. Next to the CareerLab repository click **Import**.
3. On the configuration screen, next to **Root Directory**, click **Edit** and choose
   **`frontend`** ([Vercel monorepos](https://vercel.com/docs/monorepos)). The repository is a
   monorepo and the Next.js app lives in that folder. Vercel should then detect **Next.js** as the
   framework. Leave the build and install commands on their defaults.
4. Open **Environment Variables** on the same screen and add one:

   | Name | Value |
   |---|---|
   | `API_URL` | Your Render URL, for example `https://careerlab-api-xxxx.onrender.com`, with no trailing slash and no path |

5. Click **Deploy**.

**`API_URL` is read when the site is built, not while it runs.** Next.js writes the
`/api/v1/*` forwarding rule into the build. If you change `API_URL` later (a new Render address,
for example), the old build keeps pointing at the old address until you redeploy: open the
project's **Deployments** tab, open the menu on the latest deployment and click **Redeploy**.
A build without `API_URL` fails on purpose, so you cannot ship a site that forwards to nothing.

When the deploy finishes, Vercel shows your address, such as `https://careerlab.vercel.app`.
Copy it. This is your **Vercel URL**.

### Tell the API about the website

Go back to Render, open the `careerlab-api` service, **Environment**, and set `FRONTEND_ORIGIN`
to the **Vercel URL**: scheme and host only, with no trailing slash, for example
`https://careerlab.vercel.app`. Save. Render redeploys. The API uses it for CORS, so it must match
the address people open in the browser exactly. If you later add a custom domain, update it.

## 4. Verify the deployment

Replace `WEB` with your Vercel URL and `API` with your Render URL.

- [ ] **HTTPS.** `https://WEB` loads over HTTPS (padlock) and the register page opens.
- [ ] **Health and docs.** `curl -s https://API/health` returns `{"status":"ok"}` and
  `https://API/docs` loads.
- [ ] **Migrations ran.** The Render logs show the Alembic upgrade. Registering an account in the
  next step would fail with a server error if the tables were missing.
- [ ] **Register and sign in** at `https://WEB/register` with a throwaway account (an address at
  `example.com` works, for example `deploy-check@example.com`; it is never emailed). You land on
  the dashboard.
- [ ] **Session cookie.** In the browser's developer tools (**Application** or **Storage** tab,
  **Cookies**), the cookie `careerlab_session` for the Vercel host has **HttpOnly** and **Secure**
  ticked, and `SameSite` is `Lax`.
- [ ] **Records are private.** In one browser window, create a job and a contact. In a private
  window register a second account. Its dashboard and lists are empty, and opening the first
  account's record URL (`/jobs/<id>`) shows not found rather than the data.
- [ ] **Waking from sleep.** Leave the API untouched for more than 15 minutes (the Render free
  tier then spins down), then open `https://WEB/dashboard`. The first load can take about a
  minute. The page shows its slow-start hint and, if a request fails, a **Retry** button. A later
  load is fast. ([Render free tier](https://render.com/docs/free).)
- [ ] **A `429` through the proxy.** Login is limited to 10 attempts per minute per IP (and 5 per
  email address). Run this against the **Vercel** address, which goes through the proxy:

  ```bash
  for i in $(seq 1 12); do
    curl -s -o /dev/null -w "%{http_code}\n" -X POST https://WEB/api/v1/auth/login \
      -H 'Content-Type: application/json' -H 'X-Requested-With: CareerLab' \
      -d "{\"email\":\"nobody$i@example.com\",\"password\":\"not-a-real-password\"}"
  done
  ```

  The first answers are `401` and then you see `429`. (Wait a minute before using the app from
  the same network again.)
- [ ] **Two client IPs get separate limits.** `TRUST_PROXY=true` makes the API key its limits on
  the first address in `X-Forwarded-For`. Vercel overwrites that header with the real client
  address ([Vercel request headers](https://vercel.com/docs/headers/request-headers)). The
  documents I could check do not say how Render treats a header that arrives already filled
  in, so confirm it in practice: run the loop above from your home network until it returns `429`,
  then immediately run it from a different network, such as a phone on mobile data with Wi-Fi off.
  The second network should start again at `401`. If it also gets `429` straight away, every
  visitor shares one limit: the API is seeing the proxy's address, so check `TRUST_PROXY` is
  `true` on Render and report it.
- [ ] **Swagger login and a mutation on the Render host.** Open `https://API/docs` (the Render
  address, not the Vercel one). Run `POST /api/v1/auth/login` with **Try it out** and your
  throwaway account, then `POST /api/v1/jobs` with a body such as
  `{"company_name": "Acme", "position_title": "Dev"}`. Swagger sends `X-Requested-With: CareerLab`
  for you, so it returns `201`. See [docs/api.md](api.md).

## 5. Optional: run the end-to-end tests against the public site

The Playwright suite can run against the deployed site instead of a local stack:

```bash
cd frontend
npm ci
npx playwright install chromium
PLAYWRIGHT_BASE_URL=https://WEB npm run test:e2e
```

Know what this does before you run it:

- Every test registers its own user, so one run creates **many accounts** in your production
  database. Registration is limited to **5 per minute per IP** (and 30 per minute overall), and
  the suite registers faster than that from one machine, so with the production limit a run is
  expected to hit `429` and fail partway. Do not raise the limit on the live service just for
  testing. Run a smaller part of the suite instead (for example one spec file, such as
  `npx playwright test e2e/isolation.spec.ts --project=desktop`), wait a minute between runs, and expect the first
  request to be slow if the API was asleep. The stricter, repeatable way to run the whole suite
  is the local Compose stack, as described in the README.
- The test accounts are left behind. Their addresses look like `e2e-<letters>@example.com`.
- The free API may be asleep, so start with a visit to `https://WEB` and wait for it to load.

To delete the leftover accounts, open the Neon console, pick your project, open **SQL Editor**
and run:

```sql
DELETE FROM users WHERE email LIKE 'e2e-%@example.com';
```

Deleting a user also deletes all of that user's records (the foreign keys cascade). Check what
would go first with `SELECT email FROM users WHERE email LIKE 'e2e-%@example.com';`. Deletes are
permanent. Your own account is not matched unless its address starts with `e2e-`.

## Demo data

Do not load demo data into the production database unless you decide to. The seed script
(`backend/scripts/seed_demo.py`) refuses any database host other than `localhost` or the Compose
host `db`. Pass `--allow-remote` only if you really want it in the live database: you would run
it from your own machine with `DATABASE_URL` set to the Neon string and `DEMO_PASSWORD` set to a
password you choose, and the account `demo@example.com` would then be a public, guessable
address on a live site. Prefer a locally seeded stack for screenshots (see the README).

## Changing things later

| You change | Do this |
|---|---|
| The Render URL | Set the new `API_URL` on Vercel, then **Redeploy** (it is read at build time) |
| The Vercel URL or add a custom domain | Update `FRONTEND_ORIGIN` on Render |
| `DATABASE_URL` | Update it on Render **Environment**; Render redeploys |
| The code | Push to the branch Render and Vercel watch; both redeploy automatically |
| `render.yaml` | Render only reads secrets (`sync: false`) when the Blueprint is first created. After that, edit new secret variables in the service's **Environment** page by hand ([Blueprint spec](https://render.com/docs/blueprint-spec)) |

## Known limits of this setup

- Rate-limit counters live in memory, so they reset when the free API restarts or sleeps, and
  they only work with one API instance. Render's free plan runs one instance.
- The API's own address (`onrender.com`) stays reachable, so someone who calls it directly can set
  `X-Forwarded-For` themselves. The cap on concurrent password hashes (`MAX_CONCURRENT_HASHES`)
  exists to bound that, but treat the per-IP limits as a courtesy, not a security boundary.
- Free plans can change. See "What it costs".
