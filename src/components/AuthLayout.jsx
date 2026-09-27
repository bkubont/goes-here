import React from "react";
import { MapPin } from "lucide-react";

export default function AuthLayout({ title, subtitle, footer, children }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-canvas px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-5">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-[8px] bg-primary text-attention">
              <MapPin className="w-6 h-6" aria-hidden="true" />
            </div>
            <span className="font-heading text-2xl font-semibold text-foreground">GoesHere</span>
          </div>
          <h1 className="page-title text-foreground">{title}</h1>
          {subtitle && <p className="text-muted-foreground mt-2 text-sm">{subtitle}</p>}
        </div>
        <div className="bg-card rounded-xl shadow-sm border border-border p-8">
          {children}
        </div>
        {footer && (
          <p className="text-center text-sm text-muted-foreground mt-6">{footer}</p>
        )}
      </div>
    </div>
  );
}
