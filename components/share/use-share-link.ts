"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { readShareError, shareRequest } from "./share-client";

// The traveler link of a trip: create it (and copy it), copy it again, stop
// sharing. Each change refreshes the route so the server snapshot (share
// token, stage) follows. Problems go to `say` as plain sentences.

export type ShareLink = {
  url: string | undefined;
  busy: boolean;
  /** Creates the link and copies it. Resolves the link, or null after saying what went wrong. */
  create: () => Promise<string | null>;
  copy: (link?: string) => Promise<boolean>;
  stop: () => Promise<boolean>;
};

/** "wherefore.app/s/7pXq2mLk": the link without its scheme, for display. */
export function displayLink(url: string): string {
  return url.replace(/^https?:\/\//, "");
}

export function useShareLink(tripId: string, shareUrl: string | undefined, say: (message: string) => void): ShareLink {
  const router = useRouter();
  const [url, setUrl] = useState(shareUrl);
  const [busy, setBusy] = useState(false);

  // A new prop from the server (another tab shared or stopped) wins.
  const [lastProp, setLastProp] = useState(shareUrl);
  if (shareUrl !== lastProp) {
    setLastProp(shareUrl);
    setUrl(shareUrl);
  }

  async function copy(link = url): Promise<boolean> {
    if (!link) return false;
    try {
      await navigator.clipboard.writeText(link);
      return true;
    } catch {
      say("Copy did not work. Select the link and copy it by hand.");
      return false;
    }
  }

  async function create(): Promise<string | null> {
    setBusy(true);
    try {
      const response = await shareRequest(tripId, "POST");
      if (!response.ok) {
        say(await readShareError(response, "Could not create the link. Try again."));
        return null;
      }
      const body: unknown = await response.json();
      const link = typeof body === "object" && body && "url" in body && typeof body.url === "string" ? body.url : null;
      if (!link) {
        say("Could not create the link. Try again.");
        return null;
      }
      setUrl(link);
      await copy(link);
      router.refresh();
      return link;
    } catch {
      say("Could not reach the server. Check your connection and try again.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function stop(): Promise<boolean> {
    setBusy(true);
    try {
      const response = await shareRequest(tripId, "DELETE");
      if (!response.ok) {
        say(await readShareError(response, "Could not stop sharing. Try again."));
        return false;
      }
      setUrl(undefined);
      say("Sharing stopped. The old link no longer opens.");
      router.refresh();
      return true;
    } catch {
      say("Could not reach the server. Check your connection and try again.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  return { url, busy, create, copy, stop };
}
