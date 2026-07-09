import '../domain/contact_entity.dart';

/// Minimal vCard 3.0 import/export for contacts (BUG-22 / feature request).
///
/// Implemented without an external package to avoid adding a dependency:
/// supports FN, N, EMAIL, TEL, ORG, TITLE and NOTE. Multiple emails/phones are
/// stored comma-separated on the [ContactEntity] and expanded on export.
class VCardService {
  /// Serialize contacts to a vCard 3.0 document (one VCARD block per contact).
  String exportContacts(List<ContactEntity> contacts) {
    final buffer = StringBuffer();
    for (final c in contacts) {
      buffer.writeln('BEGIN:VCARD');
      buffer.writeln('VERSION:3.0');
      buffer.writeln('FN:${_escape(c.displayName)}');

      // N: <last>;<first>;;; — loosely split the display name.
      final nameParts = c.displayName.split(' ');
      final first = nameParts.isNotEmpty ? nameParts.first : '';
      final last = nameParts.length > 1 ? nameParts.sublist(1).join(' ') : '';
      buffer.writeln('N:${_escape(last)};${_escape(first)};;;');

      for (final email in _split(c.emailAddresses)) {
        buffer.writeln('EMAIL;TYPE=INTERNET:${_escape(email)}');
      }
      for (final phone in _split(c.phoneNumbers)) {
        buffer.writeln('TEL;TYPE=VOICE:${_escape(phone)}');
      }
      if (c.organization != null && c.organization!.isNotEmpty) {
        buffer.writeln('ORG:${_escape(c.organization!)}');
      }
      if (c.jobTitle != null && c.jobTitle!.isNotEmpty) {
        buffer.writeln('TITLE:${_escape(c.jobTitle!)}');
      }
      if (c.notes != null && c.notes!.isNotEmpty) {
        buffer.writeln('NOTE:${_escape(c.notes!)}');
      }
      buffer.writeln('END:VCARD');
    }
    return buffer.toString();
  }

  /// Parse a vCard document into contact entities.
  List<ContactEntity> parseVCard(String content) {
    final contacts = <ContactEntity>[];
    final blocks = content.split(RegExp(r'BEGIN:VCARD', caseSensitive: false));
    for (final block in blocks) {
      if (!block.toUpperCase().contains('END:VCARD')) continue;

      String? fn;
      String? n;
      final emails = <String>[];
      final phones = <String>[];
      String? org;
      String? title;
      String? notes;

      for (final rawLine in block.split('\n')) {
        final line = rawLine.trim();
        if (line.isEmpty) continue;
        final upper = line.toUpperCase();
        if (upper.startsWith('FN:')) {
          fn = line.substring(3).trim();
        } else if (upper.startsWith('N:')) {
          n = line.substring(2).trim();
        } else if (upper.startsWith('EMAIL')) {
          final idx = line.indexOf(':');
          if (idx >= 0) emails.add(_unescape(line.substring(idx + 1).trim()));
        } else if (upper.startsWith('TEL')) {
          final idx = line.indexOf(':');
          if (idx >= 0) phones.add(_unescape(line.substring(idx + 1).trim()));
        } else if (upper.startsWith('ORG:')) {
          org = line.substring(4).trim();
        } else if (upper.startsWith('TITLE:')) {
          title = line.substring(6).trim();
        } else if (upper.startsWith('NOTE:')) {
          notes = line.substring(5).trim();
        }
      }

      final displayName =
          fn ?? _nameFromN(n) ?? (emails.isNotEmpty ? emails.first : '联系人');
      contacts.add(ContactEntity(
        displayName: displayName,
        emailAddresses: emails.join(','),
        phoneNumbers: phones.join(','),
        organization: org,
        jobTitle: title,
        notes: notes,
      ));
    }
    return contacts;
  }

  List<String> _split(String value) {
    if (value.isEmpty) return const [];
    return value
        .split(RegExp(r'[,\n]'))
        .map((s) => s.trim())
        .where((s) => s.isNotEmpty)
        .toList();
  }

  String _escape(String value) =>
      value.replaceAll('\n', '\\n').replaceAll(',', '\\,').replaceAll(';', '\\;');

  String _unescape(String value) =>
      value.replaceAll('\\n', '\n').replaceAll('\\,', ',').replaceAll('\\;', ';');

  String? _nameFromN(String? n) {
    if (n == null || n.isEmpty) return null;
    final parts = n.split(';');
    final last = parts.isNotEmpty ? parts[0].trim() : '';
    final first = parts.length > 1 ? parts[1].trim() : '';
    final full = [first, last].where((s) => s.isNotEmpty).join(' ');
    return full.isNotEmpty ? full : null;
  }
}
