import SwiftUI
import SwiftData

struct InjuriesView: View {
    @Environment(\.modelContainer) private var container
    private var context: ModelContext { container.mainContext }
    @State private var injuries: [Injury] = []
    @State private var showAdd = false
    @State private var editInjury: Injury? = nil
    @State private var injuryToDelete: Injury? = nil
    @State private var showDeleteAlert = false

    var body: some View {
        NavigationStack {
            Group {
                if injuries.isEmpty {
                    emptyState
                } else {
                    injuryTable
                }
            }
            .navigationTitle("Injuries")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { showAdd = true } label: { Image(systemName: "plus") }
                }
            }
            .onAppear { injuries = fetch() }
            .sheet(isPresented: $showAdd, onDismiss: { injuries = fetch() }) {
                InjuryFormSheet { injury in
                    context.insert(injury)
                    try? context.save()
                    injuries = fetch()
                }
            }
            .sheet(item: $editInjury, onDismiss: { injuries = fetch() }) { injury in
                InjuryEditSheet(injury: injury)
            }
            .alert("Delete entry?", isPresented: $showDeleteAlert) {
                Button("Delete", role: .destructive) {
                    if let i = injuryToDelete { context.delete(i); try? context.save() }
                    injuries = fetch()
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
            Button("Add Entry") { showAdd = true }
                .buttonStyle(.borderedProminent)
            Spacer()
        }
    }

    private var injuryTable: some View {
        List {
            // Column headers
            HStack(spacing: 0) {
                Text("Date")
                    .frame(width: 80, alignment: .leading)
                Text("Body Part")
                    .frame(maxWidth: .infinity, alignment: .leading)
                Text("Pain")
                    .frame(width: 44, alignment: .center)
            }
            .font(.caption.bold())
            .foregroundStyle(.secondary)
            .listRowBackground(Color.clear)
            .listRowSeparator(.hidden)

            ForEach(injuries) { injury in
                Button { editInjury = injury } label: {
                    InjuryRow(injury: injury)
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
        .listStyle(.plain)
    }

    private func fetch() -> [Injury] {
        let descriptor = FetchDescriptor<Injury>()
        let result = (try? context.fetch(descriptor)) ?? []
        return result.sorted { $0.date > $1.date }
    }
}

struct InjuryRow: View {
    let injury: Injury

    private static let dateFmt: DateFormatter = {
        let f = DateFormatter(); f.dateFormat = "d MMM yy"; return f
    }()

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 0) {
                Text(Self.dateFmt.string(from: injury.date))
                    .frame(width: 80, alignment: .leading)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)

                Text(injury.bodyPart)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .font(.subheadline.bold())

                PainBadge(pain: injury.pain)
                    .frame(width: 44, alignment: .center)
            }
            if !injury.notes.isEmpty {
                Text(injury.notes)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
                    .padding(.leading, 80)
            }
        }
        .padding(.vertical, 4)
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
    let onCreated: (Injury) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var date = Date()
    @State private var bodyPart = ""
    @State private var pain = 5
    @State private var notes = ""

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    DatePicker("Date", selection: $date, displayedComponents: .date)
                    TextField("e.g. Left knee, Achilles", text: $bodyPart)
                }
                Section("Pain (1 – 10)") {
                    HStack {
                        Slider(value: Binding(
                            get: { Double(pain) },
                            set: { pain = Int($0.rounded()) }
                        ), in: 1...10, step: 1)
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
                        ), in: 1...10, step: 1)
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
