import 'package:enough_mail/enough_mail.dart';
import 'package:enough_mail_html/enough_mail_html.dart';

class EmailHtmlProcessor {
  static final _borderPropRe = RegExp(
    r'border(-top|-right|-bottom|-left)?\s*:\s*[^;]+;?',
    caseSensitive: false,
  );
  static final _attrBorderRe = RegExp(
    r'''\s+border\s*=\s*["'][^"']*["']''',
    caseSensitive: false,
  );

  /// Process HTML from a [MimeMessage] using enough_mail_html.
  /// Returns body HTML with: CID images inlined, scripts removed,
  /// width limits applied, word-wrap style added, table borders stripped.
  static String processHtml(MimeMessage message, {bool blockExternalImages = false, int? maxImageWidth}) {
    var html = message.transformToBodyInnerHtml(
      blockExternalImages: blockExternalImages,
      maxImageWidth: maxImageWidth,
    );
    html = _stripTableBorders(html);
    return html;
  }

  /// Process raw HTML string when no MimeMessage is available.
  /// Only table border stripping is applied.
  static String processRawHtml(String html) {
    return _stripTableBorders(html);
  }

  static String _stripTableBorders(String html) {
    var result = html.replaceAll(_borderPropRe, '');
    result = result.replaceAll(_attrBorderRe, '');
    return result;
  }
}
