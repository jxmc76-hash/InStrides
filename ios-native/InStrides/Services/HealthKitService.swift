import CoreLocation
import Foundation
import HealthKit

/// Reads workouts and health metrics from HealthKit. Read-only: the app never writes to Health.
final class HealthKitService: HealthDataProvider, @unchecked Sendable {
    private let store = HKHealthStore()
    private let lock = NSLock()
    private var observerQuery: HKObserverQuery?

    static var isAvailable: Bool { HKHealthStore.isHealthDataAvailable() }

    private static let bpm = HKUnit.count().unitDivided(by: .minute())

    /// Distance types a workout may carry; the first one with data wins.
    private static let distanceTypes: [HKQuantityTypeIdentifier] = [
        .distanceWalkingRunning, .distanceCycling, .distanceSwimming, .distanceDownhillSnowSports,
    ]

    private static var readTypes: Set<HKObjectType> {
        var types: Set<HKObjectType> = [
            HKObjectType.workoutType(),
            HKSeriesType.workoutRoute(),
            HKCategoryType(.sleepAnalysis),
            HKCharacteristicType(.dateOfBirth),
            HKCharacteristicType(.biologicalSex),
            HKQuantityType(.heartRate),
        ]
        for metric in HealthMetric.allCases {
            types.insert(HKQuantityType(metric.quantityIdentifier))
        }
        for identifier in distanceTypes {
            types.insert(HKQuantityType(identifier))
        }
        return types
    }

    // MARK: Authorization

    func authorizationNeeded() async -> Bool {
        guard Self.isAvailable else { return false }
        do {
            return try await store.statusForAuthorizationRequest(toShare: [], read: Self.readTypes) == .shouldRequest
        } catch {
            return true
        }
    }

    func requestAuthorization() async throws {
        guard Self.isAvailable else { throw HealthDataError.unavailable }
        try await store.requestAuthorization(toShare: [], read: Self.readTypes)
    }

    // MARK: Workouts

    func workouts(since start: Date) async throws -> [WorkoutSummary] {
        guard Self.isAvailable else { throw HealthDataError.unavailable }
        let descriptor = HKSampleQueryDescriptor(
            predicates: [.workout(HKQuery.predicateForSamples(withStart: start, end: nil))],
            sortDescriptors: [SortDescriptor(\.startDate, order: .reverse)]
        )
        return try await descriptor.result(for: store).map(Self.summary(from:))
    }

    private static func summary(from workout: HKWorkout) -> WorkoutSummary {
        let heartRate = workout.statistics(for: HKQuantityType(.heartRate))
        let distance = distanceTypes.lazy
            .compactMap { workout.statistics(for: HKQuantityType($0))?.sumQuantity()?.doubleValue(for: .meter()) }
            .first
        let energy = workout.statistics(for: HKQuantityType(.activeEnergyBurned))?
            .sumQuantity()?.doubleValue(for: .kilocalorie())
        let elevation = (workout.metadata?[HKMetadataKeyElevationAscended] as? HKQuantity)?.doubleValue(for: .meter())

        return WorkoutSummary(
            id: workout.uuid,
            kind: ActivityKind(workout.workoutActivityType),
            start: workout.startDate,
            end: workout.endDate,
            duration: workout.duration,
            distanceMeters: distance,
            activeEnergyKcal: energy,
            averageHeartRate: heartRate?.averageQuantity()?.doubleValue(for: bpm),
            maxHeartRate: heartRate?.maximumQuantity()?.doubleValue(for: bpm),
            elevationGainMeters: elevation,
            sourceName: workout.sourceRevision.source.name,
            isIndoor: workout.metadata?[HKMetadataKeyIndoorWorkout] as? Bool
        )
    }

    func heartRateSamples(for workout: WorkoutSummary) async throws -> [HeartRateSample] {
        let predicate = HKQuery.predicateForSamples(withStart: workout.start, end: workout.end, options: .strictStartDate)
        let descriptor = HKSampleQueryDescriptor(
            predicates: [.quantitySample(type: HKQuantityType(.heartRate), predicate: predicate)],
            sortDescriptors: [SortDescriptor(\.startDate)]
        )
        return try await descriptor.result(for: store).map {
            HeartRateSample(date: $0.startDate, bpm: $0.quantity.doubleValue(for: Self.bpm))
        }
    }

    func route(for workout: WorkoutSummary) async throws -> [RoutePoint] {
        let workoutQuery = HKSampleQueryDescriptor(
            predicates: [.workout(HKQuery.predicateForObject(with: workout.id))],
            sortDescriptors: [],
            limit: 1
        )
        guard let hkWorkout = try await workoutQuery.result(for: store).first else { return [] }

        let routeQuery = HKSampleQueryDescriptor(
            predicates: [.sample(type: HKSeriesType.workoutRoute(), predicate: HKQuery.predicateForObjects(from: hkWorkout))],
            sortDescriptors: []
        )
        let routes = try await routeQuery.result(for: store).compactMap { $0 as? HKWorkoutRoute }
        var points: [RoutePoint] = []
        for route in routes {
            points += try await locations(for: route).map {
                RoutePoint(latitude: $0.coordinate.latitude, longitude: $0.coordinate.longitude)
            }
        }
        return points
    }

