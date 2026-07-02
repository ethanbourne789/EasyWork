import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:intl/intl.dart' as intl;

import 'app_localizations_en.dart';
import 'app_localizations_zh.dart';

// ignore_for_file: type=lint

/// Callers can lookup localized strings with an instance of EasyWorkLocalizations
/// returned by `EasyWorkLocalizations.of(context)`.
///
/// Applications need to include `EasyWorkLocalizations.delegate()` in their app's
/// `localizationDelegates` list, and the locales they support in the app's
/// `supportedLocales` list. For example:
///
/// ```dart
/// import 'l10n/app_localizations.dart';
///
/// return MaterialApp(
///   localizationsDelegates: EasyWorkLocalizations.localizationsDelegates,
///   supportedLocales: EasyWorkLocalizations.supportedLocales,
///   home: MyApplicationHome(),
/// );
/// ```
///
/// ## Update pubspec.yaml
///
/// Please make sure to update your pubspec.yaml to include the following
/// packages:
///
/// ```yaml
/// dependencies:
///   # Internationalization support.
///   flutter_localizations:
///     sdk: flutter
///   intl: any # Use the pinned version from flutter_localizations
///
///   # Rest of dependencies
/// ```
///
/// ## iOS Applications
///
/// iOS applications define key application metadata, including supported
/// locales, in an Info.plist file that is built into the application bundle.
/// To configure the locales supported by your app, you’ll need to edit this
/// file.
///
/// First, open your project’s ios/Runner.xcworkspace Xcode workspace file.
/// Then, in the Project Navigator, open the Info.plist file under the Runner
/// project’s Runner folder.
///
/// Next, select the Information Property List item, select Add Item from the
/// Editor menu, then select Localizations from the pop-up menu.
///
/// Select and expand the newly-created Localizations item then, for each
/// locale your application supports, add a new item and select the locale
/// you wish to add from the pop-up menu in the Value field. This list should
/// be consistent with the languages listed in the EasyWorkLocalizations.supportedLocales
/// property.
abstract class EasyWorkLocalizations {
  EasyWorkLocalizations(String locale)
      : localeName = intl.Intl.canonicalizedLocale(locale.toString());

  final String localeName;

  static EasyWorkLocalizations? of(BuildContext context) {
    return Localizations.of<EasyWorkLocalizations>(
        context, EasyWorkLocalizations);
  }

  static const LocalizationsDelegate<EasyWorkLocalizations> delegate =
      _EasyWorkLocalizationsDelegate();

  /// A list of this localizations delegate along with the default localizations
  /// delegates.
  ///
  /// Returns a list of localizations delegates containing this delegate along with
  /// GlobalMaterialLocalizations.delegate, GlobalCupertinoLocalizations.delegate,
  /// and GlobalWidgetsLocalizations.delegate.
  ///
  /// Additional delegates can be added by appending to this list in
  /// MaterialApp. This list does not have to be used at all if a custom list
  /// of delegates is preferred or required.
  static const List<LocalizationsDelegate<dynamic>> localizationsDelegates =
      <LocalizationsDelegate<dynamic>>[
    delegate,
    GlobalMaterialLocalizations.delegate,
    GlobalCupertinoLocalizations.delegate,
    GlobalWidgetsLocalizations.delegate,
  ];

  /// A list of this localizations delegate's supported locales.
  static const List<Locale> supportedLocales = <Locale>[
    Locale('en'),
    Locale('zh')
  ];

  /// No description provided for @common_save.
  ///
  /// In zh, this message translates to:
  /// **'保存'**
  String get common_save;

  /// No description provided for @common_cancel.
  ///
  /// In zh, this message translates to:
  /// **'取消'**
  String get common_cancel;

  /// No description provided for @common_confirm.
  ///
  /// In zh, this message translates to:
  /// **'确认'**
  String get common_confirm;

  /// No description provided for @common_delete.
  ///
  /// In zh, this message translates to:
  /// **'删除'**
  String get common_delete;

  /// No description provided for @common_edit.
  ///
  /// In zh, this message translates to:
  /// **'编辑'**
  String get common_edit;

  /// No description provided for @common_add.
  ///
  /// In zh, this message translates to:
  /// **'添加'**
  String get common_add;

