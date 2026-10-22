"use client";

import { useMemo } from "react";

import type { AppUIMessage, TripPlaceCard } from "@/lib/contracts";

import { extractChatPlaces } from "./chat-places";

/** TripPlaceCard[] from the chat's tool parts, preliminary outputs included. For the board and map. */
export function useChatPlaces(messages: AppUIMessage[]): TripPlaceCard[] {
  return useMemo(() => extractChatPlaces(messages), [messages]);
}
