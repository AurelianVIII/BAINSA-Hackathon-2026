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
      outputFacialTransformationMatrixes: false,
      runningMode: "VIDEO",
      numFaces: 1,
    })
  );
  return landmarkerPromise;
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
const BROW_FURROW_GAIN = 1.8;

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
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
  const headGaze = 1 - clamp01(Math.abs(yawOffset) * HEAD_YAW_SENSITIVITY);

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
