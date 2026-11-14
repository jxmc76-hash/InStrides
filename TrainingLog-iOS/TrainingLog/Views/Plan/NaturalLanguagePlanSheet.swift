import SwiftUI
import SwiftData
import FoundationModels

// MARK: - Generable types for structured output
//
// The model describes sessions as patterns ("yoga every day for 40 days") and the app
// works out the actual dates, which is far more reliable than asking a small on-device
// model to list dozens of dates itself.

@Generable
struct PlanTextRequest {
    @Guide(description: "Short name for a new plan, e.g. '40 Days of Yoga' or 'Marathon Build'. Empty when changing an existing plan.")
    var planTitle: String

    @Guide(description: "Sessions to add, each described as a pattern")
    var add: [SessionPattern]

    @Guide(description: "Existing sessions to remove, as date ranges")
    var remove: [SessionRemoval]

    @Guide(description: "Changes to individual existing sessions, by their number in the list")
    var update: [SessionChange]
}

@Generable
struct SessionPattern {
    @Guide(description: "Workout type", .anyOf(["run", "yoga", "gym", "swim", "sit", "flexibility"]))
    var type: String

    @Guide(description: "Brief target, e.g. '20 min yoga', 'Easy 5km run' or '45 min gym'")
    var target: String

    @Guide(description: "First date, YYYY-MM-DD")
    var startDate: String

    @Guide(description: "Last date, YYYY-MM-DD. Same as startDate for a single session. Leave as startDate when durationDays is used.")
    var endDate: String

    @Guide(description: "How many days the pattern lasts when the request gives a length, e.g. 'for 40 days' = 40, 'for 6 weeks' = 42. 0 when an end date is given instead.")
    var durationDays: Int

    @Guide(description: "How it repeats", .anyOf(["once", "daily", "weekly"]))
    var repeats: String

    @Guide(description: "For weekly patterns, the days of the week, e.g. [\"Mon\", \"Wed\", \"Fri\"]. Empty otherwise.")
    var weekdays: [String]
}

@Generable
struct SessionRemoval {
    @Guide(description: "First date to remove from, YYYY-MM-DD")
    var fromDate: String

    @Guide(description: "Last date to remove, YYYY-MM-DD")
    var toDate: String

    @Guide(description: "Only remove this workout type, or 'any'", .anyOf(["any", "run", "yoga", "gym", "swim", "sit", "flexibility"]))
    var type: String
}

@Generable
struct SessionChange {
    @Guide(description: "The session's number in the list")
    var number: Int

    @Guide(description: "New date, YYYY-MM-DD (the current date if unchanged)")
    var date: String

    @Guide(description: "New workout type (the current type if unchanged)", .anyOf(["run", "yoga", "gym", "swim", "sit", "flexibility"]))
    var type: String

    @Guide(description: "New target (the current target if unchanged)")
    var target: String
}

// MARK: - Worked-out changes

/// A session the app will create, with its date already worked out.
struct DraftSession: Identifiable {
    let id = UUID()
    let date: Date
    let type: WorkoutType
    let target: String
}

/// Everything a request will do, ready to preview and apply.
struct PlanChanges {
    var title: String
    var additions: [DraftSession] = []
    var removals: [PlanSession] = []
    var updates: [(session: PlanSession, to: DraftSession)] = []

    var isEmpty: Bool { additions.isEmpty && removals.isEmpty && updates.isEmpty }
}

// MARK: - View

/// Create a plan, or change an existing one, by describing it in plain English.
struct NaturalLanguagePlanSheet: View {
    /// nil to create a new plan.
    let plan: TrainingPlan?
    @Environment(\.modelContext) private var modelContext
    @Environment(\.dismiss) private var dismiss

    @State private var input = ""
    @State private var isProcessing = false
    @State private var errorMessage: String? = nil
    @State private var changes: PlanChanges? = nil
    @FocusState private var inputFocused: Bool

    private var isNewPlan: Bool { plan == nil }

    /// Most sessions one request may add, to guard against a runaway pattern.
    private static let maxSessions = 400
    /// New sessions are timed for 7am, matching the default session reminder.
    private static let sessionHour = 7

