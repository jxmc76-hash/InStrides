import Foundation
import Observation

@Observable
@MainActor
final class UserStore {
    var selectedColumns: [WorkoutType] = WorkoutType.allCases
    var energyByDate: [String: Int] = [:]       // "yyyy-MM-dd" -> 1..5
    var notesByDate: [String: String] = [:]     // "yyyy-MM-dd" -> text
    var gymWeightByWorkoutID: [UUID: Double] = [:]
    var effortByWorkoutID: [UUID: Int] = [:]       // workoutID -> 1..10

    private let columnsKey = "selectedColumns"
    private let energyKey  = "energyByDate"
    private let notesKey   = "notesByDate"
    private let gymKey     = "gymWeights"
    private let effortKey  = "effortByWorkout"

    init() { load() }

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
        UserDefaults.standard.set(selectedColumns.map(\.rawValue), forKey: columnsKey)
        UserDefaults.standard.set(energyByDate, forKey: energyKey)
        UserDefaults.standard.set(notesByDate, forKey: notesKey)
        let gymEncoded = Dictionary(uniqueKeysWithValues:
            gymWeightByWorkoutID.map { (k, v) in (k.uuidString, v) })
        UserDefaults.standard.set(gymEncoded, forKey: gymKey)
        let effortEncoded = Dictionary(uniqueKeysWithValues:
            effortByWorkoutID.map { (k, v) in (k.uuidString, v) })
        UserDefaults.standard.set(effortEncoded, forKey: effortKey)
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
    }
}
