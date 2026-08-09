// Minimal stand-in for the obsidian module so unit tests run outside Electron.
// Only the exports the modules under test touch at import time are needed.

export const requestUrl = async () => ({ status: 200, json: {}, text: "" });

export class Component {}
export class Modal {}
export class Plugin extends Component {}
export class PluginSettingTab extends Component {}
export class Notice {}
export class Setting {}
export class TextComponent {}
export class TFile {}
export class TFolder {}
export class MarkdownView {}
export const Platform = {
  isMobile: false,
  isDesktop: true,
  isIosApp: false,
  isAndroidApp: false,
  isPhone: false,
  isTablet: false,
};
export const normalizePath = (p: string) => p.replace(/\/{2,}/g, "/");
