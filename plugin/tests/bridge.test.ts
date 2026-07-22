import { describe, expect, test } from "bun:test";
import { homedir } from "node:os";
import { join } from "node:path";
import { BridgeClient } from "../src/bridge";
import {
  deriveLanFrameKey,
  doubleHmacEqual,
  encodeHex,
  lanFrameMac,
  lanProof,
} from "../src/lan-crypto";

type Listener = (event?: unknown) => void;

class FakeSocket {
  static readonly OPEN = 1;
  static readonly CLOSED = 3;
  readyState = 0;
  sent: string[] = [];
  closeCalls = 0;
  onopen?: Listener;
  onmessage?: Listener;
  onclose?: Listener;
  onerror?: Listener;
  private listeners = new Map<string, Set<Listener>>();

  on(event: string, listener: Listener): this {
    let listeners = this.listeners.get(event);
    if (!listeners) {
      listeners = new Set();
      this.listeners.set(event, listeners);
    }
    listeners.add(listener);
    return this;
  }

  once(event: string, listener: Listener): this {
    const wrapped: Listener = (value) => {
      this.off(event, wrapped);
      listener(value);
    };
    return this.on(event, wrapped);
  }

  off(event: string, listener: Listener): this {
    this.listeners.get(event)?.delete(listener);
    return this;
  }

  addEventListener(event: string, listener: Listener): void {
    this.on(event, listener);
  }

  removeEventListener(event: string, listener: Listener): void {
    this.off(event, listener);
  }

  send(frame: string): void {
    this.sent.push(frame);
  }

  open(): void {
    this.readyState = FakeSocket.OPEN;
    this.emit("open");
  }

  receive(frame: string): void {
    this.emit("message", frame);
  }

  peerClose(): void {
    this.readyState = FakeSocket.CLOSED;
    this.emit("close", { code: 1000 });
  }

  error(): void {
    this.emit("error");
  }

  close(): void {
    this.closeCalls += 1;
    this.readyState = FakeSocket.CLOSED;
    this.emit("close", { code: 1000 });
  }

  private emit(event: string, value?: unknown): void {
    const property = {
      open: this.onopen,
      message: this.onmessage,
      close: this.onclose,
      error: this.onerror,
    }[event];
    property?.(value);
    for (const listener of this.listeners.get(event) ?? []) listener(value);
  }
}

class ThrowingCloseSocket extends FakeSocket {
  override close(): void {
    this.closeCalls += 1;
    throw new Error("close failed");
  }
}

class ManualTimers {
  private nextId = 1;
  private callbacks = new Map<number, { delay: number; callback: () => void }>();

  readonly setTimeout = (callback: () => void, delay: number): number => {
    const id = this.nextId++;
    this.callbacks.set(id, { callback, delay });
    return id;
  };

  readonly clearTimeout = (handle: unknown): void => {
    if (typeof handle !== "number") return;
    this.callbacks.delete(handle);
  };

  delays(): number[] {
    return [...this.callbacks.values()].map(({ delay }) => delay);
  }

  runNext(): void {
    const entry = this.callbacks.entries().next().value as
      | [number, { callback: () => void; delay: number }]
      | undefined;
    if (!entry) return;
    this.callbacks.delete(entry[0]);
    entry[1].callback();
  }
  runAll(): void {
    while (this.callbacks.size > 0) this.runNext();
  }
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}
function makeClient(
  sockets: FakeSocket[],
  timers = new ManualTimers(),
  token = "shared-token",
) {
  const client = new BridgeClient({
    url: "ws://127.0.0.1:17321/stream",
    tokenPath: "/tmp/streamdeck-token",
    pluginVersion: "1.0.0",
    createSocket: () => {
      const socket = new FakeSocket();
      sockets.push(socket);
      return socket;
    },
    readToken: async () => token,
    setTimeout: timers.setTimeout,
    clearTimeout: timers.clearTimeout,
    random: () => 0.5,
  });
  return { client, timers };
}

function frames(socket: FakeSocket): Array<Record<string, unknown>> {
  return socket.sent.map((frame) => JSON.parse(frame) as Record<string, unknown>);
}

function makeLanClient(
  sockets: FakeSocket[],
  timers = new ManualTimers(),
  key = Buffer.alloc(32, 0x4b),
) {
  const client = new BridgeClient({
    url: "ws://192.168.1.20:17322/streamdeck",
    lan: { clientId: "remote", keyPath: "/tmp/streamdeck-client-key" },
    pluginVersion: "1.0.0",
    createSocket: () => {
      const socket = new FakeSocket();
      sockets.push(socket);
      return socket;
    },
    readKey: async () => key,
    randomBytes: () => Buffer.alloc(32, 1),
    setTimeout: timers.setTimeout,
    clearTimeout: timers.clearTimeout,
    random: () => 0.5,
  });
  return { client, timers, key };
}


let nextSessionId = 1;

async function authenticate(socket: FakeSocket, sessionId = `session-${nextSessionId++}`): Promise<string> {
  await flush();
  socket.open();
  expect(frames(socket).at(-1)).toMatchObject({ type: "hello", token: "shared-token" });
  socket.receive(JSON.stringify({ protocolVersion: 1, type: "helloAck", sessionId }));
  const request = frames(socket).find((frame) => frame.type === "listActions");
  expect(request).toBeDefined();
  expect(request?.sessionId).toBe(sessionId);
  return request!.requestId as string;
}

