use crate::config::Config;
use crate::protocol::{ClientMessage, ServerMessage};
use crate::tmux;
use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        State,
    },
    response::IntoResponse,
    routing::get,
    Router,
};
use futures::{SinkExt, StreamExt};
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::mpsc;
use tokio::time::interval;
use tower_http::cors::{Any, CorsLayer};
use tracing::{error, info, warn};

pub struct AppState {
    pub config: Config,
}

pub fn create_router(state: Arc<AppState>) -> Router {
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    Router::new()
        .route("/", get(ws_handler))
        .layer(cors)
        .with_state(state)
}

async fn ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_socket(socket, state))
}

async fn handle_socket(socket: WebSocket, state: Arc<AppState>) {
    let (mut sender, mut receiver) = socket.split();
    let mut authenticated = false;
    let (tx, mut rx) = mpsc::channel::<ServerMessage>(32);

    // Task to send messages to the client
    let send_task = tokio::spawn(async move {
        while let Some(msg) = rx.recv().await {
            let json = serde_json::to_string(&msg).unwrap();
            if sender.send(Message::Text(json.into())).await.is_err() {
                break;
            }
        }
    });

    // Main message loop
    let expected_token = state.config.auth.token.clone();
    let interval_ms = state.config.capture.interval_ms;
    let mut subscription: Option<tokio::task::JoinHandle<()>> = None;
    let mut current_target: Option<String> = None;

    while let Some(msg) = receiver.next().await {
        let msg = match msg {
            Ok(Message::Text(text)) => text,
            Ok(Message::Close(_)) => break,
            Err(e) => {
                error!("WebSocket error: {}", e);
                break;
            }
            _ => continue,
        };

        let client_msg: ClientMessage = match serde_json::from_str(&msg) {
            Ok(m) => m,
            Err(e) => {
                let _ = tx
                    .send(ServerMessage::Error {
                        message: format!("Invalid message: {}", e),
                    })
                    .await;
                continue;
            }
        };

        match client_msg {
            ClientMessage::Auth { token } => {
                if token == expected_token {
                    authenticated = true;
                    info!("Client authenticated");
                    let _ = tx.send(ServerMessage::AuthOk).await;
                } else {
                    warn!("Invalid token attempt");
                    let _ = tx
                        .send(ServerMessage::AuthError {
                            message: "Invalid token".to_string(),
                        })
                        .await;
                }
            }

            ClientMessage::List => {
                if !authenticated {
                    let _ = tx
                        .send(ServerMessage::Error {
                            message: "Not authenticated".to_string(),
                        })
                        .await;
                    continue;
                }

                match tmux::list_panes() {
                    Ok(items) => {
                        let _ = tx.send(ServerMessage::Panes { items }).await;
                    }
                    Err(e) => {
                        let _ = tx.send(ServerMessage::Error { message: e }).await;
                    }
                }
            }

            ClientMessage::Subscribe { target, .. } => {
                if !authenticated {
                    let _ = tx
                        .send(ServerMessage::Error {
                            message: "Not authenticated".to_string(),
                        })
                        .await;
                    continue;
                }

                // Cancel existing subscription
                if let Some(handle) = subscription.take() {
                    handle.abort();
                }

                let tx_clone = tx.clone();
                let target_clone = target.clone();

                current_target = Some(target.clone());

                subscription = Some(tokio::spawn(async move {
                    let mut poll_interval = interval(Duration::from_millis(interval_ms));

                    loop {
                        poll_interval.tick().await;

                        match tmux::capture_pane(&target_clone) {
                            Ok((data, source_cols)) => {
                                if tx_clone.send(ServerMessage::Content { data, source_cols }).await.is_err() {
                                    break;
                                }
                            }
                            Err(e) => {
                                let _ = tx_clone.send(ServerMessage::Error { message: e }).await;
                                break;
                            }
                        }
                    }
                }));

                info!("Subscribed to pane: {}", current_target.as_ref().unwrap());
            }

            ClientMessage::Resize { .. } => {
                // Currently ignored - could be used for dynamic reflow in future
            }

            ClientMessage::Unsubscribe => {
                if let Some(handle) = subscription.take() {
                    handle.abort();
                    current_target = None;
                    info!("Unsubscribed from pane");
                }
            }

            ClientMessage::Input { keys } => {
                if !authenticated {
                    let _ = tx
                        .send(ServerMessage::Error {
                            message: "Not authenticated".to_string(),
                        })
                        .await;
                    continue;
                }

                if let Some(ref target) = current_target {
                    if let Err(e) = tmux::send_keys(target, &keys) {
                        let _ = tx.send(ServerMessage::Error { message: e }).await;
                    }
                } else {
                    let _ = tx
                        .send(ServerMessage::Error {
                            message: "No pane subscribed".to_string(),
                        })
                        .await;
                }
            }
        }
    }

    // Cleanup
    if let Some(handle) = subscription {
        handle.abort();
    }
    send_task.abort();
    info!("Client disconnected");
}
