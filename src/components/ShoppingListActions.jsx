import React from "react";
import { Copy, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { copyShoppingList, printShoppingList } from "@/lib/shoppingList";

/** Print + Copy list actions for grocery / shopping surfaces. */
export default function ShoppingListActions({ items, title = "Shopping list", className }) {
  const { toast } = useToast();
  const list = items || [];

  function onPrint() {
    printShoppingList(list, { title });
  }

  async function onCopy() {
    try {
      await copyShoppingList(list);
      toast({ title: "Copied", description: "Plain-text list ready to paste in Messages." });
    } catch (e) {
      toast({ title: "Couldn't copy", description: e.message, variant: "destructive" });
    }
  }

  return (
    <div className={className || "flex flex-wrap gap-2"}>
      <Button type="button" variant="outline" size="sm" className="min-h-[40px]" onClick={onPrint}>
        <Printer className="h-4 w-4 mr-1.5" />
        Print
      </Button>
      <Button type="button" variant="outline" size="sm" className="min-h-[40px]" onClick={onCopy}>
        <Copy className="h-4 w-4 mr-1.5" />
        Copy list
      </Button>
    </div>
  );
}
