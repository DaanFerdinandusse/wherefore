# Qloo API findings (tested live, 2026-10-21)

Base URL `https://hackathon.api.qloo.com`, header `X-Api-Key`. Key is in `.env.local` (gitignored). All calls are GET. Typical latency 0.3 to 1.2s; first call with a new combo can take 8 to 10s (cold cache), so cache responses.

Test client A (NYC favorites): Via Carota, Lilia, Death & Co East Village, Ace Hotel New York.
Test client B: Peter Luger, The Ritz London, Nobu Malibu, Cipriani Downtown.

## Answers to the open questions

| Question | Answer |
|---|---|
| Key works? | Yes. |
| Explainability format | Per result: `query.explainability["signal.interests.entities"] = [{entity_id, score}]`, scores sum to about 1. Per request: `query.explainability["signal.interests.entities"].effect_on_top3_recs / top5...` with `avg_score` per input. |
| Comma vs repeated IDs | Both work. Use comma-separated. |
| Do different clients get different picks? | Yes. Client A and B in Lisbon share 1 of 10 top results. A gets Tapisco, Miss Can, the mill, Taberna Moderna. B gets JNcQUOI, Penha Longa Resort, Solar dos Presuntos, O Talho. |
| Bad params | Silently ignored (a typo returns the generic no-signal list with HTTP 200). Validate params in code. |

## Endpoints to use

### 1. Resolve favorites: `GET /search`
```
/search?query=Le%20Bernardin&types=urn:entity:place&take=3
/search?query=Le%20Bernardin&types=urn:entity:place&filter.location=40.76,-73.98&take=3
/search?query=Rosalia&types=urn:entity:artist   (also urn:entity:movie, urn:entity:book)
```
- Returns `results[]` with `entity_id`, `name`, `popularity`, `location {lat,lon}`, `disambiguation` (full address), `properties` (address, geocode.city, neighborhood, price_level, business_rating, description, hours, image, website, phone, specialty_dishes, external ids for Michelin, OpenTable, Tripadvisor, Google place_id), `tags[]` (`tag_id`, `name`, `type`).
- Search is fuzzy. "Le Bernardin" alone ranked a Le Havre brasserie first. "Blue Bottle Coffee" returns many branches. Passing `filter.location=lat,lon` fixed it. Product implication: ask for the client's home city and bias search to it; show the address on the chip so the advisor can confirm.
- `filter.location.query` on search did not help.

### 2. Recommendations in a city: `GET /v2/insights`, `filter.type=urn:entity:place`
```
/v2/insights?filter.type=urn:entity:place&filter.location.query=Lisbon
  &signal.interests.entities=ID1,ID2,ID3,ID4&feature.explainability=true&take=10
```
Client A in Lisbon: Feitoria (0.800), Tapisco (0.797), Miss Can (0.796), Sea Me (0.794), Coyo Taco (0.793), the mill (0.791).
Without signals the same city returns tourist staples (LX Factory, Quinta da Regaleira, Oceanário, Pastéis de Belém). Good contrast for a "with vs without taste" view.

Each result carries `query.affinity` and a rich `properties` block: `short_description`, `ambience_description`, `cuisine_description`, `customer_demographics_description`, `unique_selling_points`, `keywords[] {name,count}` (from reviews), `price_level`, `hotel_class`, `star_rating`, `images[]`, plus 100+ `tags`. This is enough for the LLM to write one grounded sentence per pick without inventing anything.

Note: affinity scores are bunched (0.79 to 0.80 for the top 10), so show rank or relative bars rather than raw decimals.

