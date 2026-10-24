import Foundation

@MainActor
final class UserStore: ObservableObject {
    @Published var selectedColumns: [WorkoutType] = WorkoutType.allCases
    @Published var energyByDate: [String: Int] = [:]
    @Published var notesByDate: [String: String] = [:]
    @Published var gymWeightByWorkoutID: [UUID: Double] = [:]
    @Published var effortByWorkoutID: [UUID: Int] = [:]
    @Published var reminderTime: Date = {
        var c = DateComponents(); c.hour = 7; c.minute = 0
        return Calendar.current.date(from: c) ?? Date()
    }()
    @Published var calendarEventsBySessionKey: [String: String] = [:]
    @Published var sessionReminderEnabled: Bool = true
    @Published var sessionReminderTime: Date = {
        var c = DateComponents(); c.hour = 7; c.minute = 30
        return Calendar.current.date(from: c) ?? Date()
    }()
    @Published var sessionLengthMinutes: Int = 60

    private let columnsKey      = "selectedColumns"
    private let energyKey       = "energyByDate"
    private let notesKey        = "notesByDate"
    private let gymKey          = "gymWeights"
    private let effortKey       = "effortByWorkout"
    private let reminderTimeKey = "reminderTime"
    private let calendarKey     = "calendarEventIDs"
    private let sessionReminderOnKey   = "sessionReminderEnabled"
    private let sessionReminderTimeKey = "sessionReminderTime"
    private let sessionLengthKey       = "sessionLengthMinutes"

    private let cloud = NSUbiquitousKeyValueStore.default

    init() {
        load()
        NotificationCenter.default.addObserver(
            forName: NSUbiquitousKeyValueStore.didChangeExternallyNotification,
            object: cloud, queue: .main
        ) { [weak self] _ in
            Task { @MainActor in self?.mergeFromCloud() }
        }
        cloud.synchronize()
        mergeFromCloud()
    }

    /// Energy ratings, notes, gym weights and effort ratings are backed up to iCloud
    /// (key-value storage) and shared across devices. When the same entry differs, the
    /// iCloud value wins; entries only on this device are kept and uploaded.
    private func mergeFromCloud() {
        let defaults = UserDefaults.standard

        let energy = merged(energyKey, local: energyByDate)
        if energy != energyByDate {
            energyByDate = energy
            defaults.set(energy, forKey: energyKey)
        }

        let notes = merged(notesKey, local: notesByDate)
        if notes != notesByDate {
            notesByDate = notes
            defaults.set(notes, forKey: notesKey)
        }

        let gymLocal = Dictionary(uniqueKeysWithValues:
            gymWeightByWorkoutID.map { ($0.key.uuidString, $0.value) })
        let gym = merged(gymKey, local: gymLocal)
        if gym != gymLocal {
            gymWeightByWorkoutID = Dictionary(uniqueKeysWithValues:
                gym.compactMap { (k, v) in UUID(uuidString: k).map { ($0, v) } })
            defaults.set(gym, forKey: gymKey)
        }

        let effortLocal = Dictionary(uniqueKeysWithValues:
            effortByWorkoutID.map { ($0.key.uuidString, $0.value) })
        let effort = merged(effortKey, local: effortLocal)
        if effort != effortLocal {
            effortByWorkoutID = Dictionary(uniqueKeysWithValues:
                effort.compactMap { (k, v) in UUID(uuidString: k).map { ($0, v) } })
            defaults.set(effort, forKey: effortKey)
        }
    }

    private func merged<V: Equatable>(_ key: String, local: [String: V]) -> [String: V] {
        let remote = cloud.dictionary(forKey: key) as? [String: V] ?? [:]
        var result = local
        for (k, v) in remote { result[k] = v }
        if result != remote {
            cloud.set(result, forKey: key)
            cloud.synchronize()
        }
        return result
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

    /// Saves settings changed directly through bindings (reminder times, session length).
    func persist() { save() }

    func setCalendarEventIDs(_ ids: [String: String]) {
        calendarEventsBySessionKey = ids
        save()
    }

    private func key(_ date: Date) -> String {
        let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd"
        return f.string(from: date)
    }

    private func save() {
        UserDefaults.standard.set(selectedColumns.map(\.rawValue), forKey: columnsKey)
        UserDefaults.standard.set(energyByDate, forKey: energyKey)
        cloud.set(energyByDate, forKey: energyKey)
        UserDefaults.standard.set(notesByDate, forKey: notesKey)
        cloud.set(notesByDate, forKey: notesKey)
        let gymEncoded = Dictionary(uniqueKeysWithValues:
            gymWeightByWorkoutID.map { (k, v) in (k.uuidString, v) })
        UserDefaults.standard.set(gymEncoded, forKey: gymKey)
        cloud.set(gymEncoded, forKey: gymKey)
        let effortEncoded = Dictionary(uniqueKeysWithValues:
            effortByWorkoutID.map { (k, v) in (k.uuidString, v) })
        UserDefaults.standard.set(effortEncoded, forKey: effortKey)
        cloud.set(effortEncoded, forKey: effortKey)
        cloud.synchronize()
        UserDefaults.standard.set(reminderTime.timeIntervalSinceReferenceDate, forKey: reminderTimeKey)
        UserDefaults.standard.set(calendarEventsBySessionKey, forKey: calendarKey)
        UserDefaults.standard.set(sessionReminderEnabled, forKey: sessionReminderOnKey)
        UserDefaults.standard.set(sessionReminderTime.timeIntervalSinceReferenceDate, forKey: sessionReminderTimeKey)
        UserDefaults.standard.set(sessionLengthMinutes, forKey: sessionLengthKey)
    }

    private func load() {
        if let raw = UserDefaults.standard.stringArray(forKey: columnsKey) {
            selectedColumns = raw.compactMap(WorkoutType.init(rawValue:))
        }
        energyByDate = UserDefaults.standard.dictionary(forKey: energyKey) as? [String: Int] ?? [:]
        notesByDate = UserDefaults.standard.dictionary(forKey: notesKey) as? [String: String] ?? [:]
        if let raw = UserDefaults.standard.dictionary(forKey: gymKey) as? [String: Double] {
            gymWeightByWorkoutID = Dictionary(uniqueKeysWithValues:
                raw.compactMap { (k, v) in UUID(uuidString: k).map { ($0, v) } })
        }
        if let raw = UserDefaults.standard.dictionary(forKey: effortKey) as? [String: Int] {
            effortByWorkoutID = Dictionary(uniqueKeysWithValues:
                raw.compactMap { (k, v) in UUID(uuidString: k).map { ($0, v) } })
        }
        let interval = UserDefaults.standard.double(forKey: reminderTimeKey)
        if interval != 0 {
            reminderTime = Date(timeIntervalSinceReferenceDate: interval)
        }
        calendarEventsBySessionKey = UserDefaults.standard.dictionary(forKey: calendarKey) as? [String: String] ?? [:]
        if UserDefaults.standard.object(forKey: sessionReminderOnKey) != nil {
            sessionReminderEnabled = UserDefaults.standard.bool(forKey: sessionReminderOnKey)
        }
        let sessionInterval = UserDefaults.standard.double(forKey: sessionReminderTimeKey)
        if sessionInterval != 0 {
            sessionReminderTime = Date(timeIntervalSinceReferenceDate: sessionInterval)
        }
        let length = UserDefaults.standard.integer(forKey: sessionLengthKey)
        if length > 0 { sessionLengthMinutes = length }
    }
}
