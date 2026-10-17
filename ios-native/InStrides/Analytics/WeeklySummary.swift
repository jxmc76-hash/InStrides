import Foundation

struct WeeklySummary: Identifiable, Hashable, Sendable {
    let weekStart: Date
    var workoutCount = 0
    var duration: TimeInterval = 0
    var distanceMeters: Double = 0
    var energyKcal: Double = 0
    var load: Double = 0
    var durationByKind: [ActivityKind: TimeInterval] = [:]

    var id: Date { weekStart }
}

enum WeeklySummaryBuilder {
    /// The last `weeks` calendar weeks ending with the week containing `date`, oldest first.
    /// Weeks without workouts are included so charts show gaps honestly.
    static func build(
        _ workouts: [WorkoutSummary],
        weeks: Int,
        endingAt date: Date,
        calendar: Calendar,
        load: (WorkoutSummary) -> Double
    ) -> [WeeklySummary] {
        guard weeks > 0, let currentWeek = calendar.dateInterval(of: .weekOfYear, for: date)?.start else { return [] }
        let starts = (0..<weeks).reversed().compactMap {
            calendar.date(byAdding: .weekOfYear, value: -$0, to: currentWeek)
        }
        var summaries = Dictionary(uniqueKeysWithValues: starts.map { ($0, WeeklySummary(weekStart: $0)) })
        for workout in workouts {
            guard let week = calendar.dateInterval(of: .weekOfYear, for: workout.start)?.start,
                  var summary = summaries[week] else { continue }
            summary.workoutCount += 1
            summary.duration += workout.duration
            summary.distanceMeters += workout.distanceMeters ?? 0
            summary.energyKcal += workout.activeEnergyKcal ?? 0
            summary.load += load(workout)
            summary.durationByKind[workout.kind, default: 0] += workout.duration
            summaries[week] = summary
        }
        return starts.compactMap { summaries[$0] }
    }
}
