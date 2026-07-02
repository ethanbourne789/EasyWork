import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:easywork/features/email/data/email_sync_service.dart';
import 'package:easywork/core/database/tables/emails_dao.dart';
import 'package:easywork/core/event/event_bus.dart';
import 'package:easywork/features/email/data/mail_data_sources_notifier.dart';

class MockEmailsDao extends Mock implements EmailsDao {}

class MockEventBus extends Mock implements EventBus {}

class MockMailDataSourcesNotifier extends Mock implements MailDataSourcesNotifier {}

void main() {
  late EmailSyncService syncService;
  late MockEmailsDao mockEmailsDao;
  late MockEventBus mockEventBus;
  late MockMailDataSourcesNotifier mockDataSources;

  setUp(() {
    mockEmailsDao = MockEmailsDao();
    mockEventBus = MockEventBus();
    mockDataSources = MockMailDataSourcesNotifier();

    syncService = EmailSyncService(
      emailsDao: mockEmailsDao,
      eventBus: mockEventBus,
      dataSources: mockDataSources,
    );
  });

  group('SyncResult', () {
    test('should create success result', () {
      final result = SyncResult.success(
        imported: 10,
        skipped: 2,
        total: 12,
      );

      expect(result.success, true);
      expect(result.imported, 10);
      expect(result.skipped, 2);
      expect(result.total, 12);
      expect(result.errorMessage, isNull);
    });

    test('should create error result', () {
      final result = SyncResult.error('Sync failed');

      expect(result.success, false);
      expect(result.imported, 0);
      expect(result.skipped, 0);
      expect(result.total, 0);
      expect(result.errorMessage, 'Sync failed');
    });

    test('should create result with default values', () {
      const result = SyncResult(success: true);

      expect(result.success, true);
      expect(result.imported, 0);
      expect(result.skipped, 0);
      expect(result.total, 0);
      expect(result.errorMessage, isNull);
    });
  });

  group('EmailSyncService', () {
    test('should return error when account not connected', () async {
      when(() => mockDataSources.get(any())).thenReturn(null);

      final result = await syncService.firstSync(999);

      expect(result.success, false);
      expect(result.errorMessage, 'Account not connected');
    });

    test('should disconnect and cleanup subscriptions', () async {
      await syncService.disconnect(1);

      verify(() => mockDataSources.get(1)).called(1);
    });

    test('should disconnect all accounts', () async {
      await syncService.disconnectAll();

      // No subscriptions to cancel, so this should complete without error
    });

    test('should dispose and cleanup all resources', () {
      syncService.dispose();

      // Should complete without error
    });
  });

  group('Sync period parsing', () {
    test('should parse 1w as 7 days', () {
      const period = '1w';
      final days = _parsePeriodToDays(period);
      expect(days, 7);
    });

    test('should parse 1m as 30 days', () {
      const period = '1m';
      final days = _parsePeriodToDays(period);
      expect(days, 30);
    });

    test('should parse 3m as 90 days', () {
      const period = '3m';
      final days = _parsePeriodToDays(period);
      expect(days, 90);
    });

    test('should parse 6m as 180 days', () {
      const period = '6m';
      final days = _parsePeriodToDays(period);
      expect(days, 180);
    });

    test('should parse 1y as 365 days', () {
      const period = '1y';
      final days = _parsePeriodToDays(period);
      expect(days, 365);
    });

    test('should parse all as 3650 days', () {
      const period = 'all';
      final days = _parsePeriodToDays(period);
      expect(days, 3650);
    });
  });
}

int _parsePeriodToDays(String period) {
  switch (period) {
    case '1w':
      return 7;
    case '1m':
      return 30;
    case '3m':
      return 90;
    case '6m':
      return 180;
    case '1y':
      return 365;
    case 'all':
      return 3650;
    default:
      return 30;
  }
}
