import { Suspense } from "react";

import { AppBarContainer } from "@/components/shell/app-bar-container";
import { getOptionalUser } from "@/lib/auth/server";

// Every signed-in page: the app bar above the page on the canvas. The user is
// read at request time, so the bar streams in behind a Suspense boundary; the
// fallback is the same bar with an empty name, so nothing shifts.
async function SignedInAppBar() {
  const user = await getOptionalUser();
  return <AppBarContainer userName={user?.name ?? ""} />;
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <Suspense fallback={<AppBarContainer userName="" />}>
        <SignedInAppBar />
      </Suspense>
      {children}
    </div>
  );
}
