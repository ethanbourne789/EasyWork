import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/providers/database_providers.dart';

const _themeModeKey = 'theme_mode';

final themeModeProvider =
    AsyncNotifierProvider<ThemeModeNotifier, ThemeMode>(ThemeModeNotifier.new);

class ThemeModeNotifier extends AsyncNotifier<ThemeMode> {
  @override
  Future<ThemeMode> build() async {
    final settingsDao = ref.watch(settingsDaoProvider).requireValue;
    final setting = await settingsDao.getSetting(_themeModeKey);
    if (setting == null) return ThemeMode.system;
    return ThemeMode.values.firstWhere(
      (m) => m.name == setting.value,
      orElse: () => ThemeMode.system,
    );
  }

  Future<void> setThemeMode(ThemeMode mode) async {
    final settingsDao = ref.watch(settingsDaoProvider).requireValue;
    await settingsDao.setSetting(_themeModeKey, mode.name);
    state = AsyncData(mode);
  }

  Future<void> toggleTheme() async {
    final current = state.value ?? ThemeMode.system;
    final next = current == ThemeMode.light ? ThemeMode.dark : ThemeMode.light;
    await setThemeMode(next);
  }
}
