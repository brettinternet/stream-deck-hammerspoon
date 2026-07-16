import { describe, expect, test } from "bun:test";
import {
  parseServerMessage,
  serializeClientMessage,
  type ClientMessage,
  type ServerMessage,
} from "../src/protocol";

const sessionId = "session-01";

const hello: ClientMessage = {
  protocolVersion: 1,
  type: "hello",
  token: "example-token",
  pluginVersion: "1.0.0",
};

const helloAck: ServerMessage = {
  protocolVersion: 1,
  type: "helloAck",
  sessionId,
};

const listActions: ClientMessage = {
  protocolVersion: 1,
  type: "listActions",
  sessionId,
  requestId: "req-01",
};

const actions: ServerMessage = {
  protocolVersion: 1,
  type: "actions",
  requestId: "req-01",
  actions: [
    { actionId: "com.example.volumeUp", name: "Volume Up" },
    { actionId: "com.example.mute", name: "Mute", settingsSchema: [] },
  ],
};

const instanceAppeared: ClientMessage = {
  protocolVersion: 1,
  type: "instanceAppeared",
  sessionId,
  instanceId: "deck-instance-01",
  actionId: "com.example.volumeUp",
  settings: { actionId: "com.example.volumeUp" },
};

const appearance: ServerMessage = {
  protocolVersion: 1,
  type: "appearance",
  instanceId: "deck-instance-01",
  actionId: "com.example.volumeUp",
  title: "Volume +",
  state: 0,
};

const requestAppearance: ClientMessage = {
  protocolVersion: 1,
  type: "requestAppearance",
  sessionId,
  instanceId: "deck-instance-01",
  actionId: "com.example.volumeUp",
};

const keyDown: ClientMessage = {
  protocolVersion: 1,
  type: "keyDown",
  sessionId,
  instanceId: "deck-instance-01",
  actionId: "com.example.volumeUp",
};

const instanceDisappeared: ClientMessage = {
  protocolVersion: 1,
  type: "instanceDisappeared",
  sessionId,
  instanceId: "deck-instance-01",
  actionId: "com.example.volumeUp",
};

describe("protocol examples", () => {
  test("round-trips the handshake example", () => {
    expect(JSON.parse(serializeClientMessage(hello))).toEqual(hello);
    expect(parseServerMessage(JSON.stringify(helloAck))).toEqual(helloAck);
  });

  test("round-trips the action-list example", () => {
    expect(JSON.parse(serializeClientMessage(listActions))).toEqual(listActions);
    expect(parseServerMessage(JSON.stringify(actions))).toEqual(actions);
  });

  test("round-trips every appearance example message", () => {
    for (const message of [instanceAppeared, requestAppearance, keyDown, instanceDisappeared]) {
      expect(JSON.parse(serializeClientMessage(message))).toEqual(message);
    }
    expect(parseServerMessage(JSON.stringify(appearance))).toEqual(appearance);
  });
});

describe("protocol direction and validation", () => {
  test("rejects plugin-to-server messages in the server-message parser", () => {
    for (const message of [hello, listActions, instanceAppeared, requestAppearance, keyDown, instanceDisappeared]) {
      expect(() => parseServerMessage(JSON.stringify(message))).toThrow();
    }
  });

  test("rejects malformed JSON and envelopes", () => {
    const malformed = [
      "not json",
      "[]",
      JSON.stringify({}),
      JSON.stringify({ protocolVersion: "1", type: "helloAck" }),
      JSON.stringify({ protocolVersion: 2, type: "helloAck" }),
      JSON.stringify({ protocolVersion: 1, type: 3 }),
    ];

    for (const frame of malformed) {
      expect(() => parseServerMessage(frame)).toThrow();
    }
  });

  test("rejects malformed appearance payloads", () => {
    const malformedAppearances = [
      { ...appearance, title: 42 },
      { ...appearance, state: 2 },
      { ...appearance, state: true },
      { ...appearance, instanceId: "" },
      { ...appearance, actionId: undefined },
    ];

    for (const message of malformedAppearances) {
      expect(() => parseServerMessage(JSON.stringify(message))).toThrow();
    }
  });

  test("rejects duplicate action IDs in one registry response", () => {
    const duplicateActions = {
      protocolVersion: 1,
      type: "actions",
      requestId: "req-duplicate",
      actions: [
        { actionId: "com.example.same", name: "First" },
        { actionId: "com.example.same", name: "Second" },
      ],
    };

    expect(() => parseServerMessage(JSON.stringify(duplicateActions))).toThrow();
  });

  test("rejects unknown message types", () => {
    expect(() =>
      parseServerMessage(JSON.stringify({ protocolVersion: 1, type: "futureMessage" })),
    ).toThrow();
  });
});
