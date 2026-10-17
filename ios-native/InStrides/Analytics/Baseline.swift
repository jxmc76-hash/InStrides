import Foundation

/// Compares a recent average against a longer baseline, e.g. resting HR this week vs the last month.
struct Baseline: Equatable, Sendable {
    let recent: Double
    let baseline: Double

    var change: Double { recent - baseline }

    var percentChange: Double {
        baseline == 0 ? 0 : change / baseline
    }

    static func compute(
        _ values: [DailyValue],
        recentDays: Int = 7,
        baselineDays: Int = 28,
        now: Date,
        calendar: Calendar
    ) -> Baseline? {
        let today = calendar.startOfDay(for: now)
        guard let recentStart = calendar.date(byAdding: .day, value: -(recentDays - 1), to: today),
              let baselineStart = calendar.date(byAdding: .day, value: -(baselineDays - 1), to: today),
              let recent = mean(values.filter { $0.date >= recentStart }),
              let baseline = mean(values.filter { $0.date >= baselineStart })
        else { return nil }
        return Baseline(recent: recent, baseline: baseline)
    }

    private static func mean(_ values: [DailyValue]) -> Double? {
        guard !values.isEmpty else { return nil }
        return values.map(\.value).reduce(0, +) / Double(values.count)
    }
}
