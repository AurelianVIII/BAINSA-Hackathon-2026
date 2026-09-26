import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { captionsToLesson, parseTimedText } from "@/lib/video/youtube-captions";

/**
 * GET /api/youtube/captions?videoId=<id>
 *
 * Fetches a YouTube video's real caption track server-side and returns it
 * in the app's CaptionChunk/TranscriptItem shapes.
 *
 * Strategy:
 * 1. Checks memory & disk cache for previously fetched captions.
 * 2. Attempts direct YouTube Player API to retrieve videoDetails (title, duration)
 *    and caption tracks.
 * 3. If direct YouTube timedtext fetches succeed, parses and uses them.
 * 4. If YouTube rate-limits direct timedtext (HTTP 429), fetches from the
 *    dedicated transcript extractor to get the authentic video transcript.
 * 5. Cleans rolling auto-generated duplicates and formats into synchronized
 *    captions and transcript items.
 * 6. If no captions exist for the video, returns an honest 404 so the user
 *    is prompted to use live transcription instead of showing unrelated mock text.
 */

const VIDEO_ID = /^[a-zA-Z0-9_-]{11}$/;
const REQUEST_TIMEOUT_MS = 8000;
const CACHE_DIR = join(tmpdir(), "focusaid-youtube-captions");
const memoryCache = new Map<string, unknown>();

async function readCache(videoId: string): Promise<unknown | null> {
  if (memoryCache.has(videoId)) return memoryCache.get(videoId);
  try {
    const cached = JSON.parse(await readFile(join(CACHE_DIR, `${videoId}.json`), "utf8"));
    memoryCache.set(videoId, cached);
    return cached;
  } catch {
    return null;
  }
}

async function writeCache(videoId: string, payload: unknown): Promise<void> {
  memoryCache.set(videoId, payload);
  try {
    await mkdir(CACHE_DIR, { recursive: true });
    await writeFile(join(CACHE_DIR, `${videoId}.json`), JSON.stringify(payload));
  } catch (error) {
    console.error("[api/youtube/captions] could not write cache:", error);
  }
}

const CLIENTS = [
  { clientName: "ANDROID", clientVersion: "20.10.38" },
  { clientName: "IOS", clientVersion: "20.10.4" },
];

interface CaptionTrack {
  baseUrl?: string;
  languageCode?: string;
  kind?: string;
}

/** English manual captions, then English auto-generated, then anything. */
function pickTrack(tracks: CaptionTrack[]): CaptionTrack | undefined {
  const english = tracks.filter((track) => track.languageCode?.startsWith("en"));
  return (
    english.find((track) => track.kind !== "asr") ??
    english[0] ??
    tracks.find((track) => track.kind !== "asr") ??
    tracks[0]
  );
}

function isYouTubeUrl(url: string): boolean {
  try {
    const { protocol, hostname } = new URL(url);
    return protocol === "https:" && (hostname === "youtube.com" || hostname.endsWith(".youtube.com"));
  } catch {
    return false;
  }
}

/**
 * Cleans up overlapping/repeating phrases common in raw YouTube auto-generated
 * speech-to-text frames so the student reads clean, non-stuttering sentences.
 */
function cleanRollingTranscript(raw: string): string {
  const words = raw.split(/\s+/).filter(Boolean);
  const result: string[] = [];
  let i = 0;
  while (i < words.length) {
    let foundRepeat = false;
    for (let len = Math.min(10, Math.floor((words.length - i) / 2)); len >= 2; len--) {
      let isRepeat = true;
      for (let k = 0; k < len; k++) {
        if (words[i + k]?.toLowerCase() !== words[i + len + k]?.toLowerCase()) {
          isRepeat = false;
          break;
        }
      }
      if (isRepeat) {
        result.push(...words.slice(i, i + len));
        i += len * 2;
        while (i + len <= words.length) {
          let more = true;
          for (let k = 0; k < len; k++) {
            if (words[i + k]?.toLowerCase() !== words[i - len + k]?.toLowerCase()) {
              more = false;
              break;
            }
          }
          if (more) i += len;
          else break;
        }
        foundRepeat = true;
        break;
      }
    }
    if (!foundRepeat) {
      if (words[i]?.toLowerCase() === words[i + 1]?.toLowerCase()) {
        result.push(words[i]);
        i += 2;
      } else {
        result.push(words[i]);
        i++;
      }
    }
  }
  return result.join(" ");
}

/**
 * Secondary transcript extractor when direct timedtext endpoint returns 429.
 */
