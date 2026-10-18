import SwiftUI

struct WorkoutDetailSheet: View {
    let workouts: [HealthWorkout]
    @Environment(UserStore.self) private var userStore
    @Environment(\.dismiss) private var dismiss
    @State private var gymWeightInput: String = ""
    @State private var editingWorkout: HealthWorkout?

    private static let timeFmt: DateFormatter = {
        let f = DateFormatter(); f.timeStyle = .short; return f
    }()

    var body: some View {
        NavigationStack {
            List {
                ForEach(workouts) { workout in
                    Section {
                        detailRows(for: workout)
                    } header: {
                        HStack {
                            Circle().fill(workout.type.color).frame(width: 8, height: 8)
                            VStack(alignment: .leading, spacing: 1) {
                                Text(workout.type.displayName)
                                    .font(.subheadline.bold())
                                    .foregroundStyle(workout.type.color)
                                if let src = workout.sourceName {
                                    Text(src)
                                        .font(.caption2)
                                        .foregroundStyle(.secondary)
                                        .textCase(nil)
                                }
                            }
                            Spacer()
                            Text(Self.timeFmt.string(from: workout.startDate))
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
            }
            .navigationTitle(workouts.first.map { $0.type.displayName } ?? "Workout")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
            .sheet(item: $editingWorkout) { workout in
                GymWeightEntrySheet(workout: workout)
            }
        }
    }

    @ViewBuilder
    private func detailRows(for workout: HealthWorkout) -> some View {
        switch workout.type {
        case .run:
            row("Duration", value: "\(workout.durationMinutes) min")
            if let km = workout.distanceKm {
                row("Distance", value: String(format: "%.2f km", km))
            }
            if let pace = workout.avgPacePerKm {
                row("Avg Pace", value: pace)
            }

        case .swim:
            if let km = workout.distanceKm {
                row("Distance", value: String(format: "%.0f m", km * 1000))
            }
            if let pace = workout.avgPacePerKm {
                row("Avg Pace", value: pace)
            }

        case .gym:
            row("Duration", value: "\(workout.durationMinutes) min")
            if let w = userStore.gymWeight(for: workout.id) {
                row("Weight Used", value: "\(Int(w)) kg")
            }
            Button("Log weight used") {
                editingWorkout = workout
            }
            .font(.subheadline)

        case .yoga:
            row("Duration", value: "\(workout.durationMinutes) min")

        case .sit:
            row("Duration", value: "\(workout.durationMinutes) min")
        }

        effortRow(for: workout)
    }

    @ViewBuilder
    private func effortRow(for workout: HealthWorkout) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Effort")
                .foregroundStyle(.secondary)
            HStack(spacing: 6) {
                ForEach(1...10, id: \.self) { i in
                    let selected = (userStore.effort(for: workout.id) ?? 0) >= i
                    Button {
                        userStore.setEffort(i, for: workout.id)
                    } label: {
                        Text("\(i)")
                            .font(.caption.bold())
                            .frame(width: 28, height: 28)
                            .background(selected ? workout.type.color : Color.secondary.opacity(0.15),
                                        in: RoundedRectangle(cornerRadius: 6))
                            .foregroundStyle(selected ? .white : .secondary)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .padding(.vertical, 4)
    }

    private func row(_ label: String, value: String) -> some View {
        HStack {
            Text(label).foregroundStyle(.secondary)
            Spacer()
            Text(value).fontWeight(.medium)
        }
    }
}

struct GymWeightEntrySheet: View {
    let workout: HealthWorkout
    @Environment(UserStore.self) private var userStore
    @Environment(\.dismiss) private var dismiss
    @State private var input = ""

    var body: some View {
        NavigationStack {
            Form {
                Section("Weight used (kg)") {
                    TextField("e.g. 80", text: $input)
                        .keyboardType(.decimalPad)
                }
            }
            .navigationTitle("Log Weight")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        if let v = Double(input) {
                            userStore.setGymWeight(v, for: workout.id)
                        }
                        dismiss()
                    }
                    .disabled(Double(input) == nil)
                }
            }
            .onAppear {
                if let w = userStore.gymWeight(for: workout.id) {
                    input = String(Int(w))
                }
            }
        }
    }
}
