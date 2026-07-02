import 'package:flutter/material.dart';
import '../../layouts/responsive_scaffold.dart';
import '../../widgets/empty_state_widget.dart';

class TaskBoardPage extends StatelessWidget {
  const TaskBoardPage({super.key});

  @override
  Widget build(BuildContext context) {
    return const ResponsiveScaffold(
      title: '任务看板',
      body: EmptyStateWidget(
        icon: Icons.task_alt_outlined,
        title: '暂无任务',
        subtitle: '点击右下角按钮创建第一个任务',
      ),
    );
  }
}
