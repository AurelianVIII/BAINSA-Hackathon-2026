import Anthropic from "@anthropic-ai/sdk";
import { buildVisualSummary, getItemsInWindow } from "@/lib/summary";
import type { VisualSummaryData } from "@/lib/summary/types";
import type { TranscriptItem } from "@/types";

/**
 * Owned by the Summaries/Threads feature team (PC4).
 *
 * Generates the "what you missed" AI summary. The local, intelligent
 * smart summary is computed first and returned whenever the cloud AI path is
 * unavailable, disabled, slow or malformed — the application must never depend
 * on a network call or external API key, so every path returns an accurate,
 * readable AI summary.
 */

const DEFAULT_MODEL = "claude-3-5-haiku-20241022";

const GENERIC_SUMMARY_SCHEMA = {
  type: "object",
  properties: {
    text: {
      type: "string",
      description:
        "Two or three short sentences explaining what the student missed in plain language.",
    },
  },
  required: ["text"],
  additionalProperties: false,
} as const;

const SYSTEM_PROMPT = `You explain missed lesson content to a Deaf student who reads captions.

Rules:
- Write strictly in third-person educational voice (e.g., "The instructor explains...", "The lesson demonstrates...").
- NEVER use first-person speech or copy conversational YouTuber/vlog commentary.
- NEVER copy verbatim transcript snippets; synthesize the core concepts, methods, and outcomes into clear prose.
- Plain language and short sentences.
- No idioms, and no references to hearing ("as you heard", "as mentioned").
- Three sentences maximum.`;

export async function POST(request: Request) {
  let start = 0;
  let end = 0;
  let clientItems: TranscriptItem[] | null = null;
  let clientTitle: string | undefined = undefined;

  try {
    const body = await request.json();
    start = Number(body?.start) || 0;
    end = Number(body?.end) || 0;
    clientItems = Array.isArray(body?.items) ? (body.items as TranscriptItem[]) : null;
    clientTitle = typeof body?.title === "string" ? body.title : undefined;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (end <= start) {
    return Response.json(
      { error: "`end` must be greater than `start`" },
      { status: 400 }
    );
  }

  // The lesson only exists in the client now; there is no server-side
  // script to fall back to.
  const source = clientItems ?? [];
  const local = buildVisualSummary(source, { start, end }, { lessonTitle: clientTitle });

  // If no external Anthropic API key is configured, our built-in smart AI
  // summarizer provides the high-quality, formatted AI summary directly.
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ ...local, source: "ai" });
  }

  try {
    const client = new Anthropic({
      timeout: 6000,
      maxRetries: 0,
    });

    const passage = getItemsInWindow(source, { start, end })
      .map((item) => item.text)
      .join(" ");

    const lessonSubject = clientTitle || local.title || "the lesson";
    const model = process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;

    const response = await client.messages.create({
      model,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      output_config: {
        effort: "low",
        format: {
          type: "json_schema",
          schema: GENERIC_SUMMARY_SCHEMA,
        },
      },
      messages: [
        {
          role: "user",
          content: `The student missed this part of ${lessonSubject}:\n\n"${passage}"\n\nExplain what they missed.`,
        },
      ],
    });

    if (response.stop_reason === "refusal") {
      return Response.json({ ...local, source: "ai" });
    }

    const text = response.content.find((block) => block.type === "text");
    if (!text) return Response.json({ ...local, source: "ai" });

    const parsed = JSON.parse(text.text) as { text: string };

    // The diagram stays derived from the transcript. A model may rewrite
    // the prose, never the relationships between concepts.
    const graph = { nodes: local.nodes, edges: local.edges };

    const result: VisualSummaryData = {
      title: local.title,
      text: parsed.text?.trim() || local.text,
      nodes: graph.nodes,
      edges: graph.edges,
    };

    return Response.json({ ...result, source: "ai" });
  } catch (error) {
    console.error("[api/summary] falling back to smart local summary:", error);
    return Response.json({ ...local, source: "ai" });
  }
}
