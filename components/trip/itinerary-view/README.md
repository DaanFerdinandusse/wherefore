# components/trip/itinerary-view

The itinerary in the trip panel (Paper "v3 Chat + itinerary": T3, S1, S3, S5, J1b).

| File | What it does |
|---|---|
| itinerary-model.ts | Pure model and copy: the days and slots the panel shows (`buildDays`), running searches and chat suggestions per slot, the cover facts, the brief sentence, and every row line as a template over facts (`subLine`, `tasteBadges`, `slotReasons`) |
| itinerary-panel.tsx | The panel body: the cover (the trip's stock photo, else a place photo once two are added) over the brief (one sentence) until two slots hold a place; then the cover carries the facts line. Below that every day is the same header (date, place, progress, arrow) over its parts. Only the arrow opens and closes a day, as an accordion; a day with nothing in it starts closed |
| part-group.tsx | One part of a day (Morning, Afternoon, Night): the header, the part's rows, and the new row that opens while a place hovers over the part |
| slot-row.tsx | One slot of a day on shared columns: a place with its reasons accordion, a running search ("Finding dinner in the chat"), a chat suggestion, or open |
| slot-drop.ts | A slot as a drop target (`useSlotDrop`), and a part as one (`usePartDrop`): places from the chat (`TRIP_PLACE_TYPE`) and cards from other slots (`SLOT_TYPE`) |

Parts: a day has three parts (`lib/trips/day-parts.ts`). Each has a meal slot (breakfast, lunch, dinner) that holds one place and an open slot named after the part (morning, afternoon, night) that holds any number by `position`, so a museum goes next to lunch. An open row shows the kind of place in the slot column, because the part's header already names the time.

What goes where (`slotHolds` in `lib/trips/day-parts.ts`): restaurants only in meals; sights, bars and other places only in morning, afternoon or night; cafes in either; hotels only in the stay. The drag carries the category as a data type (`dnd.ts`), because a drag's data can only be read on drop, so a target refuses while the place hovers and says why (`slotRule`). The picker, the map bar, suggestions, `addToSlot`, `moveRefusal` (both directions of a swap), the server actions and `set_itinerary` all apply the same rule. Rows saved before the rule stay where they are and can still be moved out or have notes written.

New rows: an open slot has no row until something lands in it, so while a place hovers anywhere over a part, a dashed new row opens at the end of the part (`partDrop`). A row that may hold the place still takes the drop and the new row sits next to it as the other option. A row that refuses it, a sight over lunch, passes the drop up to the part, which adds the place to the new row. A card from the part's own open slot gets no new row.

Rules: the panel is an overview of the days and what is added, so a row holds the slot, a photo, the name, the type line and up to three taste badges (`tasteBadges`). The photo opens the place card (`store.select`). The rest of the row is the down arrow: it opens the reasons beneath the row (`slotReasons`: the advisor's note, the favorites behind the pick, what to order, what reviews mention). A place with no reasons has no arrow and the row opens its card. Copy comes only from facts the API returned or the advisor wrote. A template with no fact returns null and the element hides. Agent notes are never quoted.