    private static let dateFmt: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    private static let dayFmt: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "EEE yyyy-MM-dd"
        return f
    }()

    private static let shortFmt: DateFormatter = {
        let f = DateFormatter(); f.dateFormat = "EEE d MMM"; return f
    }()

    var body: some View {
        NavigationStack {
            Group {
                if let changes {
                    previewSection(changes)
                } else {
                    inputSection
                }
            }
            .navigationTitle(isNewPlan ? "Describe a Plan" : "Change Plan")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                if let changes {
                    ToolbarItem(placement: .confirmationAction) {
                        Button(isNewPlan ? "Create" : "Apply") { apply(changes) }
                            .disabled(changes.isEmpty || (isNewPlan && changes.title.trimmingCharacters(in: .whitespaces).isEmpty))
                    }
                }
            }
        }
        .presentationDetents([.large])
    }

    // MARK: - Input

    private var examples: [String] {
        isNewPlan
            ? ["I'll do yoga every day for the next 40 days",
               "Run Monday, Wednesday and Friday until Christmas",
               "Gym twice a week, Tuesdays and Thursdays, for 8 weeks"]
            : ["Add a 10km run next Saturday",
               "No yoga on Sundays",
               "Move Thursday's run to Friday",
               "Remove everything after the 20th"]
    }

    private var inputSection: some View {
        ScrollView {
            VStack(spacing: 24) {
                VStack(alignment: .leading, spacing: 8) {
                    Text(isNewPlan ? "What's the plan?" : "What would you like to change?")
                        .font(.headline)
                    if let plan {
                        Text(plan.title)
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                    TextEditor(text: $input)
                        .focused($inputFocused)
                        .frame(minHeight: 100)
                        .padding(10)
                        .scrollContentBackground(.hidden)
                        .background(Color.secondary.opacity(0.1), in: RoundedRectangle(cornerRadius: 10))
                }

                VStack(alignment: .leading, spacing: 6) {
                    Text("Examples")
                        .font(.caption.bold())
                        .foregroundStyle(.secondary)
                    ForEach(examples, id: \.self) { example in
                        Button {
                            input = example
                        } label: {
                            Text(example)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                                .padding(.horizontal, 10)
                                .padding(.vertical, 5)
                                .background(Color.secondary.opacity(0.1), in: Capsule())
                        }
                        .buttonStyle(.plain)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)

                if let err = errorMessage {
                    Text(err)
                        .font(.callout)
                        .foregroundStyle(.red)
                        .multilineTextAlignment(.center)
                }

                Button {
                    inputFocused = false
                    Task { await process() }
                } label: {
                    Group {
                        if isProcessing {
                            HStack(spacing: 8) {
                                ProgressView().tint(.white)
                                Text("Thinking…")
                            }
                        } else {
                            Label("Preview", systemImage: "sparkles")
                        }
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .background(input.trimmingCharacters(in: .whitespaces).isEmpty ? Color.secondary : Color.appTeal)
                    .foregroundStyle(.white)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                }
                .disabled(input.trimmingCharacters(in: .whitespaces).isEmpty || isProcessing)
            }
            .padding(20)
        }
        .scrollDismissesKeyboard(.interactively)
    }

    // MARK: - Preview

    @ViewBuilder
    private func previewSection(_ preview: PlanChanges) -> some View {
        List {
            if isNewPlan {
                Section("Plan name") {
                    TextField("Plan name", text: Binding(
                        get: { changes?.title ?? "" },
                        set: { changes?.title = $0 }))
                }
            }

            if preview.isEmpty {
                Section {
                    Text("That didn't produce any changes. Go back and try wording it differently.")
                        .foregroundStyle(.secondary)
                }
            }

            if !preview.additions.isEmpty {
                Section("Add \(preview.additions.count) session\(preview.additions.count == 1 ? "" : "s")") {
                    ForEach(preview.additions) { draftRow($0, icon: "plus.circle.fill", tint: .green) }
                }
            }
            if !preview.removals.isEmpty {
                Section("Remove \(preview.removals.count) session\(preview.removals.count == 1 ? "" : "s")") {
                    ForEach(preview.removals, id: \.persistentModelID) { s in
                        sessionRow(date: s.date, type: WorkoutType(rawValue: s.type), target: s.target,
                                   icon: "minus.circle.fill", tint: .red)
                    }
                }
            }
            if !preview.updates.isEmpty {
                Section("Change") {
                    ForEach(preview.updates, id: \.to.id) { draftRow($0.to, icon: "pencil.circle.fill", tint: .appTeal) }
                }
            }

            Section {
                Button("Start over") {
                    changes = nil
                }
            }
        }
    }

    private func draftRow(_ d: DraftSession, icon: String, tint: Color) -> some View {
        sessionRow(date: d.date, type: d.type, target: d.target, icon: icon, tint: tint)
    }

    private func sessionRow(date: Date, type: WorkoutType?, target: String, icon: String, tint: Color) -> some View {
        HStack(spacing: 10) {
            Image(systemName: icon).foregroundStyle(tint)
            Text(Self.shortFmt.string(from: date))
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .frame(width: 84, alignment: .leading)
            if let type {
                Image(systemName: type.icon).foregroundStyle(type.color)
            }
            Text(target.isEmpty ? (type?.displayName ?? "") : target)
                .font(.subheadline)
                .lineLimit(1)
        }
    }

    // MARK: - Asking the model

    /// Existing sessions shown to the model, numbered from 1. Older history is left out
    /// to keep the prompt small.
    private var listedSessions: [PlanSession] {
        guard let plan else { return [] }
        let from = Calendar.current.date(byAdding: .day, value: -7, to: Calendar.current.startOfDay(for: .now)) ?? .now
        return Array(plan.sessions.filter { $0.date >= from }.sorted { $0.date < $1.date }.prefix(150))
    }

    private func process() async {
        errorMessage = nil
        switch SystemLanguageModel.default.availability {
        case .available:
            break
        case .unavailable(.deviceNotEligible):
            errorMessage = "This needs Apple Intelligence, which this device doesn't support. Try it on a newer iPhone, iPad or Mac."
            return
        case .unavailable(.appleIntelligenceNotEnabled):
            errorMessage = "Turn on Apple Intelligence in Settings to use this."
            return
        case .unavailable(.modelNotReady):
            errorMessage = "Apple Intelligence is still getting ready on this device. Try again in a little while."
            return
        case .unavailable:
            errorMessage = "Apple Intelligence isn't available on this device right now."
            return
        }

        isProcessing = true
        defer { isProcessing = false }

        let cal = Calendar.current
        let today = cal.startOfDay(for: .now)
        // A day-by-day calendar so the model doesn't have to work out weekdays itself.
        let upcoming = (0..<21).compactMap { cal.date(byAdding: .day, value: $0, to: today) }
            .map { Self.dayFmt.string(from: $0) }
            .joined(separator: ", ")

        let sessionList = listedSessions.enumerated().map { i, s in
            "\(i + 1). \(Self.dayFmt.string(from: s.date)) — \(s.type.lowercased()) — \(s.target)"
        }.joined(separator: "\n")

        let context: String
        if let plan {
            context = """
            The user is changing their plan "\(plan.title)" (\(Self.dateFmt.string(from: plan.startDate)) to \(Self.dateFmt.string(from: plan.endDate))).
            Current sessions:
            \(sessionList.isEmpty ? "(none)" : sessionList)
            Leave planTitle empty.
            """
        } else {
            context = "The user is creating a new training plan. Give it a short planTitle. Add sessions only; remove and update must be empty."
        }

        let prompt = """
        Today is \(Self.dayFmt.string(from: today)).
        The next three weeks: \(upcoming).
        \(context)

        Request: \(input)

        Describe repeating sessions as one pattern rather than listing each day. \
        When the request gives a length ("for 40 days", "for 6 weeks"), set durationDays. \
        If no start is given, start today.
        Examples:
        - "yoga every day for 40 days" → repeats daily, weekdays [], durationDays 40
        - "swim every Saturday until Christmas" → repeats weekly, weekdays ["Sat"], endDate the 25th of December
        - "run Mondays and Thursdays" → repeats weekly, weekdays ["Mon", "Thu"]
        - "a 10km run next Saturday" → repeats once, startDate and endDate that Saturday
        """

        do {
            let session = LanguageModelSession(instructions: """
                You turn plain-English training plans into structured changes. \
                Workout types: run, yoga, gym, swim, sit (seated meditation / mind and body), flexibility (stretching). \
                Only include what the request asks for.
                """)
            let response = try await session.respond(to: prompt, generating: PlanTextRequest.self)
            let worked = workOut(response.content)
            if worked.additions.count > Self.maxSessions {
                errorMessage = "That would add \(worked.additions.count) sessions, which looks wrong. Try giving an end date."
                return
            }
            changes = worked
        } catch {
            errorMessage = "Couldn't work that out. Try rewording it, e.g. \"\(examples[0])\"."
        }
    }

    // MARK: - Working out dates

    private func workOut(_ request: PlanTextRequest) -> PlanChanges {
        var result = PlanChanges(title: plan?.title ?? request.planTitle)
        // The days-named-in-the-text safety net only makes sense for a single pattern.
        let useNamedDays = request.add.count == 1
        result.additions = request.add.flatMap { expand($0, useNamedDays: useNamedDays) }.sorted { $0.date < $1.date }

        guard let plan else { return result }

        // The small on-device model sometimes invents additions, removals or changes nobody
        // asked for. Only act on each kind when the request's own words ask for it.
        let words = " " + input.lowercased() + " "
        let asksToRemove = Self.removeWords.contains { words.contains($0) }
        let asksToChange = Self.changeWords.contains { words.contains($0) }
        let asksToAdd = Self.addWords.contains { words.contains($0) } || !(asksToRemove || asksToChange)

        let cal = Calendar.current
        var removing: [PlanSession] = []
        for r in request.remove where asksToRemove || asksToChange {
            guard let from = Self.dateFmt.date(from: r.fromDate),
                  let to = Self.dateFmt.date(from: r.toDate) else { continue }
            let type = r.type == "any" ? nil : workoutType(r.type)
            let last = cal.date(byAdding: .day, value: 1, to: cal.startOfDay(for: to)) ?? to
            for s in plan.sessions where s.date >= cal.startOfDay(for: from) && s.date < last {
                if let type, WorkoutType(rawValue: s.type) != type { continue }
                if !removing.contains(where: { $0 === s }) { removing.append(s) }
            }
        }

        // A move can come back as "remove the old one, add a new one" with the same target.
        // Pair those up and treat them as a change of date instead, but only when the
        // request is about moving or changing (a plain "skip" must stay a removal).
        var additions = result.additions
        for session in removing where asksToChange {
            if let i = additions.firstIndex(where: {
                $0.type.rawValue == session.type && $0.target.lowercased() == session.target.lowercased()
            }) {
                result.updates.append((session, additions.remove(at: i)))
            }
        }
        removing.removeAll { s in result.updates.contains { $0.session === s } }

        if !asksToAdd { additions = [] }
        // Copies of sessions already in the plan are the model echoing the list back.
        let existingTargets = Set(plan.sessions.map { $0.target.lowercased() })
        additions.removeAll { !$0.target.isEmpty && existingTargets.contains($0.target.lowercased()) }
        result.additions = additions

        // A request that only asks to change sessions shouldn't delete any.
        result.removals = asksToRemove ? removing.sorted { $0.date < $1.date } : []

        let listed = listedSessions
        for u in request.update where asksToChange {
            guard u.number >= 1, u.number <= listed.count,
                  let day = Self.dateFmt.date(from: u.date),
                  let type = workoutType(u.type) else { continue }
            let session = listed[u.number - 1]
            if removing.contains(where: { $0 === session }) { continue }
            if result.updates.contains(where: { $0.session === session }) { continue }
            result.updates.append((session, DraftSession(date: at7am(day), type: type, target: u.target)))
        }
        return result
    }

    private static let removeWords = ["remove", "delete", "cancel", "drop", "skip", "clear", " no ",
                                      "not ", "don't", "dont", "without", "stop", "instead", "replace",
                                      "swap", "get rid", "take out", "scrap", "ditch", "only "]
    private static let addWords = ["add", "also", "extra", "another", "plus", "every", "each", "daily",
                                   "weekly", "schedule", "put ", "book", "include", "instead", "replace",
                                   "swap", "times a", "twice", "i'll do", "i will do", "new "]
    private static let changeWords = ["move", "change", "swap", "replace", "instead", "reschedule",
                                      "shift", "push", "switch", "rename", "update", "edit", "make ",
                                      "turn ", "bring forward", "postpone"]

    private func expand(_ p: SessionPattern, useNamedDays: Bool) -> [DraftSession] {
        let cal = Calendar.current
        guard let type = workoutType(p.type),
              let start = Self.dateFmt.date(from: p.startDate) else { return [] }
        var end = Self.dateFmt.date(from: p.endDate) ?? start
        if p.durationDays > 0 {
            end = cal.date(byAdding: .day, value: p.durationDays - 1, to: start) ?? start
        }
        if end < start { end = start }

        var repeats = p.repeats
        var weekdays = Set(p.weekdays.compactMap(weekdayNumber))
        // Safety net: if the words name particular days and don't say "every day", go by
        // those days whatever the model returned.
        let named = weekdaysNamed(in: input)
        let saysDaily = input.lowercased().contains("every day") || input.lowercased().contains("daily")
            || input.lowercased().contains("everyday")
        if useNamedDays, repeats != "once", !named.isEmpty, !saysDaily {
            repeats = "weekly"
            weekdays = named
        }
        // A weekly pattern with no days given repeats on the start date's weekday.
        if repeats == "weekly", weekdays.isEmpty {
            weekdays = [cal.component(.weekday, from: start)]
        }
        if repeats == "once" { end = start }

        var drafts: [DraftSession] = []
        var day = start
        while day <= end && drafts.count <= Self.maxSessions {
            let include = repeats == "weekly" ? weekdays.contains(cal.component(.weekday, from: day)) : true
            if include {
                drafts.append(DraftSession(date: at7am(day), type: type, target: p.target))
            }
            day = cal.date(byAdding: .day, value: 1, to: day) ?? end.addingTimeInterval(86_400)
        }
        return drafts
    }

    private func workoutType(_ name: String) -> WorkoutType? {
        WorkoutType(rawValue: name.uppercased())
    }

    /// "Mon", "monday", "Tues" → Calendar weekday number (Sunday = 1).
    private func weekdayNumber(_ name: String) -> Int? {
        switch name.lowercased().prefix(2) {
        case "su": 1
        case "mo": 2
        case "tu": 3
        case "we": 4
        case "th": 5
        case "fr": 6
        case "sa": 7
        default: nil
        }
    }

    /// Weekdays named in the request, e.g. "every Saturday" or "Mondays and Thursdays".
    private func weekdaysNamed(in text: String) -> Set<Int> {
        let names = ["sunday": 1, "monday": 2, "tuesday": 3, "wednesday": 4,
                     "thursday": 5, "friday": 6, "saturday": 7]
        let lower = text.lowercased()
        return Set(names.compactMap { lower.contains($0.key) ? $0.value : nil })
    }

    private func at7am(_ day: Date) -> Date {
        Calendar.current.date(bySettingHour: Self.sessionHour, minute: 0, second: 0, of: day) ?? day
    }

    // MARK: - Saving

    private func apply(_ changes: PlanChanges) {
        let target: TrainingPlan
        if let plan {
            target = plan
        } else {
            let dates = changes.additions.map(\.date)
            let start = Calendar.current.startOfDay(for: dates.min() ?? .now)
            target = TrainingPlan(title: changes.title.trimmingCharacters(in: .whitespaces),
                                  startDate: start, endDate: dates.max() ?? start)
            modelContext.insert(target)
        }

        for s in changes.removals {
            modelContext.delete(s)
        }
        for u in changes.updates {
            u.session.date = u.to.date
            u.session.type = u.to.type.rawValue
            u.session.target = u.to.target
        }
        for a in changes.additions {
            target.sessions.append(PlanSession(date: a.date, type: a.type.rawValue, target: a.target))
        }

        // Stretch the plan's dates if the new sessions go beyond them.
        if let last = changes.additions.map(\.date).max(), last > target.endDate {
            target.endDate = last
        }
        if let first = changes.additions.map(\.date).min(), first < target.startDate {
            target.startDate = Calendar.current.startOfDay(for: first)
        }

        try? modelContext.save()
        dismiss()
    }
}
