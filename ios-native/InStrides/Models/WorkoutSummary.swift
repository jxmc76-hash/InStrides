import Foundation

/// A HealthKit workout, flattened into a plain value type so the rest of the app
/// (and the unit tests) never need to touch HealthKit objects directly.
struct WorkoutSummary: Identifiable, Hashable, Sendable {
    let id: UUID
    let kind: ActivityKind
    let start: Date
    let end: Date
    /// Moving time in seconds, as reported by HealthKit (excludes pauses).
    let duration: TimeInterval
    let distanceMeters: Double?
    let activeEnergyKcal: Double?
    let averageHeartRate: Double?
    let maxHeartRate: Double?
    let elevationGainMeters: Double?
    let sourceName: String
    let isIndoor: Bool?

    var hasDistance: Bool {
        guard let distanceMeters else { return false }
        return distanceMeters > 0
    }
}

struct HeartRateSample: Hashable, Sendable {
    let date: Date
    let bpm: Double
}

struct RoutePoint: Hashable, Sendable {
    let latitude: Double
    let longitude: Double
}

/// One value per calendar day, e.g. resting heart rate or step count.
struct DailyValue: Identifiable, Hashable, Sendable {
    let date: Date
    let value: Double

    var id: Date { date }
}

enum BiologicalSex: String, Sendable {
    case female
    case male
    case unspecified
}

struct AthleteProfile: Equatable, Sendable {
    var age: Int?
    var sex: BiologicalSex = .unspecified
}
