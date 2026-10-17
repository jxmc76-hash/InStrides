import Foundation

/// Everything the app reads about the athlete. `HealthKitService` reads from the Health app;
/// `SampleDataProvider` generates realistic demo data for the Simulator and SwiftUI previews.
protocol HealthDataProvider: Sendable {
    /// True when the user hasn't yet been asked for permission to read health data.
    func authorizationNeeded() async -> Bool
    func requestAuthorization() async throws

    func workouts(since start: Date) async throws -> [WorkoutSummary]
    func dailyValues(for metric: HealthMetric, since start: Date) async throws -> [DailyValue]
    /// Hours asleep per night.
    func sleepHours(since start: Date) async throws -> [DailyValue]
    func athleteProfile() async -> AthleteProfile

    func heartRateSamples(for workout: WorkoutSummary) async throws -> [HeartRateSample]
    func route(for workout: WorkoutSummary) async throws -> [RoutePoint]

    /// Calls `onChange` whenever new workouts are saved to Health, including in the background.
    func startObservingWorkouts(_ onChange: @escaping @Sendable () -> Void)
}

enum HealthDataError: LocalizedError {
    case unavailable

    var errorDescription: String? {
        switch self {
        case .unavailable: "Health data isn't available on this device."
        }
    }
}
