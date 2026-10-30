import { AppPage } from "@/components/shell/app-page";
import { NewTripLink } from "@/components/shell/new-trip-link";
import { TripsSkeleton } from "@/components/trips/trips-skeleton";

export default function TripsLoading() {
  return (
    <AppPage section="trips" actions={<NewTripLink />}>
      <TripsSkeleton />
    </AppPage>
  );
}
