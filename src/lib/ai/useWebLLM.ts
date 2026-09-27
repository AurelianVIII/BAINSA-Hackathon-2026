"use client";

import { useEffect } from "react";
import { useSyncExternalStore } from "react";
import {
  getWebLLMState,
  getWebLLMServerState,
  subscribe,
  isWebGPUAvailable,
  loadWebLLM,
  type WebLLMState,
} from "./webllm-client";

const noopSubscribe = () => () => {};

export function useWebGPUAvailable(): boolean {
  return useSyncExternalStore(noopSubscribe, isWebGPUAvailable, () => false);
}

export function useWebLLM(): WebLLMState {
  return useSyncExternalStore(subscribe, getWebLLMState, getWebLLMServerState);
}

/**
 * Automatically starts loading the WebGPU LLM when the component mounts,
 * if WebGPU is available. This should be called once at the app level.
 */
export function useAutoLoadWebLLM() {
  const available = useWebGPUAvailable();
  const state = useWebLLM();

  useEffect(() => {
    if (available && state.status === "idle") {
      loadWebLLM();
    }
  }, [available, state.status]);

  return state;
}
