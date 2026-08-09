import {
  Editor,
  MarkdownFileInfo,
  MarkdownView,
  Notice,
  Plugin,
  TFile,
  TFolder,
} from "obsidian";
import {
  CALLBACK_ACTION,
  PendingAuth,
  REDIRECT_URI,
  TokenData,
  TokenProvider,
  buildAuthUrl,
  exchangeCode,
  validateState,
} from "./auth.ts";
import { WhoopClient } from "./client.ts";
import { getDayContext, getWorkoutsForDay } from "./fetch.ts";
import { DayContext, Workout, sportName } from "./models.ts";
import {
  DEFAULT_SETTINGS,
  WhoopWorkoutSettingTab,
  WhoopWorkoutSettings,
  templateOptions,
} from "./settings.ts";
import {
  HeadingTarget,
  appendHeadingWithBlock,
  insertUnderHeading,
  parseHeadingInput,
} from "./insert.ts";
import {
  containsWorkout,
  normalizeNotePath,
  renderDaySummary,
  renderWorkoutNote,
  renderWorkoutSnippet,
  shouldIncludeDaySummary,
  suggestNotePath,
} from "./template.ts";
import { ConnectModal } from "./ui/connectModal.ts";
import { confirm, promptText } from "./ui/prompts.ts";
import { pickWorkout } from "./ui/workoutPicker.ts";

export default class WhoopWorkoutPlugin extends Plugin {
  settings!: WhoopWorkoutSettings;

  private pendingAuth: PendingAuth | null = null;
  private connectModal: ConnectModal | null = null;
  private onAuthorized: (() => void) | null = null;

  async onload(): Promise<void> {
    await this.loadSettings();
    this.addSettingTab(new WhoopWorkoutSettingTab(this.app, this));

    this.addCommand({
      id: "insert-workout-at-cursor",
      name: "Insert workout at cursor",
      editorCallback: (editor: Editor) => {
        void this.insertAtCursor(editor);
      },
    });

    this.addCommand({
      id: "insert-workout-under-heading",
      name: "Insert workout under heading",
      editorCallback: (_editor: Editor, ctx: MarkdownView | MarkdownFileInfo) => {
        const file = ctx.file;
        if (!file) {
          new Notice("This command needs a saved note.");
          return;
        }
        void this.insertUnderHeadingCommand(file);
      },
    });

    this.addCommand({
      id: "create-note-from-workout",
      name: "Create new note from workout",
      callback: () => {
        void this.createNoteCommand();
      },
    });

    this.registerObsidianProtocolHandler(CALLBACK_ACTION, (params) => {
      void this.handleCallback(params);
    });
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  // --- Authorization -------------------------------------------------------

  /** Opens the browser flow. `onConnected` refreshes the settings tab. */
  startAuthorization(onConnected: () => void): void {
    if (!this.settings.clientId || !this.settings.clientSecret) {
      new Notice("Enter your WHOOP client ID and client secret first.");
      return;
    }

    const { url, state } = buildAuthUrl(this.settings.clientId);
    this.pendingAuth = { state, createdAt: Date.now() };

    this.onAuthorized = onConnected;
    this.connectModal = new ConnectModal(this.app, {
      authUrl: url,
      onManualCallback: (rawUrl) => this.finishFromCallbackUrl(rawUrl),
      onCancel: () => {
        this.connectModal = null;
      },
    });
    this.connectModal.open();
  }

  private async handleCallback(params: Record<string, string>): Promise<void> {
    try {
      await this.finishCallback(params);
    } catch (e) {
      new Notice(messageOf(e));
      // Parameter names only — `code` and `state` are secrets, but knowing which
      // of them arrived is the whole diagnosis when a callback goes wrong.
      console.error(
        `[WHOOP workout insert] authorization failed. Callback carried: ${
          Object.keys(params).join(", ") || "no parameters"
        }`,
        e
      );
    }
  }

  private finishFromCallbackUrl(rawUrl: string): Promise<void> {
    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      throw new Error(
        "That does not look like a URL. Paste the whole obsidian://whoop-workout-callback?... URL."
      );
    }

    return this.finishCallback({
      code: parsed.searchParams.get("code") ?? undefined,
      state: parsed.searchParams.get("state") ?? undefined,
      error: parsed.searchParams.get("error") ?? undefined,
      error_description: parsed.searchParams.get("error_description") ?? undefined,
    });
  }

