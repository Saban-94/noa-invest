import { useSyncExternalStore } from "react";

export type Approval = {
  rami?: { at: string; note?: string | undefined };
  harel?: { at: string; note?: string | undefined };
  closed?: string;
};
type State = Record<string, Approval>;

let state: State = {};
const subs = new Set<() => void>();
const KEY = "saban-approvals-v1";

if (typeof window !== "undefined") {
  try {
    state = JSON.parse(localStorage.getItem(KEY) || "{}");
  } catch {
    state = {};
  }
}

function set(next: State) {
  state = next;
  if (typeof window !== "undefined") localStorage.setItem(KEY, JSON.stringify(state));
  subs.forEach((f) => f());
}

const stamp = () => new Date().toLocaleString("he-IL", { dateStyle: "short", timeStyle: "short" });

import { submitApproval } from "./api";

export const approvals = {
  rami: (id: string, note?: string) => {
    set({ ...state, [id]: { ...state[id], rami: { at: stamp(), note } } });
    void submitApproval(id, "rami", note);
  },
  harel: (id: string, note?: string) => {
    set({ ...state, [id]: { ...state[id], harel: { at: stamp(), note } } });
    void submitApproval(id, "harel", note);
  },
  close: (id: string) => set({ ...state, [id]: { ...state[id], closed: stamp() } }),
  reset: (id: string) => {
    const { [id]: _, ...rest } = state;
    set(rest);
  },
};

const empty: State = {};
export function useApprovals(): State {
  return useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    () => state,
    () => empty,
  );
}

import { playDispatchChime, playUrgentSignatureAlarm } from "./audio-alerts";

export function playAlert() {
  playDispatchChime();
}

export { playDispatchChime, playUrgentSignatureAlarm };
export { flushPendingApprovals } from "./api";
