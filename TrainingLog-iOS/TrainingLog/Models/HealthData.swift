import Foundation
import HealthKit

struct HealthWorkout: Identifiable, Sendable {
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
        self.calories = hkWorkout.totalEnergyBurned?.doubleValue(for: .kilocalorie())
        let name = hkWorkout.sourceRevision.source.name
        self.sourceName = name == "Health" ? nil : name
    }
}

struct DailySleepData: Sendable {
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

struct DailyHealthData: Identifiable, Sendable {
    let date: Date
    let workouts: [HealthWorkout]
    let sleep: DailySleepData?
    let weight: Double?             // kg
    let vo2Max: Double?             // mL/kg/min

    var id: Date { date }

    func workouts(for type: WorkoutType) -> [HealthWorkout] {
        workouts.filter { $0.type == type }
    }

    func totalDuration(for type: WorkoutType) -> Int {
        workouts(for: type).reduce(0) { $0 + $1.durationMinutes }
    }
}