    /// Route locations arrive in batches; collect them all before resuming.
    private func locations(for route: HKWorkoutRoute) async throws -> [CLLocation] {
        try await withCheckedThrowingContinuation { continuation in
            var collected: [CLLocation] = []
            let query = HKWorkoutRouteQuery(route: route) { _, batch, done, error in
                if let error {
                    continuation.resume(throwing: error)
                    return
                }
                collected += batch ?? []
                if done {
                    continuation.resume(returning: collected)
                }
            }
            store.execute(query)
        }
    }

    // MARK: Metrics

    func dailyValues(for metric: HealthMetric, since start: Date) async throws -> [DailyValue] {
        let anchor = Calendar.current.startOfDay(for: start)
        let descriptor = HKStatisticsCollectionQueryDescriptor(
            predicate: .quantitySample(
                type: HKQuantityType(metric.quantityIdentifier),
                predicate: HKQuery.predicateForSamples(withStart: anchor, end: nil)
            ),
            options: metric.isCumulative ? .cumulativeSum : .discreteAverage,
            anchorDate: anchor,
            intervalComponents: DateComponents(day: 1)
        )
        let collection = try await descriptor.result(for: store)
        return collection.statistics().compactMap { statistics in
            let quantity = metric.isCumulative ? statistics.sumQuantity() : statistics.averageQuantity()
            guard let value = quantity?.doubleValue(for: metric.unit) else { return nil }
            return DailyValue(date: statistics.startDate, value: value)
        }
    }

    func sleepHours(since start: Date) async throws -> [DailyValue] {
        let descriptor = HKSampleQueryDescriptor(
            predicates: [.categorySample(
                type: HKCategoryType(.sleepAnalysis),
                predicate: HKQuery.predicateForSamples(withStart: start, end: nil)
            )],
            sortDescriptors: [SortDescriptor(\.startDate)]
        )
        let asleep = Set(HKCategoryValueSleepAnalysis.allAsleepValues.map(\.rawValue))
        let intervals = try await descriptor.result(for: store)
            .filter { asleep.contains($0.value) }
            .map { DateInterval(start: $0.startDate, end: $0.endDate) }
        return SleepAggregator.nightlyHours(intervals, calendar: .current)
    }

    func athleteProfile() async -> AthleteProfile {
        var profile = AthleteProfile()
        let calendar = Calendar.current
        if let components = try? store.dateOfBirthComponents(), let birthday = calendar.date(from: components) {
            profile.age = calendar.dateComponents([.year], from: birthday, to: .now).year
        }
        switch (try? store.biologicalSex())?.biologicalSex {
        case .some(.female): profile.sex = .female
        case .some(.male): profile.sex = .male
        default: profile.sex = .unspecified
        }
        return profile
    }

    // MARK: Observation

    func startObservingWorkouts(_ onChange: @escaping @Sendable () -> Void) {
        guard Self.isAvailable else { return }
        lock.lock()
        defer { lock.unlock() }
        guard observerQuery == nil else { return }

        let workoutType = HKObjectType.workoutType()
        let query = HKObserverQuery(sampleType: workoutType, predicate: nil) { _, completion, error in
            if error == nil {
                onChange()
            }
            completion()
        }
        observerQuery = query
        store.execute(query)
        store.enableBackgroundDelivery(for: workoutType, frequency: .immediate) { _, _ in }
    }
}

// MARK: - HealthKit mappings

extension HealthMetric {
    var quantityIdentifier: HKQuantityTypeIdentifier {
        switch self {
        case .restingHeartRate: .restingHeartRate
        case .heartRateVariability: .heartRateVariabilitySDNN
        case .vo2Max: .vo2Max
        case .steps: .stepCount
        case .activeEnergy: .activeEnergyBurned
        }
    }

    var unit: HKUnit {
        switch self {
        case .restingHeartRate: HKUnit.count().unitDivided(by: .minute())
        case .heartRateVariability: .secondUnit(with: .milli)
        case .vo2Max: HKUnit(from: "ml/kg*min")
        case .steps: .count()
        case .activeEnergy: .kilocalorie()
        }
    }
}

extension ActivityKind {
    init(_ type: HKWorkoutActivityType) {
        switch type {
        case .running: self = .run
        case .walking: self = .walk
        case .hiking: self = .hike
        case .cycling, .handCycling: self = .cycle
        case .swimming: self = .swim
        case .rowing: self = .row
        case .traditionalStrengthTraining, .functionalStrengthTraining, .coreTraining: self = .strength
        case .highIntensityIntervalTraining: self = .hiit
        case .crossTraining, .mixedCardio: self = .crossTraining
        case .elliptical, .stairClimbing: self = .elliptical
        case .yoga, .pilates, .flexibility, .mindAndBody, .cooldown: self = .mobility
        default: self = .other
        }
    }
}
