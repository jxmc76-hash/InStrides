import Foundation
@testable import InStrides

enum Fixtures {
    /// UTC, Monday-first calendar so tests don't depend on the machine's locale.
    static let calendar: Calendar = {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        calendar.firstWeekday = 2
        return calendar
    }()

    static func date(_ year: Int, _ month: Int, _ day: Int, _ hour: Int = 0, _ minute: Int = 0) -> Date {
        calendar.date(from: DateComponents(year: year, month: month, day: day, hour: hour, minute: minute))!
    }

    static func workout(
        _ kind: ActivityKind = .run,
        start: Date,
        minutes: Double,
        distance: Double? = nil,
        averageHR: Double? = nil
    ) -> WorkoutSummary {
        WorkoutSummary(
            id: UUID(),
            kind: kind,
            start: start,
            end: start.addingTimeInterval(minutes * 60),
            duration: minutes * 60,
            distanceMeters: distance,
            activeEnergyKcal: nil,
            averageHeartRate: averageHR,
            maxHeartRate: nil,
            elevationGainMeters: nil,
            sourceName: "Tests",
            isIndoor: nil
        )
    }
}
