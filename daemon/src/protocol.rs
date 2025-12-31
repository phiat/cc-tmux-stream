use serde::{Deserialize, Serialize};

/// Messages sent from client to server
#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ClientMessage {
    Auth { token: String },
    List,
    Subscribe {
        target: String,
        #[allow(dead_code)]
        cols: Option<u16>,
        #[allow(dead_code)]
        rows: Option<u16>,
    },
    Resize {
        #[allow(dead_code)]
        cols: u16,
        #[allow(dead_code)]
        rows: u16,
    },
    Unsubscribe,
    /// Send input to the currently subscribed pane
    Input { keys: String },
}

/// Messages sent from server to client
#[derive(Debug, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ServerMessage {
    AuthOk,
    AuthError { message: String },
    Panes { items: Vec<PaneInfo> },
    Content { data: String, source_cols: u16 },
    Error { message: String },
}

/// Information about a tmux pane
#[derive(Debug, Clone, Serialize)]
pub struct PaneInfo {
    pub id: String,
    pub session: String,
    pub window: u32,
    pub window_name: String,
    pub pane: u32,
    pub active: bool,
    pub title: String,
}
