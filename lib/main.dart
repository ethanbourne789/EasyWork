import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'router/app_router.dart';
import 'presentation/theme/app_theme.dart';
import 'presentation/theme/theme_mode_notifier.dart';
import 'core/providers/database_providers.dart';
import 'core/security/credential_store.dart';
import 'features/email/providers/email_providers.dart';
import 'features/email/data/email_sync_service.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  runApp(
    const ProviderScope(
      child: EasyWorkApp(),
    ),
  );
}

class EasyWorkApp extends ConsumerStatefulWidget {
  const EasyWorkApp({super.key});

  @override
  ConsumerState<EasyWorkApp> createState() => _EasyWorkAppState();
}

class _EasyWorkAppState extends ConsumerState<EasyWorkApp> {
  final Completer<void> _initCompleter = Completer<void>();
  bool _initFailed = false;

  @override
  void initState() {
    super.initState();
    _initializeEmailAccounts();
  }

  Future<void> _initializeEmailAccounts() async {
    try {
      final db = await ref.read(appDatabaseProvider.future);
      final accounts = await db.select(db.emailAccounts).get();
      final credentialStore = CredentialStore();
      final dataSources = ref.read(mailDataSourcesProvider.notifier);

      for (final account in accounts) {
        String? password;
        try {
          password = await credentialStore.getPassword(account.id);
        } catch (e) {
          debugPrint('CredentialStore read failed for ${account.email}: $e');
        }
        if (password == null) {
          password = account.password;
        }
        if (password == null || password.isEmpty) continue;

        try {
          await dataSources.addAccount(
            accountId: account.id,
            displayName: account.displayName ?? '',
            email: account.email,
            password: password,
            imapHost: account.imapHost,
            imapPort: account.imapPort,
            imapUseSsl: account.imapUseSsl,
            smtpHost: account.smtpHost,
            smtpPort: account.smtpPort,
            smtpUseSsl: account.smtpUseSsl,
          );
          debugPrint('Account ${account.email} connected successfully');
        } catch (e) {
          debugPrint('Failed to connect account ${account.email}: $e');
        }
      }

      // Start sync in background for all accounts
      for (final account in accounts) {
        try {
          final syncService = ref.read(emailSyncServiceProvider);
          if (syncService != null) {
            syncService.firstSync(account.id).catchError((e) {
              debugPrint('Sync failed for ${account.email}: $e');
            });
          }
        } catch (e) {
          debugPrint('Sync init failed for ${account.email}: $e');
        }
      }
    } catch (e) {
      debugPrint('Failed to initialize email accounts: $e');
      _initFailed = true;
    } finally {
      if (!_initCompleter.isCompleted) {
        _initCompleter.complete();
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final router = ref.watch(routerProvider);
    final themeModeAsync = ref.watch(themeModeProvider);
    final themeMode = themeModeAsync.value ?? ThemeMode.system;

    return MaterialApp.router(
      title: 'EasyWork',
      theme: AppTheme.light(),
      darkTheme: AppTheme.dark(),
      themeMode: themeMode,
      routerConfig: router,
      debugShowCheckedModeBanner: false,
    );
  }
}
