import { readFile } from "node:fs/promises";
import { describe, expect, test, vi } from "bun:test";

type FakeKeyboardEvent = {
  key?: string;
  altKey?: boolean;
  defaultPrevented: boolean;
  preventDefault(): void;
};

type Listener = (event?: FakeKeyboardEvent) => void;

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
  minLength = 0;
  children: FakeChild[] = [];
  readonly attributes = new Map<string, string>();
  private readonly listeners = new Map<string, Listener>();
  focusCalls = 0;
  showPickerCalls = 0;

  constructor(readonly tagName = "div") {}

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  removeAttribute(name: string): void {
    this.attributes.delete(name);
  }

  addEventListener(type: string, listener: Listener): void {
    this.listeners.set(type, listener);
  }


  focus(): void {
    this.focusCalls += 1;
  }

  showPicker(): void {
    this.showPickerCalls += 1;
  }

  replaceChildren(...children: FakeChild[]): void {
    this.children = children;
  }

  appendChild(child: FakeElement): void {
    this.children.push(child);
  }

  dispatch(type: string, event: Partial<FakeKeyboardEvent> = {}): FakeKeyboardEvent {
    const dispatched: FakeKeyboardEvent = {
      defaultPrevented: false,
      preventDefault: () => {
        dispatched.defaultPrevented = true;
      },
      ...event,
    };
    this.listeners.get(type)?.(dispatched);
    return dispatched;
  }
}

class FakeDocument {
  readonly actionSelect = new FakeElement("select");
  readonly actionSearch = new FakeElement("input");
  readonly actionGestures = new FakeElement("p");
  readonly actionDescription = new FakeElement("p");
  readonly connectionStatus = new FakeElement("p");
  readonly connectionDetails = new FakeElement("p");
  readonly setupGuideButton = new FakeElement("button");
  readonly actionSettings = new FakeElement("section");
  readonly settingsStatus = new FakeElement("p");
  readonly resetActionButton = new FakeElement("button");
  getElementById(id: string): FakeElement | null {
    if (id === "action-id") return this.actionSelect;
    if (id === "action-search") return this.actionSearch;
    if (id === "action-description") return this.actionDescription;
    if (id === "action-gestures") return this.actionGestures;
    if (id === "connection-status") return this.connectionStatus;
    if (id === "connection-details") return this.connectionDetails;
    if (id === "setup-guide") return this.setupGuideButton;
    if (id === "action-settings") return this.actionSettings;
    if (id === "settings-status") return this.settingsStatus;
    if (id === "reset-action") return this.resetActionButton;
    return null;
  }

  createElement(tagName: string): FakeElement | FakeOption {
    if (tagName === "option")
      return { value: "", textContent: null, disabled: false };
    return new FakeElement(tagName);
  }
}

type SocketHandler = (() => void) | null;
type MessageHandler = ((message: { data: unknown }) => void) | null;

