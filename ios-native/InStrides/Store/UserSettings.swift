import Foundation
import Observation

/// User preferences persisted in UserDefaults.
@MainActor
@Observable
final class UserSettings {
    private enum Key {
        static let maxHeartRate = "maxHeartRateOverride"
        static let restingHeartRate = "restingHeartRateOverride"
        static let useSampleData = "useSampleData"
    }

    private let defaults: UserDefaults

    /// 0 means "estimate from age".
    var maxHeartRateOverride: Int {
        didSet { defaults.set(maxHeartRateOverride, forKey: Key.maxHeartRate) }
    }

    /// 0 means "use the recent average from Health".
    var restingHeartRateOverride: Int {
        didSet { defaults.set(restingHeartRateOverride, forKey: Key.restingHeartRate) }
    }

    var useSampleData: Bool {
        didSet { defaults.set(useSampleData, forKey: Key.useSampleData) }
    }

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        maxHeartRateOverride = defaults.integer(forKey: Key.maxHeartRate)
        restingHeartRateOverride = defaults.integer(forKey: Key.restingHeartRate)
        #if targetEnvironment(simulator)
        // The Simulator has no workouts in Health, so default to demo data there.
        let sampleDefault = true
        #else
        let sampleDefault = false
        #endif
        useSampleData = defaults.object(forKey: Key.useSampleData) as? Bool ?? sampleDefault
    }
}
