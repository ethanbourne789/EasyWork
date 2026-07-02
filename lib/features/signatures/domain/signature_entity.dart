class SignatureEntity {
  final int? id;
  final String name;
  final String content;
  final bool isDefault;
  final DateTime createdAt;

  SignatureEntity({
    this.id,
    required this.name,
    required this.content,
    this.isDefault = false,
    DateTime? createdAt,
  }) : createdAt = createdAt ?? DateTime.now();
}
