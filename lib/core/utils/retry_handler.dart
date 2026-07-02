import '../errors/app_exception.dart';

class RetryHandler {
  static Future<T> retry<T>({
    required Future<T> Function() action,
    int maxRetries = 3,
    Duration baseDelay = const Duration(seconds: 1),
    Set<Type> retryableExceptions = const {NetworkException},
  }) async {
    int attempt = 0;
    while (true) {
      try {
        return await action();
      } on AppException catch (e) {
        if (!retryableExceptions.contains(e.runtimeType)) rethrow;
        attempt++;
        if (attempt >= maxRetries) rethrow;
        await Future<void>.delayed(baseDelay * (1 << attempt));
      }
    }
  }
}
