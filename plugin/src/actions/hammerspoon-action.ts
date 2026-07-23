import streamDeck, {
  SingletonAction,
  type DialAction,
  type FeedbackPayload,
  type KeyAction,
  type SendToPluginEvent,
} from "@elgato/streamdeck";
import type {
  BridgeAppearance,
  BridgeClient,
  BridgeDiagnosticArea,
  BridgeDiagnosticCode,
  BridgeFeedback,
} from "../bridge.js";
import {
  isSafeAppearanceIcon,
  isSafeAppearanceValue,
  safeAppearanceIconImage,
  sanitizeDeviceMetadata,
  type DeviceMetadata,
  type JsonSettings,
  type PresentationState,
} from "../protocol.js";
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
type RenderingProfile = {
  imageSize: number;
  encoderLayout?: "$A1";
  encoderDecoratedLayout?: "$A0";
  encoderValueLayout?: "$B1";
};

const DEFAULT_RENDERING_PROFILE: RenderingProfile = {
  imageSize: 72,
  encoderLayout: "$A1",
};
const RENDERING_PROFILES: Record<string, RenderingProfile> = {
  "keypad:stream-deck:5x3": { imageSize: 72 },
  "keypad:stream-deck-mini:3x2": { imageSize: 80 },
  "keypad:stream-deck-xl:8x4": { imageSize: 96 },
  "keypad:stream-deck-plus:4x2": { imageSize: 120 },
  "keypad:stream-deck-neo:4x2": { imageSize: 96 },
  "encoder:stream-deck-plus:4x2": {
    imageSize: 48,
    encoderLayout: "$A1",
    encoderDecoratedLayout: "$A0",
    encoderValueLayout: "$B1",
  },
  "encoder:stream-deck-studio:16x2": {
    imageSize: 48,
    encoderLayout: "$A1",
    encoderDecoratedLayout: "$A0",
    encoderValueLayout: "$B1",
  },
  "encoder:galleon-100-sd:3x4": {
    imageSize: 48,
    encoderLayout: "$A1",
    encoderDecoratedLayout: "$A0",
    encoderValueLayout: "$B1",
  },
  "encoder:stream-deck-plus-xl:9x4": {
    imageSize: 48,
    encoderLayout: "$A1",
    encoderDecoratedLayout: "$A0",
    encoderValueLayout: "$B1",
  },
};

function recognizedRenderingProfile(
  metadata: DeviceMetadata,
): RenderingProfile | undefined {
  const { controllerType, device } = metadata;
  return RENDERING_PROFILES[
    `${controllerType}:${device.type}:${device.size.columns}x${device.size.rows}`
  ];
}

function selectRenderingProfile(
  metadata: DeviceMetadata | undefined,
): RenderingProfile | undefined {
  if (metadata === undefined) {
    return DEFAULT_RENDERING_PROFILE;
  }
  const sanitized = sanitizeDeviceMetadata(metadata);
  if (sanitized === undefined) {
    return undefined;
  }
  return recognizedRenderingProfile(sanitized) ?? DEFAULT_RENDERING_PROFILE;
}

export function extractDeviceMetadata(
  action: unknown,
): DeviceMetadata | undefined {
  try {
    const context = action as DeviceContext;
    const device = context.device;
    if (!device) return undefined;
    const deviceType =
      typeof device.type === "number"
        ? (DEVICE_TYPE_NAMES[device.type] ?? "unknown")
        : "unknown";
    const controllerType =
      context.controllerType === "Keypad"
        ? "keypad"
        : context.controllerType === "Encoder"
          ? "encoder"
          : undefined;
    const metadata = sanitizeDeviceMetadata({
      controllerType,
      device: {
        type: deviceType,
        size: { columns: device.size?.columns, rows: device.size?.rows },
      },
    });
    if (metadata === undefined) return undefined;
    const renderingProfile = recognizedRenderingProfile(metadata);
    return renderingProfile === undefined
      ? metadata
      : { ...metadata, imageSize: renderingProfile.imageSize };
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
export const HAMMERSPOON_BUTTON_UUID = "com.brettinternet.hammerspoon.button";
export const HAMMERSPOON_MULTI_STATE_UUID =
  "com.brettinternet.hammerspoon.multistate";

function escapeXml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[character] ?? character,
  );
}

const BUNDLED_BUTTON_ICON_PATH = "imgs/button.svg";
const BUNDLED_TOGGLE_INACTIVE_ICON_PATH = "imgs/toggle-off.svg";
const BUNDLED_TOGGLE_ACTIVE_ICON_PATH = "imgs/toggle-on.svg";

