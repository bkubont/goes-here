// Quick Add: turns a natural-language entry into structured items with OpenAI.
// Runs as a Supabase Edge Function so the OpenAI key never reaches the browser.
//
// Secrets (set with `supabase secrets set`):
//   OPENAI_API_KEY           required
//   OPENAI_MODEL             optional, default "gpt-6-luna"
//   OPENAI_REASONING_EFFORT  optional, default "low"; set to "" for models without reasoning

import { createClient } from "npm:@supabase/supabase-js@2";

const OPENAI_MODEL = Deno.env.get("OPENAI_MODEL") || "gpt-6-luna";
const REASONING_EFFORT = Deno.env.get("OPENAI_REASONING_EFFORT") ?? "low";

// Keep in sync with ITEM_TYPES and GROCERY_CATEGORIES in src/lib/itemTypes.js.
const TYPE_ENUM = [
  "todo", "grocery", "shopping", "bill", "event", "to_schedule",
  "idea", "note", "research", "errand", "gift", "project_item", "household",
];
const GROCERY_CATEGORIES = [
  "Produce", "Meat", "Dairy", "Bakery", "Frozen", "Canned", "Snacks", "Beverages", "Household", "Other",
];

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function stringList(value: unknown, max = 200): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v) => typeof v === "string").slice(0, max);
}

const nullableString = { type: ["string", "null"] };
const nullableNumber = { type: ["number", "null"] };

const ITEM_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    content: { type: "string" },
    type: { type: "string", enum: TYPE_ENUM },
    person_name: nullableString,
    responsible_name: nullableString,
    project_name: nullableString,
    date: nullableString,
    due_date: nullableString,
    time: nullableString,
    recurring: nullableString,
    priority: { type: "string", enum: ["low", "medium", "high"] },
    category: nullableString,
    amount: nullableNumber,
    budget: nullableNumber,
    store: nullableString,
    location: nullableString,
    tags: { type: "array", items: { type: "string" } },
    inbox: { type: "boolean" },
    notes: nullableString,
    // Keep in sync with duration fields / estimation in src/lib/estimateDuration.js.
    duration_minutes: nullableNumber,
  },
  required: [
    "content", "type", "person_name", "responsible_name", "project_name", "date", "due_date",
    "time", "recurring", "priority", "category", "amount", "budget", "store", "location",
    "tags", "inbox", "notes", "duration_minutes",
  ],
};

const RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: { items: { type: "array", items: ITEM_SCHEMA } },
  required: ["items"],
};

