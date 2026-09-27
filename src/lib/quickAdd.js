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
    let detail = data && typeof data === "object" ? data : null;
    try {
      const body = await error.context.json();
      if (body && typeof body === "object") detail = { ...detail, ...body };
    } catch {
      // keep whatever we already have
    }
    if (detail?.error) message = detail.error;
    const bits = [];
    if (detail?.openai_status != null) bits.push(`status ${detail.openai_status}`);
    if (detail?.openai_error) bits.push(detail.openai_error);
    if (bits.length) message = `${message} (${bits.join(": ")})`;
    throw new Error(message);
  }

  if (data?.error) {
    let message = data.error;
    const bits = [];
    if (data.openai_status != null) bits.push(`status ${data.openai_status}`);
    if (data.openai_error) bits.push(data.openai_error);
    if (bits.length) message = `${message} (${bits.join(": ")})`;
    throw new Error(message);
  }

  return (data && data.items) || [];
}
