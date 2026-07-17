import { describe, expect, test } from "bun:test";

type Listener = () => void;

type FakeOption = {
  value: string;
  textContent: string | null;
  disabled: boolean;
};

type FakeChild = FakeOption | FakeElement;

class FakeElement {
  value = "";
  textContent: string | null = null;
  disabled = false;
  checked = false;
  type = "";
  min = "";
  max = "";
  step = "";
  maxLength = 0;
  children: FakeChild[] = [];
  private readonly listeners = new Map<string, Listener>();

  constructor(readonly tagName = "div") {}

  addEventListener(type: string, listener: Listener): void {
    this.listeners.set(type, listener);
  }

  replaceChildren(...children: FakeChild[]): void {
    this.children = children;
  }

  appendChild(child: FakeElement): void {
    this.children.push(child);
  }

  dispatch(type: string): void {
    this.listeners.get(type)?.();
  }
}

class FakeDocument {
  readonly actionSelect = new FakeElement("select");
  readonly connectionStatus = new FakeElement("p");
  readonly actionSettings = new FakeElement("section");
  readonly settingsStatus = new FakeElement("p");

  getElementById(id: string): FakeElement | null {
    if (id === "action-id") {
      return this.actionSelect;
    }
    if (id === "connection-status") {
      return this.connectionStatus;
    }
    if (id === "action-settings") {
      return this.actionSettings;
    }
    if (id === "settings-status") {
      return this.settingsStatus;
    }
    return null;
  }

  createElement(tagName: string): FakeElement | FakeOption {
    if (tagName === "option") {
      return { value: "", textContent: null, disabled: false };
    }
    return new FakeElement(tagName);
  }
}

type SocketHandler = (() => void) | null;
type MessageHandler = ((message: { data: unknown }) => void) | null;

class FakeSocket {
  static instances: FakeSocket[] = [];
  readonly url: string;
  readonly sent: string[] = [];
  onopen: SocketHandler = null;
  onerror: SocketHandler = null;
  onclose: SocketHandler = null;
  onmessage: MessageHandler = null;

  constructor(url: string) {
    this.url = url;
    FakeSocket.instances.push(this);
  }

  send(message: string): void {
    this.sent.push(message);
  }

  open(): void {
    this.onopen?.();
  }

  message(data: unknown): void {
    this.onmessage?.({ data });
  }

  error(): void {
    this.onerror?.();
  }

  close(): void {
    this.onclose?.();
  }
}

type TestEnvironment = {
  document: FakeDocument;
  connect: (...args: [number | string, string, string, string, string]) => void;
  socket: FakeSocket | undefined;
  restore: () => void;
};

let moduleInstance = 0;

async function installEnvironment(withWebSocket = true): Promise<TestEnvironment> {
  const document = new FakeDocument();
  const globals = globalThis as unknown as Record<string, unknown>;
  const keys = ["document", "WebSocket", "connectElgatoStreamDeckSocket"];
  const previous = new Map<string, PropertyDescriptor | undefined>();

  for (const key of keys) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
  }

  Object.defineProperty(globalThis, "document", {
    configurable: true,
    writable: true,
    value: document,
  });
  Object.defineProperty(globalThis, "WebSocket", {
    configurable: true,
    writable: true,
    value: withWebSocket ? FakeSocket : undefined,
  });

  await import(`../src/property-inspector.ts?test=${++moduleInstance}`);
  const connect = globals.connectElgatoStreamDeckSocket as TestEnvironment["connect"];

  return {
    document,
    connect,
    socket: undefined,
    restore: () => {
      for (const key of keys) {
        const descriptor = previous.get(key);
        if (descriptor) {
          Object.defineProperty(globalThis, key, descriptor);
        } else {
          delete globals[key];
        }
      }
      FakeSocket.instances = [];
    },
  };
}

function bridgeState(
  status: "disconnected" | "connecting" | "authenticating" | "connected",
  actions: Array<Record<string, unknown>>,
): string {
  return JSON.stringify({
    event: "sendToPropertyInspector",
    payload: { type: "bridgeState", status, actions },
  });
}

function action(actionId: string, name: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { actionId, name, ...extra };
}

function sentFrames(socket: FakeSocket): unknown[] {
  return socket.sent.map((frame) => JSON.parse(frame));
}

