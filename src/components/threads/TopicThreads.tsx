import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { groupByTopic } from "@/lib/summary";
import { transcript } from "@/data/transcript";

/**
 * Owned by the Summaries/Threads feature team. Placeholder topic pills —
 * replace with real conversation-thread grouping and navigation.
 */
export function TopicThreads() {
  const topics = Object.keys(groupByTopic(transcript));

  return (
    <Card title="Topic threads">
      <div className="flex flex-wrap gap-2">
        {topics.map((topic) => (
          <Badge key={topic}>{topic}</Badge>
        ))}
      </div>
    </Card>
  );
}
