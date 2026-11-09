import SwiftUI
import SwiftData

/// All entries for one body part, newest first.
struct InjuryGroup: Identifiable {
    let id: String
    let entries: [Injury]

    var name: String { entries[0].bodyPart }
    var latest: Injury { entries[0] }
    var firstDate: Date { entries[entries.count - 1].date }
    var peakPain: Int { entries.map(\.pain).max() ?? 0 }
    /// Recent injuries start expanded; older ones start folded away.
    var isRecent: Bool {
        latest.date >= Calendar.current.date(byAdding: .day, value: -14, to: .now) ?? .now
    }

    static func key(for bodyPart: String) -> String {
        bodyPart.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    }
}

/// What the add sheet should start with.
struct AddInjuryRequest: Identifiable {
    let id = UUID()
    var bodyPart = ""
    var pain = 5
}

struct InjuriesView: View {
    @Environment(\.modelContext) private var context
    @Query private var allInjuries: [Injury]
    @State private var addRequest: AddInjuryRequest? = nil
    @State private var editInjury: Injury? = nil
    @State private var injuryToDelete: Injury? = nil
    @State private var showDeleteAlert = false
    /// Groups the user has opened or folded by hand.
    @State private var expandedOverride: [String: Bool] = [:]

    /// Entries grouped by body part, most recently updated injury first.
    private var groups: [InjuryGroup] {
        var order: [String] = []
        var byKey: [String: [Injury]] = [:]
        for injury in allInjuries.sorted(by: { $0.date > $1.date }) {
            let key = InjuryGroup.key(for: injury.bodyPart)
            if byKey[key] == nil { order.append(key) }
            byKey[key, default: []].append(injury)
        }
        return order.map { InjuryGroup(id: $0, entries: byKey[$0] ?? []) }
    }

    var body: some View {
        NavigationStack {
            Group {
                if allInjuries.isEmpty {
                    emptyState
                } else {
                    injuryList
                }
            }
            .navigationTitle("Injuries")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { addRequest = AddInjuryRequest() } label: { Image(systemName: "plus") }
                }
            }
            .sheet(item: $addRequest) { request in
                InjuryFormSheet(request: request, suggestions: groups.prefix(8).map(\.name)) { injury in
                    context.insert(injury)
                    try? context.save()
                    // Make sure the injury just logged is open.
                    expandedOverride[InjuryGroup.key(for: injury.bodyPart)] = true
                }
            }
            .sheet(item: $editInjury) { injury in
                InjuryEditSheet(injury: injury)
            }
            .alert("Delete entry?", isPresented: $showDeleteAlert) {
                Button("Delete", role: .destructive) {
                    if let i = injuryToDelete {
                        context.delete(i)
                        try? context.save()
                    }
                }
                Button("Cancel", role: .cancel) {}
            }
        }
    }

    private var emptyState: some View {
        VStack(spacing: 16) {
            Spacer()
            Image(systemName: "bandage")
                .font(.system(size: 52))
                .foregroundStyle(.secondary)
            Text("No Injuries Logged")
                .font(.title2.bold())
            Text("Track pain and injuries to spot patterns over time.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 32)
            Button("Add Entry") { addRequest = AddInjuryRequest() }
                .buttonStyle(.borderedProminent)
            Spacer()
        }
    }

    private func isExpanded(_ group: InjuryGroup) -> Bool {
        expandedOverride[group.id] ?? group.isRecent
    }

    private var injuryList: some View {
        List {
            ForEach(groups) { group in
                Section {
                    if isExpanded(group) {
                        ForEach(group.entries) { injury in
                            Button { editInjury = injury } label: {
                                InjuryEntryRow(injury: injury)
                            }
                            .buttonStyle(.plain)
                            .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                                Button(role: .destructive) {
                                    injuryToDelete = injury
                                    showDeleteAlert = true
                                } label: {
                                    Label("Delete", systemImage: "trash")
                                }
                            }
                        }
                    }
                } header: {
                    InjuryGroupHeader(
                        group: group,
                        expanded: isExpanded(group),
                        onToggle: { expandedOverride[group.id] = !isExpanded(group) },
                        onAdd: { addRequest = AddInjuryRequest(bodyPart: group.name, pain: group.latest.pain) })
                }
            }
        }
        .listStyle(.plain)
        .contentWidth(760)
    }
}

struct InjuryGroupHeader: View {
    let group: InjuryGroup
    let expanded: Bool
    let onToggle: () -> Void
    let onAdd: () -> Void

    private static let dateFmt: DateFormatter = {
        let f = DateFormatter(); f.dateFormat = "d MMM yy"; return f
    }()

    private var summary: String {
        let count = group.entries.count
        let entries = count == 1 ? "1 entry" : "\(count) entries"
        return "\(entries) · since \(Self.dateFmt.string(from: group.firstDate)) · peak \(group.peakPain)"
    }

    var body: some View {
        HStack(spacing: 10) {
            Button(action: onToggle) {
                HStack(spacing: 8) {
                    Image(systemName: expanded ? "chevron.down" : "chevron.right")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundStyle(.tertiary)
                        .frame(width: 12)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(group.name)
                            .font(.headline)
                            .foregroundStyle(Color.primary)
                        Text(summary)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    Spacer()
                    PainBadge(pain: group.latest.pain)
                }
                .contentShape(Rectangle())
            }
            // Plain, so the heading isn't tinted like a link.
            .buttonStyle(.plain)

            Button(action: onAdd) {
                Image(systemName: "plus.circle.fill")
                    .font(.title2)
                    .foregroundStyle(Color.appTeal)
            }
            .buttonStyle(.borderless)
            .accessibilityLabel("Add today's entry for \(group.name)")
        }
        .textCase(nil)
        .padding(.vertical, 4)
    }
}

