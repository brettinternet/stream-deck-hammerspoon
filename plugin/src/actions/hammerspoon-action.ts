import streamDeck, {
  SingletonAction,
  type KeyAction,
  type SendToPluginEvent,
} from "@elgato/streamdeck";
import type { BridgeClient } from "../bridge.js";
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

export type HammerspoonActionSettings = JsonObject & {
  actionId?: string;
};

type TrackedInstance = {
  action: KeyAction<HammerspoonActionSettings>;
  actionId?: string;
  settings: HammerspoonActionSettings;
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
      this.renderAppearance(appearance);
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

    const settings = this.settingsFrom(ev.payload.settings);
    const instanceId = ev.action.id;
    this.instances.set(instanceId, { action: ev.action, actionId: settings.actionId, settings });
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

    this.instances.set(instanceId, { action: ev.action, actionId: settings.actionId, settings });
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
      await this.setTitle(instance.action, "Select action");
      await this.setState(instance.action, 0);
      return;
    }

    if (this.bridge.status !== "connected" || !this.synchronized.has(instanceId)) {
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

  private renderAppearance(appearance: {
    instanceId: string;
    actionId: string;
    title: string;
    state: 0 | 1;
  }): void {
    const instance = this.instances.get(appearance.instanceId);
    if (!instance || instance.actionId !== appearance.actionId) {
      return;
    }
    this.synchronized.add(appearance.instanceId);
    void this.setTitle(instance.action, appearance.title);
    void this.setState(instance.action, appearance.state);
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
