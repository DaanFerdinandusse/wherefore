import { ClientProfileSheet } from "@/components/clients/profile/client-profile-sheet";

// C2 over the list, opened from a client card without leaving the list.
export default function ClientProfileModal({ params }: { params: Promise<{ id: string }> }) {
  return <ClientProfileSheet params={params} intercepted />;
}
