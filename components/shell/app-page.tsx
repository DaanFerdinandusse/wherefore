import type { ReactNode } from "react";

import { cn } from "@/lib/ui/cn";

import { AccountButton } from "./account-button";
import { MenuButton, SectionPill, type AppSection } from "./top-nav";

// The v3 frame of every section page (Trips, Clients, My places): the menu
// button and section pill on the canvas, then one rounded panel that fills
// the rest of the window. The panel header holds the page's view controls on
// the left (`toolbar`) and its main action plus the account avatar on the
// right (`actions`); the body scrolls inside the panel.
//
// Server component: pages and their loading skeletons render the same frame,
// so nothing moves when the content streams in.
export function AppPage({
  section,
  detail,
  toolbar,
  actions,
  bodyClassName,
  children,
}: {
  section: AppSection;
  /** Under the section name in the pill: "6 in progress", "24 clients", "52 saved". */
  detail?: string;
  toolbar?: ReactNode;
  actions?: ReactNode;
  bodyClassName?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex h-dvh flex-col gap-3 overflow-hidden p-4">
      <nav aria-label="App" className="flex shrink-0 items-center gap-2.5">
        <MenuButton />
        <SectionPill section={section} detail={detail} />
      </nav>
      <Panel toolbar={toolbar} actions={actions} bodyClassName={bodyClassName}>
        {children}
      </Panel>
    </div>
  );
}

/** The rounded panel: a header row with a hairline under it and a scrolling body. */
export function Panel({
  toolbar,
  actions,
  bodyClassName,
  className,
  children,
}: {
  toolbar?: ReactNode;
  actions?: ReactNode;
  bodyClassName?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={cn(
        "flex min-h-0 flex-1 flex-col overflow-hidden rounded-sheet bg-surface shadow-[0_2px_8px_rgb(22_19_15/0.08),0_0_0_1px_rgb(22_19_15/0.04)]",
        className,
      )}
    >
      <header className="flex min-h-[71px] shrink-0 items-center justify-between gap-4 border-b border-ink/8 px-4 py-3.5">
        <div className="flex min-w-0 items-center gap-3">{toolbar}</div>
        <div className="flex shrink-0 items-center gap-2.5">
          {actions}
          <AccountButton />
        </div>
      </header>
      <main className={cn("flex min-h-0 flex-1 flex-col gap-[22px] overflow-y-auto p-6", bodyClassName)}>
        {children}
      </main>
    </section>
  );
}
