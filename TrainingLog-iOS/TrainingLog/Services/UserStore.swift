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
    /// Energy scores out of 10.
    private let energyKey       = "energyByDate10"
    /// Old scores out of 5. Read only, to convert them; never written again.
    private let legacyEnergyKey = "energyByDate"
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

        let energy = merged(energyKey, local: withLegacyEnergy(energyByDate))
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

    /// Brings in scores saved out of 5 by older versions, doubled. Only dates without a
    /// score out of 10 are filled, so this can run on every device, every launch, and a
    /// score is never doubled twice.
    private func withLegacyEnergy(_ current: [String: Int]) -> [String: Int] {
        let local = UserDefaults.standard.dictionary(forKey: legacyEnergyKey) as? [String: Int] ?? [:]
        let remote = cloud.dictionary(forKey: legacyEnergyKey) as? [String: Int] ?? [:]
        var result = current
        for (k, v) in local.merging(remote, uniquingKeysWith: { _, cloudValue in cloudValue })
        where result[k] == nil {
            result[k] = min(v * 2, 10)
        }
        return result
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

// MARK: - Improvement to-dos

/// Something to improve, noted after a session or added by hand.
struct TodoItem: Codable, Identifiable, Equatable {
    var id = UUID()
    var text: String
    var createdAt = Date()
    var updatedAt = Date()
    var isDone = false
    var doneAt: Date? = nil
    /// Kept (rather than removed) so a deletion syncs to other devices instead of coming back.
    var isDeleted = false
    /// The Apple Health workout it came from, if any.
    var workoutID: UUID? = nil
    var workoutType: String? = nil
    var workoutDate: Date? = nil
    var workoutSummary: String? = nil
}

/// Improvement to-dos and which workouts have already been asked about. Synced across
/// devices through iCloud key-value storage, like energy scores.
@MainActor
final class TodoStore: ObservableObject {
    @Published private(set) var items: [TodoItem] = []
    @Published private(set) var askedWorkoutIDs: Set<UUID> = []
    /// Workouts before this aren't asked about, so updating the app doesn't ask about old ones.
    private(set) var promptsSince: Date = Calendar.current.startOfDay(for: .now)

    private let itemsKey = "todoItems"
    private let askedKey = "improvementAskedWorkouts"
    private let sinceKey = "improvementPromptsSince"
    private let cloud = NSUbiquitousKeyValueStore.default
    private let defaults = UserDefaults.standard

    var openItems: [TodoItem] {
        items.filter { !$0.isDone && !$0.isDeleted }.sorted { $0.createdAt > $1.createdAt }
    }
    var doneItems: [TodoItem] {
        items.filter { $0.isDone && !$0.isDeleted }.sorted { ($0.doneAt ?? $0.updatedAt) > ($1.doneAt ?? $1.updatedAt) }
    }

    init() {
        items = Self.decode(defaults.data(forKey: itemsKey))
        askedWorkoutIDs = Set((defaults.stringArray(forKey: askedKey) ?? []).compactMap(UUID.init))
        if let t = defaults.object(forKey: sinceKey) as? Double {
            promptsSince = Date(timeIntervalSince1970: t)
        } else if let t = cloud.object(forKey: sinceKey) as? Double {
            promptsSince = Date(timeIntervalSince1970: t)
        }
        defaults.set(promptsSince.timeIntervalSince1970, forKey: sinceKey)
        NotificationCenter.default.addObserver(
            forName: NSUbiquitousKeyValueStore.didChangeExternallyNotification,
            object: cloud, queue: .main
        ) { [weak self] _ in
            Task { @MainActor in self?.mergeFromCloud() }
        }
        mergeFromCloud()
    }

    // MARK: Changes

    func add(_ text: String, from workout: HealthWorkout? = nil) {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        var item = TodoItem(text: trimmed)
        if let workout {
            item.workoutID = workout.id
            item.workoutType = workout.type.rawValue
            item.workoutDate = workout.startDate
            item.workoutSummary = Self.summary(of: workout)
        }
        items.append(item)
        save()
    }

    func update(_ item: TodoItem) {
        guard let i = items.firstIndex(where: { $0.id == item.id }) else { return }
        var updated = item
        updated.updatedAt = Date()
        items[i] = updated
        save()
    }

    func setDone(_ item: TodoItem, _ done: Bool) {
        var changed = item
        changed.isDone = done
        changed.doneAt = done ? Date() : nil
        update(changed)
    }

    func delete(_ item: TodoItem) {
        var changed = item
        changed.isDeleted = true
        update(changed)
    }

    func markAsked(_ workoutID: UUID) {
        askedWorkoutIDs.insert(workoutID)
        save()
    }

    static func summary(of workout: HealthWorkout) -> String {
        var parts = ["\(workout.durationMinutes) min"]
        if let km = workout.distanceKm, km > 0 { parts.append(String(format: "%.1f km", km)) }
        return parts.joined(separator: " · ")
    }

    // MARK: Sync

    private func save() {
        let data = try? JSONEncoder().encode(items)
        defaults.set(data, forKey: itemsKey)
        cloud.set(data, forKey: itemsKey)
        // Only recent answers matter; keep the list well inside iCloud's size limits.
        let asked = askedWorkoutIDs.map(\.uuidString).suffix(1000)
        defaults.set(Array(asked), forKey: askedKey)
        cloud.set(Array(asked), forKey: askedKey)
        cloud.set(promptsSince.timeIntervalSince1970, forKey: sinceKey)
        cloud.synchronize()
    }

    /// Combines this device's to-dos with iCloud's, keeping the most recently edited
    /// version of each.
    private func mergeFromCloud() {
        let remote = Self.decode(cloud.data(forKey: itemsKey))
        var byID = Dictionary(items.map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
        for r in remote {
            if let local = byID[r.id], local.updatedAt >= r.updatedAt { continue }
            byID[r.id] = r
        }
        let merged = byID.values.sorted { $0.createdAt < $1.createdAt }
        let remoteAsked = Set((cloud.array(forKey: askedKey) as? [String] ?? []).compactMap(UUID.init))
        let mergedAsked = askedWorkoutIDs.union(remoteAsked)
        if let t = cloud.object(forKey: sinceKey) as? Double, Date(timeIntervalSince1970: t) < promptsSince {
            promptsSince = Date(timeIntervalSince1970: t)
        }

        let changed = merged != items || mergedAsked != askedWorkoutIDs
        items = merged
        askedWorkoutIDs = mergedAsked
        if changed || merged != remote || mergedAsked != remoteAsked { save() }
    }

    private static func decode(_ data: Data?) -> [TodoItem] {
        guard let data else { return [] }
        return (try? JSONDecoder().decode([TodoItem].self, from: data)) ?? []
    }
}