describe.serial("property inspector", () => {
  test("connects, renders bridge actions, updates settings, and saves a selection", async () => {
    const environment = await installEnvironment();
    try {
      environment.connect(
        28196,
        "fallback-context",
        "registerPropertyInspector",
        "ignored-info",
        JSON.stringify({
          context: "action-context",
          payload: { settings: { actionId: "action-two" } },
        }),
      );

      expect(environment.document.actionSelect.disabled).toBe(true);
      expect(environment.document.actionSelect.children).toEqual([
        { value: "", textContent: "No actions available", disabled: false },
      ]);
      expect(environment.document.connectionStatus.textContent).toBe("Connecting");
      expect(FakeSocket.instances).toHaveLength(1);
      const socket = FakeSocket.instances[0]!;
      expect(socket.url).toBe("ws://127.0.0.1:28196");

      socket.open();
      expect(sentFrames(socket)).toEqual([
        { event: "registerPropertyInspector", uuid: "fallback-context" },
        {
          event: "sendToPlugin",
          context: "action-context",
          payload: { type: "requestState" },
        },
      ]);

      socket.message(new Uint8Array([123]));
      socket.message("not-json");
      socket.message(JSON.stringify({ event: "unrelated", payload: {} }));
      expect(environment.document.connectionStatus.textContent).toBe("Connecting");

      socket.message(
        bridgeState("connected", [
          action("action-one", "First action"),
          action("action-two", "Second action", { settingsSchema: [] }),
        ]),
      );
      expect(environment.document.connectionStatus.textContent).toBe("Connected");
      expect(environment.document.actionSelect.disabled).toBe(false);
      expect(environment.document.actionSelect.value).toBe("action-two");
      expect(environment.document.actionSelect.children).toEqual([
        { value: "", textContent: "No action selected", disabled: false },
        { value: "action-one", textContent: "First action", disabled: false },
        { value: "action-two", textContent: "Second action", disabled: false },
      ]);

      socket.message(
        JSON.stringify({
          event: "didReceiveSettings",
          payload: { settings: { actionId: "action-one" } },
        }),
      );
      expect(environment.document.actionSelect.value).toBe("action-one");

      environment.document.actionSelect.value = "action-two";
      environment.document.actionSelect.dispatch("change");
      expect(sentFrames(socket).slice(-2)).toEqual([
        {
          event: "setSettings",
          context: "action-context",
          payload: { actionId: "action-two" },
        },
        {
          event: "sendToPlugin",
          context: "action-context",
          payload: { type: "requestState" },
        },
      ]);

      socket.message(JSON.stringify({ event: "didReceiveSettings", payload: {} }));
      expect(environment.document.actionSelect.value).toBe("");
    } finally {
      environment.restore();
    }
  });

  test("preserves the connected rendering when malformed or duplicate bridge state is received", async () => {
    const environment = await installEnvironment();
    try {
      environment.connect(
        "28196",
        "context-01",
        "register",
        "",
        JSON.stringify({ context: "context-01", payload: { settings: {} } }),
      );
      const firstSocket = FakeSocket.instances[0]!;
      firstSocket.open();
      firstSocket.message(bridgeState("connected", [action("known", "Known action")]));

      const expectedOptions = [
        { value: "", textContent: "No action selected", disabled: false },
        { value: "known", textContent: "Known action", disabled: false },
      ];
      const malformedMessages = [
        bridgeState("bogus" as "connected", []),
        JSON.stringify({ event: "sendToPropertyInspector", payload: { type: "bridgeState", status: "connected" } }),
        bridgeState("connected", [action("", "Blank id")]),
        bridgeState("connected", [action("known", "Duplicate", { settingsSchema: "invalid" })]),
        bridgeState("connected", [action("known", "Known action"), action("known", "Duplicate")]),
      ];
      for (const message of malformedMessages) {
        firstSocket.message(message);
      }
      expect(environment.document.connectionStatus.textContent).toBe("Connected");
      expect(environment.document.actionSelect.children).toEqual(expectedOptions);

      environment.connect(28197, "context-02", "registerAgain", "", "{}");
      const secondSocket = FakeSocket.instances[1]!;
      firstSocket.error();
      firstSocket.close();
      expect(environment.document.connectionStatus.textContent).toBe("Connecting");
      secondSocket.open();
      secondSocket.message(bridgeState("connected", [action("new", "New action")]));
      expect(environment.document.actionSelect.children[1]).toEqual({
        value: "new",
        textContent: "New action",
        disabled: false,
      });
      expect(environment.document.connectionStatus.textContent).toBe("Connected");

      firstSocket.error();
      firstSocket.close();
      expect(environment.document.connectionStatus.textContent).toBe("Connected");
      expect(environment.document.actionSelect.children).toEqual([
        { value: "", textContent: "No action selected", disabled: false },
        { value: "new", textContent: "New action", disabled: false },
      ]);
    } finally {
      environment.restore();
    }
  });

  test("renders a saved action that is no longer advertised as unavailable", async () => {
    const environment = await installEnvironment();
    try {
      environment.connect(
        28196,
        "context-01",
        "register",
        "",
        JSON.stringify({ context: "context-01", payload: { settings: { actionId: "removed" } } }),
      );
      const socket = FakeSocket.instances[0]!;
      socket.open();
      socket.message(bridgeState("connected", [action("current", "Current action")]));

      expect(environment.document.actionSelect.value).toBe("removed");
      expect(environment.document.actionSelect.children).toEqual([
        { value: "", textContent: "No action selected", disabled: false },
        { value: "current", textContent: "Current action", disabled: false },
        { value: "removed", textContent: "Unavailable: removed", disabled: true },
      ]);
      expect(environment.document.actionSelect.disabled).toBe(false);
    } finally {
      environment.restore();
    }
  });

  test("moves to offline and clears actions on socket failure and close", async () => {
    const environment = await installEnvironment();
    try {
      environment.connect(28196, "context-01", "register", "", "{}");
      const socket = FakeSocket.instances[0]!;
      socket.open();
      socket.message(bridgeState("connected", [action("current", "Current action")]));
      socket.error();
      expect(environment.document.connectionStatus.textContent).toBe("Offline");
      expect(environment.document.actionSelect.disabled).toBe(true);
      expect(environment.document.actionSelect.children).toEqual([
        { value: "", textContent: "No actions available", disabled: false },
      ]);

      socket.close();
      expect(environment.document.connectionStatus.textContent).toBe("Offline");
      expect(environment.document.actionSelect.disabled).toBe(true);
    } finally {
      environment.restore();
    }
  });

  test("renders offline when WebSocket is unavailable and falls back to the UUID context", async () => {
    const environment = await installEnvironment(false);
    try {
      environment.connect(28196, "uuid-context", "register", "", "not-json");
      expect(FakeSocket.instances).toHaveLength(0);
      expect(environment.document.connectionStatus.textContent).toBe("Offline");
      expect(environment.document.actionSelect.disabled).toBe(true);
      expect(environment.document.actionSelect.children).toEqual([
        { value: "", textContent: "No actions available", disabled: false },
      ]);

      environment.document.actionSelect.value = "anything";
      environment.document.actionSelect.dispatch("change");
      expect(environment.document.actionSelect.value).toBe("anything");
    } finally {
      environment.restore();
    }
  });

  test("uses the UUID context when actionInfo has no context", async () => {
    const environment = await installEnvironment();
    try {
      environment.connect(
        28196,
        "uuid-context",
        "registerPropertyInspector",
        "",
        JSON.stringify({ payload: { settings: {} } }),
      );
      const socket = FakeSocket.instances[0]!;
      socket.open();

      expect(sentFrames(socket)).toEqual([
        { event: "registerPropertyInspector", uuid: "uuid-context" },
        {
          event: "sendToPlugin",
          context: "uuid-context",
          payload: { type: "requestState" },
        },
      ]);
    } finally {
      environment.restore();
    }
  });
  test("renders connected actions with version 1 settings schema metadata", async () => {
    const environment = await installEnvironment();
    try {
      environment.connect(
        28196,
        "context-01",
        "register",
        "",
        JSON.stringify({ context: "context-01", payload: { settings: {} } }),
      );
      const socket = FakeSocket.instances[0]!;
      socket.open();
      socket.message(
        bridgeState("connected", [
          action("schema-action", "Schema action", {
            settingsSchema: [{ type: "string", key: "label" }],
            settingsSchemaVersion: 1,
          }),
        ]),
      );

      expect(environment.document.connectionStatus.textContent).toBe("Connected");
      expect(environment.document.actionSelect.disabled).toBe(false);
      expect(environment.document.actionSelect.children).toEqual([
        { value: "", textContent: "No action selected", disabled: false },
        { value: "schema-action", textContent: "Schema action", disabled: false },
      ]);
    } finally {
      environment.restore();
    }
  });

  test("ignores supported but unsupported schema versions while retaining valid actions", async () => {
    const environment = await installEnvironment();
    try {
      environment.connect(28196, "context-01", "register", "", "{}");
      const socket = FakeSocket.instances[0]!;
      socket.open();
      socket.message(
        bridgeState("connected", [
          action("future-two", "Future two", { settingsSchemaVersion: 2 }),
          action("current", "Current action", { settingsSchemaVersion: 1 }),
          action("future-sixteen", "Future sixteen", { settingsSchemaVersion: 16 }),
        ]),
      );

      expect(environment.document.connectionStatus.textContent).toBe("Connected");
      expect(environment.document.actionSelect.disabled).toBe(false);
      expect(environment.document.actionSelect.children).toEqual([
        { value: "", textContent: "No action selected", disabled: false },
        { value: "current", textContent: "Current action", disabled: false },
      ]);
    } finally {
      environment.restore();
    }
  });

  test("rejects invalid schema versions without changing the connected rendering", async () => {
    const environment = await installEnvironment();
    try {
      environment.connect(28196, "context-01", "register", "", "{}");
      const socket = FakeSocket.instances[0]!;
      socket.open();
      socket.message(bridgeState("connected", [action("known", "Known action")]));

      const expectedOptions = [
        { value: "", textContent: "No action selected", disabled: false },
        { value: "known", textContent: "Known action", disabled: false },
      ];
      const invalidVersions: unknown[] = [0, 17, 1.5, "1"];
      for (const settingsSchemaVersion of invalidVersions) {
        socket.message(
          bridgeState("connected", [
            action("replacement", "Replacement", { settingsSchemaVersion }),
            action("known", "Known action"),
          ]),
        );
        expect(environment.document.connectionStatus.textContent).toBe("Connected");
        expect(environment.document.actionSelect.disabled).toBe(false);
        expect(environment.document.actionSelect.children).toEqual(expectedOptions);
      }
    } finally {
      environment.restore();
    }
  });

  test("renders connected state with no actions as a disabled no-actions option", async () => {
    const environment = await installEnvironment();
    try {
      environment.connect(28196, "context-01", "register", "", "{}");
      const socket = FakeSocket.instances[0]!;
      socket.open();
      socket.message(bridgeState("connected", []));

      expect(environment.document.connectionStatus.textContent).toBe("Connected");
      expect(environment.document.actionSelect.disabled).toBe(true);
      expect(environment.document.actionSelect.children).toEqual([
        { value: "", textContent: "No actions available", disabled: false },
      ]);
    } finally {
      environment.restore();
    }
  });
  test("renders supported controls with defaults and constraints and preserves opaque settings", async () => {
    const environment = await installEnvironment();
    try {
      environment.connect(
        28196,
        "context-01",
        "register",
        "",
        JSON.stringify({
          context: "context-01",
          payload: { settings: { actionId: "schema", text: "init", opaque: { keep: true } } },
        }),
      );
      const socket = FakeSocket.instances[0]!;
      socket.open();
      socket.message(
        bridgeState("connected", [
          action("schema", "Schema", {
            settingsSchemaVersion: 1,
            settingsSchema: [
              { type: "text", key: "text", label: "Text", default: "default", minLength: 2, maxLength: 5 },
              { type: "number", key: "count", label: "Count", default: 4, min: 0, max: 10, step: 2 },
              { type: "boolean", key: "enabled", label: "Enabled", default: true },
              {
                type: "select",
                key: "mode",
                label: "Mode",
                default: "one",
                options: [
                  { value: "one", label: "One" },
                  { value: "two", label: "Two" },
                ],
              },
            ],
          }),
        ]),
      );
      socket.message(
        JSON.stringify({
          event: "didReceiveSettings",
          payload: { settings: { actionId: "schema", text: "init", opaque: { keep: true } } },
        }),
      );

      expect(environment.document.actionSettings.children).toHaveLength(4);
      const text = (environment.document.actionSettings.children[0] as FakeElement).children[0] as FakeElement;
      const count = (environment.document.actionSettings.children[1] as FakeElement).children[0] as FakeElement;
      const enabled = (environment.document.actionSettings.children[2] as FakeElement).children[0] as FakeElement;
      const mode = (environment.document.actionSettings.children[3] as FakeElement).children[0] as FakeElement;
      expect(text.value).toBe("init");
      expect(text.maxLength).toBe(5);
      expect(count.value).toBe("4");
      expect(count.min).toBe("0");
      expect(count.max).toBe("10");
      expect(count.step).toBe("2");
      expect(enabled.checked).toBe(true);
      expect(mode.value).toBe("one");

      text.value = "too-long";
      text.dispatch("change");
      expect(environment.document.settingsStatus.textContent).toContain("invalid");
      expect(sentFrames(socket).filter((frame) => (frame as { event?: unknown }).event === "setSettings")).toHaveLength(0);

      text.value = "ok";
      count.value = "6";
      enabled.checked = false;
      mode.value = "two";
      text.dispatch("change");
      count.dispatch("change");
      enabled.dispatch("change");
      mode.dispatch("change");
      const frames = sentFrames(socket).filter((frame) => (frame as { event?: unknown }).event === "setSettings");
      expect(frames.at(-1)).toEqual({
        event: "setSettings",
        context: "context-01",
        payload: {
          actionId: "schema",
          text: "ok",
          count: 6,
          enabled: false,
          mode: "two",
          opaque: { keep: true },
        },
      });
    } finally {
      environment.restore();
    }
  });

  test("didReceiveSettings round-trips per-instance values and rejects wrong types", async () => {
    const environment = await installEnvironment();
    try {
      environment.connect(28196, "context-01", "register", "", "{}");
      const socket = FakeSocket.instances[0]!;
      socket.open();
      socket.message(
        bridgeState("connected", [
          action("schema", "Schema", {
            settingsSchemaVersion: 1,
            settingsSchema: [
              { type: "text", key: "label", default: "Default" },
              { type: "number", key: "count", min: 1, max: 5, default: 2 },
            ],
          }),
        ]),
      );
      socket.message(
        JSON.stringify({
          event: "didReceiveSettings",
          payload: { settings: { actionId: "schema", label: "Instance", count: "wrong", opaque: ["preserve"] } },
        }),
      );

      const label = (environment.document.actionSettings.children[0] as FakeElement).children[0] as FakeElement;
      const count = (environment.document.actionSettings.children[1] as FakeElement).children[0] as FakeElement;
      expect(label.value).toBe("Instance");
      expect(count.value).toBe("2");
      expect(environment.document.settingsStatus.textContent).toContain("invalid saved value");

      count.value = "4";
      count.dispatch("change");
      const frames = sentFrames(socket).filter((frame) => (frame as { event?: unknown }).event === "setSettings");
      expect(frames.at(-1)).toEqual({
        event: "setSettings",
        context: "context-01",
        payload: {
          actionId: "schema",
          label: "Instance",
          count: 4,
          opaque: ["preserve"],
        },
      });
    } finally {
      environment.restore();
    }
  });

  test("clearly reports unsupported fields without disabling valid action selection", async () => {
    const environment = await installEnvironment();
    try {
      environment.connect(28196, "context-01", "register", "", "{}");
      const socket = FakeSocket.instances[0]!;
      socket.open();
      socket.message(
        bridgeState("connected", [
          action("unsupported", "Unsupported", {
            settingsSchemaVersion: 1,
            settingsSchema: [{ type: "string", key: "legacy" }],
          }),
          action("valid", "Valid"),
        ]),
      );
      environment.document.actionSelect.value = "unsupported";
      environment.document.actionSelect.dispatch("change");
      expect(environment.document.settingsStatus.textContent).toContain("Unsupported settings field");
      expect(environment.document.actionSettings.children).toHaveLength(1);
      expect((environment.document.actionSettings.children[0] as FakeElement).disabled).toBe(true);

      environment.document.actionSelect.value = "valid";
      environment.document.actionSelect.dispatch("change");
      expect(environment.document.settingsStatus.textContent).toBe("No additional settings.");
      expect(environment.document.actionSelect.disabled).toBe(false);
    } finally {
      environment.restore();
    }
  });
});