class FakeSocket {
  static instances: FakeSocket[] = [];
  readonly url: string;
  readonly sent: string[] = [];
  closeCalls = 0;
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
    this.closeCalls += 1;
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

async function installEnvironment(
  withWebSocket = true,
): Promise<TestEnvironment> {
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
  const connect =
    globals.connectElgatoStreamDeckSocket as TestEnvironment["connect"];

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
  diagnostics?: Record<string, unknown>,
): string {
  return JSON.stringify({
    event: "sendToPropertyInspector",
    payload: {
      type: "bridgeState",
      status,
      actions,
      ...(diagnostics === undefined ? {} : { diagnostics }),
    },
  });
}

function action(
  actionId: string,
  name: string,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return { actionId, name, ...extra };
}

function sentFrames(socket: FakeSocket): Array<Record<string, unknown>> {
  return socket.sent.map(
    (frame) => JSON.parse(frame) as Record<string, unknown>,
  );
}

test("documents action search keyboard handoff", async () => {
  const markup = await readFile(
    new URL("../com.brettinternet.hammerspoon.sdPlugin/ui/property-inspector.html", import.meta.url),
    "utf8",
  );

  expect(markup).toContain('aria-controls="action-id"');
  expect(markup).toContain('aria-describedby="action-search-hint"');
  expect(markup).toContain('id="action-search-hint"');
  expect(markup).toContain(
    'aria-describedby="action-search-hint action-description connection-status connection-details"',
  );
});

describe.serial("property inspector", () => {
  test("uses the inspected action UUID for settings commands", async () => {
    const environment = await installEnvironment();
    try {
      environment.connect(
        28196,
        "fallback-context",
        "registerPropertyInspector",
        "ignored-info",
        JSON.stringify({
          action: "com.brettinternet.hammerspoon.button",
          context: "action-context",
          payload: { settings: { actionId: "action-two" } },
        }),
      );

      expect(environment.document.actionSelect.disabled).toBe(true);
      expect(environment.document.actionSelect.children).toEqual([
        { value: "", textContent: "No actions available", disabled: false },
      ]);
      expect(environment.document.connectionStatus.textContent).toBe(
        "Connecting",
      );
      expect(FakeSocket.instances).toHaveLength(1);
      const socket = FakeSocket.instances[0]!;
      expect(socket.url).toBe("ws://127.0.0.1:28196");

      socket.open();
      expect(sentFrames(socket)).toEqual([
        { event: "registerPropertyInspector", uuid: "fallback-context" },
      ]);

      socket.message(new Uint8Array([123]));
      socket.message("not-json");
      socket.message(JSON.stringify({ event: "unrelated", payload: {} }));
      expect(environment.document.connectionStatus.textContent).toBe(
        "Connecting",
      );

      socket.message(bridgeState("connected", []));
      expect(environment.document.connectionStatus.textContent).toBe(
        "Connected",
      );
      expect(environment.document.actionSelect.disabled).toBe(true);
      expect(environment.document.actionSelect.value).toBe("action-two");
      expect(environment.document.actionSelect.children).toEqual([
        {
          value: "action-two",
          textContent: "Loading actions...",
          disabled: true,
        },
      ]);
      socket.message(
        bridgeState("connected", [
          action("action-one", "First action", {
            description: "Runs the first action.",
          }),
          action("action-two", "Second action", {
            description: "Runs the second action.",
            settingsSchema: [],
          }),
        ]),
      );
      expect(environment.document.connectionStatus.textContent).toBe(
        "Connected",
      );
      expect(environment.document.actionSelect.disabled).toBe(false);
      expect(environment.document.actionSelect.value).toBe("action-two");
      expect(environment.document.actionSelect.children).toEqual([
        { value: "", textContent: "No action selected", disabled: false },
        { value: "action-one", textContent: "First action", disabled: false },
        { value: "action-two", textContent: "Second action", disabled: false },
      ]);
      expect(environment.document.actionDescription.textContent).toBe(
        "Runs the second action.",
      );

      socket.message(
        JSON.stringify({
          event: "didReceiveSettings",
          payload: { settings: { actionId: "action-one" } },
        }),
      );
      expect(environment.document.actionSelect.value).toBe("action-one");
      expect(environment.document.actionDescription.textContent).toBe(
        "Runs the first action.",
      );

      environment.document.actionSelect.value = "action-two";
      environment.document.actionSelect.dispatch("change");
      expect(environment.document.actionSelect.value).toBe("action-two");
      expect(environment.document.actionDescription.textContent).toBe(
        "Runs the second action.",
      );
      expect(sentFrames(socket).slice(-1)).toEqual([
        {
          action: "com.brettinternet.hammerspoon.button",
          event: "setSettings",
          context: "fallback-context",
          payload: { actionId: "action-two" },
        },
      ]);

      socket.message(
        JSON.stringify({ event: "didReceiveSettings", payload: {} }),
      );
      expect(environment.document.actionSelect.value).toBe("");
      expect(environment.document.actionDescription.textContent).toBe("");
    } finally {
      environment.restore();
    }
  });

  test("lists a configured action with a version 1 settings schema", async () => {
    const environment = await installEnvironment();
    try {
      environment.connect(
        28197,
        "context-schema",
        "register",
        "",
        JSON.stringify({
          context: "context-schema",
          payload: {
            settings: {
              actionId: "com.brettinternet.hammerspoon.system-monitor",
            },
          },
        }),
      );
      const socket = FakeSocket.instances[0]!;
      socket.open();
      socket.message(
        bridgeState("connected", [
          action(
            "com.brettinternet.hammerspoon.system-monitor",
            "System monitor",
            {
              settingsSchemaVersion: 1,
              settingsSchema: [
                {
                  type: "select",
                  key: "metric",
                  options: [
                    { value: "cpu", label: "CPU" },
                    { value: "memory", label: "Memory" },
                  ],
                  default: "cpu",
                },
              ],
            },
          ),
        ]),
      );
      expect(environment.document.actionSelect.value).toBe(
        "com.brettinternet.hammerspoon.system-monitor",
      );
      expect(environment.document.actionSelect.children).toContainEqual({
        value: "com.brettinternet.hammerspoon.system-monitor",
        textContent: "System monitor",
        disabled: false,
      });
    } finally {
      environment.restore();
    }
  });
  test("opens the setup guide through the Stream Deck UI socket", async () => {
    const environment = await installEnvironment();
    try {
      environment.connect(
        28196,
        "context-setup",
        "registerPropertyInspector",
        "",
        "{}",
      );
      const socket = FakeSocket.instances[0]!;
      expect(environment.document.setupGuideButton.disabled).toBe(true);

      socket.open();
      expect(environment.document.setupGuideButton.disabled).toBe(false);
      environment.document.setupGuideButton.dispatch("click");

      expect(sentFrames(socket)).toEqual([
        { event: "registerPropertyInspector", uuid: "context-setup" },
        {
          event: "openUrl",
          payload: {
            url: "https://github.com/brettinternet/stream-deck-hammerspoon/blob/main/docs/setup.md",
          },
        },
      ]);
    } finally {
      environment.restore();
    }
  });

  test("disables the setup guide when the Stream Deck UI socket fails or closes", async () => {
    const environment = await installEnvironment();
    try {
      environment.connect(
        28196,
        "context-setup-lifecycle",
        "registerPropertyInspector",
        "",
        "{}",
      );
      const socket = FakeSocket.instances[0]!;

      socket.open();
      expect(environment.document.setupGuideButton.disabled).toBe(false);

      socket.error();
      expect(environment.document.setupGuideButton.disabled).toBe(true);

      environment.connect(
        28196,
        "context-setup-lifecycle-2",
        "registerPropertyInspector",
        "",
        "{}",
      );
      const secondSocket = FakeSocket.instances[1]!;

      secondSocket.open();
      expect(environment.document.setupGuideButton.disabled).toBe(false);

      secondSocket.close();
      expect(environment.document.setupGuideButton.disabled).toBe(true);
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
        JSON.stringify({
          context: "context-01",
          payload: { settings: { actionId: "known" } },
        }),
      );
      const firstSocket = FakeSocket.instances[0]!;
      firstSocket.open();
      firstSocket.message(
        bridgeState("connected", [
          action("known", "Known action", { description: "Known description" }),
        ]),
      );
      expect(environment.document.actionDescription.textContent).toBe(
        "Known description",
      );

      const expectedOptions = [
        { value: "", textContent: "No action selected", disabled: false },
        { value: "known", textContent: "Known action", disabled: false },
      ];
      const malformedMessages = [
        bridgeState("bogus" as "connected", []),
        JSON.stringify({
          event: "sendToPropertyInspector",
          payload: { type: "bridgeState", status: "connected" },
        }),
        bridgeState("connected", [action("", "Blank id")]),
        bridgeState("connected", [
          action("known", "Known action", { description: "" }),
        ]),
        bridgeState("connected", [
          action("known", "Duplicate", { settingsSchema: "invalid" }),
        ]),
        bridgeState("connected", [
          action("known", "Known action"),
          action("known", "Duplicate"),
        ]),
      ];
      for (const message of malformedMessages) {
        firstSocket.message(message);
      }
      expect(environment.document.connectionStatus.textContent).toBe(
        "Connected",
      );
      expect(environment.document.actionSelect.children).toEqual(
        expectedOptions,
      );
      expect(environment.document.actionDescription.textContent).toBe(
        "Known description",
      );

      environment.connect(28197, "context-02", "registerAgain", "", "{}");
      const secondSocket = FakeSocket.instances[1]!;
      firstSocket.error();
      firstSocket.close();
      expect(environment.document.connectionStatus.textContent).toBe(
        "Connecting",
      );
      secondSocket.open();
      secondSocket.message(
        bridgeState("connected", [action("new", "New action")]),
      );
      expect(environment.document.actionSelect.children[1]).toEqual({
        value: "new",
        textContent: "New action",
        disabled: false,
      });
      expect(environment.document.connectionStatus.textContent).toBe(
        "Connected",
      );

      firstSocket.error();
      firstSocket.close();
      expect(environment.document.connectionStatus.textContent).toBe(
        "Connected",
      );
      expect(environment.document.actionSelect.children).toEqual([
        { value: "", textContent: "No action selected", disabled: false },
        { value: "new", textContent: "New action", disabled: false },
      ]);
    } finally {
      environment.restore();
    }
  });
  test("ignores messages from superseded property inspector sockets", async () => {
    const environment = await installEnvironment();
    try {
      environment.connect(
        28196,
        "context-01",
        "register",
        "",
        JSON.stringify({
          context: "context-01",
          payload: { settings: { actionId: "old" } },
        }),
      );
      const firstSocket = FakeSocket.instances[0]!;
      firstSocket.open();
      firstSocket.message(
        bridgeState("connected", [action("old", "Old action")]),
      );
      expect(environment.document.actionSelect.value).toBe("old");

      environment.connect(
        28197,
        "context-02",
        "registerAgain",
        "",
        JSON.stringify({ context: "context-02", payload: { settings: {} } }),
      );
      const secondSocket = FakeSocket.instances[1]!;
      expect(firstSocket.closeCalls).toBe(1);
      firstSocket.open();
      firstSocket.message(
        JSON.stringify({
          event: "didReceiveSettings",
          payload: { settings: { actionId: "old" } },
        }),
      );
      firstSocket.message(
        bridgeState("connected", [action("old", "Old action")]),
      );

      secondSocket.open();
      expect(sentFrames(secondSocket)).toEqual([
        { event: "registerAgain", uuid: "context-02" },
      ]);
      secondSocket.message(
        bridgeState("connected", [action("new", "New action")]),
      );
      expect(environment.document.actionSelect.value).toBe("");
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
        JSON.stringify({
          context: "context-01",
          payload: { settings: { actionId: "removed" } },
        }),
      );
      const socket = FakeSocket.instances[0]!;
      socket.open();
      socket.message(
        bridgeState("connected", [action("current", "Current action")]),
      );

      expect(environment.document.actionSelect.value).toBe("removed");
      expect(environment.document.actionSelect.children).toEqual([
        { value: "", textContent: "No action selected", disabled: false },
        { value: "current", textContent: "Current action", disabled: false },
        {
          value: "removed",
          textContent: "Unavailable: removed",
          disabled: true,
        },
      ]);
      expect(environment.document.actionSelect.disabled).toBe(false);
    } finally {
      environment.restore();
    }
  });

