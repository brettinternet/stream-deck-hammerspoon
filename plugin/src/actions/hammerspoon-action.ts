import streamDeck, {
  SingletonAction,
  type DialAction,
  type KeyAction,
  type SendToPluginEvent,
} from "@elgato/streamdeck";
import type { BridgeAppearance, BridgeClient, BridgeFeedback } from "../bridge.js";
import { isSafeAppearanceIcon, safeAppearanceIconImage, sanitizeDeviceMetadata, type DeviceMetadata, type JsonSettings } from "../protocol.js";
type JsonObject = { [key: string]: JsonValue };
type JsonPrimitive = boolean | number | string | null | undefined;
type JsonValue = JsonObject | JsonPrimitive | JsonValue[];

type DeviceContext = {
  controllerType?: unknown;
  device?: {
    type?: unknown;
    size?: { columns?: unknown; rows?: unknown };
  };
};

const DEVICE_TYPE_NAMES: Record<number, DeviceMetadata["device"]["type"]> = {
  0: "stream-deck",
  1: "stream-deck-mini",
  2: "stream-deck-xl",
  3: "stream-deck-mobile",
  4: "corsair-g-keys",
  5: "stream-deck-pedal",
  6: "corsair-voyager",
  7: "stream-deck-plus",
  8: "scuf-controller",
  9: "stream-deck-neo",
  10: "stream-deck-studio",
  11: "virtual-stream-deck",
  12: "galleon-100-sd",
  13: "stream-deck-plus-xl",
};

export function extractDeviceMetadata(action: unknown): DeviceMetadata | undefined {
  try {
    const context = action as DeviceContext;
    const device = context.device;
    if (!device) return undefined;
    const deviceType = typeof device.type === "number" ? (DEVICE_TYPE_NAMES[device.type] ?? "unknown") : "unknown";
    const controllerType = context.controllerType === "Keypad"
      ? "keypad"
      : context.controllerType === "Encoder"
        ? "encoder"
        : undefined;
    return sanitizeDeviceMetadata({
      controllerType,
      device: {
        type: deviceType,
        size: { columns: device.size?.columns, rows: device.size?.rows },
      },
    });
  } catch {
    return undefined;
  }
}

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


const BUNDLED_ICON_PATH = "imgs/key.svg";

function appearanceImage(appearance: BridgeAppearance): string | undefined {
  const icon = appearance.icon;
  const hasDecoration = appearance.foregroundColor !== undefined
    || appearance.backgroundColor !== undefined
    || appearance.progress !== undefined
    || appearance.badge !== undefined;
  let customIconImage: string | undefined;
  if (icon !== undefined) {
    if (!isSafeAppearanceIcon(icon)) {
      return undefined;
    }
    if (icon.kind === "custom") {
      customIconImage = safeAppearanceIconImage(icon);
      if (customIconImage === undefined) {
        return undefined;
      }
      if (!hasDecoration) {
        return customIconImage;
      }
    } else if (!hasDecoration) {
      return BUNDLED_ICON_PATH;
    }
  }
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
  if (typeof badge === "string") {
    if ([...badge].length > 4) {
      return undefined;
    }
    for (const character of badge) {
      const codePoint = character.codePointAt(0);
      if (
        codePoint !== undefined &&
        (codePoint <= 0x08 || (codePoint >= 0x0b && codePoint <= 0x0c) || (codePoint >= 0x0e && codePoint <= 0x1f))
      ) {
        return undefined;
      }
    }
  }
  const iconMarkup = icon?.kind === "bundled"
    ? `<image href="${BUNDLED_ICON_PATH}" x="0" y="0" width="72" height="72"/>`
    : customIconImage === undefined ? "" : `<image href="${escapeXml(customIconImage)}" x="0" y="0" width="72" height="72"/>`;
  const progressBar = progress === undefined
    ? ""
    : `<rect x="4" y="64" width="${Math.round(progress * 64)}" height="4" fill="${foreground}"/>`;
  const foregroundBorder = appearance.foregroundColor === undefined
    ? ""
    : `<rect x="2" y="2" width="68" height="68" fill="none" stroke="${foreground}" stroke-width="4"/>`;
  const badgeText = badge === undefined
    ? ""
    : `<text x="68" y="14" text-anchor="end" fill="${foreground}">${escapeXml(badge)}</text>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72" viewBox="0 0 72 72"><rect width="72" height="72" fill="${background}"/>${iconMarkup}${foregroundBorder}${progressBar}${badgeText}</svg>`;
  try {
    return `data:image/svg+xml,${encodeURIComponent(svg)}`;
  } catch {
    return undefined;
  }
}

export type HammerspoonActionSettings = JsonObject & {
  actionId?: string;
};

