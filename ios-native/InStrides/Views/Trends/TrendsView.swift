import Charts
import SwiftUI

struct TrendsView: View {
    @Environment(TrainingStore.self) private var store
    @State private var range: TrendRange = .twelveWeeks

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    Picker("Range", selection: $range) {
                        ForEach(TrendRange.allCases) { Text($0.title).tag($0) }
                    }
                    .pickerStyle(.segmented)

                    WeeklyVolumeCard(weeks: store.weeklySummaries(weeks: range.weeks))
                    TrainingLoadCard(points: Array(store.trainingLoad.suffix(range.days)))

                    ForEach(HealthMetric.allCases) { metric in
                        MetricTrendCard(
                            title: metric.title,
                            symbol: metric.symbolName,
                            unit: metric.unitLabel,
                            color: metric.color,
                            values: recent(store.values(for: metric)),
                            format: metric.format
                        )
                    }
                    MetricTrendCard(
                        title: "Sleep",
                        symbol: "bed.double.fill",
                        unit: "hours",
                        color: .indigo,
                        values: recent(store.sleep),
                        format: { $0.formatted(.number.precision(.fractionLength(1))) }
                    )
                }
                .padding()
            }
            .background(Color(.systemGroupedBackground))
            .navigationTitle("Trends")
            .refreshable { await store.refresh() }
        }
    }

    private func recent(_ values: [DailyValue]) -> [DailyValue] {
        guard let start = store.calendar.date(byAdding: .day, value: -range.days, to: .now) else { return values }
        return values.filter { $0.date >= start }
    }
}

enum TrendRange: String, CaseIterable, Identifiable {
    case fourWeeks, twelveWeeks

    var id: String { rawValue }
    var weeks: Int { self == .fourWeeks ? 4 : 12 }
    var days: Int { weeks * 7 }
    var title: String { "\(weeks) weeks" }
}

private struct WeeklyVolumeCard: View {
    let weeks: [WeeklySummary]

    private var kinds: [ActivityKind] {
        let present = Set(weeks.flatMap(\.durationByKind.keys))
        return ActivityKind.allCases.filter(present.contains)
    }

    var body: some View {
        let average = weeks.isEmpty ? 0 : weeks.map(\.duration).reduce(0, +) / Double(weeks.count)
        Card(title: "Weekly Volume", symbol: "chart.bar.fill") {
            Text("\(Format.shortDuration(average)) average per week")
                .font(.headline)
            Chart {
                ForEach(weeks) { week in
                    ForEach(kinds) { kind in
                        BarMark(
                            x: .value("Week", week.weekStart, unit: .weekOfYear),
                            y: .value("Hours", (week.durationByKind[kind] ?? 0) / 3600)
                        )
                        .foregroundStyle(by: .value("Activity", kind.displayName))
                    }
                }
                RuleMark(y: .value("Average", average / 3600))
                    .lineStyle(StrokeStyle(lineWidth: 1, dash: [4, 4]))
                    .foregroundStyle(.secondary)
            }
            .chartForegroundStyleScale(domain: kinds.map(\.displayName), range: kinds.map(\.color))
            .chartYAxisLabel("hours")
            .chartLegend(position: .bottom, alignment: .leading)
            .frame(height: 200)
        }
    }
}

private struct TrainingLoadCard: View {
    let points: [TrainingLoadPoint]

    var body: some View {
        Card(title: "Fitness, Fatigue & Form", symbol: "waveform.path.ecg.rectangle") {
            Chart {
                ForEach(points) { point in
                    LineMark(x: .value("Date", point.date, unit: .day), y: .value("Load", point.fitness))
                        .foregroundStyle(by: .value("Series", "Fitness"))
                    LineMark(x: .value("Date", point.date, unit: .day), y: .value("Load", point.fatigue))
                        .foregroundStyle(by: .value("Series", "Fatigue"))
                }
            }
            .chartForegroundStyleScale(["Fitness": Color.blue, "Fatigue": Color.pink])
            .chartLegend(position: .bottom, alignment: .leading)
            .frame(height: 160)

            Text("Form")
                .font(.subheadline.weight(.semibold))
            Chart(points) { point in
                BarMark(x: .value("Date", point.date, unit: .day), y: .value("Form", point.form))
                    .foregroundStyle(point.status.color)
            }
            .frame(height: 90)

            Text("Fitness is your 42-day average training load and fatigue your 7-day average. Form is the difference: negative while you build, positive when you're fresh.")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }
}

private struct MetricTrendCard: View {
    let title: String
    let symbol: String
    let unit: String
    let color: Color
    let values: [DailyValue]
    let format: (Double) -> String

    var body: some View {
        let average = values.isEmpty ? nil : values.map(\.value).reduce(0, +) / Double(values.count)
        Card(title: title, symbol: symbol) {
            if let average {
                HStack(alignment: .firstTextBaseline, spacing: 4) {
                    Text(format(average))
                        .font(.title2.bold().monospacedDigit())
                    Text("\(unit) avg")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                Chart {
                    ForEach(values) { value in
                        LineMark(x: .value("Date", value.date, unit: .day), y: .value(title, value.value))
                            .foregroundStyle(color)
                            .interpolationMethod(.catmullRom)
                        PointMark(x: .value("Date", value.date, unit: .day), y: .value(title, value.value))
                            .foregroundStyle(color)
                            .symbolSize(12)
                    }
                    RuleMark(y: .value("Average", average))
                        .lineStyle(StrokeStyle(lineWidth: 1, dash: [4, 4]))
                        .foregroundStyle(.secondary)
                }
                .chartYScale(domain: .automatic(includesZero: false))
                .frame(height: 140)
            } else {
                Text("No data in Health for this period.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
        }
    }
}

#Preview {
    TrendsView()
        .previewStore()
}