function completeActions(socket: FakeSocket, requestId: string, actionId = "com.example.action"): void {
  socket.receive(
    JSON.stringify({
      protocolVersion: 1,
      type: "actions",
      requestId,
      actions: [{ actionId, name: "Example action" }],
    }),
  );
}

describe("BridgeClient authentication and transport", () => {
  test("authenticates before requesting actions and publishes the registry", async () => {
    const sockets: FakeSocket[] = [];
    const timers = new ManualTimers();
    const { client } = makeClient(sockets, timers);
    const statuses: string[] = [];
    const registries: unknown[] = [];
    client.on("status", (status) => statuses.push(status as string));
    client.on("actions", (actions) => registries.push(actions));

    client.start();
    expect(client.status).toBe("connecting");
    await flush();
    expect(sockets).toHaveLength(1);
    expect(sockets[0].sent).toHaveLength(0);

    const requestId = await authenticate(sockets[0]);
    expect(client.status).toBe("connected");
    expect(timers.delays()).toEqual([]);
    completeActions(sockets[0], requestId);

    expect(client.status).toBe("connected");
    expect(client.actions).toEqual([{ actionId: "com.example.action", name: "Example action" }]);
    expect(registries).toEqual([[{ actionId: "com.example.action", name: "Example action" }]]);
    expect(statuses).toContain("authenticating");
    expect(statuses).toContain("connected");
  });

  test("LAN handshake authenticates with role-separated proofs and frames", async () => {
    const sockets: FakeSocket[] = [];
    const { client, timers, key } = makeLanClient(sockets);
    const events: unknown[] = [];
    client.on("actions", (actions) => events.push(actions));
    client.start();
    await flush();
    const socket = sockets[0];
    socket.open();
    const hello = frames(socket).at(-1);
    expect(hello).toMatchObject({ protocolVersion: 1, type: "lanHello", clientId: "remote" });
    const clientNonce = Buffer.from(hello!.clientNonce as string, "hex");
    const serverNonce = Buffer.alloc(32, 2);
    socket.receive(JSON.stringify({
      protocolVersion: 1,
      type: "lanChallenge",
      clientId: "remote",
      serverNonce: encodeHex(serverNonce),
      serverProof: encodeHex(lanProof(key, "server", "remote", clientNonce, serverNonce)),
    }));
    const proof = frames(socket).at(-1);
    expect(proof).toMatchObject({ protocolVersion: 1, type: "lanProof", clientId: "remote" });
    expect(proof?.clientProof).toBe(encodeHex(lanProof(key, "client", "remote", clientNonce, serverNonce)));
    socket.receive(JSON.stringify({ protocolVersion: 1, type: "lanReady", sessionId: "opaque-session" }));
    expect(client.status).toBe("connected");
    const listFrame = frames(socket).at(-1)!;
    expect(listFrame.type).toBe("lanFrame");
    const sendKey = deriveLanFrameKey(key, "remote", clientNonce, serverNonce, "client-to-server");
    expect(doubleHmacEqual(
      lanFrameMac(sendKey, "client-to-server", listFrame.sequence as number, listFrame.payload as string),
      Buffer.from(listFrame.mac as string, "hex"),
    )).toBe(true);
    const actionsPayload = JSON.stringify({
      protocolVersion: 1,
      type: "actions",
      requestId: JSON.parse(listFrame.payload as string).requestId,
      actions: [{ actionId: "com.example.action", name: "Example action" }],
    });
    const receiveKey = deriveLanFrameKey(key, "remote", clientNonce, serverNonce, "server-to-client");
    socket.receive(JSON.stringify({
      protocolVersion: 1,
      type: "lanFrame",
      sequence: 1,
      payload: actionsPayload,
      mac: encodeHex(lanFrameMac(receiveKey, "server-to-client", 1, actionsPayload)),
    }));
    expect(events).toEqual([[{ actionId: "com.example.action", name: "Example action" }]]);
    expect(timers.delays()).toEqual([]);
    client.stop();
  });
  test("LAN rejects reflected or tampered handshake proof and wrong-key peers", async () => {
    const sockets: FakeSocket[] = [];
    const { client } = makeLanClient(sockets);
    client.start();
    await flush();
    const socket = sockets[0];
    socket.open();
    const hello = frames(socket).at(-1)!;
    const clientNonce = Buffer.from(hello.clientNonce as string, "hex");
    const serverNonce = Buffer.alloc(32, 2);
    socket.receive(JSON.stringify({
      protocolVersion: 1,
      type: "lanChallenge",
      clientId: "remote",
      serverNonce: encodeHex(serverNonce),
      serverProof: encodeHex(lanProof(Buffer.alloc(32, 0x4b), "client", "remote", clientNonce, serverNonce)),
    }));
    expect(socket.closeCalls).toBe(1);
    client.stop();

    const wrongSockets: FakeSocket[] = [];
    const wrong = makeLanClient(wrongSockets, new ManualTimers(), Buffer.alloc(32, 0x57)).client;
    wrong.start();
    await flush();
    const wrongSocket = wrongSockets[0];
    wrongSocket.open();
    const wrongHello = frames(wrongSocket).at(-1)!;
    const wrongNonce = Buffer.from(wrongHello.clientNonce as string, "hex");
    wrongSocket.receive(JSON.stringify({
      protocolVersion: 1,
      type: "lanChallenge",
      clientId: "remote",
      serverNonce: encodeHex(serverNonce),
      serverProof: encodeHex(lanProof(Buffer.alloc(32, 0x4b), "server", "remote", wrongNonce, serverNonce)),
    }));
    expect(wrongSocket.closeCalls).toBe(1);
    wrong.stop();
  });

  test("rejects non-literal loopback legacy bridge URLs before token authentication", () => {
    let tokenReads = 0;
    let socketsCreated = 0;
    const options = {
      pluginVersion: "1.0.0",
      createSocket: () => {
        socketsCreated += 1;
        return new FakeSocket();
      },
      readToken: async () => {
        tokenReads += 1;
        return "shared-token";
      },
    };

    for (const url of [
      "ws://localhost:17321/streamdeck",
      "ws://127.0.0.1:17321/streamdeck",
      "ws://[::1]:17321/streamdeck",
    ]) {
      expect(() => new BridgeClient({ ...options, url })).not.toThrow();
    }

    for (const url of [
      "ws://192.168.1.10:17321/streamdeck",
      "wss://bridge.example.test/streamdeck",
      "ws://localhost.evil.test/streamdeck",
      "ws://127.1:17321/streamdeck",
      "ws://2130706433:17321/streamdeck",
      "ws://[0:0:0:0:0:0:0:1]:17321/streamdeck",
    ]) {
      expect(() => new BridgeClient({ ...options, url })).toThrow("Legacy bridge URL must target loopback.");
    }

    expect(tokenReads).toBe(0);
    expect(socketsCreated).toBe(0);
  });
  test("falls back to the registered action ID and snapshots settings across reconnects", async () => {
    const sockets: FakeSocket[] = [];
    const timers = new ManualTimers();
    const { client } = makeClient(sockets, timers);
    client.start();
    await flush();
    const requestId = await authenticate(sockets[0], "session-snapshot-first");
    completeActions(sockets[0], requestId);

    const settings = {
      actionId: "com.example.action",
      nested: { label: "original" },
      values: ["original"],
    };
    client.upsertInstance({ instanceId: "snapshot-instance", settings });
    settings.nested.label = "mutated";
    settings.values.push("mutated");

    sockets[0].peerClose();
    timers.runNext();
    await flush();
    const reconnect = sockets[1];
    const reconnectRequestId = await authenticate(reconnect, "session-snapshot-reconnect");
    completeActions(reconnect, reconnectRequestId);

    expect(frames(reconnect)).toContainEqual(
      expect.objectContaining({
        type: "instanceAppeared",
        instanceId: "snapshot-instance",
        actionId: "com.example.action",
        settings: {
          actionId: "com.example.action",
          nested: { label: "original" },
          values: ["original"],
        },
      }),
    );
  });

  test("preserves instance identity and event order for key release", async () => {
    const sockets: FakeSocket[] = [];
    const { client } = makeClient(sockets);
    client.start();
    await flush();
    const requestId = await authenticate(sockets[0]);
    completeActions(sockets[0], requestId);

    client.upsertInstance({ instanceId: "first-instance", actionId: "com.example.action", settings: {} });
    client.upsertInstance({ instanceId: "second-instance", actionId: "com.example.action", settings: {} });
    client.keyDown("first-instance");
    client.keyUp("first-instance");
    client.keyDown("second-instance");
    client.keyUp("second-instance");

    expect(
      frames(sockets[0])
        .filter((frame) => frame.type === "keyDown" || frame.type === "keyUp")
        .map(({ type, instanceId, actionId }) => ({ type, instanceId, actionId })),
    ).toEqual([
      { type: "keyDown", instanceId: "first-instance", actionId: "com.example.action" },
      { type: "keyUp", instanceId: "first-instance", actionId: "com.example.action" },
      { type: "keyDown", instanceId: "second-instance", actionId: "com.example.action" },
      { type: "keyUp", instanceId: "second-instance", actionId: "com.example.action" },
    ]);
  });

  test("preserves independent encoder identity and rotate/push order", async () => {
    const sockets: FakeSocket[] = [];
    const { client } = makeClient(sockets);
    client.start();
    await flush();
    const requestId = await authenticate(sockets[0]);
    completeActions(sockets[0], requestId);

    client.upsertInstance({
      instanceId: "first-encoder",
      actionId: "com.example.action",
      settings: { actionId: "com.example.action", label: "First" },
      metadata: { controllerType: "encoder", device: { type: "stream-deck-plus", size: { columns: 4, rows: 1 } } },
    });
    client.upsertInstance({
      instanceId: "second-encoder",
      actionId: "com.example.action",
      settings: { actionId: "com.example.action", label: "Second" },
      metadata: { controllerType: "encoder", device: { type: "stream-deck-plus", size: { columns: 4, rows: 1 } } },
    });
    client.dialDown("first-encoder");
    client.dialRotate("first-encoder", undefined, 2, true, { actionId: "com.example.action", label: "First updated" });
    client.dialUp("first-encoder");
    client.dialRotate("second-encoder", "com.example.action", -1, false);
    client.touchTap("first-encoder", undefined, true, [123.5, 45], { actionId: "com.example.action", label: "First touched" });
    client.touchTap("second-encoder", "com.example.action", false, [800, 100]);
    client.touchTap("first-encoder", undefined, false, [-1, 50]);
    client.dialDown("wrong-instance", "com.example.action");

    expect(
      frames(sockets[0])
        .filter((frame) => ["dialDown", "dialRotate", "dialUp", "touchTap"].includes(frame.type as string))
        .map(({ type, instanceId, actionId, ticks, pressed, hold, tapPos }) => ({
          type,
          instanceId,
          actionId,
          ticks,
          pressed,
          hold,
          tapPos,
        })),
    ).toEqual([
      { type: "dialDown", instanceId: "first-encoder", actionId: "com.example.action", ticks: undefined, pressed: undefined, hold: undefined, tapPos: undefined },
      { type: "dialRotate", instanceId: "first-encoder", actionId: "com.example.action", ticks: 2, pressed: true, hold: undefined, tapPos: undefined },
      { type: "dialUp", instanceId: "first-encoder", actionId: "com.example.action", ticks: undefined, pressed: undefined, hold: undefined, tapPos: undefined },
      { type: "dialRotate", instanceId: "second-encoder", actionId: "com.example.action", ticks: -1, pressed: false, hold: undefined, tapPos: undefined },
      { type: "touchTap", instanceId: "first-encoder", actionId: "com.example.action", ticks: undefined, pressed: undefined, hold: true, tapPos: [123.5, 45] },
      { type: "touchTap", instanceId: "second-encoder", actionId: "com.example.action", ticks: undefined, pressed: undefined, hold: false, tapPos: [800, 100] },
    ]);
  });

  test("ignores unknown action IDs without emitting lifecycle frames", async () => {
    const sockets: FakeSocket[] = [];
    const { client } = makeClient(sockets);
    client.start();
    await flush();
    const requestId = await authenticate(sockets[0]);
    completeActions(sockets[0], requestId);

    client.upsertInstance({
      instanceId: "unknown-instance",
      actionId: "com.example.unknown",
      settings: { label: "ignored" },
    });
    client.keyDown("unknown-instance", "com.example.unknown");
    client.keyUp("unknown-instance", "com.example.unknown");

    expect(
      frames(sockets[0]).filter((frame) =>
        ["instanceAppeared", "instanceDisappeared", "keyDown", "keyUp", "requestAppearance"].includes(frame.type as string),
      ),
    ).toEqual([]);
  });

  test("uses the registered action ID when an instance disappears without one", async () => {
    const sockets: FakeSocket[] = [];
    const { client } = makeClient(sockets);
    client.start();
    await flush();
    const requestId = await authenticate(sockets[0]);
    completeActions(sockets[0], requestId);

    client.upsertInstance({
      instanceId: "disappearing-instance",
      settings: { actionId: "com.example.action", label: "kept" },
    });
    client.removeInstance("disappearing-instance");
    const lifecycleBeforeKeyDown = frames(sockets[0]).filter((frame) =>
      ["instanceAppeared", "instanceDisappeared", "keyDown"].includes(frame.type as string),
    );
    client.keyDown("disappearing-instance");

    expect(lifecycleBeforeKeyDown).toEqual([
      expect.objectContaining({
        type: "instanceAppeared",
        instanceId: "disappearing-instance",
        actionId: "com.example.action",
      }),
      expect.objectContaining({
        type: "instanceDisappeared",
        instanceId: "disappearing-instance",
        actionId: "com.example.action",
      }),
    ]);
    expect(
      frames(sockets[0]).filter((frame) => ["instanceAppeared", "instanceDisappeared", "keyDown"].includes(frame.type as string)),
    ).toEqual(lifecycleBeforeKeyDown);
  });


  test("rejects application responses before authentication and invalid server frames", async () => {
    const preAuthSockets: FakeSocket[] = [];
    const preAuth = makeClient(preAuthSockets);
    const preAuthErrors: unknown[] = [];
    preAuth.client.on("protocolError", (error) => preAuthErrors.push(error));

    preAuth.client.start();
    await flush();
    preAuthSockets[0].open();
    preAuthSockets[0].receive(JSON.stringify({ protocolVersion: 1, type: "actions", requestId: "early", actions: [] }));
    expect(preAuthErrors).toHaveLength(1);
    expect(preAuth.client.status).not.toBe("connected");
    preAuth.client.stop();

    const sockets: FakeSocket[] = [];
    const { client } = makeClient(sockets);
    const errors: unknown[] = [];
    client.on("protocolError", (error) => errors.push(error));
    client.start();
    await flush();
    const requestId = await authenticate(sockets[0]);
    completeActions(sockets[0], requestId);
    sockets[0].receive(JSON.stringify({ protocolVersion: 1, type: "appearance", instanceId: "", actionId: "a", title: "bad", state: 0 }));
    sockets[0].receive("{");
    expect(errors).toHaveLength(2);
  });

  test("reports a socket factory failure and schedules reconnect", async () => {
    const timers = new ManualTimers();
    const statuses: string[] = [];
    const client = new BridgeClient({
      pluginVersion: "1.0.0",
      createSocket: () => {
        throw new Error("socket setup failed");
      },
      readToken: async () => "shared-token",
      setTimeout: timers.setTimeout,
      clearTimeout: (handle: unknown) => {
        if (typeof handle !== "number") return;
        timers.clearTimeout(handle);
      },
      random: () => 0.5,
    });
    client.on("status", (status) => statuses.push(status as string));

    client.start();
    await flush();

    expect(client.status).toBe("disconnected");
    expect(statuses).toEqual(["connecting", "disconnected"]);
    expect(timers.delays()).toEqual([250]);
    client.stop();
  });

  test("contains a throwing socket close during teardown", async () => {
    const timers = new ManualTimers();
    const socket = new ThrowingCloseSocket();
    const statuses: string[] = [];
    const client = new BridgeClient({
      pluginVersion: "1.0.0",
      createSocket: () => socket,
      readToken: async () => "shared-token",
      setTimeout: timers.setTimeout,
      clearTimeout: (handle: unknown) => {
        if (typeof handle !== "number") return;
        timers.clearTimeout(handle);
      },
      random: () => 0.5,
    });
    client.on("status", (status) => statuses.push(status as string));

    client.start();
    await flush();
    client.stop();

    expect(socket.closeCalls).toBe(1);
    expect(client.status).toBe("disconnected");
    expect(statuses).toEqual(["connecting", "disconnected"]);
  });

  test("fails closed when the token is missing", async () => {
    const sockets: FakeSocket[] = [];
    const { client } = makeClient(sockets, new ManualTimers(), "");

    client.start();
    await flush();

    expect(client.status).toBe("disconnected");
    expect(sockets).toHaveLength(0);
  });
  test("reconnects when the WebSocket handshake hangs", async () => {
    const sockets: FakeSocket[] = [];
    const timers = new ManualTimers();
    const { client } = makeClient(sockets, timers);

    client.start();
    await flush();
    sockets[0].open();

    expect(client.status).toBe("authenticating");
    expect(timers.delays()).toEqual([5_000]);

    timers.runNext();

    expect(sockets[0].closeCalls).toBe(1);
    expect(client.status).toBe("disconnected");
    expect(timers.delays()).toEqual([250]);

    timers.runNext();
    await flush();
    sockets[0].peerClose();
    expect(timers.delays()).toEqual([5_000]);
    sockets[0].error();
    expect(timers.delays()).toEqual([5_000]);
    expect(sockets).toHaveLength(2);
    expect(client.status).toBe("connecting");
    client.stop();
  });
});
describe("BridgeClient reconnect and synchronization", () => {
  test("uses bounded exponential reconnect delays and resets after helloAck", async () => {
    const sockets: FakeSocket[] = [];
    const timers = new ManualTimers();
    const { client } = makeClient(sockets, timers);
    client.start();
    await flush();

    const delays: number[] = [];
    for (let attempt = 0; attempt < 10; attempt += 1) {
      sockets.at(-1)!.peerClose();
      delays.push(timers.delays()[0]);
      timers.runNext();
      await flush();
      expect(sockets.at(-1)).toBeDefined();
    }

    expect(delays).toEqual([...delays].sort((a, b) => a - b));
    expect(Math.max(...delays)).toBeLessThanOrEqual(10_000);

    const requestId = await authenticate(sockets.at(-1)!);
    completeActions(sockets.at(-1)!, requestId);
    sockets.at(-1)!.peerClose();
    expect(timers.delays()[0]).toBe(delays[0]);
  });

  test("requests a fresh registry and replays every visible instance after reconnect", async () => {
    const sockets: FakeSocket[] = [];
    const timers = new ManualTimers();
    const { client } = makeClient(sockets, timers);
    client.start();
    await flush();
    const requestId = await authenticate(sockets[0], "session-first");
    completeActions(sockets[0], requestId);

    client.upsertInstance({ instanceId: "instance-1", actionId: "com.example.action", settings: { actionId: "com.example.action" } });
    const firstConnectedFrames = frames(sockets[0]);
    expect(firstConnectedFrames.at(-1)).toMatchObject({
      type: "instanceAppeared",
      instanceId: "instance-1",
      sessionId: "session-first",
    });

    sockets[0].peerClose();
    timers.runNext();
    await flush();
    const reconnect = sockets[1];
    const reconnectRequestId = await authenticate(reconnect, "session-reconnect");
    completeActions(reconnect, reconnectRequestId);

    const postHello = frames(reconnect).filter((frame) => frame.type !== "hello");
    expect(postHello.length).toBeGreaterThan(0);
    expect(postHello.every((frame) => frame.sessionId === "session-reconnect")).toBe(true);
    const replay = postHello.filter((frame) => ["instanceAppeared", "requestAppearance"].includes(frame.type as string));
    expect(replay).toEqual([
      expect.objectContaining({ type: "instanceAppeared", instanceId: "instance-1", actionId: "com.example.action" }),
      expect.objectContaining({ type: "requestAppearance", instanceId: "instance-1", actionId: "com.example.action" }),
    ]);
  });
});

