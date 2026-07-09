class EmailProviderConfig {
  final String imapHost;
  final int imapPort;
  final bool imapUseSsl;
  final String smtpHost;
  final int smtpPort;
  final bool smtpUseSsl;
  final bool smtpStartTls;
  final String? setupHint;

  const EmailProviderConfig({
    required this.imapHost,
    required this.imapPort,
    required this.imapUseSsl,
    required this.smtpHost,
    required this.smtpPort,
    required this.smtpUseSsl,
    this.smtpStartTls = false,
    this.setupHint,
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
    smtpStartTls: true,
  ),
  'hotmail.com': EmailProviderConfig(
    imapHost: 'outlook.office365.com',
    imapPort: 993,
    imapUseSsl: true,
    smtpHost: 'smtp.office365.com',
    smtpPort: 587,
    smtpUseSsl: false,
    smtpStartTls: true,
  ),
  'live.com': EmailProviderConfig(
    imapHost: 'outlook.office365.com',
    imapPort: 993,
    imapUseSsl: true,
    smtpHost: 'smtp.office365.com',
    smtpPort: 587,
    smtpUseSsl: false,
    smtpStartTls: true,
  ),
  'msn.com': EmailProviderConfig(
    imapHost: 'outlook.office365.com',
    imapPort: 993,
    imapUseSsl: true,
    smtpHost: 'smtp.office365.com',
    smtpPort: 587,
    smtpUseSsl: false,
    smtpStartTls: true,
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
    smtpStartTls: true,
  ),
  'me.com': EmailProviderConfig(
    imapHost: 'imap.mail.me.com',
    imapPort: 993,
    imapUseSsl: true,
    smtpHost: 'smtp.mail.me.com',
    smtpPort: 587,
    smtpUseSsl: false,
    smtpStartTls: true,
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
    imapHost: '127.0.0.1',
    imapPort: 1143,
    imapUseSsl: false,
    smtpHost: '127.0.0.1',
    smtpPort: 1025,
    smtpUseSsl: false,
    setupHint: 'ProtonMail 需要安装 Proton Bridge 才能使用邮件客户端，请先配置 Bridge 后重试',
  ),
  'proton.me': EmailProviderConfig(
    imapHost: '127.0.0.1',
    imapPort: 1143,
    imapUseSsl: false,
    smtpHost: '127.0.0.1',
    smtpPort: 1025,
    smtpUseSsl: false,
    setupHint: 'Proton 需要安装 Proton Bridge 才能使用邮件客户端，请先配置 Bridge 后重试',
  ),
  '139.com': EmailProviderConfig(
    imapHost: 'imap.139.com',
    imapPort: 993,
    imapUseSsl: true,
    smtpHost: 'smtp.139.com',
    smtpPort: 465,
    smtpUseSsl: true,
  ),
  '189.cn': EmailProviderConfig(
    imapHost: 'imap.189.cn',
    imapPort: 993,
    imapUseSsl: true,
    smtpHost: 'smtp.189.cn',
    smtpPort: 465,
    smtpUseSsl: true,
  ),
  'wo.cn': EmailProviderConfig(
    imapHost: 'imap.wo.cn',
    imapPort: 993,
    imapUseSsl: true,
    smtpHost: 'smtp.wo.cn',
    smtpPort: 465,
    smtpUseSsl: true,
  ),
  'aliyun.com': EmailProviderConfig(
    imapHost: 'imap.qiye.aliyun.com',
    imapPort: 993,
    imapUseSsl: true,
    smtpHost: 'smtp.qiye.aliyun.com',
    smtpPort: 465,
    smtpUseSsl: true,
  ),
  'sohu.com': EmailProviderConfig(
    imapHost: 'imap.sohu.com',
    imapPort: 993,
    imapUseSsl: true,
    smtpHost: 'smtp.sohu.com',
    smtpPort: 465,
    smtpUseSsl: true,
  ),
  'sogou.com': EmailProviderConfig(
    imapHost: 'imap.sogou.com',
    imapPort: 993,
    imapUseSsl: true,
    smtpHost: 'smtp.sogou.com',
    smtpPort: 465,
    smtpUseSsl: true,
  ),
  'tom.com': EmailProviderConfig(
    imapHost: 'imap.tom.com',
    imapPort: 993,
    imapUseSsl: true,
    smtpHost: 'smtp.tom.com',
    smtpPort: 465,
    smtpUseSsl: true,
  ),
  '21cn.com': EmailProviderConfig(
    imapHost: 'imap.21cn.com',
    imapPort: 993,
    imapUseSsl: true,
    smtpHost: 'smtp.21cn.com',
    smtpPort: 465,
    smtpUseSsl: true,
  ),
  'eyou.com': EmailProviderConfig(
    imapHost: 'imap.eyou.com',
    imapPort: 993,
    imapUseSsl: true,
    smtpHost: 'smtp.eyou.com',
    smtpPort: 465,
    smtpUseSsl: true,
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
