import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'l10n/app_localizations.dart';
import 'router/app_router.dart';
import 'presentation/theme/app_theme.dart';
import 'presentation/theme/theme_mode_notifier.dart';
import 'presentation/theme/locale_notifier.dart';
import 'core/providers/database_providers.dart';
import 'core/security/credential_store.dart';
import 'core/platform/system_tray_service.dart';
import 'core/platform/windows_single_instance.dart';
import 'core/platform/window_manager_service.dart';
import 'core/platform/background_sync_manager.dart';
import 'features/email/providers/email_providers.dart';
import 'features/email/data/email_sync_service.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  if (Platform.isWindows) {
    final isDuplicate = await WindowsSingleInstance.ensureOnlyInstance();
    if (isDuplicate) {
      exit(0);
    }
  }

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
  WindowManagerService? _windowManagerService;
  SystemTrayService? _systemTrayService;
  BackgroundSyncManager? _backgroundSyncManager;

  @override
  void initState() {
    super.initState();
    _initPlatformServices();
    _initializeEmailAccounts();
  }

  Future<void> _initPlatformServices() async {
    if (!Platform.isWindows) return;

    try {
      _windowManagerService = WindowManagerService(ref);
      await _windowManagerService!.init();
      debugPrint('Window manager initialized successfully');
    } catch (e) {
      debugPrint('Failed to initialize window manager: $e');
    }

    try {
      _systemTrayService = SystemTrayService(ref);
      await _systemTrayService!.init();
      debugPrint('System tray initialized successfully');
    } catch (e) {
      debugPrint('Failed to initialize system tray: $e');
    }

    try {
      _backgroundSyncManager = BackgroundSyncManager(ref);
      _backgroundSyncManager!.init();
      debugPrint('Background sync manager initialized successfully');
    } catch (e) {
      debugPrint('Failed to initialize background sync manager: $e');
    }
  }

  Future<void> _initializeEmailAccounts() async {
    try {
      final db = await ref.read(appDatabaseProvider.future);
      final accounts = await db.select(db.emailAccounts).get();
      final credentialStore = CredentialStore();
      final dataSources = ref.read(mailDataSourcesProvider.notifier);

      // Ensure DAOs are resolved before emailRepositoryProvider uses .requireValue
      await ref.read(mailboxFoldersDaoProvider.future);
      await ref.read(emailsDaoProvider.future);
      await ref.read(emailAccountsDaoProvider.future);

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
          final repo = ref.read(emailRepositoryProvider);
          await repo.syncMailboxes(account.id);
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
    final localeAsync = ref.watch(localeProvider);
    final appLocale = localeAsync.valueOrNull;

    return MaterialApp.router(
      title: 'EasyWork',
      theme: AppTheme.light(),
      darkTheme: AppTheme.dark(),
      themeMode: themeMode,
      routerConfig: router,
      debugShowCheckedModeBanner: false,
      localizationsDelegates: EasyWorkLocalizations.localizationsDelegates,
      supportedLocales: EasyWorkLocalizations.supportedLocales,
      locale: appLocale,
    );
  }
}
