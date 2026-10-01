# Place

One place for everything: a family organizer for to-dos, groceries, bills, events, gifts, people and projects. Type or say anything into **Quick Add** and AI sorts it into the right list, date and person.

- **Frontend:** React + Vite + Tailwind (static site)
- **Database and sign-in:** [Supabase](https://supabase.com) (Postgres + Auth)
- **Quick Add AI:** OpenAI, called from a Supabase Edge Function so the API key stays on the server

## How access works

Everyone whose email is on the **family list** shares the same items, people and projects. Anyone can create an account, but an account whose email isn't on the list sees an "Access Restricted" screen and can't read or write anything. Add the first emails in the database (step 3). After that, anyone already on the list manages it in the app under **Settings → Household**.

## One-time setup

### 1. Create a Supabase project

Sign up at [supabase.com](https://supabase.com) and create a new project (the free tier is fine). Note its **project ref**, the ID in the dashboard URL (`supabase.com/dashboard/project/<ref>`).

### 2. Create the database tables

The app needs **every** file in [`supabase/migrations/`](supabase/migrations/), in filename order. The first file only creates the original tables. Later files add durations, the board, reminders, attachments and trash, household emails in Settings, live updates between devices, snooze, multiple boards, and project colors. Skipping them leaves Quick Add, the board, trash, or Settings → Household broken.

**Option A — SQL Editor (no extra install).** In the dashboard open **SQL Editor**. For each file below, paste the whole file and click **Run**. Wait until it succeeds before the next one.

1. [`20260925000000_init.sql`](supabase/migrations/20260925000000_init.sql)
2. [`20260927000000_duration_and_board.sql`](supabase/migrations/20260927000000_duration_and_board.sql)
3. [`20260927010000_reminders_projects_recurrence.sql`](supabase/migrations/20260927010000_reminders_projects_recurrence.sql)
4. [`20260927020000_attachments_and_soft_delete.sql`](supabase/migrations/20260927020000_attachments_and_soft_delete.sql)
5. [`20260927030000_family_members_rls.sql`](supabase/migrations/20260927030000_family_members_rls.sql) — this is the one that lets Settings edit the household email list
6. [`20260927120000_realtime_and_updated_at.sql`](supabase/migrations/20260927120000_realtime_and_updated_at.sql)
7. [`20260927140000_reminder_snooze_until.sql`](supabase/migrations/20260927140000_reminder_snooze_until.sql)
8. [`20260927200000_multi_boards.sql`](supabase/migrations/20260927200000_multi_boards.sql)
9. [`20260927210000_project_color_ensure.sql`](supabase/migrations/20260927210000_project_color_ensure.sql)

If a newer file shows up in that folder later, run it too, still in filename order. Do not edit a file you have already run; add a new file instead.

**Option B — Supabase CLI.** From this folder, after `npx supabase login` and `npx supabase link --project-ref <your-project-ref>`:

```bash
npx supabase db push
```

That applies every migration that is not already on the project, in filename order.

**Max rows.** In **Project Settings → API** (sometimes labeled **Data API**) find **Max rows** and leave it at **1000** or higher. The app asks for 1000 rows at a time and keeps asking until a shorter page comes back. If Max rows is lower than 1000, lists can stop early with no error message.

### 3. Add the first emails

The app cannot open for someone until their email is on the list, so the **first** addresses still go in with SQL. In the SQL Editor, run this with your family's real email addresses:

```sql
insert into public.family_members (email) values
  ('you@example.com'),
  ('partner@example.com');
```

After step 2 has been applied (including `20260927030000_family_members_rls.sql`) and you are signed in with one of those emails, add or remove people in the app: **Settings → Household → Access emails**. You do not need the SQL editor for later changes. **Table Editor → family_members** still works if you prefer it.

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

Other scripts: `npm run build` (production build into `dist/`), `npm run lint`, `npm test` (paging checks), `npm run preview`.

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

Migrations and Edge Functions are still applied on Supabase (`supabase db push` applies every file in `supabase/migrations/` that is not already there, and `supabase functions deploy` publishes Quick Add), not on Hostinger.

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
- `supabase/migrations/`: every database change, in filename order. A new setup must run all of them (step 2)
- `supabase/functions/quick-add/`: the Quick Add Edge Function
