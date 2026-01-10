mod config;
mod protocol;
mod server;
mod tmux;

use crate::config::load_or_create_config;
use crate::server::{create_router, AppState};
use std::net::SocketAddr;
use std::sync::Arc;
use tracing::{error, info};

#[tokio::main]
async fn main() {
    // Initialize logging
    tracing_subscriber::fmt::init();

    // Check if tmux is available
    if !tmux::is_tmux_available() {
        error!("tmux is not available or no sessions are running");
        error!("Please start a tmux session first");
        std::process::exit(1);
    }

    // Load or create config
    let config = match load_or_create_config() {
        Ok(c) => c,
        Err(e) => {
            error!("Failed to load config: {}", e);
            std::process::exit(1);
        }
    };

    let addr: SocketAddr = format!("{}:{}", config.server.host, config.server.port)
        .parse()
        .expect("Invalid address");

    // Display startup info
    println!();
    println!("========================================");
    println!("  cc-tmux-stream daemon");
    println!("========================================");
    println!();
    println!("  WebSocket: ws://{}:{}", config.server.host, config.server.port);
    println!("  Config:    {}", config::config_path().display());
    println!();
    println!("  Token:     {}", config.auth.token);
    println!();
    println!("  Copy the token above to the Firefox extension settings.");
    println!("========================================");
    println!();

    let state = Arc::new(AppState { config });
    let app = create_router(state);

    info!("Starting server on {}", addr);

    let listener = match tokio::net::TcpListener::bind(addr).await {
        Ok(l) => l,
        Err(e) => {
            error!("Failed to bind to {}: {}", addr, e);
            if e.kind() == std::io::ErrorKind::AddrInUse {
                error!("Port {} is already in use. Is another instance running?", addr.port());
            }
            std::process::exit(1);
        }
    };

    if let Err(e) = axum::serve(listener, app).await {
        error!("Server error: {}", e);
        std::process::exit(1);
    }
}
