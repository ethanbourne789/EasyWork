import 'package:flutter_test/flutter_test.dart';
import 'package:easywork/features/email/data/email_providers_config.dart';

void main() {
  group('EmailProviderConfig', () {
    test('should have correct QQ mail configuration', () {
      final config = getConfigByDomain('qq.com');
      expect(config, isNotNull);
      expect(config!.imapHost, 'imap.qq.com');
      expect(config.imapPort, 993);
      expect(config.imapUseSsl, isTrue);
      expect(config.smtpHost, 'smtp.qq.com');
      expect(config.smtpPort, 465);
      expect(config.smtpUseSsl, isTrue);
    });

    test('should have correct 163 mail configuration', () {
      final config = getConfigByDomain('163.com');
      expect(config, isNotNull);
      expect(config!.imapHost, 'imap.163.com');
      expect(config.smtpHost, 'smtp.163.com');
    });

    test('should have correct Gmail configuration', () {
      final config = getConfigByDomain('gmail.com');
      expect(config, isNotNull);
      expect(config!.imapHost, 'imap.gmail.com');
      expect(config.smtpHost, 'smtp.gmail.com');
    });

    test('should have correct Outlook configuration', () {
      final config = getConfigByDomain('outlook.com');
      expect(config, isNotNull);
      expect(config!.imapHost, 'outlook.office365.com');
      expect(config.smtpHost, 'smtp.office365.com');
      expect(config.smtpPort, 587);
      expect(config.smtpUseSsl, isFalse);
    });

    test('should be case insensitive', () {
      final config1 = getConfigByDomain('QQ.COM');
      final config2 = getConfigByDomain('qq.com');
      expect(config1, isNotNull);
      expect(config2, isNotNull);
      expect(config1!.imapHost, config2!.imapHost);
    });

    test('should return null for unknown domain', () {
      final config = getConfigByDomain('unknown.com');
      expect(config, isNull);
    });
  });

  group('getConfigByEmail', () {
    test('should extract config from email address', () {
      final config = getConfigByEmail('user@qq.com');
      expect(config, isNotNull);
      expect(config!.imapHost, 'imap.qq.com');
    });

    test('should handle email without @', () {
      final config = getConfigByEmail('invalidemail');
      expect(config, isNull);
    });

    test('should handle empty email', () {
      final config = getConfigByEmail('');
      expect(config, isNull);
    });
  });

  group('extractUsername', () {
    test('should extract username from email', () {
      expect(extractUsername('user@example.com'), 'user');
      expect(extractUsername('test.user@domain.org'), 'test.user');
    });

    test('should return full string if no @', () {
      expect(extractUsername('noatsign'), 'noatsign');
    });

    test('should handle empty string', () {
      expect(extractUsername(''), '');
    });
  });

  group('extractDomain', () {
    test('should extract domain from email', () {
      expect(extractDomain('user@example.com'), 'example.com');
      expect(extractDomain('test@sub.domain.org'), 'sub.domain.org');
    });

    test('should return empty string if no @', () {
      expect(extractDomain('noatsign'), '');
    });

    test('should handle empty string', () {
      expect(extractDomain(''), '');
    });
  });

  group('Email provider configurations completeness', () {
    test('should have all major Chinese email providers', () {
      expect(getConfigByDomain('qq.com'), isNotNull);
      expect(getConfigByDomain('foxmail.com'), isNotNull);
      expect(getConfigByDomain('163.com'), isNotNull);
      expect(getConfigByDomain('126.com'), isNotNull);
      expect(getConfigByDomain('yeah.net'), isNotNull);
      expect(getConfigByDomain('sina.com'), isNotNull);
      expect(getConfigByDomain('sina.cn'), isNotNull);
    });

    test('should have all major international email providers', () {
      expect(getConfigByDomain('gmail.com'), isNotNull);
      expect(getConfigByDomain('outlook.com'), isNotNull);
      expect(getConfigByDomain('hotmail.com'), isNotNull);
      expect(getConfigByDomain('live.com'), isNotNull);
      expect(getConfigByDomain('yahoo.com'), isNotNull);
      expect(getConfigByDomain('icloud.com'), isNotNull);
      expect(getConfigByDomain('protonmail.com'), isNotNull);
    });
  });
}
