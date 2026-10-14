use tauri::{Emitter, Manager};
use url::Url;

// Seule destination légitime : la page d'autorisation Keycloak (keycloak.ts,
// tauriLogin). Cette commande est appelable par tout script de la WebView
// (XSS, dépendance compromise…) — sans liste blanche, elle devient un
// lanceur générique, et sous Windows `cmd /C start` ne protège même pas
// contre l'injection de commande (audit FX1).
const ALLOWED_EXTERNAL_HOSTS: &[&str] = &["auth.silvercore.fr"];

fn validate_external_url(raw: &str) -> Result<Url, String> {
    let url = Url::parse(raw).map_err(|_| "URL invalide".to_string())?;
    if url.scheme() != "https" {
        return Err("Seul https:// est autorisé".into());
    }
    match url.host_str() {
        Some(h) if ALLOWED_EXTERNAL_HOSTS.contains(&h) => Ok(url),
        _ => Err("Hôte non autorisé".into()),
    }
}

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
    let validated = validate_external_url(&url)?;
    let url = validated.as_str();

    #[cfg(target_os = "linux")]
    {
        let mut cmd = std::process::Command::new("xdg-open");
        cmd.arg(url);
        for var in APPIMAGE_POLLUTED_ENV_VARS {
            cmd.env_remove(var);
        }
        return cmd.spawn().map(|_| ()).map_err(|e| e.to_string());
    }
    #[cfg(target_os = "macos")]
    {
        return std::process::Command::new("open")
            .arg(url)
            .spawn()
            .map(|_| ())
            .map_err(|e| e.to_string());
    }
    #[cfg(target_os = "windows")]
    {
        // Jamais `cmd /C start` : cmd.exe réinterprète & | ^ < > même avec un
        // argument "déjà" entouré de guillemets par les règles de quotage
        // MSVC de std::process::Command, qui n'échappent pas ces méta-
        // caractères. rundll32 reçoit l'URL comme un argument de processus
        // unique, sans passer par un shell (audit FX1).
        return std::process::Command::new("rundll32")
            .args(["url.dll,FileProtocolHandler", url])
            .spawn()
            .map(|_| ())
            .map_err(|e| e.to_string());
    }
    #[cfg(not(any(target_os = "linux", target_os = "macos", target_os = "windows")))]
    {
        Err("open_external_url is not supported on this platform".into())
    }
}

// Stockage sécurisé du refresh token Keycloak (audit FC9) — jamais en clair
// dans localStorage, qui est un fichier non chiffré du profil utilisateur
// sur Tauri. `ALLOWED_KEYS` empêche le front d'utiliser ces commandes comme
// un coffre générique : seule la clé attendue par keycloak.ts est acceptée.
// Toujours déclarées (pas de #[cfg] sur le module) pour que
// `invoke_handler!` reste une liste unique valable sur toutes les cibles :
// sur mobile, où `keyring` n'est pas lié, elles échouent simplement — le
// front mobile ne les appelle jamais, Capacitor gère son propre coffre côté
// JS.
mod secure_store {
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    const ALLOWED_KEYS: &[&str] = &["kc_refreshToken"];

    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    const SERVICE: &str = "fr.silvercore.synco";

    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    fn entry(key: &str) -> Result<keyring::Entry, String> {
        if !ALLOWED_KEYS.contains(&key) {
            return Err("clé non autorisée".into());
        }
        keyring::Entry::new(SERVICE, key).map_err(|e| e.to_string())
    }

    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    #[tauri::command]
    pub fn secure_store_set(key: String, value: String) -> Result<(), String> {
        entry(&key)?.set_password(&value).map_err(|e| e.to_string())
    }
    #[cfg(any(target_os = "android", target_os = "ios"))]
    #[tauri::command]
    pub fn secure_store_set(_key: String, _value: String) -> Result<(), String> {
        Err("not supported on this platform".into())
    }

    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    #[tauri::command]
    pub fn secure_store_get(key: String) -> Result<Option<String>, String> {
        match entry(&key)?.get_password() {
            Ok(v) => Ok(Some(v)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(e.to_string()),
        }
    }
    #[cfg(any(target_os = "android", target_os = "ios"))]
    #[tauri::command]
    pub fn secure_store_get(_key: String) -> Result<Option<String>, String> {
        Err("not supported on this platform".into())
    }

    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    #[tauri::command]
    pub fn secure_store_delete(key: String) -> Result<(), String> {
        match entry(&key)?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(e.to_string()),
        }
    }
    #[cfg(any(target_os = "android", target_os = "ios"))]
    #[tauri::command]
    pub fn secure_store_delete(_key: String) -> Result<(), String> {
        Err("not supported on this platform".into())
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
        .invoke_handler(tauri::generate_handler![
            open_external_url,
            secure_store::secure_store_set,
            secure_store::secure_store_get,
            secure_store::secure_store_delete
        ])
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