import Foundation
import Observation

/// Loads data from the health provider and derives everything the views display.
@MainActor
@Observable
final class TrainingStore {
    enum Phase: Equatable {
        case idle
        case loading
        case loaded
        case failed(String)
    }

    /// Workouts are loaded further back than we display so the 42-day fitness average is warmed up.
    static let historyDays = 180
    static let displayDays = 90

    let settings: UserSettings
    private(set) var phase: Phase = .idle
    private(set) var needsAuthorization = false
    private(set) var workouts: [WorkoutSummary] = []
    private(set) var metrics: [HealthMetric: [DailyValue]] = [:]
    private(set) var sleep: [DailyValue] = []
    private(set) var profile = AthleteProfile()
    private(set) var lastUpdated: Date?

    private var provider: any HealthDataProvider
    @ObservationIgnored private var refreshQueued = false
    let calendar = Calendar.current

    init(settings: UserSettings, provider: (any HealthDataProvider)? = nil) {
        self.settings = settings
        self.provider = provider ?? Self.makeProvider(useSampleData: settings.useSampleData)
    }

    var isUsingSampleData: Bool { provider is SampleDataProvider }

    private static func makeProvider(useSampleData: Bool) -> any HealthDataProvider {
        useSampleData ? SampleDataProvider() : HealthKitService()
    }

    // MARK: Lifecycle

    func start() async {
        needsAuthorization = await provider.authorizationNeeded()
        guard !needsAuthorization else { return }
        provider.startObservingWorkouts { [weak self] in
            Task { @MainActor in await self?.refresh() }
        }
        await refresh()
    }

    func requestAuthorization() async {
        do {
            try await provider.requestAuthorization()
            await start()
        } catch {
            phase = .failed(error.localizedDescription)
        }
    }

    func setUseSampleData(_ enabled: Bool) async {
        settings.useSampleData = enabled
        provider = Self.makeProvider(useSampleData: enabled)
        workouts = []
        metrics = [:]
        sleep = []
        await start()
    }

    func refresh() async {
        // Coalesce overlapping requests (pull-to-refresh racing a HealthKit observer update).
        guard phase != .loading else {
            refreshQueued = true
            return
        }
        repeat {
            phase = .loading
            refreshQueued = false
            await load()
        } while refreshQueued
    }

    private func load() async {
        let now = Date.now
        let workoutStart = calendar.date(byAdding: .day, value: -Self.historyDays, to: now) ?? now
        let metricStart = calendar.date(byAdding: .day, value: -Self.displayDays, to: now) ?? now
        let provider = provider

        do {
            async let workouts = provider.workouts(since: workoutStart)
            async let sleep = provider.sleepHours(since: metricStart)
            async let profile = provider.athleteProfile()

            var metrics: [HealthMetric: [DailyValue]] = [:]
            for metric in HealthMetric.allCases {
                // A metric the user declined (or never recorded) shouldn't fail the whole load.
                metrics[metric] = (try? await provider.dailyValues(for: metric, since: metricStart)) ?? []
            }

            self.workouts = try await workouts
            self.sleep = (try? await sleep) ?? []
            self.profile = await profile
            self.metrics = metrics
            lastUpdated = .now
            phase = .loaded
        } catch {
            phase = .failed(error.localizedDescription)
        }
    }

    // MARK: Derived data

    var estimatedMaxHeartRate: Double? {
        profile.age.map(HeartRateZones.estimatedMaxHeartRate(age:))
    }

    var maxHeartRate: Double {
        if settings.maxHeartRateOverride > 0 { return Double(settings.maxHeartRateOverride) }
        return estimatedMaxHeartRate ?? 190
    }

    var restingHeartRate: Double {
        if settings.restingHeartRateOverride > 0 { return Double(settings.restingHeartRateOverride) }
        return baseline(for: .restingHeartRate)?.baseline ?? 60
    }

    var zones: HeartRateZones { HeartRateZones(maxHeartRate: maxHeartRate) }

    var loadCalculator: TrainingLoadCalculator {
        TrainingLoadCalculator(maxHeartRate: maxHeartRate, restingHeartRate: restingHeartRate, sex: profile.sex)
    }

    /// The fitness/fatigue series for the display window (computed from the full history).
    var trainingLoad: [TrainingLoadPoint] {
        let now = Date.now
        guard let historyStart = calendar.date(byAdding: .day, value: -Self.historyDays, to: now),
              let displayStart = calendar.date(byAdding: .day, value: -Self.displayDays, to: now)
        else { return [] }
        return loadCalculator
            .series(workouts, from: historyStart, through: now, calendar: calendar)
            .filter { $0.date >= displayStart }
    }

    func weeklySummaries(weeks: Int) -> [WeeklySummary] {
        let calculator = loadCalculator
        return WeeklySummaryBuilder.build(workouts, weeks: weeks, endingAt: .now, calendar: calendar, load: calculator.trimp(for:))
    }

    func values(for metric: HealthMetric) -> [DailyValue] {
        metrics[metric] ?? []
    }

    func latest(_ metric: HealthMetric) -> DailyValue? {
        values(for: metric).last
    }

    func baseline(for metric: HealthMetric) -> Baseline? {
        Baseline.compute(values(for: metric), now: .now, calendar: calendar)
    }

    var sleepBaseline: Baseline? {
        Baseline.compute(sleep, now: .now, calendar: calendar)
    }

    var recentWorkouts: [WorkoutSummary] {
        Array(workouts.prefix(5))
    }

    // MARK: Workout details

    /// Heart-rate samples recorded during a workout; empty if none or not permitted.
    func heartRateSamples(for workout: WorkoutSummary) async -> [HeartRateSample] {
        (try? await provider.heartRateSamples(for: workout)) ?? []
    }

    /// GPS route for an outdoor workout; empty for indoor workouts or when not permitted.
    func route(for workout: WorkoutSummary) async -> [RoutePoint] {
        (try? await provider.route(for: workout)) ?? []
    }
}

extension TrainingStore {
    /// A store backed by sample data, for SwiftUI previews.
    static func preview() -> TrainingStore {
        let defaults = UserDefaults(suiteName: "preview") ?? .standard
        return TrainingStore(settings: UserSettings(defaults: defaults), provider: SampleDataProvider())
    }
}
