import 'package:flutter/material.dart';
import '../../layouts/responsive_scaffold.dart';

class SettingsPage extends StatelessWidget {
  const SettingsPage({super.key});

  @override
  Widget build(BuildContext context) {
    return const ResponsiveScaffold(
      title: '设置',
      body: Center(
        child: Text('设置页面'),
      ),
    );
  }
}
