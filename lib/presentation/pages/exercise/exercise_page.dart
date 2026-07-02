import 'package:flutter/material.dart';
import '../../layouts/responsive_scaffold.dart';
import '../../widgets/empty_state_widget.dart';

class ExercisePage extends StatelessWidget {
  const ExercisePage({super.key});

  @override
  Widget build(BuildContext context) {
    return const ResponsiveScaffold(
      title: '运动',
      body: EmptyStateWidget(
        icon: Icons.fitness_center_outlined,
        title: '暂无运动记录',
        subtitle: '点击右下角按钮记录第一次运动',
      ),
    );
  }
}
