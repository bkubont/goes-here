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
| `OPENAI_MODEL` | `gpt-6-luna` | The OpenAI model used to sort entries |
| `OPENAI_REASONING_EFFORT` | `low` | Set to an empty value if you switch to a model without reasoning support |

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

The app is a static site, so any Hostinger web hosting plan can serve it. Supabase and the Quick Add function keep running on Supabase.

1. **Build on your computer:** run `npm run build`. The Supabase values from `.env.local` are built into the files in `dist/`, so Hostinger needs no settings. (The publishable key is meant to be public.)
2. **Upload:** in hPanel open **File Manager** (or connect over FTP) and upload the *contents* of `dist/` into `public_html`, or into the folder of a subdomain such as `place.yourdomain.com`. Include `.htaccess`: it makes links like `/calendar` work when a page is refreshed. File Manager may hide files that start with a dot, so check it arrived.
3. **Turn on SSL** for the domain in hPanel (it's free) so the app loads over `https://`.
4. **Tell Supabase the address:** in **Authentication → URL Configuration**, set **Site URL** to `https://yourdomain.com` and add `https://yourdomain.com/**` under **Redirect URLs**. Otherwise sign-up and password-reset emails link back to localhost.

To publish an update, run `npm run build` again and upload the new `dist/` contents over the old ones.

The `.htaccess` file is for Apache/LiteSpeed servers like Hostinger's. On another static host (Netlify, Vercel, Cloudflare Pages and similar), turn on its single-page-app fallback instead and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in its environment settings.

## Project layout

- `src/pages/`: one file per screen
- `src/components/`: shared app components; `src/components/ui/` holds the shadcn/ui building blocks
- `src/api/supabaseClient.js`: the Supabase connection
- `src/api/entities.js`: list/create/update/delete helpers for items, people and projects
- `src/lib/AuthContext.jsx`: sign-in state and the family-list check
- `supabase/migrations/`: the database schema and access rules
- `supabase/functions/quick-add/`: the Quick Add Edge Function
