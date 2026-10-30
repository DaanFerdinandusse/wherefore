import { Suspense } from "react";

import { NewTripLauncher } from "@/components/new-trip/new-trip-launcher";
import { NavDrawer } from "@/components/shell/nav-drawer";
import { ShellUser } from "@/components/shell/shell-store";
import { getOptionalUser } from "@/lib/auth/server";

// Every signed-in page sits on the canvas and draws its own frame (AppPage
// for the sections, the trip workspace for a trip). The layout adds what is
// shared: the nav drawer, the New trip panel, and the advisor's name for the
// avatar, read at request time behind Suspense so the rest stays static.
async function SignedInUser() {
  const user = await getOptionalUser();
  return <ShellUser name={user?.name ?? ""} />;
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <Suspense fallback={null}>
        <SignedInUser />
      </Suspense>
      {children}
      <Suspense fallback={null}>
        <NavDrawer />
      </Suspense>
      <Suspense fallback={null}>
        <NewTripLauncher />
      </Suspense>
    </div>
  );
}
