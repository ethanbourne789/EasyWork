import '../domain/signature_entity.dart';

abstract class SignatureRepository {
  Future<List<SignatureEntity>> getAllSignatures();
  Future<SignatureEntity?> getDefaultSignature();
  Future<int> createSignature(SignatureEntity signature);
  Future<void> updateSignature(SignatureEntity signature);
  Future<void> deleteSignature(int id);
}
