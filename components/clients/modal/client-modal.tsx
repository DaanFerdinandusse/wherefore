"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";

import { Sheet } from "@/components/ui/sheet";

// C1 and C2 render the same centered sheet over the Clients list on normal
// routes. This avoids Next 16.4.2's intercepted dynamic-route parameter bug.
// Both a card click and a direct link use the same rendering path.

type ClientModalApi = {
  /** Closes the sheet. `refresh` re-reads the list behind it (after a save). */
  close: (options?: { refresh?: boolean }) => void;
  /** Closes the sheet and goes to `href` in place of this entry ("Save and plan a trip"). */
  leaveTo: (href: string) => void;
};

const ClientModalContext = createContext<ClientModalApi | null>(null);

export function useClientModal(): ClientModalApi {
  const api = useContext(ClientModalContext);
  if (!api) throw new Error("useClientModal is used outside ClientModal");
  return api;
}

export function ClientModal({
  label,
  closeHref = "/clients",
  children,
}: {
  /** Accessible name of the dialog ("New client", "Ana Ruiz"). */
  label: string;
  /** Where closing a deep-linked sheet goes. */
  closeHref?: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(true);
  // The dialog fires its own close event when `open` turns false; leave once.
  const leaving = useRef(false);

  const close = useCallback<ClientModalApi["close"]>(
    (options) => {
      if (leaving.current) return;
      leaving.current = true;
      setOpen(false);
      router.push(closeHref, { scroll: false });
      // Client writes revalidate the list before navigation back to it.
      if (options?.refresh) router.refresh();
    },
    [closeHref, router],
  );

  const leaveTo = useCallback<ClientModalApi["leaveTo"]>(
    (href) => {
      if (leaving.current) return;
      leaving.current = true;
      setOpen(false);
      router.replace(href, { scroll: false });
    },
    [router],
  );

  const api = useMemo(() => ({ close, leaveTo }), [close, leaveTo]);

  return (
    <ClientModalContext.Provider value={api}>
      <Sheet
        open={open}
        onClose={() => close()}
        label={label}
        side="center"
        className="flex h-[min(828px,100%)] w-[min(1160px,100%)]! flex-col overflow-hidden! rounded-sheet! p-0!"
      >
        {children}
      </Sheet>
    </ClientModalContext.Provider>
  );
}