Three more filters on `/v2/insights`, tested live 2026-10-30. All three keep explainability and combine with each other:
- `filter.popularity.max=0.6`: popularity is a 0 to 1 percentile at the top level of each entity. In Lisbon it surfaced Ceia at 0.02, rating 4.9. The app calls below 0.6 "less known".
- `filter.external.exists=michelin`: `external.michelin` is a list of `{ id, stars }` in insights and one `{ id }` under `properties.external` in `/search` and `/entities`. `stars` is often null, so the key means listed, not starred.
- `filter.hours=monday` works, and we do not send it. It reads the `/v2/insights` copy of the hours, which is unreliable (below), checks the day only (a lunch-only place passes a dinner search), and drops places with no `hours` block.
- Hours and closure come from `/entities`. Tested 2026-10-30 on 278 Lisbon places:
  - `/v2/insights` usually lists only the first span of a day: O Talho reads `12:00 to 16:00` there and adds `19:00 to 23:30` on `/entities`.
  - 405 of 1,617 day entries differ. 41 places are closed on `/v2/insights` for days `/entities` has open, and 16 of them read closed all seven days (Quintal das Docas, Mensagem). `filter.hours` drops them with no trace. 7 places go the other way.
  - `properties.is_closed` is true on 6 of the 278 on `/entities` (Tribo da Terra, Boa Vida), with `hours: {}`, and false on every `/v2/insights` row. They rank normally and pass `filter.hours`.
  - `/search` and `/entities` agree byte for byte. Which one is right in the world could not be tested; `/v2/insights` missing every closure suggests it is the stale copy.
  - Shapes: a block has all 7 days or is `{}`, at most 2 spans, `T00:00:00` both ways means 24 hours, and a past-midnight span closes earlier than it opens.
  - Other fields also differ between the two (rating, name, primary genre, price level), so a stored value depends on which endpoint wrote the row.
- Explainability lists only the strongest signals from about 10 signals up (8 intact, 10 cut). Scores then sum to about 0.92, and the weakest favorites have no row: an artist among 20 signals was never listed.
- Request length: 8153 characters answered 200, 8270 answered 414 (tested with 203 and 206 excluded ids). An id costs 39 characters in `filter.exclude.entities` or `signal.interests.entities`, so `MAX_EXCLUDED` stays well below that with 24 signals and tags.

### 3. Category grouping: `filter.tags`
```
&filter.tags=urn:tag:category:place:cocktail_bar
&filter.tags=urn:tag:category:place:wine_bar,urn:tag:category:place:cocktail_bar&operator.filter.tags=union
&filter.price_level.max=2
```
Working category tags: `urn:tag:category:place:{cafe, cocktail_bar, wine_bar, hotel, museum}`. Find others with `/v2/tags?filter.query=<text>&filter.parents.types=urn:entity:place`.
Filters are loose: "Museu da Cerveja" (a restaurant) came back under museum, restaurants under cocktail_bar. Run one query per group, then re-check `properties.primary_genre.name` before placing a card in a group.

Lisbon hotels for client A: BessaHotel Liberdade, The Lisboans, Casa dell'Arte, 1869 Principe Real, Valverde (Relais & Châteaux). Hotels have no `price_level`.

### 4. Taste portrait: `filter.type=urn:tag`
```
/v2/insights?filter.type=urn:tag&signal.interests.entities=IDS
  &filter.tag.types=urn:tag:ambience:qloo,urn:tag:cuisine:qloo,urn:tag:decor:qloo&take=20
```
Client A: European, Trendy, Cozy, Chic, Intimate, Lively, Vintage, Cocktail Bar, Rustic, Italian, Romantic, Speakeasy, Hip, Moody. This is a clean, usable portrait.
Without `filter.tag.types` you get cross-domain tags (indie, electronic, fashion, tiramisu, steak tartare). Interesting but noisy; restrict it for the main view.

### 5. Score a shortlist: `filter.results.entities`
```
/v2/insights?filter.type=urn:entity:place&filter.results.entities=H1,H2,H3
  &signal.interests.entities=IDS&feature.explainability=true
```
Client A: Memmo Alfama 0.773, Four Seasons Ritz 0.740, Pestana Palace 0.724, each with per-input explainability. Works exactly as planned for "Score my shortlist".

### 6. Replace a removed pick: `filter.exclude.entities=ID` works.

### 7. Tags as extra signals: `signal.interests.tags=urn:tag:genre:place:restaurant:natural_wine,urn:tag:ambience:qloo:cozy`
Works and shifts results (Da Noi, Prado, Acaso appear). Explainability then returns null, so only use tag signals for constraints, not on cards that need "because they loved".

