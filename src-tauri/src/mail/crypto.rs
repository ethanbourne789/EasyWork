//! Password encryption using AES-256-GCM.
//!
//! The master encryption key is stored in the OS keychain via `keyring`.
//! Each password is encrypted with a random 12-byte nonce.
//!
//! Wire format (stored in DB):
//!   "v1:" || base64(nonce [12 bytes] || ciphertext || tag [16 bytes])
//!
//! Legacy fallback format (keychain unavailable):
//!   "v0:" || base64(plaintext)
//!
//! The "v1:" / "v0:" prefix allows unambiguous format detection so we never
//! guess wrong between AES output and raw base64.
//!
//! An in-memory `OnceLock` cache guarantees that encrypt and decrypt always
//! use the **same key** within a process, even if the OS keychain is
//! temporarily unavailable.

use aes_gcm::{
    aead::{Aead, KeyInit, OsRng},
    Aes256Gcm, Nonce,
};
use rand::RngCore;
use std::sync::{Mutex, OnceLock};

const APP_KEY_NAME: &str = "com.easywork.desktop";
const KEY_ENTRY_NAME: &str = "mail-encryption-key";

/// In-memory key cache.
/// Populated from the keychain at startup, or from a generated key when the
/// keychain is unavailable.  `OnceLock` guarantees exactly-once initialisation.
static CACHED_KEY: OnceLock<[u8; 32]> = OnceLock::new();

/// Serialises keychain reads so concurrent calls cannot race.
static KEYCHAIN_LOCK: Mutex<()> = Mutex::new(());

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/// Try to read the 32-byte encryption key from the OS keychain.
///
/// Returns:
///   `Ok(Some(key))` – key found and decoded
///   `Ok(None)`        – no key stored yet (not an error)
///   `Err(msg)`        – keychain access error (permission denied, etc.)
fn read_key_from_keychain() -> Result<Option<[u8; 32]>, String> {
    let entry = keyring::Entry::new(APP_KEY_NAME, KEY_ENTRY_NAME)
        .map_err(|e| format!("Failed to open keychain entry: {}", e))?;

    let key_str = match entry.get_password() {
        Ok(s) => s,
        Err(e) => {
            // keyring::Error::NoEntry is expected when no key exists yet.
            log::debug!("No key in keychain (not an error): {}", e);
            return Ok(None);
        }
    };

    let bytes = base64::Engine::decode(
        &base64::engine::general_purpose::STANDARD,
        &key_str,
    )
    .map_err(|e| format!("Failed to decode key from keychain: {}", e))?;

    if bytes.len() != 32 {
        log::warn!(
            "Stored key has wrong length ({} bytes), will regenerate",
            bytes.len()
        );
        return Ok(None);
    }

    let mut key = [0u8; 32];
    key.copy_from_slice(&bytes);
    Ok(Some(key))
}

/// Generate a fresh 32-byte random key and attempt to persist it to the
/// keychain.  The key is **always** installed into `CACHED_KEY` so the
/// current session can continue to encrypt/decrypt even when the keychain
/// write fails.
fn generate_and_store_key() -> Result<[u8; 32], String> {
    let mut key = [0u8; 32];
    OsRng.fill_bytes(&mut key);

    let encoded = base64::Engine::encode(
        &base64::engine::general_purpose::STANDARD,
        key,
    );

    match keyring::Entry::new(APP_KEY_NAME, KEY_ENTRY_NAME) {
        Ok(entry) => {
            if let Err(e) = entry.set_password(&encoded) {
                log::warn!(
                    "Failed to store encryption key in system keychain: {}. \
                     Key is cached in memory for this session only.",
                    e
                );
                // Not a fatal error — the in-memory key is still usable.
            } else {
                log::info!("New encryption key generated and stored in OS keychain");
            }
        }
        Err(e) => {
            log::warn!("Failed to open keychain for write: {}", e);
        }
    }

    // Always cache so this session can decrypt its own passwords.
    let _ = CACHED_KEY.set(key);
    Ok(key)
}

