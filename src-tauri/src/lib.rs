use tauri::{Emitter, Manager};

#[derive(serde::Serialize)]
struct HttpResponsePayload {
    status: u16,
    body: String,
}

#[tauri::command]
async fn http_request(
    url: String,
    method: String,
    body: Option<String>,
    content_type: Option<String>,
    auth_token: Option<String>,
) -> Result<HttpResponsePayload, String> {
    let client = reqwest::Client::new();

    let mut req = client.request(
        method.parse().map_err(|_| "Invalid method".to_string())?,
        &url,
    );

    if let Some(ct) = content_type {
        req = req.header("Content-Type", ct);
    }
    if let Some(token) = auth_token {
        req = req.header("Authorization", format!("Bearer {}", token));
    }
    if let Some(b) = body {
        req = req.body(b);
    }

    let res = req.send().await.map_err(|e| e.to_string())?;
    let status = res.status().as_u16();
    let text = res.text().await.map_err(|e| e.to_string())?;

    Ok(HttpResponsePayload { status, body: text })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            let _ = app.emit("single-instance", args);

            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_focus();
                let _ = window.unminimize();
            }
        }))
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_deep_link::init())
        .invoke_handler(tauri::generate_handler![http_request])
        .setup(|app| {
            #[cfg(any(windows, target_os = "linux"))]
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                app.deep_link().register("fr.silvercore.synco")?;
            }

            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}