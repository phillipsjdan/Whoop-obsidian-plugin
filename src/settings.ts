import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import type WhoopWorkoutPlugin from "./main.ts";
import { REDIRECT_URI, TokenData } from "./auth.ts";
import { DistanceUnit } from "./format.ts";
import { InsertPosition } from "./insert.ts";
import {
  DEFAULT_TAG_PREFIX,
  HIGH_STRAIN,
  MODERATE_STRAIN,
  normalizeTagPrefix,
} from "./tags.ts";
import { TemplateOptions } from "./template.ts";

export interface WhoopWorkoutSettings {
  clientId: string;
  clientSecret: string;
  tokens: TokenData | null;

  distanceUnit: DistanceUnit;
  dateFormat: string;

  headingLevel: number;
  includeEmoji: boolean;
  includeZoneDurations: boolean;
  includeDataCompleteness: boolean;
  includeRates: boolean;
  /** Day recovery/sleep sentence above the first workout in a note. */
  includeDaySummary: boolean;
  /** Express the heart-rate rows as a percentage of your max. */
  includePercentOfMax: boolean;

  /** Namespace for the tags under each workout heading, without the "#". */
  tagPrefix: string;
  includeSportTag: boolean;
  includeStrainTag: boolean;

  /** Cached from /user/measurement/body — it changes rarely enough to store. */
  maxHeartRate: number | null;
  /** When that cache was filled, as a Unix timestamp in ms. */
  maxHeartRateFetchedAt: number;

  defaultHeading: string;
  insertPosition: InsertPosition;

  newNoteFolder: string;
  newNoteFilenameTemplate: string;
  openNewNote: boolean;
}

export const DEFAULT_SETTINGS: WhoopWorkoutSettings = {
  clientId: "",
  clientSecret: "",
  tokens: null,

  distanceUnit: "km",
  dateFormat: "YYYY-MM-DD HH:mm",

  headingLevel: 3,
  includeEmoji: true,
  includeZoneDurations: true,
  includeDataCompleteness: true,
  includeRates: true,
  includeDaySummary: true,
  includePercentOfMax: true,

  tagPrefix: DEFAULT_TAG_PREFIX,
  includeSportTag: true,
  includeStrainTag: true,

  maxHeartRate: null,
  maxHeartRateFetchedAt: 0,

  defaultHeading: "## WHOOP",
  insertPosition: "bottom",

  newNoteFolder: "WHOOP Workouts",
  newNoteFilenameTemplate: "{{date}} {{sport}}",
  openNewNote: true,
};

export function templateOptions(settings: WhoopWorkoutSettings): TemplateOptions {
  return {
    distanceUnit: settings.distanceUnit,
    dateFormat: settings.dateFormat,
    headingLevel: settings.headingLevel,
    includeEmoji: settings.includeEmoji,
    includeZoneDurations: settings.includeZoneDurations,
    includeDataCompleteness: settings.includeDataCompleteness,
    includeRates: settings.includeRates,
    tagPrefix: settings.tagPrefix,
    includeSportTag: settings.includeSportTag,
    includeStrainTag: settings.includeStrainTag,
    maxHeartRate: settings.includePercentOfMax ? settings.maxHeartRate : null,
  };
}

export class WhoopWorkoutSettingTab extends PluginSettingTab {
  constructor(app: App, private readonly plugin: WhoopWorkoutPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass("whoop-workout-settings");

    this.renderConnection(containerEl);
    this.renderFormatting(containerEl);
    this.renderTags(containerEl);
    this.renderInsertion(containerEl);
    this.renderNewNotes(containerEl);
  }

