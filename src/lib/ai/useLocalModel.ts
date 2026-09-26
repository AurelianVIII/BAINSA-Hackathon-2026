"use client";

import { useSyncExternalStore } from "react";
import {
  getServerState,
  getState,
  isWebGpuAvailable,
  subscribe,
  type LocalModelState,
} from "./local-model";

const noopSubscribe = () => () => {};

/**
 * Whether this browser can run the on-device model at all.
 *
 * Read through `useSyncExternalStore` rather than an effect: the answer
 * differs between server and client, and setting it in an effect both
 * flashes the wrong state and trips React 19's set-state-in-effect rule.
 */
export function useWebGpuAvailable(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    isWebGpuAvailable,
    () => false
  );
}

export function useLocalModel(): LocalModelState {
  return useSyncExternalStore(subscribe, getState, getServerState);
}
