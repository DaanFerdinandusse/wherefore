# Trip chat

`ChatColumn` renders the v3 Paper thread, a bottom composer, and the selected place card. `useChatSession` owns the durable transport and reconnect lifecycle. An empty chat loads a factual opening without starting a model run. The first advisor message starts the search.

`Thread` renders small `find_places` searches as streaming tiles, then compact chips. `recommend_place` renders the latest recommendation as a full card and earlier picks as compact rows. `chat-places.ts` projects both outputs into the workspace with the ask target and recommended place id. Tiles and photos use the shared native drag payload.

The workspace supplies its actions so chat and itinerary writes share the same queue. `trip_asks.target` persists the slot; `query.pick` persists the chosen place. `toAsk` restores both, including legacy targets in `query.target`. A reload must preserve the recommendation even when a different result scores higher.

Paper defines the 720px desktop chat column and 112px opening clearance. Smaller columns stack the place-card details so keyword bars and visit facts remain readable. Google tabs end their loading state on failure and show the existing unavailable-data copy.

Both transcript views share `streaming-parts.tsx`: new words fade into ink without delaying the stream. `chat-activity.ts` derives thinking only from the current streaming reasoning part, using its latest summary heading or paragraph as the status. Reasoning start with no summary says "Thinking"; waiting for the first event says "Preparing response". Running tools (including preliminary search results) suppress thinking. Completed summaries stay in expandable transcript disclosures. Encrypted provider metadata is never rendered.

The activity row fades in over 200ms and out over 140ms, retaining its last label until removal at 160ms. Exiting rows are immediately inert and hidden from assistive technology, with their dots stopped. A new phase cancels removal. Reduced motion shows content immediately and hides exiting rows immediately.

Search chips switch the card inline within their own search. Browsing does not change the recommended pick or itinerary. Place selection from the itinerary or map opens a native modal, keeping the transcript and composer mounted underneath. Escape, the close action, and the backdrop dismiss the modal.

As soon as a reply's stream ends `useNextPrompt` posts the last exchange to `/api/chats/[chatId]/next-prompt` for one follow-up message, outside the turn's workflow (`lib/agent/next-prompt-data.ts`). Until it arrives the placeholder is "Ask anything ...". It replaces the placeholder in an empty composer; Tab or the Tab key on screen fills it in, and the advisor edits or sends it. Shift+Tab, and Tab with text in the field, move focus as usual. Sending, a stopped reply or a failed reply offers nothing.

The map's Search this region reaches the chat through the store (`askChat`). `ChatColumn` sends it like a typed message as soon as no reply is running, and says so in a toast when it has to wait. The marker line with the coordinates stays in the stored text, so a retry keeps it, and the bubble leaves it out (`withoutRegionMarker`).

## The live pick

While find_places runs, its places are vertical rows with room for the agent's line (`tool-cards/search-row.tsx`). Placeholder rows show only until the first real place: after that the card shows what was found. Rejected places grey out and sink to the back, and a second search adds rows to the same list. When the tool finishes, the same list element folds into the chip row and each place slides into its chip (`tool-cards/use-flip.ts`). The pick's card then opens beneath it, with the line under the name and a Picked or Backup pill. Clicking any chip, a rejected one too, shows that place's line. `chat-column.tsx` scrolls the search to the top when a pick lands, so the chips and the card read together.
