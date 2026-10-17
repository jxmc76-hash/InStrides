import Foundation

/// Generates a believable six months of training so the app is explorable in the Simulator
/// (which has no Health data) and in SwiftUI previews. Output is deterministic for a given day.
struct SampleDataProvider: HealthDataProvider {
    private var calendar: Calendar { .current }

    func authorizationNeeded() async -> Bool { false }
    func requestAuthorization() async throws {}
    func startObservingWorkouts(_ onChange: @escaping @Sendable () -> Void) {}

    func athleteProfile() async -> AthleteProfile {
        AthleteProfile(age: 34, sex: .unspecified)
    }

    func workouts(since start: Date) async throws -> [WorkoutSummary] {
        Self.generateWorkouts(since: start, calendar: calendar)
    }

    static func generateWorkouts(since start: Date, now: Date = .now, calendar: Calendar = .current) -> [WorkoutSummary] {
        let today = calendar.startOfDay(for: now)
        let totalDays = calendar.dateComponents([.day], from: calendar.startOfDay(for: start), to: today).day ?? 0
        var workouts: [WorkoutSummary] = []

        for offset in 0...max(totalDays, 0) {
            guard let day = calendar.date(byAdding: .day, value: -offset, to: today) else { continue }
            var rng = SeededGenerator(seed: UInt64(day.timeIntervalSince1970))
            // Occasionally skip a session, like real life.
            guard Double.random(in: 0...1, using: &rng) > 0.12 else { continue }
            // Gentle progression: volume grows as we approach today.
            let progression = 1 + 0.25 * (1 - Double(offset) / Double(max(totalDays, 1)))

            let plan: (kind: ActivityKind, minutes: Double, hour: Int, intensity: Double)?
            switch calendar.component(.weekday, from: day) {
            case 1: plan = (.cycle, 70, 9, 0.62)
            case 2: plan = (.mobility, 30, 7, 0.35)
            case 3: plan = (.run, 50, 18, 0.80)
            case 4: plan = (.strength, 45, 7, 0.60)
            case 5: plan = (.run, 40, 18, 0.68)
            case 7: plan = (.run, 85, 8, 0.70)
            default: plan = nil
            }
            guard let plan,
                  let startDate = calendar.date(bySettingHour: plan.hour, minute: Int.random(in: 0..<45, using: &rng), second: 0, of: day),
                  startDate < now
            else { continue }

            let kind = plan.kind
            let intensity = plan.intensity
            let minutes = plan.minutes * (kind == .run || kind == .cycle ? progression : 1) * Double.random(in: 0.9...1.1, using: &rng)
            let duration = minutes * 60
            let averageHR = 70 + 120 * intensity + Double.random(in: -4...4, using: &rng)
            let distance: Double? = switch kind {
            case .run: duration / Double.random(in: 315...345, using: &rng) * 1000
            case .cycle: duration * Double.random(in: 7.2...8.2, using: &rng)
            default: nil
            }

            workouts.append(WorkoutSummary(
                id: UUID(seed: &rng),
                kind: kind,
                start: startDate,
                end: startDate.addingTimeInterval(duration),
                duration: duration,
                distanceMeters: distance,
                activeEnergyKcal: minutes * (4 + 8 * intensity),
                averageHeartRate: averageHR.rounded(),
                maxHeartRate: (averageHR + 14 + Double.random(in: 0...8, using: &rng)).rounded(),
                elevationGainMeters: distance.map { $0 / 1000 * Double.random(in: 4...12, using: &rng) },
                sourceName: "Sample Data",
                isIndoor: kind == .strength || kind == .mobility
            ))
        }
        return workouts.sorted { $0.start > $1.start }
    }

