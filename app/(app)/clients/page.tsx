import type { Metadata } from "next";
import { Suspense } from "react";

import { ClientsListSkeleton } from "@/components/clients/list/clients-list-skeleton";
import { ClientsScreen } from "@/components/clients/list/clients-screen";

export const metadata: Metadata = { title: "Clients · Tastebrief" };

// B Clients. The list reads the session and the search params, so it streams
// in behind Suspense (Cache Components); the skeleton keeps the header in place.
export default function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <Suspense fallback={<ClientsListSkeleton />}>
      <ClientsScreen searchParams={searchParams} />
    </Suspense>
  );
}