  /// No description provided for @common_search.
  ///
  /// In zh, this message translates to:
  /// **'搜索'**
  String get common_search;

  /// No description provided for @common_loading.
  ///
  /// In zh, this message translates to:
  /// **'加载中...'**
  String get common_loading;

  /// No description provided for @common_retry.
  ///
  /// In zh, this message translates to:
  /// **'重试'**
  String get common_retry;

  /// No description provided for @common_success.
  ///
  /// In zh, this message translates to:
  /// **'操作成功'**
  String get common_success;

  /// No description provided for @common_error.
  ///
  /// In zh, this message translates to:
  /// **'操作失败'**
  String get common_error;

  /// No description provided for @common_no_data.
  ///
  /// In zh, this message translates to:
  /// **'暂无数据'**
  String get common_no_data;

  /// No description provided for @common_more.
  ///
  /// In zh, this message translates to:
  /// **'更多'**
  String get common_more;

  /// No description provided for @common_back.
  ///
  /// In zh, this message translates to:
  /// **'返回'**
  String get common_back;

  /// No description provided for @common_next.
  ///
  /// In zh, this message translates to:
  /// **'下一步'**
  String get common_next;

  /// No description provided for @common_done.
  ///
  /// In zh, this message translates to:
  /// **'完成'**
  String get common_done;

  /// No description provided for @common_yes.
  ///
  /// In zh, this message translates to:
  /// **'是'**
  String get common_yes;

  /// No description provided for @common_no.
  ///
  /// In zh, this message translates to:
  /// **'否'**
  String get common_no;

  /// No description provided for @nav_dashboard.
  ///
  /// In zh, this message translates to:
  /// **'工作台'**
  String get nav_dashboard;

  /// No description provided for @nav_task_board.
  ///
  /// In zh, this message translates to:
  /// **'任务看板'**
  String get nav_task_board;

  /// No description provided for @nav_calendar.
  ///
  /// In zh, this message translates to:
  /// **'日历'**
  String get nav_calendar;

  /// No description provided for @nav_email.
  ///
  /// In zh, this message translates to:
  /// **'邮箱'**
  String get nav_email;

  /// No description provided for @nav_notes.
  ///
  /// In zh, this message translates to:
  /// **'笔记'**
  String get nav_notes;

  /// No description provided for @nav_accounting.
  ///
  /// In zh, this message translates to:
  /// **'记账'**
  String get nav_accounting;

  /// No description provided for @nav_timeline.
  ///
  /// In zh, this message translates to:
  /// **'动态'**
  String get nav_timeline;

  /// No description provided for @nav_stocks.
  ///
  /// In zh, this message translates to:
  /// **'股票'**
  String get nav_stocks;

  /// No description provided for @nav_exercise.
  ///
  /// In zh, this message translates to:
  /// **'运动'**
  String get nav_exercise;

  /// No description provided for @nav_log.
  ///
  /// In zh, this message translates to:
  /// **'日志'**
  String get nav_log;

  /// No description provided for @nav_settings.
  ///
  /// In zh, this message translates to:
  /// **'设置'**
  String get nav_settings;

  /// No description provided for @nav_more.
  ///
  /// In zh, this message translates to:
  /// **'更多'**
  String get nav_more;

  /// No description provided for @task_create.
  ///
  /// In zh, this message translates to:
  /// **'新建任务'**
  String get task_create;

  /// No description provided for @task_title.
  ///
  /// In zh, this message translates to:
  /// **'任务标题'**
  String get task_title;

  /// No description provided for @task_description.
  ///
  /// In zh, this message translates to:
  /// **'任务描述'**
  String get task_description;

  /// No description provided for @task_priority.
  ///
  /// In zh, this message translates to:
  /// **'优先级'**
  String get task_priority;

  /// No description provided for @task_priority_high.
  ///
  /// In zh, this message translates to:
  /// **'高'**
  String get task_priority_high;

  /// No description provided for @task_priority_medium.
  ///
  /// In zh, this message translates to:
  /// **'中'**
  String get task_priority_medium;

  /// No description provided for @task_priority_low.
  ///
  /// In zh, this message translates to:
  /// **'低'**
  String get task_priority_low;

  /// No description provided for @task_status_todo.
  ///
  /// In zh, this message translates to:
  /// **'待办'**
  String get task_status_todo;

