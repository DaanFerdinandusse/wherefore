"use client";

import Image from "next/image";
import { useState, type DragEvent, type KeyboardEvent } from "react";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { FilmImage } from "@/components/ui/film-image";
import { Popover } from "@/components/ui/popover";
import type { FavoriteTile } from "@/lib/clients/candidates";
import type { FavoriteCandidate } from "@/lib/contracts";
import { cn } from "@/lib/ui/cn";

// One favorite in "Places they love": a matched place (photo, name, city when
// it is not the home city), or the dashed "no match" tile whose candidates
// open in a popover. Tiles drag to reorder; Alt plus an arrow key moves the
// focused tile for keyboard users.

export type TileMoves = {
  index: number;
  count: number;
  onMove: (from: number, to: number) => void;
};

function dragProps({ index, count, onMove }: TileMoves, pending: boolean) {
  return {
    draggable: !pending,
    onDragStart: (event: DragEvent) => {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/x-favorite-index", String(index));
    },
    onDragOver: (event: DragEvent) => {
      if (event.dataTransfer.types.includes("text/x-favorite-index")) event.preventDefault();
    },
    onDrop: (event: DragEvent) => {
      const from = Number(event.dataTransfer.getData("text/x-favorite-index"));
      if (Number.isInteger(from) && from !== index) {
        event.preventDefault();
        onMove(from, index);
      }
    },
    onKeyDown: (event: KeyboardEvent) => {
      if (!event.altKey || pending) return;
      if (event.key === "ArrowLeft" && index > 0) {
        event.preventDefault();
        onMove(index, index - 1);
      } else if (event.key === "ArrowRight" && index < count - 1) {
        event.preventDefault();
        onMove(index, index + 1);
      }
    },
  };
}

function RemoveButton({ name, onRemove, disabled }: { name: string; onRemove: () => void; disabled: boolean }) {
  return (
    <button
      type="button"
      aria-label={`Remove ${name}`}
      title={`Remove ${name}`}
      disabled={disabled}
      onClick={onRemove}
      className="absolute top-1.5 right-1.5 z-10 inline-flex size-6 items-center justify-center rounded-pill bg-surface/90 text-ink opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 hover:bg-surface focus-visible:opacity-100 disabled:hidden"
    >
      <X size={12} strokeWidth={2.2} aria-hidden />
    </button>
  );
}

export function MatchedTile({
  favorite,
  homeCity,
  pending,
  moves,
  onRemove,
}: {
  favorite: FavoriteTile;
  homeCity: string;
  pending: boolean;
  moves: TileMoves;
  onRemove: () => void;
}) {
  const showCity = favorite.city && favorite.city.toLowerCase() !== homeCity.trim().toLowerCase();
  return (
    <li
      tabIndex={0}
      aria-label={`${favorite.name}${favorite.city ? `, ${favorite.city}` : ""}. Drag, or press Alt and an arrow key, to move.`}
      className={cn("group flex w-32 shrink-0 cursor-grab flex-col gap-1.5 rounded-2xl active:cursor-grabbing", pending && "opacity-60")}
      {...dragProps(moves, pending)}
    >
      <span className="relative h-24 shrink-0 overflow-hidden rounded-2xl bg-avatar">
        {favorite.imageUrl ? <FilmImage src={favorite.imageUrl} alt="" sizes="128px" draggable={false} /> : null}
        <RemoveButton name={favorite.name} onRemove={onRemove} disabled={pending} />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-ui leading-[18px] font-semibold text-ink">{favorite.name}</span>
        {showCity ? <span className="truncate text-ui-sm text-text-muted">{favorite.city}</span> : null}
      </span>
    </li>
  );
}

export function UnmatchedTile({
  favorite,
  pending,
  moves,
  onResolve,
  onRemove,
}: {
  favorite: FavoriteTile;
  pending: boolean;
  moves: TileMoves;
  onResolve: (candidate: FavoriteCandidate) => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <li className={cn("flex w-32 shrink-0 flex-col gap-1.5", pending && "opacity-60")} {...dragProps(moves, pending)}>
      <Popover
        open={open}
        onOpenChange={setOpen}
        label={`Match ${favorite.query} to a place`}
        className="flex"
        panelClassName="w-[340px] p-2!"
        trigger={(props) => (
          <button
            type="button"
            {...props}
            disabled={pending}
            aria-label={`${favorite.query}: no match. Pick the right place or remove it.`}
            className="flex h-24 w-32 items-center justify-center rounded-2xl border-[1.5px] border-dashed border-amber transition-colors hover:bg-amber/5"
          >
            <span className="inline-flex size-9 items-center justify-center rounded-pill border border-dashed border-amber text-body-lg leading-[18px] font-bold text-amber">
              ?
            </span>
          </button>
        )}
      >
        <p className="label-caps px-2 pt-1.5 pb-2 leading-4 text-text-muted">Which {favorite.query}?</p>
        {favorite.candidates.length > 0 ? (
          <ul className="flex flex-col">
            {favorite.candidates.map((candidate) => (
              <li key={candidate.entityId}>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    onResolve(candidate);
                  }}
                  className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-surface-hover"
                >
                  <span className="relative size-10 shrink-0 overflow-hidden rounded-[10px] bg-avatar">
                    {candidate.imageUrl ? (
                      <Image src={candidate.imageUrl} alt="" fill sizes="40px" className="film object-cover" />
                    ) : null}
                  </span>
                  <span className="flex min-w-0 grow flex-col">
                    <span className="truncate text-body leading-5 font-semibold text-ink">{candidate.name}</span>
                    {candidate.address ? <span className="truncate text-ui-sm text-text-2">{candidate.address}</span> : null}
                  </span>
                  <span className="shrink-0 text-ui-sm font-semibold text-ink">Use</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-2 pb-2 text-ui text-text-2">No close matches. Remove it and add it again with the area in the name.</p>
        )}
        <div className="mt-1 flex justify-end border-t border-rule pt-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setOpen(false);
              onRemove();
            }}
          >
            Remove {favorite.query}
          </Button>
        </div>
      </Popover>
      <span className="truncate text-ui leading-[18px] font-semibold text-amber">{favorite.query} · no match</span>
    </li>
  );
}
