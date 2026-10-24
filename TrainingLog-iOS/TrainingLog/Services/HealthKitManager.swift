import Foundation
import HealthKit
import Observation

@Observable
@MainActor
final class HealthKitManager {
    var dailyData: [DailyHealthData] = []
    var isLoading = false
    var authorizationStatus: HKAuthorizationStatus = .notDetermined
    /// nil until we know; false on devices with no Health data (Mac, or Health not set up).
    var hasLocalHealthData: Bool? = nil
    var lastFetch: Date? = nil

    private let store = HKHealthStore()

    private var readTypes: Set<HKObjectType> {
        let types: Set<HKObjectType> = [
            HKObjectType.workoutType(),
            HKObjectType.quantityType(forIdentifier: .bodyMass)!,
            HKObjectType.quantityType(forIdentifier: .vo2Max)!,
            HKObjectType.categoryType(forIdentifier: .sleepAnalysis)!,
        ]
        return types
    }

    func requestAuthorization() async {
        print("[HK] isHealthDataAvailable=\(HKHealthStore.isHealthDataAvailable())")
        guard HKHealthStore.isHealthDataAvailable() else {
            hasLocalHealthData = false
            return
        }
        do {
            try await store.requestAuthorization(toShare: [], read: readTypes)
            print("[HK] authorization succeeded, fetching...")
            await fetchAll()
        } catch {
            print("[HK] authorization failed: \(error)")
            hasLocalHealthData = false
        }
    }

    func fetchAll() async {
        print("[HK] fetchAll start")
        isLoading = true
        defer { isLoading = false }

        let end = Date()
        let start = Calendar.current.date(byAdding: .year, value: -3, to: end)!

        async let workouts = fetchWorkouts(from: start, to: end)
        async let weights = fetchWeight(from: start, to: end)
        async let vo2s = fetchVO2Max(from: start, to: end)
        async let sleepRaw = fetchSleep(from: start, to: end)

        let (ws, wts, vs, sl) = await (workouts, weights, vo2s, sleepRaw)

        print("[HK] fetchAll complete: \(ws.count) workouts, \(wts.count) weights, \(vs.count) vo2, \(sl.count) sleep")
        dailyData = buildDailyData(workouts: ws, weights: wts, vo2s: vs, sleep: sl,
                                    from: start, to: end)
        print("[HK] dailyData set: \(dailyData.count) days")
        hasLocalHealthData = (ws.count + wts.count + vs.count + sl.count) > 0
        lastFetch = Date()
    }

    // MARK: - Private fetch helpers

    private func fetchWorkouts(from start: Date, to end: Date) async -> [HealthWorkout] {
        let predicate = HKQuery.predicateForSamples(withStart: start, end: end)
        let sortDesc = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: false)

