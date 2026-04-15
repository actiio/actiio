import * as React from "react";
import { useLayoutEffect, useRef } from "react";

import { cn } from "@/lib/utils";

const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, value, ...props }, ref) => {
  const internalRef = useRef<HTMLTextAreaElement | null>(null);

  // Sync the passed ref with our internal ref
  React.useImperativeHandle(ref, () => internalRef.current!);

  useLayoutEffect(() => {
    const textarea = internalRef.current;
    if (!textarea) return;

    // Reset height to auto to get the correct scrollHeight
    textarea.style.height = "auto";
    // Set height to scrollHeight
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [value, props.defaultValue]);

  return (
    <textarea
      ref={internalRef}
      value={value}
      className={cn(
        "flex min-h-[120px] w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm transition-all duration-200",
        "placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#00bf63] focus:border-transparent disabled:cursor-not-allowed disabled:opacity-50",
        "resize-none overflow-hidden",
        className
      )}
      {...props}
    />
  );
});
Textarea.displayName = "Textarea";

export { Textarea };
