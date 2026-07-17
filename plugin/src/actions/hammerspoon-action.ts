import streamDeck, {
  SingletonAction,
  type KeyAction,
  type SendToPluginEvent,
} from "@elgato/streamdeck";
import type { BridgeAppearance, BridgeClient } from "../bridge.js";
import type { JsonSettings } from "../protocol.js";
type JsonObject = { [key: string]: JsonValue };
type JsonPrimitive = boolean | number | string | null | undefined;
type JsonValue = JsonObject | JsonPrimitive | JsonValue[];

function cloneJsonValue(value: JsonValue): JsonValue {
  if (Array.isArray(value)) {
    return value.map(cloneJsonValue);
  }
  if (value !== null && typeof value === "object") {
    const copy: JsonObject = {};
    for (const [key, nested] of Object.entries(value)) {
      copy[key] = cloneJsonValue(nested);
    }
    return copy;
  }
  return value;
}

export const HAMMERSPOON_ACTION_UUID = "com.brettinternet.hammerspoon.action";

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&apos;",
  })[character] ?? character);
}


function appearanceImage(appearance: BridgeAppearance): string | undefined {
  const hasDecoration = appearance.foregroundColor !== undefined
    || appearance.backgroundColor !== undefined
    || appearance.progress !== undefined
    || appearance.badge !== undefined;
  if (appearance.appearanceVersion !== 1 || !hasDecoration) {
    return undefined;
  }
  if (
    (appearance.foregroundColor !== undefined &&
      (typeof appearance.foregroundColor !== "string" || !/^#[0-9A-Fa-f]{6}$/.test(appearance.foregroundColor))) ||
    (appearance.backgroundColor !== undefined &&
      (typeof appearance.backgroundColor !== "string" || !/^#[0-9A-Fa-f]{6}$/.test(appearance.backgroundColor))) ||
    (appearance.progress !== undefined &&
      (typeof appearance.progress !== "number" ||
        !Number.isFinite(appearance.progress) ||
        appearance.progress < 0 ||
        appearance.progress > 1))
  ) {
    return undefined;
  }
  const foreground = appearance.foregroundColor ?? "#FFFFFF";
  const background = appearance.backgroundColor ?? "#000000";
  const progress = appearance.progress;
  const badge = appearance.badge;
  if (badge !== undefined && typeof badge !== "string") {
    return undefined;
  }
  if (typeof badge === "string" && [...badge].length > 4) {
    return undefined;
  }
  const progressBar = progress === undefined
    ? ""
    : `<rect x="4" y="64" width="${Math.round(progress * 64)}" height="4" fill="${foreground}"/>`;
  const foregroundBorder = appearance.foregroundColor === undefined
    ? ""
    : `<rect x="2" y="2" width="68" height="68" fill="none" stroke="${foreground}" stroke-width="4"/>`;
  const badgeText = badge === undefined
    ? ""
    : `<text x="68" y="14" text-anchor="end" fill="${foreground}">${escapeXml(badge)}</text>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72" viewBox="0 0 72 72"><rect width="72" height="72" fill="${background}"/>${foregroundBorder}${progressBar}${badgeText}</svg>`;
  try {
    return `data:image/svg+xml,${encodeURIComponent(svg)}`;
  } catch {
    return undefined;
  }
}

export type HammerspoonActionSettings = JsonObject & {
  actionId?: string;
};

type TrackedInstance = {
  action: KeyAction<HammerspoonActionSettings>;
  actionId?: string;
  settings: HammerspoonActionSettings;
  imageApplied: boolean;
};

type RequestStateMessage = {
  type: "requestState";
};

function isRequestStateMessage(value: JsonValue): value is RequestStateMessage {
  return typeof value === "object" && value !== null && !Array.isArray(value) && value.type === "requestState";
}

/** Bridges the official generic keypad action to one shared Hammerspoon connection. */
export class HammerspoonAction extends SingletonAction<HammerspoonActionSettings> {
  private readonly instances = new Map<string, TrackedInstance>();
  private readonly synchronized = new Set<string>();
  private readonly appearanceQueues = new Map<string, Promise<void>>();
  private subscribed = false;

  public constructor(private readonly bridge: BridgeClient) {
    super();
  }

  /** Subscribes this action adapter to bridge lifecycle and rendering events. */
  public subscribe(): void {
    if (this.subscribed) {
      return;
    }
    this.subscribed = true;
    this.bridge.on("status", (status) => {
      if (status !== "connected") {
        this.synchronized.clear();
      }
      this.renderStatus();
      void this.sendBridgeState();
    });
    this.bridge.on("actions", () => {
      void this.sendBridgeState();
    });
    this.bridge.on("appearance", (appearance) => {
      this.enqueueAppearance(appearance);
    });
    this.bridge.on("protocolError", (error) => {
      if (error.instanceId) {
        const instance = this.instances.get(error.instanceId);
        if (instance) {
          void this.alert(instance.action);
        }
      }
    });
  }

  public override async onWillAppear(ev: Parameters<NonNullable<SingletonAction<HammerspoonActionSettings>["onWillAppear"]>>[0]): Promise<void> {
    if (!ev.action.isKey()) {
      return;
    }

    const instanceId = ev.action.id;
    const settings = this.settingsFrom(ev.payload.settings);
    this.instances.set(instanceId, { action: ev.action, actionId: settings.actionId, settings, imageApplied: this.instances.get(instanceId)?.imageApplied ?? false });
    this.synchronized.delete(instanceId);
    await this.renderInstance(instanceId);
    if (settings.actionId) {
      this.bridge.upsertInstance({
        instanceId,
        actionId: settings.actionId,
        settings: settings as JsonSettings,
      });
    }
  }

  public override async onWillDisappear(ev: Parameters<NonNullable<SingletonAction<HammerspoonActionSettings>["onWillDisappear"]>>[0]): Promise<void> {
    const instanceId = ev.action.id;
    const instance = this.instances.get(instanceId);
    this.instances.delete(instanceId);
    this.synchronized.delete(instanceId);
    if (instance?.actionId) {
      this.bridge.removeInstance(instanceId, instance.actionId);
    }
  }

  public override async onDidReceiveSettings(ev: Parameters<NonNullable<SingletonAction<HammerspoonActionSettings>["onDidReceiveSettings"]>>[0]): Promise<void> {
    if (!ev.action.isKey()) {
      return;
    }

    const instanceId = ev.action.id;
    const settings = this.settingsFrom(ev.payload.settings);
    const previous = this.instances.get(instanceId);
    if (previous?.actionId && previous.actionId !== settings.actionId) {
      this.bridge.removeInstance(instanceId, previous.actionId);
    }
    this.instances.set(instanceId, { action: ev.action, actionId: settings.actionId, settings, imageApplied: previous?.imageApplied ?? false });
    this.synchronized.delete(instanceId);
    await this.renderInstance(instanceId);
    if (settings.actionId) {
      this.bridge.upsertInstance({
        instanceId,
        actionId: settings.actionId,
        settings: settings as JsonSettings,
      });
    }
  }

  public override async onKeyDown(ev: Parameters<NonNullable<SingletonAction<HammerspoonActionSettings>["onKeyDown"]>>[0]): Promise<void> {
    const instance = this.instances.get(ev.action.id);
    if (!instance?.actionId) {
      await this.renderInstance(ev.action.id);
      return;
    }

    this.bridge.keyDown(ev.action.id, instance.actionId, instance.settings as JsonSettings);
  }

  public override async onSendToPlugin(ev: SendToPluginEvent<JsonValue, HammerspoonActionSettings>): Promise<void> {
    if (isRequestStateMessage(ev.payload)) {
      await this.sendBridgeState();
    }
  }

  private settingsFrom(value: HammerspoonActionSettings): HammerspoonActionSettings {
    const settings = cloneJsonValue(value) as HammerspoonActionSettings;
    if (typeof settings.actionId !== "string" || settings.actionId.length === 0) {
      delete settings.actionId;
    }
    return settings;
  }

  private async renderInstance(instanceId: string): Promise<void> {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      return;
    }

    if (!instance.actionId) {
      await this.clearImage(instance);
      await this.setTitle(instance.action, "Select action");
      await this.setState(instance.action, 0);
      return;
    }

    if (this.bridge.status !== "connected" || !this.synchronized.has(instanceId)) {
      await this.clearImage(instance);
      await this.setTitle(instance.action, "Hammerspoon\nOffline");
      await this.setState(instance.action, 0);
      return;
    }

    await this.setTitle(instance.action, "Hammerspoon");
    await this.setState(instance.action, 0);
  }

  private renderStatus(): void {
    for (const instanceId of this.instances.keys()) {
      void this.renderInstance(instanceId);
    }
  }

  private enqueueAppearance(appearance: BridgeAppearance): void {
    const previous = this.appearanceQueues.get(appearance.instanceId) ?? Promise.resolve();
    const next = previous.then(
      () => this.renderAppearance(appearance),
      () => this.renderAppearance(appearance),
    );
    this.appearanceQueues.set(appearance.instanceId, next);
    void next.then(
      () => {
        if (this.appearanceQueues.get(appearance.instanceId) === next) {
          this.appearanceQueues.delete(appearance.instanceId);
        }
      },
      () => {
        if (this.appearanceQueues.get(appearance.instanceId) === next) {
          this.appearanceQueues.delete(appearance.instanceId);
        }
      },
    );
  }

  private async renderAppearance(appearance: BridgeAppearance): Promise<void> {
    const instance = this.instances.get(appearance.instanceId);
    if (!instance || instance.actionId !== appearance.actionId) {
      return;
    }
    const image = appearanceImage(appearance);
    if (image !== undefined) {
      await this.clearImage(instance);
      if (await this.setImage(instance.action, image)) {
        instance.imageApplied = true;
      }
    } else if (instance.imageApplied) {
      await this.clearImage(instance);
    }
    await this.setTitle(instance.action, appearance.title);
    await this.setState(instance.action, appearance.state);
  }

  private async clearImage(instance: TrackedInstance): Promise<void> {
    if (!instance.imageApplied) {
      return;
    }
    if (await this.setImage(instance.action, undefined)) {
      instance.imageApplied = false;
    }
  }
  private async setImage(action: KeyAction<HammerspoonActionSettings>, image: string | undefined): Promise<boolean> {
    try {
      await action.setImage(image);
      return true;
    } catch {
      await this.alert(action);
      return false;
    }
  }

  private async setTitle(action: KeyAction<HammerspoonActionSettings>, title: string): Promise<void> {
    try {
      await action.setTitle(title);
    } catch {
      await this.alert(action);
    }
  }

  private async setState(action: KeyAction<HammerspoonActionSettings>, state: 0 | 1): Promise<void> {
    try {
      await action.setState(state);
    } catch {
      await this.alert(action);
    }
  }


  private async alert(action: KeyAction<HammerspoonActionSettings>): Promise<void> {
    try {
      await action.showAlert();
    } catch {
      // Stream Deck feedback is best-effort when an instance is disappearing.
    }
  }

  private async sendBridgeState(): Promise<void> {
    const actions = this.bridge.actions.map((action) => {
      const copy: JsonObject = {
        actionId: action.actionId,
        name: action.name,
      };
      if (action.settingsSchema) {
        copy.settingsSchema = action.settingsSchema.map(cloneJsonValue);
      }
      if (action.settingsSchemaVersion !== undefined) {
        copy.settingsSchemaVersion = action.settingsSchemaVersion;
      }
      return copy;
    });
    await streamDeck.ui.sendToPropertyInspector({
      type: "bridgeState",
      status: this.bridge.status,
      actions,
    });
  }
}
