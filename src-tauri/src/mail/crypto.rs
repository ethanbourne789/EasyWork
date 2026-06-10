//! Password encryption using AES-256-GCM.
//!
//! The master encryption key is stored in the OS keychain via `keyring`.
//! Each password is encrypted with a random 12-byte nonce.
//! Encrypted format: nonce (12 bytes) || ciphertext || tag (16 bytes)

use aes_gcm::{
    aead::{Aead, KeyInit, OsRng},
    Aes256Gcm, Nonce,
};
use rand::RngCore;

const APP_KEY_NAME: &str = "com.easywork.desktop";
const KEY_ENTRY_NAME: &str = "mail-encryption-key";

/// Get or generate the master encryption key from the OS keychain.
fn get_or_generate_key() -> Result<[u8; 32], String> {
    let entry = keyring::Entry::new(APP_KEY_NAME, KEY_ENTRY_NAME)
        .map_err(|e| format!("Failed to open keychain entry: {}", e))?;

    // Try to read existing key
    if let Ok(key_str) = entry.get_password() {
        let bytes: Vec<u8> = base64::Engine::decode(
            &base64::engine::general_purpose::STANDARD,
            &key_str,
        ).map_err(|e| format!("Failed to decode key: {}", e))?;

        if bytes.len() == 32 {
            let mut key = [0u8; 32];
            key.copy_from_slice(&bytes);
            return Ok(key);
        }
        log::warn!("Stored encryption key has wrong length, regenerating");
    }

    // Generate new key
    let mut key = [0u8; 32];
    OsRng.fill_bytes(&mut key);

    let encoded = base64::Engine::encode(
        &base64::engine::general_purpose::STANDARD,
        key,
    );

    entry.set_password(&encoded).map_err(|e| {
        log::warn!("Failed to store encryption key in system keychain: {}. \
            Passwords will be stored with base64 encoding as fallback.", e);
        return format!("Keychain error: {}", e);
    })?;

    log::info!("New encryption key generated and stored in OS keychain");
    Ok(key)
}

/// Encrypt a password string.
/// Returns base64-encoded (nonce || ciphertext || tag).
/// Falls back to plain base64 if keychain is unavailable.
pub fn encrypt_password(password: &str) -> Result<String, String> {
    let key = match get_or_generate_key() {
        Ok(k) => k,
        Err(e) => {
            log::warn!("Encryption key unavailable, using base64 fallback: {}", e);
            return Ok(base64::Engine::encode(
                &base64::engine::general_purpose::STANDARD,
                password,
            ));
        }
    };
    let cipher = Aes256Gcm::new_from_slice(&key).map_err(|e| format!("AES init: {}", e))?;

    // Generate random 12-byte nonce
    let mut nonce_bytes = [0u8; 12];
    OsRng.fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);

    let ciphertext = cipher.encrypt(nonce, password.as_bytes())
        .map_err(|e| format!("Encryption failed: {}", e))?;

    // Combine: nonce (12) || ciphertext + tag
    let mut result = Vec::with_capacity(12 + ciphertext.len());
    result.extend_from_slice(&nonce_bytes);
    result.extend_from_slice(&ciphertext);

    Ok(base64::Engine::encode(
        &base64::engine::general_purpose::STANDARD,
        result,
    ))
}

/// Decrypt a password.
/// Input is base64-encoded (nonce || ciphertext || tag).
/// Falls back to base64 decode if data looks like legacy format.
pub fn decrypt_password(encrypted_b64: &[u8]) -> Result<String, String> {
    let raw = base64::Engine::decode(
        &base64::engine::general_purpose::STANDARD,
        encrypted_b64,
    ).map_err(|e| format!("Base64 decode failed: {}", e))?;

    // Legacy base64-encoded data: try base64-decode it as UTF-8 first
    // (backward compatibility with accounts created before crypto was added)
    if raw.len() < 28 {
        // Too short to be AES-GCM (12 nonce + at least 16 tag), must be legacy
        return String::from_utf8(raw).map_err(|e| format!("UTF-8 decode failed: {}", e));
    }

    let key = match get_or_generate_key() {
        Ok(k) => k,
        Err(e) => {
            // Keychain unavailable, try legacy base64 decode
            log::warn!("Encryption key unavailable, trying base64 fallback: {}", e);
            return String::from_utf8(raw).map_err(|e| format!("UTF-8 decode failed: {}", e));
        }
    };
    let cipher = Aes256Gcm::new_from_slice(&key).map_err(|e| format!("AES init: {}", e))?;

    let (nonce_bytes, ciphertext) = raw.split_at(12);
    let nonce = Nonce::from_slice(nonce_bytes);

    let plaintext = match cipher.decrypt(nonce, ciphertext) {
        Ok(p) => p,
        Err(_) => {
            // AES-GCM failed (might be legacy data or key mismatch), try base64
            raw.clone()
        }
    };

    String::from_utf8(plaintext).map_err(|e| format!("UTF-8 decode failed: {}", e))
}

/// Clear encryption key from OS keychain (used when removing all accounts).
pub fn clear_key() -> Result<(), String> {
    let entry = keyring::Entry::new(APP_KEY_NAME, KEY_ENTRY_NAME)
        .map_err(|e| format!("Failed to open keychain entry: {}", e))?;
    entry.delete_credential().map_err(|e| format!("Failed to clear key: {}", e))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_encrypt_decrypt() {
        let password = "my_secret_password_123!@#";
        let encrypted = encrypt_password(password).expect("encrypt should succeed");
        let decrypted = decrypt_password(encrypted.as_bytes()).expect("decrypt should succeed");
        assert_eq!(password, decrypted);
    }

    #[test]
    fn test_legacy_base64_fallback() {
        let password = "legacy_password";
        let b64 = base64::Engine::encode(
            &base64::engine::general_purpose::STANDARD,
            password,
        );
        let decrypted = decrypt_password(b64.as_bytes()).expect("legacy fallback should work");
        assert_eq!(password, decrypted);
    }
}
