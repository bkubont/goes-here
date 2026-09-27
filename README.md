# Place

One place for everything: a family organizer for to-dos, groceries, bills, events, gifts, people and projects. Type or say anything into **Quick Add** and AI sorts it into the right list, date and person.

- **Frontend:** React + Vite + Tailwind (static site)
- **Database and sign-in:** [Supabase](https://supabase.com) (Postgres + Auth)
- **Quick Add AI:** OpenAI, called from a Supabase Edge Function so the API key stays on the server

## How access works

Everyone whose email is on the **family list** shares the same items, people and projects. Anyone can create an account, but an account whose email isn't on the list sees an "Access Restricted" screen and can't read or write anything. You manage the list in Supabase (step 3 below).

## One-time setup

### 1. Create a Supabase project

Sign up at [supabase.com](https://supabase.com) and create a new project (the free tier is fine). Note its **project ref**, the ID in the dashboard URL (`supabase.com/dashboard/project/<ref>`).

### 2. Create the database tables

In the dashboard open **SQL Editor**, paste the contents of [`supabase/migrations/20260925000000_init.sql`](supabase/migrations/20260925000000_init.sql) and click **Run**.

### 3. Add your family to the list

Still in the SQL Editor, run this with your family's real email addresses:

```sql
insert into public.family_members (email) values
  ('you@example.com'),
  ('partner@example.com');
```

You can add or remove people later the same way, or in **Table Editor → family_members**.

### 4. Configure sign-in

In **Authentication**:

- **URL Configuration:** set **Site URL** to where the app will live (use `http://localhost:5173` for now) and add `http://localhost:5173/**` under **Redirect URLs**. Add your real address here too once the app is hosted.
- **Email confirmation must stay on** (it is by default). The family list matches on email address, so confirming proves that people own the address they sign up with.
- **Emails → Confirm signup:** the sign-up screen asks for a 6-digit code. Add `{{ .Token }}` to this email template so the code appears in the email. The default link in the email also works.
- **Google sign-in (optional):** enable the Google provider and follow Supabase's guide to create the Google OAuth client. Without it, the "Continue with Google" button shows an error.

### 5. Deploy Quick Add

You need an OpenAI API key from [platform.openai.com](https://platform.openai.com/api-keys). From this folder, run:

```bash
npx supabase login
npx supabase functions deploy quick-add --project-ref <your-project-ref>
npx supabase secrets set OPENAI_API_KEY=sk-... --project-ref <your-project-ref>
```

Optional secrets:

| Secret | Default | Purpose |
| --- | --- | --- |
| `OPENAI_MODEL` | `gpt-4o-mini` | The OpenAI model used to sort entries |
| `OPENAI_REASONING_EFFORT` | *(unset / off)* | Only sent when set to a non-empty value; leave unset for non-reasoning models |

### 6. Connect the app to Supabase

Copy `.env.example` to `.env.local` and fill in the values from **Project Settings → API Keys** in Supabase: the project URL and the publishable key (the legacy `anon` key also works).

## Run locally

```bash
npm install
npm run dev
```

Open <http://localhost:5173>, create an account with an email that's on the family list, and you're in.

Other scripts: `npm run build` (production build into `dist/`), `npm run lint`, `npm run preview`.

## Hosting on Hostinger

The app is a static Vite SPA. Hostinger only serves the frontend; Supabase (Postgres, Auth, Edge Functions / Quick Add) stays on Supabase.

**Skip Hostinger’s `db.js` / CommonJS Supabase client step.** This app already has a single browser client at `src/api/supabaseClient.js` (`@supabase/supabase-js` is in `package.json`). Do not add a second client.

### Environment variables (build time)

Hostinger’s Supabase connector may inject `SUPABASE_URL` and `SUPABASE_API_KEY`. Locally we use `VITE_*`. Either set works at build time — `vite.config.js` maps them into the names the app reads:

| App expects (baked into `dist/`) | Also accepted from Hostinger / env |
| --- | --- |
| `VITE_SUPABASE_URL` | `SUPABASE_URL` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | `VITE_SUPABASE_ANON_KEY` or `SUPABASE_API_KEY` |

Use the **publishable / anon** key only — never the service role key on Hostinger.

Migrations and Edge Functions are still applied on Supabase (`supabase db push`, `supabase functions deploy`), not on Hostinger.

1. **Build on Hostinger (Node.js + Git):** set the env vars above in the app’s environment, then let Hostinger run `npm run build`. Or build locally with `.env.local` and upload `dist/`.
2. **Upload (manual path):** in hPanel open **File Manager** (or FTP) and upload the *contents* of `dist/` into `public_html` (or a subdomain folder). Include `.htaccess` so routes like `/calendar` work on refresh.
3. **Turn on SSL** for the domain in hPanel so the app loads over `https://`.
4. **Tell Supabase the address:** in **Authentication → URL Configuration**, set **Site URL** to `https://yourdomain.com` and add `https://yourdomain.com/**` under **Redirect URLs**.

The `.htaccess` file is for Apache/LiteSpeed (Hostinger). On Netlify, Vercel, Cloudflare Pages, etc., enable their SPA fallback and set `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` (or the Hostinger-compatible aliases above).

## Project layout

- `src/pages/`: one file per screen
- `src/components/`: shared app components; `src/components/ui/` holds the shadcn/ui building blocks
- `src/api/supabaseClient.js`: the Supabase connection
- `src/api/entities.js`: list/create/update/delete helpers for items, people and projects
- `src/lib/AuthContext.jsx`: sign-in state and the family-list check
- `supabase/migrations/`: the database schema and access rules
- `supabase/functions/quick-add/`: the Quick Add Edge Function
