import type { Metadata } from "next";

import { ClientsList } from "@/components/clients/list/clients-list";
import { ClientProfileSheet } from "@/components/clients/profile/client-profile-sheet";

export const metadata: Metadata = { title: "Client · Tastebrief" };

// C2 from a deep link: the Clients list with the client's profile sheet over
// it. Closing goes to the list.
export default function ClientPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <>
      <ClientsList searchParams={searchParams} />
      <ClientProfileSheet params={params} />
    </>
  );
}
