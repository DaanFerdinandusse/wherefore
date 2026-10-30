# Wherefore map style

`wherefore-warm.json` is a Google Cloud map style prepared for the v3 Paper design. It uses the palette in `app/globals.css`: warm land, pale roads, muted parks and quiet labels. Background business labels are hidden so the trip's photo pins remain prominent.

Status: validated against Google's published JSON schema on 30 October 2026. It has not been imported, published or visually verified on a live map. Paper's illustrated texture is a reference, not a Google map tile style.

## Activate

1. Open [Google Cloud Map Styles](https://console.cloud.google.com/google/maps-apis/studio/styles) in the project that owns the browser Maps key.
2. Create a style, choose JSON, and import `wherefore-warm.json`. Preview a city at street and neighborhood zoom levels. Save it as `Wherefore warm`.
3. In Map Management, create a JavaScript map ID with vector rendering. Associate `Wherefore warm` as its light style. If the project already has a map ID, associate the style with that ID.
4. Set `NEXT_PUBLIC_GOOGLE_MAP_ID` in `.env.local` and the hosting environment to that ID, then restart development or rebuild the deployment. The app already reads this variable.
5. Verify the map in the trip panel, including photo pins, day filters, zoom and selection. Style changes can take time to propagate.

The app uses AdvancedMarker, which needs a map ID. Pasting legacy JSON into the Map component's `styles` prop will not style that map. Without a configured ID, the app uses Google's demo ID and default base colors.

Google's [style setup guide](https://developers.google.com/maps/documentation/javascript/cloud-customization/map-styles), [JSON reference](https://developers.google.com/maps/documentation/javascript/cloud-customization/json-reference), and [schema](https://developers.google.com/static/maps/cbms-json-schema.json) describe the import format and publishing steps.
