import 'package:drift/drift.dart';
import '../app_database.dart';
import 'timeline_events_table.dart';

part 'timeline_events_dao.g.dart';

@DriftAccessor(tables: [TimelineEvents])
class TimelineEventsDao extends DatabaseAccessor<AppDatabase>
    with _$TimelineEventsDaoMixin {
  TimelineEventsDao(AppDatabase db) : super(db);

  Future<List<TimelineEvent>> getAllEvents() =>
      select(timelineEvents).get();
  Future<List<TimelineEvent>> getEventsByDateRange(
          DateTime start, DateTime end) =>
      (select(timelineEvents)
            ..where((t) =>
                t.createdAt.isBiggerOrEqualValue(start) &
                t.createdAt.isSmallerOrEqualValue(end)))
          .get();
  Future<int> insertEvent(TimelineEventsCompanion event) =>
      into(timelineEvents).insert(event);
  Future<int> deleteOlderThan(DateTime date) =>
      (delete(timelineEvents)
            ..where((t) => t.createdAt.isSmallerOrEqualValue(date)))
          .go();
}
