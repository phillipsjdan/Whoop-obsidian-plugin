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
   | **Scopes** | `offline`, `read:workout`, `read:recovery`, `read:sleep` |
   | **Contacts** | Your email address |

   The redirect URI must match **exactly** — no trailing slash, all lowercase. This is the custom protocol Obsidian registers on your machine, which is how the browser hands the authorization back to the app.

   **What each scope is for:**

   | Scope | Needed for |
   |-------|-----------|
   | `offline` | Refreshing the access token, so you connect once rather than daily |
   | `read:workout` | The workout itself — every table row |
   | `read:recovery` | Recovery score, resting heart rate, HRV, blood oxygen |
   | `read:sleep` | Sleep duration, performance and efficiency |

   The last two are only used by the **day context sentence**. Turn that setting off and the plugin never calls those endpoints — but WHOOP still requires the scopes to be granted at authorization time if you want the option later. `read:body_measurement` and `read:profile` are never requested: the plugin does not need to know who you are or what you weigh.
4. Save the app and copy its **Client ID** and **Client Secret**.
5. In Obsidian, open **Settings → WHOOP workout insert**, paste both values, then click **Connect**.
6. A browser window opens on WHOOP's authorization page. Approve access, and your browser hands off to Obsidian — the modal closes and the status flips to *connected*.

   If your browser refuses to open `obsidian://` links (some Linux setups, some hardened browsers), copy the whole `obsidian://whoop-workout-callback?code=…&state=…` URL it landed on and paste it into the **Callback URL** field in the same modal. The full URL is required, not just the code, so the `state` parameter can be verified.

### Upgrading from a version before the day context

WHOOP grants scopes when you approve access, so a token issued against the old `offline read:workout` app **cannot** read recovery or sleep — no matter what the plugin asks for afterwards. If you connected before those scopes existed:

1. Add `read:recovery` and `read:sleep` to your app on developer.whoop.com and save.
2. In **Settings → WHOOP workout insert**, click **Reconnect** and approve again.