function hasValidAppearanceExtension(appearance: BridgeAppearance): boolean {
  const hasValue = appearance.value !== undefined;
  const hasIndicator = appearance.indicator !== undefined;
  if (hasValue !== hasIndicator) {
    return false;
  }
  if (
    appearance.presentationState !== undefined &&
    (appearance.appearanceVersion !== 1 ||
      !Number.isInteger(appearance.presentationState) ||
      appearance.presentationState < 0 ||
      appearance.presentationState > 3)
  ) {
    return false;
  }
  if (!hasValue) {
    return true;
  }
  return (
    appearance.appearanceVersion === 1 &&
    isSafeAppearanceValue(appearance.value) &&
    typeof appearance.indicator === "number" &&
    Number.isFinite(appearance.indicator) &&
    appearance.indicator >= 0 &&
    appearance.indicator <= 100 &&
    appearance.foregroundColor === undefined &&
    appearance.backgroundColor === undefined &&
    appearance.progress === undefined &&
    appearance.badge === undefined &&
    (appearance.icon === undefined || isSafeAppearanceIcon(appearance.icon))
  );
}

function appearanceImage(
  appearance: BridgeAppearance,
  imageSize: number,
  bundledIcon = BUNDLED_BUTTON_ICON_PATH,
): string | undefined {
  const icon = appearance.icon;
  const hasDecoration =
    appearance.foregroundColor !== undefined ||
    appearance.backgroundColor !== undefined ||
    appearance.progress !== undefined ||
    appearance.badge !== undefined;
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
      return bundledIcon;
    }
  }
  if (appearance.appearanceVersion !== 1 || !hasDecoration) {
    return undefined;
  }
  if (
    (appearance.foregroundColor !== undefined &&
      (typeof appearance.foregroundColor !== "string" ||
        !/^#[0-9A-Fa-f]{6}$/.test(appearance.foregroundColor))) ||
    (appearance.backgroundColor !== undefined &&
      (typeof appearance.backgroundColor !== "string" ||
        !/^#[0-9A-Fa-f]{6}$/.test(appearance.backgroundColor))) ||
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
        (codePoint <= 0x08 ||
          (codePoint >= 0x0b && codePoint <= 0x0c) ||
          (codePoint >= 0x0e && codePoint <= 0x1f))
      ) {
        return undefined;
      }
    }
  }
  const iconMarkup =
    icon?.kind === "bundled"
      ? `<image href="${bundledIcon}" x="0" y="0" width="${imageSize}" height="${imageSize}"/>`
      : customIconImage === undefined
        ? ""
        : `<image href="${escapeXml(customIconImage)}" x="0" y="0" width="${imageSize}" height="${imageSize}"/>`;
  const scale = imageSize / 72;
  const progressInset = 4 * scale;
  const progressWidth = 64 * scale;
  const progressHeight = 4 * scale;
  const progressY = 64 * scale;
  const borderInset = 2 * scale;
  const borderSize = 68 * scale;
  const borderWidth = 4 * scale;
  const badgeX = 68 * scale;
  const badgeY = 14 * scale;
  const progressBar =
    progress === undefined
      ? ""
      : `<rect x="${progressInset}" y="${progressY}" width="${Math.round(progress * progressWidth)}" height="${progressHeight}" fill="${foreground}"/>`;
  const foregroundBorder =
    appearance.foregroundColor === undefined
      ? ""
      : `<rect x="${borderInset}" y="${borderInset}" width="${borderSize}" height="${borderSize}" fill="none" stroke="${foreground}" stroke-width="${borderWidth}"/>`;
  const badgeText =
    badge === undefined
      ? ""
      : `<text x="${badgeX}" y="${badgeY}" text-anchor="end" fill="${foreground}">${escapeXml(badge)}</text>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${imageSize}" height="${imageSize}" viewBox="0 0 ${imageSize} ${imageSize}"><rect width="${imageSize}" height="${imageSize}" fill="${background}"/>${iconMarkup}${foregroundBorder}${progressBar}${badgeText}</svg>`;
  try {
    return `data:image/svg+xml,${encodeURIComponent(svg)}`;
  } catch {
    return undefined;
  }
}

function dialAppearanceImage(
  appearance: BridgeAppearance,
  imageSize: number,
  bundledIcon = BUNDLED_BUTTON_ICON_PATH,
): string | undefined {
  if (appearanceImage(appearance, imageSize, bundledIcon) === undefined) {
    return undefined;
  }
  const icon = appearance.icon;
  const customIconImage =
    icon?.kind === "custom" ? safeAppearanceIconImage(icon) : undefined;
  const iconMarkup =
    icon?.kind === "bundled"
      ? `<image href="${bundledIcon}" x="16" y="40" width="${imageSize}" height="${imageSize}"/>`
      : customIconImage === undefined
        ? ""
        : `<image href="${escapeXml(customIconImage)}" x="16" y="40" width="${imageSize}" height="${imageSize}"/>`;
  const foreground = appearance.foregroundColor ?? "#FFFFFF";
  const background = appearance.backgroundColor ?? "#000000";
  const progressBar =
    appearance.progress === undefined
      ? ""
      : `<rect x="16" y="88" width="${Math.round(168 * appearance.progress)}" height="4" fill="${foreground}"/>`;
  const foregroundBorder =
    appearance.foregroundColor === undefined
      ? ""
      : `<rect x="2" y="2" width="196" height="96" fill="none" stroke="${foreground}" stroke-width="4"/>`;
  const badge =
    appearance.badge === undefined
      ? ""
      : `<text x="184" y="16" text-anchor="end" fill="${foreground}">${escapeXml(appearance.badge)}</text>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100"><rect width="200" height="100" fill="${background}"/>${iconMarkup}${foregroundBorder}${progressBar}${badge}</svg>`;
  try {
    return `data:image/svg+xml,${encodeURIComponent(svg)}`;
  } catch {
    return undefined;
  }
}

export type HammerspoonActionSettings = JsonObject & {
  actionId?: string;
};

function disconnectedTitle(status: BridgeClient["status"]): string {
  if (status === "connecting" || status === "authenticating") {
    return "Connecting";
  }
  if (status === "connected") {
    return "Syncing";
  }
  return "Offline";
}
const DIAGNOSTIC_AREAS: readonly BridgeDiagnosticArea[] = [
  "auth",
  "schema",
  "reconnect",
  "registry",
  "callback",
];
const DIAGNOSTIC_CODES: readonly BridgeDiagnosticCode[] = [
  "AUTH_REQUIRED",
  "AUTH_FAILED",
  "VERSION_MISMATCH",
  "MALFORMED_MESSAGE",
  "UNKNOWN_TYPE",
  "INVALID_FIELD",
  "INVALID_STATE",
  "UNKNOWN_ACTION",
  "STALE_INSTANCE",
  "CALLBACK_FAILED",
  "INTERNAL",
  "TOKEN_UNAVAILABLE",
  "SOCKET_FAILED",
  "DISCONNECTED",
  "RECONNECTING",
];

function safeDiagnosticsSnapshot(value: unknown): JsonObject {
  const fallback: JsonObject = {
    version: 1,
    status: "disconnected",
    protocolVersion: 1,
    pluginVersion: "unknown",
    port: 0,
  };
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return fallback;
  }
  const candidate = value as Record<string, unknown>;
  const snapshot: JsonObject = {
    ...fallback,
    ...(typeof candidate.pluginVersion === "string" &&
    /^[A-Za-z0-9._-]{1,32}$/.test(candidate.pluginVersion)
      ? { pluginVersion: candidate.pluginVersion }
      : {}),
    ...(typeof candidate.port === "number" &&
    Number.isInteger(candidate.port) &&
    candidate.port >= 1 &&
    candidate.port <= 65535
      ? { port: candidate.port }
      : {}),
    ...(typeof candidate.retryInMs === "number" &&
    Number.isInteger(candidate.retryInMs) &&
    candidate.retryInMs >= 0 &&
    candidate.retryInMs <= 600000
      ? { retryInMs: candidate.retryInMs }
      : {}),
  };
  const latest = candidate.latest;
  if (latest !== null && typeof latest === "object" && !Array.isArray(latest)) {
    const latestCandidate = latest as Record<string, unknown>;
    const at =
      typeof latestCandidate.at === "string"
        ? new Date(latestCandidate.at)
        : undefined;
    if (
      typeof latestCandidate.area === "string" &&
      DIAGNOSTIC_AREAS.includes(latestCandidate.area as BridgeDiagnosticArea) &&
      typeof latestCandidate.code === "string" &&
      DIAGNOSTIC_CODES.includes(latestCandidate.code as BridgeDiagnosticCode) &&
      at !== undefined &&
      Number.isFinite(at.getTime())
    ) {
      snapshot.latest = {
        area: latestCandidate.area,
        code: latestCandidate.code,
        at: at.toISOString(),
      };
    }
  }
  return snapshot;
}

