# components/ui

Primitives for Tastebrief, built from the Paper file "qloo", page "v2 Itinerary builder". One file per primitive, props typed inline, token classes from `app/globals.css` only (no hex). Server components unless they hold state. Icons are lucide-react at stroke width 2. See every primitive in every state at `/design` (`app/(dev)/design`).

`className` is appended, not merged. To override a size or padding that the primitive sets, use the important suffix (`px-4!`, `h-[38px]!`). Size cards and photos from the caller (`className="h-[300px]"`).

| Primitive | File | Purpose | Tokens it relies on |
|---|---|---|---|
| Button, buttonClasses | button.tsx | Pill button: primary (ink), outline, outline-strong, ghost, soft, light, chip; sizes sm 31, md 40, lg 48; loading keeps its width | `bg-ink` `text-surface` `border-nav-pill` `bg-avatar` `text-ui` `text-ui-sm` `text-action` `rounded-pill` |
| IconButton | icon-button.tsx | Round single icon button with a required label (+ on cards, close, send) | `bg-surface` `bg-avatar` `border-pill-outline` `bg-ink` |
| Spinner | spinner.tsx | Small open ring for loading; still under reduced motion | `border-current` |
| Pill | pill.tsx | Outlined tag (taste tags, ground rules) | `border-pill-outline` `text-ui-sm` |
| FilterPill | filter-pill.tsx | Toggle filter with count, spinner and an optional × button | `bg-ink` `border-nav-pill` `text-ui` |
| Tabs | tabs.tsx | Uppercase tabs, `pill` (trip top bar) or `underline`; arrow keys | `label-caps` `bg-ink` `text-text-3` |
| NavPill | nav-pill.tsx | App nav link with the outlined active state | `label-caps` `border-nav-pill` |
| SegmentedToggle | segmented-toggle.tsx | One of a few views: `glass` (Board / Map), `outline` (Mine / Team), `quiet` (Board / Calendar / List) | `glass-control` `border-pill-outline` `bg-ink` |
| Switch | switch.tsx | role="switch": `track` 40 x 24 and `pill` ("In my places") | `bg-ink` `border-pill-outline` |
| Avatar | avatar.tsx | Photo or initials; round 26 to 48, tall stadium `profile`; `soft`, `ink`, `dashed` | `bg-avatar` `bg-ink` `border-nav-pill` `font-display` `text-initials` `text-micro` |
| FilmImage | film-image.tsx | next/image with the warm `film` grade | `film` |
| ArchPhoto | arch-photo.tsx | Arch-topped photo with a count caption | `arch-top-fluid` `film` `rounded-pill` |
| MatchPill, StarGlyph | match-pill.tsx | Score on photos: md "94 match" (dark or light glass), sm map chip, xs tile number | `bg-match-pill` `bg-ink` `text-ui` `text-micro` |
| ScoreDot | score-dot.tsx | 34px score disc for dense map pins, optional glow | `bg-surface` `border-pill-outline` `shadow-pin` `glow-ring` |
| BookmarkMark, BookmarkGlyph | bookmark-mark.tsx | The "your place" mark in six sizes, optional surface ring | `bg-ink` `text-surface` |
| YourPlaceBadge, NewFromAskBadge, PhotoBadge | your-place-badge.tsx | Labels on photos next to the match pill | `bg-ink/72` `border-surface/30` |
| YourNoteRow | your-note-row.tsx | Bookmark plus the advisor's quoted note, on photo or surface | `text-ui` |
| BecauseRow | because-row.tsx | Overlapping favorite photos plus "Because she loves ..." | `border-surface` `film` |
| PhotoCard | photo-card.tsx | Board card shell: photo, shade, badges, action, name at lg 44 / md 30 / sm 26, extra rows, glow when highlighted | `text-card-lg` `text-card-md` `text-card-sm` `photo-shade` `shadow-card` `rounded-photo` `glow-ring` |
| SkeletonCard | skeleton-card.tsx | Static placeholder card, "Reading why it fits Ana" | `bg-avatar` `bg-surface/60` `text-text-2` |
| StreamingCursor | streaming-cursor.tsx | 2 x 18 ink caret at the end of streaming text | `bg-ink` |
| Rule | rule.tsx | Hairline, horizontal or vertical, normal or strong | `border-rule` `border-rule-strong` |
| UnderlineField | underline-field.tsx | Underlined input with icon slot and clear button; amber underline on focus | `border-nav-pill` `border-glow` `text-text-muted` |
| Popover | popover.tsx | Panel anchored under its trigger; Esc, outside click, focus trap, focus return | `bg-surface` `border-rule-strong` `rounded-menu` `shadow-menu` `rise-in` |
| Menu, MenuItem, MenuLabel, MenuSeparator | menu.tsx | Action list in a Popover; arrow keys, Tab closes | `hover:bg-canvas` `rounded-row` `label-caps` |
| Sheet | sheet.tsx | Native dialog over a blurred scrim: `right` (place profile) or `center`; scroll lock | `backdrop:bg-scrim-soft` `rounded-panel` `shadow-panel` `rise-in` |
| GlassDock | glass-dock.tsx | Frosted bottom dock with a centered toggle slot above it | `glass-dock` `rounded-dock` `shadow-dock` |
| Stepper | stepper.tsx | Adults / Children count with minus and plus | `border-pill-outline` `text-body` |
| Calendar | calendar.tsx | Controlled two-month range picker, Exact dates / Not set yet, footer label, Clear, action slot | `bg-avatar` `bg-ink` `border-rule` `text-action` (helpers in `lib/ui/dates.ts`) |
| StarburstOrnament | starburst-ornament.tsx | Fine-line starburst (traveler view footer) | `text-ink` |
| Toast, ToastAction | toast.tsx | Plain bottom-center confirmation with an optional Undo | `bg-ink` `text-glow` `shadow-menu` `rise-in` |
| EmptyState | empty-state.tsx | Bodoni title, one line, an action, dashed frame | `font-display` `text-empty` `border-pill-outline` |

Shell pieces (`components/shell`): AppBar (+ SearchResultsPanel, UserMenu, Wordmark), AppBarContainer (wires the (app) layout), PageHeader, TripTopBar.

Motion: `rise-in` on things that appear (popover panels, sheets, toasts). Everything else is a hover transition. The Spinner turns only when motion is allowed.
