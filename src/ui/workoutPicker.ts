import { App, Modal, Notice, Platform, Setting, TextComponent } from "obsidian";
import {
  addLocalDays,
  formatLocalDate,
  parseDateInput,
} from "../fetch.ts";
import { DistanceUnit, durationMs, formatDateTime, formatDistance, formatDuration } from "../format.ts";
import { Workout, sportEmoji, sportName } from "../models.ts";

export interface WorkoutPickerOptions {
  title: string;
  /** Label on the action the caller will take with the chosen workout. */
  actionHint?: string;
  initialDate?: Date;
  distanceUnit: DistanceUnit;
  fetchWorkouts: (date: Date) => Promise<Workout[]>;
}

/**
 * Asks for a date, lists that day's workouts, and resolves with the one picked.
 * Resolves null if the modal is dismissed. An empty day leaves the modal open so
 * another date can be tried.
 */
export function pickWorkout(
  app: App,
  options: WorkoutPickerOptions
): Promise<Workout | null> {
  return new Promise((resolve) => {
    new WorkoutPickerModal(app, options, resolve).open();
  });
}

class WorkoutPickerModal extends Modal {
  private date: Date;
  private dateInput: TextComponent | null = null;
  private resultsEl!: HTMLElement;
  private settled = false;
  /** Guards against a slow response overwriting a newer one. */
  private requestId = 0;

  constructor(
    app: App,
    private readonly options: WorkoutPickerOptions,
    private readonly resolve: (workout: Workout | null) => void
  ) {
    super(app);
    this.date = options.initialDate ?? new Date();
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.addClass("whoop-workout-modal");
    contentEl.addClass("whoop-workout-picker");
    this.setTitle(this.options.title);

    if (this.options.actionHint) {
      contentEl.createEl("p", {
        cls: "setting-item-description",
        text: this.options.actionHint,
      });
    }

    new Setting(contentEl)
      .setName("Date")
      .setDesc("YYYY-MM-DD")
      .addExtraButton((btn) =>
        btn
          .setIcon("chevron-left")
          .setTooltip("Previous day")
          .onClick(() => this.stepDay(-1))
      )
      .addText((text) => {
        this.dateInput = text;
        text.setPlaceholder("YYYY-MM-DD").setValue(formatLocalDate(this.date));
        text.inputEl.addClass("whoop-workout-date-input");

        if (Platform.isMobile) {
          // A soft keyboard is a poor way to type a date; iOS and Android both
          // give a native picker for type="date", and its value is already
          // YYYY-MM-DD. Reloading on change means no separate Load tap.
          text.inputEl.type = "date";
          text.inputEl.addEventListener("change", () => void this.load());
        }

        // Listeners live on elements inside contentEl, which onClose empties.
        text.inputEl.addEventListener("keydown", (event: KeyboardEvent) => {
          if (event.key === "Enter") {
            event.preventDefault();
            void this.load();
          }
        });
      })
      .addExtraButton((btn) =>
        btn
          .setIcon("chevron-right")
          .setTooltip("Next day")
          .onClick(() => this.stepDay(1))
      )
      .addButton((btn) =>
        btn
          .setButtonText("Load")
          .setCta()
          .onClick(() => void this.load())
      );

    this.resultsEl = contentEl.createDiv({ cls: "whoop-workout-results" });
    void this.load();
  }

  private stepDay(delta: number): void {
    const current = this.readDate() ?? this.date;
    this.date = addLocalDays(current, delta);
    this.dateInput?.setValue(formatLocalDate(this.date));
    void this.load();
  }

  private readDate(): Date | null {
    const raw = this.dateInput?.getValue() ?? "";
    return parseDateInput(raw);
  }

  private async load(): Promise<void> {
    const date = this.readDate();
    if (!date) {
      new Notice("Enter a date as YYYY-MM-DD.");
      return;
    }
    this.date = date;

    const requestId = ++this.requestId;
    this.renderMessage("Loading workouts…");

    let workouts: Workout[];
    try {
      workouts = await this.options.fetchWorkouts(date);
    } catch (e) {
      if (requestId !== this.requestId) return;
      const message = e instanceof Error ? e.message : String(e);
      this.renderMessage(`Could not load workouts: ${message}`);
      return;
    }

    if (requestId !== this.requestId) return;

    if (workouts.length === 0) {
      new Notice(`No WHOOP workouts on ${formatLocalDate(date)}.`);
      this.renderMessage("No workouts on this date. Try another one.");
      return;
    }

    this.renderWorkouts(workouts);
  }

  private renderMessage(text: string): void {
    this.resultsEl.empty();
    this.resultsEl.createEl("p", { cls: "whoop-workout-empty", text });
  }

  private renderWorkouts(workouts: Workout[]): void {
    this.resultsEl.empty();

    for (const workout of workouts) {
      const row = this.resultsEl.createDiv({ cls: "whoop-workout-row" });
      row.tabIndex = 0;
      row.setAttribute("role", "button");

      const emoji = sportEmoji(workout.sport_id);
      row.createSpan({ cls: "whoop-workout-row-emoji", text: emoji });

      const body = row.createDiv({ cls: "whoop-workout-row-body" });
      body.createDiv({ cls: "whoop-workout-row-title", text: sportName(workout) });
      body.createDiv({
        cls: "whoop-workout-row-meta",
        text: metaLine(workout, this.options.distanceUnit),
      });

      const choose = () => this.choose(workout);
      row.addEventListener("click", choose);
      row.addEventListener("keydown", (event: KeyboardEvent) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          choose();
        }
      });
    }
  }

  private choose(workout: Workout): void {
    this.settled = true;
    this.resolve(workout);
    this.close();
  }

  onClose(): void {
    this.contentEl.empty();
    if (!this.settled) {
      this.settled = true;
      this.resolve(null);
    }
  }
}

function metaLine(workout: Workout, unit: DistanceUnit): string {
  const parts = [
    formatDateTime(workout.start, workout.timezone_offset, "HH:mm"),
    formatDuration(durationMs(workout.start, workout.end)),
  ];

  const distance = workout.score?.distance_meter ?? 0;
  if (distance > 0) parts.push(formatDistance(distance, unit));

  const strain = workout.score?.strain;
  if (typeof strain === "number" && Number.isFinite(strain)) {
    parts.push(`strain ${strain.toFixed(1)}`);
  }

  if (workout.score_state && workout.score_state !== "SCORED") {
    parts.push(workout.score_state.toLowerCase().replace(/_/g, " "));
  }

  return parts.join(" · ");
}