  /// No description provided for @task_status_in_progress.
  ///
  /// In zh, this message translates to:
  /// **'进行中'**
  String get task_status_in_progress;

  /// No description provided for @task_status_done.
  ///
  /// In zh, this message translates to:
  /// **'已完成'**
  String get task_status_done;

  /// No description provided for @task_status_suspended.
  ///
  /// In zh, this message translates to:
  /// **'已挂起'**
  String get task_status_suspended;

  /// No description provided for @task_due_date.
  ///
  /// In zh, this message translates to:
  /// **'截止日期'**
  String get task_due_date;

  /// No description provided for @task_empty.
  ///
  /// In zh, this message translates to:
  /// **'暂无任务'**
  String get task_empty;

  /// No description provided for @task_empty_hint.
  ///
  /// In zh, this message translates to:
  /// **'点击+号创建任务'**
  String get task_empty_hint;

  /// No description provided for @email_inbox.
  ///
  /// In zh, this message translates to:
  /// **'收件箱'**
  String get email_inbox;

  /// No description provided for @email_compose.
  ///
  /// In zh, this message translates to:
  /// **'写邮件'**
  String get email_compose;

  /// No description provided for @email_accounts.
  ///
  /// In zh, this message translates to:
  /// **'邮箱账户'**
  String get email_accounts;

  /// No description provided for @email_empty.
  ///
  /// In zh, this message translates to:
  /// **'暂无邮件'**
  String get email_empty;

  /// No description provided for @email_empty_hint.
  ///
  /// In zh, this message translates to:
  /// **'添加邮箱账户开始使用'**
  String get email_empty_hint;

  /// No description provided for @contact_list.
  ///
  /// In zh, this message translates to:
  /// **'联系人'**
  String get contact_list;

  /// No description provided for @contact_empty.
  ///
  /// In zh, this message translates to:
  /// **'暂无联系人'**
  String get contact_empty;

  /// No description provided for @contact_empty_hint.
  ///
  /// In zh, this message translates to:
  /// **'添加联系人'**
  String get contact_empty_hint;

  /// No description provided for @note_create.
  ///
  /// In zh, this message translates to:
  /// **'新建笔记'**
  String get note_create;

  /// No description provided for @note_empty.
  ///
  /// In zh, this message translates to:
  /// **'暂无笔记'**
  String get note_empty;

  /// No description provided for @note_empty_hint.
  ///
  /// In zh, this message translates to:
  /// **'点击+号创建笔记'**
  String get note_empty_hint;

  /// No description provided for @note_tag.
  ///
  /// In zh, this message translates to:
  /// **'标签'**
  String get note_tag;

  /// No description provided for @accounting_income.
  ///
  /// In zh, this message translates to:
  /// **'收入'**
  String get accounting_income;

  /// No description provided for @accounting_expense.
  ///
  /// In zh, this message translates to:
  /// **'支出'**
  String get accounting_expense;

  /// No description provided for @accounting_budget.
  ///
  /// In zh, this message translates to:
  /// **'预算'**
  String get accounting_budget;

  /// No description provided for @accounting_empty.
  ///
  /// In zh, this message translates to:
  /// **'暂无记账记录'**
  String get accounting_empty;

  /// No description provided for @accounting_empty_hint.
  ///
  /// In zh, this message translates to:
  /// **'开始记账'**
  String get accounting_empty_hint;

  /// No description provided for @stock_add_watch.
  ///
  /// In zh, this message translates to:
  /// **'添加自选股'**
  String get stock_add_watch;

  /// No description provided for @stock_empty.
  ///
  /// In zh, this message translates to:
  /// **'暂无自选股'**
  String get stock_empty;

  /// No description provided for @stock_empty_hint.
  ///
  /// In zh, this message translates to:
  /// **'添加股票开始使用'**
  String get stock_empty_hint;

  /// No description provided for @exercise_running.
  ///
  /// In zh, this message translates to:
  /// **'跑步'**
  String get exercise_running;

  /// No description provided for @exercise_cycling.
  ///
  /// In zh, this message translates to:
  /// **'骑行'**
  String get exercise_cycling;

  /// No description provided for @exercise_fitness.
  ///
  /// In zh, this message translates to:
  /// **'健身'**
  String get exercise_fitness;

