import 'package:drift/drift.dart';
import 'package:enough_mail/enough_mail.dart';
import '../../../core/database/app_database.dart';

class MimeMessageMapper {
  static EmailsCompanion toCompanion(MimeMessage message, int accountId) {
    final fromList = message.from;
    final firstFrom = fromList?.isNotEmpty == true ? fromList!.first : null;

    final toList = message.to;
    final toEmails = toList?.map((a) => a.email).join(', ');

    return EmailsCompanion.insert(
      accountId: accountId,
      messageId: message.decodeHeaderValue('message-id') ?? '',
      fromAddress: firstFrom?.email ?? '',
      receivedAt: message.decodeDate() ?? DateTime.now(),
      subject: Value(message.decodeSubject()),
      fromName: Value(firstFrom?.personalName),
      toList: Value(toEmails),
      bodyText: Value(message.decodeTextPlainPart()),
      bodyHtml: Value(message.decodeTextHtmlPart()),
      hasAttachments: Value(message.hasAttachments()),
      isRead: Value(message.isSeen),
      isStarred: Value(message.isFlagged),
      folder: const Value('INBOX'),
      originalMessageJson: Value(message.renderMessage()),
    );
  }

  static MimeMessage? fromOriginalMessageJson(String? rawMime) {
    if (rawMime == null || rawMime.isEmpty) return null;
    try {
      return MimeMessage.parseFromText(rawMime);
    } catch (_) {
      return null;
    }
  }

  static List<String> extractAttachmentNames(MimeMessage message) {
    final attachments = <String>[];
    final parts = message.parts;
    if (parts != null) {
      for (final part in parts) {
        final fileName = part.decodeFileName();
        if (fileName != null && fileName.isNotEmpty) {
          attachments.add(fileName);
        }
      }
    }
    return attachments;
  }
}
