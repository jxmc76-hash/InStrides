import Foundation
import Observation

@Observable
@MainActor
final class UserStore {
    var selectedColumns: [WorkoutType] = WorkoutType.allCases
    var energyByDate: [String: Int] = [:]
    var notesByDate: [String: String] = [:]
    var gymWeightByWorkoutID: [UUID: Double] = [:]
    var effortByWorkoutID: [UUID: Int] = [:]
    var reminderTime: Date = {
        var c = DateComponents(); c.hour = 7; c.minute = 0
        return Calendar.current.date(from: c) ?? Date()
    }()

    private let columnsKey      = "selectedColumns"
    private let energyKey       = "energyByDate"
    private let notesKey        = "notesByDate"
    private let gymKey          = "gymWeights"
    private let effortKey       = "effortByWorkout"
    private let reminderTimeKey = "reminderTime"

    // iCloud KV store; falls back to UserDefaults when iCloud is unavailable
    private let cloud = NSUbiquitousKeyValueStore.default

    init() {
        load()
        // Merge any changes that arrived from iCloud while the app was not running
        NotificationCenter.default.addObserver(
            forName: NSUbiquitousKeyValueStore.didChangeExternallyNotification,
            object: cloud,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor in self?.load() }
        }
        cloud.synchronize()
    }

    func setEnergy(_ value: Int, for date: Date) {
        energyByDate[key(date)] = value
        save()
    }

    func setNote(_ note: String, for date: Date) {
        notesByDate[key(date)] = note
        save()
    }

    func setGymWeight(_ weight: Double, for workoutID: UUID) {
        gymWeightByWorkoutID[workoutID] = weight
        save()
    }

    func energy(for date: Date) -> Int? { energyByDate[key(date)] }
    func note(for date: Date) -> String? { notesByDate[key(date)] }
    func gymWeight(for workoutID: UUID) -> Double? { gymWeightByWorkoutID[workoutID] }
    func effort(for workoutID: UUID) -> Int? { effortByWorkoutID[workoutID] }

    func setEffort(_ value: Int, for workoutID: UUID) {
        effortByWorkoutID[workoutID] = value
        save()
    }

    private func key(_ date: Date) -> String {
        let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd"
        return f.string(from: date)
    }

    private func save() {
        cloud.set(selectedColumns.map(\.rawValue), forKey: columnsKey)
        cloud.set(energyByDate, forKey: energyKey)
        cloud.set(notesByDate, forKey: notesKey)
        let gymEncoded = Dictionary(uniqueKeysWithValues:
            gymWeightByWorkoutID.map { (k, v) in (k.uuidString, v) })
        cloud.set(gymEncoded, forKey: gymKey)
        let effortEncoded = Dictionary(uniqueKeysWithValues:
            effortByWorkoutID.map { (k, v) in (k.uuidString, v) })
        cloud.set(effortEncoded, forKey: effortKey)
        cloud.set(reminderTime.timeIntervalSinceReferenceDate, forKey: reminderTimeKey)
        cloud.synchronize()

        // Mirror to UserDefaults as a local fallback
        UserDefaults.standard.set(selectedColumns.map(\.rawValue), forKey: columnsKey)
        UserDefaults.standard.set(energyByDate, forKey: energyKey)
        UserDefaults.standard.set(notesByDate, forKey: notesKey)
        UserDefaults.standard.set(gymEncoded, forKey: gymKey)
        UserDefaults.standard.set(effortEncoded, forKey: effortKey)
        UserDefaults.standard.set(reminderTime.timeIntervalSinceReferenceDate, forKey: reminderTimeKey)
    }

    private func load() {
        // Prefer iCloud; fall back to UserDefaults for each key individually
        func strings(_ key: String) -> [String]? {
            (cloud.array(forKey: key) as? [String]) ?? UserDefaults.standard.stringArray(forKey: key)
        }
        func dict<V>(_ key: String) -> [String: V]? {
            (cloud.dictionary(forKey: key) as? [String: V]) ?? (UserDefaults.standard.dictionary(forKey: key) as? [String: V])
        }
        func double(_ key: String) -> Double {
            let v = cloud.double(forKey: key)
            return v != 0 ? v : UserDefaults.standard.double(forKey: key)
        }

        if let raw = strings(columnsKey) {
            selectedColumns = raw.compactMap(WorkoutType.init(rawValue:))
        }
        energyByDate = dict(energyKey) ?? [:]
        notesByDate  = dict(notesKey)  ?? [:]
        if let raw: [String: Double] = dict(gymKey) {
            gymWeightByWorkoutID = Dictionary(uniqueKeysWithValues:
                raw.compactMap { (k, v) in UUID(uuidString: k).map { ($0, v) } })
        }
        if let raw: [String: Int] = dict(effortKey) {
            effortByWorkoutID = Dictionary(uniqueKeysWithValues:
                raw.compactMap { (k, v) in UUID(uuidString: k).map { ($0, v) } })
        }
        let interval = double(reminderTimeKey)
        if interval != 0 {
            reminderTime = Date(timeIntervalSinceReferenceDate: interval)
        }
    }
}
