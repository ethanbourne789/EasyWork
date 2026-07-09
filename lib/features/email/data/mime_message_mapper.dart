import 'package:drift/drift.dart';
import 'package:enough_mail/enough_mail.dart';
import '../../../core/database/app_database.dart';

class MimeMessageMapper {
  static EmailsCompanion toCompanion(MimeMessage message, int accountId, {String? folder}) {
    final fromList = message.from;
    final firstFrom = fromList?.isNotEmpty == true ? fromList!.first : null;

    final toEmails = message.to?.map((a) => a.email).join(', ');
    final ccEmails = message.cc?.map((a) => a.email).join(', ');
    final bccEmails = message.bcc?.map((a) => a.email).join(', ');

    final inReplyTo = message.decodeHeaderValue('in-reply-to');
    final references = message.decodeHeaderValue('references');
    final replyToList = message.replyTo;
    final replyTo = replyToList?.isNotEmpty == true
        ? replyToList!.map((a) => a.email).join(', ')
        : null;

    return EmailsCompanion.insert(
      accountId: accountId,
      messageId: message.decodeHeaderValue('message-id') ?? '',
      uid: Value(message.uid),
      fromAddress: firstFrom?.email ?? '',
      receivedAt: message.decodeDate() ?? DateTime.now(),
      subject: Value(message.decodeSubject()),
      fromName: Value(firstFrom?.personalName),
      toList: Value(toEmails),
      ccList: Value(ccEmails),
      bccList: Value(bccEmails),
      bodyText: Value(message.decodeTextPlainPart()),
      bodyHtml: Value(message.decodeTextHtmlPart()),
      hasAttachments: Value(message.hasAttachments()),
      isRead: Value(message.isSeen),
      isStarred: Value(message.isFlagged),
      isAnswered: Value(message.isAnswered),
      isForwarded: Value(message.isForwarded),
      folder: Value(folder ?? 'INBOX'),
      inReplyTo: Value(inReplyTo),
      references: Value(references),
      replyTo: Value(replyTo),
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
    for (final part in message.allPartsFlat) {
      final fileName = part.decodeFileName();
      if (fileName != null && fileName.isNotEmpty) {
        attachments.add(fileName);
      }
    }
    return attachments;
  }
}
