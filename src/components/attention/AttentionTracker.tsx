import { Card } from "@/components/ui/Card";
import type { AttentionSample } from "@/types";

const LEVEL_STYLES: Record<"high" | "medium" | "low", { label: string; badge: string }> = {
  high: { label: "Attention: High", badge: "bg-emerald-500 text-white" },
  medium: { label: "Attention: Medium", badge: "bg-amber-500 text-white" },
  low: { label: "Attention: Low", badge: "bg-rose-500 text-white" },
};

function Bar({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "emerald" | "rose";
}) {
  const pct = Math.round(value * 100);
  const barColor = tone === "emerald" ? "bg-emerald-500" : "bg-rose-500";

  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
        <span>{label}</span>
        <span className="tabular-nums">{pct}%</span>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-2 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800"
      >
        <div
          className={`h-full rounded-full transition-all duration-300 motion-reduce:transition-none ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/**
 * Owned by the Attention feature team. Simulated webcam attention tracker —
 * no real camera/screen capture (see ROADMAP.md risk #6: a permission
 * prompt or wrong face mid-demo is worse than a clean fallback, and in
 * FocusAid's real use case the student is likely already in a Meet/Teams
 * call holding the camera anyway).
 */
export function AttentionTracker({
  sample,
  level,
}: {
  currentTime: number;
  sample: AttentionSample;
  level: "high" | "medium" | "low";
}) {
  const { label, badge } = LEVEL_STYLES[level];

  return (
    <Card title="Attention tracker" className="relative">
      <span
        role="status"
        aria-live="polite"
        className={`absolute right-4 top-4 rounded-full px-2.5 py-1 text-xs font-semibold ${badge}`}
      >
        {label}
      </span>
      <div className="relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-lg bg-zinc-900">
        <svg viewBox="0 0 100 100" className="h-2/3 w-2/3 text-zinc-600" fill="currentColor">
          <circle cx="50" cy="38" r="18" />
          <path d="M20 95 C20 65 35 55 50 55 C65 55 80 65 80 95 Z" />
        </svg>
        <div className="absolute left-1/2 top-[34%] h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-md border-2 border-emerald-400">
          <span className="absolute -left-0.5 -top-0.5 h-2 w-2 border-l-2 border-t-2 border-emerald-400" />
          <span className="absolute -right-0.5 -top-0.5 h-2 w-2 border-r-2 border-t-2 border-emerald-400" />
          <span className="absolute -bottom-0.5 -left-0.5 h-2 w-2 border-b-2 border-l-2 border-emerald-400" />
          <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 border-b-2 border-r-2 border-emerald-400" />
        </div>
      </div>
      <div className="mt-4 flex flex-col gap-3">
        <Bar label="Gaze to screen" value={sample.gaze} tone="emerald" />
        <Bar label="Confusion (brow)" value={sample.confusion} tone="rose" />
        <Bar label="Engagement" value={sample.engagement} tone="emerald" />
      </div>
    </Card>
  );
}
