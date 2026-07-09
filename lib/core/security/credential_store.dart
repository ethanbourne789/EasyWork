import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class CredentialStore {
  final FlutterSecureStorage _storage = const FlutterSecureStorage();

  Future<void> savePassword(int accountId, String password) async {
    await _storage.write(key: 'email_account_$accountId', value: password);
  }

  Future<String?> getPassword(int accountId) async {
    return _storage.read(key: 'email_account_$accountId');
  }

  Future<void> deletePassword(int accountId) async {
    await _storage.delete(key: 'email_account_$accountId');
    // Also clean up DKIM keys when the account is deleted.
    await deleteDkimKey(accountId);
  }

  // ---- DKIM private key storage ----

  Future<void> saveDkimKey(int accountId, String privateKey) async {
    await _storage.write(key: 'dkim_key_$accountId', value: privateKey);
  }

  Future<String?> getDkimKey(int accountId) async {
    return _storage.read(key: 'dkim_key_$accountId');
  }

  Future<void> deleteDkimKey(int accountId) async {
    await _storage.delete(key: 'dkim_key_$accountId');
  }
}