### 8. Cross-domain input (artist, film, book only)
Rosalía + In the Mood for Love + Normal People into Lisbon places returned results (Mar ao Carmo, miradouros, churches). It works but feels generic. Treat media favorites as a secondary signal alongside places.

### 9. Lower priority
- Neighborhoods: `filter.type=urn:heatmap&output.heatmap.boundary=urn:entity:locality` returns ranked localities with polygons, but the list is noisy (mixes "Portugal", Sintra, Leiria, Setúbal with Lisbon parishes), ignores `take`, and takes about 9s. Possible "where to stay" hint if filtered; not core.
- Demographics: `filter.type=urn:demographics` returns age and gender skew per input entity. Not useful for a client brief.

### 10. Reusing portrait tags (tested)
- As a filter: `filter.tags=urn:tag:ambience:qloo:cozy` plus the favorites. Works and explainability still comes back. Returned Quintal das Docas, Copenhagen Coffee Lab, Da Noi, Bistrô Gato Pardo, Graça do Vinho. Good for "show only cozy places" chips.
- As the only signal: `signal.interests.tags=cozy,chic,speakeasy` with no favorites. Works (Cícero, BAHR, Rosamar, Bar Motel, Terroir) but loses explainability and took 4.7s.

### 11. Other endpoints tested
- Destinations: `filter.type=urn:entity:destination`. NYC favorites return US places (New Haven, SoHo, Greenwich). With `filter.geocode.country_code=PT` it returned Lisbon, Porto. Usable for "where in Portugal should this client go".
- Cross-domain output: `filter.type=urn:entity:{artist,movie,book,podcast}` from place favorites works (e.g. podcasts: Las Culturistas, Girls Gotta Eat). Possible small "for the flight" extra; not core.
- `/v2/insights/compare` (a.signal vs b.signal): returns shared tags with scores. Output is generic (Restaurant, Dinner, Wine at 0.73), so computing tag overlap ourselves is better.
- `/entities?entity_ids=` looks up full entity data by ID. Useful for caching and re-hydrating saved IDs.
- `bias.trends=high` on insights works and shifts toward trending places.
- `/v2/trending` only supports actor, artist, brand, movie, person, podcast, tv_show. Not places.

### 12. How many hotels and restaurants (counted by paging)
No endpoint returns a total. `take` max is 50; `page=2,3,...` works. Counted with `filter.tags=urn:tag:category:place:{hotel,restaurant}`, capped at 5,000:

| City | Hotels | Restaurants |
|---|---|---|
| New York | 2,409 | 5,000+ |
| Paris | 2,095 | 5,000+ |
| Mexico City | 926 | 4,074 |
| Oaxaca | 923 | 836 |
| Lisbon | 690 | 3,646 |
| Tulum | 300 | 215 |

Running 12 paging loops in parallel returned empty pages for some of them (probably rate limiting). Sequential runs were fine, so throttle bulk calls.

### 13. Matching Qloo places to Google Maps
- Every place tested (290 of 290, across 10 cities and categories) has a Google ID. In `/search` it is `properties.external.google_place` (object). In `/v2/insights` it is top-level `external.google_place` (array).
- It has two fields: `place_id` (Places API ID, e.g. `ChIJez8vvy__0YURP0rx5WhEig4`) and `id` (hex, e.g. `e8a4468e5f14a3f`). Decoding the place_id shows `id` is the Google CID in hex (Contramar: CID 1047725080642144831 = 0xe8a4468e5f14a3f).
- Qloo to Google: use `place_id` directly. Link: `https://www.google.com/maps/search/?api=1&query=<name>&query_place_id=<place_id>`.
- Google to Qloo (client favorites): get name, coordinates and CID from the Google data, run `/search?query=<name>&filter.location=<lat>,<lon>`, and accept the candidate whose `google_place.id` equals the CID in hex. Fall back to distance plus name similarity when there is no CID, and flag weak matches for the advisor.
- Not verified yet: the exact Takeout export format (where the CID or place_id appears in it).

