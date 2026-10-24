import SwiftUI

struct LinkWorkoutSheet: View {
    let plan: TrainingPlan
    let session: PlanSession
    let workouts: [HealthWorkout]
    @Environment(\.dismiss) private var dismiss

    private var relevantWorkouts: [HealthWorkout] {
        let hkType = WorkoutType(rawValue: session.type)?.hkWorkoutActivityType
        let sessionDay = Calendar.current.startOfDay(for: session.date)
        return workouts.filter { w in
            w.type.hkWorkoutActivityType == hkType &&
            Calendar.current.startOfDay(for: w.startDate) == sessionDay
        }
    }

    var body: some View {
        NavigationStack {
            Group {
                if relevantWorkouts.isEmpty {
                    VStack(spacing: 16) {
                        Image(systemName: "magnifyingglass")
                            .font(.system(size: 44))
                            .foregroundStyle(.secondary)
                        Text("No matching workouts found in Apple Health for this date.")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                            .multilineTextAlignment(.center)
                    }
                    .padding(32)
                } else {
                    List(relevantWorkouts) { workout in
                        Button {
                            session.linkedWorkoutID = workout.id
                            session.isComplete = true
                            dismiss()
                        } label: {
                            HStack {
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(workout.type.displayName)
                                        .font(.headline)
                                        .foregroundStyle(workout.type.color)
                                    Text("\(workout.durationMinutes) min" +
                                         (workout.distanceKm.map { String(format: " · %.2f km", $0) } ?? ""))
                                        .font(.subheadline)
                                        .foregroundStyle(.secondary)
                                }
                                Spacer()
                                Image(systemName: "link")
                                    .foregroundStyle(.appTeal)
                            }
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            .navigationTitle("Link Workout")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
        }
    }
}
