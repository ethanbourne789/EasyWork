import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'database_providers.dart';
import 'event_providers.dart';

final emailRepositoryProvider = Provider<EmailRepository>((ref) {
  return EmailRepositoryImpl(
    ref.watch(emailsDaoProvider).requireValue,
    ref.watch(emailAccountsDaoProvider).requireValue,
    ref.watch(eventBusProvider),
  );
});

final taskRepositoryProvider = Provider<TaskRepository>((ref) {
  return TaskRepositoryImpl(
    ref.watch(tasksDaoProvider).requireValue,
    ref.watch(eventBusProvider),
  );
});

final contactRepositoryProvider = Provider<ContactRepository>((ref) {
  return ContactRepositoryImpl(
    ref.watch(contactsDaoProvider).requireValue,
  );
});

final noteRepositoryProvider = Provider<NoteRepository>((ref) {
  return NoteRepositoryImpl(
    ref.watch(notesDaoProvider).requireValue,
    ref.watch(eventBusProvider),
  );
});

final accountingRepositoryProvider = Provider<AccountingRepository>((ref) {
  return AccountingRepositoryImpl(
    ref.watch(accountingRecordsDaoProvider).requireValue,
    ref.watch(accountingCategoriesDaoProvider).requireValue,
    ref.watch(eventBusProvider),
  );
});

final exerciseRepositoryProvider = Provider<ExerciseRepository>((ref) {
  return ExerciseRepositoryImpl(
    ref.watch(exerciseRecordsDaoProvider).requireValue,
    ref.watch(eventBusProvider),
  );
});

final stockRepositoryProvider = Provider<StockRepository>((ref) {
  return StockRepositoryImpl(
    ref.watch(stocksDaoProvider).requireValue,
  );
});

// Placeholder repository interfaces and implementations
abstract class EmailRepository {}
abstract class TaskRepository {}
abstract class ContactRepository {}
abstract class NoteRepository {}
abstract class AccountingRepository {}
abstract class ExerciseRepository {}
abstract class StockRepository {}

class EmailRepositoryImpl implements EmailRepository {
  final dynamic emailsDao;
  final dynamic emailAccountsDao;
  final dynamic eventBus;
  EmailRepositoryImpl(this.emailsDao, this.emailAccountsDao, this.eventBus);
}

class TaskRepositoryImpl implements TaskRepository {
  final dynamic tasksDao;
  final dynamic eventBus;
  TaskRepositoryImpl(this.tasksDao, this.eventBus);
}

class ContactRepositoryImpl implements ContactRepository {
  final dynamic contactsDao;
  ContactRepositoryImpl(this.contactsDao);
}

class NoteRepositoryImpl implements NoteRepository {
  final dynamic notesDao;
  final dynamic eventBus;
  NoteRepositoryImpl(this.notesDao, this.eventBus);
}

class AccountingRepositoryImpl implements AccountingRepository {
  final dynamic accountingRecordsDao;
  final dynamic accountingCategoriesDao;
  final dynamic eventBus;
  AccountingRepositoryImpl(this.accountingRecordsDao, this.accountingCategoriesDao, this.eventBus);
}

class ExerciseRepositoryImpl implements ExerciseRepository {
  final dynamic exerciseRecordsDao;
  final dynamic eventBus;
  ExerciseRepositoryImpl(this.exerciseRecordsDao, this.eventBus);
}

class StockRepositoryImpl implements StockRepository {
  final dynamic stocksDao;
  StockRepositoryImpl(this.stocksDao);
}
