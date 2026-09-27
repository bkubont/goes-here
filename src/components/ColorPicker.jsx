import React from "react";
import { COLOR_PALETTE, colorSwatchLabel, normalizeToPalette } from "@/lib/colorPalette";
import { cn } from "@/lib/utils";

/**
 * Shared palette swatch picker for people, projects, and list-type colors.
 * @param {string} value — selected hex
 * @param {(hex: string) => void} onChange
 * @param {string} [label] — group label for aria
 * @param {"sm"|"md"} [size]
 */
export default function ColorPicker({
  value,
  onChange,
  label = "Color",
  size = "md",
  className,
  id,
}) {
  const selected = normalizeToPalette(value);
  const dim = size === "sm" ? "h-7 w-7" : "h-8 w-8";

  return (
    <div
      role="radiogroup"
      aria-label={label}
      id={id}
      className={cn("flex flex-wrap gap-1.5", className)}
    >
      {COLOR_PALETTE.map((c) => {
        const isSelected = selected.toLowerCase() === c.toLowerCase();
        const name = colorSwatchLabel(c);
        return (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={isSelected}
            aria-label={name}
            title={name}
            onClick={() => onChange?.(c)}
            className={cn(
              dim,
              "rounded-full border-2 transition shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
              isSelected ? "border-foreground scale-110" : "border-transparent hover:border-border"
            )}
            style={{ background: c }}
          />
        );
      })}
    </div>
  );
}
