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
    // BUG-40: Pass accountId through as nullable instead of using -1 sentinel.
    return Scaffold(
      appBar: _EmailDetailAppBar(
        localEmailId: localEmailId,
        effectiveAccountId: accountId,
      ),
      body: EmailDetailView(accountId: accountId),
    );
  }
}

/// Stateful AppBar that caches the DB lookup Future so it is not re-issued
/// on every build (e.g. when [selectedEmailIdProvider] changes for other
/// reasons). The Future is only re-created when [displayId] actually changes.
class _EmailDetailAppBar extends ConsumerStatefulWidget
    implements PreferredSizeWidget {
  final int? localEmailId;
  final int? effectiveAccountId;

  const _EmailDetailAppBar({this.localEmailId, this.effectiveAccountId});

  @override
  Size get preferredSize => const Size.fromHeight(kToolbarHeight);

  @override
  ConsumerState<_EmailDetailAppBar> createState() => _EmailDetailAppBarState();
}

class _EmailDetailAppBarState extends ConsumerState<_EmailDetailAppBar> {
  int? _cachedDisplayId;
  Future<Email?>? _cachedFuture;

  Future<Email?>? _getFuture(int displayId) {
    if (_cachedDisplayId == displayId && _cachedFuture != null) {
      return _cachedFuture;
    }
    final emailsDao = ref.read(emailsDaoProvider).valueOrNull;
    if (emailsDao == null) return null;
    _cachedDisplayId = displayId;
    _cachedFuture = emailsDao.getEmailById(displayId);
    return _cachedFuture;
  }

  @override
  Widget build(BuildContext context) {
    final selectedId = ref.watch(selectedEmailIdProvider);
    final displayId = selectedId ?? widget.localEmailId;

    if (displayId != null) {
      final future = _getFuture(displayId);
      if (future != null) {
        return FutureBuilder<Email?>(
          future: future,
          builder: (context, snapshot) {
            final email = snapshot.data;
            final subject = email?.subject ?? '邮件详情';
            return AppBar(title: Text(subject, maxLines: 1, overflow: TextOverflow.ellipsis));
          },
        );
      }
    }

    return AppBar(title: const Text('邮件详情'));
  }
}
