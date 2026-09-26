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

/** Eye-direction blendshapes: all near 0 when looking straight at the camera. */
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

/**
 * Turns one Face Landmarker video frame into our AttentionSample shape.
 * A deliberately simple heuristic over real detected face signals, not a
 * validated attention model:
 * - gaze: 1 minus the strongest "looking away from centre" eye blendshape.
 * - confusion: average brow-furrow blendshape score.
 * - engagement: facing-screen (gaze) blended with eyes-open (not blinking).
 *
 * Returns null when no face is detected in the frame.
 */
export function sampleFromFaceLandmarkerResult(
  result: FaceLandmarkerResult,
  t: number
): AttentionSample | null {
  if (!result.faceBlendshapes || result.faceBlendshapes.length === 0) return null;

  const gazeAway = Math.max(...GAZE_AWAY_SHAPES.map((name) => blendshapeScore(result, name)));
  const gaze = 1 - gazeAway;

  const confusion =
    (blendshapeScore(result, "browDownLeft") + blendshapeScore(result, "browDownRight")) / 2;

  const blink =
    (blendshapeScore(result, "eyeBlinkLeft") + blendshapeScore(result, "eyeBlinkRight")) / 2;

  const engagement = Math.min(1, Math.max(0, gaze * 0.6 + (1 - blink) * 0.4));

  return { t, gaze, confusion, engagement };
}