    func dailyValues(for metric: HealthMetric, since start: Date) async throws -> [DailyValue] {
        days(since: start).compactMap { day, offset in
            var rng = SeededGenerator(seed: UInt64(day.timeIntervalSince1970) &+ UInt64(metric.rawValue.count))
            let noise = Double.random(in: -1...1, using: &rng)
            let trend = Double(offset) / 180 // 0 today → 1 six months ago
            let value: Double? = switch metric {
            case .restingHeartRate: 51 + 4 * trend + 2 * noise
            case .heartRateVariability: 62 - 8 * trend + 9 * noise
            // VO₂ max is only estimated after outdoor runs, so it's sparse.
            case .vo2Max: offset % 4 == 0 ? 49.5 - 2.5 * trend + 0.4 * noise : nil
            case .steps: 9_500 + 3_000 * noise
            case .activeEnergy: 620 + 160 * noise
            }
            return value.map { DailyValue(date: day, value: $0) }
        }
    }

    func sleepHours(since start: Date) async throws -> [DailyValue] {
        days(since: start).map { day, _ in
            var rng = SeededGenerator(seed: UInt64(day.timeIntervalSince1970) &+ 99)
            return DailyValue(date: day, value: 7.2 + Double.random(in: -0.9...0.8, using: &rng))
        }
    }

    func heartRateSamples(for workout: WorkoutSummary) async throws -> [HeartRateSample] {
        var rng = SeededGenerator(seed: UInt64(workout.start.timeIntervalSince1970))
        let average = workout.averageHeartRate ?? 140
        let interval: TimeInterval = 5
        let count = Int(workout.duration / interval)
        let warmUp = 0.12
        return (0..<count).map { index in
            let progress = Double(index) / Double(max(count, 1))
            let ramp = progress < warmUp ? 0.82 + 0.18 * progress / warmUp : 1
            let intervals = workout.kind == .run && workout.duration < 3_300 ? 10 * sin(progress * .pi * 12) : 0
            let bpm = average * ramp + intervals + 3 * sin(progress * .pi * 3) + Double.random(in: -2...2, using: &rng)
            return HeartRateSample(date: workout.start.addingTimeInterval(Double(index) * interval), bpm: bpm)
        }
    }

    func route(for workout: WorkoutSummary) async throws -> [RoutePoint] {
        guard workout.kind == .run || workout.kind == .cycle, let distance = workout.distanceMeters else { return [] }
        // A wobbly loop around Battersea Park, scaled to the workout's distance.
        let center = (latitude: 51.4791, longitude: -0.1580)
        let radius = distance / (2 * .pi) / 111_000
        var rng = SeededGenerator(seed: UInt64(workout.start.timeIntervalSince1970))
        let phase = Double.random(in: 0...(2 * .pi), using: &rng)
        return (0...200).map { index in
            let angle = Double(index) / 200 * 2 * .pi
            let wobble = 1 + 0.18 * sin(angle * 5 + phase)
            return RoutePoint(
                latitude: center.latitude + radius * wobble * sin(angle),
                longitude: center.longitude + radius * wobble * cos(angle) / cos(center.latitude * .pi / 180)
            )
        }
    }

    private func days(since start: Date) -> [(Date, Int)] {
        let today = calendar.startOfDay(for: .now)
        let total = calendar.dateComponents([.day], from: calendar.startOfDay(for: start), to: today).day ?? 0
        return (0...max(total, 0)).reversed().compactMap { offset in
            calendar.date(byAdding: .day, value: -offset, to: today).map { ($0, offset) }
        }
    }
}

/// SplitMix64: tiny, fast and deterministic, which is all demo data needs.
struct SeededGenerator: RandomNumberGenerator {
    private var state: UInt64

    init(seed: UInt64) {
        state = seed
    }

    mutating func next() -> UInt64 {
        state &+= 0x9E37_79B9_7F4A_7C15
        var z = state
        z = (z ^ (z >> 30)) &* 0xBF58_476D_1CE4_E5B9
        z = (z ^ (z >> 27)) &* 0x94D0_49BB_1331_11EB
        return z ^ (z >> 31)
    }
}

private extension UUID {
    init(seed rng: inout SeededGenerator) {
        let a = rng.next()
        let b = rng.next()
        let bytes = withUnsafeBytes(of: (a, b)) { Array($0) }
        self = UUID(uuid: (
            bytes[0], bytes[1], bytes[2], bytes[3], bytes[4], bytes[5], bytes[6], bytes[7],
            bytes[8], bytes[9], bytes[10], bytes[11], bytes[12], bytes[13], bytes[14], bytes[15]
        ))
    }
}
