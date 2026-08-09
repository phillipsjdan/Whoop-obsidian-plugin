import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import type WhoopWorkoutPlugin from "./main.ts";
import { REDIRECT_URI, TokenData } from "./auth.ts";
import { DistanceUnit } from "./format.ts";
import { InsertPosition } from "./insert.ts";
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
      text: `Create an app at developer.whoop.com with the redirect URI ${REDIRECT_URI} and the scopes "offline" and "read:workout", then paste its credentials below.`,
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
      .setDesc("Add a row per heart rate zone with time spent in it.")
      .addToggle((toggle) =>
        toggle.setValue(settings.includeZoneDurations).onChange(async (value) => {
          settings.includeZoneDurations = value;
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
