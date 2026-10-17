import Charts
import SwiftUI

/// Rounded card used throughout the dashboard.
struct Card<Content: View>: View {
    var title: String?
    var symbol: String?
    @ViewBuilder var content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if let title {
                Label {
                    Text(title)
                } icon: {
                    if let symbol { Image(systemName: symbol) }
                }
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(.secondary)
            }
            content
        }
        .padding()
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }
}

/// A labelled value, e.g. "Distance · 10.2 km".
struct StatTile: View {
    let label: String
    let value: String
    var tint: Color = .primary

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label)
                .font(.caption)
                .foregroundStyle(.secondary)
            Text(value)
                .font(.title3.weight(.semibold).monospacedDigit())
                .foregroundStyle(tint)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct Sparkline: View {
    let values: [DailyValue]
    var color: Color

    var body: some View {
        Chart(values) { point in
            LineMark(x: .value("Date", point.date, unit: .day), y: .value("Value", point.value))
                .interpolationMethod(.catmullRom)
                .foregroundStyle(color)
        }
        .chartXAxis(.hidden)
        .chartYAxis(.hidden)
        .chartYScale(domain: .automatic(includesZero: false))
    }
}

/// Up/down indicator coloured by whether the change is good.
struct ChangeBadge: View {
    let baseline: Baseline
    let higherIsBetter: Bool
    var format: (Double) -> String

    var body: some View {
        let isUp = baseline.change >= 0
        let isGood = isUp == higherIsBetter
        let isFlat = abs(baseline.percentChange) < 0.02
        HStack(spacing: 2) {
            Image(systemName: isFlat ? "equal" : (isUp ? "arrow.up.right" : "arrow.down.right"))
            Text(format(abs(baseline.change)))
        }
        .font(.caption2.weight(.semibold))
        .foregroundStyle(isFlat ? Color.secondary : (isGood ? Color.green : Color.orange))
        .accessibilityLabel(isFlat ? "Steady" : "\(isUp ? "Up" : "Down") \(format(abs(baseline.change))) versus 4-week average")
    }
}

struct WorkoutRow: View {
    let workout: WorkoutSummary

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: workout.kind.symbolName)
                .font(.title3)
                .foregroundStyle(.white)
                .frame(width: 40, height: 40)
                .background(workout.kind.color.gradient, in: Circle())

            VStack(alignment: .leading, spacing: 2) {
                Text(workout.kind.displayName)
                    .font(.headline)
                Text(workout.start.formatted(.dateTime.weekday(.abbreviated).day().month(.abbreviated).hour().minute()))
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Spacer()

            VStack(alignment: .trailing, spacing: 2) {
                if let meters = workout.distanceMeters, meters > 0 {
                    Text(Format.distance(meters))
                        .font(.subheadline.weight(.semibold).monospacedDigit())
                }
                Text(Format.shortDuration(workout.duration))
                    .font(.caption.monospacedDigit())
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 2)
    }
}

/// Shown above content while loading or after an error.
struct LoadStatusBanner: View {
    @Environment(TrainingStore.self) private var store

    var body: some View {
        switch store.phase {
        case .failed(let message):
            Label(message, systemImage: "exclamationmark.triangle.fill")
                .font(.footnote)
                .foregroundStyle(.orange)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding()
                .background(.orange.opacity(0.12), in: RoundedRectangle(cornerRadius: 12))
        case .loading where store.workouts.isEmpty:
            ProgressView("Reading Health data…")
                .frame(maxWidth: .infinity)
                .padding()
        default:
            if store.isUsingSampleData {
                Label("Showing sample data. Turn it off in Settings to use Apple Health.", systemImage: "wand.and.stars")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
    }
}
