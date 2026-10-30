import { Suspense } from "react";

import { ClientModal } from "../modal/client-modal";
import { NewClientForm } from "./new-client-form";

// C1 New client in its sheet. The form reads ?return= (the New trip panel
// that asked), so it sits behind Suspense.
export function NewClientSheet() {
  return (
    <ClientModal label="New client">
      <Suspense fallback={null}>
        <NewClientForm />
      </Suspense>
    </ClientModal>
  );
}