async function fetchFromTranscriptAi(
  videoId: string,
  knownTitle: string | null,
  knownDuration: number | null
): Promise<{
  title: string | null;
  duration: number | null;
  segments: { start: number; end: number; text: string }[];
} | null> {
  try {
    const res = await fetch(`https://youtube-transcript.ai/transcript/${videoId}.txt`, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const raw = await res.text();

    const titleMatch = raw.match(/^# Transcript:\s*(.+)$/m);
    const title = knownTitle ?? (titleMatch ? titleMatch[1].trim() : null);

    const durMatch = raw.match(/Duration:\s*(\d+(?::\d+)+)/);
    let parsedDuration: number | null = null;
    if (durMatch) {
      const parts = durMatch[1].split(":").map(Number);
      if (parts.length === 2) parsedDuration = parts[0] * 60 + parts[1];
      else if (parts.length === 3) parsedDuration = parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
    const duration = knownDuration ?? parsedDuration;

    const blockRegex = /\[(\d+:\d+(?::\d+)?)\]\s*([\s\S]*?)(?=\[\d+:\d+(?::\d+)?\]|---|Generated by|$)/g;
    const blocks: { start: number; text: string }[] = [];
    let m: RegExpExecArray | null;
    while ((m = blockRegex.exec(raw)) !== null) {
      const parts = m[1].split(":").map(Number);
      const seconds =
        parts.length === 2
          ? parts[0] * 60 + parts[1]
          : parts[0] * 3600 + parts[1] * 60 + parts[2];
      const text = cleanRollingTranscript(m[2].replace(/\n+/g, " ").trim());
      if (text) blocks.push({ start: seconds, text });
    }

    if (blocks.length === 0) return null;

    const segments: { start: number; end: number; text: string }[] = [];
    const totalDuration = duration ?? (blocks[blocks.length - 1].start + 30);

    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      const nextStart = blocks[i + 1] ? blocks[i + 1].start : Math.max(b.start + 10, totalDuration);
      const blockDuration = Math.max(2, nextStart - b.start);
      const words = b.text.split(/\s+/).filter(Boolean);
      const chunkWordCount = 12;
      const chunkCount = Math.max(1, Math.round(words.length / chunkWordCount));
      const wordsPerChunk = Math.ceil(words.length / chunkCount);
      for (let c = 0; c < chunkCount; c++) {
        const chunkWords = words.slice(c * wordsPerChunk, (c + 1) * wordsPerChunk);
        if (chunkWords.length === 0) continue;
        const cStart = b.start + (c / chunkCount) * blockDuration;
        const cEnd = b.start + ((c + 1) / chunkCount) * blockDuration;
        segments.push({
          start: Math.round(cStart * 10) / 10,
          end: Math.round(cEnd * 10) / 10,
          text: chunkWords.join(" "),
        });
      }
    }

    return { title, duration: totalDuration, segments };
  } catch (err) {
    console.error("[api/youtube/captions] transcript.ai fallback failed:", err);
    return null;
  }
}

export async function GET(request: Request) {
  const videoId = new URL(request.url).searchParams.get("videoId") ?? "";
  if (!VIDEO_ID.test(videoId)) {
    return Response.json({ error: "Invalid videoId" }, { status: 400 });
  }

  const cached = await readCache(videoId);
  if (cached) return Response.json(cached);

  let title: string | null = null;
  let duration: number | null = null;

  // 1. First attempt: Query YouTube Player API
  for (const client of CLIENTS) {
    try {
      const playerResponse = await fetch(
        "https://www.youtube.com/youtubei/v1/player?prettyPrint=false",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ context: { client: { ...client, hl: "en" } }, videoId }),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
          cache: "no-store",
        }
      );
      if (!playerResponse.ok) continue;

      const player = await playerResponse.json();
      title ??= player?.videoDetails?.title ?? null;
      const lengthSeconds = Number(player?.videoDetails?.lengthSeconds);
      if (!duration && lengthSeconds > 0) duration = lengthSeconds;

      const tracks: CaptionTrack[] =
        player?.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
      const track = pickTrack(tracks);
      if (!track?.baseUrl || !isYouTubeUrl(track.baseUrl)) continue;

      const trackResponse = await fetch(track.baseUrl, {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        cache: "no-store",
      });
      if (!trackResponse.ok) continue;

      const segments = parseTimedText(await trackResponse.text());
      if (segments.length === 0) continue;

      const { captions, items } = captionsToLesson(segments);
      const payload = {
        videoId,
        title,
        duration,
        language: track.languageCode ?? null,
        autoGenerated: track.kind === "asr",
        captions,
        items,
      };
      await writeCache(videoId, payload);
      return Response.json(payload);
    } catch (error) {
      console.error(`[api/youtube/captions] ${client.clientName} direct track failed:`, error);
    }
  }

  // 2. Second attempt: Fetch authentic transcript when YouTube direct timedtext was blocked
  const transcriptAiData = await fetchFromTranscriptAi(videoId, title, duration);
  if (transcriptAiData && transcriptAiData.segments.length > 0) {
    const { captions, items } = captionsToLesson(transcriptAiData.segments);
    const payload = {
      videoId,
      title: transcriptAiData.title ?? title ?? "YouTube Lesson",
      duration: transcriptAiData.duration ?? duration ?? null,
      language: "en",
      autoGenerated: true,
      captions,
      items,
    };
    await writeCache(videoId, payload);
    return Response.json(payload);
  }

  // 3. No captions found for this video
  return Response.json(
    {
      videoId,
      title: title ?? "YouTube Video",
      duration: duration ?? null,
      error: "No captions could be retrieved for this video. You can transcribe it live with your microphone.",
    },
    { status: 404 }
  );
}
