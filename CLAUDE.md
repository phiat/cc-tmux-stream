# CLAUDE.md - Project Guide for Claude Code

**Repository:** https://github.com/phiat/cc-tmux-sidebar

## Project Overview

tmux-stream is a Firefox extension + Rust daemon that streams tmux pane contents to a browser sidebar with full input support. Primary use case: monitoring and controlling Claude Code sessions while browsing.

## Architecture

- **daemon/** - Rust WebSocket server using axum/tokio
- **extension/** - Firefox Manifest V2 extension with HTML/CSS terminal rendering

## Key Commands

```bash
# Build daemon
cd daemon && cargo build --release

# Run daemon (requires tmux session running)
./daemon/target/release/tmux-stream

# Dev mode
cd daemon && cargo run

# Test extension: Load in Firefox about:debugging
```

## Code Conventions

### Rust (daemon/)
- Use `tracing` for logging (`info!`, `error!`, `warn!`)
- Error handling: Return `Result<T, String>` for tmux operations
- Config stored at `~/.config/tmux-stream/config.toml`
- WebSocket messages use serde with `#[serde(tag = "type")]` for type discrimination

### JavaScript (extension/)
- IIFE pattern with `'use strict'`
- Use `browser.storage.local` for settings (Firefox WebExtensions API)
- ANSI-to-HTML parsing for color support (no xterm.js dependency)
- State managed via module-level variables

## File Structure

```
daemon/src/
├── main.rs        # Entry, startup banner, server launch
├── config.rs      # TOML config, token generation
├── protocol.rs    # ClientMessage/ServerMessage enums
├── server.rs      # WebSocket handlers, polling loop, input routing
└── tmux.rs        # capture-pane, list-panes, send-keys wrappers

extension/
├── manifest.json  # V2 manifest, sidebar_action
├── sidebar/       # panel.html/js/css - main UI with input controls
├── options/       # options.html/js - settings page
└── icons/
```

## Protocol

JSON over WebSocket on `localhost:19475`:

- `auth` → `auth_ok` / `auth_error`
- `list` → `panes`
- `subscribe {target}` → streaming `content` messages
- `unsubscribe` → stops stream
- `input {keys}` → sends keys to tmux pane (space-separated for special keys)

### Input Keys Format
- Regular characters: `"1"`, `"y"`, `"hello"`
- Special keys: `"Enter"`, `"Space"`, `"Tab"`, `"Up"`, `"Down"`, `"Left"`, `"Right"`
- Combinations: `"1 Enter"` sends "1" then Enter

## Features

1. **Streaming**: Polls tmux every 150ms, sends content with ANSI escape codes
2. **Scrollback**: Captures 500 lines of history (`-S -500`)
3. **Input**: Buttons for 1-5, Y/N, arrows, Tab, Space, Enter + text input
4. **Smart scroll**: Auto-follows at bottom, preserves position when scrolled up
5. **Colors**: Full ANSI color parsing (16, 256, and true color)

## Future Enhancements (not implemented)

- Multiple simultaneous pane views
- Keyboard shortcuts in browser
- Auto-reconnect on daemon restart
- Configurable scrollback depth
- Manifest V3 migration
