import Anthropic from "@anthropic-ai/sdk";
import { transcript } from "@/data/transcript";
import { generateCatchUp } from "@/lib/catchup";
import type { CatchUpResult, TranscriptItem } from "@/types";

/**
 * Owned by the Catch-up feature team (PC2).
 *
 * Generates the "what did I miss?" summary. The local, deterministic
 * result is computed first and returned whenever the AI path is
 * unavailable, disabled, slow, or malformed — the demo must never depend
 * on a network call, so every failure mode returns a usable summary
 * rather than an error.
 */

const MODEL = "claude-opus-5";

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
- Plain language and short sentences.
- No idioms, and no references to hearing ("as you heard", "as mentioned").
- Three bullets maximum.
- The key idea is one sentence: the single most important takeaway.
- The bridge answers "how did we get here": one to two sentences narrating
  the path from the start of the passage to the end, in order — connective
  tissue between topics, not a third list of facts.`;

const MAX_CLIENT_ITEMS = 60;
const MAX_ITEM_TEXT_LENGTH = 2000;

/**
 * Lines sent by the client (a YouTube video's captions) in place of the
 * mock lesson. Anything malformed or oversized is rejected, not trusted.
 */
function parseClientItems(value: unknown): TranscriptItem[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_CLIENT_ITEMS) {
    return null;
  }
  const items: TranscriptItem[] = [];
  for (const [index, raw] of value.entries()) {
    const start = Number(raw?.start);
    const end = Number(raw?.end);
    const text = typeof raw?.text === "string" ? raw.text.slice(0, MAX_ITEM_TEXT_LENGTH) : "";
    if (!Number.isFinite(start) || !Number.isFinite(end) || !text) return null;
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

  try {
    const body = await request.json();
    start = Number(body?.start) || 0;
    end = Number(body?.end) || 0;
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

  const source = clientItems ?? transcript;
  const lessonDescription = clientItems
    ? "a video lesson"
    : "a biology lesson on photosynthesis";

  // Deterministic result first — this is what ships if anything below
  // fails, and what the demo runs on when no API key is configured.
  const local = generateCatchUp(source, start, end);

  if (!process.env.ANTHROPIC_API_KEY || local.bullets.length === 0) {
    return Response.json({ ...local, source: "local" });
  }

  try {
    const client = new Anthropic({
      // Fail fast and fall back rather than leaving the student waiting.
      timeout: 6000,
      maxRetries: 0,
    });

    const passage = source
      .filter((item) => item.end > start && item.start < end)
      .map((item) => item.text)
      .join(" ");

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      // Three bullets and a key idea — low effort keeps it fast without
      // costing quality on a task this small.
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
      return Response.json({ ...local, source: "local" });
    }

    const text = response.content.find((block) => block.type === "text");
    if (!text) return Response.json({ ...local, source: "local" });

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
    console.error("[api/catchup] falling back to the local result:", error);
    return Response.json({ ...local, source: "local" });
  }
}
