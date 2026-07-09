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
import '../presentation/pages/logs/logs_page.dart';
import '../presentation/pages/error_page.dart';
import '../features/email/presentation/pages/compose_page.dart';
import '../features/email/presentation/pages/email_detail_page.dart';

final routerProvider = Provider<GoRouter>((ref) {
  return GoRouter(
    initialLocation: '/notes',
    errorPageBuilder: (context, state) => NoTransitionPage(
      child: ErrorPage(error: state.error?.toString()),
    ),
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
            routes: [
              GoRoute(
                path: 'compose',
                pageBuilder: (context, state) {
                  final extra = state.extra as Map<String, dynamic>?;
                  return NoTransitionPage(
                    child: ComposePage(
                      to: extra?['to'] as String?,
                      subject: extra?['subject'] as String?,
                      body: extra?['body'] as String?,
                    ),
                  );
                },
              ),
              GoRoute(
                path: ':id',
                pageBuilder: (context, state) {
                  final emailId = int.tryParse(state.pathParameters['id'] ?? '');
                  return NoTransitionPage(
                    child: EmailDetailPage(localEmailId: emailId ?? 0),
                  );
                },
              ),
            ],
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
          GoRoute(
            path: '/logs',
            pageBuilder: (context, state) => const NoTransitionPage(
              child: LogsPage(),
            ),
          ),
        ],
      ),
    ],
  );
});
