#!/bin/sh
set -eu

usage() {
  cat <<'EOF'
Usage:
  ./stream-deck-hammerspoon-install.sh <lua-archive.tar.gz>
  ./stream-deck-hammerspoon-install.sh --rollback

Install or roll back the Hammerspoon support module from a verified release.
The installer never edits ~/.hammerspoon/init.lua or touches streamdeck-token.
EOF
}

fail() {
  printf 'Install failed: %s\n' "$*" >&2
  exit 1
}

[ "$(uname -s)" = "Darwin" ] || fail "this installer requires macOS"
[ -n "${HOME:-}" ] || fail "HOME is not set"

hammerspoon_dir=$HOME/.hammerspoon
target=$hammerspoon_dir/streamdeck
backup_root=$hammerspoon_dir/.streamdeck-backups
managed=0
old_version=

action_target() {
  if [ -L "$target" ]; then
    fail "refusing to replace symlink $target; remove it manually before installing a release"
  fi
  if [ ! -e "$target" ]; then
    managed=0
    old_version=
    return
  fi
  [ -d "$target" ] || fail "refusing to replace non-directory $target"
  [ -f "$target/VERSION" ] || fail "refusing to replace unversioned module directory $target"
  old_version=$(cat "$target/VERSION") || fail "could not read $target/VERSION"
  [ -n "$old_version" ] || fail "existing module has an empty VERSION file"
  managed=1
}

