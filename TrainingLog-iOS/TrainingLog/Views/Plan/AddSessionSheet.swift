import SwiftUI
import SwiftData

struct AddPlanSheet: View {
    let onCreated: (TrainingPlan) -> Void
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
                        onCreated(plan)
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
    @State private var repeatDaily = false
    @State private var repeatUntil = Date()

    /// Every day from `date` to `repeatUntil` when repeating, otherwise just `date`.
    private var days: [Date] {
        let cal = Calendar.current
        guard repeatDaily else { return [date] }
        var result: [Date] = []
        var day = date
        while cal.startOfDay(for: day) <= cal.startOfDay(for: repeatUntil) && result.count < 400 {
            result.append(day)
            day = cal.date(byAdding: .day, value: 1, to: day) ?? repeatUntil.addingTimeInterval(86_400)
        }
        return result
    }

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
                Section {
                    Toggle("Repeat every day", isOn: $repeatDaily)
                    if repeatDaily {
                        DatePicker("Until", selection: $repeatUntil, in: date..., displayedComponents: .date)
                    }
                } footer: {
                    Text(footerText)
                }
            }
            .onChange(of: date) { _, newDate in
                if repeatUntil < newDate { repeatUntil = newDate }
            }
            .navigationTitle("Add Session")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(days.count > 1 ? "Add \(days.count)" : "Add") {
                        let cal = Calendar.current
                        for day in days {
                            // 7am, matching the default session reminder.
                            let at = cal.date(bySettingHour: 7, minute: 0, second: 0, of: day) ?? day
                            plan.sessions.append(PlanSession(date: at, type: type.rawValue, target: target))
                        }
                        // Stretch the plan to cover sessions added before its start or after its end.
                        if let first = days.min(), first < plan.startDate {
                            plan.startDate = cal.startOfDay(for: first)
                        }
                        if let last = days.max(), last > plan.endDate {
                            plan.endDate = last
                        }
                        try? context.save()
                        dismiss()
                    }
                    .disabled(target.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
        }
    }

    private var footerText: String {
        let earlier = Calendar.current.startOfDay(for: date) < Calendar.current.startOfDay(for: plan.startDate)
        var text = "Pick any date, including days that have already passed."
        if earlier { text += " The plan's start date will move back to fit." }
        return text
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
                        try? plan.modelContext?.save()
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
                        try? session.modelContext?.save()
                        dismiss()
                    }
                    .disabled(target.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
        }
    }
}
