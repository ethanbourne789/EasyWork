import 'package:flutter_test/flutter_test.dart';
import 'package:easywork/features/email/domain/email_account_entity.dart';

void main() {
  group('EmailAccountEntity', () {
    test('should create entity with required fields', () {
      final account = EmailAccountEntity(
        displayName: 'Test Account',
        email: 'test@example.com',
        imapHost: 'imap.example.com',
        smtpHost: 'smtp.example.com',
      );

      expect(account.displayName, 'Test Account');
      expect(account.email, 'test@example.com');
      expect(account.imapHost, 'imap.example.com');
      expect(account.smtpHost, 'smtp.example.com');
      expect(account.imapPort, 993);
      expect(account.smtpPort, 465);
      expect(account.imapUseSsl, isTrue);
      expect(account.smtpUseSsl, isTrue);
      expect(account.supportsIdle, isFalse);
      expect(account.isActive, isTrue);
      expect(account.syncPeriod, '1m');
      expect(account.syncInterval, 5);
      expect(account.id, isNull);
      expect(account.password, isNull);
    });

    test('should create entity with all fields', () {
      final now = DateTime.now();
      final account = EmailAccountEntity(
        id: 1,
        displayName: 'Full Account',
        email: 'full@example.com',
        password: 'password123',
        imapHost: 'imap.example.com',
        imapPort: 143,
        imapUseSsl: false,
        smtpHost: 'smtp.example.com',
        smtpPort: 587,
        smtpUseSsl: false,
        supportsIdle: true,
        isActive: false,
        syncPeriod: '3m',
        syncInterval: 10,
        createdAt: now,
      );

      expect(account.id, 1);
      expect(account.password, 'password123');
      expect(account.imapPort, 143);
      expect(account.imapUseSsl, isFalse);
      expect(account.smtpPort, 587);
      expect(account.smtpUseSsl, isFalse);
      expect(account.supportsIdle, isTrue);
      expect(account.isActive, isFalse);
      expect(account.syncPeriod, '3m');
      expect(account.syncInterval, 10);
      expect(account.createdAt, now);
    });

    test('should set createdAt to now by default', () {
      final before = DateTime.now();
      final account = EmailAccountEntity(
        displayName: 'Test',
        email: 'test@example.com',
        imapHost: 'imap.example.com',
        smtpHost: 'smtp.example.com',
      );
      final after = DateTime.now();

      expect(account.createdAt.isAfter(before) || account.createdAt.isAtSameMomentAs(before), isTrue);
      expect(account.createdAt.isBefore(after) || account.createdAt.isAtSameMomentAs(after), isTrue);
    });
  });

  group('copyWith', () {
    test('should copy with no changes', () {
      final original = EmailAccountEntity(
        id: 1,
        displayName: 'Original',
        email: 'original@example.com',
        imapHost: 'imap.original.com',
        smtpHost: 'smtp.original.com',
      );

      final copy = original.copyWith();

      expect(copy.id, original.id);
      expect(copy.displayName, original.displayName);
      expect(copy.email, original.email);
      expect(copy.imapHost, original.imapHost);
      expect(copy.smtpHost, original.smtpHost);
    });

    test('should copy with specific field changes', () {
      final original = EmailAccountEntity(
        id: 1,
        displayName: 'Original',
        email: 'original@example.com',
        password: 'oldpass',
        imapHost: 'imap.original.com',
        imapPort: 993,
        imapUseSsl: true,
        smtpHost: 'smtp.original.com',
        smtpPort: 465,
        smtpUseSsl: true,
        syncPeriod: '1m',
        syncInterval: 5,
      );

      final copy = original.copyWith(
        displayName: 'Updated',
        password: 'newpass',
        imapPort: 143,
        imapUseSsl: false,
        syncPeriod: '3m',
        syncInterval: 15,
      );

      expect(copy.id, 1);
      expect(copy.displayName, 'Updated');
      expect(copy.email, 'original@example.com');
      expect(copy.password, 'newpass');
      expect(copy.imapHost, 'imap.original.com');
      expect(copy.imapPort, 143);
      expect(copy.imapUseSsl, false);
      expect(copy.smtpHost, 'smtp.original.com');
      expect(copy.smtpPort, 465);
      expect(copy.smtpUseSsl, true);
      expect(copy.syncPeriod, '3m');
      expect(copy.syncInterval, 15);
    });

    test('should create independent copy', () {
      final original = EmailAccountEntity(
        displayName: 'Original',
        email: 'original@example.com',
        imapHost: 'imap.example.com',
        smtpHost: 'smtp.example.com',
      );

      final copy1 = original.copyWith(displayName: 'Copy1');
      final copy2 = original.copyWith(displayName: 'Copy2');

      expect(original.displayName, 'Original');
      expect(copy1.displayName, 'Copy1');
      expect(copy2.displayName, 'Copy2');
    });
  });

  group('Sync settings', () {
    test('should have default sync period of 1m', () {
      final account = EmailAccountEntity(
        displayName: 'Test',
        email: 'test@example.com',
        imapHost: 'imap.example.com',
        smtpHost: 'smtp.example.com',
      );

      expect(account.syncPeriod, '1m');
    });

    test('should have default sync interval of 5 minutes', () {
      final account = EmailAccountEntity(
        displayName: 'Test',
        email: 'test@example.com',
        imapHost: 'imap.example.com',
        smtpHost: 'smtp.example.com',
      );

      expect(account.syncInterval, 5);
    });

    test('should accept custom sync period', () {
      final periods = ['1w', '1m', '3m', '6m', '1y', 'all'];
      for (final period in periods) {
        final account = EmailAccountEntity(
          displayName: 'Test',
          email: 'test@example.com',
          imapHost: 'imap.example.com',
          smtpHost: 'smtp.example.com',
          syncPeriod: period,
        );
        expect(account.syncPeriod, period);
      }
    });

    test('should accept custom sync interval', () {
      final intervals = [1, 5, 10, 15, 30, 60];
      for (final interval in intervals) {
        final account = EmailAccountEntity(
          displayName: 'Test',
          email: 'test@example.com',
          imapHost: 'imap.example.com',
          smtpHost: 'smtp.example.com',
          syncInterval: interval,
        );
        expect(account.syncInterval, interval);
      }
    });
  });

  group('Password handling', () {
    test('should accept null password', () {
      final account = EmailAccountEntity(
        displayName: 'Test',
        email: 'test@example.com',
        imapHost: 'imap.example.com',
        smtpHost: 'smtp.example.com',
      );

      expect(account.password, isNull);
    });

    test('should accept password', () {
      final account = EmailAccountEntity(
        displayName: 'Test',
        email: 'test@example.com',
        imapHost: 'imap.example.com',
        smtpHost: 'smtp.example.com',
        password: 'secret123',
      );

      expect(account.password, 'secret123');
    });

    test('should update password via copyWith', () {
      final original = EmailAccountEntity(
        displayName: 'Test',
        email: 'test@example.com',
        imapHost: 'imap.example.com',
        smtpHost: 'smtp.example.com',
        password: 'oldpass',
      );

      final updated = original.copyWith(password: 'newpass');
      expect(updated.password, 'newpass');
    });
  });
}
