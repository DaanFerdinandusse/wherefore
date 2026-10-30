"use client";

import { useEffect } from "react";
import { create } from "zustand";

// The app shell's own state: whether the nav drawer is open and the shared advisor. The (app) layout reads the user on the server and hands the name over
// with <ShellUser>, so the panel header avatar and the drawer footer can show
// it without every page passing it down.
type ShellState = {
  drawerOpen: boolean;
  userName: string;
  openDrawer: () => void;
  closeDrawer: () => void;
  setUserName: (name: string) => void;
};

export const useShell = create<ShellState>((set) => ({
  drawerOpen: false,
  userName: "",
  openDrawer: () => set({ drawerOpen: true }),
  closeDrawer: () => set({ drawerOpen: false }),
  setUserName: (userName) => set({ userName }),
}));

/** Mounted by the (app) layout with the shared advisor. Renders nothing. */
export function ShellUser({ name }: { name: string }) {
  const setUserName = useShell((s) => s.setUserName);
  useEffect(() => setUserName(name), [name, setUserName]);
  return null;
}
