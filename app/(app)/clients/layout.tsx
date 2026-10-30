import type { ReactNode } from "react";

// The Clients section: the list, and the `modal` slot where C1 New client and
// C2 the client profile open over it on a soft navigation from the list
// (intercepted routes under @modal). A deep link to /clients/new or
// /clients/<id> renders the list and the sheet from its own page instead.
export default function ClientsLayout({ children, modal }: { children: ReactNode; modal: ReactNode }) {
  return (
    <>
      {children}
      {modal}
    </>
  );
}
