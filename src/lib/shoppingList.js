import { GROCERY_CATEGORIES } from "@/lib/itemTypes";

export function aisleOf(item) {
  return item?.category && GROCERY_CATEGORIES.includes(item.category)
    ? item.category
    : "Other";
}

export function isGroceryOpen(item) {
  return !!(item && item.type === "grocery" && !item.completed && !item.purchased);
}

/** Ordered aisle groups for open (unchecked) grocery items. */
export function groupOpenByAisle(items) {
  const open = (items || []).filter(isGroceryOpen);
  const groups = {};
  GROCERY_CATEGORIES.forEach((c) => {
    groups[c] = [];
  });
  open.forEach((it) => {
    const c = aisleOf(it);
    (groups[c] = groups[c] || []).push(it);
  });
  return GROCERY_CATEGORIES.filter((c) => (groups[c] || []).length).map((c) => ({
    aisle: c,
    items: groups[c],
  }));
}

function lineForItem(it) {
  const bits = [it.content || "Item"];
  if (it.amount != null && it.amount !== "") bits.push(`(qty ${it.amount})`);
  if (it.store) bits.push(`@ ${it.store}`);
  return `☐ ${bits.join(" ")}`;
}

/** Plain text for Messages / clipboard — aisle headers + unchecked lines. */
export function formatShoppingListText(items, { title = "Shopping list" } = {}) {
  const groups = groupOpenByAisle(items);
  if (!groups.length) return `${title}\n(empty)`;
  const lines = [title, ""];
  groups.forEach(({ aisle, items: aisleItems }) => {
    lines.push(aisle);
    aisleItems.forEach((it) => lines.push(lineForItem(it)));
    lines.push("");
  });
  return lines.join("\n").trimEnd();
}

export async function copyShoppingList(items) {
  const text = formatShoppingListText(items);
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return text;
  }
  // Fallback for older browsers
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.position = "fixed";
  ta.style.left = "-9999px";
  document.body.appendChild(ta);
  ta.select();
  document.execCommand("copy");
  document.body.removeChild(ta);
  return text;
}

/**
 * Render a clean print root, call window.print(), then clean up.
 * Uses #goeshere-print-root so @media print CSS can hide app chrome.
 */
export function printShoppingList(items, { title = "Shopping list" } = {}) {
  const groups = groupOpenByAisle(items);
  let root = document.getElementById("goeshere-print-root");
  if (!root) {
    root = document.createElement("div");
    root.id = "goeshere-print-root";
    document.body.appendChild(root);
  }

  const sections = groups.length
    ? groups
        .map(
          ({ aisle, items: aisleItems }) => `
      <section>
        <h2>${escapeHtml(aisle)}</h2>
        <ul>
          ${aisleItems
            .map((it) => {
              const meta = [];
              if (it.amount != null && it.amount !== "") meta.push(`Qty ${it.amount}`);
              if (it.store) meta.push(it.store);
              const metaHtml = meta.length
                ? `<span class="meta"> — ${escapeHtml(meta.join(" · "))}</span>`
                : "";
              return `<li><span class="box">☐</span> ${escapeHtml(it.content || "Item")}${metaHtml}</li>`;
            })
            .join("")}
        </ul>
      </section>`
        )
        .join("")
    : `<p class="empty">Nothing left on the list.</p>`;

  root.innerHTML = `
    <h1>${escapeHtml(title)}</h1>
    <p class="subtitle">${groups.reduce((n, g) => n + g.items.length, 0)} items</p>
    ${sections}
  `;

  document.body.classList.add("goeshere-printing");
  const cleanup = () => {
    document.body.classList.remove("goeshere-printing");
    window.removeEventListener("afterprint", cleanup);
  };
  window.addEventListener("afterprint", cleanup);
  window.print();
  // Fallback if afterprint never fires
  setTimeout(cleanup, 1000);
}

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
