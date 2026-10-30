"use client";

import { useRef, useState, type ReactNode } from "react";
import { Check, Clock, Image as ImageIcon, Lock, Share, X } from "lucide-react";

import { useShell } from "@/components/shell/shell-store";
import { Avatar } from "@/components/ui/avatar";
import { FilmImage } from "@/components/ui/film-image";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/ui/cn";
import { useFocusTrap } from "@/lib/ui/use-focus-trap";

import { notesTitle, privateDetail, type NoteCheck, type OpenSlotCheck, type ShareReview } from "./review";

// "Before Ana sees it" (L1): the sheet the Share button opens over the trip
// panel. What goes into the link (a cover photo and the places), the open
// slots that still have a place waiting in the chat, the notes the traveler
// will see with a Show switch each, how many notes stay private, and whether
// every place has a reason. "Share and copy link" makes the link.

const THUMBS = 4;

function CheckRow({
  icon,
  title,
  detail,
  action,
}: {
  icon: ReactNode;
  title: string;
  detail?: string;
  action?: ReactNode;
}) {
  return (
    <li className="flex min-h-[60px] items-center gap-3.5 border-t border-ink/8 py-2.5">
      {icon}
      <p className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2">
        <span className="text-action font-semibold text-ink">{title}</span>
        {detail ? <span className="min-w-0 truncate text-ui leading-5 text-text-2">{detail}</span> : null}
      </p>
      {action}
    </li>
  );
}

const roundIcon = "inline-flex size-8 shrink-0 items-center justify-center rounded-pill";

