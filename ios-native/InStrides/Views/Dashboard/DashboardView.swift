import Charts
import SwiftUI

struct DashboardView: View {
    @Environment(TrainingStore.self) private var store

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    LoadStatusBanner()
                    FormCard(points: store.trainingLoad)
                    WeekCard(weeks: store.weeklySummaries(weeks: 2))
                    RecoveryGrid()
                    RecentWorkoutsCard(workouts: store.recentWorkouts)
                }
                .padding()
            }
            .background(Color(.systemGroupedBackground))
            .navigationTitle("Today")
            .refreshable { await store.refresh() }
            .navigationDestination(for: WorkoutSummary.self) { WorkoutDetailView(workout: $0) }
        }
    }
}

private struct FormCard: View {
    let points: [TrainingLoadPoint]

    var body: some View {
        Card(title: "Training Form", symbol: "gauge.with.dots.needle.50percent") {
            if let today = points.last {
                HStack(alignment: .firstTextBaseline) {
                    Text(today.status.title)
                        .font(.title.bold())
                        .foregroundStyle(today.status.color)
                    Spacer()
                    Text(today.form, format: .number.precision(.fractionLength(0)).sign(strategy: .always()))
                        .font(.title2.weight(.semibold).monospacedDigit())
                        .foregroundStyle(today.status.color)
                }
                Text(today.status.advice)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)

                Chart(points.suffix(42)) { point in
                    LineMark(x: .value("Date", point.date, unit: .day), y: .value("Load", point.fitness))
                        .foregroundStyle(by: .value("Series", "Fitness"))
                    LineMark(x: .value("Date", point.date, unit: .day), y: .value("Load", point.fatigue))
                        .foregroundStyle(by: .value("Series", "Fatigue"))
                }
                .chartForegroundStyleScale(["Fitness": Color.blue, "Fatigue": Color.pink])
                .chartLegend(position: .bottom, alignment: .leading)
                .chartXAxis {
                    AxisMarks(values: .stride(by: .weekOfYear)) { _ in
                        AxisValueLabel(format: .dateTime.day().month(.abbreviated))
                    }
                }
                .frame(height: 140)

                HStack {
                    StatTile(label: "Fitness", value: today.fitness.formatted(.number.precision(.fractionLength(0))), tint: .blue)
                    StatTile(label: "Fatigue", value: today.fatigue.formatted(.number.precision(.fractionLength(0))), tint: .pink)
                    StatTile(label: "Today's load", value: today.load.formatted(.number.precision(.fractionLength(0))))
                }
            } else {
                Text("Log a few workouts with your Apple Watch or another app and your form will appear here.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
        }
    }
}

private struct WeekCard: View {
    /// Last week and this week, oldest first.
    let weeks: [WeeklySummary]

    var body: some View {
        Card(title: "This Week", symbol: "calendar") {
            if let current = weeks.last {
                let previous = weeks.count > 1 ? weeks[weeks.count - 2] : nil
                HStack {
                    StatTile(label: "Workouts", value: "\(current.workoutCount)")
                    StatTile(label: "Time", value: Format.shortDuration(current.duration))
                    StatTile(label: "Distance", value: Format.distance(current.distanceMeters))
                }
                if let previous, previous.load > 0 {
                    let ratio = current.load / previous.load
                    ProgressView(value: min(ratio, 1)) {
                        Text("Load: \(ratio.formatted(.percent.precision(.fractionLength(0)))) of last week")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    .tint(ratio > 1.3 ? .orange : .brand)
                }
            }
        }
    }
}

private struct RecoveryGrid: View {
    @Environment(TrainingStore.self) private var store

    var body: some View {
        LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)], spacing: 12) {
            ForEach([HealthMetric.restingHeartRate, .heartRateVariability, .vo2Max], id: \.self) { metric in
                MetricTile(
                    title: metric.title,
                    symbol: metric.symbolName,
                    color: metric.color,
                    value: store.latest(metric).map { "\(metric.format($0.value)) \(metric.unitLabel)" },
                    values: Array(store.values(for: metric).suffix(28)),
                    baseline: store.baseline(for: metric),
                    higherIsBetter: metric.higherIsBetter,
                    format: metric.format
                )
            }
            MetricTile(
                title: "Sleep",
                symbol: "bed.double.fill",
                color: .indigo,
                value: store.sleep.last.map { Format.shortDuration($0.value * 3600) },
                values: Array(store.sleep.suffix(28)),
                baseline: store.sleepBaseline,
                higherIsBetter: true,
                format: { Format.shortDuration($0 * 3600) }
            )
        }
    }
}

private struct MetricTile: View {
    let title: String
    let symbol: String
    let color: Color
    let value: String?
    let values: [DailyValue]
    let baseline: Baseline?
    let higherIsBetter: Bool
    let format: (Double) -> String

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Label(title, systemImage: symbol)
                .font(.caption.weight(.semibold))
                .foregroundStyle(color)
            Text(value ?? "—")
                .font(.headline.monospacedDigit())
                .lineLimit(1)
                .minimumScaleFactor(0.7)
            if let baseline {
                ChangeBadge(baseline: baseline, higherIsBetter: higherIsBetter, format: format)
            }
            Sparkline(values: values, color: color)
                .frame(height: 28)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }
}

private struct RecentWorkoutsCard: View {
    let workouts: [WorkoutSummary]

    var body: some View {
        Card(title: "Recent Workouts", symbol: "clock.arrow.circlepath") {
            if workouts.isEmpty {
                Text("No workouts in Health yet.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            ForEach(workouts) { workout in
                NavigationLink(value: workout) {
                    WorkoutRow(workout: workout)
                }
                .buttonStyle(.plain)
                if workout.id != workouts.last?.id {
                    Divider()
                }
            }
        }
    }
}

#Preview {
    DashboardView()
        .previewStore()
}
