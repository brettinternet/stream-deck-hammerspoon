# Project Overview

Stream Deck ↔ Hammerspoon is an Elgato Stream Deck plugin bridge for Hammerspoon. The TypeScript plugin sends authenticated WebSocket events to the reusable Lua module; the official Stream Deck application retains hardware access and plugin lifecycle ownership.

- `plugin/`: TypeScript Stream Deck plugin source and tests.
- `hammerspoon/streamdeck/`: reusable Lua bridge module.
- `protocol/schema/`: canonical protocol-v1 JSON Schema.

## Worktrees

Create all repository worktrees under `.worktrees/`.
