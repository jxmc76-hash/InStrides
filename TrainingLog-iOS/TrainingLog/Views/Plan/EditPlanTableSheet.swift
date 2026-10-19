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
                    // Header row
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
                    let newSession = PlanSession(
                        date: sessions.last.map { Calendar.current.date(byAdding: .day, value: 7, to: $0.date)! } ?? Date(),
                        type: WorkoutType.run.rawValue,
                        target: ""
                    )
                    plan.sessions.append(newSession)
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
    let session: PlanSession
    @State private var date: Date
    @State private var type: WorkoutType
    @State private var target: String
    @State private var isComplete: Bool

    init(session: PlanSession) {
        self.session = session
        _date = State(initialValue: session.date)
        _type = State(initialValue: WorkoutType(rawValue: session.type) ?? .run)
        _target = State(initialValue: session.target)
        _isComplete = State(initialValue: session.isComplete)
    }

    var body: some View {
        HStack(spacing: 0) {
            DatePicker("", selection: $date, displayedComponents: .date)
                .labelsHidden()
                .frame(width: 90)
                .scaleEffect(0.82, anchor: .leading)
                .onChange(of: date) { _, v in session.date = v }

            Picker("", selection: $type) {
                ForEach(WorkoutType.allCases) { t in
                    Text(t.displayName).tag(t)
                }
            }
            .labelsHidden()
            .frame(width: 72)
            .onChange(of: type) { _, v in session.type = v.rawValue }

            TextField("Target", text: $target)
                .font(.subheadline)
                .frame(maxWidth: .infinity)
                .onChange(of: target) { _, v in session.target = v }

            Button {
                isComplete.toggle()
                session.isComplete = isComplete
            } label: {
                Image(systemName: isComplete ? "checkmark.circle.fill" : "circle")
                    .foregroundStyle(isComplete ? .green : .secondary)
            }
            .buttonStyle(.plain)
            .frame(width: 28, alignment: .center)
        }
        .padding(.vertical, 2)
    }
}
