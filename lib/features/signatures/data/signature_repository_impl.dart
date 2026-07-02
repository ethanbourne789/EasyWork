import 'package:drift/drift.dart';
import '../../../core/database/app_database.dart';
import '../../../core/database/tables/email_signatures_dao.dart';
import 'signature_repository.dart';
import '../domain/signature_entity.dart';

class SignatureRepositoryImpl implements SignatureRepository {
  final EmailSignaturesDao _signaturesDao;

  SignatureRepositoryImpl(this._signaturesDao);

  @override
  Future<List<SignatureEntity>> getAllSignatures() async {
    final sigs = await _signaturesDao.getAllSignatures();
    return sigs.map((s) => SignatureEntity(
      id: s.id,
      name: s.name,
      content: s.content,
      isDefault: s.isDefault,
      createdAt: s.createdAt,
    )).toList();
  }

  @override
  Future<SignatureEntity?> getDefaultSignature() async {
    final s = await _signaturesDao.getDefaultSignature();
    if (s == null) return null;
    return SignatureEntity(
      id: s.id,
      name: s.name,
      content: s.content,
      isDefault: s.isDefault,
      createdAt: s.createdAt,
    );
  }

  @override
  Future<int> createSignature(SignatureEntity signature) async {
    return _signaturesDao.insertSignature(EmailSignaturesCompanion(
      name: Value(signature.name),
      content: Value(signature.content),
      isDefault: Value(signature.isDefault),
    ));
  }

  @override
  Future<void> updateSignature(SignatureEntity signature) async {
    await _signaturesDao.updateSignature(EmailSignaturesCompanion(
      id: Value(signature.id!),
      name: Value(signature.name),
      content: Value(signature.content),
      isDefault: Value(signature.isDefault),
    ));
  }

  @override
  Future<void> deleteSignature(int id) async {
    await _signaturesDao.deleteSignature(id);
  }
}
