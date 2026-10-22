// The static shell while the shared itinerary loads: the share bar, the hero
// and one day of cards as quiet blocks in the page's layout.
export default function SharedTripLoading() {
  return (
    <div className="min-h-dvh bg-surface" aria-busy="true" aria-label="Loading your itinerary">
      <div className="border-b border-rule">
        <div className="mx-auto flex h-14 max-w-[1440px] items-center px-4 md:h-16 md:px-10 lg:px-16">
          <span className="font-display text-wordmark leading-8 text-ink tracking-[-0.03em]">Tastebrief</span>
        </div>
      </div>
      <div className="mx-auto max-w-[1440px]">
        <div className="grid gap-7 px-4 pt-5 md:px-10 md:pt-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,440px)] lg:items-end lg:gap-16 lg:px-16 lg:pt-16">
          <div className="order-2 flex flex-col gap-4 lg:order-1">
            <span className="h-5 w-48 rounded-pill bg-avatar" />
            <span className="h-24 w-full max-w-[640px] rounded-row bg-avatar" />
            <span className="h-6 w-72 rounded-pill bg-avatar" />
          </div>
          <span className="arch-top order-1 mx-auto aspect-square w-full max-w-[440px] bg-avatar md:aspect-[4/5] lg:order-2 lg:mx-0" />
        </div>
        <div className="grid gap-10 px-4 pt-14 md:grid-cols-2 md:gap-8 md:px-10 lg:grid-cols-3 lg:px-16 lg:pt-20">
          {[0, 1, 2].map((i) => (
            <span key={i} className="h-[260px] rounded-photo bg-avatar md:h-[300px] lg:h-[320px]" />
          ))}
        </div>
      </div>
    </div>
  );
}
