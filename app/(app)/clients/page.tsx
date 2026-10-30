import type { Metadata } from "next";

import { ClientsList } from "@/components/clients/list/clients-list";

export const metadata: Metadata = { title: "Clients · Wherefore" };

// H3 Clients. The list reads the session and the search params, so it streams
// in behind Suspense (Cache Components); the skeleton keeps the frame in place.
export default function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <ClientsList searchParams={searchParams} />;
}
