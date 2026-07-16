import streamDeck from "@elgato/streamdeck";
import { BridgeClient } from "./bridge.js";
import { HammerspoonAction } from "./actions/hammerspoon-action.js";

export const PLUGIN_VERSION = "0.1.0";

streamDeck.logger.info(`Starting Hammerspoon Stream Deck plugin v${PLUGIN_VERSION}`);

const bridge = new BridgeClient({
  url: "ws://localhost:17321/streamdeck",
  pluginVersion: PLUGIN_VERSION,
});
const hammerspoonAction = new HammerspoonAction(bridge);
hammerspoonAction.subscribe();
streamDeck.actions.registerAction(hammerspoonAction);
bridge.start();
streamDeck.connect();
