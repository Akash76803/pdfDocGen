#![cfg_attr(
  all(not(debug_assertions), target_os = "windows"),
  windows_subsystem = "windows"
)]

const CLOUD_AUTH_SERVICE: &str = "pdfDocGen";
const CLOUD_AUTH_ACCOUNT: &str = "cloud-refresh-token";

fn cloud_auth_entry() -> Result<keyring::Entry, String> {
  keyring::Entry::new(CLOUD_AUTH_SERVICE, CLOUD_AUTH_ACCOUNT)
    .map_err(|error| format!("Unable to open the operating system credential store: {error}"))
}

#[tauri::command]
fn cloud_auth_store_refresh_token(refresh_token: String) -> Result<(), String> {
  if refresh_token.trim().is_empty() {
    return Err("Refresh token cannot be empty.".into());
  }
  cloud_auth_entry()?
    .set_password(refresh_token.trim())
    .map_err(|error| format!("Unable to save the cloud session securely: {error}"))
}

#[tauri::command]
fn cloud_auth_read_refresh_token() -> Result<Option<String>, String> {
  match cloud_auth_entry()?.get_password() {
    Ok(value) => Ok(Some(value)),
    Err(keyring::Error::NoEntry) => Ok(None),
    Err(error) => Err(format!("Unable to read the cloud session securely: {error}")),
  }
}

#[tauri::command]
fn cloud_auth_clear_refresh_token() -> Result<(), String> {
  match cloud_auth_entry()?.delete_password() {
    Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
    Err(error) => Err(format!("Unable to clear the cloud session: {error}")),
  }
}

fn main() {
  tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![
      cloud_auth_store_refresh_token,
      cloud_auth_read_refresh_token,
      cloud_auth_clear_refresh_token,
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
