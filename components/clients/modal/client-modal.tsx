"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";

import { Sheet } from "@/components/ui/sheet";

// The centered sheet that holds C1 New client and C2 the client profile over
// the Clients list. Opened two ways: from the list (an intercepted route, the
// list stays mounted behind it and closing goes Back) or from a deep link
// (/clients/new, /clients/<id>, which render the list and this sheet; closing
// goes to the list). The content closes it, or leaves for another page,
// through useClientModal().

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
  intercepted,
  label,
  closeHref = "/clients",
  refreshOnClose = false,
  children,
}: {
  /** True when opened from the list by a soft navigation: closing goes Back. */
  intercepted: boolean;
  /** Accessible name of the dialog ("New client", "Ana Ruiz"). */
  label: string;
  /** Where closing a deep-linked sheet goes. */
  closeHref?: string;
  /** Re-read the list on every close (the profile saves as you type). */
  refreshOnClose?: boolean;
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
      const refresh = refreshOnClose || options?.refresh === true;
      if (intercepted) {
        if (refresh) window.addEventListener("popstate", () => setTimeout(() => router.refresh(), 0), { once: true });
        router.back();
      } else {
        router.push(closeHref, { scroll: false });
      }
    },
    [closeHref, intercepted, refreshOnClose, router],
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
