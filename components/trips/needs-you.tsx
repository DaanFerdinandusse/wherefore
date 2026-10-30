"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ChevronRight, Copy, Mail } from "lucide-react";

import { Button, buttonClasses } from "@/components/ui/button";
import { FilmImage } from "@/components/ui/film-image";
import { Popover } from "@/components/ui/popover";
import { Toast } from "@/components/ui/toast";
import { cn } from "@/lib/ui/cn";

import { mailtoHref, type Nudge, type NudgeDraft } from "./nudges";

// "Needs you": up to three trips that ask for the advisor, above the board.
// A card that only needs a look opens its trip; an unopened link offers
// "Draft a nudge": a short message with the link, to copy or open in mail.
// Hidden when nothing needs the advisor.
export function NeedsYou({ nudges }: { nudges: Nudge[] }) {
  if (nudges.length === 0) return null;
  return (
    <section aria-labelledby="needs-you" className="flex flex-col gap-2.5">
      <h2 id="needs-you" className="label-caps text-text-3">
        Needs you
      </h2>
      <ul className="grid grid-cols-2 gap-3 min-[1360px]:grid-cols-3">
        {nudges.map((nudge) => (
          <li key={nudge.tripId} className="min-w-0">
            <NudgeCard nudge={nudge} />
          </li>
        ))}
      </ul>
    </section>
  );
}

const CARD =
  "group relative flex h-full items-center gap-3 rounded-card bg-surface-raised py-2.5 pr-3.5 pl-2.5 shadow-[0_1px_3px_rgb(22_19_15/0.06),0_0_0_1px_rgb(22_19_15/0.04)]";

function NudgeCard({ nudge }: { nudge: Nudge }) {
  const href = `/trips/${nudge.tripId}`;
  return (
    <div className={cn(CARD, "transition-shadow hover:shadow-card")}>
      <div className="relative h-[60px] w-[90px] shrink-0">
        <div className="relative size-full overflow-hidden rounded-[12px] bg-avatar">
          {nudge.imageUrl ? <FilmImage src={nudge.imageUrl} alt="" sizes="90px" /> : null}
        </div>
        {nudge.live ? (
          <span
            aria-hidden
            className="absolute -top-[3px] -right-[3px] size-3.5 rounded-pill border-2 border-surface-raised bg-green"
          />
        ) : null}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <Link
          href={href}
          className="truncate text-action font-semibold text-ink after:absolute after:inset-0 after:rounded-card focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-glow"
        >
          {nudge.title}
        </Link>
        <p className="truncate text-ui-sm leading-[18px] text-text-2">{nudge.detail}</p>
      </div>
      {nudge.draft ? (
        <DraftNudge draft={nudge.draft} title={nudge.title} />
      ) : (
        <ChevronRight size={16} strokeWidth={2} aria-hidden className="shrink-0 text-ink" />
      )}
    </div>
  );
}

function DraftNudge({ draft, title }: { draft: NudgeDraft; title: string }) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState(draft.message);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(message);
      setToast("Message copied. Paste it where you talk to your client.");
      setOpen(false);
    } catch {
      setToast("Copy did not work. Select the message and copy it by hand.");
    }
  }

  return (
    <>
      <Popover
        open={open}
        onOpenChange={setOpen}
        label={`Nudge: ${title}`}
        align="end"
        className="relative z-10 shrink-0"
        panelClassName="w-[380px] max-w-[calc(100vw-48px)] p-4"
        trigger={(props) => (
          <button {...props} type="button" className={buttonClasses({ size: "sm", className: "h-[35px] px-3.5" })}>
            Draft a nudge
          </button>
        )}
      >
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="label-caps text-text-3">Message</span>
            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              rows={7}
              className="w-full resize-none rounded-row bg-canvas px-3.5 py-3 text-ui leading-5 text-ink focus-visible:outline-2 focus-visible:outline-glow"
            />
          </label>
          <div className="flex items-center justify-end gap-2">
            <a
              href={mailtoHref({ ...draft, message })}
              onClick={() => setOpen(false)}
              className={buttonClasses({ variant: "outline", size: "sm", className: "h-[35px]" })}
            >
              <Mail size={14} strokeWidth={2} aria-hidden />
              Open in email
            </a>
            <Button size="sm" className="h-[35px]" icon={<Copy size={14} strokeWidth={2} aria-hidden />} onClick={() => void copy()}>
              Copy message
            </Button>
          </div>
        </div>
      </Popover>
      {toast ? <Toast message={toast} /> : null}
    </>
  );
}