  /// No description provided for @exercise_empty.
  ///
  /// In zh, this message translates to:
  /// **'暂无运动记录'**
  String get exercise_empty;

  /// No description provided for @exercise_empty_hint.
  ///
  /// In zh, this message translates to:
  /// **'记录运动'**
  String get exercise_empty_hint;

  /// No description provided for @log_system.
  ///
  /// In zh, this message translates to:
  /// **'系统'**
  String get log_system;

  /// No description provided for @log_empty.
  ///
  /// In zh, this message translates to:
  /// **'暂无日志'**
  String get log_empty;

  /// No description provided for @settings_language.
  ///
  /// In zh, this message translates to:
  /// **'语言'**
  String get settings_language;

  /// No description provided for @settings_theme.
  ///
  /// In zh, this message translates to:
  /// **'主题'**
  String get settings_theme;

  /// No description provided for @settings_theme_light.
  ///
  /// In zh, this message translates to:
  /// **'浅色'**
  String get settings_theme_light;

  /// No description provided for @settings_theme_dark.
  ///
  /// In zh, this message translates to:
  /// **'深色'**
  String get settings_theme_dark;

  /// No description provided for @settings_theme_system.
  ///
  /// In zh, this message translates to:
  /// **'跟随系统'**
  String get settings_theme_system;

  /// No description provided for @settings_auto_backup.
  ///
  /// In zh, this message translates to:
  /// **'自动备份'**
  String get settings_auto_backup;

  /// No description provided for @settings_manual_backup.
  ///
  /// In zh, this message translates to:
  /// **'手动备份'**
  String get settings_manual_backup;

  /// No description provided for @settings_restore.
  ///
  /// In zh, this message translates to:
  /// **'恢复数据'**
  String get settings_restore;

  /// No description provided for @settings_about.
  ///
  /// In zh, this message translates to:
  /// **'关于'**
  String get settings_about;

  /// No description provided for @settings_version.
  ///
  /// In zh, this message translates to:
  /// **'版本号'**
  String get settings_version;

  /// No description provided for @settings_license.
  ///
  /// In zh, this message translates to:
  /// **'开源许可'**
  String get settings_license;

  /// No description provided for @error_network.
  ///
  /// In zh, this message translates to:
  /// **'网络连接失败，请检查网络设置'**
  String get error_network;

  /// No description provided for @error_imap_connect.
  ///
  /// In zh, this message translates to:
  /// **'无法连接到邮件服务器'**
  String get error_imap_connect;

  /// No description provided for @error_imap_auth.
  ///
  /// In zh, this message translates to:
  /// **'邮箱认证失败，请检查账号密码'**
  String get error_imap_auth;

  /// No description provided for @error_database.
  ///
  /// In zh, this message translates to:
  /// **'数据库操作失败'**
  String get error_database;

  /// No description provided for @notification_new_email.
  ///
  /// In zh, this message translates to:
  /// **'新邮件'**
  String get notification_new_email;

  /// No description provided for @notification_task_due.
  ///
  /// In zh, this message translates to:
  /// **'任务到期'**
  String get notification_task_due;
}

class _EasyWorkLocalizationsDelegate
    extends LocalizationsDelegate<EasyWorkLocalizations> {
  const _EasyWorkLocalizationsDelegate();

  @override
  Future<EasyWorkLocalizations> load(Locale locale) {
    return SynchronousFuture<EasyWorkLocalizations>(
        lookupEasyWorkLocalizations(locale));
  }

  @override
  bool isSupported(Locale locale) =>
      <String>['en', 'zh'].contains(locale.languageCode);

  @override
  bool shouldReload(_EasyWorkLocalizationsDelegate old) => false;
}

EasyWorkLocalizations lookupEasyWorkLocalizations(Locale locale) {
  // Lookup logic when only language code is specified.
  switch (locale.languageCode) {
    case 'en':
      return EasyWorkLocalizationsEn();
    case 'zh':
      return EasyWorkLocalizationsZh();
  }

  throw FlutterError(
      'EasyWorkLocalizations.delegate failed to load unsupported locale "$locale". This is likely '
      'an issue with the localizations generation tool. Please file an issue '
      'on GitHub with a reproducible sample app and the gen-l10n configuration '
      'that was used.');
}
