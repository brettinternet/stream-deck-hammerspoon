import { parseInitialActionInfo } from "./property-inspector-state";

type JsonObject = Record<string, unknown>;

type KeyboardEventLike = {
  altKey?: boolean;
  key?: string;
  preventDefault(): void;
};

type ElementLike = {
  value: string;
  textContent: string | null;
  disabled?: boolean;
  checked?: boolean;
  type?: string;
  min?: string;
  max?: string;
  step?: string;
  maxLength?: number;
  minLength?: number;
  children?: ElementLike[];
  focus?(): void;
  showPicker?(): void;
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
  addEventListener(type: string, listener: (event?: KeyboardEventLike) => void): void;
  replaceChildren(...children: ElementLike[]): void;
  appendChild(child: ElementLike): void;
};

type DocumentLike = {
  getElementById(id: string): ElementLike | null;
  createElement(tagName: string): ElementLike;
};

type StreamDeckSocket = {
  close(): void;
  onclose: (() => void) | null;
  onerror: (() => void) | null;
  onmessage: ((message: { data: unknown }) => void) | null;
  onopen: (() => void) | null;
  send(message: string): void;
};

type StreamDeckSocketConstructor = new (url: string) => StreamDeckSocket;

type BrowserGlobal = {
  WebSocket?: StreamDeckSocketConstructor;
  document?: DocumentLike;
  connectElgatoStreamDeckSocket?: ConnectElgatoStreamDeckSocket;
};

type ConnectElgatoStreamDeckSocket = (
  port: number | string,
  uuid: string,
  registerEvent: string,
  info: string,
  actionInfo: string,
) => void;

type InspectorConnection = {
  socket: StreamDeckSocket;
  action: string;
  context: string;
};

type StreamDeckMessage = {
  event?: unknown;
  payload?: unknown;
};

type BridgeStatus =
  "disconnected" | "connecting" | "authenticating" | "connected";
type BridgeDiagnosticCode =
  | "AUTH_REQUIRED"
  | "AUTH_FAILED"
  | "VERSION_MISMATCH"
  | "MALFORMED_MESSAGE"
  | "UNKNOWN_TYPE"
  | "INVALID_FIELD"
  | "INVALID_STATE"
  | "UNKNOWN_ACTION"
  | "STALE_INSTANCE"
  | "CALLBACK_FAILED"
  | "INTERNAL"
  | "TOKEN_UNAVAILABLE"
  | "LAN_KEY_UNAVAILABLE"
  | "SOCKET_FAILED"
  | "DISCONNECTED"
  | "RECONNECTING";
type BridgeDiagnostics = {
  port: number;
  retryInMs?: number;
  latest?: { code: BridgeDiagnosticCode };
};
const BRIDGE_DIAGNOSTIC_CODES: readonly BridgeDiagnosticCode[] = [
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
  "LAN_KEY_UNAVAILABLE",
  "SOCKET_FAILED",
  "DISCONNECTED",
  "RECONNECTING",
];

const browserGlobal = globalThis as unknown as BrowserGlobal;
const documentLike = browserGlobal.document;
const actionSelect = documentLike?.getElementById("action-id");
const actionSearch = documentLike?.getElementById("action-search");
const actionDescription = documentLike?.getElementById("action-description");
const actionGestures = documentLike?.getElementById("action-gestures");
const connectionStatus = documentLike?.getElementById("connection-status");
const connectionDetails = documentLike?.getElementById("connection-details");
const setupGuideButton = documentLike?.getElementById("setup-guide");
const settingsPanel = documentLike?.getElementById("action-settings");
const resetActionButton = documentLike?.getElementById("reset-action");
const settingsStatus = documentLike?.getElementById("settings-status");

let inspectorConnection: InspectorConnection | undefined;
let savedActionId = "";
let savedSettings: JsonObject = {};
let bridgeStatus: BridgeStatus = "connecting";
let bridgeDiagnostics: BridgeDiagnostics | undefined;
let bridgeActions: BridgeAction[] = [];
let inspectorSocketReady = false;
let activeController: SettingsController = "keypad";
let catalogFilter = "";
let feedbackGeneration = 0;
const renderedControls = new Map<string, ElementLike>();

type ActionCategory =
  "Applications" | "Audio" | "Productivity" | "Windows" | "System" | "Media";
type SettingsController = "keypad" | "encoder";

type SettingsFieldBase = {
  key: string;
  label?: string;
  description?: string;
  required?: boolean;
  controllers?: SettingsController[];
  visibleWhen?: { key: string; equals: string | number | boolean };
  section?: string;
};

type TextSettingsField = SettingsFieldBase & {
  type: "text";
  default?: string;
  minLength?: number;
  maxLength?: number;
};

type NumberSettingsField = SettingsFieldBase & {
  type: "number";
  default?: number;
  min?: number;
  max?: number;
  step?: number;
};

type BooleanSettingsField = SettingsFieldBase & {
  type: "boolean";
  default?: boolean;
};

type SelectSettingsField = SettingsFieldBase & {
  type: "select";
  default?: string;
  options: Array<{ value: string; label: string }>;
  refreshable?: boolean;
};

type SettingsField =
  | TextSettingsField
  | NumberSettingsField
  | BooleanSettingsField
  | SelectSettingsField;

