"use client";

import { useState } from "react";

import { Avatar } from "@/components/ui/avatar";
import { Menu } from "@/components/ui/menu";

import { useShell } from "./shell-store";

// The shared advisor identity at the right end of a panel header.
export function AccountButton() {
  const userName = useShell((s) => s.userName);
  const [open, setOpen] = useState(false);
  return (
    <Menu
      open={open}
      onOpenChange={setOpen}
      label="Account"
      align="end"
      panelClassName="w-[260px]"
      trigger={(props) => (
        <button
          {...props}
          type="button"
          aria-label={userName ? `Account menu for ${userName}` : "Account menu"}
          className="rounded-pill"
        >
          <Avatar name={userName} tone="ink" size={34} className="transition-opacity hover:opacity-85" />
        </button>
      )}
    >
      {userName ? (
        <p className="px-3 pt-1.5 pb-2 text-ui text-text-2">
          Shared workspace: <span className="font-semibold text-ink">{userName}</span>
        </p>
      ) : null}
      <p className="px-3 pb-2 text-ui-sm text-text-muted">
        Everyone can view and edit the same trips, clients, and saved places.
      </p>
    </Menu>
  );
}