  /**
   * Completes an authorization callback, but only after the returned state
   * matches the one this plugin generated. Any process can fire an obsidian://
   * URL, so an unchecked callback would let someone else's authorization code
   * be traded for tokens stored in this vault.
   *
   * A callback that fails the state check leaves the pending attempt in place —
   * otherwise a bogus URL fired mid-flow would cancel the real authorization.
   */
  private async finishCallback(params: {
    code?: string;
    state?: string;
    error?: string;
    error_description?: string;
  }): Promise<void> {
    // An authorization WHOOP rejects outright can come back with an error and no
    // state at all, and reporting the missing state then is actively misleading:
    // it points at this plugin when the answer is in WHOOP's message. Nothing is
    // exchanged here and the pending attempt is left alone, so surfacing the
    // reason costs no security.
    if (!params.state && params.error) {
      throw new Error(
        `WHOOP declined the authorization request: ${describeError(params)}. ` +
          "If it mentions scopes, your developer app is missing one the plugin asks " +
          "for — add read:workout, read:recovery and read:sleep to it " +
          "at developer.whoop.com, save, then try again."
      );
    }

    validateState(this.pendingAuth, params.state);

    // Past the state check, this callback is provably the one we started.
    if (params.error) {
      this.pendingAuth = null;
      throw new Error(`WHOOP authorization was declined: ${describeError(params)}`);
    }

    if (!params.code) {
      this.pendingAuth = null;
      throw new Error("The WHOOP callback did not include an authorization code.");
    }

    // One code per attempt: clear before the exchange so a replayed callback
    // cannot reuse this state.
    const code = params.code;
    this.pendingAuth = null;

    const tokens = await exchangeCode(
      code,
      this.settings.clientId,
      this.settings.clientSecret,
      REDIRECT_URI
    );
    this.settings.tokens = tokens;
    await this.saveSettings();

    this.connectModal?.completeExternally();
    this.connectModal = null;
    this.onAuthorized?.();
    this.onAuthorized = null;
    new Notice("Connected to WHOOP.");
  }

  // --- WHOOP access --------------------------------------------------------

  private async getClient(): Promise<WhoopClient> {
    if (!this.settings.clientId || !this.settings.clientSecret) {
      throw new Error(
        "WHOOP credentials are not configured. Open Settings → WHOOP workout insert."
      );
    }
    return new WhoopClient(await this.tokens.getAccessToken());
  }

  /** Shared so overlapping commands never refresh the token twice. */
  private readonly tokens = new TokenProvider(
    () => ({
      clientId: this.settings.clientId,
      clientSecret: this.settings.clientSecret,
      tokens: this.settings.tokens,
    }),
    async (tokens: TokenData) => {
      this.settings.tokens = tokens;
      await this.saveSettings();
    }
  );

  /** Runs the shared picker. Returns null when the user backs out. */
  private async chooseWorkout(
    title: string,
    actionHint: string
  ): Promise<Workout | null> {
    if (!this.settings.tokens) {
      new Notice("Connect to WHOOP first in Settings → WHOOP workout insert.");
      return null;
    }

    return pickWorkout(this.app, {
      title,
      actionHint,
      distanceUnit: this.settings.distanceUnit,
      fetchWorkouts: async (date) => {
        const client = await this.getClient();
        return getWorkoutsForDay(client, date);
      },
    });
  }

  private snippetFor(workout: Workout): string {
    return renderWorkoutSnippet(workout, templateOptions(this.settings));
  }