describe("BridgeClient instance lifecycle", () => {
  test("uses the homedir-based default token path", async () => {
    let capturedPath: string | undefined;
    const timers = new ManualTimers();
    const client = new BridgeClient({
      pluginVersion: "1.0.0",
      createSocket: () => new FakeSocket(),
      readToken: async (tokenPath) => {
        capturedPath = tokenPath;
        return "shared-token";
      },
      setTimeout: timers.setTimeout,
      clearTimeout: (handle: unknown) => {
        if (typeof handle !== "number") return;
        timers.clearTimeout(handle);
      },
    });

    client.start();
    await flush();

    expect(capturedPath).toBe(join(homedir(), ".hammerspoon", "streamdeck-token"));
    client.stop();
  });
  test("keeps two instances independent and drops stale input and appearance", async () => {
    const sockets: FakeSocket[] = [];
    const { client } = makeClient(sockets);
    client.start();
    await flush();
    const requestId = await authenticate(sockets[0]);
    completeActions(sockets[0], requestId);

    client.upsertInstance({ instanceId: "instance-1", actionId: "com.example.action", settings: { actionId: "com.example.action" } });
    client.upsertInstance({ instanceId: "instance-2", actionId: "com.example.action", settings: { actionId: "com.example.action" } });
    client.removeInstance("instance-1", "com.example.action");
    client.keyDown("instance-1", "com.example.action");
    client.keyDown("instance-2", "com.example.action");

    const lifecycle = frames(sockets[0]).filter((frame) => ["instanceAppeared", "instanceDisappeared", "keyDown"].includes(frame.type as string));
    expect(lifecycle).toEqual([
      expect.objectContaining({ type: "instanceAppeared", instanceId: "instance-1" }),
      expect.objectContaining({ type: "instanceAppeared", instanceId: "instance-2" }),
      expect.objectContaining({ type: "instanceDisappeared", instanceId: "instance-1" }),
      expect.objectContaining({ type: "keyDown", instanceId: "instance-2" }),
    ]);

    const appearances: unknown[] = [];
    client.on("appearance", (value) => appearances.push(value));
    sockets[0].receive(JSON.stringify({ protocolVersion: 1, type: "appearance", instanceId: "instance-1", actionId: "com.example.action", title: "stale", state: 1 }));
    sockets[0].receive(JSON.stringify({ protocolVersion: 1, type: "appearance", instanceId: "instance-2", actionId: "com.example.action", title: "live", state: 1, appearanceVersion: 1, presentationState: 2, value: "72%", indicator: 72 }));
    expect(appearances).toEqual([
      expect.objectContaining({ instanceId: "instance-2", title: "live", value: "72%", indicator: 72, presentationState: 2 }),
    ]);
  });

  test("keeps per-instance settings through updates and reconnect replay", async () => {
    const sockets: FakeSocket[] = [];
    const timers = new ManualTimers();
    const { client } = makeClient(sockets, timers);
    client.start();
    await flush();
    const requestId = await authenticate(sockets[0], "session-settings-first");
    completeActions(sockets[0], requestId);

    client.upsertInstance({
      instanceId: "profile-a-device-one",
      actionId: "com.example.action",
      settings: { actionId: "com.example.action", label: "Alpha" },
    });
    client.upsertInstance({
      instanceId: "profile-b-device-two",
      actionId: "com.example.action",
      settings: { actionId: "com.example.action", label: "Beta" },
    });
    client.upsertInstance({
      instanceId: "profile-a-device-one",
      actionId: "com.example.action",
      settings: { actionId: "com.example.action", label: "Alpha updated" },
    });

    const initialLifecycle = frames(sockets[0]).filter((frame) => frame.type === "instanceAppeared");
    expect(initialLifecycle).toEqual([
      expect.objectContaining({
        instanceId: "profile-a-device-one",
        settings: { actionId: "com.example.action", label: "Alpha" },
      }),
      expect.objectContaining({
        instanceId: "profile-b-device-two",
        settings: { actionId: "com.example.action", label: "Beta" },
      }),
      expect.objectContaining({
        instanceId: "profile-a-device-one",
        settings: { actionId: "com.example.action", label: "Alpha updated" },
      }),
    ]);

    sockets[0].peerClose();
    timers.runNext();
    await flush();
    const reconnect = sockets[1];
    const reconnectRequestId = await authenticate(reconnect, "session-settings-reconnect");
    completeActions(reconnect, reconnectRequestId);

    expect(frames(reconnect).filter((frame) => frame.type === "instanceAppeared")).toEqual([
      expect.objectContaining({
        instanceId: "profile-a-device-one",
        settings: { actionId: "com.example.action", label: "Alpha updated" },
      }),
      expect.objectContaining({
        instanceId: "profile-b-device-two",
        settings: { actionId: "com.example.action", label: "Beta" },
      }),
    ]);

    client.removeInstance("profile-a-device-one");
    client.keyDown("profile-a-device-one", "com.example.action");
    client.keyDown("profile-b-device-two", "com.example.action");
    const liveInput = frames(reconnect).filter((frame) => frame.type === "keyDown");
    expect(liveInput).toEqual([
      expect.objectContaining({ instanceId: "profile-b-device-two", actionId: "com.example.action" }),
    ]);

    const appearances: unknown[] = [];
    client.on("appearance", (value) => appearances.push(value));
    reconnect.receive(JSON.stringify({
      protocolVersion: 1,
      type: "appearance",
      instanceId: "profile-a-device-one",
      actionId: "com.example.action",
      title: "stale",
      state: 1,
    }));
    reconnect.receive(JSON.stringify({
      protocolVersion: 1,
      type: "appearance",
      instanceId: "profile-b-device-two",
      actionId: "com.example.action",
      title: "live",
      state: 1,
    }));
    expect(appearances).toEqual([
      expect.objectContaining({ instanceId: "profile-b-device-two", title: "live" }),
    ]);
  });

  test("replaces an instance action without leaving the old Lua context visible", async () => {
    const sockets: FakeSocket[] = [];
    const { client } = makeClient(sockets);
    client.start();
    await flush();
    const requestId = await authenticate(sockets[0]);
    completeActions(sockets[0], requestId);

    client.upsertInstance({
      instanceId: "reused-instance",
      actionId: "com.example.action",
      settings: { actionId: "com.example.action" },
    });
    client.upsertInstance({
      instanceId: "reused-instance",
      settings: { label: "unconfigured" },
    });

    expect(frames(sockets[0]).filter((frame) => ["instanceAppeared", "instanceDisappeared"].includes(frame.type as string))).toEqual([
      expect.objectContaining({
        type: "instanceAppeared",
        instanceId: "reused-instance",
        actionId: "com.example.action",
      }),
      expect.objectContaining({
        type: "instanceDisappeared",
        instanceId: "reused-instance",
        actionId: "com.example.action",
      }),
    ]);
  });
  test("ignores stale disappearance after an instance action replacement", async () => {
    const sockets: FakeSocket[] = [];
    const { client } = makeClient(sockets);
    client.start();
    await flush();
    const requestId = await authenticate(sockets[0]);
    completeActions(sockets[0], requestId);

    client.upsertInstance({
      instanceId: "reused-instance",
      actionId: "com.example.action",
      settings: { actionId: "com.example.action" },
    });
    client.upsertInstance({
      instanceId: "reused-instance",
      actionId: "com.example.replaced",
      settings: { actionId: "com.example.replaced" },
    });
    client.removeInstance("reused-instance", "com.example.action");
    client.upsertInstance({
      instanceId: "reused-instance",
      actionId: "com.example.action",
      settings: { actionId: "com.example.action" },
    });

    expect(frames(sockets[0]).filter((frame) => ["instanceAppeared", "instanceDisappeared"].includes(frame.type as string))).toEqual([
      expect.objectContaining({
        type: "instanceAppeared",
        instanceId: "reused-instance",
        actionId: "com.example.action",
      }),
      expect.objectContaining({
        type: "instanceDisappeared",
        instanceId: "reused-instance",
        actionId: "com.example.action",
      }),
      expect.objectContaining({
        type: "instanceDisappeared",
        instanceId: "reused-instance",
        actionId: "com.example.replaced",
      }),
      expect.objectContaining({
        type: "instanceAppeared",
        instanceId: "reused-instance",
        actionId: "com.example.action",
      }),
    ]);
  });

  test("correlates feedback to visible instances and isolates listener failures", async () => {
    const sockets: FakeSocket[] = [];
    const { client } = makeClient(sockets);
    const feedback: unknown[] = [];
    client.on("feedback", () => {
      throw new Error("feedback listener failed");
    });
    client.on("feedback", (value) => feedback.push(value));
    client.start();
    await flush();
    const requestId = await authenticate(sockets[0]);
    completeActions(sockets[0], requestId);
    client.upsertInstance({ instanceId: "live", actionId: "com.example.action", settings: {} });
    sockets[0].receive(JSON.stringify({
      protocolVersion: 1,
      type: "feedback",
      instanceId: "stale",
      actionId: "com.example.action",
      kind: "error",
      message: "Nope",
      durationMs: 250,
    }));
    sockets[0].receive(JSON.stringify({
      protocolVersion: 1,
      type: "feedback",
      instanceId: "live",
      actionId: "com.example.action",
      kind: "success",
      message: "Done",
      durationMs: 250,
    }));
    expect(feedback).toEqual([
      expect.objectContaining({ instanceId: "live", kind: "success", message: "Done", durationMs: 250 }),
    ]);
  });

  test("ignores empty frames but reports malformed non-empty frames", async () => {
    const sockets: FakeSocket[] = [];
    const { client } = makeClient(sockets);
    const errors: unknown[] = [];
    client.on("protocolError", (error) => errors.push(error));
    client.start();
    await flush();
    const requestId = await authenticate(sockets[0]);
    completeActions(sockets[0], requestId);

    sockets[0].receive("");
    expect(errors).toHaveLength(0);
    sockets[0].receive("not json");
    expect(errors).toHaveLength(1);
  });

  test("stop cancels pending reconnect and prevents a new socket", async () => {
    const sockets: FakeSocket[] = [];
    const timers = new ManualTimers();
    const { client } = makeClient(sockets, timers);
    client.start();
    await flush();
    sockets[0].peerClose();
    expect(sockets).toHaveLength(1);
    client.stop();
    timers.runAll();

    expect(sockets).toHaveLength(1);
    expect(client.status).toBe("disconnected");
  });
});
describe("BridgeClient redacted diagnostics", () => {
  test("publishes auth failures without token material", async () => {
    const sockets: FakeSocket[] = [];
    const { client } = makeClient(sockets, new ManualTimers(), "");
    client.start();
    await flush();

    expect(client.diagnostics.latest).toMatchObject({ area: "auth", code: "TOKEN_UNAVAILABLE" });
    expect(JSON.stringify(client.diagnostics)).not.toContain("shared-token");
    client.stop();
  });

  test("covers schema, registry, callback, and reconnect failures with safe output", async () => {
    const sockets: FakeSocket[] = [];
    const timers = new ManualTimers();
    const { client } = makeClient(sockets, timers);
    client.on("diagnostics", (value) => {
      expect(JSON.stringify(value)).not.toContain("secret");
    });
    client.start();
    await flush();
    const requestId = await authenticate(sockets[0]);
    completeActions(sockets[0], requestId);

    sockets[0].receive("malformed-secret-frame");
    expect(client.diagnostics.latest).toMatchObject({ area: "schema", code: "MALFORMED_MESSAGE" });
    sockets[0].receive(JSON.stringify({
      protocolVersion: 1,
      type: "error",
      code: "UNKNOWN_ACTION",
      message: "registry-secret",
      instanceId: "instance-secret",
    }));
    expect(client.diagnostics.latest).toMatchObject({ area: "registry", code: "UNKNOWN_ACTION" });
    sockets[0].receive(JSON.stringify({
      protocolVersion: 1,
      type: "error",
      code: "CALLBACK_FAILED",
      message: "callback-secret",
      instanceId: "instance-secret",
    }));
    expect(client.diagnostics.latest).toMatchObject({ area: "callback", code: "CALLBACK_FAILED" });

    sockets[0].peerClose();
    expect(client.diagnostics.latest).toMatchObject({ area: "reconnect", code: "RECONNECTING" });
    expect(client.diagnostics.retryInMs).toBe(250);
    expect(client.diagnostics.port).toBe(17321);
    expect(client.diagnostics.protocolVersion).toBe(1);
    expect(client.diagnostics.pluginVersion).toBe("1.0.0");
    expect(JSON.stringify(client.diagnostics)).not.toMatch(/secret|session-|message|instanceId/);
    client.stop();
  });
  test("retains a schema cause across a later transport reconnect", async () => {
    const sockets: FakeSocket[] = [];
    const timers = new ManualTimers();
    const { client } = makeClient(sockets, timers);
    client.start();
    await flush();
    const requestId = await authenticate(sockets[0]);
    completeActions(sockets[0], requestId);

    sockets[0].receive("malformed-secret-frame");
    sockets[0].peerClose();

    expect(client.diagnostics.latest).toMatchObject({ area: "schema", code: "MALFORMED_MESSAGE" });
    expect(client.diagnostics.retryInMs).toBe(250);
    client.stop();
  });
  test("retains an authenticated auth cause across a later transport reconnect", async () => {
    const sockets: FakeSocket[] = [];
    const timers = new ManualTimers();
    const { client } = makeClient(sockets, timers);
    client.start();
    await flush();
    const requestId = await authenticate(sockets[0]);
    completeActions(sockets[0], requestId);

    sockets[0].receive(JSON.stringify({
      protocolVersion: 1,
      type: "error",
      code: "AUTH_REQUIRED",
      message: "auth-secret",
      requestId: "request-secret",
      instanceId: "instance-secret",
    }));
    sockets[0].peerClose();

    expect(client.diagnostics.latest).toMatchObject({ area: "auth", code: "AUTH_REQUIRED" });
    expect(client.diagnostics.retryInMs).toBe(250);
    expect(JSON.stringify(client.diagnostics)).not.toMatch(/secret|requestId|instanceId/);
    client.stop();
  });



  test("bounds and suppresses repeated diagnostic log lines", async () => {
    const sockets: FakeSocket[] = [];
    const timers = new ManualTimers();
    const logs: string[] = [];
    const client = new BridgeClient({
      pluginVersion: "plugin version/1.0.0",
      createSocket: () => {
        throw new Error("socket secret");
      },
      readToken: async () => "token secret",
      setTimeout: timers.setTimeout,
      clearTimeout: timers.clearTimeout,
      random: () => 0.5,
      now: () => new Date("2026-07-17T00:00:00.000Z"),
      logger: (line) => logs.push(line),
    });
    client.start();
    await flush();
    timers.runNext();
    await flush();
    expect(logs.every((line) => line.startsWith("bridge-status "))).toBe(true);
    expect(logs.every((line) => JSON.parse(line.slice(14)).version === 1)).toBe(true);
    expect(logs).toHaveLength(3);
    expect(logs.every((line) => line.length <= 384)).toBe(true);
    expect(logs.every((line) => !line.includes("secret"))).toBe(true);
    expect(client.diagnostics.pluginVersion).toBe("pluginversion1.0.0");
    client.stop();
    expect(sockets).toEqual([]);
  });
});
