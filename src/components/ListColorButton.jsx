import React from "react";
import { Palette } from "lucide-react";
import ColorPicker from "@/components/ColorPicker";
import { colorSwatchLabel, normalizeToPalette } from "@/lib/colorPalette";
import { cn } from "@/lib/utils";

/**
 * Compact list-type color control: swatch opens a popover with the shared palette.
 * Used on Lists hub rows and Settings → Lists.
 */
export default function ListColorButton({
  color,
  onChange,
  label = "List color",
  className,
}) {
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef(null);
  const selected = normalizeToPalette(color);

  React.useEffect(() => {
    if (!open) return undefined;
    function onDoc(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    }
    function onKey(e) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="grid h-10 w-10 place-items-center rounded-[6px] text-muted-foreground hover:bg-accent"
        aria-label={`${label}: ${colorSwatchLabel(selected)}. Change color`}
        aria-expanded={open}
        title="List color"
      >
        <span
          className="h-4 w-4 rounded-full border border-border shadow-sm"
          style={{ background: selected }}
          aria-hidden
        />
        <span className="sr-only"><Palette className="h-4 w-4" /></span>
      </button>
      {open && (
        <div
          className="absolute right-0 z-30 mt-1 w-[min(100vw-2rem,18rem)] rounded-xl border border-border bg-card p-3 shadow-lg"
          role="dialog"
          aria-label={`${label} picker`}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <p className="text-xs font-medium text-muted-foreground mb-2">{label}</p>
          <ColorPicker
            value={selected}
            size="sm"
            label={label}
            onChange={(c) => {
              onChange?.(c);
              setOpen(false);
            }}
          />
        </div>
      )}
    </div>
  );
}