type BridgeAction = {
  actionId: string;
  name: string;
  description?: string;
  category?: ActionCategory;
  gesture?: string;
  settingsSchema?: unknown[];
  settingsSchemaVersion?: number;
};
const DEFAULT_ACTION_UUID = "com.brettinternet.hammerspoon.action";
const SETUP_GUIDE_URL =
  "https://github.com/brettinternet/stream-deck-hammerspoon/blob/main/docs/setup.md";
const DESCRIPTION_MAX_LENGTH = 512;
const CATEGORY_ORDER: readonly ActionCategory[] = [
  "Applications",
  "Audio",
  "Productivity",
  "Windows",
  "System",
  "Media",
];

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseJsonObject(value: string): JsonObject {
  try {
    const parsed: unknown = JSON.parse(value);
    return isJsonObject(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function settingsFromValue(value: unknown): JsonObject {
  if (!isJsonObject(value)) {
    return {};
  }
  const settings = "settings" in value ? value.settings : value;
  return isJsonObject(settings) ? { ...settings } : {};
}

function setStatus(message: string): void {
  if (connectionStatus) {
    connectionStatus.textContent = message;
  }
}

function setConnectionDetails(message: string): void {
  if (connectionDetails) {
    connectionDetails.textContent = message;
  }
}

function diagnosticDetails(): string {
  const code = bridgeDiagnostics?.latest?.code;
  const port = bridgeDiagnostics?.port || 17321;
  const retry =
    bridgeDiagnostics?.retryInMs === undefined
      ? " The plugin will retry automatically."
      : ` Retrying in about ${Math.max(1, Math.ceil(bridgeDiagnostics.retryInMs / 1000))} seconds.`;
  switch (code) {
    case "TOKEN_UNAVAILABLE":
      return "The Hammerspoon token is unavailable. Check ~/.hammerspoon/streamdeck-token, then reload Hammerspoon.";
    case "LAN_KEY_UNAVAILABLE":
      return "The LAN credential is unavailable or invalid. Check the configured 32-byte key file and its 0600 permissions.";
    case "AUTH_REQUIRED":
      return "Hammerspoon requested authentication. Reload Hammerspoon so the bridge can reconnect.";
    case "AUTH_FAILED":
      return "Authentication failed. Check the configured bridge credential and reload Hammerspoon.";
    case "VERSION_MISMATCH":
      return "The plugin and Hammerspoon bridge use different protocol versions. Update or rebuild both sides.";
    case "MALFORMED_MESSAGE":
    case "UNKNOWN_TYPE":
    case "INVALID_FIELD":
      return "The bridge reported a protocol error. Update or reload Hammerspoon and the Stream Deck plugin.";
    case "UNKNOWN_ACTION":
    case "STALE_INSTANCE":
      return "The selected action is unavailable in Hammerspoon. Register it and select it again.";
    case "CALLBACK_FAILED":
      return "Hammerspoon reported an action error. Check the Hammerspoon console and selected action.";
    case "INVALID_STATE":
    case "INTERNAL":
      return "The bridge reported an internal error. Reload Hammerspoon and the Stream Deck plugin.";
    case "SOCKET_FAILED":
      return `The bridge socket could not be reached on port ${port}. Start Hammerspoon and ensure the bridge is running.${retry}`;
    case "DISCONNECTED":
    case "RECONNECTING":
    default:
      return `Hammerspoon is not connected. Start Hammerspoon and ensure the bridge is running on port ${port}.${retry}`;
  }
}

function renderConnectionDetails(): void {
  setConnectionDetails(
    bridgeStatus === "disconnected" ? diagnosticDetails() : "",
  );
}
function renderSetupGuideButton(): void {
  if (setupGuideButton) {
    setupGuideButton.disabled = !inspectorSocketReady;
  }
}

function openSetupGuide(): void {
  if (!inspectorConnection || !inspectorSocketReady) {
    return;
  }
  inspectorConnection.socket.send(
    JSON.stringify({
      event: "openUrl",
      payload: { url: SETUP_GUIDE_URL },
    }),
  );
}

function setSettingsStatus(message: string): void {
  feedbackGeneration += 1;
  if (settingsStatus) {
    settingsStatus.textContent = message;
    settingsStatus.removeAttribute("data-feedback");
  }
}

function setBridgeStatus(
  status: BridgeStatus,
  diagnostics?: BridgeDiagnostics,
): void {
  bridgeStatus = status;
  bridgeDiagnostics = diagnostics;
  if (status === "connected") {
    setStatus("Connected");
  } else if (status === "connecting" || status === "authenticating") {
    setStatus("Connecting");
  } else {
    setStatus("Offline");
  }
  renderConnectionDetails();
}

function actionIdFromSettings(value: unknown): string {
  const settings = settingsFromValue(value);
  return typeof settings.actionId === "string" ? settings.actionId : "";
}

function createOption(
  value: string,
  text: string,
  disabled = false,
): ElementLike {
  if (!documentLike) {
    throw new Error("Property inspector document is unavailable");
  }

  const option = documentLike.createElement("option");
  option.value = value;
  option.textContent = text;
  option.disabled = disabled;
  return option;
}

function renderActionDescription(): void {
  const action =
    bridgeStatus === "connected" && savedActionId
      ? bridgeActions.find((candidate) => candidate.actionId === savedActionId)
      : undefined;
  if (actionDescription) {
    actionDescription.textContent = action?.description ?? "";
  }
  if (actionGestures) {
    actionGestures.textContent = action?.gesture ?? "";
  }
}

function actionMatchesCatalogFilter(action: BridgeAction, filter: string): boolean {
  return filter.length === 0
    || `${action.name} ${action.description ?? ""} ${action.category ?? ""}`.toLocaleLowerCase().includes(filter);
}


function openActionSelect(): void {
  if (!actionSelect || actionSelect.disabled) return;

  actionSelect.focus?.();
  try {
    actionSelect.showPicker?.();
  } catch {
    // Older Property Inspector runtimes still receive focus for native keyboard controls.
  }
}

function handleActionSearchKeydown(event?: KeyboardEventLike): void {
  if (!event) return;

  if (event.key === "ArrowDown") {
    event.preventDefault();
    openActionSelect();
  } else if (event.key === "Enter") {
    const filter = catalogFilter.trim().toLocaleLowerCase();
    const matches = bridgeActions.filter((action) => actionMatchesCatalogFilter(action, filter));
    if (matches.length !== 1) return;

    event.preventDefault();
    if (!actionSelect || actionSelect.disabled) return;

    actionSelect.value = matches[0]!.actionId;
    saveActionId();
  }
}


function renderActionSelect(): void {
  renderActionDescription();
  if (!actionSelect || !documentLike) {
    return;
  }

  if (
    bridgeStatus === "connected" &&
    bridgeActions.length === 0 &&
    savedActionId
  ) {
    actionSelect.replaceChildren(
      createOption(savedActionId, "Loading actions...", true),
    );
    actionSelect.value = savedActionId;
    actionSelect.disabled = true;
    if (actionSearch) actionSearch.disabled = true;
    renderSettings();
    return;
  }
  const unavailable =
    bridgeActions.length === 0 || bridgeStatus !== "connected";
  if (unavailable) {
    actionSelect.replaceChildren(
      createOption(
        "",
        bridgeActions.length === 0 ? "No actions available" : "Offline",
      ),
    );
    actionSelect.value = "";
    actionSelect.disabled = true;
    if (actionSearch) actionSearch.disabled = true;
    renderSettings();
    return;
  }

  const filter = catalogFilter.trim().toLocaleLowerCase();
  const children: ElementLike[] = [createOption("", "No action selected")];
  let savedActionAvailable = savedActionId.length === 0;
  for (const category of CATEGORY_ORDER) {
    const matches = bridgeActions.filter((action) => (
      action.category === category
      && (action.actionId === savedActionId || actionMatchesCatalogFilter(action, filter))
    ));
    if (matches.length === 0) continue;
    const group = documentLike.createElement("optgroup");
    group.setAttribute("label", category);
    for (const action of matches) {
      group.appendChild(createOption(action.actionId, action.name));
      if (action.actionId === savedActionId) savedActionAvailable = true;
    }
    children.push(group);
  }
  for (const action of bridgeActions) {
    if (action.category !== undefined) continue;
    if (action.actionId !== savedActionId && !actionMatchesCatalogFilter(action, filter)) continue;
    children.push(createOption(action.actionId, action.name));
    if (action.actionId === savedActionId) savedActionAvailable = true;
  }

  if (savedActionId && !savedActionAvailable) {
    children.push(
      createOption(savedActionId, `Unavailable: ${savedActionId}`, true),
    );
  }
  actionSelect.replaceChildren(...children);
  actionSelect.value = savedActionId;
  actionSelect.disabled = false;
  if (actionSearch) actionSearch.disabled = false;
  renderSettings();
}

function sendSettings(settings: JsonObject): void {
  const connection = inspectorConnection;
  if (!connection || !connection.context) {
    return;
  }
  connection.socket.send(
    JSON.stringify({
      action: connection.action,
      event: "setSettings",
      context: connection.context,
      payload: settings,
    }),
  );
}

function hasSetting(settings: JsonObject, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(settings, key);
}

function isValidDescription(value: unknown): value is string {
  if (typeof value !== "string") {
    return false;
  }
  const length = stringLength(value);
  return length > 0 && length <= DESCRIPTION_MAX_LENGTH;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function parseSettingsField(value: unknown): SettingsField | undefined {
  if (
    !isJsonObject(value) ||
    typeof value.key !== "string" ||
    value.key.length === 0
  ) {
    return undefined;
  }
  const base: SettingsFieldBase = {
    key: value.key,
    ...(typeof value.label === "string" ? { label: value.label } : {}),
    ...(typeof value.required === "boolean"
      ? { required: value.required }
      : {}),
  };
  if ("description" in value) {
    if (!isValidDescription(value.description)) {
      return undefined;
    }
    base.description = value.description;
  }
  if ("controllers" in value) {
    if (
      !Array.isArray(value.controllers) ||
      value.controllers.length < 1 ||
      value.controllers.some(
        (controller) => controller !== "keypad" && controller !== "encoder",
      ) ||
      new Set(value.controllers).size !== value.controllers.length
    ) {
      return undefined;
    }
    base.controllers = value.controllers as SettingsController[];
  }
  if ("visibleWhen" in value) {
    if (
      !isJsonObject(value.visibleWhen) ||
      typeof value.visibleWhen.key !== "string" ||
      value.visibleWhen.key.length === 0 ||
      (typeof value.visibleWhen.equals !== "string" &&
        typeof value.visibleWhen.equals !== "boolean" &&
        !isFiniteNumber(value.visibleWhen.equals))
    ) {
      return undefined;
    }
    base.visibleWhen = {
      key: value.visibleWhen.key,
      equals: value.visibleWhen.equals as string | number | boolean,
    };
  }
  if ("section" in value) {
    if (typeof value.section !== "string" || value.section.length === 0) {
      return undefined;
    }
    base.section = value.section;
  }
  if (value.type === "text") {
    if (
      ("default" in value && typeof value.default !== "string") ||
      ("minLength" in value &&
        (!Number.isInteger(value.minLength) ||
          (value.minLength as number) < 0)) ||
      ("maxLength" in value &&
        (!Number.isInteger(value.maxLength) || (value.maxLength as number) < 0))
    ) {
      return undefined;
    }
    return {
      ...base,
      type: "text",
      ...(typeof value.default === "string" ? { default: value.default } : {}),
      ...(typeof value.minLength === "number"
        ? { minLength: value.minLength }
        : {}),
      ...(typeof value.maxLength === "number"
        ? { maxLength: value.maxLength }
        : {}),
    };
  }
  if (value.type === "number") {
    if (
      ("default" in value && !isFiniteNumber(value.default)) ||
      ("min" in value && !isFiniteNumber(value.min)) ||
      ("max" in value && !isFiniteNumber(value.max)) ||
      ("step" in value &&
        (!isFiniteNumber(value.step) || (value.step as number) <= 0))
    ) {
      return undefined;
    }
    return {
      ...base,
      type: "number",
      ...(isFiniteNumber(value.default) ? { default: value.default } : {}),
      ...(isFiniteNumber(value.min) ? { min: value.min } : {}),
      ...(isFiniteNumber(value.max) ? { max: value.max } : {}),
      ...(isFiniteNumber(value.step) ? { step: value.step } : {}),
    };
  }
  if (value.type === "boolean") {
    if ("default" in value && typeof value.default !== "boolean") {
      return undefined;
    }
    return {
      ...base,
      type: "boolean",
      ...(typeof value.default === "boolean" ? { default: value.default } : {}),
    };
  }
  if (value.type === "select" && Array.isArray(value.options)) {
    const options: Array<{ value: string; label: string }> = [];
    for (const option of value.options) {
      if (
        !isJsonObject(option) ||
        typeof option.value !== "string" ||
        typeof option.label !== "string"
      ) {
        return undefined;
      }
      options.push({ value: option.value, label: option.label });
    }
    if (
      options.length === 0 ||
      ("default" in value && typeof value.default !== "string") ||
      (typeof value.default === "string" &&
        !options.some((option) => option.value === value.default)) ||
      ("refreshable" in value && typeof value.refreshable !== "boolean")
    ) {
      return undefined;
    }
    return {
      ...base,
      type: "select",
      options,
      ...(typeof value.default === "string" ? { default: value.default } : {}),
      ...(typeof value.refreshable === "boolean"
        ? { refreshable: value.refreshable }
        : {}),
    };
  }
  return undefined;
}

function fieldsForAction(action: BridgeAction): {
  fields: SettingsField[];
  unsupported?: string;
} {
  if (
    action.settingsSchemaVersion === undefined &&
    action.settingsSchema === undefined
  ) {
    return { fields: [] };
  }
  if (action.settingsSchemaVersion !== 1) {
    return {
      fields: [],
      unsupported: "This settings schema version is not editable.",
    };
  }
  if (!Array.isArray(action.settingsSchema)) {
    return {
      fields: [],
      unsupported: "This action has an invalid settings schema.",
    };
  }
  const fields: SettingsField[] = [];
  const keys = new Set<string>();
  for (let index = 0; index < action.settingsSchema.length; index += 1) {
    const field = parseSettingsField(action.settingsSchema[index]);
    if (!field) {
      return {
        fields: [],
        unsupported: `Unsupported settings field at position ${index + 1}.`,
      };
    }
    if (keys.has(field.key)) {
      return {
        fields: [],
        unsupported: `Duplicate settings field "${field.key}" cannot be edited.`,
      };
    }
    keys.add(field.key);
    fields.push(field);
  }
  for (const field of fields) {
    if (field.visibleWhen && !keys.has(field.visibleWhen.key)) {
      return {
        fields: [],
        unsupported: `Settings field "${field.key}" depends on an unknown field.`,
      };
    }
  }
  return { fields };
}

function numberIsValid(
  field: NumberSettingsField,
  value: unknown,
): value is number {
  if (!isFiniteNumber(value)) {
    return false;
  }
  if (field.min !== undefined && value < field.min) {
    return false;
  }
  if (field.max !== undefined && value > field.max) {
    return false;
  }
  if (field.step !== undefined) {
    const base = field.min ?? 0;
    const steps = (value - base) / field.step;
    if (Math.abs(steps - Math.round(steps)) > 1e-9) {
      return false;
    }
  }
  return true;
}

function stringLength(value: string): number {
  let length = 0;
  for (const character of value) {
    length += character.length > 0 ? 1 : 0;
  }
  return length;
}

function fieldValueIsValid(field: SettingsField, value: unknown): boolean {
  if (field.type === "text") {
    return (
      typeof value === "string" &&
      (field.minLength === undefined ||
        stringLength(value) >= field.minLength) &&
      (field.maxLength === undefined || stringLength(value) <= field.maxLength)
    );
  }
  if (field.type === "number") {
    return numberIsValid(field, value);
  }
  if (field.type === "boolean") {
    return typeof value === "boolean";
  }
  return (
    typeof value === "string" &&
    (field.options.some((option) => option.value === value) ||
      (field.refreshable === true &&
        value.length > 0 &&
        stringLength(value) <= 256))
  );
}

function defaultFieldValue(field: SettingsField): string | number | boolean {
  if (field.default !== undefined) {
    return field.default;
  }
  if (field.type === "number") {
    return field.min ?? "";
  }
  if (field.type === "select") {
    return field.options[0]?.value ?? "";
  }
  return field.type === "boolean" ? false : "";
}

function validateSettings(
  fields: SettingsField[],
  candidate: JsonObject,
): { settings?: JsonObject; errors: string[] } {
  const normalized: JsonObject = { ...candidate };
  const errors: string[] = [];
  for (const field of fields) {
    if (!hasSetting(candidate, field.key)) {
      if (field.default !== undefined) {
        normalized[field.key] = field.default;
      } else if (field.required) {
        errors.push(`${field.label ?? field.key} is required.`);
      }
      continue;
    }
    const value = candidate[field.key];
    if (!fieldValueIsValid(field, value)) {
      errors.push(`${field.label ?? field.key} has an invalid value.`);
    } else {
      normalized[field.key] = value;
    }
  }
  return errors.length > 0 ? { errors } : { settings: normalized, errors: [] };
}
function fieldIsVisible(
  field: SettingsField,
  fields: SettingsField[],
): boolean {
  if (field.controllers && !field.controllers.includes(activeController)) {
    return false;
  }
  if (!field.visibleWhen) {
    return true;
  }
  const dependency = fields.find(
    (candidate) => candidate.key === field.visibleWhen?.key,
  );
  if (!dependency) {
    return false;
  }
  const value = hasSetting(savedSettings, dependency.key)
    ? savedSettings[dependency.key]
    : defaultFieldValue(dependency);
  return value === field.visibleWhen.equals;
}

function savedOptionLabel(fieldKey: string, value: string): string | undefined {
  const labels = savedSettings.__optionLabels;
  if (!isJsonObject(labels)) return undefined;
  const actionLabels = labels[savedActionId];
  if (!isJsonObject(actionLabels)) return undefined;
  const fieldLabels = actionLabels[fieldKey];
  if (!isJsonObject(fieldLabels)) return undefined;
  const label = fieldLabels[value];
  return typeof label === "string" && label.length > 0 ? label : undefined;
}

function withRefreshableOptionLabels(
  settings: JsonObject,
  actionId: string,
  fields: SettingsField[],
): JsonObject {
  const labelsValue = settings.__optionLabels;
  const labels: JsonObject = isJsonObject(labelsValue) ? labelsValue : {};
  const actionLabelsValue = labels[actionId];
  let actionLabels: JsonObject = isJsonObject(actionLabelsValue)
    ? actionLabelsValue
    : {};
  let changed = false;
  for (const field of fields) {
    if (field.type !== "select" || !field.refreshable) continue;
    const value = settings[field.key];
    if (typeof value !== "string") continue;
    const selected = field.options.find((option) => option.value === value);
    if (!selected) continue;
    const fieldLabelsValue = actionLabels[field.key];
    const fieldLabels = isJsonObject(fieldLabelsValue) ? fieldLabelsValue : {};
    if (
      fieldLabels[selected.value] === selected.label &&
      Object.keys(fieldLabels).length === 1
    )
      continue;
    actionLabels = {
      ...actionLabels,
      [field.key]: { [selected.value]: selected.label },
    };
    changed = true;
  }
  if (!changed) return settings;
  return {
    ...settings,
    __optionLabels: {
      ...labels,
      [actionId]: actionLabels,
    },
  };
}

function requestOptionsRefresh(): void {
  const connection = inspectorConnection;
  if (!connection || !connection.context) return;
  connection.socket.send(
    JSON.stringify({
      action: connection.action,
      event: "sendToPlugin",
      context: connection.context,
      payload: { type: "refreshActions" },
    }),
  );
  setSettingsStatus("Refreshing system options…");
}

function renderSettings(): void {
  renderActionDescription();
  renderedControls.clear();
  if (resetActionButton) {
    resetActionButton.disabled = true;
    resetActionButton.setAttribute("hidden", "");
  }
  if (!settingsPanel || !documentLike) {
    return;
  }
  settingsPanel.replaceChildren();
  if (!savedActionId) {
    setSettingsStatus("Select an action to edit its settings.");
    return;
  }
  if (bridgeStatus !== "connected") {
    setSettingsStatus("Settings are unavailable while disconnected.");
    return;
  }
  const action = bridgeActions.find(
    (candidate) => candidate.actionId === savedActionId,
  );
  if (!action) {
    setSettingsStatus(`Action unavailable: ${savedActionId}`);
    return;
  }
  if (
    action.settingsSchemaVersion === undefined &&
    action.settingsSchema !== undefined
  ) {
    setSettingsStatus(
      "Legacy settings schemas are opaque and cannot be edited.",
    );
    return;
  }
  const schema = fieldsForAction(action);
  if (schema.unsupported) {
    const message = documentLike.createElement("p");
    message.textContent = schema.unsupported;
    message.disabled = true;
    settingsPanel.appendChild(message);
    setSettingsStatus(schema.unsupported);
    return;
  }
  const labeledSettings = withRefreshableOptionLabels(
    savedSettings,
    savedActionId,
    schema.fields,
  );
  if (labeledSettings !== savedSettings) {
    savedSettings = labeledSettings;
    sendSettings(savedSettings);
  }
  if (schema.fields.length === 0) {
    setSettingsStatus("No additional settings.");
    return;
  }

  const errors: string[] = [];
  const sections = new Map<string, ElementLike>();
  for (let fieldIndex = 0; fieldIndex < schema.fields.length; fieldIndex += 1) {
    const field = schema.fields[fieldIndex]!;
    if (!fieldIsVisible(field, schema.fields)) continue;

    const wrapper = documentLike.createElement("div");
    wrapper.setAttribute("class", "field-row");

    const control = documentLike.createElement(
      field.type === "select" ? "select" : "input",
    );
    if (field.type !== "select") {
      control.type = field.type === "boolean" ? "checkbox" : field.type;
    }
    control.setAttribute("aria-label", field.label ?? field.key);
    const currentValue = hasSetting(savedSettings, field.key)
      ? savedSettings[field.key]
      : defaultFieldValue(field);
    const displayValue = fieldValueIsValid(field, currentValue)
      ? currentValue
      : defaultFieldValue(field);
    if (
      hasSetting(savedSettings, field.key) &&
      !fieldValueIsValid(field, currentValue)
    ) {
      errors.push(`${field.label ?? field.key} has an invalid saved value.`);
    }
    if (field.type === "boolean") {
      control.checked = displayValue === true;
      control.value = control.checked ? "true" : "false";
    } else {
      control.value = String(displayValue);
    }
    if (field.type === "text") {
      if (field.minLength !== undefined) control.minLength = field.minLength;
      if (field.maxLength !== undefined) control.maxLength = field.maxLength;
    } else if (field.type === "number") {
      if (field.min !== undefined) control.min = String(field.min);
      if (field.max !== undefined) control.max = String(field.max);
      if (field.step !== undefined) control.step = String(field.step);
    } else if (field.type === "select") {
      const options = field.options.map((option) =>
        createOption(option.value, option.label),
      );
      if (
        field.refreshable &&
        typeof currentValue === "string" &&
        !field.options.some((option) => option.value === currentValue)
      ) {
        options.push(
          createOption(
            currentValue,
            `Unavailable — ${savedOptionLabel(field.key, currentValue) ?? currentValue}`,
          ),
        );
      }
      control.replaceChildren(...options);
      control.value = String(displayValue);
    }
    renderedControls.set(field.key, control);
    control.addEventListener("change", () => {
      if (saveSettings(schema.fields)) renderSettings();
    });
    wrapper.appendChild(control);

    const label = documentLike.createElement("span");
    label.textContent = field.label ?? field.key;
    label.setAttribute("class", "field-label");
    wrapper.appendChild(label);

    if (field.description !== undefined) {
      const descriptionId = `action-field-description-${fieldIndex}`;
      const description = documentLike.createElement("span");
      description.textContent = field.description;
      description.setAttribute("class", "field-description");
      description.setAttribute("id", descriptionId);
      description.setAttribute("role", "note");
      control.setAttribute("aria-describedby", descriptionId);
      wrapper.appendChild(description);
    }

    const reset = documentLike.createElement("button");
    reset.type = "button";
    reset.textContent = "Reset";
    reset.setAttribute("class", "field-action reset-field");
    reset.setAttribute("aria-label", `Reset ${field.label ?? field.key}`);
    reset.addEventListener("click", () => {
      const candidate = {
        ...savedSettings,
        [field.key]: defaultFieldValue(field),
      };
      const result = validateSettings(schema.fields, candidate);
      if (!result.settings) {
        setSettingsStatus(result.errors.join(" "));
        return;
      }
      savedSettings = result.settings;
      sendSettings(savedSettings);
      renderSettings();
      setSettingsStatus(`${field.label ?? field.key} reset.`);
    });
    wrapper.appendChild(reset);

    if (field.type === "select" && field.refreshable) {
      const refresh = documentLike.createElement("button");
      refresh.type = "button";
      refresh.textContent = "Refresh";
      refresh.setAttribute("class", "field-action refresh-field");
      refresh.setAttribute("aria-label", `Refresh ${field.label ?? field.key}`);
      refresh.addEventListener("click", requestOptionsRefresh);
      wrapper.appendChild(refresh);
    }

    if (!field.section) {
      settingsPanel.appendChild(wrapper);
      continue;
    }
    let section = sections.get(field.section);
    if (!section) {
      section = documentLike.createElement("details");
      section.setAttribute("class", "settings-section");
      const summary = documentLike.createElement("summary");
      summary.textContent = field.section;
      section.appendChild(summary);
      sections.set(field.section, section);
      settingsPanel.appendChild(section);
    }
    section.appendChild(wrapper);
  }
  if (resetActionButton && renderedControls.size > 0) {
    resetActionButton.disabled = false;
    resetActionButton.removeAttribute("hidden");
  }
  setSettingsStatus(
    errors.length > 0 ? errors.join(" ") : "Settings are ready.",
  );
}

function saveSettings(fields: SettingsField[]): boolean {
  if (!inspectorConnection || bridgeStatus !== "connected" || !actionSelect) {
    return false;
  }
  const candidate: JsonObject = {
    ...savedSettings,
    actionId: actionSelect.value,
  };
  for (const field of fields) {
    const control = renderedControls.get(field.key);
    if (!control) continue;
    if (field.type === "boolean") {
      candidate[field.key] = control.checked === true;
    } else if (field.type === "number") {
      if (control.value.trim() === "") delete candidate[field.key];
      else candidate[field.key] = Number(control.value);
    } else {
      candidate[field.key] = control.value;
    }
  }
  const result = validateSettings(fields, candidate);
  if (!result.settings) {
    setSettingsStatus(result.errors.join(" "));
    return false;
  }
  savedSettings = withRefreshableOptionLabels(
    result.settings,
    actionSelect.value,
    fields,
  );
  savedActionId = actionSelect.value;
  sendSettings(savedSettings);
  setSettingsStatus("Settings saved.");
  return true;
}

function resetActionSettings(): void {
  const action = bridgeActions.find(
    (candidate) => candidate.actionId === savedActionId,
  );
  if (!action) return;
  const schema = fieldsForAction(action);
  if (schema.unsupported) {
    setSettingsStatus(schema.unsupported);
    return;
  }
  const candidate: JsonObject = { ...savedSettings, actionId: savedActionId };
  for (const field of schema.fields) {
    candidate[field.key] = defaultFieldValue(field);
  }
  const result = validateSettings(schema.fields, candidate);
  if (!result.settings) {
    setSettingsStatus(result.errors.join(" "));
    return;
  }
  savedSettings = withRefreshableOptionLabels(
    result.settings,
    savedActionId,
    schema.fields,
  );
  sendSettings(savedSettings);
  renderSettings();
  setSettingsStatus("Action settings reset.");
}

function saveActionId(): void {
  if (!actionSelect || !inspectorConnection || bridgeStatus !== "connected") {
    return;
  }
  const selectedActionId = actionSelect.value;
  const action = bridgeActions.find(
    (candidate) => candidate.actionId === selectedActionId,
  );
  const fields = action ? fieldsForAction(action).fields : [];
  const candidate = { ...savedSettings, actionId: selectedActionId };
  const result =
    action && !fieldsForAction(action).unsupported
      ? validateSettings(fields, candidate)
      : { settings: candidate, errors: [] };
  if (!result.settings) {
    actionSelect.value = savedActionId;
    setSettingsStatus(result.errors.join(" "));
    renderSettings();
    return;
  }
  savedActionId = selectedActionId;
  savedSettings = withRefreshableOptionLabels(
    result.settings,
    savedActionId,
    fields,
  );
  renderSettings();
  sendSettings(savedSettings);
}

function parseBridgeDiagnostics(value: unknown): BridgeDiagnostics | undefined {
  if (
    !isJsonObject(value) ||
    value.version !== 1 ||
    value.status !== "disconnected"
  ) {
    return undefined;
  }
  const port =
    typeof value.port === "number" &&
    Number.isInteger(value.port) &&
    value.port > 0
      ? value.port
      : 17321;
  const retryInMs =
    typeof value.retryInMs === "number" &&
    Number.isInteger(value.retryInMs) &&
    value.retryInMs >= 0
      ? value.retryInMs
      : undefined;
  const latest =
    isJsonObject(value.latest) &&
    typeof value.latest.code === "string" &&
    BRIDGE_DIAGNOSTIC_CODES.includes(value.latest.code as BridgeDiagnosticCode)
      ? { code: value.latest.code as BridgeDiagnosticCode }
      : undefined;
  return {
    port,
    ...(retryInMs === undefined ? {} : { retryInMs }),
    ...(latest === undefined ? {} : { latest }),
  };
}

function parseBridgeState(value: unknown):
  | {
      status: BridgeStatus;
      actions: BridgeAction[];
      diagnostics?: BridgeDiagnostics;
      controller?: SettingsController;
    }
  | undefined {
  if (!isJsonObject(value) || value.type !== "bridgeState") {
    return undefined;
  }

  const status = value.status;
  if (
    status !== "disconnected" &&
    status !== "connecting" &&
    status !== "authenticating" &&
    status !== "connected"
  ) {
    return undefined;
  }

  if (!Array.isArray(value.actions)) {
    return undefined;
  }

  const actionIds = new Set<string>();
  const actions: BridgeAction[] = [];
  for (const item of value.actions) {
    if (
      !isJsonObject(item) ||
      typeof item.actionId !== "string" ||
      item.actionId.trim().length === 0 ||
      typeof item.name !== "string" ||
      item.name.trim().length === 0 ||
      ("description" in item && !isValidDescription(item.description)) ||
      ("category" in item &&
        !CATEGORY_ORDER.includes(item.category as ActionCategory)) ||
      ("gesture" in item && !isValidDescription(item.gesture)) ||
      ("settingsSchema" in item && !Array.isArray(item.settingsSchema)) ||
      ("settingsSchemaVersion" in item &&
        (typeof item.settingsSchemaVersion !== "number" ||
          !Number.isInteger(item.settingsSchemaVersion) ||
          item.settingsSchemaVersion < 1 ||
          item.settingsSchemaVersion > 16))
    ) {
      return undefined;
    }
    if (
      item.settingsSchemaVersion !== undefined &&
      item.settingsSchemaVersion !== 1
    ) {
      continue;
    }
    if (actionIds.has(item.actionId)) {
      return undefined;
    }
    actionIds.add(item.actionId);
    actions.push({
      actionId: item.actionId,
      name: item.name,
      ...("description" in item
        ? { description: item.description as string }
        : {}),
      ...("category" in item
        ? { category: item.category as ActionCategory }
        : {}),
      ...("gesture" in item ? { gesture: item.gesture as string } : {}),
      ...(Array.isArray(item.settingsSchema)
        ? { settingsSchema: item.settingsSchema }
        : {}),
      ...(typeof item.settingsSchemaVersion === "number"
        ? { settingsSchemaVersion: item.settingsSchemaVersion }
        : {}),
    });
  }

  const diagnostics =
    status === "disconnected"
      ? parseBridgeDiagnostics(value.diagnostics)
      : undefined;
  const controller =
    value.controller === "keypad" || value.controller === "encoder"
      ? value.controller
      : undefined;
  return {
    status,
    actions,
    ...(diagnostics === undefined ? {} : { diagnostics }),
    ...(controller === undefined ? {} : { controller }),
  };
}

function handleStreamDeckMessage(message: { data: unknown }): void {
  if (typeof message.data !== "string") {
    return;
  }

  const parsedMessage = parseJsonObject(message.data) as StreamDeckMessage;
  if (parsedMessage.event === "didReceiveSettings") {
    const nextSettings = settingsFromValue(parsedMessage.payload);
    const nextActionId = actionIdFromSettings(parsedMessage.payload);
    savedSettings = nextSettings;
    savedActionId = nextActionId;
    renderActionSelect();
    return;
  }

  if (
    parsedMessage.event !== "sendToPropertyInspector" ||
    !isJsonObject(parsedMessage.payload)
  ) {
    return;
  }
  const payload = parsedMessage.payload;
  if (payload.type === "inspectorFeedback") {
    if (
      (payload.kind !== "success" && payload.kind !== "error") ||
      typeof payload.message !== "string" ||
      payload.message.length === 0 ||
      !isFiniteNumber(payload.durationMs) ||
      payload.durationMs < 100 ||
      payload.durationMs > 10000
    ) {
      return;
    }
    feedbackGeneration += 1;
    const generation = feedbackGeneration;
    if (settingsStatus) {
      settingsStatus.textContent = payload.message;
      settingsStatus.setAttribute("data-feedback", payload.kind);
    }
    globalThis.setTimeout(() => {
      if (feedbackGeneration !== generation) return;
      setSettingsStatus("Settings are ready.");
    }, payload.durationMs);
    return;
  }

  const bridgeState = parseBridgeState(payload);
  if (!bridgeState) return;
  bridgeActions = bridgeState.actions;
  if (bridgeState.controller !== undefined)
    activeController = bridgeState.controller;
  setBridgeStatus(bridgeState.status, bridgeState.diagnostics);
  renderActionSelect();
}

function connectElgatoStreamDeckSocket(
  port: number | string,
  uuid: string,
  registerEvent: string,
  _info: string,
  actionInfo: string,
): void {
  const parsedActionInfo = parseJsonObject(actionInfo);
  const action =
    typeof parsedActionInfo.action === "string" &&
    parsedActionInfo.action.length > 0
      ? parsedActionInfo.action
      : DEFAULT_ACTION_UUID;
  const context = uuid;
  const previousConnection = inspectorConnection;
  inspectorConnection = undefined;
  inspectorSocketReady = false;
  renderSetupGuideButton();
  try {
    previousConnection?.socket.close();
  } catch {
    // The host may already have closed the superseded inspector socket.
  }
  savedSettings = settingsFromValue(parsedActionInfo.payload);
  savedActionId =
    parseInitialActionInfo(actionInfo) ||
    actionIdFromSettings(parsedActionInfo.payload);
  bridgeActions = [];
  activeController = "keypad";
  setBridgeStatus("connecting");
  renderActionSelect();

  const Socket = browserGlobal.WebSocket;
  if (!Socket) {
    setBridgeStatus("disconnected");
    renderActionSelect();
    renderSetupGuideButton();
    return;
  }

  const socket = new Socket(`ws://127.0.0.1:${port}`);
  const connection: InspectorConnection = { socket, action, context };
  inspectorConnection = connection;
  socket.onopen = () => {
    if (inspectorConnection !== connection) {
      return;
    }
    setBridgeStatus("connecting");
    inspectorSocketReady = true;
    renderSetupGuideButton();
    socket.send(JSON.stringify({ event: registerEvent, uuid }));
  };
  socket.onmessage = (message) => {
    if (inspectorConnection === connection) {
      handleStreamDeckMessage(message);
    }
  };
  socket.onerror = () => {
    if (inspectorConnection === connection) {
      inspectorConnection = undefined;
      setBridgeStatus("disconnected");
      bridgeActions = [];
      renderActionSelect();
      inspectorSocketReady = false;
      renderSetupGuideButton();
    }
  };
  socket.onclose = () => {
    if (inspectorConnection === connection) {
      inspectorConnection = undefined;
      setBridgeStatus("disconnected");
      bridgeActions = [];
      renderActionSelect();
      inspectorSocketReady = false;
      renderSetupGuideButton();
    }
  };
}

if (actionSelect) {
  actionSelect.addEventListener("change", saveActionId);
}
if (actionSearch) {
  actionSearch.addEventListener("input", () => {
    catalogFilter = actionSearch.value;
    renderActionSelect();
  });
  actionSearch.addEventListener("keydown", handleActionSearchKeydown);
}
if (resetActionButton) {
  resetActionButton.addEventListener("click", resetActionSettings);
}
if (setupGuideButton) {
  setupGuideButton.addEventListener("click", openSetupGuide);
}

browserGlobal.connectElgatoStreamDeckSocket = connectElgatoStreamDeckSocket;

export {};
