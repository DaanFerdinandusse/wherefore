import { AppPage } from "@/components/shell/app-page";
import { PageHeader } from "@/components/shell/page-header";

// The Clients page while the grid streams in: the same frame, a quiet filter
// track, the header and quiet cards.
export function ClientsListSkeleton() {
  return (
    <AppPage section="clients" toolbar={<span aria-hidden className="h-[42px] w-[300px] rounded-pill bg-canvas" />}>
      <div aria-busy className="flex flex-col gap-6">
        <PageHeader title="Clients" subtitle="Loading your clients" />
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(340px,100%),1fr))] gap-4">
          {Array.from({ length: 6 }, (_, i) => (
            <li key={i} className="h-[540px] rounded-card bg-surface-raised/60 shadow-tile" />
          ))}
        </ul>
      </div>
    </AppPage>
  );
}
