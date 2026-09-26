import Anthropic from "@anthropic-ai/sdk";
import { transcript } from "@/data/transcript";
import {
  DIAGRAM_NODE_IDS,
  buildVisualSummary,
  getItemsInWindow,
  graphForNodeIds,
} from "@/lib/summary";
import type { VisualSummaryData } from "@/lib/summary/types";

/**
 * Owned by the Summaries/Threads feature team (PC4).
 *
 * Generates the "what you missed" summary. The local, deterministic
 * result is computed first and returned whenever the AI path is
 * unavailable, disabled, slow or malformed — the demo must never depend
 * on a network call, so every failure mode returns a usable summary
 * rather than an error.
 */

const MODEL = "claude-opus-5";

/**
 * The model writes the prose and chooses which part of the chain to
 * show. Node ids are constrained to the ones the diagram can lay out, so
 * a generated summary can never produce something unrenderable.
 */
const SUMMARY_SCHEMA = {
  type: "object",
  properties: {
    text: {
      type: "string",
      description:
        "Two or three short sentences explaining the passage in plain language.",
    },
    nodeIds: {
      type: "array",
      description:
        "Which steps of the photosynthesis chain this passage is about, in reaction order.",
      items: { type: "string", enum: DIAGRAM_NODE_IDS },
    },
  },
  required: ["text", "nodeIds"],
  additionalProperties: false,
} as const;

const SYSTEM_PROMPT = `You explain missed lesson content to a Deaf student who reads captions.

Rules:
- Plain language and short sentences.
- No idioms, and no references to hearing ("as you heard", "as mentioned").
- Three sentences maximum.
- Explain the concept; do not simply repeat the teacher's wording.`;

export async function POST(request: Request) {
  let start = 0;
  let end = 0;

  try {
    const body = await request.json();
    start = Number(body?.start) || 0;
    end = Number(body?.end) || 0;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (end <= start) {
    return Response.json(
      { error: "`end` must be greater than `start`" },
      { status: 400 }
    );
  }

  // Deterministic result first — this is what ships if anything below
  // fails, and what the demo runs on when no API key is configured.
  const local = buildVisualSummary(transcript, { start, end });

  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ ...local, source: "local" });
  }

  try {
    const client = new Anthropic({
      // Fail fast and fall back rather than leaving the student waiting.
      timeout: 6000,
      maxRetries: 0,
    });

    const passage = getItemsInWindow(transcript, { start, end })
      .map((item) => item.text)
      .join(" ");

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      // Three sentences and a node list — low effort keeps it fast
      // without costing quality on a task this small.
      output_config: {
        effort: "low",
        format: { type: "json_schema", schema: SUMMARY_SCHEMA },
      },
      messages: [
        {
          role: "user",
          content: `The student missed this part of a biology lesson on photosynthesis:\n\n"${passage}"\n\nExplain what they missed.`,
        },
      ],
    });

    if (response.stop_reason === "refusal") {
      return Response.json({ ...local, source: "local" });
    }

    const text = response.content.find((block) => block.type === "text");
    if (!text) return Response.json({ ...local, source: "local" });

    const parsed = JSON.parse(text.text) as {
      text: string;
      nodeIds: string[];
    };

    const graph = graphForNodeIds(parsed.nodeIds ?? []);

    const result: VisualSummaryData = {
      title: local.title,
      text: parsed.text?.trim() || local.text,
      nodes: graph.nodes,
      edges: graph.edges,
    };

    return Response.json({ ...result, source: "ai" });
  } catch (error) {
    console.error("[api/summary] falling back to the local summary:", error);
    return Response.json({ ...local, source: "local" });
  }
}
