import SwiftUI
import HealthKit

enum WorkoutType: String, CaseIterable, Identifiable, Codable {
    case run = "RUN"
    case yoga = "YOGA"
    case gym = "GYM"
    case swim = "SWIM"
    case sit = "SIT"
    case flexibility = "FLEX"

    var id: String { rawValue }

    var displayName: String { rawValue }

    var icon: String {
        switch self {
        case .run:         "figure.run"
        case .yoga:        "figure.yoga"
        case .gym:         "dumbbell"
        case .swim:        "figure.pool.swim"
        case .sit:         "brain.head.profile"
        case .flexibility: "figure.flexibility"
        }
    }

    var color: Color {
        switch self {
        case .run:         Color(hex: "#E8593A")
        case .yoga:        Color(hex: "#E8A23A")
        case .gym:         Color(hex: "#7C4DCA")
        case .swim:        Color(hex: "#2BB5C8")
        case .sit:         Color(hex: "#E85A5A")
        case .flexibility: Color(hex: "#4CAF50")
        }
    }

    var hkWorkoutActivityType: HKWorkoutActivityType {
        switch self {
        case .run:         .running
        case .yoga:        .yoga
        case .gym:         .traditionalStrengthTraining
        case .swim:        .swimming
        case .sit:         .mindAndBody
        case .flexibility: .flexibility
        }
    }

    static func from(hkType: HKWorkoutActivityType) -> WorkoutType? {
        // Map both traditional and functional strength training to gym
        if hkType == .functionalStrengthTraining { return .gym }
        return WorkoutType.allCases.first { $0.hkWorkoutActivityType == hkType }
    }
}

extension Color {
    init(hex: String) {
        let hex = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: hex).scanHexInt64(&int)
        let r = Double((int >> 16) & 0xFF) / 255
        let g = Double((int >> 8) & 0xFF) / 255
        let b = Double(int & 0xFF) / 255
        self.init(red: r, green: g, blue: b)
    }
}
