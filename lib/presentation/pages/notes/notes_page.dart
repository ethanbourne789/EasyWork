import 'package:flutter/material.dart';
import '../../layouts/responsive_scaffold.dart';
import '../../widgets/empty_state_widget.dart';

class NotesPage extends StatelessWidget {
  const NotesPage({super.key});

  @override
  Widget build(BuildContext context) {
    return const ResponsiveScaffold(
      title: '笔记',
      body: EmptyStateWidget(
        icon: Icons.note_alt_outlined,
        title: '暂无笔记',
        subtitle: '点击右下角按钮创建第一个笔记',
      ),
    );
  }
}
