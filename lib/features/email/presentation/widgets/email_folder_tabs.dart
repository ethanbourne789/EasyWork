import 'package:flutter/material.dart';

enum EmailFolder {
  inbox('收件箱', Icons.inbox),
  sent('已发送', Icons.send),
  drafts('草稿', Icons.drafts),
  spam('垃圾邮件', Icons.report),
  trash('已删除', Icons.delete),
  archive('归档', Icons.archive);

  final String label;
  final IconData icon;
  const EmailFolder(this.label, this.icon);
}

class EmailFolderTabs extends StatelessWidget {
  final EmailFolder selectedFolder;
  final ValueChanged<EmailFolder> onFolderChanged;

  const EmailFolderTabs({
    super.key,
    required this.selectedFolder,
    required this.onFolderChanged,
  });

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 48,
      child: ListView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 8),
        children: EmailFolder.values.map((folder) {
          final isSelected = folder == selectedFolder;
          return Padding(
            padding: const EdgeInsets.symmetric(horizontal: 4),
            child: FilterChip(
              label: Text(folder.label),
              avatar: Icon(folder.icon, size: 18),
              selected: isSelected,
              onSelected: (_) => onFolderChanged(folder),
              selectedColor: Theme.of(context).colorScheme.primaryContainer,
            ),
          );
        }).toList(),
      ),
    );
  }
}
