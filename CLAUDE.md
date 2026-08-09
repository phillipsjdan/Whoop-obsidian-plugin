# CLAUDE.md

Obsidian plugin that inserts one chosen WHOOP workout into an existing note.
`README.md` covers architecture, settings and setup — this file is only the
things that have already gone wrong.

## Checks

Four, not one. Run all of them before claiming a change works:

```
npm test            # vitest
npm run lint        # tsc --noEmit
npm run lint:obsidian   # eslint, with the obsidianmd plugin rules
npm run build       # esbuild, production
```

## WHOOP API

**Verify field names against a real response, not against the docs or a client
library.** Two shipped bugs came from this. The workout score's zone breakdown is
`zone_durations` on v2 and `zone_duration` on v1; the code read only the v1 name,
so the entire heart-rate zone block silently never rendered. `percent_recorded`
is documented as 0–100 but has arrived as a 0–1 fraction, rendering a fully
recorded run as "1%". Both are now read through helpers in `models.ts` that
accept either form.

**The official spec is vendored at `reference/whoop-openapi.json`.** It is a
verbatim copy of `https://api.prod.whoop.com/developer/doc/openapi.json`, saved
because both that URL and `developer.whoop.com` are unreachable from this
environment — the reason field shapes were previously guessed from third-party
clients, the same class of source that had `zone_duration` wrong. Check the
vendored spec first. It is a snapshot, not a live feed, so a real response still
wins over it; refresh it by pasting in a newly fetched copy.

Even with the spec, treat every `score` field as optional and read it
defensively: a renamed or missing field must degrade to a dropped clause or a
skipped row, never a crash. `renderDaySummary` is the model for this. The spec's
own `required` lists are not a guarantee — it marks `percent_recorded` required
and documents it as 0–100, and the 0–1 fractions that forced `percentRecorded`
into existence were real responses.

**`sport_id` and `v1_id` were sunset on 09/01/2025.** The spec marks both
optional and says they "will not exist past" that date, while `sport_name` is
required. `models.ts` still types `sport_id` as required and keys the emoji,
pace and frontmatter off it, so those degrade silently once WHOOP stops sending
it. Unverified against a live response — see the note in `models.ts`.

**Scope spellings are not uniform.** It is `read:cycles` (plural) but
`read:recovery`, `read:sleep`, `read:workout`, `read:body_measurement`
(singular). Asking for a scope WHOOP does not define gets the whole
authorization rejected as malformed — and that rejection comes back with no
`state` parameter, which surfaces as a confusing state error rather than a scope
error.

**Adding a scope forces every existing user to reconnect** (WHOOP grants scopes
at consent time). Removing one does not — a token simply carries more than is
asked for.

**Day-level data is optional decoration.** Recovery and sleep are fetched
independently in `getDayContext`, and any failure yields null. A missing scope
must never stop the workout itself from being written.

Day strain is deliberately not fetched: the cycle endpoint reports strain
accumulated so far rather than a day total, so it is stale on same-day inserts.
Do not add it back without reading the note in `models.ts`.

## Tests

**Fixtures must mirror real API responses.** The zone bug survived because
`__tests__/fixtures.ts` was built with the same wrong key as the source, so a
green suite certified a feature that had never worked against live data. When a
field name is wrong in the source, assume it is wrong in the fixtures too.

Prefer a rendered-output assertion over a shape assertion — the snapshot-style
test in `template.test.ts` is what catches an unintended change to a note.

## Write-path invariants

These exist because this plugin writes into notes people already keep.

- Never rewrite a file wholesale. Writes are an editor-buffer insertion, a splice
  via `vault.process`, or `vault.create` (which refuses to overwrite).
- Re-compute the splice inside `vault.process` against the content being written,
  not against what was read before the prompts opened.
- The hidden `whoop-workout:` / `whoop-day:` markers are the idempotency
  mechanism. Anything written once per note keys off them.
- OAuth `state` is validated constant-time against a pending attempt, with a TTL.
  Do not add a callback path that skips it — any process can fire an
  `obsidian://` URL at a running Obsidian.

## Style

Match the surrounding code: comments explain why a thing is the way it is, not
what the line does. Several are load-bearing records of a bug — keep them.
