# components/trip/itinerary-view

The itinerary in the trip panel (Paper "v3 Chat + itinerary": T3, S1, S3, S5, J1b).

| File | What it does |
|---|---|
| itinerary-model.ts | Pure model and copy: the days and slots the panel shows (`buildDays`), running searches and chat suggestions per slot, the cover facts, the brief sentence, and every card line as a template over facts (`headline`, `orderItems`, `whyBox`, `subLine`) |
| itinerary-panel.tsx | The panel body: the brief (title, sentence, favorites chips, slot lists) until two slots hold a place, then the cover and the day cards; collapsed day rows open their slot list |
| slot-card.tsx | A filled slot (pair card, wide dinner card), an open slot row, "Finding dinner in the chat", and the suggestion strip |
| slot-drop.ts | A slot as a drop target: places from the chat (`TRIP_PLACE_TYPE`) and cards from other slots (`SLOT_TYPE`) |

Rules: copy comes only from facts the API returned or the advisor wrote. A template with no fact returns null and the element hides. Agent notes are never quoted. Clicking a card selects the place (`store.select`); the chat column shows its full card.
