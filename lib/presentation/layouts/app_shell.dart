import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

class AppShell extends StatelessWidget {
  final Widget child;

  const AppShell({super.key, required this.child});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Row(
        children: [
          if (MediaQuery.of(context).size.width > 600)
            const _NavigationRail(),
          Expanded(child: child),
        ],
      ),
      drawer: MediaQuery.of(context).size.width <= 600
          ? const _NavigationDrawer()
          : null,
    );
  }
}

class _NavigationRail extends StatelessWidget {
  const _NavigationRail();

  @override
  Widget build(BuildContext context) {
    final location = GoRouterState.of(context).uri.path;
    final selectedIndex = _getSelectedIndex(location);

    return NavigationRail(
      selectedIndex: selectedIndex,
      onDestinationSelected: (index) {
        final routes = ['/notes', '/tasks', '/email', '/accounting', '/exercise', '/contacts'];
        context.go(routes[index]);
      },
      destinations: const [
        NavigationRailDestination(
          icon: Icon(Icons.note_alt_outlined),
          selectedIcon: Icon(Icons.note_alt),
          label: Text('笔记'),
        ),
        NavigationRailDestination(
          icon: Icon(Icons.task_alt_outlined),
          selectedIcon: Icon(Icons.task_alt),
          label: Text('任务'),
        ),
        NavigationRailDestination(
          icon: Icon(Icons.email_outlined),
          selectedIcon: Icon(Icons.email),
          label: Text('邮件'),
        ),
        NavigationRailDestination(
          icon: Icon(Icons.account_balance_wallet_outlined),
          selectedIcon: Icon(Icons.account_balance_wallet),
          label: Text('记账'),
        ),
        NavigationRailDestination(
          icon: Icon(Icons.fitness_center_outlined),
          selectedIcon: Icon(Icons.fitness_center),
          label: Text('运动'),
        ),
        NavigationRailDestination(
          icon: Icon(Icons.people_outlined),
          selectedIcon: Icon(Icons.people),
          label: Text('通讯录'),
        ),
      ],
      trailing: Expanded(
        child: Align(
          alignment: Alignment.bottomCenter,
          child: Padding(
            padding: const EdgeInsets.only(bottom: 16),
            child: IconButton(
              icon: const Icon(Icons.settings_outlined),
              onPressed: () => context.go('/settings'),
            ),
          ),
        ),
      ),
    );
  }

  int _getSelectedIndex(String location) {
    if (location.startsWith('/notes')) return 0;
    if (location.startsWith('/tasks')) return 1;
    if (location.startsWith('/email')) return 2;
    if (location.startsWith('/accounting')) return 3;
    if (location.startsWith('/exercise')) return 4;
    if (location.startsWith('/contacts')) return 5;
    return 0;
  }
}

class _NavigationDrawer extends StatelessWidget {
  const _NavigationDrawer();

  @override
  Widget build(BuildContext context) {
    final location = GoRouterState.of(context).uri.path;

    return Drawer(
      child: SafeArea(
        child: Column(
          children: [
            const DrawerHeader(
              decoration: BoxDecoration(
                color: Color(0xFF1A73E8),
              ),
              child: Align(
                alignment: Alignment.bottomLeft,
                child: Text(
                  'EasyWork',
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 24,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ),
            ),
            _buildDrawerItem(
              context,
              icon: Icons.note_alt_outlined,
              selectedIcon: Icons.note_alt,
              label: '笔记',
              route: '/notes',
              isSelected: location.startsWith('/notes'),
            ),
            _buildDrawerItem(
              context,
              icon: Icons.task_alt_outlined,
              selectedIcon: Icons.task_alt,
              label: '任务',
              route: '/tasks',
              isSelected: location.startsWith('/tasks'),
            ),
            _buildDrawerItem(
              context,
              icon: Icons.email_outlined,
              selectedIcon: Icons.email,
              label: '邮件',
              route: '/email',
              isSelected: location.startsWith('/email'),
            ),
            _buildDrawerItem(
              context,
              icon: Icons.account_balance_wallet_outlined,
              selectedIcon: Icons.account_balance_wallet,
              label: '记账',
              route: '/accounting',
              isSelected: location.startsWith('/accounting'),
            ),
            _buildDrawerItem(
              context,
              icon: Icons.fitness_center_outlined,
              selectedIcon: Icons.fitness_center,
              label: '运动',
              route: '/exercise',
              isSelected: location.startsWith('/exercise'),
            ),
            _buildDrawerItem(
              context,
              icon: Icons.people_outlined,
              selectedIcon: Icons.people,
              label: '通讯录',
              route: '/contacts',
              isSelected: location.startsWith('/contacts'),
            ),
            const Divider(),
            _buildDrawerItem(
              context,
              icon: Icons.settings_outlined,
              selectedIcon: Icons.settings,
              label: '设置',
              route: '/settings',
              isSelected: location.startsWith('/settings'),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildDrawerItem(
    BuildContext context, {
    required IconData icon,
    required IconData selectedIcon,
    required String label,
    required String route,
    required bool isSelected,
  }) {
    return ListTile(
      leading: Icon(isSelected ? selectedIcon : icon),
      title: Text(label),
      selected: isSelected,
      onTap: () {
        Navigator.pop(context);
        context.go(route);
      },
    );
  }
}
