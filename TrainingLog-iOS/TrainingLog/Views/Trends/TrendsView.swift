import SwiftUI
import Charts

enum TrendPeriod: String, CaseIterable {
    case shortTerm = "12 Weeks"
    case longTerm = "Long-term"
}

struct TrendsView: View {
    @Environment(HealthKitManager.self) private var hk
    @Environment(UserStore.self) private var userStore
    @State private var period: TrendPeriod = .shortTerm

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 20) {
                    InsightCard(summary: buildSummary())
                        .padding(.horizontal, 16)
                        .padding(.top, 8)

                    Picker("Period", selection: $period) {
                        ForEach(TrendPeriod.allCases, id: \.self) { p in
                            Text(p.rawValue).tag(p)
                        }
                    }
                    .pickerStyle(.segmented)
                    .padding(.horizontal, 16)

                    if period == .shortTerm {
                        shortTermCharts
                    } else {
                        longTermCharts
                    }
                }
                .padding(.bottom, 32)
            }
            .navigationTitle("Trends")
        }
    }

    // MARK: - Short term (12 weeks, weekly)

    @ViewBuilder
    private var shortTermCharts: some View {
        let weeks = last12Weeks()

        AreaChartView(title: "Weekly Running Distance (km)",
                      unit: "km",
                      data: weeklyRunDistance(weeks: weeks),
                      color: WorkoutType.run.color)
        .padding(.horizontal, 16)

        AreaChartView(title: "Weekly Avg Weight (kg)",
                      unit: "kg",
                      data: weeklyAvgWeight(weeks: weeks),
                      color: .blue)
        .padding(.horizontal, 16)

        AreaChartView(title: "Weekly VO₂ Max",
                      unit: "mL/kg/min",
                      data: weeklyVO2(weeks: weeks),
                      color: .teal)
        .padding(.horizontal, 16)

        AreaChartView(title: "Weekly Avg Energy",
                      unit: "score",
                      data: weeklyAvgEnergy(weeks: weeks),
                      color: .orange)
        .padding(.horizontal, 16)

        AreaChartView(title: "Weekly Avg Sleep Duration",
                      unit: "hours",
                      data: weeklyAvgSleepDuration(weeks: weeks),
                      color: .indigo)
        .padding(.horizontal, 16)
    }

    // MARK: - Long term (monthly)

    @ViewBuilder
    private var longTermCharts: some View {
        let months = allMonths()

        AreaChartView(title: "Monthly Running Distance (km)",
                      unit: "km",
                      data: monthlyRunDistance(months: months),
                      color: WorkoutType.run.color,
                      showYear: true)
        .padding(.horizontal, 16)

        AreaChartView(title: "Monthly Avg Weight (kg)",
                      unit: "kg",
                      data: monthlyAvgWeight(months: months),
                      color: .blue,
                      showYear: true)
        .padding(.horizontal, 16)

        AreaChartView(title: "Monthly VO₂ Max",
                      unit: "mL/kg/min",
                      data: monthlyVO2(months: months),
                      color: .teal,
                      showYear: true)
        .padding(.horizontal, 16)
    }

    // MARK: - Data aggregation

    private struct WeekBucket { let start: Date; let days: [DailyHealthData] }
    private struct MonthBucket { let start: Date; let days: [DailyHealthData] }

    private func last12Weeks() -> [WeekBucket] {
        let cal = Calendar.current
        let cutoff = cal.date(byAdding: .weekOfYear, value: -12, to: .now)!
        var groups: [Date: [DailyHealthData]] = [:]
        for day in hk.dailyData where day.date >= cutoff {
            let ws = cal.dateInterval(of: .weekOfYear, for: day.date)?.start ?? day.date
            groups[ws, default: []].append(day)
        }
        return groups.keys.sorted().map { WeekBucket(start: $0, days: groups[$0]!) }
    }

    private func allMonths() -> [MonthBucket] {
        let cal = Calendar.current
        var groups: [Date: [DailyHealthData]] = [:]
        for day in hk.dailyData {
            let ms = cal.dateInterval(of: .month, for: day.date)?.start ?? day.date
            groups[ms, default: []].append(day)
        }
        return groups.keys.sorted().map { MonthBucket(start: $0, days: groups[$0]!) }
    }

    private func weeklyRunDistance(weeks: [WeekBucket]) -> [ChartDataPoint] {
        weeks.compactMap { w in
            let km = w.days.flatMap { $0.workouts(for: .run) }.compactMap(\.distanceKm).reduce(0, +)
            return km > 0 ? ChartDataPoint(date: w.start, value: km) : nil
        }
    }

    private func weeklyAvgWeight(weeks: [WeekBucket]) -> [ChartDataPoint] {
        weeks.compactMap { w in
            let vals = w.days.compactMap(\.weight)
            guard !vals.isEmpty else { return nil }
            return ChartDataPoint(date: w.start, value: vals.reduce(0, +) / Double(vals.count))
        }
    }

    private func weeklyVO2(weeks: [WeekBucket]) -> [ChartDataPoint] {
        weeks.compactMap { w in
            let vals = w.days.compactMap(\.vo2Max)
            guard !vals.isEmpty else { return nil }
            return ChartDataPoint(date: w.start, value: vals.max()!)
        }
    }

    private func weeklyAvgEnergy(weeks: [WeekBucket]) -> [ChartDataPoint] {
        weeks.compactMap { w in
            let vals = w.days.compactMap { userStore.energy(for: $0.date) }
            guard !vals.isEmpty else { return nil }
            return ChartDataPoint(date: w.start, value: Double(vals.reduce(0, +)) / Double(vals.count))
        }
    }

    private func weeklyAvgSleepDuration(weeks: [WeekBucket]) -> [ChartDataPoint] {
        weeks.compactMap { w in
            let vals = w.days.compactMap { $0.sleep?.totalMinutes }
            guard !vals.isEmpty else { return nil }
            return ChartDataPoint(date: w.start, value: vals.reduce(0, +) / Double(vals.count) / 60)
        }
    }

    private func monthlyRunDistance(months: [MonthBucket]) -> [ChartDataPoint] {
        months.compactMap { m in
            let km = m.days.flatMap { $0.workouts(for: .run) }.compactMap(\.distanceKm).reduce(0, +)
            return km > 0 ? ChartDataPoint(date: m.start, value: km) : nil
        }
    }

    private func monthlyAvgWeight(months: [MonthBucket]) -> [ChartDataPoint] {
        months.compactMap { m in
            let vals = m.days.compactMap(\.weight)
            guard !vals.isEmpty else { return nil }
            return ChartDataPoint(date: m.start, value: vals.reduce(0, +) / Double(vals.count))
        }
    }

    private func monthlyVO2(months: [MonthBucket]) -> [ChartDataPoint] {
        months.compactMap { m in
            let vals = m.days.compactMap(\.vo2Max)
            guard !vals.isEmpty else { return nil }
            return ChartDataPoint(date: m.start, value: vals.max()!)
        }
    }

    // MARK: - AI summary

    private func buildSummary() -> String {
        let weeks = last12Weeks()
        let runKm = weeklyRunDistance(weeks: weeks)
        let weights = weeklyAvgWeight(weeks: weeks)
        let vo2s = weeklyVO2(weeks: weeks)
        let energy = weeklyAvgEnergy(weeks: weeks)
        let sleep = weeklyAvgSleepDuration(weeks: weeks)

        var lines: [String] = ["Last 12 weeks summary:"]
        if let last = runKm.last, let first = runKm.first {
            lines.append("Weekly run distance: \(String(format: "%.1f", first.value))km → \(String(format: "%.1f", last.value))km")
        }
        if let w = weights.last {
            lines.append("Latest avg weight: \(String(format: "%.1f", w.value))kg")
        }
        if let v = vo2s.last {
            lines.append("Latest VO₂ max: \(String(format: "%.1f", v.value)) mL/kg/min")
        }
        if let e = energy.last {
            lines.append("Latest avg energy: \(String(format: "%.1f", e.value))/5")
        }
        if let s = sleep.last {
            lines.append("Latest avg sleep duration: \(String(format: "%.1f", s.value)) hours")
        }
        return lines.joined(separator: "\n")
    }
}
