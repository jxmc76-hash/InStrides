import SwiftUI
import SwiftData
import FoundationModels

// MARK: - Generable types for structured output

@Generable
struct PlanEdit {
    @Guide(description: "Sessions to add to the plan")
    var additions: [SessionAddition]

    @Guide(description: "Zero-based indices (from the numbered list) of sessions to remove")
    var removals: [Int]

    @Guide(description: "Updates to existing sessions by zero-based index")
    var updates: [SessionUpdate]
}

@Generable
struct SessionAddition {
    @Guide(description: "Date in YYYY-MM-DD format")
    var date: String

    @Guide(description: "Workout type: run, gym, swim, yoga, or sit")
    var type: String

    @Guide(description: "Brief target description, e.g. 'Easy 5km run' or '45 min gym'")
    var target: String
}

@Generable
struct SessionUpdate {
    @Guide(description: "Zero-based index of the session to update")
    var index: Int

    @Guide(description: "Updated date in YYYY-MM-DD format")
    var date: String

    @Guide(description: "Updated workout type: run, gym, swim, yoga, or sit")
    var type: String

    @Guide(description: "Updated target description")
    var target: String
}

// MARK: - View

struct NaturalLanguagePlanSheet: View {
    let plan: TrainingPlan
    @Environment(\.modelContext) private var modelContext
    @Environment(\.dismiss) private var dismiss

    @State private var input = ""
    @State private var isProcessing = false
    @State private var errorMessage: String? = nil
    @State private var pendingEdit: PlanEdit? = nil
    @State private var showPreview = false

    private static let dateFmt: DateFormatter = {
        let f = DateFormatter(); f.dateFormat = "YYYY-MM-dd"; return f
    }()

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                if let edit = pendingEdit, showPreview {
                    previewSection(edit: edit)
                } else {
                    inputSection
                }
            }
            .navigationTitle("Edit Plan")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                if showPreview, let edit = pendingEdit {
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Apply") { apply(edit: edit) }
                    }
                }
            }
        }
        .presentationDetents([.medium, .large])
    }

    // MARK: - Input

    private var inputSection: some View {
        VStack(spacing: 24) {
            VStack(alignment: .leading, spacing: 8) {
                Text("What would you like to change?")
                    .font(.headline)
                TextEditor(text: $input)
                    .frame(minHeight: 100)
                    .padding(10)
                    .background(Color.secondary.opacity(0.1), in: RoundedRectangle(cornerRadius: 10))
            }

            VStack(alignment: .leading, spacing: 6) {
                Text("Examples")
                    .font(.caption.bold())
                    .foregroundStyle(.secondary)
                ForEach([
                    "Add a 10km run next Saturday",
                    "Move Thursday's run to Friday",
                    "Change the Wednesday session to a gym session",
                    "Remove all sessions after the 20th"
                ], id: \.self) { example in
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
                    .font(.caption)
                    .foregroundStyle(.red)
                    .multilineTextAlignment(.center)
            }

            Button {
                Task { await process() }
            } label: {
                Group {
                    if isProcessing {
                        HStack(spacing: 8) {
                            ProgressView().tint(.white)
                            Text("Thinking…")
                        }
                    } else {
                        Text("Update Plan")
                    }
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 12)
                .background(input.trimmingCharacters(in: .whitespaces).isEmpty ? Color.secondary : Color.orange)
                .foregroundStyle(.white)
                .clipShape(RoundedRectangle(cornerRadius: 12))
            }
            .disabled(input.trimmingCharacters(in: .whitespaces).isEmpty || isProcessing)

            Spacer()
        }
        .padding(20)
    }

    // MARK: - Preview

    @ViewBuilder
    private func previewSection(edit: PlanEdit) -> some View {
        List {
            if !edit.additions.isEmpty {
                Section("Add") {
                    ForEach(edit.additions, id: \.date) { a in
                        Label("\(a.type.capitalized) — \(a.target) (\(a.date))",
                              systemImage: "plus.circle.fill")
                            .foregroundStyle(.green)
                            .font(.subheadline)
                    }
                }
            }
            if !edit.removals.isEmpty {
                Section("Remove") {
                    let sorted = plan.sessions.sorted { $0.date < $1.date }
                    ForEach(edit.removals, id: \.self) { i in
                        if i < sorted.count {
                            let s = sorted[i]
                            Label("\(s.type.capitalized) — \(s.target)",
                                  systemImage: "minus.circle.fill")
                                .foregroundStyle(.red)
                                .font(.subheadline)
                        }
                    }
                }
            }
            if !edit.updates.isEmpty {
                Section("Update") {
                    ForEach(edit.updates, id: \.index) { u in
                        Label("\(u.type.capitalized) — \(u.target) (\(u.date))",
                              systemImage: "pencil.circle.fill")
                            .foregroundStyle(.orange)
                            .font(.subheadline)
                    }
                }
            }
        }
    }

    // MARK: - Logic

    private func process() async {
        isProcessing = true
        errorMessage = nil
        pendingEdit = nil
        showPreview = false

        let sessions = plan.sessions.sorted { $0.date < $1.date }
        let sessionList = sessions.enumerated().map { i, s in
            "\(i). \(Self.dateFmt.string(from: s.date)) — \(s.type) — \(s.target)"
        }.joined(separator: "\n")

        let today = Self.dateFmt.string(from: Date())
        let prompt = """
        Today is \(today).
        Training plan: "\(plan.title)" (ends \(Self.dateFmt.string(from: plan.endDate))).

        Current sessions (zero-based index):
        \(sessionList.isEmpty ? "(none)" : sessionList)

        User request: \(input)

        Return only the changes needed. Use ISO 8601 dates (YYYY-MM-DD). \
        Valid types: run, gym, swim, yoga, sit.
        """

        do {
            let session = LanguageModelSession()
            let response = try await session.respond(to: prompt, generating: PlanEdit.self)
            pendingEdit = response.content
            showPreview = true
        } catch {
            errorMessage = "Could not process request. Make sure Apple Intelligence is enabled on this device."
        }

        isProcessing = false
    }

    private func apply(edit: PlanEdit) {
        let sorted = plan.sessions.sorted { $0.date < $1.date }

        // Removals (highest index first to avoid shifting)
        for i in edit.removals.sorted(by: >) {
            if i < sorted.count {
                modelContext.delete(sorted[i])
            }
        }

        // Updates
        for u in edit.updates {
            if u.index < sorted.count,
               let date = Self.dateFmt.date(from: u.date) {
                sorted[u.index].date = date
                sorted[u.index].type = u.type
                sorted[u.index].target = u.target
            }
        }

        // Additions
        for a in edit.additions {
            if let date = Self.dateFmt.date(from: a.date) {
                let s = PlanSession(date: date, type: a.type, target: a.target)
                plan.sessions.append(s)
            }
        }

        dismiss()
    }
}
