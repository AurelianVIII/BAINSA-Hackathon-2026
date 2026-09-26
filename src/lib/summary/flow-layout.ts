/**
 * Owned by the Summaries/Threads feature team (PC4).
 *
 * Hand-placed coordinates for the summary flowchart. Eight nodes do not
 * need a layout algorithm, and hand-placing them reads better than
 * anything generated. Coordinates are box centres inside the SVG viewBox.
 *
 * The main reaction chain runs straight along y=120; side inputs sit
 * above it and the oxygen byproduct below, so every edge stays short.
 */

export const VIEW_W = 720;
export const VIEW_H = 240;
export const NODE_W = 120;
export const NODE_H = 54;

export const NODE_POS: Record<string, { x: number; y: number }> = {
  sun: { x: 60, y: 120 },
  water: { x: 60, y: 40 },
  light: { x: 210, y: 120 },
  oxygen: { x: 360, y: 200 },
  atp: { x: 360, y: 120 },
  co2: { x: 510, y: 40 },
  calvin: { x: 510, y: 120 },
  glucose: { x: 660, y: 120 },
};

/**
 * Position lookup with a fallback, so an unknown node id — e.g. one
 * invented by the AI path — lays out in a readable row instead of
 * collapsing onto 0,0.
 */
export function positionFor(
  id: string,
  index: number
): { x: number; y: number } {
  return NODE_POS[id] ?? { x: 60 + index * 150, y: 120 };
}
