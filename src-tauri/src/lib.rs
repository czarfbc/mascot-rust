mod mascote;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let janela = app.get_webview_window("main").unwrap();
            mascote::iniciar(janela);
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}