fn main() {
    // Sans manifeste explicite, Tauri v2 autorise par défaut toute commande
    // applicative enregistrée dans invoke_handler! à tout script de la
    // WebView qui en fait la demande (audit FX1).
    tauri_build::try_build(
        tauri_build::Attributes::new().app_manifest(tauri_build::AppManifest::new().commands(&[
            "open_external_url",
            "secure_store_set",
            "secure_store_get",
            "secure_store_delete",
        ])),
    )
    .expect("failed to run tauri-build");
}
