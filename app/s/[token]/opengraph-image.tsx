import { ImageResponse } from "next/og";

import { dateRangeLabel, heroImage } from "@/components/trip/traveler-view";

import { loadSharedTripView } from "./load";

// The preview a messaging app shows for a share link, in the page's hero
// layout: the photo on the left, the dates and "Lisbon, for Ana" on the right. ImageResponse cannot read CSS
// variables, so the three colors below mirror the surface, ink and text-2
// tokens in app/globals.css.

export const alt = "Your itinerary";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const SURFACE = "rgb(241 237 230)";
const INK = "rgb(28 26 23)";
const TEXT_2 = "rgb(94 88 80)";

export default async function Image({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const view = await loadSharedTripView(token);
  const photo = view ? heroImage(view) : null;
  const dates = view ? dateRangeLabel(view.startDate, view.endDate) : null;

  return new ImageResponse(
    (
      <div style={{ display: "flex", width: "100%", height: "100%", background: SURFACE, color: INK }}>
        {photo ? (
          <img
            src={photo.src}
            alt=""
            width={480}
            height={630}
            style={{ width: 480, height: 630, objectFit: "cover", filter: "saturate(0.72) contrast(0.9) sepia(0.08)" }}
          />
        ) : null}
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "flex-end", flex: 1, padding: 64, gap: 18 }}>
          <div style={{ fontSize: 28, color: TEXT_2 }}>{dates ?? "Tastebrief"}</div>
          {view ? (
            <div style={{ display: "flex", flexDirection: "column", fontSize: 84, lineHeight: 1, letterSpacing: "-0.03em" }}>
              <span>{view.destinationName},</span>
              <span>for {view.preparedFor}</span>
            </div>
          ) : (
            <div style={{ fontSize: 76, lineHeight: 1, letterSpacing: "-0.025em" }}>This link is not active</div>
          )}
          <div style={{ fontSize: 26, color: TEXT_2, marginTop: 12 }}>Built from what you already love</div>
        </div>
      </div>
    ),
    size,
  );
}
