#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[tauri::command]
fn get_config_value(key: String) -> Result<String, String> {
    // For now, return empty - Store will be managed by Tauri with default config
    Ok(String::new())
}

#[tauri::command]
fn set_config_value(key: String, value: String) -> Result<(), String> {
    // For now, just acknowledge - Store will be managed by Tauri with default config
    Ok(())
}

#[tauri::command]
fn remove_config_value(key: String) -> Result<(), String> {
    // For now, just acknowledge
    Ok(())
}

#[tauri::command]
fn get_platform() -> String {
    std::env::consts::OS.to_string()
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_http::init())
        .invoke_handler(tauri::generate_handler![
            get_config_value,
            set_config_value,
            remove_config_value,
            get_platform
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
