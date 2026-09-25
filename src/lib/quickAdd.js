import { supabase } from "@/api/supabaseClient";

function localIsoDate(d) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Sends the entry to the quick-add Edge Function (supabase/functions/quick-add),
// which asks OpenAI to split it into structured items.
export async function parseQuickAdd(text, knownPeople = [], knownProjects = []) {
  const now = new Date();
  const { data, error } = await supabase.functions.invoke("quick-add", {
    body: {
      text,
      knownPeople,
      knownProjects,
      today: localIsoDate(now),
      todayLabel: now.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" }),
    },
  });

  if (error) {
    let message = error.message;
    try {
      message = (await error.context.json()).error || message;
    } catch {
      // keep the generic message
    }
    throw new Error(message);
  }

  return (data && data.items) || [];
}
