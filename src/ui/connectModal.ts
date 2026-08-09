import { App, Modal, Notice, Setting } from "obsidian";

export interface ConnectModalOptions {
  authUrl: string;
  /** Handed the full callback URL the user pasted. Throws on failure. */
  onManualCallback: (rawUrl: string) => Promise<void>;
  onCancel: () => void;
}

/**
 * Walks the user through the browser half of the OAuth flow.
 *
 * The happy path is the obsidian:// redirect firing the protocol handler, which
 * closes this modal from the outside. The paste field is the fallback for setups
 * where the browser will not hand off to Obsidian.
 */
export class ConnectModal extends Modal {
  private pasted = "";
  private completed = false;

  constructor(app: App, private readonly options: ConnectModalOptions) {
    super(app);
  }

  /** Called by the plugin when the protocol handler finished the exchange. */
  completeExternally(): void {
    this.completed = true;
    this.close();
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.addClass("whoop-workout-modal");
    this.setTitle("Connect to WHOOP");

    const steps = contentEl.createDiv({ cls: "whoop-workout-instructions" });
    const list = steps.createEl("ol");
    list.createEl("li", {
      text: "Open the WHOOP authorization page in your browser.",
    });
    list.createEl("li", { text: "Approve access for your app." });
    list.createEl("li", {
      text: "Your browser hands off to Obsidian and this window closes on its own.",
    });
    list.createEl("li", {
      text: "If the hand-off does not happen, copy the whole obsidian:// URL your browser was sent to and paste it below.",
    });

    new Setting(contentEl).addButton((btn) =>
      btn
        .setButtonText("Open authorization page")
        .setCta()
        .onClick(() => {
          window.open(this.options.authUrl, "_blank");
        })
    );

    // On iOS the button may not hand off to Safari. Showing the URL in a
    // read-only field means it can always be selected and pasted by hand.
    new Setting(contentEl)
      .setName("Authorization URL")
      .setDesc("If the button does nothing, copy this into your browser.")
      .addText((text) => {
        text.setValue(this.options.authUrl);
        text.inputEl.readOnly = true;
        text.inputEl.addClass("whoop-workout-wide-input");
        text.inputEl.addEventListener("focus", () => text.inputEl.select());
      });

    new Setting(contentEl)
      .setName("Callback URL")
      .setDesc(
        "Paste the full obsidian://whoop-workout-callback?... URL. The whole URL is needed so the state parameter can be checked."
      )
      .addText((text) => {
        text
          .setPlaceholder("obsidian://whoop-workout-callback?code=…&state=…")
          .onChange((value) => {
            this.pasted = value.trim();
          });
        text.inputEl.addClass("whoop-workout-wide-input");
      });

    new Setting(contentEl).addButton((btn) =>
      btn.setButtonText("Finish connecting").onClick(async () => {
        if (!this.pasted) {
          new Notice("Paste the callback URL first.");
          return;
        }
        try {
          await this.options.onManualCallback(this.pasted);
          this.completed = true;
          this.close();
        } catch (e) {
          new Notice(`Could not connect: ${e instanceof Error ? e.message : String(e)}`);
        }
      })
    );
  }

  onClose(): void {
    this.contentEl.empty();
    if (!this.completed) this.options.onCancel();
  }
}
