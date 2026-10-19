import SwiftUI
import SwiftData

struct AddPlanSheet: View {
    @Environment(\.modelContext) private var context
    @Environment(\.dismiss) private var dismiss
    @State private var title = ""
    @State private var startDate = Date()
    @State private var endDate = Calendar.current.date(byAdding: .month, value: 3, to: Date())!

    var body: some View {
        NavigationStack {
            Form {
                Section("Plan Details") {
                    TextField("e.g. London Marathon 2026", text: $title)
                    DatePicker("Start Date", selection: $startDate, displayedComponents: .date)
                    DatePicker("Race Date", selection: $endDate, in: startDate..., displayedComponents: .date)
                }
            }
            .navigationTitle("New Plan")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Create") {
                        let plan = TrainingPlan(
                            title: title.trimmingCharacters(in: .whitespaces),
                            startDate: startDate,
                            endDate: endDate
                        )
                        context.insert(plan)
                        try? context.save()
                        dismiss()
                    }
                    .disabled(title.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
        }
    }
}

struct AddSessionSheet: View {
    let plan: TrainingPlan
    @Environment(\.modelContext) private var context
    @Environment(\.dismiss) private var dismiss
    @State private var date = Date()
    @State private var type: WorkoutType = .run
    @State private var target = ""

    var body: some View {
        NavigationStack {
            Form {
                Section("Session") {
                    DatePicker("Date", selection: $date, displayedComponents: .date)
                    Picker("Type", selection: $type) {
                        ForEach(WorkoutType.allCases) { t in
                            Label(t.displayName, systemImage: "circle.fill")
                                .foregroundStyle(t.color)
                                .tag(t)
                        }
                    }
                    TextField("Target (e.g. 10km easy run)", text: $target)
                }
            }
            .navigationTitle("Add Session")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Add") {
                        let session = PlanSession(date: date, type: type.rawValue, target: target)
                        plan.sessions.append(session)
                        dismiss()
                    }
                    .disabled(target.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
        }
    }
}

struct EditPlanSheet: View {
    let plan: TrainingPlan
    @Environment(\.dismiss) private var dismiss
    @State private var title: String
    @State private var startDate: Date
    @State private var endDate: Date

    init(plan: TrainingPlan) {
        self.plan = plan
        _title = State(initialValue: plan.title)
        _startDate = State(initialValue: plan.startDate)
        _endDate = State(initialValue: plan.endDate)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Plan Details") {
                    TextField("Title", text: $title)
                    DatePicker("Start Date", selection: $startDate, displayedComponents: .date)
                    DatePicker("Race Date", selection: $endDate, in: startDate..., displayedComponents: .date)
                }
            }
            .navigationTitle("Edit Plan")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        plan.title = title
                        plan.startDate = startDate
                        plan.endDate = endDate
                        dismiss()
                    }
                    .disabled(title.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
        }
    }
}

struct EditSessionSheet: View {
    let session: PlanSession
    @Environment(\.dismiss) private var dismiss
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
        NavigationStack {
            Form {
                Section("Session") {
                    DatePicker("Date", selection: $date, displayedComponents: .date)
                    Picker("Type", selection: $type) {
                        ForEach(WorkoutType.allCases) { t in
                            Text(t.displayName).tag(t)
                        }
                    }
                    TextField("Target", text: $target)
                    Toggle("Complete", isOn: $isComplete)
                }
            }
            .navigationTitle("Edit Session")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        session.date = date
                        session.type = type.rawValue
                        session.target = target
                        session.isComplete = isComplete
                        dismiss()
                    }
                    .disabled(target.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
        }
    }
}
