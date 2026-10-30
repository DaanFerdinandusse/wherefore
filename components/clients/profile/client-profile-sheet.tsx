import { Suspense } from "react";

import { ClientModal } from "../modal/client-modal";
import { ClientProfileLoader } from "./client-profile-loader";
import { ProfileSkeleton } from "./profile-skeleton";

// C2 in its sheet: opens at once with the skeleton while the client loads.
// Closing re-reads the list behind it, since the profile saves as you type.
export function ClientProfileSheet({ params, intercepted }: { params: Promise<{ id: string }>; intercepted: boolean }) {
  return (
    <ClientModal intercepted={intercepted} label="Client profile" refreshOnClose>
      <Suspense fallback={<ProfileSkeleton />}>
        <ClientProfileLoader params={params} />
      </Suspense>
    </ClientModal>
  );
}
