import SwiftUI
import SwiftData

struct EditPlanTableSheet: View {
    @Bindable var plan: TrainingPlan
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List {
                Section {
                    HStack(spacing: 0) {
                        Text("Date").frame(width: 90, alignment: .leading)
                        Text("Type").frame(width: 80, alignment: .leading)
                        Text("Target").frame(maxWidth: .infinity, alignment: .leading)
                        Text("✓").frame(width: 32, alignment: .center)
                    }
                    .font(.caption.bold())
                    .foregroundStyle(.secondary)
                } header: {
                    Text(plan.title)
                }

                ForEach($plan.sessions.sorted(by: { $0.date.wrappedValue < $1.date.wrappedValue })) { $session in
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
                        .frame(width: 80)

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
                        .frame(width: 32, alignment: .center)
                    }
                    .padding(.vertical, 2)
                }
                .onDelete { offsets in
                    let sorted = plan.sessions.sorted { $0.date < $1.date }
                    for i in offsets {
                        plan.sessions.removeAll { $0.id == sorted[i].id }
                    }
                }

                Button {
                    let next = plan.sessions.sorted { $0.date < $1.date }.last
                        .flatMap { Calendar.current.date(byAdding: .day, value: 7, to: $0.date) } ?? Date()
                    plan.sessions.append(PlanSession(date: next, type: WorkoutType.run.rawValue, target: ""))
                } label: {
                    Label("Add Session", systemImage: "plus.circle").font(.subheadline)
                }
            }
            .navigationTitle("Edit Sessions")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } }
                ToolbarItem(placement: .navigationBarLeading) { EditButton() }
            }
        }
    }
}
