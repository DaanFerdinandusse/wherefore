import { Suspense } from "react";

import { ClientsListSkeleton } from "./clients-list-skeleton";
import { ClientsScreen } from "./clients-screen";

type SearchParams = Record<string, string | string[] | undefined>;

// The Clients list behind its skeleton: the /clients page, and the list under
// a deep-linked New client or client profile sheet.
export function ClientsList({ searchParams }: { searchParams: Promise<SearchParams> }) {
  return (
    <Suspense fallback={<ClientsListSkeleton />}>
      <ClientsScreen searchParams={searchParams} />
    </Suspense>
  );
}
