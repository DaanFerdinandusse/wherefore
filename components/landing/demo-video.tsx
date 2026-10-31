// The right side of the landing page. Browsers only autoplay a muted video, so
// it plays without sound and loops. The poster shows until it has loaded.
export function DemoVideo() {
  return (
    <div className="relative aspect-[2152/1080] w-full overflow-hidden rounded-panel bg-ink shadow-panel">
      <video
        src="/landing/demo.mp4"
        poster="/landing/demo-poster.jpg"
        aria-label="Wherefore searching for places for a client and explaining its pick"
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        className="size-full object-cover"
      />
    </div>
  );
}
