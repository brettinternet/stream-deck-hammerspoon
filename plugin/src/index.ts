import streamDeck from "@elgato/streamdeck";

export const PLUGIN_VERSION = "0.1.0";

streamDeck.logger.info(`Starting Hammerspoon Stream Deck plugin v${PLUGIN_VERSION}`);

// Actions are registered here before connecting as vertical slices add them.
streamDeck.connect();
