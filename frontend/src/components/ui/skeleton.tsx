import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "animate-shimmer rounded-lg bg-[length:200%_100%] bg-gradient-to-r from-muted via-white to-muted",
        className,
      )}
      {...props}
    />
  );
}

export { Skeleton };
