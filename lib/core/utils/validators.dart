class Validators {
  static String? email(String? value) {
    if (value == null || value.isEmpty) return '请输入邮箱地址';
    final regex = RegExp(r'^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$');
    if (!regex.hasMatch(value)) return '请输入有效的邮箱地址';
    return null;
  }

  static String? password(String? value) {
    if (value == null || value.isEmpty) return '请输入密码';
    if (value.length < 6) return '密码至少6位';
    return null;
  }

  static String? imapHost(String? value) {
    if (value == null || value.isEmpty) return '请输入IMAP服务器地址';
    return null;
  }

  static String? port(String? value) {
    if (value == null || value.isEmpty) return '请输入端口号';
    final port = int.tryParse(value);
    if (port == null || port < 1 || port > 65535) return '端口号范围1-65535';
    return null;
  }

  static String? required(String? value, String fieldName) {
    if (value == null || value.isEmpty) return '请输入$fieldName';
    return null;
  }
}
