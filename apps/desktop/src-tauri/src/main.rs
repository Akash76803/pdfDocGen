#![cfg_attr(
  all(not(debug_assertions), target_os = "windows"),
  windows_subsystem = "windows"
)]

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use rand::{rngs::OsRng, RngCore};
use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::io::{Read, Write};
use std::net::TcpListener;
use tauri::api::shell;
use url::Url;

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

#[derive(Deserialize)]
struct GoogleTokenResponse {
  id_token: Option<String>,
}

#[tauri::command]
async fn google_oauth_verify(window: tauri::Window, client_id: String) -> Result<String, String> {
  let client_id = client_id.trim().to_string();
  if client_id.is_empty() {
    return Err("Google OAuth client ID is not configured.".into());
  }

  let listener = TcpListener::bind("127.0.0.1:0")
    .map_err(|error| format!("Unable to start the local Google verification callback: {error}"))?;
  let port = listener.local_addr()
    .map_err(|error| format!("Unable to read the Google callback address: {error}"))?
    .port();
  let redirect_uri = format!("http://127.0.0.1:{port}/callback");

  let mut verifier_bytes = [0u8; 32];
  OsRng.fill_bytes(&mut verifier_bytes);
  let code_verifier = URL_SAFE_NO_PAD.encode(verifier_bytes);
  let code_challenge = URL_SAFE_NO_PAD.encode(Sha256::digest(code_verifier.as_bytes()));

  let mut state_bytes = [0u8; 24];
  OsRng.fill_bytes(&mut state_bytes);
  let state = URL_SAFE_NO_PAD.encode(state_bytes);

  let mut auth_url = Url::parse("https://accounts.google.com/o/oauth2/v2/auth")
    .map_err(|error| format!("Unable to build Google verification URL: {error}"))?;
  auth_url.query_pairs_mut()
    .append_pair("client_id", &client_id)
    .append_pair("redirect_uri", &redirect_uri)
    .append_pair("response_type", "code")
    .append_pair("scope", "openid email profile")
    .append_pair("code_challenge", &code_challenge)
    .append_pair("code_challenge_method", "S256")
    .append_pair("state", &state)
    .append_pair("prompt", "select_account");

  shell::open(&window.shell_scope(), auth_url.to_string(), None)
    .map_err(|error| format!("Unable to open Google verification in your browser: {error}"))?;

  let expected_state = state.clone();
  let code = tauri::async_runtime::spawn_blocking(move || -> Result<String, String> {
    let (mut stream, _) = listener.accept()
      .map_err(|error| format!("Google verification callback failed: {error}"))?;
    let mut buffer = [0u8; 8192];
    let bytes = stream.read(&mut buffer)
      .map_err(|error| format!("Unable to read Google verification callback: {error}"))?;
    let request = String::from_utf8_lossy(&buffer[..bytes]);
    let request_line = request.lines().next().ok_or_else(|| "Google callback was empty.".to_string())?;
    let path = request_line.split_whitespace().nth(1).ok_or_else(|| "Google callback URL was invalid.".to_string())?;
    let callback = Url::parse(&format!("http://127.0.0.1{path}"))
      .map_err(|error| format!("Google callback URL was invalid: {error}"))?;

    let mut code: Option<String> = None;
    let mut returned_state: Option<String> = None;
    let mut oauth_error: Option<String> = None;
    for (key, value) in callback.query_pairs() {
      match key.as_ref() {
        "code" => code = Some(value.into_owned()),
        "state" => returned_state = Some(value.into_owned()),
        "error" => oauth_error = Some(value.into_owned()),
        _ => {}
      }
    }

    let success = oauth_error.is_none() && returned_state.as_deref() == Some(expected_state.as_str()) && code.is_some();
    let html = if success {
      "<html><body style='font-family:sans-serif;padding:32px'><h2>pdfDocGen connected</h2><p>Google verification completed. You can close this window and return to the desktop app.</p></body></html>"
    } else {
      "<html><body style='font-family:sans-serif;padding:32px'><h2>Verification failed</h2><p>Return to pdfDocGen and try again.</p></body></html>"
    };
    let response = format!("HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}", html.as_bytes().len(), html);
    let _ = stream.write_all(response.as_bytes());

    if let Some(error) = oauth_error {
      return Err(format!("Google verification was cancelled or failed: {error}"));
    }
    if returned_state.as_deref() != Some(expected_state.as_str()) {
      return Err("Google verification state did not match.".into());
    }
    code.ok_or_else(|| "Google did not return an authorization code.".to_string())
  }).await.map_err(|error| format!("Google verification task failed: {error}"))??;

  let response = reqwest::Client::new()
    .post("https://oauth2.googleapis.com/token")
    .form(&[
      ("client_id", client_id.as_str()),
      ("code", code.as_str()),
      ("code_verifier", code_verifier.as_str()),
      ("grant_type", "authorization_code"),
      ("redirect_uri", redirect_uri.as_str()),
    ])
    .send()
    .await
    .map_err(|error| format!("Unable to exchange Google verification code: {error}"))?;

  if !response.status().is_success() {
    return Err(format!("Google token exchange failed ({}).", response.status()));
  }
  let tokens: GoogleTokenResponse = response.json().await
    .map_err(|error| format!("Google token response was invalid: {error}"))?;
  tokens.id_token.ok_or_else(|| "Google verification did not return an ID token.".to_string())
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
      google_oauth_verify,
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
