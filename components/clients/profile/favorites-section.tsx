"use client";

import type { FavoriteTile } from "@/lib/clients/candidates";
import type { MediaFavorite } from "@/lib/contracts";

import { isMatched } from "../favorites";
import { plural } from "../format";
import { FavoriteSearch } from "./favorite-search";
import { MatchedTile, MediaTile, UnmatchedTile } from "./favorite-tiles";
import { layoutMosaic, type MosaicShape } from "./mosaic";
import type { ClientTaste } from "./use-client-taste";

// C2 left column: "Places Ana loves · 5 places", the search that adds a
// place, artist or film, and the photo grid of everything they love: places
// first in the advisor's order, then artists and films.

type Cell = { kind: "favorite"; favorite: FavoriteTile; index: number } | { kind: "media"; item: MediaFavorite; index: number };

function shapeOf(cell: Cell): MosaicShape {
  if (cell.kind === "favorite") return "place";
  return cell.item.kind === "artist" ? "artist" : "film";
}

export function FavoritesSection({
  title,
  near,
  taste,
}: {
  /** "Places Ana loves". */
  title: string;
  near: { lat: number; lon: number } | null;
  taste: ClientTaste;
}) {
  const { favorites, media, pending } = taste;
  const cells: Cell[] = [
    ...favorites.map((favorite, index): Cell => ({ kind: "favorite", favorite, index })),
    ...media.map((item, index): Cell => ({ kind: "media", item, index })),
  ];
  const rows = layoutMosaic(cells, shapeOf);

  return (
    <section aria-labelledby="places-they-love" className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-baseline gap-3">
          <h3 id="places-they-love" className="font-display text-[28px] leading-[34px] tracking-[-0.01em] text-ink">
            {title}
          </h3>
          <span className="shrink-0 text-ui text-text-2">{plural(favorites.length, "place")}</span>
        </div>
        <FavoriteSearch
          near={near}
          onPickPlace={taste.addPlace}
          onPickMedia={(candidate, query) => taste.addMedia(candidate, candidate.type === "movie" ? "movie" : "artist", query)}
          onKeepTyped={taste.addTyped}
        />
      </div>

      {cells.length === 0 ? (
        <p className="flex min-h-[220px] items-center justify-center rounded-[18px] border-[1.5px] border-dashed border-ink/20 px-8 text-center text-body text-text-2">
          Search above for the restaurants, bars, hotels, artists and films they love. Each one is matched to a real place or
          name.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {rows.map((row, r) => (
            <ul key={r} className="flex items-start gap-3">
              {row.cells.map(({ item: cell, ratio }) => {
                if (cell.kind === "media") {
                  return (
                    <MediaTile
                      key={`media-${cell.item.entityId ?? cell.item.query}-${cell.index}`}
                      item={cell.item}
                      ratio={ratio}
                      onRemove={() => taste.removeMedia(cell.index)}
                    />
                  );
                }
                const { favorite, index } = cell;
                const moves = { index, count: favorites.length, onMove: taste.move };
                const isPending = pending.has(favorite.id) || favorite.id.startsWith("tmp-");
                return isMatched(favorite) ? (
                  <MatchedTile
                    key={favorite.id}
                    favorite={favorite}
                    ratio={ratio}
                    pending={isPending}
                    moves={moves}
                    onRemove={() => taste.remove(favorite)}
                  />
                ) : (
                  <UnmatchedTile
                    key={favorite.id}
                    favorite={favorite}
                    ratio={ratio}
                    pending={isPending}
                    moves={moves}
                    onResolve={(candidate) => taste.resolve(favorite, candidate)}
                    onRemove={() => taste.remove(favorite)}
                  />
                );
              })}
              {row.spacer > 0 ? <li aria-hidden style={{ flexGrow: row.spacer, flexBasis: 0 }} /> : null}
            </ul>
          ))}
        </div>
      )}
    </section>
  );
}
