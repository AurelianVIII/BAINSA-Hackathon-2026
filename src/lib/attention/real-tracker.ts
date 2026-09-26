import {
  FaceLandmarker,
  FilesetResolver,
  type FaceLandmarkerResult,
} from "@mediapipe/tasks-vision";
import type { AttentionSample } from "@/types";

const WASM_BASE_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

let landmarkerPromise: Promise<FaceLandmarker> | null = null;

/**
 * Loads (once, cached module-wide) MediaPipe's Face Landmarker for live
 * video. CPU delegate, not GPU: at the throttled inference rate this runs
 * at (see AttentionTracker), CPU is fast enough and avoids GPU-init
 * failures on devices/browsers without a WebGL/WebGPU delegate available.
 */
export function loadFaceLandmarker(): Promise<FaceLandmarker> {
  landmarkerPromise ??= FilesetResolver.forVisionTasks(WASM_BASE_URL).then((fileset) =>
    FaceLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate: "CPU" },
      outputFaceBlendshapes: true,
      // Gives a real 6-DOF head pose, which is a far better "is the head
      // turned away" signal than nose-offset in image space. The model
      // already fits this transform internally to place the canonical
      // mesh, so asking for it returns existing work rather than adding a
      // second solve.
      outputFacialTransformationMatrixes: true,
      runningMode: "VIDEO",
      numFaces: 1,
    })
  );
  return landmarkerPromise;
}

/**
 * MediaPipe's VIDEO-mode `detectForVideo` requires every timestamp given to
 * a particular landmarker instance to be strictly greater than the last one
 * it received — enforced inside the compiled WASM graph runner, so it
 * throws there rather than failing in a way a caller's own try/catch can
 * anticipate. `landmarkerPromise` above is a module-wide singleton that
 * outlives any one component mount, so this guard lives at the same scope:
 * React 18 Strict Mode's dev double-effect-invocation can briefly run two
 * independent rAF loops against that same shared instance, and each loop's
 * own local timing state has no way to know about the other's calls.
 */
let lastVideoTimestampMs = -1;

/**
 * Runs Face Landmarker VIDEO-mode inference for one frame, guarding the
 * timestamp requirement above. Returns null (treated the same as "no face
 * detected") instead of throwing if the video has no decoded frame yet.
 */
export function detectForVideo(
  landmarker: FaceLandmarker,
  video: HTMLVideoElement,
  timestampMs: number
): FaceLandmarkerResult | null {
  if (video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0) {
    return null;
  }
  const safeTimestamp = Math.max(Math.round(timestampMs), lastVideoTimestampMs + 1);
  lastVideoTimestampMs = safeTimestamp;
  return landmarker.detectForVideo(video, safeTimestamp);
}

function blendshapeScore(result: FaceLandmarkerResult, name: string): number {
  return result.faceBlendshapes?.[0]?.categories.find((c) => c.categoryName === name)?.score ?? 0;
}

/** Eye-direction blendshapes: all near 0 both when centered AND when eyes are
 *  closed (no coherent direction signal) — must be gated by eye-openness,
 *  see `sampleFromFaceLandmarkerResult`. */
const GAZE_AWAY_SHAPES = [
  "eyeLookInLeft",
  "eyeLookInRight",
  "eyeLookOutLeft",
  "eyeLookOutRight",
  "eyeLookUpLeft",
  "eyeLookUpRight",
  "eyeLookDownLeft",
  "eyeLookDownRight",
];

/** Standard MediaPipe Face Mesh topology indices — stable across the 468/478
 *  point model regardless of which task (blendshapes on/off) is running. */
const NOSE_TIP = 1;
const LEFT_FACE_EDGE = 234;
const RIGHT_FACE_EDGE = 454;

/** Tuning knobs — rough first-pass guesses, not calibrated against a real
 *  camera (no camera in this dev environment). Expect to adjust these
 *  against how they actually feel once tested live. */
const HEAD_YAW_SENSITIVITY = 3.5;
/** Head-pose alignment at or below which the head counts as fully turned
 *  away (~0.55 ≈ 57° off the camera axis). Uncalibrated, like the rest. */
const HEAD_ALIGNMENT_FLOOR = 0.55;
const BROW_FURROW_GAIN = 1.8;

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

/**
 * How squarely the head faces the camera, from the Face Landmarker's facial
 * transformation matrix: 1 is dead-on, 0 is turned a full 90° away.
 *
 * Only the (2,2) element of the rotation sub-matrix is used, divided by that
 * axis's length to cancel the matrix's scale. That element is the dot
 * product of the head's forward axis with the camera axis, and it is the one
 * element immune to the row- vs column-major ambiguity in this matrix: index
 * 10 addresses (2,2) under either layout, and (2,2) is unchanged by
 * transposition. So this reads correctly without having to guess a
 * convention that MediaPipe documents inconsistently.
 *
 * Unlike the nose-offset fallback this also captures pitch, so looking down
 * at notes registers as looking away — not just turning left or right.
 *
 * Returns null if the matrix is missing or is not a plausible pose, so the
 * caller can fall back.
 */
