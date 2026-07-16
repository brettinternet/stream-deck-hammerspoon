type JsonObject = Record<string, unknown>;

type ElementLike = {
  value: string;
  textContent: string | null;
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

const browserGlobal = globalThis as unknown as BrowserGlobal;
const documentLike = browserGlobal.document;
const actionSelect = documentLike?.getElementById("action-id");
const connectionStatus = documentLike?.getElementById("connection-status");

let streamDeckSocket: StreamDeckSocket | undefined;
let actionContext = "";

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

function renderActionId(actionId: string): void {
  if (!actionSelect || !documentLike) {
    return;
  }

  const emptyOption = documentLike.createElement("option");
  emptyOption.value = "";
  emptyOption.textContent = "No action selected";

  const options: ElementLike[] = [emptyOption];
  const normalizedActionId = actionId.trim();
  if (normalizedActionId) {
    const actionOption = documentLike.createElement("option");
    actionOption.value = normalizedActionId;
    actionOption.textContent = normalizedActionId;
    options.push(actionOption);
  }

  actionSelect.replaceChildren(...options);
  actionSelect.value = normalizedActionId;
}

function saveActionId(): void {
  if (!actionSelect) {
    return;
  }

  if (!streamDeckSocket || !actionContext) {
    setStatus("Not connected to Stream Deck");
    return;
  }

  const actionId = actionSelect.value;
  streamDeckSocket.send(
    JSON.stringify({
      event: "setSettings",
      context: actionContext,
      payload: { actionId },
    }),
  );
  setStatus("Settings saved");
}

function handleStreamDeckMessage(message: { data: unknown }): void {
  if (typeof message.data !== "string") {
    return;
  }

  const parsedMessage = parseJsonObject(message.data) as StreamDeckMessage;
  if (parsedMessage.event !== "didReceiveSettings") {
    return;
  }

  renderActionId(actionIdFromSettings(parsedMessage.payload));
  setStatus("Connected to Stream Deck");
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
  renderActionId(actionIdFromSettings(parsedActionInfo.settings));

  const Socket = browserGlobal.WebSocket;
  if (!Socket) {
    setStatus("Stream Deck websocket is unavailable");
    return;
  }

  const socket = new Socket(`ws://127.0.0.1:${port}`);
  streamDeckSocket = socket;
  socket.onopen = () => {
    socket.send(JSON.stringify({ event: registerEvent, uuid }));
    setStatus("Connected to Stream Deck");
  };
  socket.onmessage = handleStreamDeckMessage;
  socket.onerror = () => setStatus("Stream Deck connection error");
  socket.onclose = () => {
    if (streamDeckSocket === socket) {
      streamDeckSocket = undefined;
    }
    setStatus("Disconnected from Stream Deck");
  };
}

if (actionSelect) {
  actionSelect.addEventListener("change", saveActionId);
}

browserGlobal.connectElgatoStreamDeckSocket = connectElgatoStreamDeckSocket;

export {};
