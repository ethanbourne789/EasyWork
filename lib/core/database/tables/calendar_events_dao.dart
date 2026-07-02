import 'package:drift/drift.dart';
import '../app_database.dart';
import 'calendar_events_table.dart';

part 'calendar_events_dao.g.dart';

@DriftAccessor(tables: [CalendarEvents])
class CalendarEventsDao extends DatabaseAccessor<AppDatabase>
    with _$CalendarEventsDaoMixin {
  CalendarEventsDao(AppDatabase db) : super(db);

  Future<List<CalendarEvent>> getAllEvents() => select(calendarEvents).get();
  Future<List<CalendarEvent>> getEventsByDateRange(
          DateTime start, DateTime end) =>
      (select(calendarEvents)
            ..where((t) =>
                t.start.isBiggerOrEqualValue(start) &
                t.start.isSmallerOrEqualValue(end)))
          .get();
  Future<CalendarEvent?> getEventById(int id) =>
      (select(calendarEvents)..where((t) => t.id.equals(id)))
          .getSingleOrNull();
  Future<int> insertEvent(CalendarEventsCompanion event) =>
      into(calendarEvents).insert(event);
  Future<bool> updateEvent(CalendarEventsCompanion event) =>
      update(calendarEvents).replace(event);
  Future<int> deleteEvent(int id) =>
      (delete(calendarEvents)..where((t) => t.id.equals(id))).go();
}