function headAlignment(result: FaceLandmarkerResult): number | null {
  const matrix = result.facialTransformationMatrixes?.[0];
  if (!matrix || matrix.rows !== 4 || matrix.columns !== 4) return null;

  const d = matrix.data;
  if (d.length < 16) return null;

  // Axis lengths of the rotation sub-matrix — equal to the uniform scale.
  const sx = Math.hypot(d[0], d[4], d[8]);
  const sy = Math.hypot(d[1], d[5], d[9]);
  const sz = Math.hypot(d[2], d[6], d[10]);
  if (!(sz > 1e-6) || !Number.isFinite(d[10])) return null;

  // A real pose is a uniform scale times a rotation. If the three axes
  // disagree, this is not the matrix shape assumed here — fall back rather
  // than report a confident wrong number.
  const spread = Math.max(sx, sy, sz) - Math.min(sx, sy, sz);
  if (spread > 0.25 * sz) return null;

  return clamp01(Math.abs(d[10]) / sz);
}

/**
 * Turns one Face Landmarker video frame into our AttentionSample shape.
 * A deliberately simple heuristic over real detected face signals, not a
 * validated attention model. Two signals feed "gaze to screen", combined
 * with `Math.min` since either one going low should count:
 *
 * - Head yaw: how far the nose tip sits off-centre between the left/right
 *   face edges, in image space. Eye blendshapes alone miss this — most
 *   real "looking away" is a head turn, not just the eyes darting sideways
 *   while the head stays still.
 * - Eye direction, gated by eye-openness: the eyeLook* blendshapes read as
 *   ~0 ("centred") both when actually centred AND when the eyes are
 *   closed — there's no direction signal either way. Multiplying by
 *   openness stops "eyes closed" from reading as "gaze locked on screen".
 *
 * Confusion is the stronger of brow-furrow or brow-raise, amplified —
 * both a furrowed ("processing this") and a raised ("wait, what?") brow
 * read as a non-neutral, questioning expression, and MediaPipe's raw
 * scores for either tend to sit well under 1.0 even when clearly visible.
 *
 * Returns null when no face is detected in the frame.
 */
export function sampleFromFaceLandmarkerResult(
  result: FaceLandmarkerResult,
  t: number
): AttentionSample | null {
  if (!result.faceBlendshapes?.length || !result.faceLandmarks?.length) return null;

  const landmarks = result.faceLandmarks[0];
  const nose = landmarks[NOSE_TIP];
  const leftEdge = landmarks[LEFT_FACE_EDGE];
  const rightEdge = landmarks[RIGHT_FACE_EDGE];
  const faceWidth = Math.abs(rightEdge.x - leftEdge.x) || 1;
  const yawOffset = (nose.x - (leftEdge.x + rightEdge.x) / 2) / faceWidth;

  // Prefer the real head pose; the image-space nose offset is the fallback.
  // That offset cannot tell a turned head from a student simply sitting off
  // to one side of the camera, ignores head tilt, and misses pitch entirely.
  const alignment = headAlignment(result);
  const headGaze =
    alignment === null
      ? 1 - clamp01(Math.abs(yawOffset) * HEAD_YAW_SENSITIVITY)
      : clamp01(
          (alignment - HEAD_ALIGNMENT_FLOOR) / (1 - HEAD_ALIGNMENT_FLOOR)
        );

  const blink =
    (blendshapeScore(result, "eyeBlinkLeft") + blendshapeScore(result, "eyeBlinkRight")) / 2;
  const eyeOpenness = 1 - blink;
  const eyeLookAway = Math.max(...GAZE_AWAY_SHAPES.map((name) => blendshapeScore(result, name)));
  const eyeGaze = (1 - eyeLookAway) * eyeOpenness;

  const gaze = Math.min(headGaze, eyeGaze);

  const browFurrow =
    (blendshapeScore(result, "browDownLeft") + blendshapeScore(result, "browDownRight")) / 2;
  const browRaise =
    (blendshapeScore(result, "browInnerUp") +
      blendshapeScore(result, "browOuterUpLeft") +
      blendshapeScore(result, "browOuterUpRight")) /
    3;
  const confusion = clamp01(Math.max(browFurrow, browRaise) * BROW_FURROW_GAIN);

  const engagement = clamp01(gaze * 0.7 + eyeOpenness * 0.3);

  return { t, gaze, confusion, engagement };
}
