# WHOOP Workout Insert

An Obsidian plugin that lets you pick **one specific WHOOP workout** and drop it into the notes you already keep — at the cursor, under a heading, or as a new note.

It is deliberately narrow. It does not generate daily notes, it does not sync on a schedule, and it never rewrites a file wholesale. Every write is either an editor-buffer insertion, a splice into a section you named, or a brand-new file that refuses to clobber an existing one.

If you want full daily/weekly health notes, use [benstraw/obsidian-whoop-plugin](https://github.com/benstraw/obsidian-whoop-plugin) instead — this plugin's OAuth and API layers are adapted from it (MIT), and the two can be installed side by side.

---

## Setting up a WHOOP developer app

You need your own WHOOP developer app; there is no shared key.

1. Sign in at **[developer.whoop.com](https://developer.whoop.com)** with your WHOOP account and open the developer dashboard.
2. Create a team if you do not have one, then create a new app.
3. Fill in the app details:

   | Field | Value |
   |-------|-------|
   | **Name** | Anything, e.g. `Obsidian workout insert` |
   | **Redirect URI** | `obsidian://whoop-workout-callback` |
   | **Scopes** | `offline` and `read:workout` |
   | **Contacts** | Your email address |

   The redirect URI must match **exactly** — no trailing slash, all lowercase. This is the custom protocol Obsidian registers on your machine, which is how the browser hands the authorization back to the app.

   Only two scopes are needed. This plugin never reads recovery, sleep, cycle, body-measurement or profile data, so do not grant those.
4. Save the app and copy its **Client ID** and **Client Secret**.
5. In Obsidian, open **Settings → WHOOP workout insert**, paste both values, then click **Connect**.
6. A browser window opens on WHOOP's authorization page. Approve access, and your browser hands off to Obsidian — the modal closes and the status flips to *connected*.

   If your browser refuses to open `obsidian://` links (some Linux setups, some hardened browsers), copy the whole `obsidian://whoop-workout-callback?code=…&state=…` URL it landed on and paste it into the **Callback URL** field in the same modal. The full URL is required, not just the code, so the `state` parameter can be verified.

### A note on credentials

Client ID, client secret and OAuth tokens are stored in the vault's plugin data file (`.obsidian/plugins/whoop-workout-insert/data.json`) in plain text. That is the standard for Obsidian plugins — there is no vault-level secret store — but it does mean the file should not be committed to a public repo or synced anywhere you would not put a password. Add `.obsidian/plugins/*/data.json` to your sync exclusions if that matters to you.

Access tokens are refreshed automatically once they come within five minutes of expiring.

---

## Commands

All three open the same picker: enter a date (defaults to today, `◀`/`▶` step a day at a time), then click the workout you want. A day with no workouts leaves the picker open so you can try another date.

### Insert workout at cursor

Renders the workout and inserts it at the cursor via the editor API, replacing the selection if there is one. No file is read or rewritten, so there is nothing to clobber.

### Insert workout under heading

Asks which heading to file it under (pre-filled from settings, e.g. `## WHOOP`).

- Type hashes (`## WHOOP`) to require that exact level; type a bare name (`WHOOP`) to match the first heading with that text at any level.
- Matching ignores case, surrounding whitespace and inline emphasis. Headings inside fenced code blocks and inside YAML frontmatter are not matched.
- Both heading styles are understood — `## Title` and `Title` underlined with `====` / `----` — so a setext heading correctly ends the section above it.
- The workout goes into that heading's section — everything up to the next heading of equal or higher level. Whether it lands directly under the heading or after the content already there is a setting.
- **If the workout is already in the note**, you are asked before a second copy goes in. Each inserted block ends with a hidden `<!-- whoop-workout: … -->` marker naming the workout it came from; it does not render in reading view.
- **If the heading does not exist**, you are asked whether to append the heading and the workout to the end of the note, or cancel. Nothing is written unless you say so.
- The splice is re-computed against the file's content at write time. If the note changed while the prompts were open, you get a notice and no write.

### Create new note from WHOOP workout

Suggests a path from the workout's date and sport (both the folder and the filename template are configurable) and lets you edit it before writing. **If a file already exists at that path, it is never overwritten** — you get a notice and the prompt reopens so you can rename or cancel. Missing folders are created.

---

## What gets inserted

```markdown
### 🏃 Running — 2026-08-09 07:12

| Metric | Value |
|--------|-------|
| Strain | 12.4 |
| Duration | 42 min |
| Distance | 8.02 km |
| Pace | 5:14 /km |
| Avg HR | 148 bpm |
| Max HR | 167 bpm |
| Calories | 612 kcal |
| Zone 2 time | 15 min |
| Zone 3 time | 19 min |
| Zone 4 time | 5 min |
| Zone 5 time | 3 min |
| Data completeness | 98% |
<!-- whoop-workout: b5f2c1a0-1111-4a2b-9c3d-000000000001 -->
```

The block is self-contained: one heading, one table, no navigation links or day-level sections, so it sits inside whatever structure your note already has. The trailing HTML comment is invisible in reading view and is what lets the plugin notice a workout you have already filed.

Details:

- **Pace** is computed (duration ÷ distance) because WHOOP does not report it. Cycling and other wheeled/downhill sports get **Avg speed** instead.
- **Heart-rate zone rows** and **data completeness** are both surfaced here and both can be switched off in settings. Zones with no time in them are omitted.
- **Timestamps** are rendered in the workout's own time zone (from `timezone_offset`), not the reader's — a 7 am run reads as 7 am no matter where you open the note.
- **Distance, pace and elevation** follow the km/miles setting (elevation switches to feet with miles).
- A **workout WHOOP has not scored yet** still renders: you get the duration and a `_Score state: PENDING_SCORE._` line rather than a half-empty table.
- Rows whose data is absent are dropped, except that a distance sport with no distance says `not recorded` — usually a GPS lock that never happened, worth seeing.

"Create new note" writes the same block under YAML frontmatter:

```yaml
---
whoop_workout_id: "b5f2c1a0-…"
date: 2026-08-09
sport: "Running"
sport_id: 0
start: "2026-08-09T14:12:00.000Z"
end: "2026-08-09T14:54:00.000Z"
timezone_offset: "-07:00"
duration_minutes: 42
strain: 12.4
distance_km: 8.02
average_heart_rate: 148
max_heart_rate: 167
kilocalories: 612
tags:
  - whoop
  - workout
---
```

---

## Settings

| Setting | Default | Notes |
|---------|---------|-------|
| Client ID / Client secret | — | From your WHOOP developer app |
| Distance unit | Kilometres | Drives distance, pace and elevation |
| Date format | `YYYY-MM-DD HH:mm` | Tokens: `YYYY YY MMMM MMM MM DD ddd HH mm ss` |
| Heading level | `###` | Level of the workout block's own heading |
| Sport emoji | on | Emoji prefix on the heading |
| Heart rate zone breakdown | on | One row per non-empty zone |
| Data completeness | on | `percent_recorded` row |
| Default heading | `## WHOOP` | Pre-filled in the heading prompt |
| Position within the section | End of the section | Or directly under the heading |
| New note folder | `WHOOP Workouts` | Empty for the vault root |
| Filename template | `{{date}} {{sport}}` | Also `{{time}}`, `{{id}}` |
| Open after creating | on | |

---

## On iPhone and iPad

The plugin is built for mobile and marked `isDesktopOnly: false`. Everything it touches — `requestUrl`, `registerObsidianProtocolHandler`, `crypto.getRandomValues`, the modal and settings APIs — is available in Obsidian mobile, and there is no Electron, Node or filesystem access anywhere in the source.

Mobile-specific behaviour:

- **The date field is a native picker.** On mobile the picker's date input is `type="date"`, so you get the iOS wheel rather than typing `YYYY-MM-DD` on a soft keyboard, and choosing a date reloads the list without a second tap. The `◀`/`▶` buttons still work.
- **No autofocus.** Text prompts do not grab focus on mobile, which would otherwise throw up the keyboard and push the buttons off screen.
- **Larger tap targets.** Workout rows are at least 44 pt tall, and the date row wraps rather than squashing.
- **16 px inputs**, so iOS does not zoom the viewport when a field takes focus.
- **The authorization URL is shown in a read-only field.** If the *Open authorization page* button does not hand off to Safari, tap that field to select the URL and paste it into the browser yourself. The same modal takes the resulting `obsidian://…` URL back.

**I have not run this on a physical iPhone or iPad** — the work above is a source audit plus mobile-specific fixes, not a device test, and I have no way to run iOS from where this was built. The OAuth hand-off is the part most likely to need a real device: iOS custom URL schemes behave differently across browsers and Focus modes. Please try this checklist and tell me what breaks:

1. Settings open and the client ID/secret fields are usable.
2. **Connect** opens Safari on WHOOP's authorization page.
3. Approving returns you to Obsidian and the status flips to *connected*. (If not: does the read-only URL field + manual paste work instead?)
4. The picker's date field shows the iOS date wheel, and changing the date reloads the list.
5. Workout rows are comfortably tappable and the list scrolls.
6. Each of the three commands completes, and the heading prompt is usable with the keyboard up.

## Installing

### BRAT (recommended for testing)

Install the [BRAT](https://github.com/TfTHacker/obsidian42-brat) plugin, then *Add beta plugin* with this repository's URL.

### Manual

```bash
npm install
npm run build
```

Copy `main.js`, `manifest.json` and `styles.css` into `<vault>/.obsidian/plugins/whoop-workout-insert/`, then enable the plugin in **Settings → Community plugins**. Reload Obsidian if it does not appear.

---

## Development

```bash
npm install
npm run dev      # esbuild in watch mode
npm test         # vitest
npm run lint     # tsc --noEmit
npm run lint:obsidian
```

The plugin talks to WHOOP through Obsidian's `requestUrl`, never `fetch`, which is the community-plugin convention and sidesteps CORS. There are no runtime dependencies.

Layout:

| File | Purpose |
|------|---------|
| `src/auth.ts` | OAuth2 flow, state generation and validation, token refresh |
| `src/client.ts` | `requestUrl` wrapper: backoff on 429, typed 401/404 errors |
| `src/fetch.ts` | `next_token` pagination, local-day range helpers |
| `src/models.ts` | Workout types, `SPORT_NAMES`, sport emoji |
| `src/format.ts` | Durations, distances, pace, timezone-aware timestamps |
| `src/template.ts` | Snippet and note rendering, path suggestion |
| `src/insert.ts` | Heading scanning and splicing — pure strings, no vault access |
| `src/settings.ts` | Settings tab |
| `src/ui/` | Picker, prompts, connect modal |
| `src/main.ts` | Plugin entry point, commands, protocol handler |

`src/insert.ts` is the riskiest code here and is tested accordingly: heading missing, heading at end of file, heading immediately followed by another heading, empty file, nested subsections, setext headings (as both target and section boundary), code fences, frontmatter, CRLF, and blank-line normalization.

CI runs the typecheck, both lint passes, the tests and a production build for every pull request into `main`/`master`. The Node version comes from `.nvmrc` (22) so CI and local development cannot drift; there is no version matrix, because the source uses no Node APIs beyond the global `crypto` and esbuild emits the same Electron-targeted bundle whichever Node runs it.

---

## Differences from the reference plugin

Adapted from [benstraw/obsidian-whoop-plugin](https://github.com/benstraw/obsidian-whoop-plugin) (MIT), with these changes:

- **OAuth `state` is validated.** The reference generates a `state` but never checks it on callback. Any process on the machine can fire an `obsidian://` URL, so an unchecked callback lets someone else's authorization code be exchanged for tokens stored in your vault. Here the returned state is compared (constant-time) against the pending one, expires after ten minutes, and is cleared before the exchange so a replay cannot reuse it.
- **HTTP status handling actually runs.** `requestUrl` throws on non-2xx by default, which made the reference's 429/404 branches unreachable; this client passes `throw: false` and honours `Retry-After`.
- **No `writeNote`.** The reference's `writeNote` calls `vault.modify` on any existing file. This plugin has no such path: heading insertion splices through `vault.process`, and note creation refuses to overwrite.
- **Scopes reduced** to `offline read:workout`.
- **Day boundaries are local**, not UTC, so an evening workout does not show up on tomorrow's date.
- **Token refreshes are single-flight.** WHOOP rotates the refresh token on every use, so two overlapping refreshes leave one holding a retired token — and whichever saved last would persist it, breaking the connection until you reconnect by hand. Overlapping callers share one in-flight refresh.
- **Setext headings are recognised.** Only relevant here because this plugin writes into existing notes, but a missed heading is a missed section boundary, which puts the workout in the wrong place.
- **Zone durations and `percent_recorded`** are rendered; the reference's daily template does not surface either.

## Licence

MIT. See [LICENSE](LICENSE).
