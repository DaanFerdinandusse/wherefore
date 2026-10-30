import { Suspense } from "react";

import { ClientModal } from "../modal/client-modal";
import { ClientProfileLoader } from "./client-profile-loader";
import { ProfileSkeleton } from "./profile-skeleton";

// C2 in its sheet: opens at once with the skeleton while the client loads.
// Closing re-reads the list behind it, since the profile saves as you type.
export function ClientProfileSheet({ params }: { params: Promise<{ id: string }> }) {
  return (
    <ClientModal label="Client profile">
      <Suspense fallback={<ProfileSkeleton />}>
        <ClientProfileLoader params={params} />
      </Suspense>
    </ClientModal>
  );
}
