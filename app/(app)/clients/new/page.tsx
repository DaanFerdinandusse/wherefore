import type { Metadata } from "next";

import { ClientsList } from "@/components/clients/list/clients-list";
import { NewClientSheet } from "@/components/clients/new/new-client-sheet";

export const metadata: Metadata = { title: "New client · Wherefore" };

// C1 from a deep link (or the New trip panel's "New client"): the Clients
// list with the New client sheet over it. Closing goes to the list, or back
// to the page in ?return=.
export default function NewClientPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <>
      <ClientsList searchParams={searchParams} />
      <NewClientSheet />
    </>
  );
}
