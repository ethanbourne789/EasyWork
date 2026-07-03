import 'dart:convert';
import 'package:enough_mail/enough_mail.dart';

class EmailHtmlProcessor {
  static final _cidAttrRe = RegExp(r'''(<img[^>]+src\s*=\s*["'])cid:([^"']+)["']''', caseSensitive: false);
  static final _cidHrefRe = RegExp(r'''(href\s*=\s*["'])cid:([^"']+)["']''', caseSensitive: false);
  static final _widthAttrRe = RegExp(r'''(<table[^>]+)\swidth\s*=\s*["']\d+["']''', caseSensitive: false);
  static final _styleWidthRe = RegExp(r'''(<table[^>]+style\s*=\s*["'][^"']*?)width\s*:\s*\d+px''', caseSensitive: false);

  static String processHtml(String html, MimeMessage message) {
    var result = _rewriteCidImages(html, message);
    result = _normalizeTableWidths(result);
    return result;
  }

  static String _rewriteCidImages(String html, MimeMessage message) {
    if (!html.contains('cid:')) return html;

    final parts = message.parts;
    if (parts == null || parts.isEmpty) return html;

    final cidMap = <String, String>{};
    for (final part in parts) {
      final contentId = part.decodeContentId();
      if (contentId != null && contentId.isNotEmpty) {
        try {
          final bytes = part.decodeContent();
          if (bytes != null && bytes.isNotEmpty) {
            final contentType = part.contentType?.mimeType ?? 'image/png';
            final base64Data = base64Encode(bytes);
            cidMap[contentId] = 'data:$contentType;base64,$base64Data';
          }
        } catch (_) {}
      }
    }

    if (cidMap.isEmpty) return html;

    var result = html.replaceAllMapped(_cidAttrRe, (match) {
      final prefix = match.group(1)!;
      final cid = match.group(2)!;
      final dataUri = cidMap[cid];
      if (dataUri != null) {
        return '$prefix$dataUri"';
      }
      return match.group(0)!;
    });

    result = result.replaceAllMapped(_cidHrefRe, (match) {
      final prefix = match.group(1)!;
      final cid = match.group(2)!;
      final dataUri = cidMap[cid];
      if (dataUri != null) {
        return '$prefix$dataUri"';
      }
      return match.group(0)!;
    });

    return result;
  }

  static String _normalizeTableWidths(String html) {
    var result = html.replaceAllMapped(_widthAttrRe, (match) {
      return '${match.group(1)} ';
    });

    result = result.replaceAllMapped(_styleWidthRe, (match) {
      return '${match.group(1)}width:100%';
    });

    return result;
  }
}
