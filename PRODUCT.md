# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Next.js + TypeScript on Vercel. Server route calls the Qloo API (key kept server-side). Claude via the Anthropic SDK with tool use. Response caching. (From the project brief; confirm with Daan before building.)

## Users

Primary: independent and agency travel advisors who sell personalization, preparing a trip for a specific client. Secondary: boutique hotel concierge teams preparing for an arriving guest. Both are professionals working at a desk, one client at a time, who send the result to the client.

Evaluators: hackathon judges (Qloo Agentic Hackathon, theme "Agents, but with taste"), who may judge from the description and screenshots alone.

## Product Purpose

An itinerary builder with an agent. The advisor picks the client, destination, dates, and travelers in a booking-style search bar; the client's saved favorites (resolved to Qloo entities) drive the first Qloo search. After that, the advisor talks to an agent in a chat dock to refine and search further. Results fill a large board of place cards with photos. The advisor inspects each place's profile, sees why Qloo picked it, and adds the ones they like to a day-by-day itinerary. The itinerary is shared with the traveler as a link that keeps the photos and the reasons. Success: the advisor sends an itinerary that feels personal and can say why each place was chosen.

## Positioning

Every recommendation combines two kinds of judgment: the client's taste, through Qloo, and the advisor's own expertise, through their saved places and notes. Every recommendation carries Qloo's explainability data: which of the client's favorites drove it, how much each contributed, and which taste tags are shared. The LLM may rephrase Qloo facts but never adds claims Qloo did not return. A plain-LLM travel planner cannot show this.

## Operating Context

- Trip setup is a search bar like on a travel booking site, not a chat: For who (recent clients first, then search, with "New client" inside the search), Where, When, Travelers. Creating the trip opens the trip dashboard already filled with Qloo results from the client's saved profile and the advisor's places in that city.
- Client profile and new client are one screen, edited in place and saved as you type. A new client is that screen with empty fields: name, home city, favorite places picked from Qloo search (or a Google Takeout import), optional artists and films, ground rules. Favorites Qloo cannot match are flagged, never guessed.
- Chat comes after setup. In the dashboard's chat dock the advisor asks for changes or new searches in plain language. The agent shows what it understood as editable chips and each Qloo call as it runs. Each ask becomes its own tab on the board and on the map, next to Eat, Drink and the other categories, with its results highlighted.
- Everything streams. The agent's reply types out as it is written, and each tool call appears the moment it starts, with its status, count and time. When a tool returns places, they appear right away as cards on the board and glowing pins on the map, before the agent has finished talking. Each tool result lists its places as chips: hovering a chip highlights that card or pin, and clicking it opens the place profile.
- Workspace: a board of options (photo cards), place profiles, and an itinerary of days and time slots. No booking, routing, or payments.
- Home is a trips board grouped by stage: planning, shared with client, traveling now, done.
- My places: advisors and concierge teams save their own favorite places, per city, with a private note (for example "ask for the corner table"). Concierge teams can share one team list. Places are saved as Qloo entity IDs.
- On a trip, the advisor's places in that city are scored for the client with Qloo (`filter.results.entities`), so each one shows the client match and the client favorites that drive it. They appear on the board marked "Your place", next to Qloo's open search results. A weak match is still shown with its low score; the advisor decides.
- Optional "blend my taste": the advisor's places are added as extra signals next to the client's favorites. Qloo explainability is per input entity, so a card can say "because Ana loves Lilia and you love Rosetta". Whether Qloo accepts a weight per signal is unverified; until tested, the blend is off by default.
- Clients are saved with a taste profile (favorite places matched to Qloo, artists, ground rules) and their trips. A new trip for a known client reuses that profile, so the advisor only adds destination, dates, and what is different this time. Travel companions without a profile are flagged, with an option to add their favorites.
- Sharing: a read-only traveler link with photos and "because you love" reasons.
- Favorites can also come from a Google Takeout saved-places export (CSV/JSON). No scraping of shared list links.
- Unresolved favorites are flagged, never guessed. The advisor can remove wrong matches.
- Removing a recommendation makes the agent replace it with the next best.
- Score my shortlist: the advisor asks the agent to rank places they are already considering for this client.
- Trace panel ("How we got this"): every Qloo call with endpoint, key params, result count, time.
- Fallbacks: if results are thin, filters loosen automatically and the UI says what changed. Never an empty result screen.

## Capabilities and Constraints

- Agent tools: resolve_favorites, taste_portrait, find_places, score_shortlist (also scores the advisor's own places for a client), explain_pick, add_to_itinerary, swap_slot, save_place.
- Qloo coverage outside the US is unverified; demo cities still to be tested.
- Exact shape of Qloo explainability output is unverified.
- Final product name is undecided. Working name in designs: **Tastebrief** (placeholder).

## Brand Commitments

- The interface never names the data provider. Say "recommended", "match" or "taste match" instead.
- Writing for Daan: no em dashes. Plain, direct language, no metaphors or flourish.

## Evidence on Hand

No real customers, testimonials, or metrics. Demo clients and venue data in designs are synthetic and must be labeled or replaced with data verified against the live Qloo API.

## Product Principles

1. The reason is the product. Why a place was picked is more prominent than the place, and the reason says whose judgment it is: the client's taste (Qloo) or the advisor's pick.
2. Never invent. Show only what Qloo returned; flag what it could not resolve.
3. The advisor stays in charge: the agent proposes, the advisor picks what goes in the itinerary.
4. Always recover. Thin results loosen filters and say so; no dead ends.
5. Show the work. Every Qloo call is visible on request.
