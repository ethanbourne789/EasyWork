import 'dart:developer' as dev;
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:enough_mail/enough_mail.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_widget_from_html_core/flutter_widget_from_html_core.dart';
import '../../data/mime_message_mapper.dart';
import '../../data/email_html_processor.dart';
import '../../data/mailbox_merger.dart';
import '../../providers/email_providers.dart';
import '../../../../core/database/app_database.dart';
import '../../../../core/providers/database_providers.dart';
import '../pages/compose_page.dart';
import 'attachment_list_widget.dart';
import 'email_to_task_dialog.dart';

/// Unified email detail content widget — no Scaffold, no AppBar.
/// Used by both the wide-layout embedded view and the narrow-layout page.
class EmailDetailView extends ConsumerWidget {
  // BUG-40: Changed from `int accountId` (required, with -1 sentinel) to
  // `int? accountId` (optional, null means "derive from the selected email").
  final int? accountId;

  const EmailDetailView({super.key, this.accountId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final selectedId = ref.watch(selectedEmailIdProvider);

    if (selectedId == null) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.mail_outline, size: 64, color: Colors.grey[400]),
            const SizedBox(height: 16),
            Text('请选择一封邮件', style: TextStyle(color: Colors.grey[600])),
          ],
        ),
      );
    }

    return _EmailDetailBody(accountId: accountId, emailId: selectedId);
  }
}

class _EmailDetailBody extends ConsumerStatefulWidget {
  final int? accountId;
  final int emailId;

  const _EmailDetailBody({required this.accountId, required this.emailId});

  @override
  ConsumerState<_EmailDetailBody> createState() => _EmailDetailBodyState();
}

class _EmailDetailBodyState extends ConsumerState<_EmailDetailBody> {
  Email? _email;
  MimeMessage? _mimeMessage;
  String? _processedHtml;
  bool _loading = true;
  bool _isStarred = false;
  bool _isRead = true;

  // Cache parsed MimeMessage objects to avoid re-parsing on every switch.
  // BUG-20: Use a size-limited LRU cache to prevent unbounded memory growth.
  static const int _maxCacheSize = 20;
  static final Map<int, MimeMessage> _mimeCache = {};
  static final Map<int, String> _processedHtmlCache = {};

