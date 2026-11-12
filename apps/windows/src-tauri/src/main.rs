#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::path::PathBuf;
use std::sync::Mutex;

use serde::Serialize;

struct StartupProject(Mutex<Option<PathBuf>>);

#[derive(Serialize)]
struct StartupProjectPayload {
    name: String,
    bytes: Vec<u8>,
}

fn find_startup_project_argument() -> Option<PathBuf> {
    std::env::args_os()
        .skip(1)
        .map(PathBuf::from)
        .find(|path| {
            path.extension()
                .and_then(|extension| extension.to_str())
                .is_some_and(|extension| extension.eq_ignore_ascii_case("nvtsphoto"))
                && path.is_file()
        })
}

#[tauri::command]
fn take_startup_project(
    state: tauri::State<'_, StartupProject>,
) -> Result<Option<StartupProjectPayload>, String> {
    let path = state
        .0
        .lock()
        .map_err(|_| "No se pudo acceder al proyecto de inicio.".to_string())?
        .take();
    let Some(path) = path else {
        return Ok(None);
    };

    let name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("Proyecto.nvtsphoto")
        .to_string();
    let bytes = std::fs::read(&path)
        .map_err(|error| format!("No se pudo leer {name}: {error}"))?;

    Ok(Some(StartupProjectPayload { name, bytes }))
}

fn main() {
    let startup_project = StartupProject(Mutex::new(find_startup_project_argument()));

    tauri::Builder::default()
        .manage(startup_project)
        .invoke_handler(tauri::generate_handler![take_startup_project])
        .run(tauri::generate_context!())
        .expect("failed to run NVTS desktop application");
}
