"use client";

import Image from "next/image";
import { useState, type CSSProperties, type DragEvent, type KeyboardEvent, type ReactNode } from "react";
import { Film, Music, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { FilmImage } from "@/components/ui/film-image";
import { Popover } from "@/components/ui/popover";
import { placeTypeLabel } from "@/components/places/format";
import { MEDIA_KIND_LABEL, type FavoriteTile } from "@/lib/clients/candidates";
import type { FavoriteCandidate, MediaFavorite } from "@/lib/contracts";
import { cn } from "@/lib/ui/cn";

// The cells of the "Places Ana loves" photo grid (C2): a matched place
// (photo, name, the provider's type), the dashed "no match" tile whose
// candidates open in a popover, and an artist (round, with a music note) or
// a film (a poster). Each cell is as wide as its aspect ratio in the row.
// Places drag to reorder; Alt plus an arrow key moves the focused one.

export type TileMoves = {
  index: number;
  count: number;
  onMove: (from: number, to: number) => void;
};

/** The flex cell: its width follows its ratio so a row shares one height. */
function cellStyle(ratio: number): CSSProperties {
  return { flexGrow: ratio, flexShrink: 1, flexBasis: 0, minWidth: 0 };
}

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

function RemoveButton({ name, onRemove, disabled, inset = "top-2.5 right-2.5" }: { name: string; onRemove: () => void; disabled: boolean; inset?: string }) {
  return (
    <button
      type="button"
      aria-label={`Remove ${name}`}
      title={`Remove ${name}`}
      disabled={disabled}
      onClick={onRemove}
      className={cn(
        "absolute z-10 inline-flex size-[30px] items-center justify-center rounded-pill bg-ink/70 text-surface-raised transition-colors hover:bg-ink disabled:hidden",
        inset,
      )}
    >
      <X size={14} strokeWidth={2.4} aria-hidden />
    </button>
  );
}

function Caption({ name, kind, icon, centered = false }: { name: string; kind: string | null; icon?: ReactNode; centered?: boolean }) {
  return (
    <span className={cn("flex min-w-0 items-baseline gap-2", centered && "items-center justify-center")}>
      {icon}
      <span className="truncate text-body leading-5 font-semibold text-ink">{name}</span>
      {kind ? <span className="shrink-0 text-ui text-text-2">{kind}</span> : null}
    </span>
  );
}

export function MatchedTile({
  favorite,
  ratio,
  pending,
  moves,
  onRemove,
}: {
  favorite: FavoriteTile;
  ratio: number;
  pending: boolean;
  moves: TileMoves;
  onRemove: () => void;
}) {
  const kind = placeTypeLabel(favorite.primaryType);
  return (
    <li
      tabIndex={0}
      aria-label={`${favorite.name}${kind ? `, ${kind}` : ""}. Drag, or press Alt and an arrow key, to move.`}
      style={cellStyle(ratio)}
      className={cn("group flex cursor-grab flex-col gap-2 rounded-[18px] active:cursor-grabbing", pending && "opacity-60")}
      {...dragProps(moves, pending)}
    >
      <span className="relative overflow-hidden rounded-[18px] bg-avatar" style={{ aspectRatio: ratio }}>
        {favorite.imageUrl ? <FilmImage src={favorite.imageUrl} alt="" sizes="420px" draggable={false} /> : null}
        <RemoveButton name={favorite.name} onRemove={onRemove} disabled={pending} />
      </span>
      <Caption name={favorite.name} kind={kind} />
    </li>
  );
}

export function UnmatchedTile({
  favorite,
  ratio,
  pending,
  moves,
  onResolve,
  onRemove,
}: {
  favorite: FavoriteTile;
  ratio: number;
  pending: boolean;
  moves: TileMoves;
  onResolve: (candidate: FavoriteCandidate) => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <li style={cellStyle(ratio)} className={cn("flex flex-col gap-2", pending && "opacity-60")} {...dragProps(moves, pending)}>
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
            style={{ aspectRatio: ratio }}
            className="flex w-full flex-col items-center justify-center gap-2 rounded-[18px] border-[1.5px] border-dashed border-amber px-3 text-center transition-colors hover:bg-amber/5"
          >
            <span className="inline-flex size-9 items-center justify-center rounded-pill border border-dashed border-amber text-body-lg leading-[18px] font-bold text-amber">
              ?
            </span>
            <span className="text-ui-sm font-semibold text-amber">Pick the right place</span>
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
      <span className="truncate text-body leading-5 font-semibold text-amber">{favorite.query} · no match</span>
    </li>
  );
}

export function MediaTile({ item, ratio, onRemove }: { item: MediaFavorite; ratio: number; onRemove: () => void }) {
  const name = item.name ?? item.query;
  const artist = item.kind === "artist";
  const Icon = artist ? Music : Film;
  return (
    <li style={cellStyle(ratio)} className="flex flex-col gap-2">
      <span
        className={cn("relative overflow-hidden bg-avatar", artist ? "rounded-pill" : "rounded-[18px]")}
        style={{ aspectRatio: ratio }}
      >
        {item.imageUrl ? <FilmImage src={item.imageUrl} alt="" sizes="200px" /> : null}
        <RemoveButton name={name} onRemove={onRemove} disabled={false} inset={artist ? "top-3.5 right-3.5" : undefined} />
      </span>
      <Caption
        name={name}
        kind={MEDIA_KIND_LABEL[item.kind]}
        centered={artist}
        icon={<Icon size={14} strokeWidth={2} aria-hidden className="shrink-0 self-center text-amber" />}
      />
    </li>
  );
}