  /// Evict oldest entries when cache exceeds [_maxCacheSize].
  static void _evictIfNeeded() {
    while (_mimeCache.length > _maxCacheSize) {
      _mimeCache.remove(_mimeCache.keys.first);
    }
    while (_processedHtmlCache.length > _maxCacheSize) {
      _processedHtmlCache.remove(_processedHtmlCache.keys.first);
    }
  }
  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void didUpdateWidget(covariant _EmailDetailBody oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.emailId != widget.emailId) {
      final cachedMime = _mimeCache[widget.emailId];
      final cachedHtml = _processedHtmlCache[widget.emailId];
      if (cachedMime != null && cachedHtml != null) {
        setState(() {
          _loading = false;
          _mimeMessage = cachedMime;
          _processedHtml = cachedHtml;
        });
        _loadEmail();
        return;
      }
      _loading = true;
      _load();
    }
  }

  Future<void> _load() async {
    final emailsDao = ref.read(emailsDaoProvider).valueOrNull;
    if (emailsDao == null) {
      if (mounted) setState(() => _loading = false);
      return;
    }
    final email = await emailsDao.getEmailById(widget.emailId);
    if (email != null && mounted) {
      MimeMessage? mimeMessage;
      if (_mimeCache.containsKey(email.id)) {
        mimeMessage = _mimeCache[email.id];
      } else {
        mimeMessage = MimeMessageMapper.fromOriginalMessageJson(email.originalMessageJson);
        if (mimeMessage != null) {
          _mimeCache[email.id] = mimeMessage;
          _evictIfNeeded();
        }
      }

      // Process HTML body in a background isolate to avoid jank.
      String? processedHtml;
      if (_processedHtmlCache.containsKey(email.id)) {
        processedHtml = _processedHtmlCache[email.id];
      } else if (email.originalMessageJson != null &&
          email.originalMessageJson!.isNotEmpty) {
        // Move CPU-intensive MIME parse + HTML transform to a background
        // isolate via compute(). This avoids blocking the UI thread for
        // 100-300ms on large HTML emails.
        final rawMime = email.originalMessageJson!;
        final result = await compute(
          _processHtmlInBackground,
          _HtmlProcessInput(rawMime: rawMime, maxImageWidth: 800),
        );
        if (result.isEmpty) {
          processedHtml = null;
        } else {
          processedHtml = result;
          _processedHtmlCache[email.id] = result;
          _evictIfNeeded();
        }
      } else if (email.bodyHtml != null && email.bodyHtml!.isNotEmpty) {
        final result = await compute(
          _processHtmlInBackground,
          _HtmlProcessInput(rawHtml: email.bodyHtml),
        );
        if (result.isEmpty) {
          processedHtml = null;
        } else {
          processedHtml = result;
          _processedHtmlCache[email.id] = result;
          _evictIfNeeded();
        }
      }

      setState(() {
        _email = email;
        _mimeMessage = mimeMessage;
        _processedHtml = processedHtml;
        _isStarred = email.isStarred;
        _isRead = email.isRead;
        _loading = false;
      });
      if (!email.isRead) {
        await emailsDao.markAsRead(email.id);
        final effectiveAccountId = widget.accountId ?? email.accountId;
        final ds = ref.read(mailDataSourcesProvider)[effectiveAccountId];
        // Use the stored UID (reconstructed MimeMessage has no uid) so the
        // server flag is actually applied (BUG-06).
        if (ds != null && email.uid != null) {
          try {
            await ds.markSeenByUid(email.uid!);
          } catch (e) {
            dev.log('标记已读(服务端)失败: $e', name: 'EmailDetailView');
          }
        }
      }
    } else if (mounted) {
      setState(() => _loading = false);
    }
  }

  /// Load only email metadata (for cache-hit path).
  Future<void> _loadEmail() async {
    final emailsDao = ref.read(emailsDaoProvider).valueOrNull;
    if (emailsDao == null) return;
    final email = await emailsDao.getEmailById(widget.emailId);
    if (email != null && mounted) {
      setState(() {
        _email = email;
        _isStarred = email.isStarred;
        _isRead = email.isRead;
      });
      if (!email.isRead) {
        await emailsDao.markAsRead(email.id);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }

    final email = _email;
    if (email == null) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.mail_outline, size: 64, color: Colors.grey[400]),
            const SizedBox(height: 16),
            Text('无法加载邮件', style: TextStyle(color: Colors.grey[600])),
          ],
        ),
      );
    }

    final msg = _mimeMessage;
    final subject = email.subject ?? msg?.decodeSubject() ?? '(无主题)';
    final from = email.fromName?.isNotEmpty == true
        ? '${email.fromName} <${email.fromAddress}>'
        : email.fromAddress;
    final to = email.toList ?? '';
    final cc = email.ccList ?? '';
    final date = email.receivedAt;
    final plainBody = email.bodyText ?? msg?.decodeTextPlainPart();

    return Column(
      children: [
        Expanded(
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  CircleAvatar(
                    child: Text(from.isNotEmpty ? from[0].toUpperCase() : '?'),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(from, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                        if (to.isNotEmpty)
                          Text('收件人: $to', style: TextStyle(color: Colors.grey[600], fontSize: 12)),
                        if (cc.isNotEmpty)
                          Text('抄送: $cc', style: TextStyle(color: Colors.grey[600], fontSize: 12)),
                      ],
                    ),
                  ),
                  if (date != null)
                    Text(
                      _formatDate(date),
                      style: TextStyle(color: Colors.grey[600], fontSize: 12),
                    ),
                ],
              ),
              const Divider(height: 24),
              Text(subject, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 18)),
              const SizedBox(height: 16),
              if (_processedHtml != null && _processedHtml!.isNotEmpty)
                SizedBox(
                  width: double.infinity,
                  child: Container(
                    constraints: const BoxConstraints(minHeight: 200),
                    child: HtmlWidget(
                      _processedHtml!,
                      textStyle: const TextStyle(fontSize: 15, height: 1.5),
                      customStylesBuilder: (element) {
                        final tag = element.localName;
                        if (tag == 'td' || tag == 'th') {
                          return {
                            'display': 'table-cell',
                            'vertical-align': 'top',
                          };
                        }
                        if (tag == 'table') {
                          return {'max-width': '100%'};
                        }
                        return null;
                      },
                    ),
                  ),
                )
              else if (plainBody != null && plainBody.isNotEmpty)
                SelectableText(plainBody, style: const TextStyle(fontSize: 15, height: 1.5))
              else
                const Text('(无内容)', style: TextStyle(color: Colors.grey)),
              if (msg != null) ...[
                const SizedBox(height: 16),
                AttachmentListWidget(
                  message: msg,
                  accountId: email.accountId,
                  uid: email.uid,
                ),
              ],
            ],
          ),
        ),
        BottomAppBar(
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceAround,
            children: [
              IconButton(
                icon: Icon(
                  _isStarred ? Icons.star : Icons.star_border,
                  color: _isStarred ? Colors.amber : null,
                ),
                tooltip: _isStarred ? '取消星标' : '标记星标',
                onPressed: _toggleStar,
              ),
              IconButton(
                icon: const Icon(Icons.reply),
                tooltip: '回复',
                onPressed: () => _reply(context, email, msg),
              ),
              IconButton(
                icon: const Icon(Icons.reply_all),
                tooltip: '全部回复',
                onPressed: () => _replyAll(context, email, msg),
              ),
              IconButton(
                icon: const Icon(Icons.forward),
                tooltip: '转发',
                onPressed: () => _forward(context, email, msg),
              ),
              PopupMenuButton<String>(
                onSelected: (value) => _handleMenuAction(context, value, email, msg),
                itemBuilder: (context) => [
                  // BUG-24: Show 'edit draft' option for draft emails.
                  if (MailboxMerger.classifyFolderPath(email.folder) ==
                      UnifiedFolderType.drafts)
                    const PopupMenuItem(
                      value: 'edit_draft',
                      child: Row(
                        children: [
                          Icon(Icons.edit, size: 20),
                          SizedBox(width: 8),
                          Text('编辑草稿'),
                        ],
                      ),
                    ),
                  PopupMenuItem(
                    value: 'unread',
                    child: Row(
                      children: [
                        Icon(_isRead ? Icons.mark_email_unread : Icons.mark_email_read, size: 20),
                        const SizedBox(width: 8),
                        Text(_isRead ? '标为未读' : '标为已读'),
                      ],
                    ),
                  ),
                  const PopupMenuItem(
                    value: 'task',
                    child: Row(
                      children: [
                        Icon(Icons.add_task, size: 20),
                        SizedBox(width: 8),
                        Text('转为任务'),
                      ],
                    ),
                  ),
                  const PopupMenuItem(
                    value: 'delete',
                    child: Row(
                      children: [
                        Icon(Icons.delete, size: 20, color: Colors.red),
                        SizedBox(width: 8),
                        Text('删除', style: TextStyle(color: Colors.red)),
                      ],
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ],
    );
  }

  Future<void> _toggleStar() async {
    final email = _email;
    if (email == null) return;
    final newStarred = !_isStarred;
    setState(() => _isStarred = newStarred);

    final emailsDao = ref.read(emailsDaoProvider).valueOrNull;
    if (emailsDao != null) {
      await emailsDao.toggleStar(email.id);
    }

    final effectiveAccountId = widget.accountId ?? email.accountId;
    final ds = ref.read(mailDataSourcesProvider)[effectiveAccountId];
    if (ds != null && email.uid != null) {
      try {
        if (newStarred) {
          await ds.markFlaggedByUid(email.uid!);
        } else {
          await ds.markUnflaggedByUid(email.uid!);
        }
      } catch (e) {
        dev.log('标记星标(服务端)失败: $e', name: 'EmailDetailView');
      }
    }
  }

  Future<void> _toggleRead() async {
    final email = _email;
    if (email == null) return;
    final newRead = !_isRead;
    setState(() => _isRead = newRead);

    final emailsDao = ref.read(emailsDaoProvider).valueOrNull;
    if (emailsDao != null) {
      if (newRead) {
        await emailsDao.markAsRead(email.id);
      } else {
        await emailsDao.markAsUnread(email.id);
      }
    }

    final effectiveAccountId = widget.accountId ?? email.accountId;
    final ds = ref.read(mailDataSourcesProvider)[effectiveAccountId];
    if (ds != null && email.uid != null) {
      try {
        if (newRead) {
          await ds.markSeenByUid(email.uid!);
        } else {
          await ds.markUnseenByUid(email.uid!);
        }
      } catch (e) {
        dev.log('标记已读(服务端)失败: $e', name: 'EmailDetailView');
      }
    }
  }

  void _handleMenuAction(BuildContext context, String action, Email email, MimeMessage? msg) {
    switch (action) {
      case 'edit_draft':
        // BUG-24: Open the compose page with the draft loaded for editing.
        Navigator.push<void>(
          context,
          MaterialPageRoute<void>(
            builder: (_) => ComposePage(draftEmail: email),
          ),
        );
        break;
      case 'unread':
        _toggleRead();
        break;
      case 'task':
        if (msg != null) {
          EmailToTaskDialog.show(context, msg, emailId: email.id);
        }
        break;
      case 'delete':
        _confirmDelete(context, email, msg);
        break;
    }
  }

  Future<void> _deleteEmail(Email email, MimeMessage? msg) async {
    final effectiveAccountId = widget.accountId ?? email.accountId;
    final ds = ref.read(mailDataSourcesProvider)[effectiveAccountId];
    final emailsDao = ref.read(emailsDaoProvider).valueOrNull;

    // Server-first (BUG-05): move to trash by UID, then remove the local row
    // only after the server move succeeds. Previously the local row was deleted
    // first, so a server failure made the mail "disappear".
    MoveResult? moveResult;
    if (ds != null && email.uid != null) {
      try {
        moveResult = await ds.moveToTrashByUid(email.uid!);
      } catch (e) {
        dev.log('移动到回收站(服务端)失败: $e', name: 'EmailDetailView');
      }
    }

    if (moveResult == null) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('删除失败：无法连接服务器，邮件已保留'),
            backgroundColor: Colors.orange,
          ),
        );
      }
      return;
    }

    if (emailsDao != null) {
      await emailsDao.deleteEmail(email.id);
    }

    if (mounted) {
      ref.read(selectedEmailIdProvider.notifier).state = null;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: const Text('已移至回收站'),
          action: SnackBarAction(
            label: '撤销',
            onPressed: () async {
              // Restore the local copy (reliable), and best-effort move the
              // message back from trash on the server. The UID changes after a
              // move, so the server restore may fail — the local row is the
              // source of truth for undo.
              if (emailsDao != null) {
                final restored = MimeMessageMapper.fromOriginalMessageJson(email.originalMessageJson);
                if (restored != null) {
                  final companion = MimeMessageMapper.toCompanion(
                    restored, effectiveAccountId, folder: email.folder,
                  );
                  await emailsDao.upsertEmail(companion);
                }
              }
              if (ds != null && email.uid != null) {
                try {
                  await ds.moveFromTrashByUid(email.uid!);
                } catch (e) {
                  dev.log('从回收站恢复(服务端)失败: $e', name: 'EmailDetailView');
                }
              }
            },
          ),
        ),
      );
    }
  }

  void _confirmDelete(BuildContext context, Email email, MimeMessage? msg) {
    showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('确认删除'),
        content: const Text('确定要删除这封邮件吗？'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('取消'),
          ),
          TextButton(
            onPressed: () async {
              Navigator.pop(ctx);
              await _deleteEmail(email, msg);
            },
            child: const Text('删除', style: TextStyle(color: Colors.red)),
          ),
        ],
      ),
    );
  }

  void _reply(BuildContext context, Email email, MimeMessage? msg) {
    final mimeMsg = msg ?? MimeMessageMapper.fromOriginalMessageJson(email.originalMessageJson);
    if (mimeMsg == null) return;
    Navigator.push<void>(
      context,
      MaterialPageRoute<void>(
        builder: (_) => ComposePage(
          replyToMessage: mimeMsg,
          isReplyAll: false,
          originalUid: email.uid,
          originalLocalId: email.id,
          to: mimeMsg.from?.isNotEmpty == true ? mimeMsg.from!.first.email : null,
        ),
      ),
    );
  }

  void _replyAll(BuildContext context, Email email, MimeMessage? msg) {
    final mimeMsg = msg ?? MimeMessageMapper.fromOriginalMessageJson(email.originalMessageJson);
    if (mimeMsg == null) return;
    final allRecipients = <String>{};
    if (mimeMsg.from != null) {
      allRecipients.addAll(mimeMsg.from!.map((a) => a.email));
    }
    if (mimeMsg.to != null) {
      allRecipients.addAll(mimeMsg.to!.map((a) => a.email));
    }
    if (mimeMsg.cc != null) {
      allRecipients.addAll(mimeMsg.cc!.map((a) => a.email));
    }
    Navigator.push<void>(
      context,
      MaterialPageRoute<void>(
        builder: (_) => ComposePage(
          replyToMessage: mimeMsg,
          isReplyAll: true,
          originalUid: email.uid,
          originalLocalId: email.id,
          to: allRecipients.join(', '),
        ),
      ),
    );
  }

  void _forward(BuildContext context, Email email, MimeMessage? msg) {
    final mimeMsg = msg ?? MimeMessageMapper.fromOriginalMessageJson(email.originalMessageJson);
    if (mimeMsg == null) return;
    Navigator.push<void>(
      context,
      MaterialPageRoute<void>(
        builder: (_) => ComposePage(
          forwardMessage: mimeMsg,
          originalUid: email.uid,
          originalLocalId: email.id,
        ),
      ),
    );
  }

  String _formatDate(DateTime date) {
    final now = DateTime.now();
    if (date.year == now.year && date.month == now.month && date.day == now.day) {
      return '${date.hour.toString().padLeft(2, '0')}:${date.minute.toString().padLeft(2, '0')}';
    }
    return '${date.month.toString().padLeft(2, '0')}-${date.day.toString().padLeft(2, '0')} '
        '${date.hour.toString().padLeft(2, '0')}:${date.minute.toString().padLeft(2, '0')}';
  }
}

/// Input for [_processHtmlInBackground] — must be a simple class that can
/// be transferred to a background isolate.
class _HtmlProcessInput {
  final String? rawMime;
  final String? rawHtml;
  final int? maxImageWidth;
  const _HtmlProcessInput({this.rawMime, this.rawHtml, this.maxImageWidth});
}

/// Top-level function for [compute] — processes HTML from raw MIME or raw
/// HTML in a background isolate to avoid blocking the UI thread.
String _processHtmlInBackground(_HtmlProcessInput input) {
  if (input.rawMime != null && input.rawMime!.isNotEmpty) {
    return EmailHtmlProcessor.processHtmlFromRawMime(
      input.rawMime!,
      maxImageWidth: input.maxImageWidth,
    );
  } else if (input.rawHtml != null && input.rawHtml!.isNotEmpty) {
    return EmailHtmlProcessor.processRawHtml(input.rawHtml!);
  }
  return '';
}
