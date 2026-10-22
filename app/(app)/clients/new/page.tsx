import type { Metadata } from "next";

import { ClientProfile } from "@/components/clients/profile/client-profile";
import { NEW_CLIENT } from "@/components/clients/profile/types";

export const metadata: Metadata = { title: "New client · Tastebrief" };

// C2: the same screen as the profile, empty. The first keystroke of the name
// creates the client (a server action) and the URL becomes /clients/<id>.
export default function NewClientPage() {
  return (
    <main className="flex flex-1 flex-col">
      <ClientProfile initial={NEW_CLIENT} isNew today={null} />
    </main>
  );
}
