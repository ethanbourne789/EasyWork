import '../../core/event/app_event.dart';

class ExerciseCompletedEvent extends AppEvent {
  final String exerciseType;
  final int durationMinutes;
  final double? distanceKm;

  ExerciseCompletedEvent({
    required this.exerciseType,
    required this.durationMinutes,
    this.distanceKm,
  }) : super(moduleName: 'exercise');
}
