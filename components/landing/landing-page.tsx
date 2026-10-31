import { ArrowRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { startExampleTripAction } from "@/lib/trips/actions";

import { DemoVideo } from "./demo-video";
import { OwnListImport } from "./own-list-import";

// The front door: a short pitch and the two ways in on the left, the demo video
// large on the right. Stacks with the words first on a narrow screen.
export function LandingPage() {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[1680px] flex-col px-12 py-8 max-lg:px-6">
      <header>
        <Link href="/trips" className="inline-block">
          <Image src="/landing/wordmark.png" alt="Wherefore" width={1200} height={305} priority className="h-auto w-[208px]" />
        </Link>
      </header>
      <main className="grid grow grid-cols-1 items-center gap-x-12 gap-y-10 py-10 lg:grid-cols-[340px_minmax(0,1fr)]">
        <div className="flex flex-col items-start">
          <h1 className="font-display text-[clamp(36px,3.2vw,46px)] leading-[1.06] text-balance text-ink">
            Search by your client&apos;s taste.
          </h1>
          <p className="mt-4 text-body-lg text-text-2">
            Wherefore finds places they&apos;ll love and tells you why it chose each one.
          </p>
          <div className="mt-7 flex w-full flex-col gap-3">
            <form action={startExampleTripAction}>
              <Button type="submit" size="lg" className="w-full">
                Try Wherefore with an example
                <ArrowRight size={16} strokeWidth={2} aria-hidden />
              </Button>
            </form>
            <OwnListImport />
          </div>
        </div>
        <DemoVideo />
      </main>
    </div>
  );
}
