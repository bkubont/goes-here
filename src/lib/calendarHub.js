import { toDayKey } from "@/lib/itemTypes";

/**
 * Kitchen-glance hub counts for Calendar (Batch 3).
 * Surfaces Lists / Board / Shopping signals without forking those products.
 */

function isOpen(item) {
  return !!(item && !item.completed && !item._recurringOccurrence);
}

/** Incomplete grocery + shopping list items (unchecked / need attention). */
export function countOpenShopping(items) {
  let grocery = 0;
  let shopping = 0;
  for (const it of items || []) {
    if (!isOpen(it)) continue;
    if (it.type === "grocery") grocery += 1;
    else if (it.type === "shopping") shopping += 1;
  }
  return { grocery, shopping, total: grocery + shopping };
}

/** Board items currently in the Doing column (legacy status_key). */
export function countBoardDoing(items) {
  let n = 0;
  for (const it of items || []) {
    if (!isOpen(it)) continue;
    if (it.board_status === "doing") n += 1;
  }
  return n;
}

/**
 * Incomplete household chores dated or due on `dayKey` (local YYYY-MM-DD).
 * Uses date or due_date; ignores purchased-style fields.
 */
export function countHouseholdToday(items, dayKey) {
  if (!dayKey) return 0;
  let n = 0;
  for (const it of items || []) {
    if (!isOpen(it) || it.type !== "household") continue;
    const dateKey = toDayKey(it.date);
    const dueKey = toDayKey(it.due_date);
    if (dateKey === dayKey || dueKey === dayKey) n += 1;
  }
  return n;
}

/**
 * Build compact hub link models for Calendar strips.
 * Only includes entries with count > 0 (empty kitchen stays quiet).
 */
export function buildFamilyHubLinks(items, { todayKey } = {}) {
  const dayKey = todayKey || toDayKey(new Date());
  const doing = countBoardDoing(items);
  const household = countHouseholdToday(items, dayKey);
  const shop = countOpenShopping(items);

  const links = [];

  if (doing > 0) {
    links.push({
      key: "doing",
      label: "Doing",
      count: doing,
      hint: "On the board",
      to: "/board?stage=doing",
    });
  }

  if (household > 0) {
    links.push({
      key: "household",
      label: "Household",
      count: household,
      hint: "Today",
      to: "/lists/household",
    });
  }

  if (shop.total > 0) {
    const to = shop.grocery > 0 ? "/lists/grocery/shop" : "/lists/shopping";
    links.push({
      key: "shopping",
      label: "Shopping",
      count: shop.total,
      hint: shop.grocery > 0 && shop.shopping > 0
        ? "Grocery + lists"
        : shop.grocery > 0
          ? "Grocery"
          : "List",
      to,
    });
  }

  return links;
}
