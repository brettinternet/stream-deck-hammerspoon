import streamDeck from "@elgato/streamdeck";
import { BridgeClient } from "./bridge.js";
import {
  HAMMERSPOON_BUTTON_UUID,
  HAMMERSPOON_MULTI_STATE_UUID,
  HammerspoonAction,
} from "./actions/hammerspoon-action.js";

export const PLUGIN_VERSION = "0.5.0";

streamDeck.logger.info(`Starting Hammerspoon Stream Deck plugin v${PLUGIN_VERSION}`);

const bridge = new BridgeClient({
  url: "ws://localhost:17321/streamdeck",
  pluginVersion: PLUGIN_VERSION,
  logger: (line) => streamDeck.logger.info(line),
});
const hammerspoonToggle = new HammerspoonAction(bridge);
const hammerspoonButton = new HammerspoonAction(bridge, {
  manifestId: HAMMERSPOON_BUTTON_UUID,
  mode: "button",
});
const hammerspoonMultiState = new HammerspoonAction(bridge, {
  manifestId: HAMMERSPOON_MULTI_STATE_UUID,
  mode: "multi-state",
});
hammerspoonToggle.subscribe();
hammerspoonButton.subscribe();
hammerspoonMultiState.subscribe();
streamDeck.actions.registerAction(hammerspoonToggle);
streamDeck.actions.registerAction(hammerspoonButton);
streamDeck.actions.registerAction(hammerspoonMultiState);
bridge.start();
streamDeck.connect();
