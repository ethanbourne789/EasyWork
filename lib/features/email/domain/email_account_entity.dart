class EmailAccountEntity {
  final int? id;
  final String displayName;
  final String email;
  final String? password;
  final String imapHost;
  final int imapPort;
  final bool imapUseSsl;
  final String smtpHost;
  final int smtpPort;
  final bool smtpUseSsl;
  final bool supportsIdle;
  final bool isActive;
  final String syncPeriod;
  final int syncInterval;
  final DateTime createdAt;

  EmailAccountEntity({
    this.id,
    required this.displayName,
    required this.email,
    this.password,
    required this.imapHost,
    this.imapPort = 993,
    this.imapUseSsl = true,
    required this.smtpHost,
    this.smtpPort = 465,
    this.smtpUseSsl = true,
    this.supportsIdle = false,
    this.isActive = true,
    this.syncPeriod = '1m',
    this.syncInterval = 5,
    DateTime? createdAt,
  }) : createdAt = createdAt ?? DateTime.now();

  EmailAccountEntity copyWith({
    int? id,
    String? displayName,
    String? email,
    String? password,
    String? imapHost,
    int? imapPort,
    bool? imapUseSsl,
    String? smtpHost,
    int? smtpPort,
    bool? smtpUseSsl,
    bool? supportsIdle,
    bool? isActive,
    String? syncPeriod,
    int? syncInterval,
  }) {
    return EmailAccountEntity(
      id: id ?? this.id,
      displayName: displayName ?? this.displayName,
      email: email ?? this.email,
      password: password ?? this.password,
      imapHost: imapHost ?? this.imapHost,
      imapPort: imapPort ?? this.imapPort,
      imapUseSsl: imapUseSsl ?? this.imapUseSsl,
      smtpHost: smtpHost ?? this.smtpHost,
      smtpPort: smtpPort ?? this.smtpPort,
      smtpUseSsl: smtpUseSsl ?? this.smtpUseSsl,
      supportsIdle: supportsIdle ?? this.supportsIdle,
      isActive: isActive ?? this.isActive,
      syncPeriod: syncPeriod ?? this.syncPeriod,
      syncInterval: syncInterval ?? this.syncInterval,
      createdAt: createdAt,
    );
  }
}
