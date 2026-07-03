import 'app_exception.dart';

sealed class Result<T> {
  const Result();

  Result<R> map<R>(R Function(T) transform, AppException Function(AppException) onError) {
    return switch (this) {
      Success<T> success => Success(transform(success.data)),
      Failure<T> failure => Failure(onError(failure.error)),
    };
  }

  R fold<R>(R Function(T) onSuccess, R Function(AppException) onFailure) {
    return switch (this) {
      Success<T> success => onSuccess(success.data),
      Failure<T> failure => onFailure(failure.error),
    };
  }

  void when(void Function(T) onSuccess, void Function(AppException) onFailure) {
    switch (this) {
      case Success<T> success:
        onSuccess(success.data);
      case Failure<T> failure:
        onFailure(failure.error);
    }
  }

  T getOrElse(T Function(AppException) onError) {
    return switch (this) {
      Success<T> success => success.data,
      Failure<T> failure => onError(failure.error),
    };
  }
}

final class Success<T> extends Result<T> {
  final T data;
  const Success(this.data);

  @override
  String toString() => 'Success($data)';
}

final class Failure<T> extends Result<T> {
  final AppException error;
  const Failure(this.error);

  @override
  String toString() => 'Failure(${error.userMessage})';
}
