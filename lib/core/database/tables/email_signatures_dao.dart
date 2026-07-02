import 'package:drift/drift.dart';
import '../app_database.dart';
import 'email_signatures_table.dart';

part 'email_signatures_dao.g.dart';

@DriftAccessor(tables: [EmailSignatures])
class EmailSignaturesDao extends DatabaseAccessor<AppDatabase>
    with _$EmailSignaturesDaoMixin {
  EmailSignaturesDao(AppDatabase db) : super(db);

  Future<List<EmailSignature>> getAllSignatures() =>
      select(emailSignatures).get();
  Future<EmailSignature?> getDefaultSignature() =>
      (select(emailSignatures)..where((t) => t.isDefault.equals(true)))
          .getSingleOrNull();
  Future<int> insertSignature(EmailSignaturesCompanion signature) =>
      into(emailSignatures).insert(signature);
  Future<bool> updateSignature(EmailSignaturesCompanion signature) =>
      update(emailSignatures).replace(signature);
  Future<int> deleteSignature(int id) =>
      (delete(emailSignatures)..where((t) => t.id.equals(id))).go();
}
