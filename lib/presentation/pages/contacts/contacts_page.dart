import 'package:flutter/material.dart';
import '../../layouts/responsive_scaffold.dart';
import '../../widgets/empty_state_widget.dart';

class ContactsPage extends StatelessWidget {
  const ContactsPage({super.key});

  @override
  Widget build(BuildContext context) {
    return const ResponsiveScaffold(
      title: '通讯录',
      body: EmptyStateWidget(
        icon: Icons.people_outlined,
        title: '暂无联系人',
        subtitle: '点击右下角按钮添加第一个联系人',
      ),
    );
  }
}
