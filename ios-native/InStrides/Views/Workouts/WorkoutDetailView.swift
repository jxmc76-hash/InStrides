import Charts
import MapKit
import SwiftUI

struct WorkoutDetailView: View {
    @Environment(TrainingStore.self) private var store
    let workout: WorkoutSummary

    @State private var heartRate: [HeartRateSample] = []
    @State private var route: [CLLocationCoordinate2D] = []
    @State private var isLoading = true

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                header
                statsGrid
                if !route.isEmpty {
                    RouteMap(coordinates: route, color: workout.kind.color)
                }
                if !heartRate.isEmpty {
                    HeartRateCard(samples: heartRate, zones: store.zones)
                } else if isLoading {
                    ProgressView().padding()
                }
            }
            .padding()
        }
        .background(Color(.systemGroupedBackground))
        .navigationTitle(workout.kind.displayName)
        .navigationBarTitleDisplayMode(.inline)
        .task(id: workout.id) { await loadDetails() }
    }

    private var header: some View {
        HStack(spacing: 16) {
            Image(systemName: workout.kind.symbolName)
                .font(.largeTitle)
                .foregroundStyle(.white)
                .frame(width: 64, height: 64)
                .background(workout.kind.color.gradient, in: Circle())
            VStack(alignment: .leading, spacing: 4) {
                Text(workout.start.formatted(date: .complete, time: .omitted))
                    .font(.headline)
                Text("\(workout.start.formatted(date: .omitted, time: .shortened)) – \(workout.end.formatted(date: .omitted, time: .shortened))")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                Text(workout.sourceName)
                    .font(.caption)
                    .foregroundStyle(.tertiary)
            }
            Spacer()
        }
    }

    private var statsGrid: some View {
        Card {
            Grid(alignment: .leading, horizontalSpacing: 16, verticalSpacing: 16) {
                GridRow {
                    StatTile(label: "Duration", value: Format.duration(workout.duration))
                    if let meters = workout.distanceMeters, meters > 0 {
                        StatTile(label: "Distance", value: Format.distance(meters))
                    } else {
                        StatTile(label: "Energy", value: energy)
                    }
                }
                GridRow {
                    if let meters = workout.distanceMeters,
                       let pace = Format.pace(duration: workout.duration, meters: meters, kind: workout.kind) {
                        StatTile(label: Format.paceLabel(for: workout.kind), value: pace)
                    } else {
                        StatTile(label: "Max HR", value: bpm(workout.maxHeartRate))
                    }
                    StatTile(label: "Avg HR", value: bpm(workout.averageHeartRate), tint: .red)
                }
                GridRow {
                    StatTile(label: "Training load", value: store.loadCalculator.trimp(for: workout).formatted(.number.precision(.fractionLength(0))), tint: .brand)
                    if workout.hasDistance {
                        StatTile(label: "Energy", value: energy)
                    } else {
                        StatTile(label: "Type", value: workout.isIndoor == true ? "Indoor" : "—")
                    }
                }
                if let elevation = workout.elevationGainMeters, elevation > 0 {
                    GridRow {
                        StatTile(label: "Elevation gain", value: Format.elevation(elevation))
                        StatTile(label: "Max HR", value: bpm(workout.maxHeartRate))
                    }
                }
            }
        }
    }

    private var energy: String {
        workout.activeEnergyKcal.map { "\($0.formatted(.number.precision(.fractionLength(0)))) kcal" } ?? "—"
    }

    private func bpm(_ value: Double?) -> String {
        value.map { "\(Int($0.rounded())) bpm" } ?? "—"
    }

    private func loadDetails() async {
        isLoading = true
        defer { isLoading = false }
        async let samples = store.heartRateSamples(for: workout)
        async let points = store.route(for: workout)
        heartRate = await samples
        route = await points.map { CLLocationCoordinate2D(latitude: $0.latitude, longitude: $0.longitude) }
    }
}