        return await withCheckedContinuation { cont in
            let q = HKSampleQuery(sampleType: .workoutType(),
                                  predicate: predicate,
                                  limit: HKObjectQueryNoLimit,
                                  sortDescriptors: [sortDesc]) { _, samples, _ in
                let result = (samples as? [HKWorkout] ?? []).compactMap { hkw -> HealthWorkout? in
                    guard let type = WorkoutType.from(hkType: hkw.workoutActivityType) else { return nil }
                    return HealthWorkout(from: hkw, type: type)
                }
                cont.resume(returning: result)
            }
            store.execute(q)
        }
    }

    private func fetchQuantity(type: HKQuantityTypeIdentifier,
                                unit: HKUnit,
                                from start: Date,
                                to end: Date) async -> [(Date, Double)] {
        guard let qType = HKObjectType.quantityType(forIdentifier: type) else { return [] }
        let predicate = HKQuery.predicateForSamples(withStart: start, end: end)
        let sort = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: true)

        return await withCheckedContinuation { cont in
            let q = HKSampleQuery(sampleType: qType,
                                  predicate: predicate,
                                  limit: HKObjectQueryNoLimit,
                                  sortDescriptors: [sort]) { _, samples, _ in
                let result = (samples as? [HKQuantitySample] ?? []).map {
                    ($0.startDate, $0.quantity.doubleValue(for: unit))
                }
                cont.resume(returning: result)
            }
            store.execute(q)
        }
    }

    private func fetchWeight(from start: Date, to end: Date) async -> [(Date, Double)] {
        await fetchQuantity(type: .bodyMass, unit: .gramUnit(with: .kilo), from: start, to: end)
    }

    private func fetchVO2Max(from start: Date, to end: Date) async -> [(Date, Double)] {
        await fetchQuantity(type: .vo2Max,
                            unit: HKUnit(from: "ml/kg*min"),
                            from: start, to: end)
    }

    private func fetchSleep(from start: Date, to end: Date) async -> [HKCategorySample] {
        guard let sleepType = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) else { return [] }
        let predicate = HKQuery.predicateForSamples(withStart: start, end: end)

        return await withCheckedContinuation { cont in
            let q = HKSampleQuery(sampleType: sleepType,
                                  predicate: predicate,
                                  limit: HKObjectQueryNoLimit,
                                  sortDescriptors: nil) { _, samples, _ in
                cont.resume(returning: samples as? [HKCategorySample] ?? [])
            }
            store.execute(q)
        }
    }

    // MARK: - Build daily data

    private func buildDailyData(workouts: [HealthWorkout],
                                 weights: [(Date, Double)],
                                 vo2s: [(Date, Double)],
                                 sleep: [HKCategorySample],
                                 from start: Date,
                                 to end: Date) -> [DailyHealthData] {
        let cal = Calendar.current

        // Group workouts by day
        var workoutsByDay: [Date: [HealthWorkout]] = [:]
        for w in workouts {
            let day = cal.startOfDay(for: w.startDate)
            workoutsByDay[day, default: []].append(w)
        }

        // Latest weight per day
        var weightByDay: [Date: Double] = [:]
        for (date, val) in weights {
            let day = cal.startOfDay(for: date)
            weightByDay[day] = val
        }

        // Latest VO2 per day
        var vo2ByDay: [Date: Double] = [:]
        for (date, val) in vo2s {
            let day = cal.startOfDay(for: date)
            vo2ByDay[day] = val
        }

        // Sleep by night (grouped by the night the sleep session covers)
        let sleepByDay = buildSleepByDay(samples: sleep, calendar: cal)

        // All days in range
        var days: [DailyHealthData] = []
        var cursor = cal.startOfDay(for: start)
        let endDay = cal.startOfDay(for: end)
        while cursor <= endDay {
            let day = DailyHealthData(
                date: cursor,
                workouts: workoutsByDay[cursor] ?? [],
                sleep: sleepByDay[cursor],
                weight: weightByDay[cursor],
                vo2Max: vo2ByDay[cursor]
            )
            days.append(day)
            cursor = cal.date(byAdding: .day, value: 1, to: cursor)!
        }
        return days.reversed()
    }

    private func buildSleepByDay(samples: [HKCategorySample],
                                  calendar cal: Calendar) -> [Date: DailySleepData] {
        // Group asleep samples by the morning they end on
        let asleep = samples.filter {
            $0.value == HKCategoryValueSleepAnalysis.asleepUnspecified.rawValue ||
            $0.value == HKCategoryValueSleepAnalysis.asleepCore.rawValue ||
            $0.value == HKCategoryValueSleepAnalysis.asleepDeep.rawValue ||
            $0.value == HKCategoryValueSleepAnalysis.asleepREM.rawValue
        }

        var sessionsByDay: [Date: [HKCategorySample]] = [:]
        for s in asleep {
            let day = cal.startOfDay(for: s.endDate)
            sessionsByDay[day, default: []].append(s)
        }

        var result: [Date: DailySleepData] = [:]
        for (day, sessions) in sessionsByDay {
            let totalMin = sessions.reduce(0.0) { $0 + $1.endDate.timeIntervalSince($1.startDate) / 60 }
            let bedtime = sessions.min(by: { $0.startDate < $1.startDate })?.startDate
            let interruptions = computeInterruptions(sessions: sessions)
            result[day] = DailySleepData(date: day, totalMinutes: totalMin,
                                          bedtime: bedtime, interruptions: interruptions)
        }
        return result
    }

    private func computeInterruptions(sessions: [HKCategorySample]) -> Int {
        let sorted = sessions.sorted { $0.startDate < $1.startDate }
        var count = 0
        for i in 1..<sorted.count {
            let gap = sorted[i].startDate.timeIntervalSince(sorted[i - 1].endDate)
            if gap > 300 { count += 1 } // gap > 5 min = interruption
        }
        return count
    }
}
