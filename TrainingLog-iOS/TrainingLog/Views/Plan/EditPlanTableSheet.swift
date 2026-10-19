import SwiftUI
import SwiftData

struct EditPlanTableSheet: View {
    let plan: TrainingPlan
    @Environment(\.modelContext) private var context
    @Environment(\.dismiss) private var dismiss

    private var sessions: [PlanSession] {
        plan.sessions.sorted { $0.date < $1.date }
    }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    HStack(spacing: 0) {
                        Text("Date")
                            .frame(width: 90, alignment: .leading)
                        Text("Type")
                            .frame(width: 72, alignment: .leading)
                        Text("Target")
                            .frame(maxWidth: .infinity, alignment: .leading)
                        Text("✓")
                            .frame(width: 28, alignment: .center)
                    }
                    .font(.caption.bold())
                    .foregroundStyle(.secondary)
                    .listRowBackground(Color(uiColor: .secondarySystemGroupedBackground))
                } header: {
                    Text(plan.title)
                }

                ForEach(sessions) { session in
                    SessionTableRow(session: session)
                }
                .onDelete { offsets in
                    let sorted = sessions
                    for i in offsets {
                        plan.sessions.removeAll { $0.id == sorted[i].id }
                    }
                }

                Button {
                    let next = sessions.last.flatMap {
                        Calendar.current.date(byAdding: .day, value: 7, to: $0.date)
                    } ?? Date()
                    let s = PlanSession(date: next, type: WorkoutType.run.rawValue, target: "")
                    plan.sessions.append(s)
                } label: {
                    Label("Add Session", systemImage: "plus.circle")
                        .font(.subheadline)
                }
            }
            .navigationTitle("Edit Sessions")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
                ToolbarItem(placement: .navigationBarLeading) {
                    EditButton()
                }
            }
        }
    }
}

private struct SessionTableRow: View {
    @Bindable var session: PlanSession

    var body: some View {
        HStack(spacing: 0) {
            DatePicker("", selection: $session.date, displayedComponents: .date)
                .labelsHidden()
                .frame(width: 90)
                .scaleEffect(0.82, anchor: .leading)

            Picker("", selection: Binding(
                get: { WorkoutType(rawValue: session.type) ?? .run },
                set: { session.type = $0.rawValue }
            )) {
                ForEach(WorkoutType.allCases) { t in
                    Text(t.displayName).tag(t)
                }
            }
            .labelsHidden()
            .frame(width: 72)

            TextField("Target", text: $session.target)
                .font(.subheadline)
                .frame(maxWidth: .infinity)

            Button {
                session.isComplete.toggle()
            } label: {
                Image(systemName: session.isComplete ? "checkmark.circle.fill" : "circle")
                    .foregroundStyle(session.isComplete ? .green : .secondary)
            }
            .buttonStyle(.plain)
            .frame(width: 28, alignment: .center)
        }
        .padding(.vertical, 2)
    }
}