private struct RouteMap: View {
    let coordinates: [CLLocationCoordinate2D]
    let color: Color

    var body: some View {
        Map(initialPosition: .automatic, interactionModes: [.zoom, .pan]) {
            MapPolyline(coordinates: coordinates)
                .stroke(color, style: StrokeStyle(lineWidth: 4, lineCap: .round, lineJoin: .round))
            if let first = coordinates.first {
                Annotation("Start", coordinate: first) {
                    Circle()
                        .fill(.green)
                        .overlay(Circle().stroke(.white, lineWidth: 2))
                        .frame(width: 12, height: 12)
                }
            }
        }
        .mapStyle(.standard(elevation: .flat, pointsOfInterest: .excludingAll))
        .frame(height: 240)
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
    }
}

private struct HeartRateCard: View {
    let samples: [HeartRateSample]
    let zones: HeartRateZones

    /// Charts slow down with thousands of points; one point every ~10s of a long workout is plenty.
    private var chartSamples: [HeartRateSample] {
        let stride = max(samples.count / 400, 1)
        return samples.enumerated().compactMap { $0.offset % stride == 0 ? $0.element : nil }
    }

    var body: some View {
        let timeInZones = zones.timeInZones(samples)
        let totalZoneTime = timeInZones.values.reduce(0, +)
        let bpms = samples.map(\.bpm)
        let lower = (bpms.min() ?? 60) - 5
        let upper = (bpms.max() ?? 180) + 5

        Card(title: "Heart Rate", symbol: "heart.fill") {
            Chart {
                ForEach(chartSamples, id: \.date) { sample in
                    AreaMark(x: .value("Time", sample.date), yStart: .value("Min", lower), yEnd: .value("BPM", sample.bpm))
                        .foregroundStyle(LinearGradient(colors: [.red.opacity(0.35), .red.opacity(0.02)], startPoint: .top, endPoint: .bottom))
                        .interpolationMethod(.catmullRom)
                    LineMark(x: .value("Time", sample.date), y: .value("BPM", sample.bpm))
                        .foregroundStyle(.red)
                        .interpolationMethod(.catmullRom)
                }
            }
            .chartYScale(domain: lower...upper)
            .chartXAxis {
                AxisMarks { _ in AxisValueLabel(format: .dateTime.hour().minute()) }
            }
            .frame(height: 180)

            if totalZoneTime > 0 {
                Text("Time in zones")
                    .font(.subheadline.weight(.semibold))
                    .padding(.top, 4)
                ForEach(zones.zones.reversed()) { zone in
                    let seconds = timeInZones[zone.number] ?? 0
                    ZoneBar(zone: zone, seconds: seconds, fraction: seconds / totalZoneTime)
                }
            }
        }
    }
}

private struct ZoneBar: View {
    let zone: HeartRateZone
    let seconds: TimeInterval
    let fraction: Double

    var body: some View {
        HStack(spacing: 8) {
            VStack(alignment: .leading, spacing: 0) {
                Text("Z\(zone.number) \(zone.name)")
                    .font(.caption.weight(.semibold))
                Text("\(Int(zone.lowerBound))–\(Int(zone.upperBound)) bpm")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
            .frame(width: 110, alignment: .leading)

            GeometryReader { proxy in
                RoundedRectangle(cornerRadius: 4)
                    .fill(zone.color.gradient)
                    .frame(width: max(proxy.size.width * fraction, fraction > 0 ? 4 : 0))
            }
            .frame(height: 14)

            Text(Format.shortDuration(seconds))
                .font(.caption.monospacedDigit())
                .foregroundStyle(.secondary)
                .frame(width: 56, alignment: .trailing)
        }
    }
}

#Preview {
    NavigationStack {
        WorkoutDetailView(workout: SampleDataProvider.generateWorkouts(since: .now.addingTimeInterval(-14 * 86_400)).first { $0.kind == .run }!)
    }
    .previewStore()
}
