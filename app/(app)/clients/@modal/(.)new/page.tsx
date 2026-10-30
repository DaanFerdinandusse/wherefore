import { NewClientSheet } from "@/components/clients/new/new-client-sheet";

// C1 over the list, opened from "+ Add client" without leaving the list.
export default function NewClientModal() {
  return <NewClientSheet intercepted />;
}
