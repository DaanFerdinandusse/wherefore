# Wherefore: video and Devpost submission

Deadline: **Fri 30 Oct 2026, 9:45pm Mexico City** (11:45pm EDT).

## Order for tonight

The video is optional under the rules, so get a complete entry in first. You can keep editing until the deadline.

| By | Do |
|---|---|
| 6:45pm | Fill in Devpost from the text below, upload the six images, press Submit |
| 7:30pm | Shoot the video (shot list below, about 25 minutes plus retakes) |
| 8:30pm | Edit, record the voice-over |
| 9:00pm | Upload to YouTube, paste the link into the submission, save |
| 9:15pm | Stop. Check the public page in a private window |

---

# Part 1: the video (1:12)

## What to take from the Doors video

[Doors](https://www.youtube.com/watch?v=mzaaGcwwAyI) runs 3:27. Keep its first half, drop its second.

**Keep**
- The first sentence names the audience and what the problem costs them.
- One sentence on what it does, right after the problem.
- One named demo user the whole way through, and it says she is fictional.
- Thanks to Qloo and Devpost at the end.

**Drop**
- The second half, a tour of extra features. Ours ends on the strongest screen instead: the page the client receives.

**Say "Qloo" out loud.** The app never shows the name, so the voice-over is the only place a judge hears it.

## Before you press record

- [ ] Record on the live site, https://wherefore-travel.vercel.app, so the video matches what judges open.
- [ ] Use the existing trip: **Ana Ruiz, Lisboa, 14 to 18 May** ([open it](https://wherefore-travel.vercel.app/trips/bc4b285d-416b-4d4f-8ad6-2788fed12d6b)). Do not create a trip on camera (see Avoid, below).
- [ ] Warm up first: send one message on a different trip. My first message on a cold test server failed with "The last reply did not finish". Retry worked. Production may behave differently.
- [ ] Chrome at 1920 by 1080, or 1600 by 900, full screen, bookmarks bar hidden, notifications off.
- [ ] Open the trip and wait about 8 seconds. The opening message and the map load late, so start recording after they appear.

## Avoid on camera

- **The trips board.** Sofia's card says "10 of 9 slots filled".
- **The New trip form.** It lists several places called Lisboa. One put the map in the countryside north of the city, and another is in Brazil.
- **Searching next door.** Moving the map one neighborhood over picked the same restaurant again. Move it far enough that the first pick is off the map.
- **Rare requests in a small area.** A quiet speakeasy search in central Paris came back with "the region search found no option that fits". That is honest, but a weak shot. Italian in Campo de Ourique worked.
- **Calling 94 a score.** The match number is ranked 60 to 94 within each search, so every top pick reads 94, and one place can read 94 in one search and 60 in another. Say "top match for this search" if you mention it at all. Both your picks will show 94, so the script doesn't say the number.

## Shoot in this order

Everything is one continuous session. The opening message only shows on an empty chat, so it has to come first.

| Take | Do | Real time |
|---|---|---|
| A | Ana's trip open and idle. Hold 20 seconds on the opening line and the map | 20 s |
| B | Type **A cozy Italian dinner for their first night.** and send. Let it run to the end | 30 to 50 s |
| C | Scroll the place card slowly: the line under the name, photos, People talk about, Why Ana | 10 s |
| D | Drag the map west until **Jardim da Parada** (Campo de Ourique) is in the middle. It took four drags at that zoom. Press **Search this region**. Let it run | 30 s |
| E | Press **Add to Fri dinner**. Hold on the "added" message | 5 s |
| Off camera | Send 3 or 4 more prompts to fill Day 1, for example **A coffee stop near the hotel for the first morning**, **Lunch nearby**, **A speakeasy after dinner** | 3 min |
| F | Click **Itinerary**. Scroll Day 1 slowly. Press a row's down arrow to open the reasons | 10 s |
| G | Click **Traveler view**. Hold on the title and the opening line, then scroll to the first day | 10 s |

Use the map tab for take D and the itinerary tab for take F only. Stay away from Share, which moves the trip to another column.

A retake of B to E is fine: press the buttons again. A retake of A needs a new chat on the trip.

## The cut

Written in first person, the way you talk. Read it out loud once and change anything you wouldn't say.

| Time | On screen | Voice-over |
|---|---|---|
| 0:00 | Take A. Ana's trip, map on the right | A luxury travel advisor gets paid to match a client to the right places all around the world, but nobody has been to the entire world. |
| 0:10 | Take A. Zoom in on "Ana loves cozy, trendy, intimate places" | Wherefore knows the places your client already loves, and uses Qloo's taste data to get specialized recommendations. |
| 0:17 | Take B, typing, then pins landing. Small on-screen label: Demo client | Let's try it for Ana. I ask for a cozy Italian dinner, and the places show up on the map right away. |
| 0:25 | Take B, rows greying out. **Keep this readable, it is the best moment** | Then the agent goes through what people say about each place and throws out what doesn't fit. It ends up with one pick and a backup. |
| 0:36 | Take C | And I can see why: which of Ana's favorites drove this pick, and what people actually talk about. |
| 0:43 | Take D, drag, button, new pins | Say her hotel is across town. I move the map, hit search this region, and get a new pick over there. |
| 0:51 | Take E into take F | I add it to dinner, and the itinerary builds up from there. I decide what goes in. |
| 0:58 | Take G | When I'm done, Ana gets one link, and it reads like it came from a friend who knows her. |
| 1:05 | End card: Wherefore and the URL | That's Wherefore. You can try it yourself, no login. Thanks to Qloo and Devpost. |

About 180 words, so it fills about 1:12 at a normal pace.

## Editing notes

- Record the voice-over after you have the screen capture, then cut to it.
- Speed up the waiting: take B to about 14 s, take D to about 7 s. Slow back to full speed when rows grey out and when pins land.
- Put a small "sped up" tag on those parts. The rules require the project to work as shown, and judges can try it.
- Upload to YouTube, public or unlisted. Devpost takes YouTube, Vimeo or Youku links only.
- Thumbnail: `docs/submission/gallery/01-cover.jpg`.

---

# Part 2: Devpost fields

**Required by the rules:** a working demo link, a public repo with an open source license shown in About, a text description, external hosting. A video is not required. Judges may still judge from the text, images and video alone, without opening the app, so the images matter.

I could only see the public rules, not your submission form. Standard Devpost fields are below. The form may add questions of its own, and the last section covers the likely ones.

## Project name

Wherefore

## Tagline (under 140 characters)

Luxury travel advisors can't have been everywhere. Wherefore finds the right places for each client, in any city, using Qloo taste data.

## Links

- Try it out: https://wherefore-travel.vercel.app
- Code: https://github.com/DaanFerdinandusse/wherefore

## Built with

next.js, react, typescript, tailwindcss, ai-sdk, vercel, vercel-workflow, postgresql, neon, drizzle, google-maps, google-places, openai, qloo

## Description

Paste everything below.

```markdown
## Inspiration

I ran AI workshops for about 50 travel advisors. A luxury advisor gets paid to match a client to the right places all around the world, but nobody has been to the entire world.

You trust a friend's recommendation because they know you and they know the place. I wanted an advisor to have that in any city.

## What it does

You open a trip for a client, and it already knows their taste from the places they've liked before. Ana's Lisbon trip starts with "Ana loves cozy, trendy, intimate places. Italian for dinner, a speakeasy after."

Then you ask for what you need, like a cozy Italian dinner for the first night. The places show up on the map in seconds, ranked for that client. The agent goes through what people say about each one, throws out what doesn't fit, searches again if it has to, and ends up with one pick and a backup. Each pick shows which of the client's favorites drove it and how much each one counted.

If you want a different part of town, you move the map and press Search this region. By default it leaves out the most famous places, since getting past those is kind of why people use an advisor.

You decide what goes in the itinerary. When you're done, the client gets one link, written in your voice and built around places they already love.

## How I use Qloo

Qloo is where the recommendations come from.

- `/search` turns a client's favorites into Qloo entities, biased to their home city.
- `/v2/insights` with `signal.interests.entities` ranks places for the client, and `feature.explainability` gives each favorite's share of a recommendation. That's the "Why Ana" panel.
- `filter.location` and `filter.location.radius` keep a search close to the day's plan or the map region. My code picks the circle.
- `filter.popularity.max` powers the less known default. Famous places scored 0.96 to 1.0 in my tests, most good neighborhood places 0.8 to 0.95.
- `filter.tags`, `filter.price_level.max`, `filter.external.exists` and `filter.exclude.entities` narrow a search and stop it repeating itself.
- `filter.results.entities` scores the advisor's own saved places for a client.
- `/entities` gives opening hours and closures, and `/v2/tags` maps plain words to Qloo tags.

## How I built it

Next.js 16 and React 19 on Vercel. The agent runs on the AI SDK with the Vercel Workflow DevKit, so a turn keeps going if you reload the page. It has small tools (find_places, recommend_place, score_places, set_itinerary and a few others) and it alternates between searching and talking. The model is OpenAI gpt-6-luna. Data is in Neon Postgres with Drizzle, and Google Places and Maps handle photos and the map.

Cards only show what the APIs returned. If a reason can't be grounded in that data, it stays empty.

## Challenges I ran into

A museum search in Mexico City returned a place 23 km out, because taste ranking ignores distance. I tested it live: the radius is a hard cut and `signal.location` doesn't favor nearby places. So my code picks a small circle and widens it before it drops any filter.

Opening hours differ between endpoints. In a test of 278 Lisbon places, 405 of 1,617 day entries didn't match between `/v2/insights` and `/entities`, so I read hours from `/entities`.

Affinity scores bunch up, with the top ten sometimes within 0.01. Cards show a match ranked 60 to 94 within each search, and the real explanation is the favorites behind a pick.

Free text locations can resolve to the wrong place, so I search for the destination first and send a point and a radius.

## Accomplishments that I'm proud of

Watching the agent go through places one by one and throw some out. It feels like someone thinking about your client, and that took a few versions to get right.

## What I learned

I started with lists and checklists, and they didn't make me trust the result. What did was seeing what the agent looked at and why it said no. Real agent runs also caught bugs that 866 passing tests missed, so I test with real conversations now.

## What's next

Importing a client's saved places from a shared Google Maps list, and getting this in front of the advisors from my workshops. The demo clients are fictional and I don't have customers yet, so that's the real test.
```

## Testing instructions

```text
No login needed. Open https://wherefore-travel.vercel.app. Everyone shares one demo workspace.

1. Open a trip in Planning from the board, for example Ana Ruiz in Lisboa.
2. In the chat, ask for something, for example "A cozy Italian dinner for their first night."
3. Places land on the map in seconds. The full reply takes 30 to 60 seconds while the agent weighs them.
4. On the map, drag to another neighborhood and press Search this region.
5. Press Add to put the pick in the itinerary, open the Itinerary tab, then Traveler view.

Please use a desktop browser. The demo clients are fictional.
```

## Answers if the form asks

- **New or existing project?** New. First commit 21 Oct 2026, inside the submission period.
- **Team:** solo, Daan Ferdinandusse, Mexico City.
- **Who is it for?** Independent and agency travel advisors, and boutique hotel concierge teams.
- **Which agent framework?** AI SDK 7 `WorkflowAgent` with the Vercel Workflow DevKit.

## Images

All 3000 by 2000 (3:2) and under 1 MB, in `docs/submission/gallery/`. Upload in this order. The first one is the project thumbnail.

1. `01-cover.jpg`
2. `02-agent-weighs-options.jpg`
3. `03-why-this-place.jpg`
4. `04-search-this-region.jpg`
5. `05-itinerary.jpg`
6. `06-traveler-page.jpg`

Images 1, 3, 5 and 6 are from the live site. Images 2 and 4 are from the same build on the test database.

---

# Part 3: checks

| Item | State |
|---|---|
| Live demo, no login | OK, production was serving the latest deploy at 6:10pm |
| Public repo with `main` at the latest commit | OK, 2026bb4 |
| MIT license shown in About | OK, GitHub detects it |
| Repo About text | **Fix:** description says "Tastebrief", homepage is the old URL |
| Agent credential | **Watch:** expires 4 Nov 23:43 UTC, and judging runs 2 to 5 Nov |
| Finalists | Must be available for the live show on 5 Nov |
| Production during filming | **Watch:** the main checkout has uncommitted chat changes from other work. Don't deploy while you record |

Fix the repo About:

```bash
gh repo edit DaanFerdinandusse/wherefore --description "Wherefore: the itinerary agent for travel advisors, grounded in Qloo taste data" --homepage "https://wherefore-travel.vercel.app"
```

On 4 Nov, whatever else is happening, check the agent still answers. The rules want the demo available until judging ends. The code refreshes tokens on its own, but that has not been tested past this date. To re-import:

```bash
npm run codex:import
```

## Sources

- [Hackathon page](https://qloo.devpost.com/)
- [Official rules](https://qloo.devpost.com/rules)
- [Devpost: submission fields](https://help.devpost.com/article/145-how-do-i-set-up-the-submission-period)
- [Devpost: demo videos](https://help.devpost.com/article/85-uploading-a-demo-video)
- [Devpost: editing a submission](https://help.devpost.com/article/123-how-to-edit-a-submission)
- [Doors demo video](https://www.youtube.com/watch?v=mzaaGcwwAyI)
