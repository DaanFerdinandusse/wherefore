"use client";

import { useRouter } from "next/navigation";

import { AppBar } from "./app-bar";

// Wires the AppBar for the (app) layout, which is a server component and
// cannot pass callbacks. New trip opens the trip bar on the trips page; Sign
// out posts to the auth handler and goes to sign-in. Search results stay
// empty here until the search owner passes them in (see AppBar props).
export function AppBarContainer({ userName }: { userName: string }) {
  const router = useRouter();
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
