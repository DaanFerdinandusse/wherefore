"use client";

import { useCallback, useEffect, useRef } from "react";

import type { ChatSnapshot } from "@/lib/contracts";

import { useTripStore, useTripStoreApi } from "../store";

import { isSeeding, kickOffSeed, SEED_POLL_LIMIT, SEED_POLL_MS, shouldKickOff } from "./seed";
import type { WorkspaceActions } from "./use-workspace-actions";

function sessionStorageOrNull(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/**
 * Starts the seed turn once on mount (see seed.ts) and polls the snapshot
 * every 3 s while the seed is pending or running, until it is done or failed.
 * The dock streams the same places live; the poll is the fallback. Returns
 * `retry`, which re-posts the seed message for "Could not build the first list".
 */
export function useSeed(chat: ChatSnapshot["chat"], actions: WorkspaceActions) {
  const store = useTripStoreApi();
  const seedStatus = useTripStore((s) => s.trip.seedStatus);
  const posted = useRef(false);
  // A retry flips the board back to pending before the server has picked the
  // turn up; a "failed" snapshot inside this window is the old answer.
  const retriedAt = useRef(0);

  const post = useCallback(
    async (force: boolean) => {
      const { trip } = store.getState();
      const result = await kickOffSeed({
        chatId: trip.chatId,
        fetchImpl: (input, init) => fetch(input, init),
        storage: sessionStorageOrNull(),
        newId: () => crypto.randomUUID(),
        force,
      });
      if (result === "failed") store.getState().setSeedStatus("failed");
    },
    [store],
  );

  useEffect(() => {
    if (posted.current) return;
    posted.current = true;
    if (shouldKickOff(store.getState().trip, chat)) void post(false);
  }, [chat, post, store]);

  useEffect(() => {
    if (!isSeeding(seedStatus)) return;
    let polls = 0;
    let stopped = false;
    const timer = window.setInterval(async () => {
      if (stopped) return;
      polls += 1;
      const keepSeeding = Date.now() - retriedAt.current < 20_000;
      const snapshot = await actions.refetchSnapshot({ keepSeeding }).catch(() => null);
      if (stopped) return;
      if (snapshot && !isSeeding(snapshot.trip.seedStatus)) return;
      if (polls >= SEED_POLL_LIMIT) store.getState().setSeedStatus("failed");
    }, SEED_POLL_MS);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [seedStatus, actions, store]);

  const retry = useCallback(() => {
    retriedAt.current = Date.now();
    store.getState().setSeedStatus("pending");
    void post(true);
  }, [post, store]);

  return { retry };
}
