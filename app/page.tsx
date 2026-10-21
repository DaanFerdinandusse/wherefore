import { redirect } from "next/navigation";
import { Suspense } from "react";

import { getOptionalUser, SIGN_IN_PATH } from "@/lib/auth/server";
import { HOME_PATH } from "@/lib/auth/next-path";

// "/" has no screen of its own: signed in goes to Trips, signed out to sign-in.
// The session read sits behind Suspense, as Cache Components requires.

async function RedirectBySession(): Promise<null> {
  const user = await getOptionalUser();
  redirect(user ? HOME_PATH : SIGN_IN_PATH);
}

export default function Home() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-canvas">
      <Suspense fallback={<span className="font-display text-wordmark text-ink">Tastebrief</span>}>
        <RedirectBySession />
      </Suspense>
    </main>
  );
}
