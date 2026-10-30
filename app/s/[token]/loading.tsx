// The static shell while the shared itinerary loads, in the page's layout:
// the hero (photo and letter), the favorites band and the first day, as
// quiet blocks.
export default function SharedTripLoading() {
  return (
    <div className="@container min-h-dvh bg-surface" aria-busy="true" aria-label="Loading your itinerary">
      <div className="mx-auto max-w-[1440px]">
        <section className="flex flex-col @5xl:grid @5xl:min-h-[760px] @5xl:grid-cols-[780fr_660fr] @5xl:grid-rows-[auto_1fr]">
          <div className="flex items-center px-4 py-5 @3xl:px-10 @5xl:col-start-2 @5xl:row-start-1 @5xl:px-16 @5xl:pt-12 @5xl:pb-0">
            <span className="font-display text-wordmark-sm text-ink">Wherefore</span>
          </div>
          <span className="mx-4 aspect-4/5 rounded-photo bg-avatar @3xl:mx-10 @3xl:aspect-16/10 @5xl:col-start-1 @5xl:row-span-2 @5xl:row-start-1 @5xl:mx-0 @5xl:aspect-auto @5xl:rounded-none" />
          <div className="flex flex-col gap-5 px-4 pt-8 pb-12 @3xl:px-10 @5xl:col-start-2 @5xl:row-start-2 @5xl:self-end @5xl:px-16 @5xl:pb-14">
            <span className="h-24 w-full max-w-[420px] rounded-row bg-avatar" />
            <span className="h-16 w-full max-w-[470px] rounded-row bg-avatar" />
            <span className="h-10 w-40 rounded-pill bg-avatar" />
          </div>
        </section>
        <div className="h-[190px] bg-sand" />
        <div className="flex flex-col gap-10 px-4 pt-16 @3xl:px-10 @5xl:px-16">
          <span className="h-16 w-64 rounded-row bg-avatar" />
          <span className="aspect-2/1 w-full rounded-card bg-avatar" />
        </div>
      </div>
    </div>
  );
}
