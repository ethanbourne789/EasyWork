import 'package:drift/drift.dart';
import '../app_database.dart';
import 'email_attachments_table.dart';

part 'email_attachments_dao.g.dart';

@DriftAccessor(tables: [EmailAttachments])
class EmailAttachmentsDao extends DatabaseAccessor<AppDatabase>
    with _$EmailAttachmentsDaoMixin {
  EmailAttachmentsDao(AppDatabase db) : super(db);

  Future<List<EmailAttachment>> getAttachmentsByEmail(int emailId) =>
      (select(emailAttachments)
            ..where((t) => t.emailId.equals(emailId)))
          .get();
  Future<int> insertAttachment(EmailAttachmentsCompanion attachment) =>
      into(emailAttachments).insert(attachment);
  Future<int> deleteAttachmentsByEmail(int emailId) =>
      (delete(emailAttachments)..where((t) => t.emailId.equals(emailId))).go();
}