  test("moves to offline and clears actions on socket failure and close", async () => {
    const environment = await installEnvironment();
    try {
      environment.connect(
        28196,
        "context-01",
        "register",
        "",
        JSON.stringify({
          context: "context-01",
          payload: { settings: { actionId: "current" } },
        }),
      );
      const socket = FakeSocket.instances[0]!;
      socket.open();
      socket.message(
        bridgeState("connected", [
          action("current", "Current action", {
            description: "Current description",
          }),
        ]),
      );
      expect(environment.document.actionDescription.textContent).toBe(
        "Current description",
      );
      socket.error();
      expect(environment.document.connectionStatus.textContent).toBe("Offline");
      expect(environment.document.actionSelect.disabled).toBe(true);
      expect(environment.document.actionDescription.textContent).toBe("");
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

  test("shows offline diagnostic detail and clears it when connected", async () => {
    const environment = await installEnvironment();
    try {
      environment.connect(28196, "context-01", "register", "", "{}");
      const socket = FakeSocket.instances[0]!;
      socket.open();
      socket.message(
        bridgeState("disconnected", [], {
          version: 1,
          status: "disconnected",
          protocolVersion: 1,
          pluginVersion: "test",
          port: 17321,
          latest: {
            area: "auth",
            code: "TOKEN_UNAVAILABLE",
            at: "2026-07-18T00:00:00.000Z",
          },
        }),
      );
      expect(environment.document.connectionStatus.textContent).toBe("Offline");
      expect(environment.document.connectionDetails.textContent).toBe(
        "The Hammerspoon token is unavailable. Check ~/.hammerspoon/streamdeck-token, then reload Hammerspoon.",
      );

      socket.message(bridgeState("connected", []));
      expect(environment.document.connectionStatus.textContent).toBe(
        "Connected",
      );
      expect(environment.document.connectionDetails.textContent).toBe("");

      socket.message(
        bridgeState("disconnected", [], { latest: { code: "SECRET" } }),
      );
      expect(environment.document.connectionDetails.textContent).toContain(
        "Hammerspoon is not connected",
      );
    } finally {
      environment.restore();
    }
  });

  test("renders offline when WebSocket is unavailable", async () => {
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

  test("does not send inspector messages without an action context", async () => {
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

      expect(environment.document.connectionStatus.textContent).toBe(
        "Connected",
      );
      expect(environment.document.actionSelect.disabled).toBe(false);
      expect(environment.document.actionSelect.children).toEqual([
        { value: "", textContent: "No action selected", disabled: false },
        {
          value: "schema-action",
          textContent: "Schema action",
          disabled: false,
        },
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
          action("future-sixteen", "Future sixteen", {
            settingsSchemaVersion: 16,
          }),
        ]),
      );

      expect(environment.document.connectionStatus.textContent).toBe(
        "Connected",
      );
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
      socket.message(
        bridgeState("connected", [action("known", "Known action")]),
      );

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
        expect(environment.document.connectionStatus.textContent).toBe(
          "Connected",
        );
        expect(environment.document.actionSelect.disabled).toBe(false);
        expect(environment.document.actionSelect.children).toEqual(
          expectedOptions,
        );
      }
    } finally {
      environment.restore();
    }
  });

  test("hands filtered catalog results to the keyboard", async () => {
    const environment = await installEnvironment();
    try {
      environment.connect(28196, "context-01", "register", "", "{}");
      const socket = FakeSocket.instances[0]!;
      socket.open();
      socket.message(bridgeState("connected", [
        action("speaker", "Speaker Volume"),
        action("music", "Music Playback"),
      ]));

      environment.document.actionSearch.value = "speaker";
      environment.document.actionSearch.dispatch("input");

      const arrowDown = environment.document.actionSearch.dispatch("keydown", { key: "ArrowDown", altKey: true });
      expect(arrowDown.defaultPrevented).toBe(true);
      expect(environment.document.actionSelect.focusCalls).toBe(1);
      expect(environment.document.actionSelect.showPickerCalls).toBe(1);

      const enter = environment.document.actionSearch.dispatch("keydown", { key: "Enter" });
      expect(enter.defaultPrevented).toBe(true);
      expect(environment.document.actionSelect.value).toBe("speaker");
      expect(sentFrames(socket).filter((frame) => frame.event === "setSettings").at(-1)?.payload).toMatchObject({
        actionId: "speaker",
      });
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

      expect(environment.document.connectionStatus.textContent).toBe(
        "Connected",
      );
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
          payload: {
            settings: {
              actionId: "schema",
              text: "init",
              opaque: { keep: true },
            },
          },
        }),
      );
      const socket = FakeSocket.instances[0]!;
      socket.open();
      socket.message(
        bridgeState("connected", [
          action("schema", "Schema", {
            description: "Configures schema values.",
            settingsSchemaVersion: 1,
            settingsSchema: [
              {
                type: "text",
                key: "text",
                label: "Text",
                description: "A short text value.",
                default: "default",
                minLength: 2,
                maxLength: 5,
              },
              {
                type: "number",
                key: "count",
                label: "Count",
                description: "How many items to process.",
                default: 4,
                min: 0,
                max: 10,
                step: 2,
              },
              {
                type: "boolean",
                key: "enabled",
                label: "Enabled",
                description: "Whether processing is enabled.",
                default: true,
              },
              {
                type: "select",
                key: "mode",
                label: "Mode",
                description: "Which processing mode to use.",
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
          payload: {
            settings: {
              actionId: "schema",
              text: "init",
              opaque: { keep: true },
            },
          },
        }),
      );

      expect(environment.document.actionSettings.children).toHaveLength(4);
      expect(environment.document.actionDescription.textContent).toBe(
        "Configures schema values.",
      );
      const textWrapper = environment.document.actionSettings
        .children[0] as FakeElement;
      const countWrapper = environment.document.actionSettings
        .children[1] as FakeElement;
      const text = textWrapper.children[0] as FakeElement;
      const count = countWrapper.children[0] as FakeElement;
      const enabled = (
        environment.document.actionSettings.children[2] as FakeElement
      ).children[0] as FakeElement;
      const mode = (
        environment.document.actionSettings.children[3] as FakeElement
      ).children[0] as FakeElement;
      expect(textWrapper.children[1]).toMatchObject({ textContent: "Text" });
      expect(textWrapper.children[2]).toMatchObject({
        textContent: "A short text value.",
      });
      expect(countWrapper.children[2]).toMatchObject({
        textContent: "How many items to process.",
      });
      expect(text.attributes.get("aria-describedby")).toBe(
        "action-field-description-0",
      );
      expect(text.value).toBe("init");
      expect(text.maxLength).toBe(5);
      expect(text.minLength).toBe(2);
      expect(count.value).toBe("4");
      expect(count.min).toBe("0");
      expect(count.max).toBe("10");
      expect(count.step).toBe("2");
      expect(enabled.checked).toBe(true);
      expect(enabled.type).toBe("checkbox");
      expect(mode.value).toBe("one");

      text.value = "too-long";
      text.dispatch("change");
      expect(environment.document.settingsStatus.textContent).toContain(
        "invalid",
      );
      expect(
        sentFrames(socket).filter(
          (frame) => (frame as { event?: unknown }).event === "setSettings",
        ),
      ).toHaveLength(0);

      text.value = "ok";
      text.dispatch("input");
      expect(textWrapper.children[0]).toBe(text);
      text.value = "okay";
      text.dispatch("input");
      expect(textWrapper.children[0]).toBe(text);
      count.value = "6";
      count.dispatch("input");
      count.value = "8";
      count.dispatch("input");
      const liveFrames = sentFrames(socket).filter(
        (frame) => frame.event === "setSettings",
      );
      expect(liveFrames.at(-1)).toEqual({
        action: "com.brettinternet.hammerspoon.action",
        event: "setSettings",
        context: "context-01",
        payload: {
          actionId: "schema",
          text: "okay",
          count: 8,
          enabled: true,
          mode: "one",
          opaque: { keep: true },
        },
      });

      enabled.checked = false;
      mode.value = "two";
      enabled.dispatch("change");
      mode.dispatch("change");
      const frames = sentFrames(socket).filter(
        (frame) => frame.event === "setSettings",
      );
      expect(frames.at(-1)).toEqual({
        action: "com.brettinternet.hammerspoon.action",
        event: "setSettings",
        context: "context-01",
        payload: {
          actionId: "schema",
          text: "okay",
          count: 8,
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
          payload: {
            settings: {
              actionId: "schema",
              label: "Instance",
              count: "wrong",
              opaque: ["preserve"],
            },
          },
        }),
      );

      const label = (
        environment.document.actionSettings.children[0] as FakeElement
      ).children[0] as FakeElement;
      const count = (
        environment.document.actionSettings.children[1] as FakeElement
      ).children[0] as FakeElement;
      expect(label.value).toBe("Instance");
      expect(count.value).toBe("2");
      expect(environment.document.settingsStatus.textContent).toContain(
        "invalid saved value",
      );

      count.value = "4";
      count.dispatch("change");
      const frames = sentFrames(socket).filter(
        (frame) => frame.event === "setSettings",
      );
      expect(frames.at(-1)).toEqual({
        action: "com.brettinternet.hammerspoon.action",
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
  test("uses Unicode code-point bounds for text settings", async () => {
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
          action("unicode", "Unicode", {
            settingsSchemaVersion: 1,
            settingsSchema: [{ type: "text", key: "value", maxLength: 1 }],
          }),
        ]),
      );
      socket.message(
        JSON.stringify({
          event: "didReceiveSettings",
          payload: { settings: { actionId: "unicode", value: "😀" } },
        }),
      );

      const value = (
        environment.document.actionSettings.children[0] as FakeElement
      ).children[0] as FakeElement;
      expect(value.value).toBe("😀");
      expect(environment.document.settingsStatus.textContent).toBe(
        "Settings are ready.",
      );

      value.dispatch("change");
      const frames = sentFrames(socket).filter(
        (frame) => frame.event === "setSettings",
      );
      expect(frames.at(-1)).toEqual({
        action: "com.brettinternet.hammerspoon.action",
        event: "setSettings",
        context: "context-01",
        payload: { actionId: "unicode", value: "😀" },
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
      expect(environment.document.settingsStatus.textContent).toContain(
        "Unsupported settings field",
      );
      expect(environment.document.actionSettings.children).toHaveLength(1);
      expect(
        (environment.document.actionSettings.children[0] as FakeElement)
          .disabled,
      ).toBe(true);

      environment.document.actionSelect.value = "valid";
      environment.document.actionSelect.dispatch("change");
      expect(environment.document.settingsStatus.textContent).toBe(
        "No additional settings.",
      );
      expect(environment.document.actionSelect.disabled).toBe(false);
    } finally {
      environment.restore();
    }
  });

  test("renders categorized actions and interactive action settings", async () => {
    vi.useFakeTimers();
    const environment = await installEnvironment();
    try {
      environment.connect(
        28196,
        "context-01",
        "register",
        "",
        JSON.stringify({
          context: "context-01",
          payload: {
            settings: {
              actionId: "audio",
              inputDevice: "missing",
              muteMeetingApps: false,
            },
          },
        }),
      );
      const socket = FakeSocket.instances[0]!;
      socket.open();
      const inputOptions = [
        { value: "default", label: "Default input" },
        { value: "missing", label: "Studio Mic" },
      ];
      const actions = [
        action("app", "Launch app", {
          category: "Applications",
          description: "Launch an application.",
          gesture: "Press: launch or focus",
        }),
        action("audio", "Microphone mute", {
          category: "Audio",
          description: "Control a microphone.",
          gesture: "Press: toggle · Hold: talk",
          settingsSchemaVersion: 1,
          settingsSchema: [
            {
              type: "select",
              key: "inputDevice",
              label: "Input device",
              description: "Choose a microphone.",
              options: inputOptions,
              default: "default",
              refreshable: true,
            },
            {
              type: "boolean",
              key: "muteMeetingApps",
              label: "Integrate meeting apps",
              default: false,
            },
            {
              type: "boolean",
              key: "muteZoom",
              label: "Zoom",
              default: true,
              visibleWhen: { key: "muteMeetingApps", equals: true },
              section: "Meeting apps",
            },
          ],
        }),
        action("spotify", "Spotify controls", {
          category: "Media",
          description: "Control Spotify.",
          gesture: "Press: play or pause",
          settingsSchemaVersion: 1,
          settingsSchema: [
            {
              type: "select",
              key: "dialControl",
              label: "Dial control",
              controllers: ["encoder"],
              options: [{ value: "volume", label: "Volume" }],
              default: "volume",
            },
          ],
        }),
      ];
      socket.message(
        JSON.stringify({
          event: "sendToPropertyInspector",
          payload: {
            type: "bridgeState",
            status: "connected",
            controller: "keypad",
            actions,
          },
        }),
      );

      expect(environment.document.actionDescription.textContent).toBe(
        "Control a microphone.",
      );
      expect(
        sentFrames(socket)
          .filter((frame) => frame.event === "setSettings")
          .at(-1)?.payload,
      ).toMatchObject({
        __optionLabels: {
          audio: { inputDevice: { missing: "Studio Mic" } },
        },
      });
      inputOptions.splice(1, 1);
      socket.message(
        JSON.stringify({
          event: "sendToPropertyInspector",
          payload: {
            type: "bridgeState",
            status: "connected",
            controller: "keypad",
            actions,
          },
        }),
      );
      socket.message(
        JSON.stringify({
          event: "sendToPropertyInspector",
          payload: {
            type: "inspectorFeedback",
            kind: "success",
            message: "Microphone muted",
            durationMs: 100,
          },
        }),
      );
      expect(environment.document.settingsStatus.textContent).toBe(
        "Microphone muted",
      );
      expect(
        environment.document.settingsStatus.attributes.get("data-feedback"),
      ).toBe("success");
      expect(environment.document.actionGestures.textContent).toBe(
        "Press: toggle · Hold: talk",
      );
      expect(environment.document.actionSelect.children).toHaveLength(4);
      const applicationGroup = environment.document.actionSelect
        .children[1] as FakeElement;
      const audioGroup = environment.document.actionSelect
        .children[2] as FakeElement;
      const mediaGroup = environment.document.actionSelect
        .children[3] as FakeElement;
      expect(applicationGroup.attributes.get("label")).toBe("Applications");
      expect(audioGroup.attributes.get("label")).toBe("Audio");
      expect(mediaGroup.attributes.get("label")).toBe("Media");

      expect(environment.document.actionSettings.children).toHaveLength(2);
      expect(environment.document.resetActionButton.attributes.has("hidden")).toBe(false);
      let inputWrapper = environment.document.actionSettings
        .children[0] as FakeElement;
      const inputControl = inputWrapper.children[0] as FakeElement;
      expect(inputControl.value).toBe("missing");
      expect(inputControl.children.at(-1)).toMatchObject({
        value: "missing",
        textContent: "Unavailable — Studio Mic",
      });

      environment.document.actionSearch.value = "spotify";
      environment.document.actionSearch.dispatch("input");
      expect(environment.document.actionSelect.children).toHaveLength(3);
      expect(
        (
          environment.document.actionSelect.children[1] as FakeElement
        ).attributes.get("label"),
      ).toBe("Audio");
      expect(
        (
          environment.document.actionSelect.children[2] as FakeElement
        ).attributes.get("label"),
      ).toBe("Media");
      environment.document.actionSearch.value = "";
      environment.document.actionSearch.dispatch("input");

      let meetingWrapper = environment.document.actionSettings
        .children[1] as FakeElement;
      const meetingControl = meetingWrapper.children[0] as FakeElement;
      meetingControl.checked = true;
      meetingControl.dispatch("change");
      expect(environment.document.actionSettings.children).toHaveLength(3);
      const meetingSection = environment.document.actionSettings
        .children[2] as FakeElement;
      expect((meetingSection.children[0] as FakeElement).textContent).toBe(
        "Meeting apps",
      );
      expect(
        sentFrames(socket)
          .filter((frame) => frame.event === "setSettings")
          .at(-1)?.payload,
      ).toMatchObject({
        actionId: "audio",
        muteMeetingApps: true,
      });

      inputWrapper = environment.document.actionSettings
        .children[0] as FakeElement;
      (inputWrapper.children[4] as FakeElement).dispatch("click");
      expect(
        sentFrames(socket)
          .filter((frame) => frame.event === "sendToPlugin")
          .at(-1)?.payload,
      ).toEqual({
        type: "refreshActions",
      });

      meetingWrapper = environment.document.actionSettings
        .children[1] as FakeElement;
      (meetingWrapper.children[2] as FakeElement).dispatch("click");
      expect(environment.document.actionSettings.children).toHaveLength(2);
      expect(
        sentFrames(socket)
          .filter((frame) => frame.event === "setSettings")
          .at(-1)?.payload,
      ).toMatchObject({
        actionId: "audio",
        muteMeetingApps: false,
      });

      environment.document.resetActionButton.dispatch("click");
      expect(environment.document.settingsStatus.textContent).toBe(
        "Action settings reset.",
      );
      vi.advanceTimersByTime(100);
      expect(environment.document.settingsStatus.textContent).toBe(
        "Action settings reset.",
      );
      expect(
        sentFrames(socket)
          .filter((frame) => frame.event === "setSettings")
          .at(-1)?.payload,
      ).toMatchObject({
        actionId: "audio",
        inputDevice: "default",
        muteMeetingApps: false,
        muteZoom: true,
      });

      environment.document.actionSelect.value = "spotify";
      environment.document.actionSelect.dispatch("change");
      expect(environment.document.actionSettings.children).toHaveLength(0);
      expect(environment.document.resetActionButton.attributes.get("hidden")).toBe("");
      socket.message(
        JSON.stringify({
          event: "sendToPropertyInspector",
          payload: {
            type: "bridgeState",
            status: "connected",
            controller: "encoder",
            actions,
          },
        }),
      );
      expect(environment.document.actionSettings.children).toHaveLength(1);
      expect(
        (
          (environment.document.actionSettings.children[0] as FakeElement)
            .children[0] as FakeElement
        ).value,
      ).toBe("volume");
      environment.document.actionSelect.value = "app";
      environment.document.actionSelect.dispatch("change");
      expect(environment.document.actionSettings.children).toHaveLength(0);
      expect(environment.document.resetActionButton.attributes.get("hidden")).toBe("");
    } finally {
      environment.restore();
      vi.useRealTimers();
    }
  });
});
