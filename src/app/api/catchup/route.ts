import Anthropic from "@anthropic-ai/sdk";
import { transcript } from "@/data/transcript";
import { generateCatchUp } from "@/lib/catchup";
import type { CatchUpResult } from "@/types";

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
  },
  required: ["title", "bullets", "keyIdea"],
  additionalProperties: false,
} as const;

const SYSTEM_PROMPT = `Summarise missed lesson content for a Deaf student who reads captions.

Rules:
- Plain language and short sentences.
- No idioms, and no references to hearing ("as you heard", "as mentioned").
- Three bullets maximum.
- The key idea is one sentence: the single most important takeaway.`;

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
  const local = generateCatchUp(transcript, start, end);

  if (!process.env.ANTHROPIC_API_KEY || local.bullets.length === 0) {
    return Response.json({ ...local, source: "local" });
  }

  try {
    const client = new Anthropic({
      // Fail fast and fall back rather than leaving the student waiting.
      timeout: 6000,
      maxRetries: 0,
    });

    const passage = transcript
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
          content: `The student missed this part of a biology lesson on photosynthesis:\n\n"${passage}"\n\nSummarise what they missed.`,
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
    };

    const result: CatchUpResult = {
      title: parsed.title?.trim() || local.title,
      bullets: parsed.bullets?.length ? parsed.bullets.slice(0, 3) : local.bullets,
      keyIdea: parsed.keyIdea?.trim() || local.keyIdea,
      startTime: start,
      endTime: end,
    };

    return Response.json({ ...result, source: "ai" });
  } catch (error) {
    console.error("[api/catchup] falling back to the local result:", error);
    return Response.json({ ...local, source: "local" });
  }
}
