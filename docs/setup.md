# Stream Deck + Hammerspoon setup

This project has two independently installed parts:

- the official Stream Deck plugin, managed by the Stream Deck application;
- the Hammerspoon support module, loaded by your Hammerspoon configuration.

The plugin cannot safely install or edit a user's Hammerspoon configuration. Do not put the shared token in Stream Deck settings.

## Release installation

Download these matching files from the same release:

- `<plugin-uuid>-<version>.streamDeckPlugin`
- `stream-deck-hammerspoon-lua-<version>.tar.gz`
- `stream-deck-hammerspoon-install.sh`
- `SHA256SUMS`

Verify the downloads first:

```sh
shasum -a 256 -c SHA256SUMS
```

Install the plugin through the official Stream Deck application:

```sh
open <plugin-uuid>-<version>.streamDeckPlugin
```

Keep the official Stream Deck application running. Install the Hammerspoon module with the release installer beside the archive:

```sh
chmod +x stream-deck-hammerspoon-install.sh
./stream-deck-hammerspoon-install.sh \
  stream-deck-hammerspoon-lua-<version>.tar.gz
```

The installer verifies the archive checksum and version, stages the extraction before changing Hammerspoon's module path, refuses to replace a symlink, file, or unversioned directory, and never edits `~/.hammerspoon/init.lua` or `~/.hammerspoon/streamdeck-token`. Upgrades preserve the previous managed module under `~/.hammerspoon/.streamdeck-backups/`. Roll back to the newest backup with:

The installer is failure-recoverable rather than filesystem-atomic: do not reload Hammerspoon while an install or rollback is running. It keeps the managed module directory in place and attempts to restore the previous contents if activation fails.

```sh
./stream-deck-hammerspoon-install.sh --rollback
```

## Configure Hammerspoon

Add the bridge and your action registrations to `~/.hammerspoon/init.lua`:

```lua
local streamdeck = require("streamdeck")

-- streamdeck.register({ ... })
streamdeck.start()
```

Reload Hammerspoon after saving the configuration. The bridge creates `~/.hammerspoon/streamdeck-token` on its first successful start and keeps it owner-readable/writable (`0600`). Do not create, copy, or log this file manually.

In Stream Deck, add **Hammerspoon Action** to a key and select one of the registered action IDs in its property inspector.

## Development checkout

For a repository checkout, use the development installer instead:

```sh
mise install
bun install
bun run install:dev
```

It links the checkout's Lua module and installs the development plugin through the official CLI. It is not required for release users.

## Uninstall

Remove the plugin through the Stream Deck application. Remove the managed module and optional backups using Finder's Move to Trash or macOS `trash`:

```sh
trash "$HOME/.hammerspoon/streamdeck"
trash "$HOME/.hammerspoon/.streamdeck-backups"
```

Do not remove `~/.hammerspoon/streamdeck-token` unless you intentionally want to rotate credentials.
