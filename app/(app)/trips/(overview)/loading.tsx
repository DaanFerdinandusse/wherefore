import { TripsSkeleton } from "@/components/trips/trips-skeleton";

export default function TripsLoading() {
  return (
    <main className="flex flex-1 flex-col pb-[220px]">
      <TripsSkeleton />
    </main>
  );
}
