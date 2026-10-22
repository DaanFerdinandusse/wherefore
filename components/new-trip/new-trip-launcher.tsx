"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { NewTripPanel } from "./new-trip-panel";

// Mounted once in the (app) layout. `?new=1` on any app page opens the New
// trip panel over that page; `?client=<id>` prefills For who and `?where=`
// starts the destination search. Closing removes the three params with a
// history replace, so Back does not reopen the panel.
const PANEL_PARAMS = ["new", "client", "where"] as const;

export function NewTripLauncher() {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  if (params.get("new") !== "1") return null;

  const clientId = params.get("client");
  const where = params.get("where");
  const here = `${pathname}?${params.toString()}`;

  function close() {
    const next = new URLSearchParams(params.toString());
    for (const key of PANEL_PARAMS) next.delete(key);
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  return (
    <NewTripPanel
      key={`${clientId ?? ""}|${where ?? ""}`}
      clientId={clientId}
      where={where}
      newClientHref={`/clients/new?return=${encodeURIComponent(here)}`}
      onClose={close}
      onCreated={(tripId) => router.push(`/trips/${tripId}`)}
    />
  );
}
