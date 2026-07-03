import 'package:flutter/material.dart';
import 'package:enough_mail/enough_mail.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_widget_from_html_core/flutter_widget_from_html_core.dart';
import '../../data/mime_message_mapper.dart';
import '../../data/email_html_processor.dart';
import '../../providers/email_providers.dart';
import '../../../../core/database/app_database.dart';
import '../../../../core/providers/database_providers.dart';
import '../pages/compose_page.dart';
import 'attachment_list_widget.dart';
import 'email_to_task_dialog.dart';

/// Unified email detail content widget — no Scaffold, no AppBar.
/// Used by both the wide-layout embedded view and the narrow-layout page.
class EmailDetailView extends ConsumerWidget {
  final int accountId;

  const EmailDetailView({super.key, required this.accountId});

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
  final int accountId;
  final int emailId;

  const _EmailDetailBody({required this.accountId, required this.emailId});

  @override
  ConsumerState<_EmailDetailBody> createState() => _EmailDetailBodyState();
}

class _EmailDetailBodyState extends ConsumerState<_EmailDetailBody> {
  Email? _email;
  MimeMessage? _mimeMessage;
  bool _loading = true;
  bool _isStarred = false;
  bool _isRead = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void didUpdateWidget(covariant _EmailDetailBody oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.emailId != widget.emailId) {
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
      final mimeMessage = MimeMessageMapper.fromOriginalMessageJson(email.originalMessageJson);
      setState(() {
        _email = email;
        _mimeMessage = mimeMessage;
        _isStarred = email.isStarred;
        _isRead = email.isRead;
        _loading = false;
      });
      if (!email.isRead) {
        await emailsDao.markAsRead(email.id);
        final effectiveAccountId = widget.accountId == -1 ? email.accountId : widget.accountId;
        final ds = ref.read(mailDataSourcesProvider)[effectiveAccountId];
        if (ds != null && mimeMessage != null) {
          try {
            await ds.markAsRead(mimeMessage);
          } catch (_) {}
        }
      }
    } else if (mounted) {
      setState(() => _loading = false);
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
    final htmlBody = email.bodyHtml ?? msg?.decodeTextHtmlPart();
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
              if (htmlBody != null && htmlBody.isNotEmpty)
                SizedBox(
                  width: double.infinity,
                  child: Container(
                    constraints: const BoxConstraints(minHeight: 200),
                    child: HtmlWidget(
                      msg != null
                          ? EmailHtmlProcessor.processHtml(_stripTableBorders(htmlBody), msg)
                          : _stripTableBorders(htmlBody),
                      textStyle: const TextStyle(fontSize: 15, height: 1.5),
                      customStylesBuilder: (element) {
                        if (element.localName == 'table') {
                          return {'max-width': '100%', 'overflow': 'hidden'};
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
                AttachmentListWidget(message: msg),
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

    final effectiveAccountId = widget.accountId == -1 ? email.accountId : widget.accountId;
    final ds = ref.read(mailDataSourcesProvider)[effectiveAccountId];
    if (ds != null && _mimeMessage != null) {
      try {
        if (newStarred) {
          await ds.markAsFlagged(_mimeMessage!);
        } else {
          await ds.markAsUnflagged(_mimeMessage!);
        }
      } catch (_) {}
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

    final effectiveAccountId = widget.accountId == -1 ? email.accountId : widget.accountId;
    final ds = ref.read(mailDataSourcesProvider)[effectiveAccountId];
    if (ds != null && _mimeMessage != null) {
      try {
        if (newRead) {
          await ds.markAsRead(_mimeMessage!);
        } else {
          await ds.markAsUnread(_mimeMessage!);
        }
      } catch (_) {}
    }
  }

  void _handleMenuAction(BuildContext context, String action, Email email, MimeMessage? msg) {
    switch (action) {
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
    // Delete from local DB
    final emailsDao = ref.read(emailsDaoProvider).valueOrNull;
    if (emailsDao != null) {
      await emailsDao.deleteEmail(email.id);
    }

    // Move to trash on server and capture result for undo
    MoveResult? moveResult;
    final effectiveAccountId = widget.accountId == -1 ? email.accountId : widget.accountId;
    final ds = ref.read(mailDataSourcesProvider)[effectiveAccountId];
    if (ds != null && msg != null) {
      try {
        moveResult = await ds.moveToTrash(msg);
      } catch (_) {}
    }

    if (mounted) {
      ref.read(selectedEmailIdProvider.notifier).state = null;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: const Text('已移至回收站'),
          action: moveResult != null
              ? SnackBarAction(
                  label: '撤销',
                  onPressed: () async {
                    if (ds != null) {
                      try {
                        await ds.undoMove(moveResult!);
                        // Re-insert into local DB
                        if (emailsDao != null) {
                          final companion = MimeMessageMapper.toCompanion(
                            msg!, effectiveAccountId, folder: email.folder,
                          );
                          await emailsDao.upsertEmail(companion);
                        }
                      } catch (_) {}
                    }
                  },
                )
              : null,
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
          to: mimeMsg.from?.first.email,
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
        builder: (_) => ComposePage(forwardMessage: mimeMsg),
      ),
    );
  }

  static final _borderPropRe = RegExp(r'border(-top|-right|-bottom|-left)?\s*:\s*[^;]+;?', caseSensitive: false);
  static final _attrBorderRe = RegExp(r'''\s+border\s*=\s*["'][^"']*["']''', caseSensitive: false);

  String _stripTableBorders(String html) {
    var result = html.replaceAll(_borderPropRe, '');
    result = result.replaceAll(_attrBorderRe, '');
    return result;
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
