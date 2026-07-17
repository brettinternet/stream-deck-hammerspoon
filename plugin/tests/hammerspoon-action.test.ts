import { EventEmitter } from "node:events";
import { describe, expect, mock, test } from "bun:test";
import type {
  BridgeAction,
  BridgeClient,
  BridgeProtocolError,
} from "../src/bridge";
import type { HammerspoonActionSettings } from "../src/actions/hammerspoon-action";

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

type ActionCalls = {
  titles: string[];
  states: Array<0 | 1>;
  images: Array<string | undefined>;
  alerts: number;
};
class FakeAction {
  readonly calls: ActionCalls = { titles: [], states: [], images: [], alerts: 0 };
  rejectTitle = false;
  rejectState = false;
  rejectImage = false;
  rejectImageClear = false;
  imageDelay?: Promise<void>;
  okCount = 0;
  rejectAlert = false;

  constructor(
    readonly id: string,
    private readonly key = true,
  ) {}

  isKey(): boolean {
    return this.key;
  }

  async setTitle(title: string): Promise<void> {
    this.calls.titles.push(title);
    if (this.rejectTitle) {
      throw new Error("setTitle failed");
    }
  }

  async setState(state: 0 | 1): Promise<void> {
    this.calls.states.push(state);
    if (this.rejectState) {
      throw new Error("setState failed");
    }
  }

  async setImage(image?: string): Promise<void> {
    this.calls.images.push(image);
    if (this.imageDelay) {
      await this.imageDelay;
    }
    if ((this.rejectImage && image !== undefined) || (image === undefined && this.rejectImageClear)) {
      throw new Error("setImage failed");
    }
  }

  async showAlert(): Promise<void> {
    this.calls.alerts += 1;
    if (this.rejectAlert) {
      throw new Error("showAlert failed");
    }
  }

  async showOk(): Promise<void> {
    this.okCount += 1;
  }
}

class FakeBridge extends EventEmitter {
  status: "disconnected" | "connecting" | "authenticating" | "connected" = "disconnected";
  actions: BridgeAction[] = [];
  readonly upserts: Array<Record<string, unknown>> = [];
  readonly removals: Array<[string, string]> = [];
  readonly keyDowns: Array<[string, string, HammerspoonActionSettings]> = [];
  readonly keyUps: Array<[string, string, HammerspoonActionSettings]> = [];

  upsertInstance(input: Record<string, unknown>): void {
    this.upserts.push(input);
  }

  removeInstance(instanceId: string, actionId: string): void {
    this.removals.push([instanceId, actionId]);
  }

  keyDown(instanceId: string, actionId: string, settings: HammerspoonActionSettings): void {
    this.keyDowns.push([instanceId, actionId, settings]);
  }

  keyUp(instanceId: string, actionId: string, settings: HammerspoonActionSettings): void {
    this.keyUps.push([instanceId, actionId, settings]);
  }
}

const propertyInspectorMessages: unknown[] = [];
const streamDeckMock = {
  ui: {
    sendToPropertyInspector: async (message: unknown): Promise<void> => {
      propertyInspectorMessages.push(message);
    },
  },
};

mock.module("@elgato/streamdeck", () => ({
  default: streamDeckMock,
  SingletonAction: class {},
}));

const { HammerspoonAction } = await import("../src/actions/hammerspoon-action");

function makeAction(bridge: FakeBridge): HammerspoonAction {
  return new HammerspoonAction(bridge as unknown as BridgeClient);
}

function appear(action: FakeAction, settings: HammerspoonActionSettings = {}) {
  return {
    action,
    payload: { settings },
  } as never;
}

function disappear(action: FakeAction) {
  return { action } as never;
}

function settings(action: FakeAction, value: HammerspoonActionSettings) {
  return { action, payload: { settings: value } } as never;
}

function keyDown(action: FakeAction) {
  return { action } as never;
}

function keyUp(action: FakeAction) {
  return { action } as never;
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await new Promise<void>((resolve) => setImmediate(resolve));
  await Promise.resolve();
}

class FeedbackTimers {
  private nextId = 1;
  private readonly callbacks = new Map<number, () => void>();

  readonly setTimeout = (callback: () => void): number => {
    const id = this.nextId++;
    this.callbacks.set(id, callback);
    return id;
  };

