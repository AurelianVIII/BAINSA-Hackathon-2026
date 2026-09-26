import {
  NODE_H,
  NODE_W,
  VIEW_H,
  VIEW_W,
  positionFor,
} from "@/lib/summary/flow-layout";
import type { VisualSummaryData } from "@/lib/summary/types";

const KIND_CLASS: Record<string, string> = {
  input: "fill-amber-50 stroke-amber-400 dark:fill-amber-950/50",
  process: "fill-indigo-50 stroke-indigo-400 dark:fill-indigo-950/50",
  output: "fill-emerald-50 stroke-emerald-400 dark:fill-emerald-950/50",
};

/** SVG text does not wrap — split long labels near the middle. */
function wrapLabel(label: string, max = 15): string[] {
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
 * Routes an edge between two boxes. Nodes stacked in the same column are
 * joined bottom-to-top; everything else exits the right edge and enters
 * the left edge, with control points scaled to the gap so short hops
 * don't loop back on themselves.
 */
function edgePath(
  s: { x: number; y: number },
  t: { x: number; y: number }
): { d: string; mx: number; my: number } {
  const stacked = Math.abs(t.x - s.x) < NODE_W;

  if (stacked) {
    const down = t.y > s.y;
    const sy = s.y + (down ? NODE_H / 2 : -NODE_H / 2);
    const ty = t.y + (down ? -NODE_H / 2 : NODE_H / 2);
    return {
      d: `M ${s.x},${sy} L ${t.x},${ty}`,
      mx: s.x,
      my: (sy + ty) / 2,
    };
  }

  const sx = s.x + NODE_W / 2;
  const tx = t.x - NODE_W / 2;

  if (s.y === t.y) {
    return { d: `M ${sx},${s.y} L ${tx},${t.y}`, mx: (sx + tx) / 2, my: s.y - 8 };
  }

  const c = Math.max(20, Math.abs(tx - sx) / 2);
  return {
    d: `M ${sx},${s.y} C ${sx + c},${s.y} ${tx - c},${t.y} ${tx},${t.y}`,
    mx: (sx + tx) / 2,
    my: (s.y + t.y) / 2 - 8,
  };
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
 * Renders the generated reaction diagram. The aria-label spells the flow
 * out in words — an SVG with no text alternative fails the exact users
 * this product is built for.
 */
export function SummaryFlowchart({ data }: { data: VisualSummaryData }) {
  const positions = new Map(
    data.nodes.map((node, i) => [node.id, positionFor(node.id, i)])
  );
  const labels = new Map(data.nodes.map((node) => [node.id, node.label]));

  const description = data.edges
    .map((edge) => `${labels.get(edge.from)} leads to ${labels.get(edge.to)}`)
    .join("; ");

  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      preserveAspectRatio="xMidYMid meet"
      className="h-auto w-full"
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

        const { d, mx, my } = edgePath(s, t);

        return (
          <g
            key={`${data.title}-${edge.from}-${edge.to}`}
            className="focusaid-flow-part"
            style={{ animationDelay: "240ms" }}
          >
            <path
              d={d}
              fill="none"
              strokeWidth={1.5}
              className="stroke-zinc-300 dark:stroke-zinc-600"
              markerEnd="url(#focusaid-flow-arrow)"
            />
            {edge.label && (
              <text
                x={mx}
                y={my}
                textAnchor="middle"
                className="fill-zinc-400 text-[9px]"
              >
                {edge.label}
              </text>
            )}
          </g>
        );
      })}

      {data.nodes.map((node, i) => {
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
              y={pos.y - (lines.length - 1) * 6}
              textAnchor="middle"
              dominantBaseline="middle"
              className="fill-zinc-800 text-[11px] font-medium dark:fill-zinc-100"
            >
              {lines.map((line, li) => (
                <tspan key={li} x={pos.x} dy={li === 0 ? 0 : "1.15em"}>
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
