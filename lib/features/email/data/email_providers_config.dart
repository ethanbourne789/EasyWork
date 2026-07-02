class EmailProviderConfig {
  final String imapHost;
  final int imapPort;
  final bool imapUseSsl;
  final String smtpHost;
  final int smtpPort;
  final bool smtpUseSsl;

  const EmailProviderConfig({
    required this.imapHost,
    required this.imapPort,
    required this.imapUseSsl,
    required this.smtpHost,
    required this.smtpPort,
    required this.smtpUseSsl,
  });
}

const emailProvidersConfig = <String, EmailProviderConfig>{
  'qq.com': EmailProviderConfig(
    imapHost: 'imap.qq.com',
    imapPort: 993,
    imapUseSsl: true,
    smtpHost: 'smtp.qq.com',
    smtpPort: 465,
    smtpUseSsl: true,
  ),
  'foxmail.com': EmailProviderConfig(
    imapHost: 'imap.qq.com',
    imapPort: 993,
    imapUseSsl: true,
    smtpHost: 'smtp.qq.com',
    smtpPort: 465,
    smtpUseSsl: true,
  ),
  '163.com': EmailProviderConfig(
    imapHost: 'imap.163.com',
    imapPort: 993,
    imapUseSsl: true,
    smtpHost: 'smtp.163.com',
    smtpPort: 465,
    smtpUseSsl: true,
  ),
  '126.com': EmailProviderConfig(
    imapHost: 'imap.126.com',
    imapPort: 993,
    imapUseSsl: true,
    smtpHost: 'smtp.126.com',
    smtpPort: 465,
    smtpUseSsl: true,
  ),
  'yeah.net': EmailProviderConfig(
    imapHost: 'imap.yeah.net',
    imapPort: 993,
    imapUseSsl: true,
    smtpHost: 'smtp.yeah.net',
    smtpPort: 465,
    smtpUseSsl: true,
  ),
  'sina.com': EmailProviderConfig(
    imapHost: 'imap.sina.com',
    imapPort: 993,
    imapUseSsl: true,
    smtpHost: 'smtp.sina.com',
    smtpPort: 465,
    smtpUseSsl: true,
  ),
  'sina.cn': EmailProviderConfig(
    imapHost: 'imap.sina.cn',
    imapPort: 993,
    imapUseSsl: true,
    smtpHost: 'smtp.sina.cn',
    smtpPort: 465,
    smtpUseSsl: true,
  ),
  'gmail.com': EmailProviderConfig(
    imapHost: 'imap.gmail.com',
    imapPort: 993,
    imapUseSsl: true,
    smtpHost: 'smtp.gmail.com',
    smtpPort: 465,
    smtpUseSsl: true,
  ),
  'outlook.com': EmailProviderConfig(
    imapHost: 'outlook.office365.com',
    imapPort: 993,
    imapUseSsl: true,
    smtpHost: 'smtp.office365.com',
    smtpPort: 587,
    smtpUseSsl: false,
  ),
  'hotmail.com': EmailProviderConfig(
    imapHost: 'outlook.office365.com',
    imapPort: 993,
    imapUseSsl: true,
    smtpHost: 'smtp.office365.com',
    smtpPort: 587,
    smtpUseSsl: false,
  ),
  'live.com': EmailProviderConfig(
    imapHost: 'outlook.office365.com',
    imapPort: 993,
    imapUseSsl: true,
    smtpHost: 'smtp.office365.com',
    smtpPort: 587,
    smtpUseSsl: false,
  ),
  'msn.com': EmailProviderConfig(
    imapHost: 'outlook.office365.com',
    imapPort: 993,
    imapUseSsl: true,
    smtpHost: 'smtp.office365.com',
    smtpPort: 587,
    smtpUseSsl: false,
  ),
  'yahoo.com': EmailProviderConfig(
    imapHost: 'imap.mail.yahoo.com',
    imapPort: 993,
    imapUseSsl: true,
    smtpHost: 'smtp.mail.yahoo.com',
    smtpPort: 465,
    smtpUseSsl: true,
  ),
  'yahoo.co.jp': EmailProviderConfig(
    imapHost: 'imap.mail.yahoo.co.jp',
    imapPort: 993,
    imapUseSsl: true,
    smtpHost: 'smtp.mail.yahoo.co.jp',
    smtpPort: 465,
    smtpUseSsl: true,
  ),
  'icloud.com': EmailProviderConfig(
    imapHost: 'imap.mail.me.com',
    imapPort: 993,
    imapUseSsl: true,
    smtpHost: 'smtp.mail.me.com',
    smtpPort: 587,
    smtpUseSsl: false,
  ),
  'me.com': EmailProviderConfig(
    imapHost: 'imap.mail.me.com',
    imapPort: 993,
    imapUseSsl: true,
    smtpHost: 'smtp.mail.me.com',
    smtpPort: 587,
    smtpUseSsl: false,
  ),
  'aol.com': EmailProviderConfig(
    imapHost: 'imap.aol.com',
    imapPort: 993,
    imapUseSsl: true,
    smtpHost: 'smtp.aol.com',
    smtpPort: 465,
    smtpUseSsl: true,
  ),
  'zoho.com': EmailProviderConfig(
    imapHost: 'imap.zoho.com',
    imapPort: 993,
    imapUseSsl: true,
    smtpHost: 'smtp.zoho.com',
    smtpPort: 465,
    smtpUseSsl: true,
  ),
  'yandex.com': EmailProviderConfig(
    imapHost: 'imap.yandex.com',
    imapPort: 993,
    imapUseSsl: true,
    smtpHost: 'smtp.yandex.com',
    smtpPort: 465,
    smtpUseSsl: true,
  ),
  'mail.ru': EmailProviderConfig(
    imapHost: 'imap.mail.ru',
    imapPort: 993,
    imapUseSsl: true,
    smtpHost: 'smtp.mail.ru',
    smtpPort: 465,
    smtpUseSsl: true,
  ),
  'gmx.com': EmailProviderConfig(
    imapHost: 'imap.gmx.com',
    imapPort: 993,
    imapUseSsl: true,
    smtpHost: 'smtp.gmx.com',
    smtpPort: 465,
    smtpUseSsl: true,
  ),
  'protonmail.com': EmailProviderConfig(
    imapHost: 'imap.protonmail.com',
    imapPort: 993,
    imapUseSsl: true,
    smtpHost: 'smtp.protonmail.com',
    smtpPort: 587,
    smtpUseSsl: false,
  ),
  'proton.me': EmailProviderConfig(
    imapHost: 'imap.protonmail.com',
    imapPort: 993,
    imapUseSsl: true,
    smtpHost: 'smtp.protonmail.com',
    smtpPort: 587,
    smtpUseSsl: false,
  ),
};

EmailProviderConfig? getConfigByDomain(String domain) {
  return emailProvidersConfig[domain.toLowerCase()];
}

EmailProviderConfig? getConfigByEmail(String email) {
  final atIndex = email.indexOf('@');
  if (atIndex == -1) return null;
  final domain = email.substring(atIndex + 1);
  return getConfigByDomain(domain);
}

String extractUsername(String email) {
  final atIndex = email.indexOf('@');
  if (atIndex == -1) return email;
  return email.substring(0, atIndex);
}

String extractDomain(String email) {
  final atIndex = email.indexOf('@');
  if (atIndex == -1) return '';
  return email.substring(atIndex + 1);
}
