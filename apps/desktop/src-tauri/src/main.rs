#![cfg_attr(
  all(not(debug_assertions), target_os = "windows"),
  windows_subsystem = "windows"
)]

const CLOUD_AUTH_SERVICE: &str = "pdfDocGen";
const CLOUD_REFRESH_ACCOUNT: &str = "cloud-refresh-token";
const CLOUD_API_TOKEN_ACCOUNT: &str = "cloud-api-token";

fn credential_entry(account: &str) -> Result<keyring::Entry, String> {
  keyring::Entry::new(CLOUD_AUTH_SERVICE, account)
    .map_err(|error| format!("Unable to open the operating system credential store: {error}"))
}

fn set_secret(account: &str, value: &str) -> Result<(), String> {
  if value.trim().is_empty() {
    return Err("Credential cannot be empty.".into());
  }
  credential_entry(account)?
    .set_password(value.trim())
    .map_err(|error| format!("Unable to save the credential securely: {error}"))
}

fn read_secret(account: &str) -> Result<Option<String>, String> {
  match credential_entry(account)?.get_password() {
    Ok(value) => Ok(Some(value)),
    Err(keyring::Error::NoEntry) => Ok(None),
    Err(error) => Err(format!("Unable to read the credential securely: {error}")),
  }
}

fn clear_secret(account: &str) -> Result<(), String> {
  match credential_entry(account)?.delete_password() {
    Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
    Err(error) => Err(format!("Unable to clear the credential: {error}")),
  }
}

#[tauri::command]
fn cloud_auth_store_refresh_token(refresh_token: String) -> Result<(), String> {
  set_secret(CLOUD_REFRESH_ACCOUNT, &refresh_token)
}

#[tauri::command]
fn cloud_auth_read_refresh_token() -> Result<Option<String>, String> {
  read_secret(CLOUD_REFRESH_ACCOUNT)
}

#[tauri::command]
fn cloud_auth_clear_refresh_token() -> Result<(), String> {
  clear_secret(CLOUD_REFRESH_ACCOUNT)
}

#[tauri::command]
fn cloud_auth_store_api_token(api_token: String) -> Result<(), String> {
  set_secret(CLOUD_API_TOKEN_ACCOUNT, &api_token)
}

#[tauri::command]
fn cloud_auth_read_api_token() -> Result<Option<String>, String> {
  read_secret(CLOUD_API_TOKEN_ACCOUNT)
}

#[tauri::command]
fn cloud_auth_clear_api_token() -> Result<(), String> {
  clear_secret(CLOUD_API_TOKEN_ACCOUNT)
}

fn main() {
  tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![
      cloud_auth_store_refresh_token,
      cloud_auth_read_refresh_token,
      cloud_auth_clear_refresh_token,
      cloud_auth_store_api_token,
      cloud_auth_read_api_token,
      cloud_auth_clear_api_token,
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
