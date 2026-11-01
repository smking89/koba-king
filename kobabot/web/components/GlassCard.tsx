import { HTMLAttributes } from "react";

export function GlassCard({ className = "", chamfer = false, ...props }: HTMLAttributes<HTMLDivElement> & { chamfer?: boolean }) {
  return <div className={`glass ${chamfer ? "chamfer" : ""} ${className}`} {...props} />;
}