function buildPrompt(today: string, todayLabel: string, knownPeople: string[], knownProjects: string[]) {
  return `You are an intelligent organization assistant for a personal & family life app.
Today is ${todayLabel} (ISO date ${today}).

The user gives you a natural-language entry that may contain ONE or MORE things to remember.
Break it into separate items. For each item determine the fields below. Use null for any field that does not apply.

TYPE — pick exactly one from: ${TYPE_ENUM.join(", ")}.
  • todo      = a task to do (no specific calendar time). If it has a specific date AND time of day, use "event".
  • event     = an appointment / activity / practice with a date and a time of day.
  • grocery   = a food or everyday household item to buy at the grocery store.
  • shopping  = a non-grocery thing to buy (clothes, gear, supplies).
  • bill      = a bill to pay (has an amount and a due date).
  • to_schedule = something that needs an appointment booked but has NO date yet (e.g. "schedule dentist").
  • idea      = a someday/maybe thought or wish — NOT an obligation. Never treat it as overdue.
  • note      = a reference fact to remember.
  • research  = something to look into / investigate.
  • errand    = a place to go or a pick-up.
  • gift      = a gift idea (has a recipient; maybe a budget and a store).
  • project_item = clearly belongs to a named project.
  • household = a shared household responsibility / chore.

PERSON_NAME — who the item is ABOUT (a person's name), if any. When a name appears, prefer matching one of these known people: [${knownPeople.join(", ") || "none yet"}]. Otherwise use the spoken name.
RESPONSIBLE_NAME — who is RESPONSIBLE for doing it, ONLY if it is clearly someone other than the person it's about (e.g. "I need to pick up Riley" → responsible is the speaker if known, else null; do not guess).
PROJECT_NAME — a project name if mentioned or strongly implied. Known projects: [${knownProjects.join(", ") || "none yet"}].
DATE — ISO date YYYY-MM-DD if a specific calendar day applies (event/appointment/errand on a day). Resolve relative words to real dates: "today"=${today}, "tomorrow", weekday names like "Thursday" (next occurrence including today), "next Friday", "on the 20th". If a time of day is given, also set TIME.
DUE_DATE — ISO date YYYY-MM-DD if there is a deadline (bill due, task due by a date) but no time-of-day event. Do NOT also set DATE for the same item.
TIME — "HH:MM" 24-hour if a time of day is given.
RECURRING — short natural-language recurrence if mentioned: "every Tuesday", "monthly", "every 3 months", "on the 1st", etc. Null otherwise. When RECURRING is set, you MUST also set DATE to the FIRST occurrence (resolve weekday/relative words to the next matching date including today).
PRIORITY — "high" if explicitly urgent/important, "low" if clearly minor, else "medium".
CATEGORY — for grocery items ONLY, one of: ${GROCERY_CATEGORIES.join(", ")}. Null for other types.
AMOUNT — numeric money amount for bills/expenses if stated.
BUDGET — numeric gift budget if stated.
STORE — store or brand if mentioned.
LOCATION — a place if mentioned.
TAGS — a few short lowercase keyword tags when helpful (empty array otherwise).
INBOX — true ONLY if you cannot confidently determine where it belongs or it needs the user's decision (ambiguous project, unclear person, vague). Otherwise false.
NOTES — any extra useful detail not captured above.
DURATION_MINUTES — integer minutes when the user implies length ("30-minute call", "dentist for 45 minutes", "hour-long practice"). Null if not stated. Do not invent.

RULES:
- Produce one item per distinct thing; "and" linking different tasks → multiple items.
- Never invent a date. If no date is given, set DATE and DUE_DATE to null.
- "Someday / maybe / want to" language → type "idea", never a todo.
- Keep CONTENT concise (about 3–8 words), imperative for tasks.`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) return json({ error: "Quick Add isn't set up yet: OPENAI_API_KEY is missing." }, 500);

  // Only family members may spend OpenAI credits. The platform has already
  // verified the JWT; this checks it belongs to someone on the family list.
  const authHeader = req.headers.get("Authorization") ?? "";
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: isMember, error: memberError } = await supabase.rpc("is_family_member");
  if (memberError) return json({ error: "Could not verify your account." }, 401);
  if (!isMember) return json({ error: "Your account isn't on the family list." }, 403);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid request body." }, 400);
  }

  const text = typeof body.text === "string" ? body.text.trim().slice(0, 2000) : "";
  if (!text) return json({ error: "Nothing to organize." }, 400);

  // The browser sends its local date so "today" and "tomorrow" match the user's
  // timezone rather than the server's.
  const today = typeof body.today === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.today)
    ? body.today
    : new Date().toISOString().slice(0, 10);
  const todayLabel = typeof body.todayLabel === "string" ? body.todayLabel.slice(0, 80) : today;

  const request: Record<string, unknown> = {
    model: OPENAI_MODEL,
    messages: [
      { role: "system", content: buildPrompt(today, todayLabel, stringList(body.knownPeople), stringList(body.knownProjects)) },
      { role: "user", content: text },
    ],
    response_format: {
      type: "json_schema",
      json_schema: { name: "quick_add_items", strict: true, schema: RESPONSE_SCHEMA },
    },
  };
  if (REASONING_EFFORT) request.reasoning_effort = REASONING_EFFORT;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });

  if (!res.ok) {
    console.error("OpenAI error", res.status, await res.text());
    return json({ error: "The AI service couldn't process that. Please try again." }, 502);
  }

  const completion = await res.json();
  const message = completion.choices?.[0]?.message;
  if (message?.refusal) return json({ error: message.refusal }, 422);

  try {
    const parsed = JSON.parse(message?.content ?? "{}");
    return json({ items: Array.isArray(parsed.items) ? parsed.items : [] });
  } catch {
    return json({ error: "The AI returned an unreadable response. Please try again." }, 502);
  }
});