/// One day's entry inside an injury group (the body part is in the group heading).
struct InjuryEntryRow: View {
    let injury: Injury

    private static let dateFmt: DateFormatter = {
        let f = DateFormatter(); f.dateFormat = "EEE d MMM"; return f
    }()

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Text(Self.dateFmt.string(from: injury.date))
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .frame(width: 92, alignment: .leading)
            Text(injury.notes.isEmpty ? "No notes" : injury.notes)
                .font(.subheadline)
                .foregroundStyle(injury.notes.isEmpty ? .tertiary : .primary)
                .lineLimit(2)
                .frame(maxWidth: .infinity, alignment: .leading)
            PainBadge(pain: injury.pain)
        }
        .padding(.leading, 20)
        .padding(.vertical, 2)
    }
}

struct PainBadge: View {
    let pain: Int

    private var color: Color {
        switch pain {
        case 1...3: .green
        case 4...6: .orange
        default: .red
        }
    }

    var body: some View {
        Text("\(pain)")
            .font(.caption.bold())
            .foregroundStyle(.white)
            .frame(width: 26, height: 26)
            .background(color, in: Circle())
    }
}

// MARK: - Add form

struct InjuryFormSheet: View {
    /// Recent injury names to pick from instead of typing.
    let suggestions: [String]
    let onCreated: (Injury) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var date = Date()
    @State private var bodyPart: String
    @State private var pain: Int
    @State private var notes = ""

    init(request: AddInjuryRequest, suggestions: [String], onCreated: @escaping (Injury) -> Void) {
        self.suggestions = suggestions
        self.onCreated = onCreated
        _bodyPart = State(initialValue: request.bodyPart)
        _pain = State(initialValue: request.pain)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    DatePicker("Date", selection: $date, displayedComponents: .date)
                    TextField("e.g. Left knee, Achilles", text: $bodyPart)
                    if !suggestions.isEmpty {
                        suggestionChips
                    }
                }
                Section("Pain (1 – 10)") {
                    HStack {
                        Slider(value: Binding(
                            get: { Double(pain) },
                            set: { pain = Int($0.rounded()) }
                        ), in: 1.0...10.0, step: 1.0)
                        .tint(painColor)
                        PainBadge(pain: pain)
                    }
                }
                Section("Notes") {
                    TextField("Optional", text: $notes, axis: .vertical)
                        .lineLimit(3...6)
                }
            }
            .navigationTitle("New Entry")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        onCreated(Injury(date: date, bodyPart: bodyPart.trimmingCharacters(in: .whitespaces), pain: pain, notes: notes.trimmingCharacters(in: .whitespaces)))
                        dismiss()
                    }
                    .disabled(bodyPart.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
        }
    }

    private var suggestionChips: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(suggestions, id: \.self) { name in
                    let selected = InjuryGroup.key(for: name) == InjuryGroup.key(for: bodyPart)
                    Button { bodyPart = name } label: {
                        Text(name)
                            .font(.subheadline)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 6)
                            .foregroundStyle(selected ? Color.white : Color.primary)
                            .background(selected ? Color.appTeal : Color(uiColor: .tertiarySystemFill),
                                        in: Capsule())
                    }
                    .buttonStyle(.borderless)
                }
            }
        }
    }

    private var painColor: Color {
        switch pain {
        case 1...3: .green
        case 4...6: .orange
        default: .red
        }
    }
}

// MARK: - Edit form

struct InjuryEditSheet: View {
    let injury: Injury
    @Environment(\.dismiss) private var dismiss
    @State private var date: Date
    @State private var bodyPart: String
    @State private var pain: Int
    @State private var notes: String

    init(injury: Injury) {
        self.injury = injury
        _date = State(initialValue: injury.date)
        _bodyPart = State(initialValue: injury.bodyPart)
        _pain = State(initialValue: injury.pain)
        _notes = State(initialValue: injury.notes)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    DatePicker("Date", selection: $date, displayedComponents: .date)
                    TextField("Body Part", text: $bodyPart)
                }
                Section("Pain (1 – 10)") {
                    HStack {
                        Slider(value: Binding(
                            get: { Double(pain) },
                            set: { pain = Int($0.rounded()) }
                        ), in: 1.0...10.0, step: 1.0)
                        .tint(painColor)
                        PainBadge(pain: pain)
                    }
                }
                Section("Notes") {
                    TextField("Optional", text: $notes, axis: .vertical)
                        .lineLimit(3...6)
                }
            }
            .navigationTitle("Edit Entry")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        injury.date = date
                        injury.bodyPart = bodyPart.trimmingCharacters(in: .whitespaces)
                        injury.pain = pain
                        injury.notes = notes.trimmingCharacters(in: .whitespaces)
                        try? injury.modelContext?.save()
                        dismiss()
                    }
                    .disabled(bodyPart.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
        }
    }

    private var painColor: Color {
        switch pain {
        case 1...3: .green
        case 4...6: .orange
        default: .red
        }
    }
}
