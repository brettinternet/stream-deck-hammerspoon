import { parseInitialActionInfo } from "./property-inspector-state";

type JsonObject = Record<string, unknown>;

type ElementLike = {
  value: string;
  textContent: string | null;
  disabled?: boolean;
  addEventListener(type: string, listener: () => void): void;
  replaceChildren(...children: ElementLike[]): void;
};

type DocumentLike = {
  getElementById(id: string): ElementLike | null;
  createElement(tagName: string): ElementLike;
};

type StreamDeckSocket = {
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

type StreamDeckMessage = {
  event?: unknown;
  payload?: unknown;
};

type BridgeStatus = "disconnected" | "connecting" | "authenticating" | "connected";

type BridgeAction = {
  actionId: string;
  name: string;
  settingsSchema?: unknown[];
  settingsSchemaVersion?: number;
};

const browserGlobal = globalThis as unknown as BrowserGlobal;
const documentLike = browserGlobal.document;
const actionSelect = documentLike?.getElementById("action-id");
const connectionStatus = documentLike?.getElementById("connection-status");

let streamDeckSocket: StreamDeckSocket | undefined;
let actionContext = "";
let savedActionId = "";
let bridgeStatus: BridgeStatus = "connecting";
let bridgeActions: BridgeAction[] = [];

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null;
}

function parseJsonObject(value: string): JsonObject {
  try {
    const parsed: unknown = JSON.parse(value);
    return isJsonObject(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function setStatus(message: string): void {
  if (connectionStatus) {
    connectionStatus.textContent = message;
  }
}

function setBridgeStatus(status: BridgeStatus): void {
  bridgeStatus = status;
  if (status === "connected") {
    setStatus("Connected");
  } else if (status === "connecting" || status === "authenticating") {
    setStatus("Connecting");
  } else {
    setStatus("Offline");
  }
}

function actionIdFromSettings(value: unknown): string {
  if (!isJsonObject(value)) {
    return "";
  }

  const settings = "settings" in value ? value.settings : value;
  if (!isJsonObject(settings) || typeof settings.actionId !== "string") {
    return "";
  }

  return settings.actionId;
}

function createOption(value: string, text: string, disabled = false): ElementLike {
  if (!documentLike) {
    throw new Error("Property inspector document is unavailable");
  }

  const option = documentLike.createElement("option");
  option.value = value;
  option.textContent = text;
  option.disabled = disabled;
  return option;
}

function renderActionSelect(): void {
  if (!actionSelect || !documentLike) {
    return;
  }

  const unavailable = bridgeActions.length === 0 || bridgeStatus !== "connected";
  if (unavailable) {
    actionSelect.replaceChildren(createOption("", bridgeActions.length === 0 ? "No actions available" : "Offline"));
    actionSelect.value = "";
    actionSelect.disabled = true;
    return;
  }

  const options: ElementLike[] = [createOption("", "No action selected")];
  let savedActionAvailable = savedActionId.length === 0;

  for (const action of bridgeActions) {
    options.push(createOption(action.actionId, action.name));
    if (action.actionId === savedActionId) {
      savedActionAvailable = true;
    }
  }

  if (savedActionId && !savedActionAvailable) {
    options.push(createOption(savedActionId, `Unavailable: ${savedActionId}`, true));
  }

  actionSelect.replaceChildren(...options);
  actionSelect.value = savedActionId;
  actionSelect.disabled = false;
}

function sendRequestState(): void {
  if (!streamDeckSocket || !actionContext) {
    return;
  }

  streamDeckSocket.send(
    JSON.stringify({
      event: "sendToPlugin",
      context: actionContext,
      payload: { type: "requestState" },
    }),
  );
}

function saveActionId(): void {
  if (!actionSelect) {
    return;
  }

  if (!streamDeckSocket || !actionContext || bridgeStatus !== "connected") {
    return;
  }

  savedActionId = actionSelect.value;
  streamDeckSocket.send(
    JSON.stringify({
      event: "setSettings",
      context: actionContext,
      payload: { actionId: savedActionId },
    }),
  );
  sendRequestState();
}

function parseBridgeState(value: unknown): {
  status: BridgeStatus;
  actions: BridgeAction[];
} | undefined {
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
      ("settingsSchema" in item && !Array.isArray(item.settingsSchema)) ||
      ("settingsSchemaVersion" in item &&
        (typeof item.settingsSchemaVersion !== "number" ||
          !Number.isInteger(item.settingsSchemaVersion) ||
          item.settingsSchemaVersion < 1 ||
          item.settingsSchemaVersion > 16))
    ) {
      return undefined;
    }
    if (item.settingsSchemaVersion !== undefined && item.settingsSchemaVersion !== 1) {
      continue;
    }

    if (actionIds.has(item.actionId)) {
      return undefined;
    }
    actionIds.add(item.actionId);
    actions.push({
      actionId: item.actionId,
      name: item.name,
      ...(Array.isArray(item.settingsSchema) ? { settingsSchema: item.settingsSchema } : {}),
      ...(typeof item.settingsSchemaVersion === "number"
        ? { settingsSchemaVersion: item.settingsSchemaVersion }
        : {}),
    });
  }

  return { status, actions };
}

function handleStreamDeckMessage(message: { data: unknown }): void {
  if (typeof message.data !== "string") {
    return;
  }

  const parsedMessage = parseJsonObject(message.data) as StreamDeckMessage;
  if (parsedMessage.event === "didReceiveSettings") {
    savedActionId = actionIdFromSettings(parsedMessage.payload);
    renderActionSelect();
    return;
  }

  if (parsedMessage.event !== "sendToPropertyInspector") {
    return;
  }

  const bridgeState = parseBridgeState(parsedMessage.payload);
  if (!bridgeState) {
    return;
  }

  bridgeActions = bridgeState.actions;
  setBridgeStatus(bridgeState.status);
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
  actionContext =
    typeof parsedActionInfo.context === "string" ? parsedActionInfo.context : uuid;
  const initialActionId = parseInitialActionInfo(actionInfo);
  if (initialActionId) {
    savedActionId = initialActionId;
  }
  bridgeActions = [];
  setBridgeStatus("connecting");
  renderActionSelect();

  const Socket = browserGlobal.WebSocket;
  if (!Socket) {
    setBridgeStatus("disconnected");
    renderActionSelect();
    return;
  }

  const socket = new Socket(`ws://127.0.0.1:${port}`);
  streamDeckSocket = socket;
  socket.onopen = () => {
    setBridgeStatus("connecting");
    socket.send(JSON.stringify({ event: registerEvent, uuid }));
    sendRequestState();
  };
  socket.onmessage = handleStreamDeckMessage;
  socket.onerror = () => {
    if (streamDeckSocket === socket) {
      setBridgeStatus("disconnected");
      bridgeActions = [];
      renderActionSelect();
    }
  };
  socket.onclose = () => {
    if (streamDeckSocket === socket) {
      streamDeckSocket = undefined;
      setBridgeStatus("disconnected");
      bridgeActions = [];
      renderActionSelect();
    }
  };
}

if (actionSelect) {
  actionSelect.addEventListener("change", saveActionId);
}

browserGlobal.connectElgatoStreamDeckSocket = connectElgatoStreamDeckSocket;

export {};
