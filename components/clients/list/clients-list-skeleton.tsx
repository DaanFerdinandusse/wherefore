import { PageHeader } from "@/components/shell/page-header";

// The Clients page while the grid streams in: the same header and quiet cards.
export function ClientsListSkeleton() {
  return (
    <div aria-busy className="flex flex-col">
      <PageHeader title="Clients" subtitle="Loading your clients" />
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(340px,100%),1fr))] gap-4 px-7 pt-6">
        {Array.from({ length: 6 }, (_, i) => (
          <li key={i} className="h-[440px] rounded-card bg-surface/60" />
        ))}
      </ul>
    </div>
  );
}
