import SwiftUI

struct SettingsView: View {
    @Environment(TrainingStore.self) private var store

    var body: some View {
        let settings = store.settings

        NavigationStack {
            Form {
                Section {
                    Stepper(value: overrideBinding(\.maxHeartRateOverride, automatic: store.maxHeartRate), in: 120...230) {
                        LabeledContent("Max heart rate", value: settings.maxHeartRateOverride == 0
                            ? "Auto (\(Int(store.maxHeartRate)))"
                            : "\(settings.maxHeartRateOverride) bpm")
                    }
                    Stepper(value: overrideBinding(\.restingHeartRateOverride, automatic: store.restingHeartRate), in: 30...100) {
                        LabeledContent("Resting heart rate", value: settings.restingHeartRateOverride == 0
                            ? "Auto (\(Int(store.restingHeartRate)))"
                            : "\(settings.restingHeartRateOverride) bpm")
                    }
                    if settings.maxHeartRateOverride > 0 || settings.restingHeartRateOverride > 0 {
                        Button("Reset to automatic") {
                            settings.maxHeartRateOverride = 0
                            settings.restingHeartRateOverride = 0
                        }
                    }
                } header: {
                    Text("Heart Rate")
                } footer: {
                    Text(store.estimatedMaxHeartRate == nil
                        ? "Add your date of birth in the Health app to estimate max heart rate, or set it here. A lab or field test is most accurate."
                        : "Auto max heart rate is estimated from your age (208 − 0.7 × age). Auto resting heart rate is your 4-week average from Health.")
                }

                Section("Zones") {
                    ForEach(store.zones.zones) { zone in
                        HStack {
                            Circle().fill(zone.color).frame(width: 10, height: 10)
                            Text("Z\(zone.number) · \(zone.name)")
                            Spacer()
                            Text("\(Int(zone.lowerBound))–\(Int(zone.upperBound)) bpm")
                                .monospacedDigit()
                                .foregroundStyle(.secondary)
                        }
                    }
                }

                Section {
                    Toggle("Use sample data", isOn: Binding(
                        get: { settings.useSampleData },
                        set: { enabled in Task { await store.setUseSampleData(enabled) } }
                    ))
                    Button("Refresh now") {
                        Task { await store.refresh() }
                    }
                    if let lastUpdated = store.lastUpdated {
                        LabeledContent("Last updated", value: lastUpdated.formatted(.relative(presentation: .named)))
                    }
                    LabeledContent("Workouts loaded", value: "\(store.workouts.count)")
                    if let healthURL = URL(string: "x-apple-health://") {
                        Link("Open the Health app", destination: healthURL)
                    }
                } header: {
                    Text("Data")
                } footer: {
                    Text("To change what InStrides can read, open Settings › Health › Data Access & Devices › InStrides.")
                }

                Section("About Training Load") {
                    Text("Each workout's load is its Banister TRIMP: duration weighted by how hard your heart worked relative to your resting and max heart rate. Workouts without heart rate use an estimate for the activity type.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }
            .navigationTitle("Settings")
        }
    }

    /// Steppers start from the automatic value, so the first tap nudges it rather than jumping from 0.
    private func overrideBinding(_ keyPath: ReferenceWritableKeyPath<UserSettings, Int>, automatic: Double) -> Binding<Int> {
        let settings = store.settings
        return Binding(
            get: { settings[keyPath: keyPath] == 0 ? Int(automatic.rounded()) : settings[keyPath: keyPath] },
            set: { settings[keyPath: keyPath] = $0 }
        )
    }
}

#Preview {
    SettingsView()
        .previewStore()
}
