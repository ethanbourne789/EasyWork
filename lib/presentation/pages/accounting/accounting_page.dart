import 'package:flutter/material.dart';
import '../../layouts/responsive_scaffold.dart';
import '../../widgets/empty_state_widget.dart';

class AccountingPage extends StatelessWidget {
  const AccountingPage({super.key});

  @override
  Widget build(BuildContext context) {
    return const ResponsiveScaffold(
      title: '记账',
      body: EmptyStateWidget(
        icon: Icons.account_balance_wallet_outlined,
        title: '暂无记录',
        subtitle: '点击右下角按钮记录第一笔账目',
      ),
    );
  }
}
