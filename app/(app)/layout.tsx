import { Suspense } from "react";

import { NewTripLauncher } from "@/components/new-trip/new-trip-launcher";
import { AppBarContainer } from "@/components/shell/app-bar-container";
import { getOptionalUser } from "@/lib/auth/server";

// Every signed-in page: the app bar above the page on the canvas. The user is
// read at request time, so the bar streams in behind a Suspense boundary. The
// fallback is a bar-sized placeholder without client hooks (usePathname in a
// fallback would block prerendering under Cache Components), so nothing
// shifts and the build stays static where it can.
async function SignedInAppBar() {
  const user = await getOptionalUser();
  return <AppBarContainer userName={user?.name ?? ""} />;
}

function AppBarPlaceholder() {
  return (
    <div aria-hidden className="flex h-[76px] shrink-0 items-center px-7">
      <span className="font-display text-wordmark text-ink">Tastebrief</span>
    </div>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <Suspense fallback={<AppBarPlaceholder />}>
        <SignedInAppBar />
      </Suspense>
      {children}
      <Suspense fallback={null}>
        <NewTripLauncher />
      </Suspense>
    </div>
  );
}