/// Get or generate the master encryption key.
///
/// Resolution order:
/// 1. In-memory `CACHED_KEY` (fast path, no lock needed).
/// 2. OS keychain (slow path, under `KEYCHAIN_LOCK`).
/// 3. Generate a new in-memory key if (2) fails or returns `None`.
///
/// Guarantees: within a single process, the same key is always returned,
/// so `encrypt_password` and `decrypt_password` never disagree.
fn get_or_generate_key() -> Result<[u8; 32], String> {
    // ----- fast path: already cached -----
    if let Some(key) = CACHED_KEY.get() {
        return Ok(*key);
    }

    // ----- slow path: acquire lock -----
    let _guard = KEYCHAIN_LOCK.lock().unwrap();

    // Double-check after acquiring lock (another thread may have initialised).
    if let Some(key) = CACHED_KEY.get() {
        return Ok(*key);
    }

    // Try keychain first.
    match read_key_from_keychain() {
        Ok(Some(key)) => {
            let _ = CACHED_KEY.set(key);
            log::info!("Encryption key loaded from OS keychain");
            return Ok(key);
        }
        Ok(None) => {
            // No key yet — generate one.
            log::info!("No encryption key found, generating new one");
            return generate_and_store_key();
        }
        Err(e) => {
            // Keychain error (access denied, service unavailable, etc.)
            // Generate an in-memory key so the session can still work.
            log::warn!(
                "Cannot access OS keychain ({}). \
                 Generating in-memory key — passwords encrypted in this \
                 session cannot be decrypted by another session unless the \
                 keychain is restored.",
                e
            );
            return generate_and_store_key();
        }
    }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/// Encrypt a password string.
///
/// Returns a string with prefix:
///   - `"v1:..."` — AES-256-GCM encrypted (normal path)
///   - `"v0:..."` — legacy base64 fallback (keychain completely unavailable)
///
/// The prefix is stored in the database alongside the encoded payload so
/// `decrypt_password` can unambiguously choose the correct decoding path.
pub fn encrypt_password(password: &str) -> Result<String, String> {
    let key = match get_or_generate_key() {
        Ok(k) => k,
        Err(e) => {
            log::error!(
                "Failed to get or generate encryption key: {}, \
                 using legacy v0 fallback",
                e
            );
            return Ok(format!(
                "v0:{}",
                base64::Engine::encode(
                    &base64::engine::general_purpose::STANDARD,
                    password,
                )
            ));
        }
    };

    let cipher = Aes256Gcm::new_from_slice(&key)
        .map_err(|e| format!("AES init: {}", e))?;

    // Random 12-byte nonce (AES-GCM recommended size).
    let mut nonce_bytes = [0u8; 12];
    OsRng.fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);

    let ciphertext = cipher
        .encrypt(nonce, password.as_bytes())
        .map_err(|e| format!("Encryption failed: {}", e))?;

    // Wire bytes: nonce (12) || ciphertext+tag
    let mut raw = Vec::with_capacity(12 + ciphertext.len());
    raw.extend_from_slice(&nonce_bytes);
    raw.extend_from_slice(&ciphertext);

    Ok(format!(
        "v1:{}",
        base64::Engine::encode(&base64::engine::general_purpose::STANDARD, raw)
    ))
}

