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
  final bool smtpStartTls;
  final bool supportsIdle;
  final bool isActive;
  final String syncPeriod;
  final int syncInterval;
  final int accentColor;
  final DateTime createdAt;
  // DKIM signing settings (optional). When all three are set, outgoing
  // messages are signed with DKIM before sending.
  final String? dkimDomain;
  final String? dkimSelector;
  final String? dkimPrivateKey;

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
    this.smtpStartTls = false,
    this.supportsIdle = false,
    this.isActive = true,
    this.syncPeriod = '1m',
    this.syncInterval = 5,
    this.accentColor = 0xFF2196F3,
    DateTime? createdAt,
    this.dkimDomain,
    this.dkimSelector,
    this.dkimPrivateKey,
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
    bool? smtpStartTls,
    bool? supportsIdle,
    bool? isActive,
    String? syncPeriod,
    int? syncInterval,
    int? accentColor,
    String? dkimDomain,
    String? dkimSelector,
    String? dkimPrivateKey,
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
      smtpStartTls: smtpStartTls ?? this.smtpStartTls,
      supportsIdle: supportsIdle ?? this.supportsIdle,
      isActive: isActive ?? this.isActive,
      syncPeriod: syncPeriod ?? this.syncPeriod,
      syncInterval: syncInterval ?? this.syncInterval,
      accentColor: accentColor ?? this.accentColor,
      createdAt: createdAt,
      dkimDomain: dkimDomain ?? this.dkimDomain,
      dkimSelector: dkimSelector ?? this.dkimSelector,
      dkimPrivateKey: dkimPrivateKey ?? this.dkimPrivateKey,
    );
  }

  /// Whether DKIM signing is configured (all three fields must be set).
  bool get hasDkimConfig =>
      dkimDomain != null &&
      dkimDomain!.isNotEmpty &&
      dkimSelector != null &&
      dkimSelector!.isNotEmpty &&
      dkimPrivateKey != null &&
      dkimPrivateKey!.isNotEmpty;
}
