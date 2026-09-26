import {
  NODE_H,
  NODE_W,
  VIEW_W,
  layoutChain,
} from "@/lib/summary/flow-layout";
import type { VisualSummaryData } from "@/lib/summary/types";

const KIND_CLASS: Record<string, string> = {
  input: "fill-amber-50 stroke-amber-400 dark:fill-amber-950/50",
  process: "fill-zinc-100 stroke-zinc-400 dark:fill-zinc-800/50",
  output: "fill-emerald-50 stroke-emerald-400 dark:fill-emerald-950/50",
};

/** SVG text does not wrap — split long labels near the middle. */
function wrapLabel(label: string, max = 20): string[] {
  if (label.length <= max) return [label];

  const words = label.split(" ");
  if (words.length === 1) return [label];

  let best = 1;
  let bestDiff = Infinity;
  for (let i = 1; i < words.length; i++) {
    const diff = Math.abs(
      words.slice(0, i).join(" ").length - words.slice(i).join(" ").length
    );
    if (diff < bestDiff) {
      bestDiff = diff;
      best = i;
    }
  }

  return [words.slice(0, best).join(" "), words.slice(best).join(" ")];
}

/**
 * Reveal animation as plain CSS, scoped to this chart.
 *
 * Done here rather than with state + an effect so the component stays
 * hook-free, and so `prefers-reduced-motion` is honoured by the media
 * query rather than by a JS check that can flash on first paint.
 * Kept local to PC4's file — `globals.css` belongs to PC1.
 */
const REVEAL_CSS = `
@keyframes focusaid-flow-in { from { opacity: 0 } to { opacity: 1 } }
.focusaid-flow-part { animation: focusaid-flow-in 300ms ease-out both; }
@media (prefers-reduced-motion: reduce) {
  .focusaid-flow-part { animation: none; opacity: 1; }
}
`;

/**
 * Owned by the Summaries/Threads feature team (PC4).
 *
 * Renders the reaction chain top to bottom. The aria-label spells the
 * flow out in words — an SVG with no text alternative fails the exact
 * users this product is built for.
 */
export function SummaryFlowchart({ data }: { data: VisualSummaryData }) {
  const { ordered, positions, viewH } = layoutChain(data.nodes);
  const labels = new Map(data.nodes.map((node) => [node.id, node.label]));

  const description = data.edges
    .map(
      (edge) =>
        `${labels.get(edge.from)} leads to ${labels.get(edge.to)}${
          edge.label ? ` (${edge.label})` : ""
        }`
    )
    .join("; ");

  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${viewH}`}
      preserveAspectRatio="xMidYMid meet"
      className="mx-auto h-auto w-full max-w-[320px]"
      role="img"
      aria-label={`Diagram of ${data.title}. ${description}.`}
    >
      <style>{REVEAL_CSS}</style>
      <defs>
        <marker
          id="focusaid-flow-arrow"
          markerWidth="8"
          markerHeight="8"
          refX="7"
          refY="4"
          orient="auto"
        >
          <path d="M0,0 L8,4 L0,8 z" className="fill-zinc-400" />
        </marker>
      </defs>

      {data.edges.map((edge) => {
        const s = positions.get(edge.from);
        const t = positions.get(edge.to);
        if (!s || !t) return null;

        const sy = s.y + NODE_H / 2;
        const ty = t.y - NODE_H / 2;

        return (
          <g
            key={`${data.title}-${edge.from}-${edge.to}`}
            className="focusaid-flow-part"
            style={{ animationDelay: "240ms" }}
          >
            <path
              d={`M ${s.x},${sy} L ${t.x},${ty}`}
              fill="none"
              strokeWidth={1.5}
              className="stroke-zinc-300 dark:stroke-zinc-600"
              markerEnd="url(#focusaid-flow-arrow)"
            />
            {edge.label && (
              <text
                x={s.x + 10}
                y={(sy + ty) / 2 + 4}
                textAnchor="start"
                className="fill-zinc-400 text-[12px]"
              >
                {edge.label}
              </text>
            )}
          </g>
        );
      })}

      {ordered.map((node, i) => {
        const pos = positions.get(node.id)!;
        const lines = wrapLabel(node.label);

        return (
          <g
            key={`${data.title}-${node.id}`}
            className="focusaid-flow-part"
            style={{ animationDelay: `${i * 80}ms` }}
          >
            <rect
              x={pos.x - NODE_W / 2}
              y={pos.y - NODE_H / 2}
              width={NODE_W}
              height={NODE_H}
              rx={10}
              strokeWidth={1.5}
              className={KIND_CLASS[node.kind] ?? KIND_CLASS.process}
            />
            <text
              x={pos.x}
              y={pos.y - (lines.length - 1) * 8}
              textAnchor="middle"
              dominantBaseline="middle"
              className="fill-zinc-800 text-[14px] font-medium dark:fill-zinc-100"
            >
              {lines.map((line, li) => (
                <tspan key={li} x={pos.x} dy={li === 0 ? 0 : "1.2em"}>
                  {line}
                </tspan>
              ))}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