  readonly clearTimeout = (handle: unknown): void => {
    if (typeof handle === "number") this.callbacks.delete(handle);
  };

  runNext(): void {
    const callback = this.callbacks.values().next().value as (() => void) | undefined;
    if (!callback) return;
    const id = this.callbacks.keys().next().value as number;
    this.callbacks.delete(id);
    callback();
  }
}

describe("HammerspoonAction", () => {
  test("subscribe is idempotent and listens for status and actions", async () => {
    propertyInspectorMessages.length = 0;
    const bridge = new FakeBridge();
    const adapter = makeAction(bridge);

    adapter.subscribe();
    adapter.subscribe();
    bridge.status = "connected";
    bridge.emit("status", "connected");
    await flush();
    bridge.emit("actions");
    await flush();

    expect(propertyInspectorMessages).toEqual([
      { type: "bridgeState", status: "connected", actions: [] },
      { type: "bridgeState", status: "connected", actions: [] },
    ]);
  });

  test("renders missing settings, offline, unsynchronized, and synchronized appearances", async () => {
    const bridge = new FakeBridge();
    const adapter = makeAction(bridge);
    const missing = new FakeAction("missing");
    const configured = new FakeAction("configured");

    await adapter.onWillAppear(appear(missing));
    expect(missing.calls).toEqual({ titles: ["Select action"], states: [0], images: [], alerts: 0 });

    await adapter.onWillAppear(appear(configured, { actionId: "action.offline" }));
    expect(configured.calls).toEqual({
      titles: ["Hammerspoon\nOffline"],
      states: [0],
      images: [],
      alerts: 0,
    });
    expect(bridge.upserts).toEqual([
      { instanceId: "configured", actionId: "action.offline", settings: { actionId: "action.offline" } },
    ]);
    const unsynchronized = new FakeAction("unsynchronized");
    bridge.status = "connected";
    await adapter.onWillAppear(appear(unsynchronized, { actionId: "action.unsynchronized" }));
    expect(unsynchronized.calls).toEqual({
      titles: ["Hammerspoon\nOffline"],
      states: [0],
      images: [],
      alerts: 0,
    });
    expect(bridge.upserts).toEqual([
      { instanceId: "configured", actionId: "action.offline", settings: { actionId: "action.offline" } },
      {
        instanceId: "unsynchronized",
        actionId: "action.unsynchronized",
        settings: { actionId: "action.unsynchronized" },
      },
    ]);


    adapter.subscribe();
    bridge.status = "connected";
    bridge.emit("appearance", {
      type: "appearance",
      protocolVersion: 1,
      instanceId: "configured",
      actionId: "action.offline",
      title: "Playing",
      state: 1,
    });
    await flush();
    expect(configured.calls).toEqual({
      titles: ["Hammerspoon\nOffline", "Playing"],
      states: [0, 1],
      images: [],
      alerts: 0,
    });
  });

  test("handles appearance, settings, and disappearance transitions without stale actions", async () => {
    const bridge = new FakeBridge();
    const adapter = makeAction(bridge);
    const action = new FakeAction("instance");

    await adapter.onWillAppear(appear(action, { actionId: "first", extra: "ignored" } as never));
    await adapter.onDidReceiveSettings(settings(action, { actionId: "second" }));
    expect(bridge.removals).toEqual([["instance", "first"]]);
    expect(bridge.upserts).toHaveLength(2);

    const callsBeforeStaleAppearance = structuredClone(action.calls);
    bridge.emit("appearance", {
      type: "appearance",
      protocolVersion: 1,
      instanceId: "instance",
      actionId: "first",
      title: "Stale",
      state: 1,
    });
    await flush();
    expect(action.calls).toEqual(callsBeforeStaleAppearance);

    await adapter.onDidReceiveSettings(settings(action, {}));
    expect(bridge.removals).toEqual([
      ["instance", "first"],
      ["instance", "second"],
    ]);
    await adapter.onWillDisappear(disappear(action));
    expect(bridge.removals).toEqual([
      ["instance", "first"],
      ["instance", "second"],
    ]);

    await adapter.onWillAppear({ action: new FakeAction("dial", false), payload: { settings: {} } } as never);
    expect(bridge.upserts).toHaveLength(2);
  });

  test("keyDown renders an unconfigured key and forwards configured settings", async () => {
    const bridge = new FakeBridge();
    const adapter = makeAction(bridge);
    const unconfigured = new FakeAction("unconfigured");
    await adapter.onWillAppear(appear(unconfigured));
    await adapter.onKeyDown(keyDown(unconfigured));
    expect(unconfigured.calls).toEqual({
      titles: ["Select action", "Select action"],
      states: [0, 0],
      images: [],
      alerts: 0,
    });

    const configured = new FakeAction("configured");
    const configuredSettings = { actionId: "action.id" };
    await adapter.onWillAppear(appear(configured, configuredSettings));
    await adapter.onKeyDown(keyDown(configured));
    expect(bridge.keyDowns).toEqual([["configured", "action.id", configuredSettings]]);
  });

  test("forwards key releases with each instance identity in order", async () => {
    const bridge = new FakeBridge();
    const adapter = makeAction(bridge);
    const first = new FakeAction("first-instance");
    const second = new FakeAction("second-instance");
    const firstSettings = { actionId: "action.id", label: "First" };
    const secondSettings = { actionId: "action.id", label: "Second" };
    await adapter.onWillAppear(appear(first, firstSettings));
    await adapter.onWillAppear(appear(second, secondSettings));

    await adapter.onKeyUp(keyUp(first));
    await adapter.onKeyUp(keyUp(second));

    expect(bridge.keyUps).toEqual([
      ["first-instance", "action.id", firstSettings],
      ["second-instance", "action.id", secondSettings],
    ]);
  });

  test("preserves custom settings through appear, settings updates, and keyDown", async () => {
    const bridge = new FakeBridge();
    const adapter = makeAction(bridge);
    const action = new FakeAction("instance");
    const initial = {
      actionId: "action.id",
      label: "Initial",
      enabled: true,
      opaque: { nested: ["value"] },
    } as never;
    await adapter.onWillAppear(appear(action, initial));
    expect(bridge.upserts[0]).toEqual({
      instanceId: "instance",
      actionId: "action.id",
      settings: initial,
    });

    const updated = {
      actionId: "action.id",
      label: "Updated",
      enabled: false,
      opaque: { nested: ["changed"] },
    } as never;
    await adapter.onDidReceiveSettings(settings(action, updated));
    expect(bridge.upserts[1]).toEqual({
      instanceId: "instance",
      actionId: "action.id",
      settings: updated,
    });

    await adapter.onKeyDown(keyDown(action));
    expect(bridge.keyDowns.at(-1)).toEqual(["instance", "action.id", updated]);
  });

  test("keeps two placements independent through settings and disappearance", async () => {
    const bridge = new FakeBridge();
    const adapter = makeAction(bridge);
    const first = new FakeAction("profile-one-device-one");
    const second = new FakeAction("profile-two-device-two");
    const firstSettings = { actionId: "action.id", label: "First" } as never;
    const secondSettings = { actionId: "action.id", label: "Second" } as never;

    await adapter.onWillAppear(appear(first, firstSettings));
    await adapter.onWillAppear(appear(second, secondSettings));
    expect(bridge.upserts).toEqual([
      { instanceId: first.id, actionId: "action.id", settings: firstSettings },
      { instanceId: second.id, actionId: "action.id", settings: secondSettings },
    ]);

    const updatedFirst = { actionId: "action.id", label: "First updated" } as never;
    await adapter.onDidReceiveSettings(settings(first, updatedFirst));
    await adapter.onKeyDown(keyDown(first));
    await adapter.onKeyDown(keyDown(second));
    expect(bridge.keyDowns).toEqual([
      [first.id, "action.id", updatedFirst],
      [second.id, "action.id", secondSettings],
    ]);

    await adapter.onWillDisappear(disappear(first));
    expect(bridge.removals).toEqual([[first.id, "action.id"]]);
    const firstCallsAfterDisappear = structuredClone(first.calls);
    bridge.status = "connected";
    adapter.subscribe();
    bridge.emit("appearance", {
      type: "appearance",
      protocolVersion: 1,
      instanceId: first.id,
      actionId: "action.id",
      title: "stale first",
      state: 1,
    });
    bridge.emit("appearance", {
      type: "appearance",
      protocolVersion: 1,
      instanceId: second.id,
      actionId: "action.id",
      title: "live second",
      state: 1,
    });
    await flush();
    expect(first.calls).toEqual(firstCallsAfterDisappear);
    expect(second.calls.titles.at(-1)).toBe("live second");
  });

  test("sends requestState and deep-cloned bridgeState payloads", async () => {
    propertyInspectorMessages.length = 0;
    const bridge = new FakeBridge();
    const schema: JsonValue[] = [
      { type: "select", key: "mode", options: [{ value: "one", label: "One" }], default: "one" },
    ];
    bridge.status = "connected";
    bridge.actions = [{
      actionId: "action.id",
      name: "Action",
      settingsSchemaVersion: 1,
      settingsSchema: schema,
    }];
    const adapter = makeAction(bridge);
    adapter.subscribe();

    await adapter.onSendToPlugin({ payload: { type: "requestState" } } as never);
    expect(propertyInspectorMessages).toHaveLength(1);
    expect(propertyInspectorMessages[0]).toEqual({
      type: "bridgeState",
      status: "connected",
      actions: [{
        actionId: "action.id",
        name: "Action",
        settingsSchemaVersion: 1,
        settingsSchema: schema,
      }],
    });

    schema[0] = { label: "mutated" };
    expect(propertyInspectorMessages[0]).toEqual({
      type: "bridgeState",
      status: "connected",
      actions: [{
        actionId: "action.id",
        name: "Action",
        settingsSchemaVersion: 1,
        settingsSchema: [{ type: "select", key: "mode", options: [{ value: "one", label: "One" }], default: "one" }],
      }],
    });

    await adapter.onSendToPlugin({ payload: { type: "other" } } as never);
    expect(propertyInspectorMessages).toHaveLength(1);
  });

  test("listens for appearances and protocol errors", async () => {
    const bridge = new FakeBridge();
    const adapter = makeAction(bridge);
    const action = new FakeAction("instance");
    adapter.subscribe();
    await adapter.onWillAppear(appear(action, { actionId: "action.id" }));
    bridge.status = "connected";

    bridge.emit("appearance", {
      type: "appearance",
      protocolVersion: 1,
      instanceId: "instance",
      actionId: "action.id",
      title: "Ready",
      state: 0,
    });
    await flush();
    bridge.emit("protocolError", {
      code: "bad_request",
      message: "nope",
      instanceId: "instance",
    } satisfies BridgeProtocolError);
    await flush();
    bridge.emit("protocolError", {
      code: "bad_request",
      message: "no instance",
    } satisfies BridgeProtocolError);
    await flush();

    expect(action.calls.titles).toEqual(["Hammerspoon\nOffline", "Ready"]);
    expect(action.calls.states).toEqual([0, 0]);
    expect(action.calls.alerts).toBe(1);
  });

  test("renders bounded presentation decorations and falls back safely", async () => {
    const bridge = new FakeBridge();
    const adapter = makeAction(bridge);
    const action = new FakeAction("decorated");
    adapter.subscribe();
    await adapter.onWillAppear(appear(action, { actionId: "action.id" }));
    bridge.status = "connected";

    bridge.emit("appearance", {
      type: "appearance",
      protocolVersion: 1,
      instanceId: "decorated",
      actionId: "action.id",
      title: "Ready",
      state: 1,
      appearanceVersion: 1,
      foregroundColor: "#FFFFFF",
      backgroundColor: "#202020",
      progress: 0.5,
      badge: "<&'\"",
    });
    await flush();

    expect(action.calls.images).toHaveLength(1);
    const image = action.calls.images[0];
    expect(image).toStartWith("data:image/svg+xml,");
    expect(decodeURIComponent(image!.slice("data:image/svg+xml,".length))).toContain(
      '<rect width="72" height="72" fill="#202020"/>',
    );
    expect(decodeURIComponent(image!.slice("data:image/svg+xml,".length))).toContain(
      '<rect x="4" y="64" width="32" height="4" fill="#FFFFFF"/>',
    );
    expect(decodeURIComponent(image!.slice("data:image/svg+xml,".length))).toContain("&lt;&amp;&apos;&quot;");
    expect(decodeURIComponent(image!.slice("data:image/svg+xml,".length))).not.toContain("<&'\"");
    expect(action.calls.titles).toEqual(["Hammerspoon\nOffline", "Ready"]);
    expect(action.calls.states).toEqual([0, 1]);

    bridge.emit("appearance", {
      type: "appearance",
      protocolVersion: 1,
      instanceId: "decorated",
      actionId: "action.id",
      title: "Plain",
      state: 0,
    });
    await flush();
    expect(action.calls.images).toEqual([image, undefined]);
    expect(action.calls.titles.at(-1)).toBe("Plain");

    const failed = new FakeAction("failed");
    failed.rejectImage = true;
    await adapter.onWillAppear(appear(failed, { actionId: "action.id" }));
    bridge.emit("appearance", {
      type: "appearance",
      protocolVersion: 1,
      instanceId: "failed",
      actionId: "action.id",
      title: "Fallback",
      state: 1,
      appearanceVersion: 1,
      backgroundColor: "#000000",
    });
    await flush();
    expect(failed.calls.images).toEqual([expect.any(String), undefined]);
    expect(failed.calls.titles).toEqual(["Hammerspoon\nOffline", "Fallback"]);
    expect(failed.calls.states).toEqual([0, 1]);
    expect(failed.calls.alerts).toBe(1);
  });

  test("renders bundled and validated custom icons with safe fallback", async () => {
    const bridge = new FakeBridge();
    const adapter = makeAction(bridge);
    const action = new FakeAction("icons");
    adapter.subscribe();
    await adapter.onWillAppear(appear(action, { actionId: "action.id" }));
    bridge.status = "connected";
    bridge.emit("appearance", {
      type: "appearance",
      protocolVersion: 1,
      instanceId: "icons",
      actionId: "action.id",
      title: "Bundled",
      state: 0,
      appearanceVersion: 1,
      icon: { kind: "bundled", name: "hammerspoon" },
    });
    await flush();
    expect(action.calls.images.at(-1)).toBe("imgs/key.svg");
    const custom = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 72 72"></svg>').toString("base64");
    bridge.emit("appearance", {
      type: "appearance",
      protocolVersion: 1,
      instanceId: "icons",
      actionId: "action.id",
      title: "Custom",
      state: 1,
      appearanceVersion: 1,
      icon: { kind: "custom", mediaType: "image/svg+xml", dataBase64: custom },
    });
    await flush();
    expect(action.calls.images.at(-1)).toBe(
      `data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2072%2072%22%3E%3C%2Fsvg%3E`,
    );
    bridge.emit("appearance", {
      type: "appearance",
      protocolVersion: 1,
      instanceId: "icons",
      actionId: "action.id",
      title: "Fallback",
      state: 0,
      appearanceVersion: 1,
      icon: { kind: "custom", mediaType: "image/svg+xml", dataBase64: "bad" },
    } as never);
    await flush();
    expect(action.calls.images.at(-1)).toContain("data:image/svg+xml,");
    expect(action.calls.titles.at(-1)).toBe("Custom");
  });

  test("retains the previous appearance when decoration cannot be cleared", async () => {
    const bridge = new FakeBridge();
    const adapter = makeAction(bridge);
    const action = new FakeAction("clear-failure");
    adapter.subscribe();
    await adapter.onWillAppear(appear(action, { actionId: "action.id" }));
    bridge.status = "connected";

    bridge.emit("appearance", {
      type: "appearance",
      protocolVersion: 1,
      instanceId: "clear-failure",
      actionId: "action.id",
      title: "Decorated",
      state: 1,
      appearanceVersion: 1,
      backgroundColor: "#202020",
    });
    await flush();
    action.rejectImageClear = true;

    bridge.emit("appearance", {
      type: "appearance",
      protocolVersion: 1,
      instanceId: "clear-failure",
      actionId: "action.id",
      title: "Plain",
      state: 0,
    });
    await flush();

    expect(action.calls.images).toHaveLength(2);
    expect(action.calls.images[1]).toBeUndefined();
    expect(action.calls.titles).toEqual(["Hammerspoon\nOffline", "Decorated"]);
    expect(action.calls.states).toEqual([0, 1]);
    expect(action.calls.alerts).toBe(1);
  });

  test("serializes appearance image updates per instance", async () => {
    const bridge = new FakeBridge();
    const adapter = makeAction(bridge);
    const action = new FakeAction("serialized");
    let releaseImage!: () => void;
    action.imageDelay = new Promise<void>((resolve) => {
      releaseImage = resolve;
    });
    adapter.subscribe();
    await adapter.onWillAppear(appear(action, { actionId: "action.id" }));
    bridge.status = "connected";

    bridge.emit("appearance", {
      type: "appearance",
      protocolVersion: 1,
      instanceId: "serialized",
      actionId: "action.id",
      title: "Decorated",
      state: 1,
      appearanceVersion: 1,
      backgroundColor: "#202020",
    });
    await flush();
    expect(action.calls.images).toHaveLength(1);

    bridge.emit("appearance", {
      type: "appearance",
      protocolVersion: 1,
      instanceId: "serialized",
      actionId: "action.id",
      title: "Plain",
      state: 0,
    });
    releaseImage();
    await flush();

    expect(action.calls.images).toHaveLength(2);
    expect(action.calls.images[1]).toBeUndefined();
    expect(action.calls.titles.at(-1)).toBe("Plain");
    expect(action.calls.states.at(-1)).toBe(0);
  });

  test("keeps offline fallback when disconnect interrupts appearance rendering", async () => {
    const bridge = new FakeBridge();
    const adapter = makeAction(bridge);
    const action = new FakeAction("disconnecting");
    let releaseImage!: () => void;
    action.imageDelay = new Promise<void>((resolve) => {
      releaseImage = resolve;
    });
    adapter.subscribe();
    await adapter.onWillAppear(appear(action, { actionId: "action.id" }));
    bridge.status = "connected";

    bridge.emit("appearance", {
      type: "appearance",
      protocolVersion: 1,
      instanceId: "disconnecting",
      actionId: "action.id",
      title: "Decorated",
      state: 1,
      appearanceVersion: 1,
      backgroundColor: "#202020",
    });
    await flush();
    bridge.status = "disconnected";
    bridge.emit("status", "disconnected");
    releaseImage();
    await flush();

    expect(action.calls.images).toHaveLength(2);
    expect(action.calls.images[1]).toBeUndefined();
    expect(action.calls.titles.at(-1)).toBe("Hammerspoon\nOffline");
    expect(action.calls.states.at(-1)).toBe(0);
  });


  test("best-effort rendering alerts swallow setTitle, setState, and showAlert failures", async () => {
    const bridge = new FakeBridge();
    const adapter = makeAction(bridge);
    const titleFailure = new FakeAction("title-failure");
    titleFailure.rejectTitle = true;
    titleFailure.rejectAlert = true;
    const stateFailure = new FakeAction("state-failure");
    stateFailure.rejectState = true;
    stateFailure.rejectAlert = true;

    await adapter.onWillAppear(appear(titleFailure));
    await adapter.onWillAppear(appear(stateFailure));
    expect(titleFailure.calls).toEqual({ titles: ["Select action"], states: [0], images: [], alerts: 1 });
    expect(stateFailure.calls).toEqual({ titles: ["Select action"], states: [0], images: [], alerts: 1 });
  });
  test("renders correlated feedback and restores the last appearance after expiry", async () => {
    const bridge = new FakeBridge();
    bridge.status = "connected";
    const timers = new FeedbackTimers();
    const adapter = new HammerspoonAction(bridge as unknown as BridgeClient, timers);
    adapter.subscribe();
    const action = new FakeAction("feedback-instance");
    await adapter.onWillAppear(appear(action, { actionId: "com.example.feedback" }));
    bridge.emit("appearance", {
      type: "appearance",
      protocolVersion: 1,
      instanceId: "feedback-instance",
      actionId: "com.example.feedback",
      title: "Ready",
      state: 1,
    });
    await flush();
    bridge.emit("feedback", {
      type: "feedback",
      protocolVersion: 1,
      instanceId: "feedback-instance",
      actionId: "com.example.feedback",
      kind: "success",
      message: "Saved",
      durationMs: 250,
    });
    await flush();
    expect(action.calls.titles).toContain("Saved");
    expect(action.okCount).toBe(1);
    timers.runNext();
    await flush();
    expect(action.calls.titles.at(-1)).toBe("Ready");

    await adapter.onWillDisappear(disappear(action));
    const callsBeforeStale = structuredClone(action.calls);
    bridge.emit("feedback", {
      type: "feedback",
      protocolVersion: 1,
      instanceId: "feedback-instance",
      actionId: "com.example.feedback",
      kind: "error",
      message: "Stale",
      durationMs: 250,
    });
    await flush();
    expect(action.calls).toEqual(callsBeforeStale);
  });

});
