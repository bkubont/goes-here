import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { GROCERY_CATEGORIES, ITEM_TYPES } from "./itemTypes.js";

function extractConstStringArray(source, name) {
  const match = source.match(new RegExp(`const\\s+${name}\\s*=\\s*\\[([\\s\\S]*?)\\];`));
  if (!match) throw new Error(`Could not find const ${name} in quick-add`);
  const values = [...match[1].matchAll(/["']([^"']+)["']/g)].map((m) => m[1]);
  if (values.length === 0) throw new Error(`const ${name} had no string values`);
  return values;
}

describe("Quick Add type contract", () => {
  const source = readFileSync("supabase/functions/quick-add/index.ts", "utf8");

  it("uses the same item types, in the same order, as the app", () => {
    expect(extractConstStringArray(source, "TYPE_ENUM")).toEqual(ITEM_TYPES.map((t) => t.key));
  });

  it("uses the same grocery categories, in the same order, as the app", () => {
    expect(extractConstStringArray(source, "GROCERY_CATEGORIES")).toEqual([...GROCERY_CATEGORIES]);
  });
});
