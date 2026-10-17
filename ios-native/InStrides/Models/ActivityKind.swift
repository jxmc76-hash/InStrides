import SwiftUI

/// The app's own activity categories. HealthKit has ~80 workout types; we fold them into
/// a handful of buckets that are useful for training analysis.
enum ActivityKind: String, CaseIterable, Codable, Identifiable, Hashable, Sendable {
    case run
    case walk
    case hike
    case cycle
    case swim
    case row
    case strength
    case hiit
    case crossTraining
    case elliptical
    case mobility
    case other

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .run: "Run"
        case .walk: "Walk"
        case .hike: "Hike"
        case .cycle: "Ride"
        case .swim: "Swim"
        case .row: "Row"
        case .strength: "Strength"
        case .hiit: "HIIT"
        case .crossTraining: "Cross Training"
        case .elliptical: "Elliptical"
        case .mobility: "Yoga & Mobility"
        case .other: "Other"
        }
    }

    var symbolName: String {
        switch self {
        case .run: "figure.run"
        case .walk: "figure.walk"
        case .hike: "figure.hiking"
        case .cycle: "figure.outdoor.cycle"
        case .swim: "figure.pool.swim"
        case .row: "figure.rower"
        case .strength: "dumbbell.fill"
        case .hiit: "figure.highintensity.intervaltraining"
        case .crossTraining: "figure.cross.training"
        case .elliptical: "figure.elliptical"
        case .mobility: "figure.yoga"
        case .other: "figure.mixed.cardio"
        }
    }

    var color: Color {
        switch self {
        case .run: .brand
        case .walk: .yellow
        case .hike: .brown
        case .cycle: .blue
        case .swim: .cyan
        case .row: .teal
        case .strength: .purple
        case .hiit: .red
        case .crossTraining: .pink
        case .elliptical: .indigo
        case .mobility: .mint
        case .other: .gray
        }
    }

    /// Whether distance and pace are meaningful for this activity.
    var tracksDistance: Bool {
        switch self {
        case .run, .walk, .hike, .cycle, .swim, .row: true
        default: false
        }
    }

    /// Approximate training impulse (TRIMP) per minute, used when a workout has no heart-rate
    /// data. Calibrated against Banister TRIMP at typical intensities for each activity.
    var fallbackLoadPerMinute: Double {
        switch self {
        case .run: 1.8
        case .walk: 0.6
        case .hike: 1.0
        case .cycle: 1.4
        case .swim: 1.6
        case .row: 1.6
        case .strength: 1.0
        case .hiit: 2.2
        case .crossTraining: 1.6
        case .elliptical: 1.4
        case .mobility: 0.5
        case .other: 1.0
        }
    }
}
