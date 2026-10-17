import SwiftUI

struct HeartRateZone: Identifiable, Hashable, Sendable {
    let number: Int
    let lowerBound: Double
    let upperBound: Double

    var id: Int { number }

    var name: String {
        switch number {
        case 1: "Recovery"
        case 2: "Endurance"
        case 3: "Tempo"
        case 4: "Threshold"
        default: "VO₂ max"
        }
    }

    var color: Color {
        switch number {
        case 1: .gray
        case 2: .blue
        case 3: .green
        case 4: .orange
        default: .red
        }
    }
}

/// Five zones expressed as a percentage of max heart rate (50–60–70–80–90–100%).
struct HeartRateZones: Sendable {
    static let boundaries: [Double] = [0.5, 0.6, 0.7, 0.8, 0.9, 1.0]

    let maxHeartRate: Double

    var zones: [HeartRateZone] {
        (1..<Self.boundaries.count).map { index in
            HeartRateZone(
                number: index,
                lowerBound: (Self.boundaries[index - 1] * maxHeartRate).rounded(),
                upperBound: (Self.boundaries[index] * maxHeartRate).rounded()
            )
        }
    }

    /// The zone number (1–5) for a heart rate, or nil when below zone 1.
    func zoneNumber(for bpm: Double) -> Int? {
        let fraction = bpm / maxHeartRate
        guard fraction >= Self.boundaries[0] else { return nil }
        for index in 1..<Self.boundaries.count where fraction < Self.boundaries[index] {
            return index
        }
        return Self.boundaries.count - 1
    }

    /// Seconds spent in each zone. Each sample's heart rate is held until the next sample,
    /// capped at `maxGap` so that gaps in recording (pauses, lost signal) aren't counted.
    func timeInZones(_ samples: [HeartRateSample], maxGap: TimeInterval = 60) -> [Int: TimeInterval] {
        let sorted = samples.sorted { $0.date < $1.date }
        var result: [Int: TimeInterval] = [:]
        for (current, next) in zip(sorted, sorted.dropFirst()) {
            guard let zone = zoneNumber(for: current.bpm) else { continue }
            let gap = min(next.date.timeIntervalSince(current.date), maxGap)
            result[zone, default: 0] += max(gap, 0)
        }
        return result
    }

    /// Tanaka et al. (2001): 208 − 0.7 × age. More accurate than 220 − age for adults.
    static func estimatedMaxHeartRate(age: Int) -> Double {
        (208 - 0.7 * Double(age)).rounded()
    }
}
