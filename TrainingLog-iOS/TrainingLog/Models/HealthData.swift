import Foundation
import HealthKit
import SwiftData

struct HealthWorkout: Identifiable, Sendable, Codable {
    let id: UUID
    let type: WorkoutType
    let startDate: Date
    let duration: TimeInterval      // seconds
    let distance: Double?           // meters
    let calories: Double?
    let sourceName: String?

    var durationMinutes: Int { Int(duration / 60) }
    var distanceKm: Double? { distance.map { $0 / 1000 } }

    var avgPacePerKm: String? {
        guard let km = distanceKm, km > 0 else { return nil }
        let secsPerKm = duration / km
        let m = Int(secsPerKm) / 60
        let s = Int(secsPerKm) % 60
        return String(format: "%d:%02d /km", m, s)
    }

    init(from hkWorkout: HKWorkout, type: WorkoutType) {
        self.id = hkWorkout.uuid
        self.type = type
        self.startDate = hkWorkout.startDate
        self.duration = hkWorkout.duration
        self.distance = hkWorkout.totalDistance?.doubleValue(for: .meter())
        self.calories = hkWorkout.statistics(for: HKQuantityType(.activeEnergyBurned))?.sumQuantity()?.doubleValue(for: .kilocalorie())
        let name = hkWorkout.sourceRevision.source.name
        self.sourceName = name == "Health" ? nil : name
    }
}

struct DailySleepData: Sendable, Codable {
    let date: Date
    let totalMinutes: Double
    let bedtime: Date?
    let interruptions: Int

    var score: Int {
        let durationScore = min(50, Int((totalMinutes / 480) * 50))
        let bedtimeScore: Int = {
            guard let bt = bedtime else { return 0 }
            let h = Calendar.current.component(.hour, from: bt)
            let m = Calendar.current.component(.minute, from: bt)
            let totalMin = h * 60 + m
            // ideal 22:00–23:00 (1320–1380 min)
            if totalMin >= 1320 && totalMin <= 1380 { return 30 }
            let dist = min(abs(totalMin - 1320), abs(totalMin - 1380))
            return max(0, 30 - dist / 2)
        }()
        let interruptScore = max(0, 20 - interruptions * 4)
        return durationScore + bedtimeScore + interruptScore
    }
}

struct DailyHealthData: Identifiable, Sendable, Codable {
    let date: Date
    let workouts: [HealthWorkout]
    let sleep: DailySleepData?
    let weight: Double?             // kg
    let vo2Max: Double?             // mL/kg/min

    var id: Date { date }

    var hasData: Bool {
        !workouts.isEmpty || sleep != nil || weight != nil || vo2Max != nil
    }

    func workouts(for type: WorkoutType) -> [HealthWorkout] {
        workouts.filter { $0.type == type }
    }

    func totalDuration(for type: WorkoutType) -> Int {
        workouts(for: type).reduce(0) { $0 + $1.durationMinutes }
    }
}


// MARK: - iCloud copy of recent Health data

/// A copy of one day of Health data, saved by the iPhone to iCloud so devices without
/// Apple Health (Mac, iPad) can show the last 12 weeks. Follows CloudKit rules: every
/// property has a default value and there are no unique constraints.
@Model
final class HealthDaySnapshot {
    var dayKey: String = ""
    var date: Date = Date()
    var weight: Double? = nil
    var vo2Max: Double? = nil
    var sleepMinutes: Double? = nil
    var sleepBedtime: Date? = nil
    var sleepInterruptions: Int = 0
    var workoutsData: Data? = nil
    var updatedAt: Date = Date()

    init(dayKey: String, date: Date) {
        self.dayKey = dayKey
        self.date = date
    }

    static func key(for date: Date) -> String {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        return f.string(from: date)
    }

    /// Copies the day's values in. Returns true if anything changed.
    @discardableResult
    func update(from day: DailyHealthData, workoutsData newWorkouts: Data?) -> Bool {
        var changed = false
        if weight != day.weight { weight = day.weight; changed = true }
        if vo2Max != day.vo2Max { vo2Max = day.vo2Max; changed = true }
        if sleepMinutes != day.sleep?.totalMinutes { sleepMinutes = day.sleep?.totalMinutes; changed = true }
        if sleepBedtime != day.sleep?.bedtime { sleepBedtime = day.sleep?.bedtime; changed = true }
        let interruptions = day.sleep?.interruptions ?? 0
        if sleepInterruptions != interruptions { sleepInterruptions = interruptions; changed = true }
        if workoutsData != newWorkouts { workoutsData = newWorkouts; changed = true }
        if changed { updatedAt = Date() }
        return changed
    }

    func toDaily() -> DailyHealthData {
        let workouts = workoutsData.flatMap { try? JSONDecoder().decode([HealthWorkout].self, from: $0) } ?? []
        let sleep = sleepMinutes.map {
            DailySleepData(date: date, totalMinutes: $0, bedtime: sleepBedtime, interruptions: sleepInterruptions)
        }
        return DailyHealthData(date: date, workouts: workouts, sleep: sleep, weight: weight, vo2Max: vo2Max)
    }
}
