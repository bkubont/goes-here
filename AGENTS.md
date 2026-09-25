# AGENTS.md

## Project Context

Place is a family organizer: a React + Vite frontend backed by Supabase (Postgres, Auth, Edge Functions), with OpenAI powering Quick Add. Treat it as user-owned application code, keep changes focused on the user's request, and preserve existing project conventions.

Start with `README.md` for setup, environment variables and hosting.

## Key Files

- `src/api/supabaseClient.js`: the single Supabase client. Reuse it; don't create others.
- `src/api/entities.js`: table helpers (`entities.Item.list/filter/create/bulkCreate/update/delete`). Use these for data access.
- `src/lib/queries.js`: React Query hooks and cache invalidation.
- `src/lib/AuthContext.jsx`: session state and the family-list membership check.
- `supabase/migrations/`: schema and row-level security. Schema changes go in a new migration file, never by editing an applied one.
- `supabase/functions/quick-add/index.ts`: Deno Edge Function that calls OpenAI. Its type and category lists must stay in sync with `src/lib/itemTypes.js`.
- `.env.local`: local-only environment values; never commit secrets.

## Working Notes

- Every table uses row-level security gated on `public.is_family_member()`. New tables need the same policy.
- Secrets such as the OpenAI key belong in Supabase secrets (`supabase secrets set`), never in `VITE_*` variables, which ship to the browser.
- Run `npm run lint` and `npm run build` before finishing code changes.
