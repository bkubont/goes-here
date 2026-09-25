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

## Hosting

`npm run build` produces a static site in `dist/` that any static host can serve (Netlify, Vercel, Cloudflare Pages, and others):

- Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in the host's environment settings.
- Turn on single-page-app fallback (serve `index.html` for unknown paths) so links like `/calendar` work on reload.
- Add the hosted address to Supabase's **Site URL** and **Redirect URLs**.

## Project layout

- `src/pages/`: one file per screen
- `src/components/`: shared app components; `src/components/ui/` holds the shadcn/ui building blocks
- `src/api/supabaseClient.js`: the Supabase connection
- `src/api/entities.js`: list/create/update/delete helpers for items, people and projects
- `src/lib/AuthContext.jsx`: sign-in state and the family-list check
- `supabase/migrations/`: the database schema and access rules
- `supabase/functions/quick-add/`: the Quick Add Edge Function