  /**
   * Fetches the day's recovery, sleep and strain, or null when the setting is
   * off or nothing came back. Never throws: the day context is decoration on top
   * of the workout, so a missing scope must not sink the command.
   */
  private async dayContextFor(workout: Workout): Promise<DayContext | null> {
    if (!this.settings.includeDaySummary) return null;
    try {
      const client = await this.getClient();
      return await getDayContext(client, new Date(workout.start));
    } catch (e) {
      console.warn("[WHOOP workout insert] could not load the day context", e);
      return null;
    }
  }

  /**
   * The block to write: the workout, preceded by the day sentence when this is
   * the first WHOOP block on the page.
   *
   * `content` is read at write time rather than when the command started, so a
   * second workout added to a note already holding one does not repeat the day.
   */
  private blockFor(
    workout: Workout,
    content: string,
    context: DayContext | null
  ): string {
    const snippet = this.snippetFor(workout);
    if (!context || !shouldIncludeDaySummary(content)) return snippet;

    const summary = renderDaySummary(context);
    return summary ? `${summary}\n\n${snippet}` : snippet;
  }

  // --- Commands ------------------------------------------------------------

  private async insertAtCursor(editor: Editor): Promise<void> {
    const workout = await this.chooseWorkout(
      "Insert workout at cursor",
      "The workout is inserted where the cursor is, replacing any selection."
    );
    if (!workout) return;

    if (!(await this.confirmNotDuplicate(editor.getValue(), workout))) return;

    const context = await this.dayContextFor(workout);

    // Re-read the buffer: the fetch above gave the user time to keep typing.
    const block = this.blockFor(workout, editor.getValue(), context);

    // Only touches the editor buffer — no file is read or rewritten here.
    editor.replaceSelection(`${block}\n`);
    new Notice("Workout inserted.");
  }

  /**
   * Asks before inserting a workout the note already carries. Blocks rendered
   * by this plugin end with a hidden marker naming the workout they came from.
   */
  private async confirmNotDuplicate(
    content: string,
    workout: Workout
  ): Promise<boolean> {
    if (!containsWorkout(content, workout.id)) return true;

    const again = await confirm(this.app, {
      title: "Already in this note",
      message: `This ${sportName(workout)} is already in the note. Insert it a second time?`,
      confirmText: "Insert again",
      cancelText: "Cancel",
      warning: true,
    });
    if (!again) new Notice("Nothing was written.");
    return again;
  }

  private async insertUnderHeadingCommand(file: TFile): Promise<void> {
    const workout = await this.chooseWorkout(
      "Insert workout under heading",
      `The workout is added to a heading's section in ${file.basename}.`
    );
    if (!workout) return;

    const headingInput = await promptText(this.app, {
      title: "Insert under heading",
      description:
        'Which heading should the workout go under? Include hashes to require a level, for example "## WHOOP".',
      placeholder: "## WHOOP",
      initialValue: this.settings.defaultHeading,
      ctaText: "Insert",
      validate: (value) =>
        parseHeadingInput(value) ? null : "Enter a heading name.",
    });
    if (headingInput === null) return;

    const target = parseHeadingInput(headingInput);
    if (!target) return;

    const position = this.settings.insertPosition;

    // Read first to find out whether the heading exists, because the answer
    // decides whether we need to ask the user anything.
    const current = await this.app.vault.read(file);
    if (!(await this.confirmNotDuplicate(current, workout))) return;

    const context = await this.dayContextFor(workout);

    const preview = insertUnderHeading(
      current,
      target,
      this.blockFor(workout, current, context),
      position
    );

    let createHeading = false;
    if (!preview.found) {
      createHeading = await confirm(this.app, {
        title: "Heading not found",
        message: `"${target.text}" is not in ${file.basename}. Append the heading and the workout to the end of the note instead?`,
        confirmText: "Append to end",
        cancelText: "Cancel",
      });
      if (!createHeading) {
        new Notice("Nothing was written.");
        return;
      }
    }

    // Re-run the splice against the file's content at write time, so a change
    // made while the prompts were open cannot be clobbered.
    const result: { outcome: WriteOutcome } = { outcome: "vanished" };
    await this.app.vault.process(file, (data) => {
      // Rebuilt against the content being written, so the day sentence is
      // included or dropped based on what the note holds right now.
      const block = this.blockFor(workout, data, context);
      const spliced = insertUnderHeading(data, target, block, position);
      if (spliced.found) {
        result.outcome = "inserted";
        return spliced.content;
      }
      if (createHeading) {
        result.outcome = "appended";
        return appendHeadingWithBlock(
          data,
          target,
          block,
          defaultAppendLevel(target, this.settings.headingLevel)
        );
      }
      result.outcome = "vanished";
      return data;
    });

    switch (result.outcome) {
      case "inserted":
        new Notice(`Workout added under "${target.text}".`);
        break;
      case "appended":
        new Notice(`Added "${target.text}" and the workout to the end of the note.`);
        break;
      default:
        new Notice("The note changed while you were choosing. Nothing was written.");
    }
  }

