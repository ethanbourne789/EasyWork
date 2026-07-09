import 'dart:io';
import 'package:enough_mail/enough_mail.dart';
import 'package:path_provider/path_provider.dart';
import 'package:path/path.dart' as p;

/// Service for handling email attachments
class AttachmentService {
  /// Get the attachments directory for the app
  Future<Directory> getAttachmentsDir() async {
    final appDir = await getApplicationDocumentsDirectory();
    final attachDir = Directory(p.join(appDir.path, 'attachments'));
    if (!await attachDir.exists()) {
      await attachDir.create(recursive: true);
    }
    return attachDir;
  }

  /// Get the attachments directory for a specific email
  Future<Directory> getEmailAttachmentsDir(String messageId) async {
    final baseDir = await getAttachmentsDir();
    final safeMessageId = messageId.replaceAll(RegExp(r'[<>:"/\\|?*]'), '_');
    final emailDir = Directory(p.join(baseDir.path, safeMessageId));
    if (!await emailDir.exists()) {
      await emailDir.create(recursive: true);
    }
    return emailDir;
  }

  /// Extract attachment metadata from a MimeMessage
  List<AttachmentInfo> extractAttachments(MimeMessage message) {
    final contentInfos = message.findContentInfo(disposition: ContentDisposition.attachment);
    return contentInfos.map((info) {
      // Extract size from ContentInfo if available, otherwise decode to measure.
      int size = info.contentDisposition?.size ?? 0;
      if (size <= 0) {
        try {
          final data = info.fetchId != null
              ? message.getPart(info.fetchId!)?.decodeContentBinary()
              : null;
          if (data != null) size = data.length;
        } catch (_) {}
      }
      return AttachmentInfo(
        fileName: info.fileName ?? '',
        contentType: info.mediaType?.text ?? 'application/octet-stream',
        size: size,
        path: '',
      );
    }).where((a) => a.fileName.isNotEmpty).toList();
  }

  /// Download and save an attachment from a message
  Future<String> saveAttachment({
    required MimeMessage message,
    required AttachmentInfo attachment,
  }) async {
    final emailDir = await getEmailAttachmentsDir(
      message.decodeHeaderValue('message-id') ?? 'unknown',
    );

    final filePath = p.join(emailDir.path, attachment.fileName);
    final file = File(filePath);

    // Find the part in the message
    MimePart? targetPart;
    void findPart(MimePart part) {
      if (part.decodeFileName() == attachment.fileName) {
        targetPart = part;
        return;
      }
      final childParts = part.parts;
      if (childParts != null) {
        for (final child in childParts) {
          findPart(child);
        }
      }
    }

    final messageParts = message.parts;
    if (messageParts != null) {
      for (final part in messageParts) {
        findPart(part);
        if (targetPart != null) break;
      }
    }

    if (targetPart != null) {
      final data = targetPart!.decodeContentBinary();
      if (data != null) {
        await file.writeAsBytes(data);
      }
    }

    return filePath;
  }

  /// Delete all attachments for an email
  Future<void> deleteEmailAttachments(String messageId) async {
    final emailDir = await getEmailAttachmentsDir(messageId);
    if (await emailDir.exists()) {
      await emailDir.delete(recursive: true);
    }
  }

  /// Get total size of all attachments
  Future<int> getTotalSize() async {
    final baseDir = await getAttachmentsDir();
    int totalSize = 0;

    await for (final entity in baseDir.list(recursive: true)) {
      if (entity is File) {
        final stat = await entity.stat();
        totalSize += stat.size;
      }
    }

    return totalSize;
  }

  /// Clean up orphaned attachments (no matching email in DB)
  Future<int> cleanOrphanedAttachments(Set<String> validMessageIds) async {
    final baseDir = await getAttachmentsDir();
    int deletedCount = 0;

    if (!await baseDir.exists()) return 0;

    await for (final entity in baseDir.list()) {
      if (entity is Directory) {
        final dirName = p.basename(entity.path);
        if (!validMessageIds.contains(dirName)) {
          await entity.delete(recursive: true);
          deletedCount++;
        }
      }
    }

    return deletedCount;
  }
}

class AttachmentInfo {
  final String fileName;
  final String contentType;
  final int size;
  final String path;

  const AttachmentInfo({
    required this.fileName,
    required this.contentType,
    required this.size,
    required this.path,
  });

  String get displaySize {
    if (size < 1024) return '$size B';
    if (size < 1024 * 1024) return '${(size / 1024).toStringAsFixed(1)} KB';
    return '${(size / (1024 * 1024)).toStringAsFixed(1)} MB';
  }

  bool get isImage => contentType.startsWith('image/');
  bool get isPdf => contentType == 'application/pdf';
  bool get isText => contentType.startsWith('text/');
}
