import 'package:flutter/material.dart';
import 'package:enough_mail/enough_mail.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_widget_from_html_core/flutter_widget_from_html_core.dart';
import '../../data/mime_message_mapper.dart';
import '../../providers/email_providers.dart';
import '../../../../core/providers/database_providers.dart';
import '../../../../core/database/app_database.dart';
import 'attachment_list_widget.dart';

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
    try {
      final db = await ref.read(appDatabaseProvider.future);
      final email = await (db.select(db.emails)
            ..where((t) => t.id.equals(widget.emailId)))
          .getSingleOrNull();
      if (email != null && mounted) {
        final mimeMessage = MimeMessageMapper.fromOriginalMessageJson(email.originalMessageJson);
        setState(() {
          _email = email;
          _mimeMessage = mimeMessage;
          _loading = false;
        });
      } else if (mounted) {
        setState(() => _loading = false);
      }
    } catch (_) {
      if (mounted) setState(() => _loading = false);
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

    return ListView(
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
                _stripTableBorders(htmlBody),
                textStyle: const TextStyle(fontSize: 15, height: 1.5),
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
