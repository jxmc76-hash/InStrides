import SwiftUI
import SwiftData

struct LinkToPlanSheet: View {
    let workout: HealthWorkout
    let plans: [TrainingPlan]
    @Environment(\.dismiss) private var dismiss

    private static let dateFmt: DateFormatter = {
        let f = DateFormatter(); f.dateFormat = "EEE d MMM"; return f
    }()

    var body: some View {
        NavigationStack {
            List {
                ForEach(plans) { plan in
                    let sessions = plan.sessions
                        .filter { $0.linkedWorkoutID == nil }
                        .sorted { $0.date < $1.date }
                    if !sessions.isEmpty {
                        Section(plan.title) {
                            ForEach(sessions) { session in
                                Button {
                                    session.linkedWorkoutID = workout.id
                                    session.isComplete = true
                                    dismiss()
                                } label: {
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text("\(session.type) — \(session.target)")
                                            .font(.subheadline)
                                            .foregroundStyle(.primary)
                                        Text(Self.dateFmt.string(from: session.date))
                                            .font(.caption)
                                            .foregroundStyle(.secondary)
                                    }
                                }
                            }
                        }
                    }
                }
            }
            .navigationTitle("Link to Plan")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
            .overlay {
                if plans.flatMap(\.sessions).filter({ $0.linkedWorkoutID == nil }).isEmpty {
                    ContentUnavailableView("No Unlinked Sessions", systemImage: "calendar.badge.checkmark",
                        description: Text("All plan sessions are already linked to a workout."))
                }
            }
        }
    }
}
