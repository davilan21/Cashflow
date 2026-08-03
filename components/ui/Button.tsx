"use client";

import { forwardRef } from "react";

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "primary";
};

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { variant = "default", className = "", ...rest },
  ref
) {
  const base =
    "flex-1 min-h-[44px] px-3 py-2.5 rounded-lg font-sans text-sm cursor-pointer border disabled:opacity-40 disabled:cursor-default";
  const estilo =
    variant === "primary"
      ? "bg-ink text-white border-ink font-medium"
      : "bg-surface text-ink border-line";
  return <button ref={ref} className={`${base} ${estilo} ${className}`} {...rest} />;
});
