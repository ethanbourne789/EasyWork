import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:drift/drift.dart' hide Column;
import '../../../../core/database/app_database.dart';
import '../../../../core/providers/database_providers.dart';

class ReadUnreadToggleWidget extends ConsumerStatefulWidget {
  final int emailId;
  final bool isRead;
  final ValueChanged<bool>? onChanged;

  const ReadUnreadToggleWidget({
    super.key,
    required this.emailId,
    required this.isRead,
    this.onChanged,
  });

  @override
  ConsumerState<ReadUnreadToggleWidget> createState() => _ReadUnreadToggleWidgetState();
}

class _ReadUnreadToggleWidgetState extends ConsumerState<ReadUnreadToggleWidget> {
  late bool _isRead;

  @override
  void initState() {
    super.initState();
    _isRead = widget.isRead;
  }

  @override
  void didUpdateWidget(ReadUnreadToggleWidget oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.isRead != widget.isRead) {
      _isRead = widget.isRead;
    }
  }

  Future<void> _toggle() async {
    final db = await ref.read(appDatabaseProvider.future);
    final newRead = !_isRead;
    setState(() => _isRead = newRead);

    await (db.update(db.emails)..where((t) => t.id.equals(widget.emailId))).write(
      EmailsCompanion(isRead: Value(newRead)),
    );

    widget.onChanged?.call(newRead);
  }

  @override
  Widget build(BuildContext context) {
    return IconButton(
      icon: Icon(
        _isRead ? Icons.mark_email_read : Icons.mark_email_unread,
        color: _isRead ? Colors.grey : Colors.blue,
      ),
      tooltip: _isRead ? '标为未读' : '标为已读',
      onPressed: _toggle,
      padding: const EdgeInsets.all(4),
      constraints: const BoxConstraints(minWidth: 32, minHeight: 32),
    );
  }
}
