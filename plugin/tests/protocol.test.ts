import { describe, expect, test } from "bun:test";
import {
  parseServerMessage,
  sanitizeDeviceMetadata,
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
    {
      actionId: "com.example.mute",
      name: "Mute",
      settingsSchemaVersion: 1,
      settingsSchema: [
        { type: "text", key: "label", minLength: 1, maxLength: 32, default: "Mute" },
        { type: "number", key: "volume", min: 0, max: 100, step: 1, default: 50 },
        { type: "boolean", key: "muted", default: false },
        {
          type: "select",
          key: "mode",
          options: [{ value: "normal", label: "Normal" }, { value: "silent", label: "Silent" }],
          default: "normal",
        },
      ],
    },
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

const extendedAppearance: ServerMessage = {
  ...appearance,
  appearanceVersion: 1,
  foregroundColor: "#FFFFFF",
  backgroundColor: "#000000",
  progress: 0.5,
  badge: "OK",
};

const encoderAppearance: ServerMessage = {
  ...appearance,
  appearanceVersion: 1,
  value: "72%",
  indicator: 72,
  icon: { kind: "bundled", name: "hammerspoon" },
};


const feedback: ServerMessage = {
  protocolVersion: 1,
  type: "feedback",
  instanceId: "deck-instance-01",
  actionId: "com.example.volumeUp",
  kind: "success",
  message: "Completed",
  durationMs: 250,
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

const keyUp: ClientMessage = {
  protocolVersion: 1,
  type: "keyUp",
  sessionId,
  instanceId: "deck-instance-01",
  actionId: "com.example.volumeUp",
};

const dialDown: ClientMessage = {
  protocolVersion: 1,
  type: "dialDown",
  sessionId,
  instanceId: "encoder-instance-01",
  actionId: "com.example.volumeUp",
};

const dialRotate: ClientMessage = {
  protocolVersion: 1,
  type: "dialRotate",
  sessionId,
  instanceId: "encoder-instance-01",
  actionId: "com.example.volumeUp",
  ticks: -2,
  pressed: true,
};

const dialUp: ClientMessage = {
  protocolVersion: 1,
  type: "dialUp",
  sessionId,
  instanceId: "encoder-instance-01",
  actionId: "com.example.volumeUp",
};

const touchTap: ClientMessage = {
  protocolVersion: 1,
  type: "touchTap",
  sessionId,
  instanceId: "encoder-instance-01",
  actionId: "com.example.volumeUp",
  hold: true,
  tapPos: [799.5, 100],
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

  test("round-trips legacy and versioned appearance messages", () => {
    for (const message of [instanceAppeared, requestAppearance, keyDown, keyUp, instanceDisappeared]) {
      expect(JSON.parse(serializeClientMessage(message))).toEqual(message);
    }
    for (const message of [dialDown, dialRotate, dialUp, touchTap]) {
      expect(JSON.parse(serializeClientMessage(message))).toEqual(message);
    }
    expect(parseServerMessage(JSON.stringify(appearance))).toEqual(appearance);
    expect(parseServerMessage(JSON.stringify(extendedAppearance))).toEqual(extendedAppearance);
    expect(parseServerMessage(JSON.stringify(encoderAppearance))).toEqual(encoderAppearance);
    expect(parseServerMessage(JSON.stringify(feedback))).toEqual(feedback);
  });
});

describe("protocol direction and validation", () => {
  test("rejects plugin-to-server messages in the server-message parser", () => {
    for (const message of [
      hello,
      listActions,
      instanceAppeared,
      requestAppearance,
      keyDown,
      keyUp,
      dialDown,
      dialRotate,
      dialUp,
      touchTap,
      instanceDisappeared,
    ]) {
      expect(() => parseServerMessage(JSON.stringify(message))).toThrow();
    }
  });

  test("validates versioned encoder payloads", () => {
    for (const message of [dialDown, dialRotate, dialUp, touchTap]) {
      expect(() => serializeClientMessage(message)).not.toThrow();
    }
    for (const message of [
      { ...dialRotate, ticks: 1.5 },
      { ...dialRotate, ticks: Number.NaN },
      { ...dialRotate, pressed: "true" },
      { ...dialRotate, instanceId: "" },
      { ...touchTap, hold: "true" },
      { ...touchTap, tapPos: [-1, 50] },
      { ...touchTap, tapPos: [400, 101] },
      { ...touchTap, tapPos: [400] },
      { ...touchTap, tapPos: [400, 50, 1] },
    ]) {
      expect(() => serializeClientMessage(message as ClientMessage)).toThrow();
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
      { ...extendedAppearance, appearanceVersion: 2 },
      { ...extendedAppearance, foregroundColor: "#fff" },
      { ...extendedAppearance, backgroundColor: "red" },
      { ...extendedAppearance, progress: -0.01 },
      { ...extendedAppearance, progress: 1.01 },
      { ...extendedAppearance, badge: "12345" },
      { ...extendedAppearance, badge: "\ud800" },
      { ...extendedAppearance, badge: "\u0000" },
      { ...appearance, progress: 0.5 },
      { ...encoderAppearance, value: undefined },
      { ...encoderAppearance, indicator: undefined },
      { ...encoderAppearance, value: "" },
      { ...encoderAppearance, value: "\u0000" },
      { ...encoderAppearance, value: "😀".repeat(17) },
      { ...encoderAppearance, value: "\ud800" },
      { ...encoderAppearance, indicator: -0.01 },
      { ...encoderAppearance, indicator: 100.01 },
      { ...encoderAppearance, indicator: Number.NaN },
      { ...encoderAppearance, indicator: Number.POSITIVE_INFINITY },
      { ...encoderAppearance, foregroundColor: "#FFFFFF" },
      { ...encoderAppearance, backgroundColor: "#000000" },
      { ...encoderAppearance, progress: 0.5 },
      { ...encoderAppearance, badge: "OK" },
    ];

    for (const message of malformedAppearances) {
      expect(() => parseServerMessage(JSON.stringify(message))).toThrow();
    }
  });

  test("accepts appearance value boundaries and Unicode scalars", () => {
    expect(parseServerMessage(JSON.stringify({ ...encoderAppearance, value: "x", indicator: 0 }))).toEqual({
      ...encoderAppearance,
      value: "x",
      indicator: 0,
    });
    expect(parseServerMessage(JSON.stringify({
      ...encoderAppearance,
      value: "😀".repeat(16),
      indicator: 100,
    }))).toEqual({
      ...encoderAppearance,
      value: "😀".repeat(16),
      indicator: 100,
    });
  });

  test("validates bundled fallback and custom image safety bounds", () => {
    const svg = "PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA3MiA3MiI+PHJlY3QgeD0iLjUiIHk9IjAiIHdpZHRoPSI3MS41IiBoZWlnaHQ9IjcyIi8+PC9zdmc+";
    expect(parseServerMessage(JSON.stringify({ ...appearance, appearanceVersion: 1, icon: { kind: "bundled", name: "hammerspoon" } }))).toBeDefined();
    const png = "iVBORw0KGgoAAAANSUhEUgAAAEgAAABICAYAAABV7bNHAAAAK0lEQVR4nO3BAQ0AAADCoPdPbQ43oAAAAAAAAAAAAAAAAAAAAAAAAAAAujBRSAAB/UYCuQAAAABJRU5ErkJggg==";
    const trailingPng = "iVBORw0KGgoAAAANSUhEUgAAAEgAAABICAYAAABV7bNHAAAALElEQVR4nO3BAQ0AAADCoPdPbQ43oAAAAAAAAAAAAAAAAAAAAAAAAAAAujBRSAABAGBCoqcAAAAASUVORK5CYII=";
    const corruptPng = Buffer.from(png, "base64");
    corruptPng[29] ^= 1;
    expect(parseServerMessage(JSON.stringify({
      ...appearance,
      appearanceVersion: 1,
      icon: { kind: "custom", mediaType: "image/png", dataBase64: png },
    }))).toBeDefined();
    expect(parseServerMessage(JSON.stringify({ ...appearance, appearanceVersion: 1, icon: { kind: "bundled", name: "future-icon" } }))).toBeDefined();
    expect(parseServerMessage(JSON.stringify({
      ...appearance,
      appearanceVersion: 1,
      icon: { kind: "custom", mediaType: "image/svg+xml", dataBase64: svg },
    }))).toBeDefined();
    for (const icon of [
      { kind: "bundled", name: "bad_name" },
      { kind: "custom", mediaType: "image/png", dataBase64: "not-base64" },
      { kind: "custom", mediaType: "image/png", dataBase64: corruptPng.toString("base64") },
      { kind: "custom", mediaType: "image/png", dataBase64: trailingPng },
      { kind: "custom", mediaType: "image/png", dataBase64: "iVBORw0KGgoAAAANSUhEUgAAAEgAAABICAYAAABV7bNHAAAAL0lEQVR4nO3BAQ0AAADCoPdPbQ43oAAAAAAAAAAAAAAAAAAAAAAAAAAAujBRSAABUUgAAV2q6GkAAAAASUVORK5CYII=" },
      { kind: "custom", mediaType: "image/png", dataBase64: "iVBORw0KGgoAAAANSUhEUgAAAEgAAABICAAAAABwhuybAAAAHUlEQVR4nO3BMQEAAADCoPVPbQo/oAAAAAAAuhoUiAABAaPFZ1kAAAAASUVORK5CYII=" },
      { kind: "custom", mediaType: "image/svg+xml", dataBase64: "eDxzdmcgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiB2aWV3Qm94PSIwIDAgNzIgNzIiPjwvc3ZnPg==" },
      { kind: "custom", mediaType: "image/svg+xml", dataBase64: Buffer.from("<svg><script/></svg>").toString("base64") },
      { kind: "custom", mediaType: "image/svg+xml", dataBase64: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 72 72" style="fill:#fff"></svg>').toString("base64") },
      { kind: "custom", mediaType: "image/svg+xml", dataBase64: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" xmlns:foreign="urn:x" viewBox="0 0 72 72"></svg>').toString("base64") },
      { kind: "custom", mediaType: "image/svg+xml", dataBase64: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 72 72"><g></svg>').toString("base64") },
      { kind: "custom", mediaType: "image/svg+xml", dataBase64: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 72 72">${"x".repeat(16384)}</svg>`).toString("base64") },
    ]) {
      expect(() => parseServerMessage(JSON.stringify({ ...appearance, appearanceVersion: 1, icon }))).toThrow();
    }
  });

  test("rejects unsafe feedback messages and duration bounds", () => {
    const maxUnicodeFeedback = { ...feedback, message: "😀".repeat(256) };
    expect(parseServerMessage(JSON.stringify(maxUnicodeFeedback))).toEqual(maxUnicodeFeedback);
    expect(() => parseServerMessage(JSON.stringify({ ...feedback, message: "😀".repeat(257) }))).toThrow();
    const invalidFeedback = [
      { ...feedback, message: "" },
      { ...feedback, message: "x".repeat(257) },
      { ...feedback, message: "\u0000" },
      { ...feedback, message: "\u007f" },
      { ...feedback, message: "\ud800" },
      { ...feedback, durationMs: 99 },
      { ...feedback, durationMs: 10001 },
      { ...feedback, durationMs: Number.NaN },
      { ...feedback, kind: "warning" },
    ];
    for (const message of invalidFeedback) {
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

describe("versioned settings schema compatibility", () => {
  const actionMessage = (action: Record<string, unknown>) =>
    JSON.stringify({
      protocolVersion: 1,
      type: "actions",
      requestId: "settings",
      actions: [{ actionId: "com.example.settings", name: "Settings", ...action }],
    });

  test("accepts legacy opaque arrays and explicit supported fields", () => {
    expect(parseServerMessage(actionMessage({ settingsSchema: [{ arbitrary: true }] }))).toBeDefined();
    expect(
      parseServerMessage(
        actionMessage({
          settingsSchemaVersion: 1,
          settingsSchema: [
            { type: "text", key: "text", default: "ok", minLength: 1, maxLength: 4 },
            { type: "number", key: "number", default: 2, min: 0, max: 4, step: 1 },
            { type: "boolean", key: "boolean", default: true },
            {
              type: "select",
              key: "select",
              options: [{ value: "one", label: "One" }, { value: "two", label: "Two" }],
              default: "one",
            },
          ],
        }),
      ),
    ).toBeDefined();
  });

  test("requires settingsSchema when settingsSchemaVersion is 1", () => {
    expect(() => parseServerMessage(actionMessage({ settingsSchemaVersion: 1 }))).toThrow(/settingsSchema/);
  });

  test("accepts boolean fields without kind-specific constraints", () => {
    expect(
      parseServerMessage(
        actionMessage({
          settingsSchemaVersion: 1,
          settingsSchema: [{ type: "boolean", key: "enabled", label: "Enabled", required: true, default: false }],
        }),
      ),
    ).toBeDefined();
  });

  test("rejects text bounds and defaults outside lower or upper limits", () => {
    expect(() =>
      parseServerMessage(
        actionMessage({
          settingsSchemaVersion: 1,
          settingsSchema: [{ type: "text", key: "x", minLength: 4, maxLength: 3 }],
        }),
      ),
    ).toThrow(
      'Invalid server message: settingsSchema action 0 field 0: minLength must not exceed maxLength.',
    );

    expect(() =>
      parseServerMessage(
        actionMessage({
          settingsSchemaVersion: 1,
          settingsSchema: [{ type: "text", key: "x", default: "a", minLength: 2 }],
        }),
      ),
    ).toThrow(
      'Invalid server message: settingsSchema action 0 field 0: default is outside the text length bounds.',
    );

    expect(() =>
      parseServerMessage(
        actionMessage({
          settingsSchemaVersion: 1,
          settingsSchema: [{ type: "text", key: "x", default: "abcd", maxLength: 3 }],
        }),
      ),
    ).toThrow(
      'Invalid server message: settingsSchema action 0 field 0: default is outside the text length bounds.',
    );
  });

  test("rejects number defaults outside lower or upper limits", () => {
    expect(() =>
      parseServerMessage(
        actionMessage({
          settingsSchemaVersion: 1,
          settingsSchema: [{ type: "number", key: "x", default: 1, min: 2 }],
        }),
      ),
    ).toThrow(
      'Invalid server message: settingsSchema action 0 field 0: default is outside the number bounds.',
    );

    expect(() =>
      parseServerMessage(
        actionMessage({
          settingsSchemaVersion: 1,
          settingsSchema: [{ type: "number", key: "x", default: 4, max: 3 }],
        }),
      ),
    ).toThrow(
      'Invalid server message: settingsSchema action 0 field 0: default is outside the number bounds.',
    );
  });

  test("rejects duplicate select option values", () => {
    expect(() =>
      parseServerMessage(
        actionMessage({
          settingsSchemaVersion: 1,
          settingsSchema: [
            {
              type: "select",
              key: "x",
              options: [
                { value: "same", label: "First" },
                { value: "same", label: "Second" },
              ],
            },
          ],
        }),
      ),
    ).toThrow(
      'Invalid server message: settingsSchema action 0 field 0: duplicate select option "same".',
    );
  });

  test("rejects duplicate object keys nested in arrays", () => {
    const duplicateKeys = `{"protocolVersion":1,"type":"actions","requestId":"settings","actions":[{"actionId":"com.example.settings","name":"Settings","settingsSchema":[{"nested":{"value":1}},[{"arrayKey":true,"arrayK\\u0065y":false}]]}]}`;

    expect(() => parseServerMessage(duplicateKeys)).toThrow(
      "Invalid server message: duplicate object fields are not allowed.",
    );
  });


  test("rejects invalid explicit schemas with deterministic errors", () => {
    const invalid = [
      { settingsSchemaVersion: 1, settingsSchema: [{ type: "text", key: "x", unsupported: true }] },
      { settingsSchemaVersion: 1, settingsSchema: [{ type: "text", key: "x" }, { type: "boolean", key: "x" }] },
      {
        settingsSchemaVersion: 1,
        settingsSchema: [{ type: "number", key: "x", min: 5, max: 1 }],
      },
      {
        settingsSchemaVersion: 1,
        settingsSchema: [{ type: "select", key: "x", options: [{ value: "a", label: "A" }], default: "b" }],
      },
    ];

    for (const action of invalid) {
      expect(() => parseServerMessage(actionMessage(action))).toThrow(/settingsSchema|schema validation/);
    }
  });

  test("preserves bounded unsupported schema versions without interpreting fields", () => {
    expect(
      parseServerMessage(
        actionMessage({ settingsSchemaVersion: 2, settingsSchema: [{ future: "descriptor" }] }),
      ),
    ).toBeDefined();
  });

  test("uses Unicode character bounds for versioned fields", () => {
    const key = "é".repeat(64);
    expect(
      parseServerMessage(
        actionMessage({
          settingsSchemaVersion: 1,
          settingsSchema: [{ type: "text", key, label: key, default: "é".repeat(4), maxLength: 4 }],
        }),
      ),
    ).toBeDefined();
    expect(
      parseServerMessage(
        actionMessage({
          settingsSchemaVersion: 1,
          settingsSchema: [{ type: "text", key: "emoji", default: "😀", maxLength: 1 }],
        }),
      ),
    ).toBeDefined();
    expect(() =>
      parseServerMessage(
        actionMessage({
          settingsSchemaVersion: 1,
          settingsSchema: [{ type: "boolean", key: "é".repeat(65) }],
        }),
      ),
    ).toThrow();
  });
});

describe("device metadata privacy boundary", () => {
  test("sanitizes the closed DTO and maps unknown device type safely", () => {
    const metadata = sanitizeDeviceMetadata({
      controllerType: "keypad",
      device: { type: "unknown", size: { columns: 4, rows: 2 } },
      name: "private name",
    });
    expect(metadata).toBeUndefined();
    expect(sanitizeDeviceMetadata({
      controllerType: "encoder",
      device: { type: "unknown", size: { columns: 1, rows: 1 } },
    })).toEqual({
      controllerType: "encoder",
      device: { type: "unknown", size: { columns: 1, rows: 1 } },
    });
  });

  test("serializes optional metadata without SDK fields", () => {
    const message = {
      protocolVersion: 1,
      type: "instanceAppeared",
      sessionId,
      instanceId: "instance-1",
      actionId: "action-1",
      settings: {},
      metadata: {
        controllerType: "keypad",
        device: { type: "stream-deck", size: { columns: 5, rows: 3 } },
      },
    } satisfies ClientMessage;
    expect(JSON.parse(serializeClientMessage(message))).toEqual(message);
  });
});
