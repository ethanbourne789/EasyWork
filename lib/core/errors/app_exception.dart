abstract class AppException implements Exception {
  String get userMessage;
  String? get technical;
}

class NetworkException extends AppException {
  final String _userMessage;
  final String? _technical;

  NetworkException({String? userMessage, String? technical})
      : _userMessage = userMessage ?? '网络连接失败',
        _technical = technical;

  @override
  String get userMessage => _userMessage;

  @override
  String? get technical => _technical;
}

enum EmailErrorType {
  authFailed,
  connectionFailed,
  timeout,
  sslError,
  smtpAuthFailed,
  sendFailed,
}

class EmailException extends AppException {
  final EmailErrorType type;
  final String? _userMessage;
  final String? _technical;

  EmailException({required this.type, String? userMessage, String? technical})
      : _userMessage = userMessage,
        _technical = technical;

  @override
  String get userMessage => _userMessage ?? _defaultMessage(type);

  @override
  String? get technical => _technical ?? type.name;

  static String _defaultMessage(EmailErrorType type) {
    switch (type) {
      case EmailErrorType.authFailed:
        return '邮箱地址或密码错误，请检查后重试';
      case EmailErrorType.connectionFailed:
        return '无法连接到邮件服务器，请检查网络和服务器地址';
      case EmailErrorType.timeout:
        return '连接超时，请检查网络状态';
      case EmailErrorType.sslError:
        return 'SSL 证书验证失败，可能需要使用非标准端口';
      case EmailErrorType.smtpAuthFailed:
        return '发送失败：邮箱认证错误';
      case EmailErrorType.sendFailed:
        return '发送失败：无法连接邮件服务器';
    }
  }
}

class DatabaseException extends AppException {
  final String _userMessage;
  final String? _technical;

  DatabaseException({String? userMessage, String? technical})
      : _userMessage = userMessage ?? '数据库操作失败',
        _technical = technical;

  @override
  String get userMessage => _userMessage;

  @override
  String? get technical => _technical;
}

class ValidationException extends AppException {
  final String field;
  final String _userMessage;
  final String? _technical;

  ValidationException({required this.field, String? userMessage, String? technical})
      : _userMessage = userMessage ?? '输入验证失败',
        _technical = technical;

  @override
  String get userMessage => _userMessage;

  @override
  String? get technical => _technical;
}
