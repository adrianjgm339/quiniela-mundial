"use client";

import * as React from "react";

function cn(...classes: Array<string | undefined | false>) {
  return classes.filter(Boolean).join(" ");
}

export function Badge({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border border-[var(--border)] " +
          "bg-[var(--background)] px-2 py-1 text-xs text-[var(--foreground)]",
        className
      )}
      {...props}
    />
  );
}