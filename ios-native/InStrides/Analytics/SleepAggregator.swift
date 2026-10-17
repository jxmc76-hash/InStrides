import Foundation

enum SleepAggregator {
    /// Shifting by six hours attributes everything from 6pm the previous evening up to 6pm
    /// to the same night, so a sleep that crosses midnight counts once, on the wake-up day.
    static let nightShift: TimeInterval = 6 * 3600

    /// Hours asleep per night. Overlapping intervals (e.g. iPhone and Apple Watch both
    /// recording the same night) are merged so time isn't double counted.
    static func nightlyHours(_ intervals: [DateInterval], calendar: Calendar) -> [DailyValue] {
        let byNight = Dictionary(grouping: intervals) {
            calendar.startOfDay(for: $0.end.addingTimeInterval(nightShift))
        }
        return byNight
            .map { night, intervals in DailyValue(date: night, value: mergedDuration(intervals) / 3600) }
            .sorted { $0.date < $1.date }
    }

    static func mergedDuration(_ intervals: [DateInterval]) -> TimeInterval {
        let sorted = intervals.sorted { $0.start < $1.start }
        var total: TimeInterval = 0
        var current: DateInterval?
        for interval in sorted {
            if let active = current, interval.start <= active.end {
                current = DateInterval(start: active.start, end: max(active.end, interval.end))
            } else {
                total += current?.duration ?? 0
                current = interval
            }
        }
        return total + (current?.duration ?? 0)
    }
}