export function ShareReviewSheet({
  review,
  busy,
  onClose,
  onPreview,
  onShare,
  onAdd,
  onShowNote,
}: {
  review: ShareReview;
  busy: boolean;
  onClose: () => void;
  onPreview: () => void;
  onShare: () => void;
  onAdd: (check: OpenSlotCheck) => Promise<boolean>;
  onShowNote: (note: NoteCheck, show: boolean) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const userName = useShell((s) => s.userName);
  const [adding, setAdding] = useState<string | null>(null);
  useFocusTrap(ref, true, onClose);

  const extra = review.thumbnails.length - 1 - THUMBS;
  const others = review.thumbnails.slice(1, 1 + THUMBS);
  const single = review.notes.length === 1 ? review.notes[0] : null;

  return (
    <div className="absolute inset-0 z-40 flex items-end p-5">
      <button type="button" aria-label="Close the review" tabIndex={-1} onClick={onClose} className="absolute inset-0 cursor-default bg-ink/20" />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-review-title"
        className="rise-in relative flex max-h-full w-full flex-col gap-2 overflow-y-auto rounded-menu border border-white/60 bg-surface-raised px-7 pt-[26px] pb-5 shadow-[0_20px_48px_rgb(22_19_15/0.18),0_1px_3px_rgb(22_19_15/0.06)] max-sm:px-5"
      >
        <header className="flex items-start justify-between gap-4 pb-1.5">
          <div className="flex flex-col gap-1.5">
            <h2 id="share-review-title" className="font-display text-[32px] leading-9 text-ink">
              Before {review.client} sees it
            </h2>
            <p className="text-action leading-[21px] font-normal text-text-3">
              Check what goes into {review.client}&rsquo;s link, then share it.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-pill bg-ink/5 text-ink transition-colors hover:bg-ink/10"
          >
            <X size={16} strokeWidth={2} aria-hidden />
          </button>
        </header>

        <section className="flex flex-col gap-2.5 pb-3.5">
          <p className="flex items-center gap-2 text-ui leading-[19px]">
            <ImageIcon size={16} strokeWidth={2} aria-hidden className="text-amber" />
            <span className="font-semibold text-ink">{review.client}&rsquo;s link</span>
            <span className="text-text-2">{review.linkDetail}</span>
          </p>
          {review.thumbnails.length > 0 ? (
            <ul className="flex h-[84px] gap-1.5 overflow-hidden" aria-label="Photos in the link">
              {review.cover ? (
                <li className="relative h-full w-28 shrink-0 overflow-hidden rounded-row bg-avatar">
                  <FilmImage src={review.cover} alt="" sizes="112px" />
                  <span className="absolute bottom-1.5 left-1.5 rounded-pill bg-ink/70 px-2 py-[3px] text-meta leading-[14px] font-semibold text-white">
                    Cover
                  </span>
                </li>
              ) : null}
              {others.map((t) => (
                <li key={t.id} className="relative h-full w-[112px] shrink overflow-hidden rounded-row bg-avatar">
                  <FilmImage src={t.imageUrl} alt={t.name} sizes="112px" />
                </li>
              ))}
              {extra > 0 ? (
                <li className="flex h-full min-w-16 flex-1 items-center justify-center rounded-row border border-ink/12 font-display text-[22px] leading-6 text-ink">
                  +{extra}
                </li>
              ) : null}
            </ul>
          ) : null}
        </section>

        <ul className="flex flex-col">
          {review.openSlots.map((check) => (
            <CheckRow
              key={`${check.day}-${check.slot}`}
              icon={
                <span className={cn(roundIcon, "bg-glow/20 text-amber")}>
                  <Clock size={16} strokeWidth={2} aria-hidden />
                </span>
              }
              title={check.title}
              detail={check.detail}
              action={
                <button
                  type="button"
                  disabled={adding !== null}
                  onClick={async () => {
                    setAdding(check.place.tripPlaceId);
                    await onAdd(check);
                    setAdding(null);
                  }}
                  className="inline-flex shrink-0 items-center gap-2 rounded-pill border border-ink/25 px-4 py-[9px] text-ui font-semibold text-ink transition-colors hover:border-ink hover:bg-ink/5 disabled:opacity-45"
                >
                  {adding === check.place.tripPlaceId ? <Spinner size={13} /> : null}
                  Add {check.place.name}
                </button>
              }
            />
          ))}

          {review.notes.map((note) => (
            <CheckRow
              key={`${note.day}-${note.slot}-${note.position}`}
              icon={<Avatar name={userName || "You"} tone="ink" size={32} />}
              title={single ? notesTitle(review.client, review.notes) : note.label}
              detail={single ? `${note.label}: “${note.note}”` : `“${note.note}”`}
              action={
                <label className="flex shrink-0 items-center gap-2.5 text-ui font-medium text-text-3">
                  <span aria-hidden>Show</span>
                  <Switch
                    checked={note.shown}
                    label={`Show the note on ${note.label} to ${review.client}`}
                    onCheckedChange={(next) => onShowNote(note, next)}
                  />
                </label>
              }
            />
          ))}

          <CheckRow
            icon={
              <span className={cn(roundIcon, "bg-ink/5 text-ink")}>
                <Lock size={16} strokeWidth={2} aria-hidden />
              </span>
            }
            title="Your notes stay private"
            detail={privateDetail(review.privateCount)}
          />

          <CheckRow
            icon={
              <span className={cn(roundIcon, review.reasons.complete ? "bg-ink/5 text-ink" : "bg-glow/20 text-amber")}>
                <Check size={16} strokeWidth={2} aria-hidden />
              </span>
            }
            title={review.reasons.title}
            detail={review.reasons.detail}
          />
        </ul>

        <footer className="flex flex-wrap items-center justify-between gap-4 border-t border-ink/8 pt-4">
          <p className="w-[168px] text-ui-sm leading-[18px] text-text-2">
            Anyone with the link can view it. You can stop sharing at any time.
          </p>
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={onPreview}
              className="inline-flex h-12 items-center rounded-pill border border-ink/25 px-5 text-action font-semibold text-ink transition-colors hover:border-ink hover:bg-ink/5"
            >
              Preview as {review.client}
            </button>
            <button
              type="button"
              onClick={onShare}
              disabled={busy}
              className="inline-flex h-12 items-center gap-2.5 rounded-pill bg-ink px-[22px] text-action font-semibold text-surface transition-colors hover:bg-text-4 disabled:cursor-progress"
            >
              {busy ? <Spinner size={16} /> : <Share size={17} strokeWidth={2} aria-hidden />}
              Share and copy link
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
