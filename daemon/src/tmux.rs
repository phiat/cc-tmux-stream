use crate::protocol::PaneInfo;
use std::process::Command;

/// List all tmux panes across all sessions
pub fn list_panes() -> Result<Vec<PaneInfo>, String> {
    let output = Command::new("tmux")
        .args([
            "list-panes",
            "-a",
            "-F",
            "#{session_name}:#{window_index}.#{pane_index}\t#{session_name}\t#{window_index}\t#{window_name}\t#{pane_index}\t#{pane_active}\t#{pane_title}",
        ])
        .output()
        .map_err(|e| format!("Failed to run tmux: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("tmux command failed: {}", stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut panes = Vec::new();

    for line in stdout.lines() {
        let parts: Vec<&str> = line.split('\t').collect();
        if parts.len() >= 7 {
            panes.push(PaneInfo {
                id: parts[0].to_string(),
                session: parts[1].to_string(),
                window: parts[2].parse().unwrap_or(0),
                window_name: parts[3].to_string(),
                pane: parts[4].parse().unwrap_or(0),
                active: parts[5] == "1",
                title: parts[6].to_string(),
            });
        }
    }

    Ok(panes)
}

/// Capture the content of a specific pane with ANSI escape sequences
/// Returns (content, pane_width)
pub fn capture_pane(target: &str) -> Result<(String, u16), String> {
    // Get pane width first
    let width = get_pane_width(target)?;

    // Capture with -e for ANSI escape sequences (colors)
    // -S -500 captures 500 lines of scrollback history
    let output = Command::new("tmux")
        .args(["capture-pane", "-p", "-e", "-S", "-500", "-t", target])
        .output()
        .map_err(|e| format!("Failed to run tmux: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("tmux capture-pane failed: {}", stderr));
    }

    let content = String::from_utf8_lossy(&output.stdout).to_string();

    // Simple normalization: trim trailing whitespace from each line
    let normalized = content
        .lines()
        .map(|line| line.trim_end())
        .collect::<Vec<_>>()
        .join("\n");

    Ok((normalized, width))
}


/// Get the width of a tmux pane
fn get_pane_width(target: &str) -> Result<u16, String> {
    let output = Command::new("tmux")
        .args(["display-message", "-t", target, "-p", "#{pane_width}"])
        .output()
        .map_err(|e| format!("Failed to get pane width: {}", e))?;

    if !output.status.success() {
        return Ok(80); // Default fallback
    }

    String::from_utf8_lossy(&output.stdout)
        .trim()
        .parse()
        .map_err(|_| "Failed to parse pane width".to_string())
}

/// Check if tmux is available and running
pub fn is_tmux_available() -> bool {
    Command::new("tmux")
        .args(["list-sessions"])
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

/// Send keys to a tmux pane
/// Keys are space-separated (e.g., "1 Enter" sends "1" then Enter key)
pub fn send_keys(target: &str, keys: &str) -> Result<(), String> {
    use tracing::info;

    let mut cmd = Command::new("tmux");
    cmd.args(["send-keys", "-t", target]);

    // Split by space - each token is a separate key/argument
    let key_list: Vec<&str> = keys.split_whitespace().collect();
    for key in &key_list {
        cmd.arg(key);
    }

    info!("Sending keys to {}: {:?}", target, key_list);

    let output = cmd.output()
        .map_err(|e| format!("Failed to send keys: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("tmux send-keys failed: {}", stderr));
    }

    info!("Keys sent successfully");
    Ok(())
}
