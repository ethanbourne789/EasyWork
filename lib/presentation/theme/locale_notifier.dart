import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/providers/database_providers.dart';

final localeProvider =
    AsyncNotifierProvider<LocaleNotifier, Locale?>(LocaleNotifier.new);

class LocaleNotifier extends AsyncNotifier<Locale?> {
  static const _languageKey = 'language';

  @override
  Future<Locale?> build() async {
    final settingsDao = ref.watch(settingsDaoProvider).requireValue;
    final setting = await settingsDao.getSetting(_languageKey);
    if (setting == null) return null;
    return Locale(setting.value);
  }

  Future<void> setLocaleCode(String code) async {
    final settingsDao = ref.watch(settingsDaoProvider).requireValue;
    await settingsDao.setSetting(_languageKey, code);
    state = AsyncData(Locale(code));
  }
}