type TrackedAction =
  | KeyAction<HammerspoonActionSettings>
  | DialAction<HammerspoonActionSettings>;

function isDialAction(value: unknown): value is DialAction<HammerspoonActionSettings> {
  if (value === null || typeof value !== "object") {
    return false;
  }
  const candidate = value as { isDial?: unknown };
  return typeof candidate.isDial === "function" && (candidate.isDial as () => boolean)();
}

type TrackedInstance = {
  action: TrackedAction;
  actionId?: string;
  lastAppearance?: BridgeAppearance;
  feedbackTimer?: unknown;
  settings: HammerspoonActionSettings;
  imageApplied: boolean;
};

type RequestStateMessage = {
  type: "requestState";
};

function isRequestStateMessage(value: JsonValue): value is RequestStateMessage {
  return typeof value === "object" && value !== null && !Array.isArray(value) && value.type === "requestState";
}

type HammerspoonActionOptions = {
  setTimeout?: (callback: () => void, delay: number) => unknown;
  clearTimeout?: (handle: unknown) => void;
};

/** Bridges the official generic keypad action to one shared Hammerspoon connection. */
export class HammerspoonAction extends SingletonAction<HammerspoonActionSettings> {
  private readonly instances = new Map<string, TrackedInstance>();
  private readonly synchronized = new Set<string>();
  private readonly renderQueues = new Map<string, Promise<void>>();
  private readonly scheduleTimeout: (callback: () => void, delay: number) => unknown;
  private readonly cancelTimeout: (handle: unknown) => void;
  private subscribed = false;