  private async createNoteCommand(): Promise<void> {
    const workout = await this.chooseWorkout(
      "Create note from workout",
      "A new note is created. An existing file is never overwritten."
    );
    if (!workout) return;

    const context = await this.dayContextFor(workout);
    const content = renderWorkoutNote(
      workout,
      templateOptions(this.settings),
      context
    );
    let suggestion = suggestNotePath(
      workout,
      this.settings.newNoteFolder,
      this.settings.newNoteFilenameTemplate,
      this.settings.distanceUnit
    );

    // Loop rather than fail, so a name collision can be fixed in place.
    for (;;) {
      const answer = await promptText(this.app, {
        title: "New note from workout",
        description: "Path inside the vault. The .md extension is added if missing.",
        placeholder: "WHOOP Workouts/2026-08-09 Running.md",
        initialValue: suggestion,
        ctaText: "Create",
        validate: (value) => (normalizeNotePath(value) ? null : "Enter a file name."),
      });
      if (answer === null) return;

      const path = normalizeNotePath(answer);
      if (!path) return;

      if (this.app.vault.getAbstractFileByPath(path)) {
        new Notice(`"${path}" already exists. Pick a different name.`);
        suggestion = path;
        continue;
      }

      try {
        await this.ensureParentFolder(path);
        const file = await this.app.vault.create(path, content);
        new Notice(`Created ${path}.`);
        if (this.settings.openNewNote) {
          await this.app.workspace.getLeaf(false).openFile(file);
        }
        return;
      } catch (e) {
        // vault.create also refuses to overwrite, which covers the race between
        // the existence check above and the write.
        new Notice(`Could not create the note: ${messageOf(e)}`);
        suggestion = path;
      }
    }
  }

  private async ensureParentFolder(path: string): Promise<void> {
    const parts = path.split("/");
    parts.pop();
    if (parts.length === 0) return;

    let current = "";
    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      const existing = this.app.vault.getAbstractFileByPath(current);
      if (existing instanceof TFolder) continue;
      if (existing) {
        throw new Error(`"${current}" exists and is not a folder.`);
      }
      await this.app.vault.createFolder(current);
    }
  }
}

/** What the heading-insert command actually did to the file. */
type WriteOutcome = "inserted" | "appended" | "vanished";

/** Level to use when appending a heading the note did not have. */
function defaultAppendLevel(target: HeadingTarget, snippetLevel: number): number {
  if (target.level !== null) return target.level;
  // Keep the new heading above the snippet's own heading so the snippet nests
  // inside it rather than ending the section immediately.
  return Math.max(1, Math.min(6, snippetLevel - 1));
}

function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/**
 * WHOOP's reason for refusing, in prose.
 *
 * `error_description` is form-encoded, so its spaces arrive as `+`. Obsidian's
 * protocol handler percent-decodes the parameters but leaves those alone, and
 * "The+requested+scope+is+invalid" is not a sentence anyone should be shown.
 */
export function describeError(params: {
  error?: string;
  error_description?: string;
}): string {
  const raw = params.error_description ?? params.error ?? "no reason given";
  return raw.replace(/\+/g, " ").trim();
}