Until you do, workouts insert exactly as before and the day context sentence is silently skipped — the failed calls are logged to the developer console and nothing is written in their place. Nothing breaks; the sentence just never appears.

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
Recovery that morning was 62%, with a resting heart rate of 48 bpm, HRV of 78 ms
and blood oxygen at 96%. The night before brought 7 h 12 min of sleep against a
need of 8 h 22 min — 86% sleep performance, 93% efficiency and 9 disturbances.
<!-- whoop-day: 2026-08-09 -->

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
| Calorie rate | 874 kcal/h |
| Strain rate | 17.7 /h |
| Zone 2 time | 15 min (36%) |
| Zone 3 time | 19 min (45%) |
| Zone 4 time | 5 min (12%) |
| Zone 5 time | 3 min (7%) |
| Time in zone 3+ | 27 min (64%) |
| Data completeness | 98% |
<!-- whoop-workout: b5f2c1a0-1111-4a2b-9c3d-000000000001 -->
```

The workout block is self-contained: one heading, one table, no navigation links, so it sits inside whatever structure your note already has. The trailing HTML comments are invisible in reading view and are what let the plugin recognise its own output later.

### The day context sentence

Recovery and sleep describe the **day**, not the workout, so they are written as prose above the block rather than as rows inside the table — putting them in the table would imply they belong to that run. Both are settled figures: WHOOP scores them once in the morning and they do not move.

**Day strain is deliberately not included.** The cycle endpoint reports strain accumulated so far rather than the day's total, and WHOOP cycles run wake-to-wake, so for a workout filed the same day it is a snapshot that is stale by the time you read it — while reading like a settled figure. The app's Strain Target, which would be the useful number, is a Strain Coach feature and is not exposed on the developer platform at all. So the plugin says nothing rather than something misleading, and does not request `read:cycles`.

It is written **once per note**, with the first WHOOP block added to the page:

- Add a morning run to today's daily note → you get the sentence and the workout.
- Add an evening lift to the same note → you get the workout only. The day has already been stated, and repeating it would be noise.
- The check is the `<!-- whoop-day: … -->` and `<!-- whoop-workout: … -->` markers, so it holds across sessions, and across workouts added days apart.
- It is re-evaluated at write time, not when you start the command, so two workouts added in quick succession cannot both decide they are first.
- Delete the sentence by hand and the marker goes with it — the next workout you add to that note will write it again.

Every clause is dropped when WHOOP has no number for it, so a partially scored day still reads as English. A day with nothing scored at all produces no sentence rather than an empty one. If WHOOP is still calibrating your baseline, the sentence says so instead of quoting the recovery score as fact.

Needs the `read:recovery` and `read:sleep` scopes — see [upgrading](#upgrading-from-a-version-before-the-day-context) if you connected before they were requested. Switch it off under **Settings → Day context sentence**, and those endpoints are never called.

### Details

- **Pace** is computed (duration ÷ distance) because WHOOP does not report it. Cycling and other wheeled/downhill sports get **Avg speed** instead.
- **Heart-rate zone rows** carry both the time and its share of the workout, followed by a combined **time in zone 3+**. Zones with no time in them are omitted, and the whole block can be switched off in settings. WHOOP returns these under `zone_durations` on v2 and `zone_duration` on v1; both are read.
- **Per-hour rates** (calorie burn, strain) make workouts of different lengths comparable. Strain is a logarithmic 0–21 score, so its rate is a rough intensity signal rather than a physical quantity. Off via settings.
- **Net elevation** appears alongside the gain only when the two differ — on a loop that returns to its start, the gain already tells the whole story.
- **Data completeness** normalizes `percent_recorded`, which arrives as a 0–100 percentage in some responses and a 0–1 fraction in others. Can be switched off.
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
| Heart rate zone breakdown | on | One row per non-empty zone, with its share, plus a zone 3+ total |
| Per-hour rates | on | Calorie burn and strain per hour |
| Data completeness | on | `percent_recorded` row |
| Day context sentence | on | Recovery and sleep above the first workout in a note |
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
| `src/fetch.ts` | `next_token` pagination, local-day range helpers, day-context gathering |
| `src/models.ts` | Workout, cycle, recovery and sleep types, `SPORT_NAMES`, sport emoji |
| `src/format.ts` | Durations, distances, pace, timezone-aware timestamps |
| `src/template.ts` | Snippet, day-sentence and note rendering, path suggestion |
| `src/insert.ts` | Heading scanning and splicing — pure strings, no vault access |
| `src/settings.ts` | Settings tab |
| `src/ui/` | Picker, prompts, connect modal |
| `src/main.ts` | Plugin entry point, commands, protocol handler |

`src/insert.ts` is the riskiest code here and is tested accordingly: heading missing, heading at end of file, heading immediately followed by another heading, empty file, nested subsections, setext headings (as both target and section boundary), code fences, frontmatter, CRLF, and blank-line normalization.

CI runs the typecheck, both lint passes, the tests and a production build for every pull request into `main`/`master`. The Node version comes from `.nvmrc` (22) so CI and local development cannot drift; there is no version matrix, because the source uses no Node APIs beyond the global `crypto` and esbuild emits the same Electron-targeted bundle whichever Node runs it.

## Releasing

Merging into `main` cuts a release automatically. No tags to push, no version to edit by hand.

**Choosing the version.** The patch number goes up by default. To bump further, put a marker anywhere in the merge commit — which for a squash merge means the pull request title is enough:

| Marker | Effect on `1.4.2` |
|---|---|
| *(none)* | `1.4.3` |
| `[minor]` | `1.5.0` |
| `[major]` | `2.0.0` |
| `[skip release]` | Merges without releasing |

`[major]` beats `[minor]`, and `[skip release]` beats both. You can also run the **Release** workflow by hand from the Actions tab and pick the bump from a dropdown; a manual choice overrides whatever the commit says.

**What the workflow does.** Typecheck, both lints and the tests run *before* anything is written. Then `scripts/version.mjs` moves `manifest.json`, `package.json` and `versions.json` to the new version together, the plugin is built, and `scripts/validate-release.mjs` checks the result against what Obsidian requires — refusing to publish otherwise:

- The tag is the bare version, `1.4.3`, never `v1.4.3`. A `v` prefix makes Obsidian and BRAT ignore the release.
- `manifest.json`'s version matches the tag exactly.
- `versions.json` has an entry for the new version pointing at the manifest's `minAppVersion`, so older Obsidian installs are offered the last release they can run.
- `main.js`, `manifest.json` and `styles.css` are attached as individual assets — not a zip, which Obsidian cannot read.
- The manifest carries every required field, with the right type, and an `id` that is usable as a folder name.

Only then does it commit the version bump, tag it, and publish the release with generated notes.

To raise the minimum Obsidian version, edit `minAppVersion` in `manifest.json` in the usual way; the next release records it against the new version automatically.

**Two things to be aware of.** The workflow pushes the version-bump commit to `main`, so a branch protection rule requiring reviews or status checks on `main` will block it unless GitHub Actions is exempted. And the release is only as good as the checks above — nothing here has been verified against the live WHOOP API, so a green release is not evidence the plugin talks to WHOOP correctly.

---

## Differences from the reference plugin

Adapted from [benstraw/obsidian-whoop-plugin](https://github.com/benstraw/obsidian-whoop-plugin) (MIT), with these changes:

- **OAuth `state` is validated.** The reference generates a `state` but never checks it on callback. Any process on the machine can fire an `obsidian://` URL, so an unchecked callback lets someone else's authorization code be exchanged for tokens stored in your vault. Here the returned state is compared (constant-time) against the pending one, expires after ten minutes, and is cleared before the exchange so a replay cannot reuse it.
- **HTTP status handling actually runs.** `requestUrl` throws on non-2xx by default, which made the reference's 429/404 branches unreachable; this client passes `throw: false` and honours `Retry-After`.
- **No `writeNote`.** The reference's `writeNote` calls `vault.modify` on any existing file. This plugin has no such path: heading insertion splices through `vault.process`, and note creation refuses to overwrite.
- **Scopes kept read-only and minimal.** `offline read:workout read:recovery read:sleep`; `read:cycles`, `read:body_measurement` and `read:profile` are never requested. The recovery and sleep scopes back the day context sentence and nothing else, and the endpoints go untouched when that setting is off.
- **Day boundaries are local**, not UTC, so an evening workout does not show up on tomorrow's date.
- **Token refreshes are single-flight.** WHOOP rotates the refresh token on every use, so two overlapping refreshes leave one holding a retired token — and whichever saved last would persist it, breaking the connection until you reconnect by hand. Overlapping callers share one in-flight refresh.
- **Setext headings are recognised.** Only relevant here because this plugin writes into existing notes, but a missed heading is a missed section boundary, which puts the workout in the wrong place.
- **Zone durations and `percent_recorded`** are rendered; the reference's daily template does not surface either.

## Licence

MIT. See [LICENSE](LICENSE).
