import SwiftUI

/// Daily health metrics read from HealthKit that feed the recovery and trends views.
enum HealthMetric: String, CaseIterable, Identifiable, Sendable {
    case restingHeartRate
    case heartRateVariability
    case vo2Max
    case steps
    case activeEnergy

    var id: String { rawValue }

    var title: String {
        switch self {
        case .restingHeartRate: "Resting HR"
        case .heartRateVariability: "HRV"
        case .vo2Max: "VO₂ max"
        case .steps: "Steps"
        case .activeEnergy: "Active Energy"
        }
    }

    var unitLabel: String {
        switch self {
        case .restingHeartRate: "bpm"
        case .heartRateVariability: "ms"
        case .vo2Max: "ml/kg/min"
        case .steps: "steps"
        case .activeEnergy: "kcal"
        }
    }

    var symbolName: String {
        switch self {
        case .restingHeartRate: "heart.fill"
        case .heartRateVariability: "waveform.path.ecg"
        case .vo2Max: "lungs.fill"
        case .steps: "figure.walk"
        case .activeEnergy: "flame.fill"
        }
    }

    var color: Color {
        switch self {
        case .restingHeartRate: .red
        case .heartRateVariability: .purple
        case .vo2Max: .green
        case .steps: .orange
        case .activeEnergy: .pink
        }
    }

    /// Summed per day (steps) rather than averaged (heart rate).
    var isCumulative: Bool {
        self == .steps || self == .activeEnergy
    }

    var higherIsBetter: Bool {
        self != .restingHeartRate
    }

    var fractionDigits: Int {
        self == .vo2Max ? 1 : 0
    }

    func format(_ value: Double) -> String {
        value.formatted(.number.precision(.fractionLength(fractionDigits)))
    }
}
