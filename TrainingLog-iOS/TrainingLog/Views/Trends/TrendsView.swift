import SwiftUI
import Charts

struct TrendsView: View {
    @Environment(HealthKitManager.self) private var hk
    @Environment(UserStore.self) private var userStore

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 20) {
                    charts
                }
                .padding(.bottom, 32)
            }
            .navigationTitle("Trends")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Image(uiImage: (UIImage(named: "AppIcon") ?? UIImage()))
                        .resizable()
                        .frame(width: 28, height: 28)
                        .clipShape(RoundedRectangle(cornerRadius: 7))
                }
            }
        }
    }

    // MARK: - Charts

    @ViewBuilder
    private var charts: some View {
        let months = last36Months()
        let runData    = monthlyRunDistance(months: months)
        let weightData = monthlyAvgWeight(months: months)
        let vo2Data    = monthlyVO2(months: months)
        let energyData = monthlyAvgEnergy(months: months)
        let sleepData  = monthlyAvgSleep(months: months)

        AreaChartView(title: "Monthly Running Distance (km)",
                      unit: "km",
                      data: runData,
                      color: WorkoutType.run.color,
                      showAverage: false,
                      insight: longTermInsight(data: runData, unit: "km", format: "%.1f"),
                      useBarChart: true)
        .padding(.horizontal, 16)

        AreaChartView(title: "Monthly Avg Weight (kg)",
                      unit: "kg",
                      data: weightData,
                      color: .blue,
                      insight: longTermInsight(data: weightData, unit: "kg", format: "%.1f"))
        .padding(.horizontal, 16)

        AreaChartView(title: "Monthly VO₂ Max",
                      unit: "mL/kg/min",
                      data: vo2Data,
                      color: .teal,
                      insight: longTermInsight(data: vo2Data, unit: "mL/kg/min", format: "%.1f"))
        .padding(.horizontal, 16)

        AreaChartView(title: "Monthly Avg Energy",
                      unit: "score",
                      data: energyData,
                      color: .orange,
                      insight: longTermInsight(data: energyData, unit: "/5", format: "%.1f"))
        .padding(.horizontal, 16)

        AreaChartView(title: "Monthly Avg Sleep Duration",
                      unit: "hours",
                      data: sleepData,
                      color: .indigo,
                      insight: longTermInsight(data: sleepData, unit: "hrs", format: "%.1f"))
        .padding(.horizontal, 16)
    }

    // MARK: - Insight

    private func longTermInsight(data: [ChartDataPoint], unit: String, format: String) -> String? {
        guard data.count >= 2, let last = data.last else { return nil }
        let mean = data.map(\.value).reduce(0, +) / Double(data.count)
        let diff = last.value - mean
        let pct = mean != 0 ? abs(diff / mean) * 100 : 0
        let direction = diff > 0.01 ? "above" : diff < -0.01 ? "below" : "at"
        let lastStr = String(format: format, last.value)
        let meanStr = String(format: format, mean)
        if direction == "at" {
            return "Current \(lastStr)\(unit) is right at the historical average."
        }
        return "Current \(lastStr)\(unit) is \(String(format: "%.0f", pct))% \(direction) the historical average of \(meanStr)\(unit)."
    }

    // MARK: - Data aggregation

    private struct MonthBucket { let start: Date; let days: [DailyHealthData] }

    private func last36Months() -> [MonthBucket] {
        let cal = Calendar.current
        let currentMonthStart = cal.dateInterval(of: .month, for: .now)?.start ?? .now
        let cutoff = cal.date(byAdding: .month, value: -36, to: currentMonthStart)!
        var groups: [Date: [DailyHealthData]] = [:]
        for day in hk.dailyData {
            let ms = cal.dateInterval(of: .month, for: day.date)?.start ?? day.date
            guard ms >= cutoff && ms < currentMonthStart else { continue }
            groups[ms, default: []].append(day)
        }
        return groups.keys.sorted().map { MonthBucket(start: $0, days: groups[$0]!) }
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

    private func monthlyAvgEnergy(months: [MonthBucket]) -> [ChartDataPoint] {
        months.compactMap { m in
            let vals = m.days.compactMap { userStore.energy(for: $0.date) }
            guard !vals.isEmpty else { return nil }
            return ChartDataPoint(date: m.start, value: Double(vals.reduce(0, +)) / Double(vals.count))
        }
    }

    private func monthlyAvgSleep(months: [MonthBucket]) -> [ChartDataPoint] {
        months.compactMap { m in
            let vals = m.days.compactMap { $0.sleep?.totalMinutes }
            guard !vals.isEmpty else { return nil }
            return ChartDataPoint(date: m.start, value: vals.reduce(0, +) / Double(vals.count) / 60)
        }
    }
}
