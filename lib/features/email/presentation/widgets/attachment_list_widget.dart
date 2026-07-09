import 'dart:developer' as dev;
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:enough_mail/enough_mail.dart';
import 'package:path_provider/path_provider.dart';
import 'package:path/path.dart' as p;
import 'package:url_launcher/url_launcher.dart';
import '../../../../core/providers/database_providers.dart';
import '../../../../features/email/providers/email_providers.dart';

class AttachmentListWidget extends ConsumerStatefulWidget {
  final MimeMessage message;
  /// Real account id and stored server UID of the message. Required for
  /// on-demand attachment fetching when the body was not fully downloaded
  /// (see [MailDataSource.fetchAttachmentPart], BUG-03).
  final int? accountId;
  final int? uid;

  const AttachmentListWidget({
    super.key,
    required this.message,
    this.accountId,
    this.uid,
  });

  @override
  ConsumerState<AttachmentListWidget> createState() => _AttachmentListWidgetState();
}

class _AttachmentListWidgetState extends ConsumerState<AttachmentListWidget> {
  List<_AttachmentInfo> _attachments = [];
  final Map<String, String> _savedPaths = {};
  final Set<String> _downloading = {};
  final Map<String, bool> _cancelRequested = {};
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _extractAttachments();
  }

  void _extractAttachments() {
    final attachments = <_AttachmentInfo>[];

    void processPart(MimePart part) {
      // Skip inline parts (embedded images referenced by CID).
      // Inline parts have Content-Disposition: inline or a Content-ID header.
      final dispositionHeader = part.getHeaderContentDisposition();
      final isInline = dispositionHeader?.disposition == ContentDisposition.inline;
      final hasContentId = part.hasHeader('content-id');
      if (isInline || hasContentId) {
        // Still process children in case they have attachment sub-parts
        final childParts = part.parts;
        if (childParts != null) {
          for (final child in childParts) {
            processPart(child);
          }
        }
        return;
      }

      final fileName = part.decodeFileName();
      if (fileName != null && fileName.isNotEmpty) {
        final contentType = part.mediaType.text;
        // Prefer the declared size; fall back to the decoded bytes length.
        final disp = part.getHeaderContentDisposition();
        final size = disp?.size ?? part.decodeContentBinary()?.length ?? 0;
        attachments.add(_AttachmentInfo(
          fileName: fileName,
          contentType: contentType,
          part: part,
          cachedSize: size,
        ));
      }
      final childParts = part.parts;
      if (childParts != null) {
        for (final child in childParts) {
          processPart(child);
        }
      }
    }

    final parts = widget.message.parts;
    if (parts != null) {
      for (final part in parts) {
        processPart(part);
      }
    }

    setState(() {
      _attachments = attachments;
      _loading = false;
    });
  }

  Future<void> _saveAttachment(_AttachmentInfo info) async {
    if (_downloading.contains(info.fileName)) return;
    setState(() {
      _downloading.add(info.fileName);
      _cancelRequested[info.fileName] = false;
    });
    try {
      if (_cancelRequested[info.fileName] == true) return;

      final appDir = await getApplicationDocumentsDirectory();
      final messageId = widget.message.decodeHeaderValue('message-id') ?? 'unknown';
      final safeMessageId = messageId.replaceAll(RegExp(r'[<>:"/\\|?*]'), '_');
      final attachDir = Directory(p.join(appDir.path, 'attachments', safeMessageId));
      if (!await attachDir.exists()) {
        await attachDir.create(recursive: true);
      }

      if (_cancelRequested[info.fileName] == true) {
        setState(() {
          _downloading.remove(info.fileName);
          _cancelRequested.remove(info.fileName);
        });
        return;
      }

      final file = File(p.join(attachDir.path, info.fileName));

      // Try the in-memory part first (works for messages downloaded in full).
      Uint8List? bytes = info.part.decodeContentBinary();

      // BUG-03 fix: large messages are only partially downloaded, so the part
      // binary is null. Fetch the individual attachment part on demand using
      // the stored server UID (reconstructed messages have no MimeMessage uid).
      if (bytes == null && widget.accountId != null && widget.uid != null) {
        final ds = ref.read(mailDataSourcesProvider)[widget.accountId!];
        // Use the part's fetchId if available for on-demand fetching.
        // fetchId is defined on BodyPart (a subclass of MimePart).
        final fetchId = (info.part is BodyPart) ? (info.part as BodyPart).fetchId : null;
        if (ds != null && fetchId != null) {
          try {
            final fetchedPart = await ds.fetchAttachmentPart(widget.uid!, fetchId);
            bytes = fetchedPart.decodeContentBinary();
          } catch (e) {
            dev.log('按需拉取附件失败: $e', name: 'AttachmentListWidget');
          }
        }
      }

      if (bytes != null && mounted) {
        await file.writeAsBytes(bytes);
        if (_cancelRequested[info.fileName] == true) {
          if (await file.exists()) await file.delete();
          setState(() {
            _downloading.remove(info.fileName);
            _cancelRequested.remove(info.fileName);
          });
          return;
        }
        setState(() {
          _savedPaths[info.fileName] = file.path;
          _downloading.remove(info.fileName);
          _cancelRequested.remove(info.fileName);
        });

        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('已保存: ${info.fileName}')),
          );
        }
      } else if (mounted) {
        setState(() {
          _downloading.remove(info.fileName);
          _cancelRequested.remove(info.fileName);
        });
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('附件数据未下载，已尝试重新获取但仍失败，请检查网络连接后重试'),
            backgroundColor: Colors.orange,
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _downloading.remove(info.fileName);
          _cancelRequested.remove(info.fileName);
        });
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('保存失败: $e'), backgroundColor: Colors.red),
        );
      }
    }
  }

  void _cancelDownload(String fileName) {
    _cancelRequested[fileName] = true;
  }

  Future<void> _openAttachment(_AttachmentInfo info) async {
    final path = _savedPaths[info.fileName];
    if (path == null) {
      // Save first, then open
      await _saveAttachment(info);
      final newPath = _savedPaths[info.fileName];
      if (newPath != null) {
        await _openFile(newPath);
      }
    } else {
      await _openFile(path);
    }
  }

  Future<void> _openFile(String path) async {
    final uri = Uri.file(path);
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri);
    } else {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('无法打开文件')),
        );
      }
    }
  }

  IconData _getFileIcon(String contentType) {
    if (contentType.startsWith('image/')) return Icons.image;
    if (contentType.startsWith('video/')) return Icons.video_file;
    if (contentType.startsWith('audio/')) return Icons.audio_file;
    if (contentType == 'application/pdf') return Icons.picture_as_pdf;
    if (contentType.contains('word') || contentType.contains('document')) return Icons.description;
    if (contentType.contains('sheet') || contentType.contains('excel')) return Icons.table_chart;
    if (contentType.contains('presentation') || contentType.contains('powerpoint')) return Icons.slideshow;
    if (contentType.startsWith('text/')) return Icons.text_snippet;
    if (contentType.contains('zip') || contentType.contains('rar') || contentType.contains('archive')) return Icons.archive;
    return Icons.attach_file;
  }

  Color _getFileIconColor(String contentType) {
    if (contentType.startsWith('image/')) return Colors.purple;
    if (contentType.startsWith('video/')) return Colors.red;
    if (contentType.startsWith('audio/')) return Colors.orange;
    if (contentType == 'application/pdf') return Colors.red.shade700;
    if (contentType.contains('word')) return Colors.blue;
    if (contentType.contains('sheet') || contentType.contains('excel')) return Colors.green;
    return Colors.grey;
  }

  String _formatSize(int bytes) {
    if (bytes < 1024) return '$bytes B';
    if (bytes < 1024 * 1024) return '${(bytes / 1024).toStringAsFixed(1)} KB';
    return '${(bytes / (1024 * 1024)).toStringAsFixed(1)} MB';
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const SizedBox.shrink();
    if (_attachments.isEmpty) return const SizedBox.shrink();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          child: Row(
            children: [
              Icon(Icons.attach_file, size: 16, color: Colors.grey[600]),
              const SizedBox(width: 4),
              Text(
                '附件 (${_attachments.length})',
                style: TextStyle(
                  fontWeight: FontWeight.w600,
                  color: Colors.grey[700],
                ),
              ),
            ],
          ),
        ),
        ListView.separated(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          itemCount: _attachments.length,
          separatorBuilder: (_, __) => const Divider(height: 1, indent: 56),
          itemBuilder: (context, index) {
            final info = _attachments[index];
            final isSaved = _savedPaths.containsKey(info.fileName);

            return ListTile(
              dense: true,
              leading: Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  color: _getFileIconColor(info.contentType).withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Icon(
                  _getFileIcon(info.contentType),
                  color: _getFileIconColor(info.contentType),
                  size: 22,
                ),
              ),
              title: Text(
                info.fileName,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontSize: 13),
              ),
              subtitle: Text(
                _formatSize(info.cachedSize),
                style: TextStyle(fontSize: 11, color: Colors.grey[500]),
              ),
              trailing: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (_downloading.contains(info.fileName))
                    IconButton(
                      icon: const SizedBox(
                        width: 32,
                        height: 32,
                        child: Padding(
                          padding: EdgeInsets.all(6),
                          child: CircularProgressIndicator(strokeWidth: 2),
                        ),
                      ),
                      tooltip: '取消下载',
                      onPressed: () => _cancelDownload(info.fileName),
                      padding: const EdgeInsets.all(4),
                      constraints: const BoxConstraints(minWidth: 32, minHeight: 32),
                    )
                  else
                    IconButton(
                      icon: Icon(
                        isSaved ? Icons.open_in_new : Icons.download,
                        size: 20,
                      ),
                      tooltip: isSaved ? '打开' : '下载',
                      onPressed: () => isSaved
                          ? _openAttachment(info)
                          : _saveAttachment(info),
                      padding: const EdgeInsets.all(4),
                      constraints: const BoxConstraints(minWidth: 32, minHeight: 32),
                    ),
                  IconButton(
                    icon: const Icon(Icons.more_vert, size: 20),
                    tooltip: '更多',
                    onPressed: _downloading.contains(info.fileName)
                        ? null
                        : () => _showAttachmentMenu(context, info),
                    padding: const EdgeInsets.all(4),
                    constraints: const BoxConstraints(minWidth: 32, minHeight: 32),
                  ),
                ],
              ),
            );
          },
        ),
      ],
    );
  }

  void _showAttachmentMenu(BuildContext context, _AttachmentInfo info) {
    showModalBottomSheet<void>(
      context: context,
      builder: (context) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.download),
              title: const Text('保存到本地'),
              onTap: () {
                Navigator.pop(context);
                _saveAttachment(info);
              },
            ),
            ListTile(
              leading: const Icon(Icons.open_in_new),
              title: const Text('打开文件'),
              onTap: () {
                Navigator.pop(context);
                _openAttachment(info);
              },
            ),
            ListTile(
              leading: const Icon(Icons.copy),
              title: const Text('复制文件路径'),
              onTap: () {
                Navigator.pop(context);
                final path = _savedPaths[info.fileName];
                if (path != null) {
                  Clipboard.setData(ClipboardData(text: path));
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('已复制文件路径')),
                  );
                } else {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('请先下载附件')),
                  );
                }
              },
            ),
          ],
        ),
      ),
    );
  }
}

class _AttachmentInfo {
  final String fileName;
  final String contentType;
  final MimePart part;
  final int cachedSize;

  const _AttachmentInfo({
    required this.fileName,
    required this.contentType,
    required this.part,
    this.cachedSize = 0,
  });
}
