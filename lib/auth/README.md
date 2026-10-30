# Shared hackathon workspace

`server.ts` preserves the scope helpers used by pages, actions, and routes, but they all return the stable `tastebrief-demo` identity from `shared-user.ts`. No session, cookie, or external auth service is involved. `ensureAdvisor` creates its profile idempotently. Existing owner filters keep older account workspaces separate.

Visitors can view and edit the same trips, clients, and saved places. The root and legacy login URLs redirect to `/trips`. The auth API and login proxy are removed, and the shell explains that the workspace is shared.

Seed sample data with `npx tsx --conditions=react-server scripts/seed-demo.ts --owner tastebrief-demo`. No schema migration or auth environment variables are needed. Public traveler pages have no personal advisor email, and cannot distinguish the advisor from another visitor for share-open tracking.
