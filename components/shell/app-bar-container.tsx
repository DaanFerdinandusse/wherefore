"use client";

import { usePathname, useRouter } from "next/navigation";

import { AppBar } from "./app-bar";

// The trip workspace has its own top bar (TripTopBar, design 02), so the app
// bar stays off /trips/<id> and its views.
const WORKSPACE_PATH = /^\/trips\/[^/]+/;

// Wires the AppBar for the (app) layout, which is a server component and
// cannot pass callbacks. New trip opens the trip bar on the trips page; Sign
// out posts to the auth handler and goes to sign-in. Search results stay
// empty here until the search owner passes them in (see AppBar props).
export function AppBarContainer({ userName }: { userName: string }) {
  const router = useRouter();
  const pathname = usePathname();
  if (WORKSPACE_PATH.test(pathname)) return null;
  return (
    <AppBar
      userName={userName}
      onNewTrip={() => router.push("/trips?new=1")}
      onSignOut={async () => {
        await fetch("/api/auth/sign-out", { method: "POST" }).catch(() => undefined);
        router.push("/sign-in");
        router.refresh();
      }}
    />
  );
}
