/**
 * Light rollup of incomplete gift items for a person (by person_name).
 * budget = planned; amount = spent when present. No finance module.
 */
export function giftBudgetRollup(items, personName) {
  const gifts = (items || []).filter(
    (i) => i.type === "gift" && !i.completed && (!personName || i.person_name === personName)
  );

  let budgetTotal = 0;
  let spentTotal = 0;
  let hasBudget = false;
  let hasSpent = false;

  for (const g of gifts) {
    const b = g.budget != null && g.budget !== "" ? Number(g.budget) : null;
    const a = g.amount != null && g.amount !== "" ? Number(g.amount) : null;
    if (b != null && !Number.isNaN(b)) {
      budgetTotal += b;
      hasBudget = true;
    }
    if (a != null && !Number.isNaN(a)) {
      spentTotal += a;
      hasSpent = true;
    }
  }

  return {
    gifts,
    count: gifts.length,
    budgetTotal: hasBudget ? budgetTotal : null,
    spentTotal: hasSpent ? spentTotal : null,
    remaining:
      hasBudget && hasSpent ? budgetTotal - spentTotal : hasBudget ? budgetTotal : null,
  };
}

export function formatMoney(n) {
  if (n == null || Number.isNaN(Number(n))) return "—";
  return `$${Number(n).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}
