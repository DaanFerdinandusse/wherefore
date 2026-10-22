"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Check, ChevronDown, Link2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Menu, MenuItem, MenuSeparator } from "@/components/ui/menu";
import { Toast } from "@/components/ui/toast";

import { readShareError, shareRequest } from "./share-client";

// "Share itinerary" in the trip top bar. Not shared yet: one press creates
// the traveler link and copies it. Shared: the button opens a small menu
// with the link, "Copy link" and "Stop sharing". Each change refreshes the
// route so the server snapshot (share token, stage) follows.

const TOAST_MS = 2600;

export function ShareButton({ tripId, shareUrl }: { tripId: string; shareUrl?: string }) {
  const router = useRouter();
  const [url, setUrl] = useState<string | undefined>(shareUrl);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // A new prop from the server (another tab shared or stopped) wins.
  const [lastProp, setLastProp] = useState(shareUrl);
  if (shareUrl !== lastProp) {
    setLastProp(shareUrl);
    setUrl(shareUrl);
  }

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), TOAST_MS);
    return () => window.clearTimeout(timer);
  }, [toast]);

  async function copy(link: string, success: string) {
    try {
      await navigator.clipboard.writeText(link);
      setToast(success);
    } catch {
      setToast("Copy did not work. Open the menu and copy the link from there.");
    }
  }

  async function createLink() {
    setBusy(true);
    try {
      const response = await shareRequest(tripId, "POST");
      if (!response.ok) {
        setToast(await readShareError(response, "Could not create the link. Try again."));
        return;
      }
      const body: unknown = await response.json();
      const link = typeof body === "object" && body && "url" in body && typeof body.url === "string" ? body.url : null;
      if (!link) {
        setToast("Could not create the link. Try again.");
        return;
      }
      setUrl(link);
      await copy(link, "Link copied");
      router.refresh();
    } catch {
      setToast("Could not reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function revoke() {
    setOpen(false);
    setBusy(true);
    try {
      const response = await shareRequest(tripId, "DELETE");
      if (!response.ok) {
        setToast(await readShareError(response, "Could not stop sharing. Try again."));
        return;
      }
      setUrl(undefined);
      setToast("Sharing stopped. The old link no longer opens.");
      router.refresh();
    } catch {
      setToast("Could not reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {url ? (
        <Menu
          open={open}
          onOpenChange={setOpen}
          label="Share link"
          align="end"
          panelClassName="w-[340px]"
          trigger={(props) => (
            <Button {...props} variant="outline" loading={busy} icon={<Check size={16} strokeWidth={2} aria-hidden />}>
              Shared
              <ChevronDown size={16} strokeWidth={2} aria-hidden />
            </Button>
          )}
        >
          <label className="flex flex-col gap-1.5 px-3 pt-2 pb-3">
            <span className="label-caps text-text-2">Traveler link</span>
            <input
              readOnly
              value={url}
              onFocus={(event) => event.currentTarget.select()}
              className="w-full truncate rounded-row border border-rule-strong bg-surface-raised px-3 py-2 text-ui-sm text-ink"
            />
          </label>
          <MenuItem
            title="Copy link"
            description="Send it to your traveler. It opens without an account."
            onSelect={() => {
              setOpen(false);
              void copy(url, "Link copied");
            }}
          />
          <MenuSeparator />
          <MenuItem title="Stop sharing" description="The link stops working right away." onSelect={() => void revoke()} />
        </Menu>
      ) : (
        <Button
          variant="primary"
          loading={busy}
          icon={<Link2 size={16} strokeWidth={2} aria-hidden />}
          onClick={() => void createLink()}
        >
          Share itinerary
        </Button>
      )}
      {toast ? <Toast message={toast} /> : null}
    </>
  );
}