### 14. Client-to-client similarity (tested)
No "similar users" endpoint (Qloo stores no users). Tested with A (Via Carota, Lilia, Death & Co, Ace Hotel), B (Peter Luger, The Ritz London, Nobu Malibu, Cipriani), C (Buvette, Attaboy, The Standard High Line, I Sodi; expected close to A).

| Method | A vs C (similar) | A vs B (different) | B vs C | Verdict |
|---|---|---|---|---|
| `/v2/insights/compare` average score | 0.639 | 0.636 | 0.625 | Does not separate them. Skip. |
| Shared tags in top 30 taste portrait | 19 | 7 | 10 | Clear separation, and the shared tags explain why. Best. |
| Cross-scoring (one client's taste scores the other's places via `filter.results.entities`) | 0.95 | 0.85 | 0.88 | Works. Good second signal. |
| Shared places in Lisbon top 50 | 25 | 9 | 24 | Depends on the city, noisy. |

Recommended: taste-portrait tag overlap as the similarity score, with the shared tags shown as the reason.

## City coverage (client A, take=50)

| City | Result | Top 3 |
|---|---|---|
| Mexico City | 50, strong | Pujol, Quintonil, Máximo |
| Oaxaca | 50, strong | Hotel Escondido, Kakurega Omakase, Criollo |
| Tulum | 50, strong | Hartwood, Be Tulum Hotel, Casa Jaguar |
| Lisbon | 50, strong | Feitoria, Tapisco, Miss Can |
| Paris | 50, strong | Le Châteaubriand, Willi's Wine Bar, Clamato |
| London | 50, strong | St. John, Darjeeling Express, Oriole |
| Buenos Aires | 50 | Don Julio, Patagonia Sur, Corte Comedor |
| Marrakech | 50 | Barometre, Dar Yacout, Villa des Orangers |
| Tokyo, Kyoto | 50, lower affinity (0.64 to 0.71) | Seirinkan, Ginza Sushi Ichi / Kitcho Arashiyama |
| Cartagena | Wrong city (Spain) | |
| Ubud | Wrong city (results in Berlin) | |
| Copenhagen | Wrong city (Copenhagen, New York), 1 result | |

### The geocoder problem and the fix
`filter.location.query` silently picks the wrong place for ambiguous names. Always check `query.localities.filter[0].disambiguation` in the response.
- Adding the country fixes some: "Cartagena, Colombia" and "Ubud, Bali" work. "Copenhagen, Denmark" still fails.
- Reliable fix: `/search?query=Copenhagen&types=urn:entity:locality` returns candidates with lat/lon (the Danish one is "Københavns Kommune"). Then query with
  `filter.location=POINT(12.5683 55.6761)&filter.location.radius=5000` (lon first). This returned proper Copenhagen results.
- Passing a locality `entity_id` to `filter.location.query` returns HTTP 400.
- `filter.location.radius` is a hard cut (tested 30 Oct 2026 in Mexico City at 1.5, 2.5, 5, 8 and 25 km: nothing past the radius). Ranking ignores distance, so the radius is the only proximity control. `signal.location` with `signal.location.radius` and `signal.location.weight` raises every affinity but does not favor close places: a museum 17 km out stayed in the top 8.

Product implication: the destination field should be a picker backed by locality search, showing the disambiguation, not free text.

## Recommended agent tool mapping

| Tool | Call |
|---|---|
| resolve_destination | `/search?types=urn:entity:locality` then POINT + radius |
| resolve_favorites | `/search` with `filter.location` biased to client's home city |
| taste_portrait | insights `filter.type=urn:tag` + `filter.tag.types` |
| find_places | insights places + location + `filter.tags` per group + `feature.explainability=true` |
| score_shortlist | insights + `filter.results.entities` |
| replace_pick | same as find_places + `filter.exclude.entities` |
| check_tags | `/v2/tags?filter.query=` to map constraints like "natural wine" or "no nightlife" to tag IDs |

## Probe script
The curl helper used for these tests is in the session scratchpad; the requests above are enough to rebuild it in the Qloo client.
