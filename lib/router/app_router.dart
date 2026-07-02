import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../presentation/layouts/app_shell.dart';
import '../presentation/pages/notes/notes_page.dart';
import '../presentation/pages/tasks/task_board_page.dart';
import '../presentation/pages/email/email_list_page.dart';
import '../presentation/pages/accounting/accounting_page.dart';
import '../presentation/pages/exercise/exercise_page.dart';
import '../presentation/pages/contacts/contacts_page.dart';
import '../presentation/pages/settings/settings_page.dart';

final routerProvider = Provider<GoRouter>((ref) {
  return GoRouter(
    initialLocation: '/notes',
    routes: [
      ShellRoute(
        builder: (context, state, child) {
          return AppShell(child: child);
        },
        routes: [
          GoRoute(
            path: '/notes',
            pageBuilder: (context, state) => const NoTransitionPage(
              child: NotesPage(),
            ),
          ),
          GoRoute(
            path: '/tasks',
            pageBuilder: (context, state) => const NoTransitionPage(
              child: TaskBoardPage(),
            ),
          ),
          GoRoute(
            path: '/email',
            pageBuilder: (context, state) => const NoTransitionPage(
              child: EmailListPage(),
            ),
          ),
          GoRoute(
            path: '/accounting',
            pageBuilder: (context, state) => const NoTransitionPage(
              child: AccountingPage(),
            ),
          ),
          GoRoute(
            path: '/exercise',
            pageBuilder: (context, state) => const NoTransitionPage(
              child: ExercisePage(),
            ),
          ),
          GoRoute(
            path: '/contacts',
            pageBuilder: (context, state) => const NoTransitionPage(
              child: ContactsPage(),
            ),
          ),
          GoRoute(
            path: '/settings',
            pageBuilder: (context, state) => const NoTransitionPage(
              child: SettingsPage(),
            ),
          ),
        ],
      ),
    ],
  );
});