type TrackedAction =
  KeyAction<HammerspoonActionSettings> | DialAction<HammerspoonActionSettings>;

function isDialAction(
  value: unknown,
): value is DialAction<HammerspoonActionSettings> {
  if (value === null || typeof value !== "object") {
    return false;
  }
  const candidate = value as { isDial?: unknown };
  return (
    typeof candidate.isDial === "function" &&
    (candidate.isDial as () => boolean)()
  );
}

type TrackedInstance = {
  action: TrackedAction;
  actionId?: string;
  lastAppearance?: BridgeAppearance;
  feedbackTimer?: unknown;
  metadata?: DeviceMetadata;
  renderingProfile?: RenderingProfile;
  encoderLayout?: "$A0" | "$A1" | "$B1";
  settings: HammerspoonActionSettings;
  imageAppliedStates: Set<number>;
};
type RequestStateMessage = {
  type: "requestState";
};
type RefreshActionsMessage = {
  type: "refreshActions";
};

function isRequestStateMessage(value: JsonValue): value is RequestStateMessage {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    value.type === "requestState"
  );
}
function isRefreshActionsMessage(
  value: JsonValue,
): value is RefreshActionsMessage {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    value.type === "refreshActions"
  );
}

type HammerspoonActionOptions = {
  clearTimeout?: (handle: unknown) => void;
  manifestId?: string;
  mode?: "button" | "toggle" | "multi-state";
  setTimeout?: (callback: () => void, delay: number) => unknown;
};