rollback() {
  action_target
  [ "$managed" -eq 1 ] || fail "no managed Hammerspoon module is installed"
  [ -d "$backup_root" ] || fail "no release backups exist at $backup_root"

  latest=
  for backup_dir in "$backup_root"/*; do
    [ -d "$backup_dir/streamdeck" ] || continue
    if [ -z "$latest" ] || [ "$backup_dir" -nt "$latest" ]; then
      latest=$backup_dir
    fi
  done
  [ -n "$latest" ] || fail "no release backups exist at $backup_root"

  timestamp=$(date +%Y%m%d%H%M%S)
  current_backup=$(mktemp -d "$backup_root/${timestamp}-rollback.XXXXXX")
  if ! cp -Rp "$target" "$current_backup/streamdeck"; then
    rmdir "$current_backup"
    fail "could not back up the current module for rollback"
  fi
  if ! rm -rf "$target"/* "$target"/.[!.]* "$target"/..?*; then
    rm -rf "$target"/* "$target"/.[!.]* "$target"/..?* || true
    cp -Rp "$current_backup/streamdeck/." "$target/" || true
    rmdir "$current_backup" || true
    fail "could not prepare the current module for rollback"
  fi
  if ! cp -Rp "$latest/streamdeck/." "$target/"; then
    rm -rf "$target"/* "$target"/.[!.]* "$target"/..?* || true
    cp -Rp "$current_backup/streamdeck/." "$target/" || true
    rmdir "$current_backup" || true
    fail "could not activate the previous module; the current module was restored"
  fi

  printf 'Rolled back Hammerspoon module using %s\n' "$latest"
}

install_archive() {
  archive_input=$1
  case "$archive_input" in
    -*) fail "archive path must not begin with '-'" ;;
  esac
  [ -f "$archive_input" ] || fail "Lua archive not found: $archive_input"

  archive_dir=$(CDPATH= cd -P "$(dirname "$archive_input")" && pwd) || fail "could not resolve archive directory"
  archive_file=$(basename "$archive_input")
  archive=$archive_dir/$archive_file
  case "$archive_file" in
    stream-deck-hammerspoon-lua-*.tar.gz) ;;
    *) fail "expected stream-deck-hammerspoon-lua-<version>.tar.gz" ;;
  esac
  version=${archive_file#stream-deck-hammerspoon-lua-}
  version=${version%.tar.gz}
  if ! printf '%s\n' "$version" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$'; then
    fail "archive filename has an invalid version"
  fi

  sums=$archive_dir/SHA256SUMS
  [ -f "$sums" ] || fail "SHA256SUMS not found beside the Lua archive"
  expected=$(awk -v name="$archive_file" '$2 == name { print $1; exit }' "$sums")
  [ -n "$expected" ] || fail "$archive_file is missing from SHA256SUMS"
  actual=$(shasum -a 256 "$archive" | awk '{ print $1 }')
  [ "$actual" = "$expected" ] || fail "SHA-256 mismatch for $archive_file"

  entries=$(tar -tzf "$archive") || fail "could not read Lua archive"
  if printf '%s\n' "$entries" | grep -Eq '(^/|(^|/)\.\.(/|$))'; then
    fail "Lua archive contains an unsafe path"
  fi
  entry_details=$(tar -tvzf "$archive") || fail "could not inspect Lua archive entries"
  if printf '%s\n' "$entry_details" | grep -Eq '^[^ -d]'; then
    fail "Lua archive contains a non-regular entry"
  fi
  printf '%s\n' "$entries" | grep -Fx 'streamdeck/init.lua' >/dev/null || fail "Lua archive is missing streamdeck/init.lua"
  printf '%s\n' "$entries" | grep -Fx 'streamdeck/VERSION' >/dev/null || fail "Lua archive is missing streamdeck/VERSION"

  action_target
  mkdir -p "$hammerspoon_dir"
  temp_dir=$(mktemp -d "$hammerspoon_dir/.streamdeck-install.XXXXXX") || fail "could not create a staging directory"
  trap 'rm -rf "$temp_dir"' EXIT HUP INT TERM
  tar -xzf "$archive" -C "$temp_dir" || fail "could not extract Lua archive"

  stage=$temp_dir/streamdeck
  [ -d "$stage" ] || fail "Lua archive did not contain a streamdeck directory"
  [ -f "$stage/VERSION" ] || fail "staged module is missing VERSION"
  staged_version=$(cat "$stage/VERSION") || fail "could not read staged VERSION"
  [ "$staged_version" = "$version" ] || fail "archive filename and VERSION do not match"
  [ -f "$stage/init.lua" ] || fail "staged module is missing init.lua"

  if [ "$managed" -eq 1 ]; then
    mkdir -p "$backup_root"
    timestamp=$(date +%Y%m%d%H%M%S)
    backup_dir=$(mktemp -d "$backup_root/${timestamp}.XXXXXX")
    if ! cp -Rp "$target" "$backup_dir/streamdeck"; then
      rmdir "$backup_dir"
      fail "could not back up the existing module for replacement"
    fi
    if ! rm -rf "$target"/* "$target"/.[!.]* "$target"/..?*; then
      rm -rf "$target"/* "$target"/.[!.]* "$target"/..?* || true
      cp -Rp "$backup_dir/streamdeck/." "$target/" || true
      fail "could not prepare the existing module for replacement"
    fi
    if ! cp -Rp "$stage/." "$target/"; then
      rm -rf "$target"/* "$target"/.[!.]* "$target"/..?* || true
      cp -Rp "$backup_dir/streamdeck/." "$target/" || true
      fail "could not activate the new module; the existing module was restored"
    fi
    printf 'Installed Hammerspoon module %s; previous version backed up at %s\n' "$version" "$backup_dir"
  else
    mv "$stage" "$target" || fail "could not install Hammerspoon module"
    printf 'Installed Hammerspoon module %s at %s\n' "$version" "$target"
  fi

  trap - EXIT HUP INT TERM
  rm -rf "$temp_dir"
}

if [ "$#" -eq 0 ]; then
  usage >&2
  exit 64
fi

case "$1" in
  --help)
    [ "$#" -eq 1 ] || { usage >&2; exit 64; }
    usage
    ;;
  --rollback)
    [ "$#" -eq 1 ] || { usage >&2; exit 64; }
    rollback
    ;;
  *)
    [ "$#" -eq 1 ] || { usage >&2; exit 64; }
    install_archive "$1"
    ;;
esac
