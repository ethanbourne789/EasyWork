import '../../core/event/app_event.dart';

class NoteUpdatedEvent extends AppEvent {
  final int noteId;
  final String? title;

  NoteUpdatedEvent({required this.noteId, this.title})
      : super(moduleName: 'notes');
}
