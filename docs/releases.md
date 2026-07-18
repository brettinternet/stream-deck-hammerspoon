# Releases

The release command builds and validates the official plugin, creates a deterministic `.streamDeckPlugin` package and Lua-library archive, and writes checksums:

```sh
bun install
bun run release
```

The release version is read from `plugin/com.brettinternet.hammerspoon.sdPlugin/manifest.json` and must use the four-part form required by the Stream Deck CLI (for example, `1.2.3.4`). The command does not change source files or version declarations. Update the manifest version as part of a release change, then commit that change with the release source. Build output is written to `dist/releases/<version>/`, which is ignored by Git.

## Publish a GitHub release

The GitHub Actions release workflow runs when a `v*` tag is pushed. The tag must exactly match the manifest version, including the required four-part format:

```sh
git tag v1.2.3.4
git push origin v1.2.3.4
```

The workflow runs `bun run release`, includes the generated SHA-256 checksums, and publishes every file from `dist/releases/<version>/` to the GitHub release. It uses GitHub's generated release notes; no release is created for ordinary branch pushes or pull requests.

Each release directory contains:

- `<plugin UUID>-<version>.streamDeckPlugin` — the official Stream Deck package.
- `stream-deck-hammerspoon-lua-<version>.tar.gz` — the `hammerspoon/streamdeck` module under `streamdeck/`, including a `VERSION` file.
- `SHA256SUMS` — SHA-256 checksums for both artifacts.
- `RELEASE.json` — the versioned artifact manifest.

The plugin package is produced and validated with the pinned `@elgato/cli` before its archive timestamps and file order are normalized. The Lua archive uses sorted paths, fixed timestamps, USTAR format, and gzip without a timestamp. Running `bun run release` twice for the same source and version must produce identical artifact checksums.

## Verify and install

From the release directory, verify the downloads before installing:

```sh
shasum -a 256 -c SHA256SUMS
```

Install the plugin through the official Stream Deck application. On macOS, open the package and accept the application's install prompt:

```sh
open <plugin-uuid>-<version>.streamDeckPlugin
```

The exact filename uses the UUID from the manifest. Keep the official Stream Deck application running; do not use direct USB/HID access.

Install the Lua module into Hammerspoon's standard module directory:

```sh
mkdir -p "$HOME/.hammerspoon"
tar -xzf stream-deck-hammerspoon-lua-<version>.tar.gz -C "$HOME/.hammerspoon"
lua -e 'assert(loadfile(os.getenv("HOME") .. "/.hammerspoon/streamdeck/init.lua"))'
```

Reload Hammerspoon after installing the module. Keep the token at `$HOME/.hammerspoon/streamdeck-token` outside the release archive and preserve its mode `0600`.

## Uninstall

Remove the plugin from the official Stream Deck application using its plugin management UI. If the plugin was installed for development with `streamdeck link`, unlink it with the pinned CLI instead:

```sh
bunx --no-install streamdeck unlink com.brettinternet.hammerspoon
```

Remove the Lua module from Hammerspoon's module directory with Finder's Move to Trash, or with the macOS `trash` command:

```sh
trash "$HOME/.hammerspoon/streamdeck"
```

Do not remove `$HOME/.hammerspoon/streamdeck-token` unless rotating credentials; removing it rotates the shared token on the next bridge start.
