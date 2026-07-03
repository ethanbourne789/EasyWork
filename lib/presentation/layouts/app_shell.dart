import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../l10n/app_localizations.dart';

class NavigationItem {
  final IconData icon;
  final IconData selectedIcon;
  final String label;
  final String route;

  const NavigationItem({
    required this.icon,
    required this.selectedIcon,
    required this.label,
    required this.route,
  });
}

List<NavigationItem> getNavigationItems(BuildContext context) {
  final l10n = EasyWorkLocalizations.of(context)!;
  return [
    NavigationItem(
      icon: Icons.note_alt_outlined,
      selectedIcon: Icons.note_alt,
      label: l10n.navNotes,
      route: '/notes',
    ),
    NavigationItem(
      icon: Icons.task_alt_outlined,
      selectedIcon: Icons.task_alt,
      label: l10n.navTaskBoard,
      route: '/tasks',
    ),
    NavigationItem(
      icon: Icons.email_outlined,
      selectedIcon: Icons.email,
      label: l10n.navEmail,
      route: '/email',
    ),
    NavigationItem(
      icon: Icons.account_balance_wallet_outlined,
      selectedIcon: Icons.account_balance_wallet,
      label: l10n.navAccounting,
      route: '/accounting',
    ),
    NavigationItem(
      icon: Icons.fitness_center_outlined,
      selectedIcon: Icons.fitness_center,
      label: l10n.navExercise,
      route: '/exercise',
    ),
    NavigationItem(
      icon: Icons.people_outlined,
      selectedIcon: Icons.people,
      label: l10n.navContacts,
      route: '/contacts',
    ),
  ];
}

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
    final navigationItems = getNavigationItems(context);
    final selectedIndex = _getSelectedIndex(location, navigationItems);

    return SafeArea(
      child: NavigationRail(
        selectedIndex: selectedIndex,
        onDestinationSelected: (index) {
          context.go(navigationItems[index].route);
        },
        destinations: navigationItems.map((item) => NavigationRailDestination(
          icon: Icon(item.icon),
          selectedIcon: Icon(item.selectedIcon),
          label: Text(item.label),
        )).toList(),
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
      ),
    );
  }

  int _getSelectedIndex(String location, List<NavigationItem> navigationItems) {
    for (int i = 0; i < navigationItems.length; i++) {
      if (location.startsWith(navigationItems[i].route)) return i;
    }
    return 0;
  }
}

class _NavigationDrawer extends StatelessWidget {
  const _NavigationDrawer();

  @override
  Widget build(BuildContext context) {
    final location = GoRouterState.of(context).uri.path;
    final navigationItems = getNavigationItems(context);

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
            for (final item in navigationItems)
              _buildDrawerItem(
                context,
                icon: item.icon,
                selectedIcon: item.selectedIcon,
                label: item.label,
                route: item.route,
                isSelected: location.startsWith(item.route),
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
