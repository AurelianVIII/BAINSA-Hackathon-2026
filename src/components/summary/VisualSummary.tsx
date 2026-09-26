import { Card } from "@/components/ui/Card";
import { groupByTopic } from "@/lib/summary";
import { transcript } from "@/data/transcript";

/**
 * Owned by the Summaries/Threads feature team. Placeholder listing of
 * topics covered so far — replace with real AI-generated summaries and
 * simple infographics.
 */
export function VisualSummary() {
  const topics = Object.keys(groupByTopic(transcript));

  return (
    <Card title="AI summary">
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        Topics covered: {topics.join(", ")}
      </p>
    </Card>
  );
}
