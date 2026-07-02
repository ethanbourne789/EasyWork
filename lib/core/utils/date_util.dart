import 'package:intl/intl.dart';

class DateUtil {
  static final DateFormat _dateFormat = DateFormat('yyyy-MM-dd');
  static final DateFormat _timeFormat = DateFormat('HH:mm');
  static final DateFormat _dateTimeFormat = DateFormat('yyyy-MM-dd HH:mm');
  static final DateFormat _relativeFormat = DateFormat('MM-dd HH:mm');

  static String formatDate(DateTime date) => _dateFormat.format(date);
  static String formatTime(DateTime date) => _timeFormat.format(date);
  static String formatDateTime(DateTime date) => _dateTimeFormat.format(date);
  static String formatRelative(DateTime date) => _relativeFormat.format(date);

  static bool isToday(DateTime date) {
    final now = DateTime.now();
    return date.year == now.year && date.month == now.month && date.day == now.day;
  }

  static bool isTomorrow(DateTime date) {
    final tomorrow = DateTime.now().add(const Duration(days: 1));
    return date.year == tomorrow.year && date.month == tomorrow.month && date.day == tomorrow.day;
  }

  static String formatRelativeDate(DateTime date) {
    if (isToday(date)) return '今天';
    if (isTomorrow(date)) return '明天';
    final diff = DateTime.now().difference(date).inDays;
    if (diff == 1) return '昨天';
    if (diff < 7) return '$diff天前';
    return formatDate(date);
  }
}