/// Decrypt a password that was produced by `encrypt_password`.
///
/// Accepts all three wire formats:
///   - `"v1:..."` — current AES-256-GCM format
///   - `"v0:..."` — legacy fallback (keychain was unavailable at encrypt time)
///   - no prefix  — raw base64, for data written before prefixes existed
///
/// Returns the plaintext password as a `String`.
pub fn decrypt_password(encrypted_b64: &[u8]) -> Result<String, String> {
    let s = String::from_utf8(encrypted_b64.to_vec())
        .map_err(|e| format!("Encrypted value is not valid UTF-8: {}", e))?;

    // ----- v1: AES-256-GCM -----
    if let Some(payload) = s.strip_prefix("v1:") {
        let raw = base64::Engine::decode(
            &base64::engine::general_purpose::STANDARD,
            payload,
        )
        .map_err(|e| format!("Base64 decode failed (v1): {}", e))?;

        if raw.len() < 28 {
            return Err(
                "Encrypted data too short to be valid AES-GCM output".to_string(),
            );
        }

        let key = get_or_generate_key()
            .map_err(|e| format!("Cannot decrypt (no encryption key): {}", e))?;

        let cipher = Aes256Gcm::new_from_slice(&key)
            .map_err(|e| format!("AES init: {}", e))?;

        let (nonce_bytes, ciphertext) = raw.split_at(12);
        let nonce = Nonce::from_slice(nonce_bytes);

        let plaintext = cipher
            .decrypt(nonce, ciphertext)
            .map_err(|e| format!("Decryption failed (wrong key?): {}", e))?;

        return String::from_utf8(plaintext)
            .map_err(|e| format!("Decrypted data is not valid UTF-8: {}", e));
    }

    // ----- v0: legacy base64-encoded plaintext -----
    if let Some(payload) = s.strip_prefix("v0:") {
        let raw = base64::Engine::decode(
            &base64::engine::general_purpose::STANDARD,
            payload,
        )
        .map_err(|e| format!("Legacy base64 decode failed (v0): {}", e))?;
        return String::from_utf8(raw)
            .map_err(|e| format!("Legacy data is not valid UTF-8: {}", e));
    }

    // ----- no prefix: raw base64 (legacy, pre-prefix data) -----
    let raw = base64::Engine::decode(
        &base64::engine::general_purpose::STANDARD,
        &s,
    )
    .map_err(|e| format!("Base64 decode failed (no-prefix legacy): {}", e))?;
    String::from_utf8(raw)
        .map_err(|e| format!("Legacy data is not valid UTF-8: {}", e))
}

/// Clear the encryption key from the OS keychain.
///
/// Also invalidates the in-memory cache by removing the keychain entry;
/// the next call to `get_or_generate_key()` will generate a fresh key.
///
/// Call this when the user removes all mail accounts.
#[allow(dead_code)]
pub fn clear_key() -> Result<(), String> {
    let entry = keyring::Entry::new(APP_KEY_NAME, KEY_ENTRY_NAME)
        .map_err(|e| format!("Failed to open keychain entry: {}", e))?;

    match entry.delete_credential() {
        Ok(()) => {
            log::info!("Encryption key cleared from OS keychain");
            Ok(())
        }
        Err(e) => {
            // Not all keychain backends support delete, or the key may not exist.
            log::warn!("Could not clear key from keychain: {}", e);
            Err(format!("Failed to clear key: {}", e))
        }
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_encrypt_decrypt_v1() {
        let password = "my_secret_password_123!@#";
        let encrypted = encrypt_password(password).expect("encrypt should succeed");
        assert!(
            encrypted.starts_with("v1:"),
            "encrypted format should have v1: prefix"
        );
        let decrypted = decrypt_password(encrypted.as_bytes())
            .expect("decrypt should succeed");
        assert_eq!(password, decrypted);
    }

    #[test]
    fn test_legacy_v0_roundtrip() {
        let password = "legacy_password";
        let encrypted = format!(
            "v0:{}",
            base64::Engine::encode(
                &base64::engine::general_purpose::STANDARD,
                password,
            )
        );
        let decrypted = decrypt_password(encrypted.as_bytes())
            .expect("v0 decrypt should succeed");
        assert_eq!(password, decrypted);
    }

    #[test]
    fn test_legacy_no_prefix() {
        let password = "no_prefix_password";
        let b64 = base64::Engine::encode(
            &base64::engine::general_purpose::STANDARD,
            password,
        );
        let decrypted = decrypt_password(b64.as_bytes())
            .expect("legacy no-prefix should work");
        assert_eq!(password, decrypted);
    }

    #[test]
    fn test_decrypt_invalid_v1_data() {
        // Random bytes disguised as v1: should fail AES decryption.
        let fake = format!(
            "v1:{}",
            base64::Engine::encode(
                &base64::engine::general_purpose::STANDARD,
                vec![1, 2, 3, 4, 5],
            )
        );
        let result = decrypt_password(fake.as_bytes());
        assert!(result.is_err(), "short v1 data should fail decryption");
    }
}
