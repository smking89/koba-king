export function StatusDot({ online = true, size = "sm" }: { online?: boolean; size?: "sm" | "md" }) {
  const dim = size === "md" ? "h-3 w-3" : "h-2 w-2";
  const color = online ? "bg-lime shadow-glow-lime-sm" : "bg-ink-dim";
  return (
    <span className={`relative inline-flex ${dim}`}>
      {online && <span className={`absolute inline-flex h-full w-full rounded-full bg-lime opacity-75 animate-pulse-ring`} />}
      <span className={`relative inline-flex rounded-full ${dim} ${color}`} />
    </span>
  );
}
