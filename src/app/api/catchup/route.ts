import Anthropic from "@anthropic-ai/sdk";
import { generateCatchUp } from "@/lib/catchup";
import type { CatchUpResult, TranscriptItem } from "@/types";

/**
 * Owned by the Catch-up feature team (PC2).
 *
 * Generates the "what did I miss?" summary. The smart local result
 * is computed first and returned whenever the cloud AI path is
 * unavailable, disabled, slow, or malformed — catching up must never depend
 * on a network call, so every path returns a usable summary.
 */

const DEFAULT_MODEL = "claude-3-5-haiku-20241022";

const CATCHUP_SCHEMA = {
  type: "object",
  properties: {
    title: {
      type: "string",
      description: "Short topic label for the missed passage.",
    },
    bullets: {
      type: "array",
      description: "Up to 3 short, plain-language bullets summarising what was missed.",
      items: { type: "string" },
      maxItems: 3,
    },
    keyIdea: {
      type: "string",
      description: "One sentence: the single most important idea from the passage.",
    },
    bridge: {
      type: "string",
      description:
        "One to two sentences explaining how the lesson moved from the start of the missed passage to the end — the throughline connecting the topics in order, not another fact list.",
    },
  },
  required: ["title", "bullets", "keyIdea", "bridge"],
  additionalProperties: false,
} as const;

const SYSTEM_PROMPT = `Summarise missed lesson content for a Deaf student who reads captions.

Rules:
- Synthesize in objective, third-person educational language.
- CRITICAL: Never copy verbatim first-person speech quotes or conversational snippets (e.g. do NOT write "Today I'm forcing...", "You guys may have noticed...", "I'm going to...").
- Filter out YouTube banter, filler words, gaming commentary, and sponsor mentions.
- Plain language and clear sentences.
- No idioms, and no references to hearing ("as you heard", "as mentioned").
- Three bullets maximum: each should be an informative conceptual takeaway with context.
- The key idea is one sentence: the single most important takeaway.
- The bridge answers "how did we get here": one to two sentences narrating
  the path from the start of the passage to the end, in order — connective
  tissue between topics, not a third list of facts.`;

const MAX_CLIENT_ITEMS = 60;
const MAX_ITEM_TEXT_LENGTH = 2000;

/**
 * Lines sent by the client (a YouTube video's captions) in place of the
 * lesson running in the client. Anything malformed or oversized is rejected.
 */
function parseClientItems(value: unknown): TranscriptItem[] | null {
  if (!Array.isArray(value) || value.length > MAX_CLIENT_ITEMS) {
    return null;
  }
  const items: TranscriptItem[] = [];
  for (const [index, raw] of value.entries()) {
    const start = Number(raw?.start);
    const end = Number(raw?.end);
    const text = typeof raw?.text === "string" ? raw.text.slice(0, MAX_ITEM_TEXT_LENGTH) : "";
    if (!Number.isFinite(start) || !Number.isFinite(end) || !text) continue;
    items.push({
      id: `client-${index}`,
      start,
      end,
      text,
      topic: typeof raw?.topic === "string" ? raw.topic.slice(0, 100) : "What you missed",
    });
  }
  return items;
}

export async function POST(request: Request) {
  let start = 0;
  let end = 0;
  let clientItems: TranscriptItem[] | null = null;
  let clientTitle: string | undefined = undefined;

  try {
    const body = await request.json();
    start = Number(body?.start) || 0;
    end = Number(body?.end) || 0;
    clientTitle = typeof body?.title === "string" ? body.title : undefined;
    if (body?.items !== undefined) {
      clientItems = parseClientItems(body.items);
      if (!clientItems) {
        return Response.json({ error: "Invalid `items`" }, { status: 400 });
      }
    }
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
  const lessonDescription = clientTitle || "the lesson";

  // Local smart catch-up result
  const local = generateCatchUp(source, start, end, clientTitle);

  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ ...local, source: "ai" });
  }

  try {
    const client = new Anthropic({
      timeout: 6000,
      maxRetries: 0,
    });

    const passage = source
      .filter((item) => item.end > start && item.start < end)
      .map((item) => item.text)
      .join(" ");

    if (!passage.trim()) {
      return Response.json({ ...local, source: "ai" });
    }

    const model = process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;

    const response = await client.messages.create({
      model,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      output_config: {
        effort: "low",
        format: { type: "json_schema", schema: CATCHUP_SCHEMA },
      },
      messages: [
        {
          role: "user",
          content: `The student missed this part of ${lessonDescription}:\n\n"${passage}"\n\nSummarise what they missed.`,
        },
      ],
    });

    if (response.stop_reason === "refusal") {
      return Response.json({ ...local, source: "ai" });
    }

    const text = response.content.find((block) => block.type === "text");
    if (!text) return Response.json({ ...local, source: "ai" });

    const parsed = JSON.parse(text.text) as {
      title: string;
      bullets: string[];
      keyIdea: string;
      bridge?: string;
    };

    const result: CatchUpResult = {
      title: parsed.title?.trim() || local.title,
      bullets: parsed.bullets?.length ? parsed.bullets.slice(0, 3) : local.bullets,
      keyIdea: parsed.keyIdea?.trim() || local.keyIdea,
      bridge: parsed.bridge?.trim() || local.bridge,
      startTime: start,
      endTime: end,
    };

    return Response.json({ ...result, source: "ai" });
  } catch (error) {
    console.error("[api/catchup] falling back to smart local result:", error);
    return Response.json({ ...local, source: "ai" });
  }
}
