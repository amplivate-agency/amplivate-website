# Amplivate

Astro site with Decap CMS, deployed to GitHub Pages.

## Commands

| Command           | Action                                      |
| :----------------- | :------------------------------------------ |
| `npm install`       | Install dependencies                        |
| `npm run dev`       | Start local dev server at `localhost:4321`  |
| `npm run build`     | Build production site to `./dist/`          |
| `npm run preview`   | Preview the build locally                   |
| `npx astro check`   | Type-check the project                      |

## Content

Repeatable content (services, pricing tiers, add-ons, work, testimonials, FAQs) lives as
JSON files in `src/data/`, loaded through Astro Content Collections (`src/content.config.ts`).
Singleton page copy (home, about, site settings) is also in `src/data/` as plain JSON,
imported directly.

Decap CMS (`public/admin/config.yml`) edits the same files directly — there's no separate
CMS-only content store to keep in sync.

## Still to do before this goes live

1. **Create the GitHub repo** and push this project to it.
2. **Update `public/admin/config.yml`** — swap `YOUR_GITHUB_USERNAME/amplivate-website` for
   the real repo, and `base_url` once the OAuth worker (step 4) is deployed.
3. **Update `astro.config.mjs`** — set `site` to the real domain (and add a `base` path if
   deploying to a GitHub Pages project page without a custom domain).
4. **Deploy the Decap OAuth proxy** (`cms-oauth-worker/`) to Cloudflare Workers:
   - Register a GitHub OAuth App (Settings → Developer settings → OAuth Apps) with its
     callback URL set to `https://<your-worker-subdomain>.workers.dev/callback`.
   - `cd cms-oauth-worker && wrangler deploy`
   - `wrangler secret put GITHUB_CLIENT_ID` / `wrangler secret put GITHUB_CLIENT_SECRET`
   - Optionally set `ALLOWED_ORIGIN` to the live site's domain for tighter security.
5. **Enable GitHub Pages** on the repo (Settings → Pages → Source: GitHub Actions) — the
   workflow in `.github/workflows/deploy.yml` builds and deploys on every push to `main`.
6. **Deploy the contact form worker** (`contact-form-worker/`) — see "Contact form setup"
   below for the full walkthrough, including the domain/email prerequisites.
7. **Legal review** — `src/pages/privacy.astro` and `terms.astro` are drafted structures
   with bracketed placeholders, not legal advice. Get them reviewed before launch.
8. **Logo** — `public/images/logo.webp` is a flat raster mark. Fine for now; a true SVG
   version would scale better at very small sizes (favicon).

## Contact form setup

The form (and "Book a Free Strategy Call") emails submissions to you via
`contact-form-worker/`. This is free — see the note in that folder's `worker.js` — but
only because it always sends to one fixed, *verified* address rather than arbitrary
recipients.

**Prerequisite: your domain needs to be on Cloudflare.** Email Sending's domain
onboarding (the `notifications@amplivate.co.uk` sender) requires DNS records added to a
Cloudflare-managed zone. If `amplivate.co.uk` isn't already using Cloudflare DNS,
point its nameservers there first (free) — you can still host the site itself on GitHub
Pages via a CNAME record, Cloudflare here is only handling DNS/email.

1. `npx wrangler email sending enable amplivate.co.uk` — adds SPF/DKIM records, takes
   5–15 minutes to propagate. Confirm with `npx wrangler email sending dns get amplivate.co.uk`.
2. `npx wrangler email routing addresses create you@your-real-inbox.com` — adds and
   verifies the address that will actually receive enquiries. You'll get a confirmation
   email to click.
3. `cd contact-form-worker && wrangler deploy`
4. Update the vars either in `wrangler.toml` or via `wrangler secret put`:
   - `FROM_EMAIL` — e.g. `notifications@amplivate.co.uk` (the onboarded domain)
   - `TO_EMAIL` — the address you verified in step 2
   - `ALLOWED_ORIGIN` — the live site's real domain, once known
5. Update `WORKER_URL` in `src/pages/contact.astro`'s `<script>` to the deployed
   `*.workers.dev` URL from step 3.
6. Send a real test submission through the live form before calling this done.
