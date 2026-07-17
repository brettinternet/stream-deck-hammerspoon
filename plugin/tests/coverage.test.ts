import { describe, expect, test } from "bun:test";
import { BridgeClient } from "../src/bridge";
import {
  parseServerMessage,
  serializeClientMessage,
  type ClientMessage,
  type ServerMessage,
} from "../src/protocol";

type Listener = (event?: unknown) => void;

class FakeSocket {
  static readonly OPEN = 1;
  static readonly CLOSED = 3;
  readyState = 0;
  sent: string[] = [];
  closeCalls = 0;
  throwOnSend = false;
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
    if (this.throwOnSend) throw new Error("socket send failed");
    this.sent.push(frame);
  }

  open(): void {
    this.readyState = FakeSocket.OPEN;
    this.emit("open");
  }

  receive(frame: string): void {
    this.emit("message", frame);
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

class ManualTimers {
  private nextId = 1;
  private callbacks = new Map<number, { delay: number; callback: () => void }>();

  readonly setTimeout = (callback: () => void, delay: number): number => {
    const id = this.nextId++;
    this.callbacks.set(id, { callback, delay });
    return id;
  };

  readonly clearTimeout = (id: unknown): void => {
    if (typeof id === "number") this.callbacks.delete(id);
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
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

function makeClient(sockets: FakeSocket[], timers: ManualTimers) {
  const client = new BridgeClient({
    url: "ws://127.0.0.1:17321/stream",
    tokenPath: "/tmp/streamdeck-token",
    pluginVersion: "1.0.0",
    createSocket: () => {
      const socket = new FakeSocket();
      sockets.push(socket);
      return socket;
    },
    readToken: async () => "shared-token",
    setTimeout: timers.setTimeout,
    clearTimeout: timers.clearTimeout,
    random: () => 0.5,
  });
  return client;
}

function frames(socket: FakeSocket): Array<Record<string, unknown>> {
  return socket.sent.map((frame) => JSON.parse(frame) as Record<string, unknown>);
}

let nextSessionId = 1;

async function authenticate(socket: FakeSocket): Promise<string> {
  await flush();
  socket.open();
  expect(frames(socket).at(-1)).toMatchObject({ type: "hello", token: "shared-token" });
  const sessionId = `coverage-session-${nextSessionId++}`;
  socket.receive(JSON.stringify({ protocolVersion: 1, type: "helloAck", sessionId } satisfies ServerMessage));
  const request = frames(socket).find((frame) => frame.type === "listActions");
  expect(request).toBeDefined();
  return request!.requestId as string;
}

function completeActions(socket: FakeSocket, requestId: string): void {
  socket.receive(
    JSON.stringify({
      protocolVersion: 1,
      type: "actions",
      requestId,
      actions: [{ actionId: "com.example.action", name: "Example action" }],
    } satisfies ServerMessage),
  );
}

describe("focused BridgeClient and protocol coverage", () => {
  test("emits a full pre-auth AUTH_FAILED error, closes, and reconnects", async () => {
    const sockets: FakeSocket[] = [];
    const timers = new ManualTimers();
    const client = makeClient(sockets, timers);
    const errors: unknown[] = [];
    client.on("protocolError", (error) => errors.push(error));

    client.start();
    await flush();
    sockets[0].open();
    sockets[0].receive(
      JSON.stringify({
        protocolVersion: 1,
        type: "error",
        code: "AUTH_FAILED",
        message: "Token rejected",
        requestId: "auth-request",
        instanceId: "instance-1",
      } satisfies ServerMessage),
    );

    expect(errors).toEqual([
      {
        code: "AUTH_FAILED",
        message: "Authentication failed.",
        requestId: "auth-request",
        instanceId: "instance-1",
      },
    ]);
    expect(sockets[0].closeCalls).toBe(1);
    expect(client.status).toBe("disconnected");
    expect(timers.delays()).toEqual([250]);

    timers.runNext();
    await flush();
    expect(sockets).toHaveLength(2);
    expect(client.status).toBe("connecting");
    client.stop();
  });

  test("clears an errored pending request so requestActions sends a fresh request", async () => {
    const sockets: FakeSocket[] = [];
    const timers = new ManualTimers();
    const client = makeClient(sockets, timers);
    const errors: unknown[] = [];
    client.on("protocolError", (error) => errors.push(error));

    client.start();
    await flush();
    const firstRequestId = await authenticate(sockets[0]);
    sockets[0].receive(
      JSON.stringify({
        protocolVersion: 1,
        type: "error",
        code: "CALLBACK_FAILED",
        message: "Unable to list actions",
        requestId: firstRequestId,
      } satisfies ServerMessage),
    );

    client.requestActions();
    const listRequests = frames(sockets[0]).filter((frame) => frame.type === "listActions");
    expect(errors).toEqual([
      {
        code: "CALLBACK_FAILED",
        message: "Action callback failed.",
        requestId: firstRequestId,
      },
    ]);
    expect(listRequests).toHaveLength(2);
    expect(listRequests[1]?.requestId).not.toBe(firstRequestId);
    client.stop();
  });

  test("handles a throwing send by going offline and scheduling reconnect", async () => {
    const sockets: FakeSocket[] = [];
    const timers = new ManualTimers();
    const client = makeClient(sockets, timers);
    const appearances: unknown[] = [];
    client.on("appearance", (appearance) => appearances.push(appearance));

    client.start();
    await flush();
    const requestId = await authenticate(sockets[0]);
    completeActions(sockets[0], requestId);
    client.upsertInstance({
      instanceId: "instance-1",
      actionId: "com.example.action",
      settings: { actionId: "com.example.action" },
    });

    sockets[0].throwOnSend = true;
    client.keyDown("instance-1");

    expect(client.status).toBe("disconnected");
    expect(appearances).toEqual([
      {
        type: "appearance",
        protocolVersion: 1,
        instanceId: "instance-1",
        actionId: "com.example.action",
        title: "Hammerspoon Offline",
        state: 0,
      },
    ]);
    expect(timers.delays()).toEqual([250]);

    timers.runNext();
    await flush();
    expect(sockets).toHaveLength(2);
    expect(client.status).toBe("connecting");
    client.stop();
  });

  test("rejects duplicate raw JSON object keys", () => {
    const duplicateKeys = '{"protocolVersion":1,"type":"helloAck","sessionId":"first","sessionId":"second"}';

    expect(() => parseServerMessage(duplicateKeys)).toThrow("duplicate object fields");
  });

  test("rejects runtime-invalid NaN instance settings", () => {
    const invalidMessage = {
      protocolVersion: 1,
      type: "instanceAppeared",
      sessionId: "session-1",
      instanceId: "instance-1",
      actionId: "com.example.action",
      settings: { value: Number.NaN },
    } as unknown as ClientMessage;

    expect(() => serializeClientMessage(invalidMessage)).toThrow("settings must contain JSON values");
  });
});
