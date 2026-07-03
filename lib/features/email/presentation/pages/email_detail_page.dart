import 'package:flutter/material.dart';
import 'package:enough_mail/enough_mail.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../widgets/email_detail_view.dart';
import '../../providers/email_providers.dart';
import '../../../../core/database/app_database.dart';
import '../../../../core/providers/database_providers.dart';

/// Standalone page for viewing an email detail.
/// Wraps the unified [EmailDetailView] with a Scaffold + AppBar.
class EmailDetailPage extends ConsumerWidget {
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
  Widget build(BuildContext context, WidgetRef ref) {
    final effectiveAccountId = accountId ?? -1;

    return Scaffold(
      appBar: _EmailDetailAppBar(
        localEmailId: localEmailId,
        effectiveAccountId: effectiveAccountId,
      ),
      body: EmailDetailView(accountId: effectiveAccountId),
    );
  }
}

class _EmailDetailAppBar extends ConsumerWidget implements PreferredSizeWidget {
  final int? localEmailId;
  final int effectiveAccountId;

  const _EmailDetailAppBar({this.localEmailId, required this.effectiveAccountId});

  @override
  Size get preferredSize => const Size.fromHeight(kToolbarHeight);

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final selectedId = ref.watch(selectedEmailIdProvider);
    final displayId = selectedId ?? localEmailId;

    final title = '邮件详情';
    if (displayId != null) {
      final emailsDao = ref.read(emailsDaoProvider).valueOrNull;
      if (emailsDao != null) {
        return FutureBuilder<Email?>(
          future: emailsDao.getEmailById(displayId),
          builder: (context, snapshot) {
            final email = snapshot.data;
            final subject = email?.subject ?? '邮件详情';
            return AppBar(title: Text(subject, maxLines: 1, overflow: TextOverflow.ellipsis));
          },
        );
      }
    }

    return AppBar(title: Text(title));
  }
}
