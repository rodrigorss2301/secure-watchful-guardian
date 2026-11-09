import { cn } from "@/lib/utils";

type Props = { size?: number; withWordmark?: boolean; className?: string };

export function Logo({ size = 32, withWordmark = true, className }: Props) {
  return (
    <div className={cn("flex items-center gap-2.5", className)} role={withWordmark ? undefined : "img"} aria-label={withWordmark ? undefined : "Autotechs RMM"}>
      <div
        className="relative grid place-items-center rounded-xl bg-gradient-to-br from-primary to-primary/60 shadow-glow"
        style={{ width: size, height: size }}
        aria-hidden
      >
        <svg viewBox="0 0 24 24" width={size * 0.6} height={size * 0.6} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="text-primary-foreground">
          <path d="M3 12h3l2-5 4 10 2-5 2 3h5" />
        </svg>
      </div>
      {withWordmark && (
        <div className="flex flex-col leading-none">
          <span className="font-display text-lg font-bold tracking-tight">
            Auto<span className="text-gradient-brand">techs</span>
          </span>
          <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">RMM</span>
        </div>
      )}
    </div>
  );
}