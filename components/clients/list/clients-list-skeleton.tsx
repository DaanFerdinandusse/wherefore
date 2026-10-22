import { PageHeader } from "@/components/shell/page-header";

// The Clients page while the list streams in: the same header and quiet rows.
export function ClientsListSkeleton() {
  return (
    <div aria-busy className="flex flex-col">
      <PageHeader title="Clients" subtitle="Loading your clients" />
      <ul className="flex flex-col gap-2 px-7 pt-6">
        {Array.from({ length: 4 }, (_, i) => (
          <li key={i} className="h-[76px] rounded-[22px] bg-surface/60" />
        ))}
      </ul>
    </div>
  );
}
