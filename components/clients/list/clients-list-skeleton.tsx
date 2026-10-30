import { AppPage } from "@/components/shell/app-page";
import { PageHeader } from "@/components/shell/page-header";

// The Clients page while the grid streams in: the same header and quiet cards.
export function ClientsListSkeleton() {
  return (
    <AppPage section="clients">
      <div aria-busy className="flex flex-col gap-6">
        <PageHeader title="Clients" subtitle="Loading your clients" />
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(340px,100%),1fr))] gap-4">
          {Array.from({ length: 6 }, (_, i) => (
            <li key={i} className="h-[440px] rounded-card bg-surface/60" />
          ))}
        </ul>
      </div>
    </AppPage>
  );
}
