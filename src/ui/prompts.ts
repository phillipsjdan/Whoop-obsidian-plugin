import { App, Modal, Platform, Setting } from "obsidian";

export interface TextPromptOptions {
  title: string;
  description?: string;
  placeholder?: string;
  initialValue?: string;
  ctaText?: string;
  /** Return an error message to keep the modal open, or null to accept. */
  validate?: (value: string) => string | null;
}

/** Prompts for a single line of text. Resolves to null when cancelled. */
export function promptText(
  app: App,
  options: TextPromptOptions
): Promise<string | null> {
  return new Promise((resolve) => {
    new TextPromptModal(app, options, resolve).open();
  });
}

class TextPromptModal extends Modal {
  private value: string;
  private settled = false;
  private errorEl: HTMLElement | null = null;

  constructor(
    app: App,
    private readonly options: TextPromptOptions,
    private readonly resolve: (value: string | null) => void
  ) {
    super(app);
    this.value = options.initialValue ?? "";
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.addClass("whoop-workout-modal");
    this.setTitle(this.options.title);

    if (this.options.description) {
      contentEl.createEl("p", {
        cls: "setting-item-description",
        text: this.options.description,
      });
    }

    const setting = new Setting(contentEl).addText((text) => {
      text
        .setPlaceholder(this.options.placeholder ?? "")
        .setValue(this.value)
        .onChange((value) => {
          this.value = value;
          this.clearError();
        });
      text.inputEl.addClass("whoop-workout-wide-input");
      if (!Platform.isMobile) {
        // Autofocus on mobile throws up the soft keyboard and pushes the
        // buttons off screen before the value has even been read.
        window.setTimeout(() => {
          text.inputEl.focus();
          text.inputEl.select();
        }, 0);
      }
      // Listeners live on elements inside contentEl, which onClose empties.
      text.inputEl.addEventListener("keydown", (event: KeyboardEvent) => {
        if (event.key === "Enter") {
          event.preventDefault();
          this.submit();
        }
      });
    });
    setting.settingEl.addClass("whoop-workout-prompt-row");

    new Setting(contentEl)
      .addButton((btn) =>
        btn
          .setButtonText(this.options.ctaText ?? "Confirm")
          .setCta()
          .onClick(() => this.submit())
      )
      .addButton((btn) => btn.setButtonText("Cancel").onClick(() => this.close()));
  }

  private submit(): void {
    const value = this.value.trim();
    const error = this.options.validate?.(value) ?? null;
    if (error) {
      this.showError(error);
      return;
    }
    this.settled = true;
    this.resolve(value);
    this.close();
  }

  private showError(message: string): void {
    if (!this.errorEl) {
      this.errorEl = this.contentEl.createEl("p", { cls: "whoop-workout-error" });
    }
    this.errorEl.setText(message);
  }

  private clearError(): void {
    this.errorEl?.remove();
    this.errorEl = null;
  }

  onClose(): void {
    this.contentEl.empty();
    if (!this.settled) {
      this.settled = true;
      this.resolve(null);
    }
  }
}

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  warning?: boolean;
}

/** Asks a yes/no question. Resolves false when dismissed. */
export function confirm(app: App, options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    new ConfirmModal(app, options, resolve).open();
  });
}

class ConfirmModal extends Modal {
  private settled = false;

  constructor(
    app: App,
    private readonly options: ConfirmOptions,
    private readonly resolve: (value: boolean) => void
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.addClass("whoop-workout-modal");
    this.setTitle(this.options.title);
    contentEl.createEl("p", { text: this.options.message });

    new Setting(contentEl)
      .addButton((btn) => {
        btn.setButtonText(this.options.confirmText ?? "Confirm").onClick(() => {
          this.settled = true;
          this.resolve(true);
          this.close();
        });
        if (this.options.warning) btn.setWarning();
        else btn.setCta();
      })
      .addButton((btn) =>
        btn.setButtonText(this.options.cancelText ?? "Cancel").onClick(() => this.close())
      );
  }

  onClose(): void {
    this.contentEl.empty();
    if (!this.settled) {
      this.settled = true;
      this.resolve(false);
    }
  }
}
