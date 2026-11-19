import SwiftUI
import Charts

struct TrendsView: View {
    @Environment(HealthKitManager.self) private var hk
    @EnvironmentObject var userStore: UserStore

    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 340), spacing: 20)], spacing: 20) {
                    charts
                }
                .padding(.bottom, 32)
                .contentWidth(1200)
            }
            .navigationTitle("Trends")
            .navigationBarTitleDisplayMode(.inline)
        }
    }

    // MARK: - Charts

    @ViewBuilder
    private var charts: some View {
        let weeks = lastWeeks()
        let (recent, previous) = fortnights()

        AreaChartView(title: "Weekly Running Distance (km)",
                      unit: "km",
                      data: weeklyRunDistance(weeks: weeks),
                      color: WorkoutType.run.color,
                      showAverage: false,
                      insight: runHeadline(recent: recent, previous: previous),
                      period: .weekOfYear)
        .padding(.horizontal, 16)

        AreaChartView(title: "Weekly Avg Weight (kg)",
                      unit: "kg",
                      data: weeklyAvgWeight(weeks: weeks),
                      color: .blue,
                      insight: weightHeadline(recent: recent, previous: previous),
                      decimals: 1,
                      period: .weekOfYear)
        .padding(.horizontal, 16)

        AreaChartView(title: "Weekly VO₂ Max",
                      unit: "mL/kg/min",
                      data: weeklyVO2(weeks: weeks),
                      color: .teal,
                      insight: vo2Headline(recent: recent, previous: previous),
                      decimals: 1,
                      period: .weekOfYear)
        .padding(.horizontal, 16)

        AreaChartView(title: "Weekly Avg Energy (out of 10)",
                      unit: "score",
                      data: weeklyAvgEnergy(weeks: weeks),
                      color: .appTeal,
                      insight: energyHeadline(recent: recent, previous: previous),
                      decimals: 1,
                      emptyMessage: "No data yet. This fills in once you've logged energy for a full week.",
                      period: .weekOfYear)
        .padding(.horizontal, 16)

        AreaChartView(title: "Weekly Avg Sleep (hours)",
                      unit: "hours",
                      data: weeklyAvgSleep(weeks: weeks),
                      color: .indigo,
                      insight: sleepHeadline(recent: recent, previous: previous),
                      decimals: 1,
                      period: .weekOfYear)
        .padding(.horizontal, 16)

        AreaChartView(title: "Weekly Sleep Score (out of 100)",
                      unit: "score",
                      data: weeklySleepScore(weeks: weeks),
                      color: .purple,
                      insight: sleepScoreHeadline(recent: recent, previous: previous),
                      period: .weekOfYear)
        .padding(.horizontal, 16)

        AreaChartView(title: "Weekly Avg Bedtime",
                      unit: "bedtime",
                      data: weeklyBedtime(weeks: weeks),
                      color: .indigo.opacity(0.8),
                      insight: bedtimeHeadline(recent: recent, previous: previous),
                      period: .weekOfYear,
                      format: Self.clockTime24,
                      yAxisStride: 60)
        .padding(.horizontal, 16)

        AreaChartView(title: "Heaviest Gym Weight per Week (kg)",
                      unit: "kg",
                      data: weeklyGymMax(weeks: weeks),
                      color: WorkoutType.gym.color,
                      insight: gymHeadline(recent: recent, previous: previous),
                      emptyMessage: "No data yet. This fills in as you log the weight used after gym sessions.",
                      period: .weekOfYear)
        .padding(.horizontal, 16)

        SleepEnergyChartView(points: sleepEnergyPoints(),
                             insight: sleepEnergyHeadline())
        .padding(.horizontal, 16)
    }

    // MARK: - Headlines (last 14 days compared with the 14 before)

    /// Days in the last two weeks (including today) and the two weeks before that.
    private func fortnights() -> (recent: [DailyHealthData], previous: [DailyHealthData]) {
        let cal = Calendar.current
        let today = cal.startOfDay(for: .now)
        let recentStart = cal.date(byAdding: .day, value: -13, to: today) ?? today
        let previousStart = cal.date(byAdding: .day, value: -27, to: today) ?? today
        let recent = hk.dailyData.filter { $0.date >= recentStart }
        let previous = hk.dailyData.filter { $0.date >= previousStart && $0.date < recentStart }
        return (recent, previous)
    }

    private func mean(_ values: [Double]) -> Double? {
        values.isEmpty ? nil : values.reduce(0, +) / Double(values.count)
    }

    private func runHeadline(recent: [DailyHealthData], previous: [DailyHealthData]) -> String {
        let km: ([DailyHealthData]) -> Double = { days in
            days.flatMap { $0.workouts(for: .run) }.compactMap(\.distanceKm).reduce(0, +)
        }
        let now = km(recent), before = km(previous)
        guard now > 0 else {
            return before > 0 ? "No runs in the last two weeks." : "No running logged lately."
        }
        let total = String(format: "%.0f km", now)
        guard before > 0 else { return "Back running: \(total) in the last two weeks." }
        let change = (now - before) / before * 100
        if abs(change) < 5 { return "\(total) in two weeks: steady with the fortnight before." }
        return change > 0
            ? "\(total) in two weeks, up \(Int(change.rounded()))% on the fortnight before."
            : "\(total) in two weeks, down \(Int((-change).rounded()))% on the fortnight before."
    }

    private func weightHeadline(recent: [DailyHealthData], previous: [DailyHealthData]) -> String {
        guard let now = mean(recent.compactMap(\.weight)) else { return "No weigh-ins in the last two weeks." }
        let current = String(format: "%.1f kg", now)
        guard let before = mean(previous.compactMap(\.weight)) else { return "Averaging \(current) over the last two weeks." }
        let diff = now - before
        if abs(diff) < 0.2 { return "Holding steady at \(current)." }
        let amount = String(format: "%.1f kg", abs(diff))
        return diff < 0
            ? "Down \(amount) in two weeks, now averaging \(current)."
            : "Up \(amount) in two weeks, now averaging \(current)."
    }

    private func vo2Headline(recent: [DailyHealthData], previous: [DailyHealthData]) -> String {
        // Days are newest first, so `first` is the latest reading.
        guard let now = recent.compactMap(\.vo2Max).first else { return "No new VO₂ max readings in the last two weeks." }
        let current = String(format: "%.1f", now)
        guard let before = previous.compactMap(\.vo2Max).first else { return "VO₂ max at \(current)." }
        let diff = now - before
        if abs(diff) < 0.3 { return "VO₂ max holding at \(current)." }
        return diff > 0
            ? "VO₂ max climbing: up \(String(format: "%.1f", diff)) to \(current)."
            : "VO₂ max slipping: down \(String(format: "%.1f", -diff)) to \(current)."
    }

    private func energyHeadline(recent: [DailyHealthData], previous: [DailyHealthData]) -> String {
        let scores: ([DailyHealthData]) -> [Double] = { days in
            days.compactMap { userStore.energy(for: $0.date) }.map(Double.init)
        }
        guard let now = mean(scores(recent)) else { return "No energy scores in the last two weeks." }
        let current = String(format: "%.1f/10", now)
        guard let before = mean(scores(previous)) else { return "Energy averaging \(current)." }
        let diff = now - before
        if abs(diff) < 0.3 { return "Energy steady at \(current)." }
        return diff > 0
            ? "Energy on the up: averaging \(current), from \(String(format: "%.1f", before))."
            : "Energy dipping: averaging \(current), from \(String(format: "%.1f", before))."
    }

    private func sleepHeadline(recent: [DailyHealthData], previous: [DailyHealthData]) -> String {
        guard let now = mean(recent.compactMap { $0.sleep?.totalMinutes }) else { return "No sleep recorded in the last two weeks." }
        let current = "\(Int(now) / 60)h \(String(format: "%02d", Int(now) % 60))m"
        guard let before = mean(previous.compactMap { $0.sleep?.totalMinutes }) else { return "Averaging \(current) a night." }
        let diff = Int((now - before).rounded())
        if abs(diff) < 10 { return "Averaging \(current) a night, much as before." }
        return diff > 0
            ? "Averaging \(current) a night, \(diff) min more than the fortnight before."
            : "Averaging \(current) a night, \(-diff) min less than the fortnight before."
    }

    private func sleepScoreHeadline(recent: [DailyHealthData], previous: [DailyHealthData]) -> String {
        let scores: ([DailyHealthData]) -> [Double] = { $0.compactMap { $0.sleep.map { Double($0.score) } } }
        guard let now = mean(scores(recent)) else { return "No sleep recorded in the last two weeks." }
        let current = "\(Int(now.rounded()))"
        guard let before = mean(scores(previous)) else { return "Sleep score averaging \(current)." }
        let diff = Int((now - before).rounded())
        if abs(diff) < 3 { return "Sleep score steady at \(current)." }
        return diff > 0
            ? "Sleeping better: score \(current), up \(diff) on the fortnight before."
            : "Sleeping worse: score \(current), down \(-diff) on the fortnight before."
    }

    private func bedtimeHeadline(recent: [DailyHealthData], previous: [DailyHealthData]) -> String {
        let times: ([DailyHealthData]) -> [Double] = { $0.compactMap { $0.sleep?.bedtime.map(Self.minutesAfterNoon) } }
        guard let now = mean(times(recent)) else { return "No bedtimes recorded in the last two weeks." }
        let current = Self.clockTime(now)
        guard let before = mean(times(previous)) else { return "Going to bed around \(current)." }
        let diff = Int((now - before).rounded())
        if abs(diff) < 10 { return "Bed around \(current), much as before." }
        return diff < 0
            ? "Bed around \(current), \(-diff) min earlier than the fortnight before."
            : "Bed around \(current), \(diff) min later than the fortnight before."
    }

    private func gymHeadline(recent: [DailyHealthData], previous: [DailyHealthData]) -> String {
        let top: ([DailyHealthData]) -> Double? = { days in
            days.flatMap { $0.workouts(for: .gym) }.compactMap { userStore.gymWeight(for: $0.id) }.max()
        }
        guard let now = top(recent) else { return "No gym weights logged in the last two weeks." }
        let current = Self.kg(now)
        guard let before = top(previous) else { return "Top weight \(current) in the last two weeks." }
        let diff = now - before
        if abs(diff) < 0.5 { return "Top weight holding at \(current)." }
        return diff > 0
            ? "Getting stronger: top weight \(current), up \(Self.kg(diff))."
            : "Top weight \(current), down \(Self.kg(-diff)) on the fortnight before."
    }

    /// Days in the last 12 weeks with both sleep and an energy score.
    private func sleepEnergyPoints() -> [SleepEnergyPoint] {
        let cal = Calendar.current
        let today = cal.startOfDay(for: .now)
        let from = cal.date(byAdding: .weekOfYear, value: -12, to: today) ?? today
        let recentFrom = cal.date(byAdding: .day, value: -13, to: today) ?? today
        return hk.dailyData.compactMap { day in
            guard day.date >= from,
                  let minutes = day.sleep?.totalMinutes, minutes > 0,
                  let energy = userStore.energy(for: day.date) else { return nil }
            return SleepEnergyPoint(date: day.date, sleepHours: minutes / 60,
                                    energy: Double(energy), isRecent: day.date >= recentFrom)
        }
    }

    /// Compares energy after longer and shorter nights. Uses 12 weeks, as two weeks is too
    /// few days to show a pattern, but leads with the last two weeks when there's enough.
    private func sleepEnergyHeadline() -> String {
        let all = sleepEnergyPoints()
        guard all.count >= 6 else { return "Log energy on more days to see how sleep affects it." }
        let recent = all.filter(\.isRecent)
        let sample = recent.count >= 6 ? recent : all
        let period = recent.count >= 6 ? "Last two weeks" : "Last 12 weeks"
        let sortedHours = sample.map(\.sleepHours).sorted()
        let median = sortedHours[sortedHours.count / 2]
        let longer = sample.filter { $0.sleepHours >= median }.map(\.energy)
        let shorter = sample.filter { $0.sleepHours < median }.map(\.energy)
        guard let hi = mean(longer), let lo = mean(shorter) else { return "\(period): not enough variety in sleep yet." }
        let cutoff = Self.hoursMinutes(median)
        if abs(hi - lo) < 0.5 {
            return "\(period): energy about the same whether you slept more or less than \(cutoff)."
        }
        return hi > lo
            ? "\(period): \(String(format: "%.1f", hi)) energy after \(cutoff)+ of sleep vs \(String(format: "%.1f", lo)) on shorter nights."
            : "\(period): oddly, energy was higher on shorter nights (\(String(format: "%.1f", lo)) vs \(String(format: "%.1f", hi)))."
    }

    // MARK: - Formatting

    /// Bedtimes are plotted as minutes after noon so that 11 pm and 1 am sit next to each other.
    private static func minutesAfterNoon(_ date: Date) -> Double {
        let c = Calendar.current.dateComponents([.hour, .minute], from: date)
        let minutes = (c.hour ?? 0) * 60 + (c.minute ?? 0)
        return Double((minutes - 720 + 1440) % 1440)
    }

    static func clockTime(_ minutesAfterNoon: Double) -> String {
        let total = (Int(minutesAfterNoon.rounded()) + 720) % 1440
        let h = total / 60, m = total % 60
        let h12 = h % 12 == 0 ? 12 : h % 12
        return String(format: "%d:%02d %@", h12, m, h < 12 ? "am" : "pm")
    }

    /// Compact 24-hour time for chart labels, e.g. "23:51".
    static func clockTime24(_ minutesAfterNoon: Double) -> String {
        let total = (Int(minutesAfterNoon.rounded()) + 720) % 1440
        return String(format: "%02d:%02d", total / 60, total % 60)
    }

    private static func hoursMinutes(_ hours: Double) -> String {
        let minutes = Int((hours * 60).rounded())
        return "\(minutes / 60)h \(String(format: "%02d", minutes % 60))m"
    }

    private static func kg(_ value: Double) -> String {
        value.rounded() == value ? "\(Int(value)) kg" : String(format: "%.1f kg", value)
    }

    // MARK: - Data aggregation

    private struct WeekBucket { let start: Date; let days: [DailyHealthData] }

    /// Weeks from the last year, oldest first, including the current week so far.
    private func lastWeeks(count: Int = 52) -> [WeekBucket] {
        let cal = Calendar.current
        let currentWeekStart = cal.dateInterval(of: .weekOfYear, for: .now)?.start ?? .now
        let cutoff = cal.date(byAdding: .weekOfYear, value: -count, to: currentWeekStart)!
        var groups: [Date: [DailyHealthData]] = [:]
        for day in hk.dailyData {
            let ws = cal.dateInterval(of: .weekOfYear, for: day.date)?.start ?? day.date
            guard ws >= cutoff else { continue }
            groups[ws, default: []].append(day)
        }
        return groups.keys.sorted().map { WeekBucket(start: $0, days: groups[$0]!) }
    }

    /// Weeks without a run count as 0 km, from the first week with a run onwards.
    private func weeklyRunDistance(weeks: [WeekBucket]) -> [ChartDataPoint] {
        let km = weeks.map { w in
            w.days.flatMap { $0.workouts(for: .run) }.compactMap(\.distanceKm).reduce(0, +)
        }
        guard let first = km.firstIndex(where: { $0 > 0 }) else { return [] }
        return weeks.indices.dropFirst(first).map { ChartDataPoint(date: weeks[$0].start, value: km[$0]) }.reversed()
    }

    /// Weeks without a weigh-in use the most recent earlier reading, marked as carried forward.
    private func weeklyAvgWeight(weeks: [WeekBucket]) -> [ChartDataPoint] {
        var last: Double? = nil
        var points: [ChartDataPoint] = []
        for w in weeks {
            if let avg = mean(w.days.compactMap(\.weight)) {
                last = avg
                points.append(ChartDataPoint(date: w.start, value: avg))
            } else if let last {
                points.append(ChartDataPoint(date: w.start, value: last, isCarriedForward: true))
            }
        }
        return points.reversed()
    }

    private func weeklyVO2(weeks: [WeekBucket]) -> [ChartDataPoint] {
        weeks.compactMap { w in
            w.days.compactMap(\.vo2Max).max().map { ChartDataPoint(date: w.start, value: $0) }
        }.reversed()
    }

    private func weeklyAvgEnergy(weeks: [WeekBucket]) -> [ChartDataPoint] {
        weeks.compactMap { w in
            mean(w.days.compactMap { userStore.energy(for: $0.date) }.map(Double.init))
                .map { ChartDataPoint(date: w.start, value: $0) }
        }.reversed()
    }

    private func weeklySleepScore(weeks: [WeekBucket]) -> [ChartDataPoint] {
        weeks.compactMap { w in
            mean(w.days.compactMap { $0.sleep.map { Double($0.score) } }).map { ChartDataPoint(date: w.start, value: $0) }
        }.reversed()
    }

    private func weeklyBedtime(weeks: [WeekBucket]) -> [ChartDataPoint] {
        weeks.compactMap { w in
            mean(w.days.compactMap { $0.sleep?.bedtime.map(Self.minutesAfterNoon) })
                .map { ChartDataPoint(date: w.start, value: $0) }
        }.reversed()
    }

    /// The heaviest weight logged for any gym session that week.
    private func weeklyGymMax(weeks: [WeekBucket]) -> [ChartDataPoint] {
        weeks.compactMap { w in
            w.days.flatMap { $0.workouts(for: .gym) }
                .compactMap { userStore.gymWeight(for: $0.id) }
                .max()
                .map { ChartDataPoint(date: w.start, value: $0) }
        }.reversed()
    }

    private func weeklyAvgSleep(weeks: [WeekBucket]) -> [ChartDataPoint] {
        weeks.compactMap { w in
            mean(w.days.compactMap { $0.sleep?.totalMinutes }).map { ChartDataPoint(date: w.start, value: $0 / 60) }
        }.reversed()
    }
}
