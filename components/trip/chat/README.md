# Trip chat

`ChatColumn` renders the v3 Paper thread, a bottom composer, and the selected place card. `useChatSession` owns the durable transport and reconnect lifecycle. An empty chat loads a factual opening without starting a model run. The first advisor message starts the search.

`Thread` renders small `find_places` searches as streaming tiles, then compact chips. `recommend_place` renders the latest recommendation as a full card and earlier picks as compact rows. `chat-places.ts` projects both outputs into the workspace with the ask target and recommended place id. Tiles and photos use the shared native drag payload.

The workspace supplies its actions so chat and itinerary writes share the same queue. `trip_asks.target` persists the slot; `query.pick` persists the chosen place. `toAsk` restores both, including legacy targets in `query.target`. A reload must preserve the recommendation even when a different result scores higher.

Paper defines the 720px desktop chat column and 112px opening clearance. Smaller columns stack the place-card details so keyword bars and visit facts remain readable. Google tabs end their loading state on failure and show the existing unavailable-data copy.
