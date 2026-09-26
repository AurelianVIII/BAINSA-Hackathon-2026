import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { getActiveAttentionEvent } from "@/lib/attention";
import { attentionEvents } from "@/data/attention-events";

/**
 * Owned by the Attention feature team. Placeholder wiring against simulated
 * events — replace with real "I'm looking away" / "I'm back" bookmarking
 * and live understanding indicators.
 */
export function AttentionStatus({ currentTime }: { currentTime: number }) {
  const active = getActiveAttentionEvent(attentionEvents, currentTime);

  return (
    <Card title="Attention">
      {active ? (
        <Badge tone="warning">{active.type}</Badge>
      ) : (
        <Badge tone="info">focused</Badge>
      )}
      <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
        Simulated signal — real gaze/emotion tracking is out of scope for
        this prototype.
      </p>
    </Card>
  );
}
