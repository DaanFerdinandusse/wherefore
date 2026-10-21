"use client";

import { useState } from "react";
import { LogOut } from "lucide-react";

import { Avatar } from "@/components/ui/avatar";
import { Menu, MenuItem } from "@/components/ui/menu";

// The signed-in advisor's avatar in the top bar, opening a menu with
// Sign out.
export function UserMenu({ userName, onSignOut }: { userName: string; onSignOut: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <Menu
      open={open}
      onOpenChange={setOpen}
      label="Account"
      align="end"
      panelClassName="w-[260px]"
      trigger={(props) => (
        <button {...props} type="button" aria-label={userName ? `Account menu for ${userName}` : "Account menu"} className="rounded-pill">
          <Avatar name={userName} tone="ink" size={38} className="transition-opacity hover:opacity-85" />
        </button>
      )}
    >
      <p className="px-3 pt-1.5 pb-2 text-ui text-text-2">
        Signed in as <span className="font-semibold text-ink">{userName}</span>
      </p>
      <MenuItem
        title="Sign out"
        leading={
          <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-pill border border-pill-outline">
            <LogOut size={14} strokeWidth={2} aria-hidden />
          </span>
        }
        onSelect={() => {
          setOpen(false);
          onSignOut();
        }}
      />
    </Menu>
  );
}