  private renderConnection(containerEl: HTMLElement): void {
    const settings = this.plugin.settings;

    new Setting(containerEl).setName("WHOOP connection").setHeading();

    const status = containerEl.createEl("p", { cls: "whoop-workout-status" });
    status.appendText("Status: ");
    if (settings.tokens) {
      status.createSpan({ cls: "whoop-workout-connected", text: "connected" });
    } else {
      status.createSpan({ cls: "whoop-workout-disconnected", text: "not connected" });
    }

    containerEl.createEl("p", {
      cls: "setting-item-description",
      text: `Create an app at developer.whoop.com with the redirect URI ${REDIRECT_URI} and the scopes "offline", "read:workout", "read:recovery", "read:sleep" and "read:body_measurement", then paste its credentials below.`,
    });

    new Setting(containerEl)
      .setName("Client ID")
      .setDesc("From your WHOOP developer app.")
      .addText((text) =>
        text
          .setPlaceholder("Enter client ID")
          .setValue(settings.clientId)
          .onChange(async (value) => {
            settings.clientId = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Client secret")
      .setDesc("Stored in this vault's plugin data file, in plain text.")
      .addText((text) => {
        text
          .setPlaceholder("Enter client secret")
          .setValue(settings.clientSecret)
          .onChange(async (value) => {
            settings.clientSecret = value.trim();
            await this.plugin.saveSettings();
          });
        text.inputEl.type = "password";
      });

    new Setting(containerEl)
      .setName(settings.tokens ? "Reconnect" : "Connect")
      .setDesc("Opens WHOOP in your browser to authorize this vault.")
      .addButton((btn) =>
        btn
          .setButtonText(settings.tokens ? "Reconnect" : "Connect")
          .setCta()
          .onClick(() => {
            this.plugin.startAuthorization(() => this.display());
          })
      );

    if (settings.tokens) {
      new Setting(containerEl)
        .setName("Disconnect")
        .setDesc("Forgets the stored access and refresh tokens.")
        .addButton((btn) =>
          btn
            .setButtonText("Disconnect")
            .setWarning()
            .onClick(async () => {
              settings.tokens = null;
              await this.plugin.saveSettings();
              new Notice("Disconnected from WHOOP.");
              this.display();
            })
        );
    }
  }

  private renderFormatting(containerEl: HTMLElement): void {
    const settings = this.plugin.settings;

    new Setting(containerEl).setName("Formatting").setHeading();

    new Setting(containerEl)
      .setName("Distance unit")
      .setDesc("Used for distance, pace and elevation.")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("km", "Kilometres")
          .addOption("miles", "Miles")
          .setValue(settings.distanceUnit)
          .onChange(async (value) => {
            settings.distanceUnit = value as DistanceUnit;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Date format")
      .setDesc(
        "Timestamp in the workout heading. Tokens: YYYY, YY, MMMM, MMM, MM, DD, ddd, HH, mm, ss. Times are shown in the workout's own time zone."
      )
      .addText((text) =>
        text
          .setPlaceholder("YYYY-MM-DD HH:mm")
          .setValue(settings.dateFormat)
          .onChange(async (value) => {
            settings.dateFormat = value.trim() || DEFAULT_SETTINGS.dateFormat;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Heading level")
      .setDesc("Level of the heading that starts each inserted workout block.")
      .addDropdown((dropdown) => {
        for (let level = 1; level <= 6; level++) {
          dropdown.addOption(String(level), `${"#".repeat(level)} (H${level})`);
        }
        dropdown.setValue(String(settings.headingLevel)).onChange(async (value) => {
          settings.headingLevel = Number(value);
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("Sport emoji")
      .setDesc("Prefix the workout heading with an emoji for the sport.")
      .addToggle((toggle) =>
        toggle.setValue(settings.includeEmoji).onChange(async (value) => {
          settings.includeEmoji = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("Heart rate zone breakdown")
      .setDesc(
        "Add a row per heart rate zone with the time spent in it and its share of the workout, plus a combined zone 3+ total."
      )
      .addToggle((toggle) =>
        toggle.setValue(settings.includeZoneDurations).onChange(async (value) => {
          settings.includeZoneDurations = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("Per-hour rates")
      .setDesc("Add calorie burn and strain expressed per hour.")
      .addToggle((toggle) =>
        toggle.setValue(settings.includeRates).onChange(async (value) => {
          settings.includeRates = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("Heart rate as a percentage of max")
      .setDesc(
        settings.maxHeartRate
          ? `Show the heart-rate rows against your max of ${settings.maxHeartRate} bpm, read from WHOOP and refreshed monthly.`
          : "Show the heart-rate rows as a percentage of your max, read from WHOOP the next time you insert a workout."
      )
      .addToggle((toggle) =>
        toggle.setValue(settings.includePercentOfMax).onChange(async (value) => {
          settings.includePercentOfMax = value;
          await this.plugin.saveSettings();
          this.display();
        })
      );

    new Setting(containerEl)
      .setName("Day context sentence")
      .setDesc(
        "Write the day's recovery and sleep as a sentence above the first workout added to a note. Later workouts on the same note do not repeat it. Needs the recovery and sleep scopes — reconnect if you authorized before this setting existed."
      )
      .addToggle((toggle) =>
        toggle.setValue(settings.includeDaySummary).onChange(async (value) => {
          settings.includeDaySummary = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("Data completeness")
      .setDesc("Add a row showing how much of the activity WHOOP recorded.")
      .addToggle((toggle) =>
        toggle.setValue(settings.includeDataCompleteness).onChange(async (value) => {
          settings.includeDataCompleteness = value;
          await this.plugin.saveSettings();
        })
      );
  }

  private renderTags(containerEl: HTMLElement): void {
    const settings = this.plugin.settings;
    const prefix = normalizeTagPrefix(settings.tagPrefix);

    new Setting(containerEl).setName("Tags").setHeading();

    containerEl.createEl("p", {
      cls: "setting-item-description",
      text: "Tags go on their own line under each workout heading. The metric table itself cannot be searched or queried — these are what make a workout findable later, and unlike note properties they work when a single note holds several workouts.",
    });

    new Setting(containerEl)
      .setName("Tag prefix")
      .setDesc(
        prefix
          ? `Namespace for every tag written, for example #${prefix}/sport/running. Use slashes to nest under a tag you already keep.`
          : "Namespace for every tag written. Empty writes no tags at all."
      )
      .addText((text) =>
        text
          .setPlaceholder(DEFAULT_TAG_PREFIX)
          .setValue(settings.tagPrefix)
          .onChange(async (value) => {
            settings.tagPrefix = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Sport tag")
      .setDesc(
        `Tag each workout with its sport, for example #${prefix || DEFAULT_TAG_PREFIX}/sport/running.`
      )
      .addToggle((toggle) =>
        toggle.setValue(settings.includeSportTag).onChange(async (value) => {
          settings.includeSportTag = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("Strain tag")
      .setDesc(
        `Tag harder workouts by WHOOP's own strain bands: /strain/moderate from ${MODERATE_STRAIN}, /strain/high from ${HIGH_STRAIN}. Anything lighter is left untagged.`
      )
      .addToggle((toggle) =>
        toggle.setValue(settings.includeStrainTag).onChange(async (value) => {
          settings.includeStrainTag = value;
          await this.plugin.saveSettings();
        })
      );
  }

  private renderInsertion(containerEl: HTMLElement): void {
    const settings = this.plugin.settings;

    new Setting(containerEl).setName("Heading insertion").setHeading();

    new Setting(containerEl)
      .setName("Default heading")
      .setDesc(
        'Pre-filled when inserting under a heading. Include hashes to require a specific level, for example "## WHOOP".'
      )
      .addText((text) =>
        text
          .setPlaceholder("## WHOOP")
          .setValue(settings.defaultHeading)
          .onChange(async (value) => {
            settings.defaultHeading = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Position within the section")
      .setDesc(
        "Where the workout goes inside the heading's section: directly under the heading, or after the content already there."
      )
      .addDropdown((dropdown) =>
        dropdown
          .addOption("bottom", "End of the section")
          .addOption("top", "Directly under the heading")
          .setValue(settings.insertPosition)
          .onChange(async (value) => {
            settings.insertPosition = value as InsertPosition;
            await this.plugin.saveSettings();
          })
      );
  }

  private renderNewNotes(containerEl: HTMLElement): void {
    const settings = this.plugin.settings;

    new Setting(containerEl).setName("New notes").setHeading();

    new Setting(containerEl)
      .setName("Folder")
      .setDesc("Default folder for notes created from a workout. Leave empty for the vault root.")
      .addText((text) =>
        text
          .setPlaceholder("WHOOP Workouts")
          .setValue(settings.newNoteFolder)
          .onChange(async (value) => {
            settings.newNoteFolder = value.trim().replace(/^\/+|\/+$/g, "");
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Filename template")
      .setDesc("Tokens: {{date}}, {{time}}, {{sport}}, {{id}}. The .md extension is added automatically.")
      .addText((text) =>
        text
          .setPlaceholder("{{date}} {{sport}}")
          .setValue(settings.newNoteFilenameTemplate)
          .onChange(async (value) => {
            settings.newNoteFilenameTemplate =
              value.trim() || DEFAULT_SETTINGS.newNoteFilenameTemplate;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Open after creating")
      .setDesc("Open the new note once it has been written.")
      .addToggle((toggle) =>
        toggle.setValue(settings.openNewNote).onChange(async (value) => {
          settings.openNewNote = value;
          await this.plugin.saveSettings();
        })
      );
  }
}
