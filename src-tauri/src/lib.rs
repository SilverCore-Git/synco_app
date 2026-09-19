use tauri::{Emitter, Manager};

// L'AppImage (linuxdeploy) exporte LD_LIBRARY_PATH/GTK_PATH/GIO_EXTRA_MODULES/... pour pointer
// vers ses libs embarquées. Un sous-processus qui hérite de cet environnement (ex: le navigateur
// lancé via xdg-open pour le login OAuth) essaie de charger ces libs au lieu de celles du système
// et plante sur un mismatch de version (ex Firefox: "XPCOMGlueLoad error ... libnss3.so: version
// `NSS_3.126' not found"), donc le navigateur ne s'ouvre jamais. On les retire avant de spawn.
#[cfg(target_os = "linux")]
const APPIMAGE_POLLUTED_ENV_VARS: &[&str] = &[
    "LD_LIBRARY_PATH",
    "GTK_PATH",
    "GIO_EXTRA_MODULES",
    "GDK_PIXBUF_MODULE_FILE",
    "GSETTINGS_SCHEMA_DIR",
    "GST_PLUGIN_SYSTEM_PATH_1_0",
    "GST_PLUGIN_PATH_1_0",
    "GST_PLUGIN_SCANNER_1_0",
    "GST_PLUGIN_SYSTEM_PATH",
    "GST_PTP_HELPER_1_0",
    "GST_REGISTRY_REUSE_PLUGIN_SCANNER",
];

#[tauri::command]
fn open_external_url(url: String) -> Result<(), String> {
    #[cfg(target_os = "linux")]
    {
        let mut cmd = std::process::Command::new("xdg-open");
        cmd.arg(&url);
        for var in APPIMAGE_POLLUTED_ENV_VARS {
            cmd.env_remove(var);
        }
        return cmd.spawn().map(|_| ()).map_err(|e| e.to_string());
    }
    #[cfg(target_os = "macos")]
    {
        return std::process::Command::new("open")
            .arg(&url)
            .spawn()
            .map(|_| ())
            .map_err(|e| e.to_string());
    }
    #[cfg(target_os = "windows")]
    {
        return std::process::Command::new("cmd")
            .args(["/C", "start", "", &url])
            .spawn()
            .map(|_| ())
            .map_err(|e| e.to_string());
    }
    #[cfg(not(any(target_os = "linux", target_os = "macos", target_os = "windows")))]
    {
        Err("open_external_url is not supported on this platform".into())
    }
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
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_notification::init())
        .invoke_handler(tauri::generate_handler![open_external_url])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            #[cfg(any(windows, target_os = "linux"))]
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                // Sur Linux ça passe par xdg-mime/update-desktop-database (paquet desktop-file-utils) :
                // s'il est absent, on ne veut pas planter toute l'appli, juste perdre le deep-link.
                if let Err(e) = app.deep_link().register("fr.silvercore.synco") {
                    log::warn!("Échec de l'enregistrement du schéma de deep-link (les liens fr.silvercore.synco:// ne fonctionneront pas) : {e}");
                }
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}