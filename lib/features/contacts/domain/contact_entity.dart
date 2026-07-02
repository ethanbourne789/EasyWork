class ContactEntity {
  final int? id;
  final String displayName;
  final String emailAddresses;
  final String phoneNumbers;
  final String? organization;
  final String? jobTitle;
  final String? notes;
  final DateTime createdAt;

  ContactEntity({
    this.id,
    required this.displayName,
    this.emailAddresses = '',
    this.phoneNumbers = '',
    this.organization,
    this.jobTitle,
    this.notes,
    DateTime? createdAt,
  }) : createdAt = createdAt ?? DateTime.now();
}
