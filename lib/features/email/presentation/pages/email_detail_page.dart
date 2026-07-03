import 'package:flutter/material.dart';
import 'package:enough_mail/enough_mail.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../l10n/app_localizations.dart';
import 'package:drift/drift.dart' hide Column;
import 'package:flutter_widget_from_html_core/flutter_widget_from_html_core.dart';
import '../pages/compose_page.dart';
import '../widgets/attachment_list_widget.dart';
import '../widgets/email_to_task_dialog.dart';
import '../../providers/email_providers.dart';
import '../../../../core/database/app_database.dart';
import '../../../../core/providers/database_providers.dart';

class EmailDetailPage extends ConsumerStatefulWidget {
  final MimeMessage? message;
  final int? localEmailId;
  final int? accountId;

  const EmailDetailPage({
    super.key,
    this.message,
    this.localEmailId,
    this.accountId,
  });

  @override
  ConsumerState<EmailDetailPage> createState() => _EmailDetailPageState();
}

class _EmailDetailPageState extends ConsumerState<EmailDetailPage> {
  bool _isStarred = false;
  bool _isRead = true;
  Email? _localEmail;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _loadLocalState();
    _markAsRead();
  }

  Future<void> _loadLocalState() async {
    if (widget.localEmailId == null) {
      if (mounted) setState(() => _loading = false);
      return;
    }
    final db = await ref.read(appDatabaseProvider.future);
    final email = await (db.select(db.emails)
          ..where((t) => t.id.equals(widget.localEmailId!)))
        .getSingleOrNull();
    if (email != null && mounted) {
      setState(() {
        _localEmail = email;
        _isStarred = email.isStarred;
        _isRead = email.isRead;
        _loading = false;
      });
    } else if (mounted) {
      setState(() => _loading = false);
    }
  }

  Future<void> _markAsRead() async {
    if (widget.localEmailId == null) return;
    final db = await ref.read(appDatabaseProvider.future);
    await (db.update(db.emails)..where((t) => t.id.equals(widget.localEmailId!))).write(
      const EmailsCompanion(isRead: Value(true)),
    );
  }

  @override
  Widget build(BuildContext context) {
    final loc = EasyWorkLocalizations.of(context)!;
    final msg = widget.message;
    final local = _localEmail;

    final subject = local?.subject ?? msg?.decodeSubject() ?? '(无主题)';
    final from = local != null
        ? (local.fromName?.isNotEmpty == true
            ? '${local.fromName} <${local.fromAddress}>'
            : local.fromAddress)
        : (msg?.from?.isNotEmpty == true ? msg!.from!.first.toString() : '');
    final to = local?.toList ?? msg?.to?.map((a) => a.toString()).join(', ') ?? '';
    final cc = local?.ccList ?? msg?.cc?.map((a) => a.toString()).join(', ') ?? '';
    final date = local?.receivedAt ?? msg?.decodeDate();

    final htmlBody = local?.bodyHtml ?? msg?.decodeTextHtmlPart();
    final plainBody = local?.bodyText ?? msg?.decodeTextPlainPart();

    return Scaffold(
      appBar: AppBar(
        title: Text(subject, maxLines: 1, overflow: TextOverflow.ellipsis),
        actions: [
              if (widget.localEmailId != null)
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
            onPressed: () => _reply(context),
            tooltip: '回复',
          ),
          IconButton(
            icon: const Icon(Icons.reply_all),
            onPressed: () => _replyAll(context),
            tooltip: '全部回复',
          ),
          IconButton(
            icon: const Icon(Icons.forward),
            onPressed: () => _forward(context),
            tooltip: '转发',
          ),
          PopupMenuButton<String>(
            onSelected: (value) => _handleMenuAction(context, value),
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
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : ListView(
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
                  _HtmlEmailBody(html: htmlBody)
                else if (plainBody != null && plainBody.isNotEmpty)
                  SelectableText(plainBody, style: const TextStyle(fontSize: 15, height: 1.5))
                else
                  const Text('(无内容)', style: TextStyle(color: Colors.grey)),
                const SizedBox(height: 16),
                if (msg != null)
                  AttachmentListWidget(message: msg),
              ],
            ),
    );
  }

  Future<void> _toggleStar() async {
    final newStarred = !_isStarred;
    setState(() => _isStarred = newStarred);

    if (widget.localEmailId != null) {
      final db = await ref.read(appDatabaseProvider.future);
      await (db.update(db.emails)..where((t) => t.id.equals(widget.localEmailId!))).write(
        EmailsCompanion(isStarred: Value(newStarred)),
      );
    }

    if (widget.accountId != null && widget.message != null) {
      final ds = ref.read(mailDataSourcesProvider)[widget.accountId!];
      if (ds != null) {
        try {
          if (newStarred) {
            await ds.markAsFlagged(widget.message!);
          } else {
            await ds.markAsUnflagged(widget.message!);
          }
        } catch (_) {}
      }
    }
  }

  Future<void> _toggleRead() async {
    final newRead = !_isRead;
    setState(() => _isRead = newRead);

    if (widget.localEmailId != null) {
      final db = await ref.read(appDatabaseProvider.future);
      await (db.update(db.emails)..where((t) => t.id.equals(widget.localEmailId!))).write(
        EmailsCompanion(isRead: Value(newRead)),
      );
    }

    if (widget.accountId != null && widget.message != null) {
      final ds = ref.read(mailDataSourcesProvider)[widget.accountId!];
      if (ds != null) {
        try {
          if (newRead) {
            await ds.markAsRead(widget.message!);
          } else {
            await ds.markAsUnread(widget.message!);
          }
        } catch (_) {}
      }
    }
  }

  void _reply(BuildContext context) {
    final msg = widget.message;
    if (msg == null) return;
    Navigator.push<void>(
      context,
      MaterialPageRoute<void>(
        builder: (_) => ComposePage(
          replyToMessage: msg,
          to: msg.from?.first.email,
        ),
      ),
    );
  }

  void _replyAll(BuildContext context) {
    final msg = widget.message;
    if (msg == null) return;
    final allRecipients = <String>{};
    if (msg.from != null) {
      allRecipients.addAll(msg.from!.map((a) => a.email));
    }
    if (msg.to != null) {
      allRecipients.addAll(msg.to!.map((a) => a.email));
    }

    Navigator.push<void>(
      context,
      MaterialPageRoute<void>(
        builder: (_) => ComposePage(
          replyToMessage: msg,
          to: allRecipients.join(', '),
        ),
      ),
    );
  }

  void _forward(BuildContext context) {
    final msg = widget.message;
    if (msg == null) return;
    Navigator.push<void>(
      context,
      MaterialPageRoute<void>(
        builder: (_) => ComposePage(forwardMessage: msg),
      ),
    );
  }

  void _handleMenuAction(BuildContext context, String action) {
    switch (action) {
      case 'unread':
        _toggleRead();
        break;
      case 'task':
        if (widget.message != null) {
          EmailToTaskDialog.show(context, widget.message!);
        }
        break;
      case 'delete':
        _confirmDelete(context);
        break;
    }
  }

  void _confirmDelete(BuildContext context) {
    final loc = EasyWorkLocalizations.of(context)!;
    showDialog<void>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(loc.common_delete),
        content: const Text('确定要删除这封邮件吗？'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: Text(loc.common_cancel),
          ),
          TextButton(
            onPressed: () async {
              if (widget.localEmailId != null) {
                final db = await ref.read(appDatabaseProvider.future);
                await (db.delete(db.emails)..where((t) => t.id.equals(widget.localEmailId!))).go();
              }

              if (widget.accountId != null && widget.message != null) {
                final ds = ref.read(mailDataSourcesProvider)[widget.accountId!];
                if (ds != null) {
                  try {
                    await ds.moveToTrash(widget.message!);
                  } catch (_) {}
                }
              }

                if (context.mounted) {
                Navigator.pop(context);
                Navigator.pop(context);
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(content: Text(loc.common_success)),
                );
              }
            },
            child: const Text('删除', style: TextStyle(color: Colors.red)),
          ),
        ],
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

class _HtmlEmailBody extends StatelessWidget {
  final String html;
  const _HtmlEmailBody({required this.html});

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: double.infinity,
      child: Container(
        constraints: const BoxConstraints(minHeight: 200),
        child: HtmlWidget(
          html,
          textStyle: const TextStyle(fontSize: 15, height: 1.5),
        ),
      ),
    );
  }
}
