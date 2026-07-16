type JsonObject = Record<string, unknown>;

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseInitialActionInfo(actionInfo: string): string {
  try {
    const parsed: unknown = JSON.parse(actionInfo);
    if (!isJsonObject(parsed) || !isJsonObject(parsed.payload)) {
      return "";
    }

    const settings = parsed.payload.settings;
    if (!isJsonObject(settings) || typeof settings.actionId !== "string") {
      return "";
    }

    return settings.actionId.trim().length > 0 ? settings.actionId : "";
  } catch {
    return "";
  }
}
