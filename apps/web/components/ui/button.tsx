"use client";

import * as React from "react";

type Variant = "primary" | "secondary" | "outline" | "ghost";
type Size = "sm" | "md";

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
};

function cn(...classes: Array<string | undefined | false>) {
  return classes.filter(Boolean).join(" ");
}

const base =
  "inline-flex items-center justify-center gap-2 rounded-xl font-medium transition " +
  "disabled:opacity-60 disabled:cursor-not-allowed select-none";

const sizes: Record<Size, string> = {
  sm: "px-3 py-2 text-sm",
  md: "px-4 py-2",
};

const variants: Record<Variant, string> = {
  primary:
    "bg-[var(--accent)] text-[var(--accent-foreground)] hover:opacity-90",
  secondary:
    "bg-[var(--card)] text-[var(--foreground)] border border-[var(--border)] hover:opacity-90",
  outline:
    "bg-transparent text-[var(--foreground)] border border-[var(--border)] hover:opacity-90",
  ghost:
    "bg-transparent text-[var(--foreground)] hover:opacity-90",
};

export function Button({
  className,
  variant = "primary",
  size = "md",
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(base, sizes[size], variants[variant], className)}
      {...props}
    />
  );
}