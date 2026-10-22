import type { Metadata } from "next";
import { Suspense } from "react";

import { ClientProfileLoader } from "@/components/clients/profile/client-profile-loader";
import { ProfileSkeleton } from "@/components/clients/profile/profile-skeleton";

export const metadata: Metadata = { title: "Client · Tastebrief" };

// C Client profile. Reads the session and the client at request time, so it
// streams in behind Suspense.
export default function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <main className="flex flex-1 flex-col">
      <Suspense fallback={<ProfileSkeleton />}>
        <ClientProfileLoader params={params} />
      </Suspense>
    </main>
  );
}