  public constructor(
    private readonly bridge: BridgeClient,
    options: HammerspoonActionOptions = {},
  ) {
    super();
    this.scheduleTimeout = options.setTimeout ?? ((callback, delay) => setTimeout(callback, delay));
    this.cancelTimeout = options.clearTimeout ?? ((handle) => clearTimeout(handle as NodeJS.Timeout));
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
        for (const instance of this.instances.values()) {
          this.cancelFeedbackTimer(instance);
        }
      }
      this.renderStatus();
      void this.sendBridgeState();
    });
    this.bridge.on("actions", () => {
      void this.sendBridgeState();
    });
    this.bridge.on("appearance", (appearance) => {
      void this.enqueueRender(appearance.instanceId, () => this.renderAppearance(appearance));
    });
    this.bridge.on("feedback", (feedback) => {
      void this.enqueueRender(feedback.instanceId, () => this.renderFeedback(feedback));
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
    if (!ev.action.isKey() && !isDialAction(ev.action)) {
      return;
    }

    const instanceId = ev.action.id;
    const settings = this.settingsFrom(ev.payload.settings);
    const metadata = extractDeviceMetadata(ev.action);
    const previous = this.instances.get(instanceId);
    if (previous) {
      this.cancelFeedbackTimer(previous);
    }
    this.instances.set(instanceId, {
      action: ev.action,
      actionId: settings.actionId,
      settings,
      imageApplied: previous?.imageApplied ?? false,
    });
    this.synchronized.delete(instanceId);
    await this.enqueueRender(instanceId, () => this.renderInstance(instanceId));
    if (settings.actionId) {
      this.bridge.upsertInstance({
        instanceId,
        actionId: settings.actionId,
        settings: settings as JsonSettings,
        metadata,
      });
    }
    if (isDialAction(ev.action)) {
      await this.setDialLayout(ev.action);
    }
  }

  public override async onWillDisappear(ev: Parameters<NonNullable<SingletonAction<HammerspoonActionSettings>["onWillDisappear"]>>[0]): Promise<void> {
    const instanceId = ev.action.id;
    const instance = this.instances.get(instanceId);
    this.cancelFeedbackTimer(instance);
    this.instances.delete(instanceId);
    this.synchronized.delete(instanceId);
    if (instance?.actionId) {
      this.bridge.removeInstance(instanceId, instance.actionId);
    }
  }

  public override async onDidReceiveSettings(ev: Parameters<NonNullable<SingletonAction<HammerspoonActionSettings>["onDidReceiveSettings"]>>[0]): Promise<void> {
    if (!ev.action.isKey() && !isDialAction(ev.action)) {
      return;
    }

    const instanceId = ev.action.id;
    const settings = this.settingsFrom(ev.payload.settings);
    const metadata = extractDeviceMetadata(ev.action);
    const previous = this.instances.get(instanceId);
    if (previous?.actionId && previous.actionId !== settings.actionId) {
      this.bridge.removeInstance(instanceId, previous.actionId);
    }
    this.instances.set(instanceId, { action: ev.action, actionId: settings.actionId, settings, imageApplied: previous?.imageApplied ?? false });
    this.synchronized.delete(instanceId);
    this.cancelFeedbackTimer(previous);
    await this.enqueueRender(instanceId, () => this.renderInstance(instanceId));
    if (settings.actionId) {
      this.bridge.upsertInstance({
        instanceId,
        actionId: settings.actionId,
        settings: settings as JsonSettings,
        metadata,
      });
    }
  }

  public override async onKeyDown(ev: Parameters<NonNullable<SingletonAction<HammerspoonActionSettings>["onKeyDown"]>>[0]): Promise<void> {
    if (!ev.action.isKey()) {
      return;
    }
    const instance = this.instances.get(ev.action.id);
    if (!instance?.actionId) {
      await this.enqueueRender(ev.action.id, () => this.renderInstance(ev.action.id));
      return;
    }

    this.bridge.keyDown(ev.action.id, instance.actionId, instance.settings as JsonSettings);
  }

  public override async onKeyUp(ev: Parameters<NonNullable<SingletonAction<HammerspoonActionSettings>["onKeyUp"]>>[0]): Promise<void> {
    if (!ev.action.isKey()) {
      return;
    }
    const instance = this.instances.get(ev.action.id);
    if (!instance?.actionId) {
      await this.enqueueRender(ev.action.id, () => this.renderInstance(ev.action.id));
      return;
    }

    this.bridge.keyUp(ev.action.id, instance.actionId, instance.settings as JsonSettings);
  }

  public override async onDialDown(ev: Parameters<NonNullable<SingletonAction<HammerspoonActionSettings>["onDialDown"]>>[0]): Promise<void> {
    if (!isDialAction(ev.action)) {
      return;
    }
    const instance = this.instances.get(ev.action.id);
    if (!instance?.actionId) {
      await this.enqueueRender(ev.action.id, () => this.renderInstance(ev.action.id));
      return;
    }

    this.bridge.dialDown(ev.action.id, instance.actionId, instance.settings as JsonSettings);
  }

  public override async onDialRotate(ev: Parameters<NonNullable<SingletonAction<HammerspoonActionSettings>["onDialRotate"]>>[0]): Promise<void> {
    if (!isDialAction(ev.action)) {
      return;
    }
    const instance = this.instances.get(ev.action.id);
    if (!instance?.actionId) {
      await this.enqueueRender(ev.action.id, () => this.renderInstance(ev.action.id));
      return;
    }

    this.bridge.dialRotate(
      ev.action.id,
      instance.actionId,
      ev.payload.ticks,
      ev.payload.pressed,
      instance.settings as JsonSettings,
    );
  }

  public override async onDialUp(ev: Parameters<NonNullable<SingletonAction<HammerspoonActionSettings>["onDialUp"]>>[0]): Promise<void> {
    if (!isDialAction(ev.action)) {
      return;
    }
    const instance = this.instances.get(ev.action.id);
    if (!instance?.actionId) {
      await this.enqueueRender(ev.action.id, () => this.renderInstance(ev.action.id));
      return;
    }

    this.bridge.dialUp(ev.action.id, instance.actionId, instance.settings as JsonSettings);
  }

  public override async onTouchTap(
    ev: Parameters<NonNullable<SingletonAction<HammerspoonActionSettings>["onTouchTap"]>>[0],
  ): Promise<void> {
    if (!isDialAction(ev.action)) {
      return;
    }
    const instance = this.instances.get(ev.action.id);
    if (!instance?.actionId) {
      await this.enqueueRender(ev.action.id, () => this.renderInstance(ev.action.id));
      return;
    }

    this.bridge.touchTap(
      ev.action.id,
      instance.actionId,
      ev.payload.hold,
      ev.payload.tapPos,
      instance.settings as JsonSettings,
    );
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
      if (instance.action.isKey() && !(await this.clearImage(instance))) {
        return;
      }
      await this.setActionTitle(instance.action, "Select action");
      if (instance.action.isKey()) {
        await this.setState(instance.action, 0);
      }
      return;
    }

    if (this.bridge.status !== "connected" || !this.synchronized.has(instanceId)) {
      if (instance.action.isKey() && !(await this.clearImage(instance))) {
        return;
      }
      await this.setActionTitle(instance.action, "Hammerspoon\nOffline");
      if (instance.action.isKey()) {
        await this.setState(instance.action, 0);
      }
      return;
    }

    await this.setActionTitle(instance.action, "Hammerspoon");
    if (instance.action.isKey()) {
      await this.setState(instance.action, 0);
    }
  }

  private renderStatus(): void {
    for (const instanceId of this.instances.keys()) {
      void this.enqueueRender(instanceId, () => this.renderInstance(instanceId));
    }
  }

  private enqueueRender(instanceId: string, render: () => Promise<void>): Promise<void> {
    const previous = this.renderQueues.get(instanceId) ?? Promise.resolve();
    const next = previous.then(render, render);
    this.renderQueues.set(instanceId, next);
    void next.then(
      () => {
        if (this.renderQueues.get(instanceId) === next) {
          this.renderQueues.delete(instanceId);
        }
      },
      () => {
        if (this.renderQueues.get(instanceId) === next) {
          this.renderQueues.delete(instanceId);
        }
      },
    );
    return next;
  }

  private async renderAppearance(appearance: BridgeAppearance): Promise<void> {
    const instance = this.instances.get(appearance.instanceId);
    if (!instance || instance.actionId !== appearance.actionId) {
      return;
    }
    if (this.bridge.status !== "connected") {
      await this.renderInstance(appearance.instanceId);
      return;
    }
    if (isDialAction(instance.action)) {
      instance.lastAppearance = appearance;
      this.synchronized.add(appearance.instanceId);
      await this.setDialTitle(instance.action, appearance.title);
      return;
    }
    const image = appearanceImage(appearance);
    if (appearance.icon !== undefined && image === undefined) {
      await this.alert(instance.action);
      return;
    }
    if (!(await this.applyImage(instance, image))) {
      return;
    }
    instance.lastAppearance = appearance;
    this.synchronized.add(appearance.instanceId);
    await this.setActionTitle(instance.action, appearance.title);
    await this.setState(instance.action, appearance.state);
  }

  private async renderFeedback(feedback: BridgeFeedback): Promise<void> {
    const instance = this.instances.get(feedback.instanceId);
    if (!instance || instance.actionId !== feedback.actionId || this.bridge.status !== "connected") {
      return;
    }
    this.cancelFeedbackTimer(instance);
    await this.setActionTitle(instance.action, feedback.message);
    try {
      if (feedback.kind === "success") {
        if (instance.action.isKey()) {
          await instance.action.showOk();
        }
      } else {
        await instance.action.showAlert();
      }
    } catch {
      // Stream Deck feedback is best-effort when an instance is disappearing.
    }
    try {
      instance.feedbackTimer = this.scheduleTimeout(() => {
        if (this.instances.get(feedback.instanceId) !== instance) {
          return;
        }
        instance.feedbackTimer = undefined;
        void this.enqueueRender(feedback.instanceId, () => this.restoreInstance(feedback.instanceId, instance));
      }, feedback.durationMs);
    } catch {
      // A failed timer must not affect the bridge or callback loop.
    }
  }

  private async restoreInstance(instanceId: string, expected: TrackedInstance): Promise<void> {
    if (this.instances.get(instanceId) !== expected) {
      return;
    }
    if (this.bridge.status === "connected" && this.synchronized.has(instanceId) && expected.lastAppearance) {
      await this.renderAppearance(expected.lastAppearance);
    } else {
      await this.renderInstance(instanceId);
    }
  }

  private cancelFeedbackTimer(instance: TrackedInstance | undefined): void {
    if (!instance || instance.feedbackTimer === undefined) {
      return;
    }
    try {
      this.cancelTimeout(instance.feedbackTimer);
    } catch {
      // A stale timer is harmless when an instance is disappearing.
    }
    instance.feedbackTimer = undefined;
  }

  private async clearImage(instance: TrackedInstance): Promise<boolean> {
    if (!instance.action.isKey() || !instance.imageApplied) {
      return true;
    }
    if (await this.setImage(instance.action, undefined)) {
      instance.imageApplied = false;
      return true;
    }
    return false;
  }
  private async applyImage(instance: TrackedInstance, image: string | undefined): Promise<boolean> {
    if (!instance.action.isKey()) {
      return true;
    }
    if (image === undefined) {
      return this.clearImage(instance);
    }
    if (!(await this.clearImage(instance))) {
      return false;
    }
    if (await this.setImage(instance.action, image)) {
      instance.imageApplied = true;
      return true;
    }
    if (await this.setImage(instance.action, undefined)) {
      instance.imageApplied = false;
      return true;
    }
    return false;
  }
  private async setActionTitle(action: TrackedAction, title: string): Promise<void> {
    if (isDialAction(action)) {
      await this.setDialTitle(action, title);
      return;
    }
    await this.setTitle(action, title);
  }

  private async setDialLayout(action: DialAction<HammerspoonActionSettings>): Promise<void> {
    try {
      await action.setFeedbackLayout("$A1");
    } catch {
      await this.alert(action);
    }
  }

  private async setDialTitle(action: DialAction<HammerspoonActionSettings>, title: string): Promise<void> {
    try {
      await action.setFeedback({ title });
    } catch {
      await this.alert(action);
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


  private async alert(action: TrackedAction): Promise<void> {
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
