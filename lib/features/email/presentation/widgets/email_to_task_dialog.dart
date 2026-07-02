import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:enough_mail/enough_mail.dart';
import '../../../../core/utils/validators.dart';

class EmailToTaskDialog extends ConsumerStatefulWidget {
  final MimeMessage email;

  const EmailToTaskDialog({super.key, required this.email});

  @override
  ConsumerState<EmailToTaskDialog> createState() => _EmailToTaskDialogState();

  static Future<bool> show(BuildContext context, MimeMessage email) async {
    final result = await showDialog<bool>(
      context: context,
      builder: (_) => EmailToTaskDialog(email: email),
    );
    return result ?? false;
  }
}

class _EmailToTaskDialogState extends ConsumerState<EmailToTaskDialog> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _titleController;
  late final TextEditingController _descriptionController;
  String _priority = 'medium';
  DateTime? _dueDate;

  @override
  void initState() {
    super.initState();
    _titleController = TextEditingController(text: widget.email.decodeSubject() ?? '');
    _descriptionController = TextEditingController(
      text: '来自: ${widget.email.from?.first.toString() ?? ''}',
    );
  }

  @override
  void dispose() {
    _titleController.dispose();
    _descriptionController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('转为任务'),
      content: Form(
        key: _formKey,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextFormField(
              controller: _titleController,
              decoration: const InputDecoration(labelText: '任务标题'),
              validator: (v) => Validators.required(v, '标题'),
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _descriptionController,
              decoration: const InputDecoration(labelText: '描述'),
              maxLines: 3,
            ),
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
              value: _priority,
              decoration: const InputDecoration(labelText: '优先级'),
              items: const [
                DropdownMenuItem(value: 'high', child: Text('高')),
                DropdownMenuItem(value: 'medium', child: Text('中')),
                DropdownMenuItem(value: 'low', child: Text('低')),
              ],
              onChanged: (v) => setState(() => _priority = v ?? 'medium'),
            ),
            const SizedBox(height: 12),
            ListTile(
              title: Text(_dueDate != null ? '截止: ${_dueDate.toString().split(' ')[0]}' : '设置截止日期'),
              trailing: const Icon(Icons.calendar_today),
              contentPadding: EdgeInsets.zero,
              onTap: () async {
                final date = await showDatePicker(
                  context: context,
                  initialDate: _dueDate ?? DateTime.now().add(const Duration(days: 1)),
                  firstDate: DateTime.now(),
                  lastDate: DateTime.now().add(const Duration(days: 365)),
                );
                if (date != null) setState(() => _dueDate = date);
              },
            ),
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context, false),
          child: const Text('取消'),
        ),
        TextButton(
          onPressed: () {
            if (_formKey.currentState!.validate()) {
              Navigator.pop(context, true);
              // TODO: Actually create task via EmailToTaskService
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text('任务已创建')),
              );
            }
          },
          child: const Text('创建'),
        ),
      ],
    );
  }
}