/** Bridges the official generic keypad action to one shared Hammerspoon connection. */
export class HammerspoonAction extends SingletonAction<HammerspoonActionSettings> {
  public override readonly manifestId: string;
  private readonly instances = new Map<string, TrackedInstance>();
  private readonly synchronized = new Set<string>();
  private readonly renderQueues = new Map<string, Promise<void>>();
  private readonly scheduleTimeout: (
    callback: () => void,
    delay: number,
  ) => unknown;
  private readonly cancelTimeout: (handle: unknown) => void;
  private readonly mode: "button" | "toggle" | "multi-state";
  private subscribed = false;

  public constructor(
    private readonly bridge: BridgeClient,
    options: HammerspoonActionOptions = {},
  ) {
    super();
    this.manifestId = options.manifestId ?? HAMMERSPOON_ACTION_UUID;
    this.mode = options.mode ?? "toggle";
    this.scheduleTimeout =
      options.setTimeout ?? ((callback, delay) => setTimeout(callback, delay));
    this.cancelTimeout =
      options.clearTimeout ??
      ((handle) => clearTimeout(handle as NodeJS.Timeout));
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
    this.bridge.on("diagnostics", () => {
      void this.sendBridgeState();
    });
    this.bridge.on("actions", () => {
      void this.sendBridgeState(streamDeck.ui.action?.id);
    });
    streamDeck.ui.onDidAppear((event) => {
      void this.sendBridgeState(event?.action?.id ?? streamDeck.ui.action?.id);
    });
    this.bridge.on("appearance", (appearance) => {
      void this.enqueueRender(appearance.instanceId, () =>
        this.renderAppearance(appearance),
      );
    });
    this.bridge.on("feedback", (feedback) => {
      void this.enqueueRender(feedback.instanceId, () =>
        this.renderFeedback(feedback),
      );
      void this.sendInspectorFeedback(feedback);
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

  public override async onWillAppear(
    ev: Parameters<
      NonNullable<SingletonAction<HammerspoonActionSettings>["onWillAppear"]>
    >[0],
  ): Promise<void> {
    if (!ev.action.isKey() && !isDialAction(ev.action)) {
      return;
    }

    const instanceId = ev.action.id;

    const settings = this.settingsFrom(ev.payload.settings);

    const metadata = extractDeviceMetadata(ev.action);
    const renderingProfile = selectRenderingProfile(metadata);
    const previous = this.instances.get(instanceId);
    if (previous) {
      this.cancelFeedbackTimer(previous);
    }
    this.instances.set(instanceId, {
      action: ev.action,
      actionId: settings.actionId,
      metadata,
      renderingProfile,
      settings,
      imageAppliedStates: new Set(previous?.imageAppliedStates),
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
      if (await this.setDialLayout(ev.action, renderingProfile)) {
        const current = this.instances.get(instanceId);
        if (current) current.encoderLayout = "$A1";
      }
    }
  }

  public override async onWillDisappear(
    ev: Parameters<
      NonNullable<SingletonAction<HammerspoonActionSettings>["onWillDisappear"]>
    >[0],
  ): Promise<void> {
    const instanceId = ev.action.id;
    const instance = this.instances.get(instanceId);
    this.cancelFeedbackTimer(instance);
    this.instances.delete(instanceId);
    this.synchronized.delete(instanceId);
    if (instance?.actionId) {
      this.bridge.removeInstance(instanceId, instance.actionId);
    }
  }

  public override async onDidReceiveSettings(
    ev: Parameters<
      NonNullable<
        SingletonAction<HammerspoonActionSettings>["onDidReceiveSettings"]
      >
    >[0],
  ): Promise<void> {
    if (!ev.action.isKey() && !isDialAction(ev.action)) {
      return;
    }

    const instanceId = ev.action.id;
    const settings = this.settingsFrom(ev.payload.settings);
    const metadata = extractDeviceMetadata(ev.action);
    const renderingProfile = selectRenderingProfile(metadata);

    const previous = this.instances.get(instanceId);
    if (previous?.actionId && previous.actionId !== settings.actionId) {
      this.bridge.removeInstance(instanceId, previous.actionId);
    }
    this.instances.set(instanceId, {
      action: ev.action,
      actionId: settings.actionId,
      metadata,
      renderingProfile,
      settings,
      imageAppliedStates: new Set(previous?.imageAppliedStates),
    });
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
    if (isDialAction(ev.action)) {
      if (await this.setDialLayout(ev.action, renderingProfile)) {
        const current = this.instances.get(instanceId);
        if (current) current.encoderLayout = "$A1";
      }
    }
  }

  public override async onKeyDown(
    ev: Parameters<
      NonNullable<SingletonAction<HammerspoonActionSettings>["onKeyDown"]>
    >[0],
  ): Promise<void> {
    if (!ev.action.isKey()) {
      return;
    }
    const instance = this.instances.get(ev.action.id);
    if (!instance?.actionId) {
      await this.enqueueRender(ev.action.id, () =>
        this.renderInstance(ev.action.id),
      );
      return;
    }

    this.bridge.keyDown(
      ev.action.id,
      instance.actionId,
      instance.settings as JsonSettings,
    );
  }

  public override async onKeyUp(
    ev: Parameters<
      NonNullable<SingletonAction<HammerspoonActionSettings>["onKeyUp"]>
    >[0],
  ): Promise<void> {
    if (!ev.action.isKey()) {
      return;
    }
    const instance = this.instances.get(ev.action.id);
    if (!instance?.actionId) {
      await this.enqueueRender(ev.action.id, () =>
        this.renderInstance(ev.action.id),
      );
      return;
    }

    this.bridge.keyUp(
      ev.action.id,
      instance.actionId,
      instance.settings as JsonSettings,
    );
  }

  public override async onDialDown(
    ev: Parameters<
      NonNullable<SingletonAction<HammerspoonActionSettings>["onDialDown"]>
    >[0],
  ): Promise<void> {
    if (!isDialAction(ev.action)) {
      return;
    }
    const instance = this.instances.get(ev.action.id);
    if (!instance?.actionId) {
      await this.enqueueRender(ev.action.id, () =>
        this.renderInstance(ev.action.id),
      );
      return;
    }

    this.bridge.dialDown(
      ev.action.id,
      instance.actionId,
      instance.settings as JsonSettings,
    );
  }

  public override async onDialRotate(
    ev: Parameters<
      NonNullable<SingletonAction<HammerspoonActionSettings>["onDialRotate"]>
    >[0],
  ): Promise<void> {
    if (!isDialAction(ev.action)) {
      return;
    }
    const instance = this.instances.get(ev.action.id);
    if (!instance?.actionId) {
      await this.enqueueRender(ev.action.id, () =>
        this.renderInstance(ev.action.id),
      );
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

  public override async onDialUp(
    ev: Parameters<
      NonNullable<SingletonAction<HammerspoonActionSettings>["onDialUp"]>
    >[0],
  ): Promise<void> {
    if (!isDialAction(ev.action)) {
      return;
    }
    const instance = this.instances.get(ev.action.id);
    if (!instance?.actionId) {
      await this.enqueueRender(ev.action.id, () =>
        this.renderInstance(ev.action.id),
      );
      return;
    }

    this.bridge.dialUp(
      ev.action.id,
      instance.actionId,
      instance.settings as JsonSettings,
    );
  }

  public override async onTouchTap(
    ev: Parameters<
      NonNullable<SingletonAction<HammerspoonActionSettings>["onTouchTap"]>
    >[0],
  ): Promise<void> {
    if (!isDialAction(ev.action)) {
      return;
    }
    const instance = this.instances.get(ev.action.id);
    if (!instance?.actionId) {
      await this.enqueueRender(ev.action.id, () =>
        this.renderInstance(ev.action.id),
      );
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

  public override async onSendToPlugin(
    ev: SendToPluginEvent<JsonValue, HammerspoonActionSettings>,
  ): Promise<void> {
    if (isRefreshActionsMessage(ev.payload)) {
      this.bridge.requestActions();
      return;
    }
    if (isRequestStateMessage(ev.payload)) {
      await this.sendBridgeState(ev.action?.id ?? streamDeck.ui.action?.id);
    }
  }
  private targetState(appearance: BridgeAppearance): PresentationState {
    if (this.mode !== "multi-state") {
      return appearance.state;
    }
    return appearance.presentationState ?? appearance.state;
  }

  private settingsFrom(
    value: HammerspoonActionSettings,
  ): HammerspoonActionSettings {
    const settings = cloneJsonValue(value) as HammerspoonActionSettings;
    if (
      typeof settings.actionId !== "string" ||
      settings.actionId.length === 0
    ) {
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
      if (instance.action.isKey()) {
        const stateApplied = await this.setState(instance.action, 0);
        if (stateApplied && !(await this.clearImage(instance, 0))) {
          return;
        }
      }
      await this.setActionTitle(
        instance.action,
        "Select action",
        instance.renderingProfile,
      );
      return;
    }

    if (
      this.bridge.status !== "connected" ||
      !this.synchronized.has(instanceId)
    ) {
      if (instance.action.isKey()) {
        const stateApplied = await this.setState(instance.action, 0);
        if (stateApplied && !(await this.clearImage(instance, 0))) {
          return;
        }
      }
      await this.setActionTitle(
        instance.action,
        disconnectedTitle(this.bridge.status),
        instance.renderingProfile,
      );
      return;
    }

    await this.setActionTitle(
      instance.action,
      "Hammerspoon",
      instance.renderingProfile,
    );
    if (instance.action.isKey()) {
      await this.setState(instance.action, 0);
    }
  }

  private renderStatus(): void {
    for (const instanceId of this.instances.keys()) {
      void this.enqueueRender(instanceId, () =>
        this.renderInstance(instanceId),
      );
    }
  }

  private enqueueRender(
    instanceId: string,
    render: () => Promise<void>,
  ): Promise<void> {
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
    if (!hasValidAppearanceExtension(appearance)) {
      return;
    }
    if (this.bridge.status !== "connected") {
      await this.renderInstance(appearance.instanceId);
      return;
    }
    const bundledIcon =
      this.mode === "toggle"
        ? appearance.state === 1
          ? BUNDLED_TOGGLE_ACTIVE_ICON_PATH
          : BUNDLED_TOGGLE_INACTIVE_ICON_PATH
        : BUNDLED_BUTTON_ICON_PATH;
    if (isDialAction(instance.action)) {
      if (
        !(await this.setDialTitle(
          instance.action,
          appearance.title,
          instance.renderingProfile,
          appearance,
          bundledIcon,
        ))
      ) {
        return;
      }
      instance.lastAppearance = appearance;
      this.synchronized.add(appearance.instanceId);
      return;
    }
    const image = appearanceImage(
      appearance,
      instance.renderingProfile?.imageSize ??
        DEFAULT_RENDERING_PROFILE.imageSize,
      bundledIcon,
    );
    if (appearance.icon !== undefined && image === undefined) {
      await this.alert(instance.action);
      return;
    }
    const targetState =
      this.mode === "button" ? 0 : this.targetState(appearance);
    const previousState =
      instance.lastAppearance === undefined
        ? 0
        : this.mode === "button"
          ? 0
          : this.targetState(instance.lastAppearance);
    if (
      this.mode !== "button" &&
      !(await this.setState(instance.action, targetState))
    ) {
      return;
    }
    if (!(await this.applyImage(instance, image, targetState))) {
      if (this.mode !== "button") {
        await this.setState(instance.action, previousState);
      }
      return;
    }
    instance.lastAppearance = appearance;
    this.synchronized.add(appearance.instanceId);
    await this.setActionTitle(
      instance.action,
      appearance.title,
      instance.renderingProfile,
    );
  }

  private async renderFeedback(feedback: BridgeFeedback): Promise<void> {
    const instance = this.instances.get(feedback.instanceId);
    if (
      !instance ||
      instance.actionId !== feedback.actionId ||
      this.bridge.status !== "connected"
    ) {
      return;
    }
    this.cancelFeedbackTimer(instance);
    await this.setActionTitle(
      instance.action,
      feedback.message,
      instance.renderingProfile,
    );
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
        void this.enqueueRender(feedback.instanceId, () =>
          this.restoreInstance(feedback.instanceId, instance),
        );
      }, feedback.durationMs);
    } catch {
      // A failed timer must not affect the bridge or callback loop.
    }
  }

  private async restoreInstance(
    instanceId: string,
    expected: TrackedInstance,
  ): Promise<void> {
    if (this.instances.get(instanceId) !== expected) {
      return;
    }
    if (
      this.bridge.status === "connected" &&
      this.synchronized.has(instanceId) &&
      expected.lastAppearance
    ) {
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

  private async clearImage(
    instance: TrackedInstance,
    state: number,
  ): Promise<boolean> {
    if (!instance.action.isKey() || !instance.imageAppliedStates.has(state)) {
      return true;
    }
    if (
      await this.setImage(
        instance.action,
        undefined,
        this.mode === "button" ? undefined : state,
      )
    ) {
      instance.imageAppliedStates.delete(state);
      return true;
    }
    return false;
  }

  private async applyImage(
    instance: TrackedInstance,
    image: string | undefined,
    state: number,
  ): Promise<boolean> {
    if (!instance.action.isKey()) {
      return true;
    }
    if (image === undefined) {
      return this.clearImage(instance, state);
    }
    if (
      await this.setImage(
        instance.action,
        image,
        this.mode === "button" ? undefined : state,
      )
    ) {
      instance.imageAppliedStates.add(state);
      return true;
    }
    if (
      await this.setImage(
        instance.action,
        undefined,
        this.mode === "button" ? undefined : state,
      )
    ) {
      instance.imageAppliedStates.delete(state);
      return true;
    }
    return false;
  }
  private async setActionTitle(
    action: TrackedAction,
    title: string,
    renderingProfile?: RenderingProfile,
  ): Promise<boolean> {
    if (isDialAction(action)) {
      return this.setDialTitle(action, title, renderingProfile);
    }
    await this.setTitle(action, title);
    return true;
  }

  private async setDialLayout(
    action: DialAction<HammerspoonActionSettings>,
    renderingProfile?: RenderingProfile,
    layout: "$A0" | "$A1" | "$B1" = renderingProfile?.encoderLayout ?? "$A1",
  ): Promise<boolean> {
    const instance = this.instances.get(action.id);
    if (instance?.action === action && instance.encoderLayout === layout) {
      return true;
    }
    try {
      await action.setFeedbackLayout(layout);
      const current = this.instances.get(action.id);
      if (current?.action === action) {
        current.encoderLayout = layout;
      }
      return true;
    } catch {
      await this.alert(action);
      return false;
    }
  }

  private async setDialTitle(
    action: DialAction<HammerspoonActionSettings>,
    title: string,
    renderingProfile?: RenderingProfile,
    appearance?: BridgeAppearance,
    bundledIcon = BUNDLED_BUTTON_ICON_PATH,
  ): Promise<boolean> {
    const hasDecoration =
      appearance !== undefined &&
      (appearance.icon !== undefined ||
        appearance.foregroundColor !== undefined ||
        appearance.backgroundColor !== undefined ||
        appearance.progress !== undefined ||
        appearance.badge !== undefined);
    const layout =
      hasDecoration && renderingProfile?.encoderDecoratedLayout !== undefined
        ? renderingProfile.encoderDecoratedLayout
        : (renderingProfile?.encoderLayout ?? "$A1");
    const hasValueIndicator =
      appearance !== undefined &&
      appearance.value !== undefined &&
      appearance.indicator !== undefined;
    if (hasValueIndicator && renderingProfile?.encoderValueLayout === "$B1") {
      const icon =
        appearance.icon === undefined
          ? undefined
          : appearance.icon.kind === "bundled"
            ? bundledIcon
            : safeAppearanceIconImage(appearance.icon);
      if (appearance.icon !== undefined && icon === undefined) {
        await this.alert(action);
        return false;
      }
      const feedback: FeedbackPayload = {
        title,
        value: appearance.value!,
        indicator: appearance.indicator!,
      };
      if (icon !== undefined) {
        feedback.icon = icon;
      }
      if (!(await this.setDialLayout(action, renderingProfile, "$B1"))) {
        await this.setDialTitle(action, title, DEFAULT_RENDERING_PROFILE);
        return false;
      }
      try {
        await action.setFeedback(feedback);
        return true;
      } catch {
        await this.alert(action);
        await this.setDialTitle(action, title, DEFAULT_RENDERING_PROFILE);
        return false;
      }
    }

    try {
      if (hasDecoration && layout === "$A0") {
        const image = dialAppearanceImage(
          appearance,
          renderingProfile?.imageSize ?? 48,
          bundledIcon,
        );
        if (image === undefined) {
          await this.alert(action);
          return false;
        }
        if (!(await this.setDialLayout(action, renderingProfile, layout))) {
          await this.setDialTitle(action, title, DEFAULT_RENDERING_PROFILE);
          return false;
        }
        try {
          await action.setFeedback({ "full-canvas": image, title });
          return true;
        } catch {
          await this.alert(action);
          await this.setDialTitle(action, title, DEFAULT_RENDERING_PROFILE);
          return false;
        }
      }

      if (!(await this.setDialLayout(action, renderingProfile, layout))) {
        return false;
      }
      try {
        await action.setFeedback({ title });
        return true;
      } catch {
        await this.alert(action);
        return false;
      }
    } catch {
      await this.alert(action);
      return false;
    }
  }

  private async setImage(
    action: KeyAction<HammerspoonActionSettings>,
    image: string | undefined,
    state?: number,
  ): Promise<boolean> {
    try {
      await action.setImage(image, state === undefined ? undefined : { state });
      return true;
    } catch {
      await this.alert(action);
      return false;
    }
  }

  private async setTitle(
    action: KeyAction<HammerspoonActionSettings>,
    title: string,
  ): Promise<void> {
    try {
      await action.setTitle(title);
    } catch {
      await this.alert(action);
    }
  }

  private async setState(
    action: KeyAction<HammerspoonActionSettings>,
    state: number,
  ): Promise<boolean> {
    try {
      await action.setState(state);
      return true;
    } catch {
      await this.alert(action);
      return false;
    }
  }

  private async alert(action: TrackedAction): Promise<void> {
    try {
      await action.showAlert();
    } catch {
      // Stream Deck feedback is best-effort when an instance is disappearing.
    }
  }

  private async sendInspectorFeedback(feedback: BridgeFeedback): Promise<void> {
    if (streamDeck.ui.action?.id !== feedback.instanceId) {
      return;
    }
    await streamDeck.ui.sendToPropertyInspector({
      type: "inspectorFeedback",
      kind: feedback.kind,
      message: feedback.message,
      durationMs: feedback.durationMs,
    });
  }

  private async sendBridgeState(
    instanceId = streamDeck.ui.action?.id,
  ): Promise<void> {
    const actions = this.bridge.actions.map((action) => {
      const copy: JsonObject = {
        actionId: action.actionId,
        name: action.name,
      };
      if (action.description !== undefined) {
        copy.description = action.description;
      }
      if (action.category !== undefined) {
        copy.category = action.category;
      }
      if (action.gesture !== undefined) {
        copy.gesture = action.gesture;
      }
      if (action.settingsSchema) {
        copy.settingsSchema = action.settingsSchema.map(cloneJsonValue);
      }
      if (action.settingsSchemaVersion !== undefined) {
        copy.settingsSchemaVersion = action.settingsSchemaVersion;
      }
      return copy;
    });
    const instance =
      instanceId === undefined ? undefined : this.instances.get(instanceId);
    await streamDeck.ui.sendToPropertyInspector({
      type: "bridgeState",
      status: this.bridge.status,
      actions,
      ...(instance === undefined
        ? {}
        : {
            controller: isDialAction(instance.action) ? "encoder" : "keypad",
          }),
      ...(this.bridge.status === "disconnected"
        ? { diagnostics: safeDiagnosticsSnapshot(this.bridge.diagnostics) }
        : {}),
    });
  }
}
