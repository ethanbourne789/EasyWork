import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:enough_mail/enough_mail.dart';
import 'package:drift/drift.dart' hide Column;
import '../../../../core/database/app_database.dart';
import '../../../../core/providers/database_providers.dart';
import '../../providers/email_providers.dart';

class StarToggleWidget extends ConsumerStatefulWidget {
  final int emailId;
  final int? accountId;
  final MimeMessage? message;
  final bool isStarred;
  final ValueChanged<bool>? onChanged;

  const StarToggleWidget({
    super.key,
    required this.emailId,
    this.accountId,
    this.message,
    required this.isStarred,
    this.onChanged,
  });

  @override
  ConsumerState<StarToggleWidget> createState() => _StarToggleWidgetState();
}

class _StarToggleWidgetState extends ConsumerState<StarToggleWidget> {
  late bool _isStarred;

  @override
  void initState() {
    super.initState();
    _isStarred = widget.isStarred;
  }

  @override
  void didUpdateWidget(StarToggleWidget oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.isStarred != widget.isStarred) {
      _isStarred = widget.isStarred;
    }
  }

  Future<void> _toggle() async {
    final newStarred = !_isStarred;
    setState(() => _isStarred = newStarred);

    final db = await ref.read(appDatabaseProvider.future);
    await (db.update(db.emails)..where((t) => t.id.equals(widget.emailId))).write(
      EmailsCompanion(isStarred: Value(newStarred)),
    );

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

    widget.onChanged?.call(newStarred);
  }

  @override
  Widget build(BuildContext context) {
    return IconButton(
      icon: Icon(
        _isStarred ? Icons.star : Icons.star_border,
        color: _isStarred ? Colors.amber : Colors.grey,
      ),
      tooltip: _isStarred ? '取消星标' : '标记星标',
      onPressed: _toggle,
      padding: const EdgeInsets.all(4),
      constraints: const BoxConstraints(minWidth: 32, minHeight: 32),
    );
  }
}
