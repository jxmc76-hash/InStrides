import SwiftUI
import SwiftData

struct EditPlanTableSheet: View {
    @Bindable var plan: TrainingPlan
    @Environment(\.dismiss) private var dismiss
    @Environment(HealthKitManager.self) private var hk
    @State private var pasteError: String? = nil
    @State private var pasteSuccess: String? = nil
    @State private var linkSession: PlanSession? = nil

    private let colDate: CGFloat   = 110
    private let colType: CGFloat   = 70
    private let colDone: CGFloat   = 36

    var sortedSessions: [PlanSession] {
        plan.sessions.sorted { $0.date < $1.date }
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                pasteBar
                Divider()
                ScrollView {
                    VStack(spacing: 0) {
                        headerRow
                        Divider()
                        ForEach(sortedSessions) { session in
                    SessionGridRow(session: session,
                                   colDate: colDate, colType: colType, colDone: colDone,
                                   onLink: { linkSession = session })
                    Divider()
                }
                        addRow
                    }
                    .background(Color(uiColor: .systemBackground))
                    .clipShape(RoundedRectangle(cornerRadius: 10))
                    .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color(uiColor: .separator), lineWidth: 0.5))
                    .padding()
                }
            }
            .navigationTitle(plan.title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
            .sheet(item: $linkSession) { session in
                LinkWorkoutSheet(plan: plan, session: session,
                                 workouts: hk.dailyData.flatMap(\.workouts))
            }
        }
    }

    // MARK: - Paste bar

    private var pasteBar: some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text("Paste from Excel")
                    .font(.subheadline.bold())
                Text("Copy cells (Date | Type | Target) then tap Paste")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            Button {
                pasteFromClipboard()
            } label: {
                Label("Paste", systemImage: "doc.on.clipboard")
                    .font(.subheadline.bold())
            }
            .buttonStyle(.borderedProminent)
            .tint(.orange)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .overlay(alignment: .bottom) {
            if let msg = pasteError {
                Text(msg)
                    .font(.caption)
                    .foregroundStyle(.red)
                    .padding(.bottom, 2)
            } else if let msg = pasteSuccess {
                Text(msg)
                    .font(.caption)
                    .foregroundStyle(.green)
                    .padding(.bottom, 2)
            }
        }
    }

    // MARK: - Header

    private var headerRow: some View {
        HStack(spacing: 0) {
            cell(Text("#").font(.caption.bold()).foregroundStyle(.secondary), width: 32)
            vDivider
            cell(Text("Date").font(.caption.bold()).foregroundStyle(.secondary), width: colDate)
            vDivider
            cell(Text("Type").font(.caption.bold()).foregroundStyle(.secondary), width: colType)
            vDivider
            Text("Target").font(.caption.bold()).foregroundStyle(.secondary)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 8)
            vDivider
            cell(Text("✓").font(.caption.bold()).foregroundStyle(.secondary), width: colDone)
        }
        .frame(height: 32)
        .background(Color(uiColor: .secondarySystemBackground))
    }

    // MARK: - Add row

    private var addRow: some View {
        Button {
            let next = plan.sessions.sorted { $0.date < $1.date }.last
                .flatMap { Calendar.current.date(byAdding: .day, value: 7, to: $0.date) } ?? Date()
            plan.sessions.append(PlanSession(date: next, type: WorkoutType.run.rawValue, target: ""))
        } label: {
            Label("Add Session", systemImage: "plus.circle")
                .font(.subheadline)
                .foregroundStyle(.orange)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 16)
                .padding(.vertical, 10)
        }
    }

    // MARK: - Paste logic

    private func pasteFromClipboard() {
        pasteError = nil
        pasteSuccess = nil
        guard let text = UIPasteboard.general.string, !text.isEmpty else {
            pasteError = "Clipboard is empty"
            return
        }
        let lines = text.components(separatedBy: "\n")
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
        var added = 0
        var skipped = 0
        for line in lines {
            // Excel copies as tab-separated; also accept comma
            let cols: [String]
            if line.contains("\t") {
                cols = line.components(separatedBy: "\t").map { $0.trimmingCharacters(in: .whitespaces) }
            } else {
                cols = line.components(separatedBy: ",").map { $0.trimmingCharacters(in: .whitespaces) }
            }
            guard cols.count >= 1 else { skipped += 1; continue }
            guard let date = parseDate(cols[0]) else { skipped += 1; continue }
            let typeStr = cols.count > 1 ? cols[1] : "run"
            let target  = cols.count > 2 ? cols[2...].joined(separator: " ") : ""
            let type = WorkoutType.allCases.first {
                $0.rawValue.lowercased() == typeStr.lowercased() ||
                $0.displayName.lowercased() == typeStr.lowercased()
            } ?? .run
            plan.sessions.append(PlanSession(date: date, type: type.rawValue, target: target))
            added += 1
        }
        if added > 0 {
            pasteSuccess = "Added \(added) session\(added == 1 ? "" : "s")\(skipped > 0 ? " (\(skipped) skipped)" : "")"
        } else {
            pasteError = "No valid rows found — need at least a date in col 1"
        }
    }

    private func parseDate(_ s: String) -> Date? {
        let fmts = ["dd/MM/yyyy", "d/M/yyyy", "yyyy-MM-dd", "MM/dd/yyyy",
                    "d MMM yyyy", "d MMMM yyyy", "dd-MM-yyyy", "d-M-yyyy",
                    "MMM d, yyyy", "MMMM d, yyyy"]
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_GB")
        for fmt in fmts {
            f.dateFormat = fmt
            if let d = f.date(from: s) { return d }
        }
        // Try Excel serial number (days since 1900-01-01, with Excel's leap year bug)
        if let serial = Double(s), serial > 1000 {
            let base = DateComponents(year: 1899, month: 12, day: 30)
            if let ref = Calendar.current.date(from: base) {
                return Calendar.current.date(byAdding: .day, value: Int(serial), to: ref)
            }
        }
        return nil
    }

    // MARK: - Helpers

    private func cell<C: View>(_ content: C, width: CGFloat) -> some View {
        content
            .frame(width: width, alignment: .leading)
            .padding(.horizontal, 8)
    }

    private var vDivider: some View {
        Rectangle()
            .fill(Color(uiColor: .separator))
            .frame(width: 0.5)
    }
}

// MARK: - Session row

struct SessionGridRow: View {
    @Bindable var session: PlanSession
    let colDate: CGFloat
    let colType: CGFloat
    let colDone: CGFloat
    let onLink: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 0) {
                Image(systemName: "line.3.horizontal")
                    .foregroundStyle(Color(uiColor: .tertiaryLabel))
                    .font(.caption)
                    .frame(width: 32, alignment: .center)
                vDivider
                DatePicker("", selection: $session.date, displayedComponents: .date)
                    .labelsHidden()
                    .frame(width: colDate)
                    .scaleEffect(0.78, anchor: .leading)
                    .padding(.leading, 4)
                vDivider
                Picker("", selection: Binding(
                    get: { WorkoutType(rawValue: session.type) ?? .run },
                    set: { session.type = $0.rawValue }
                )) {
                    ForEach(WorkoutType.allCases) { t in
                        Text(t.displayName).tag(t)
                    }
                }
                .labelsHidden()
                .frame(width: colType)
                vDivider
                TextField("Target", text: $session.target)
                    .font(.subheadline)
                    .frame(maxWidth: .infinity)
                    .padding(.horizontal, 8)
                vDivider
                Button {
                    session.isComplete.toggle()
                } label: {
                    Image(systemName: session.isComplete ? "checkmark.circle.fill" : "circle")
                        .foregroundStyle(session.isComplete ? .green : .secondary)
                }
                .buttonStyle(.plain)
                .frame(width: colDone, alignment: .center)
            }
            .frame(minHeight: 44)

            // Link row — only visible when marked complete
            if session.isComplete {
                Divider()
                Button {
                    onLink()
                } label: {
                    HStack(spacing: 6) {
                        if session.linkedWorkoutID != nil {
                            Image(systemName: "checkmark.seal.fill").foregroundStyle(.green)
                            Text("Linked to workout").foregroundStyle(.green)
                            Spacer()
                            Text("Change").foregroundStyle(.orange)
                        } else {
                            Image(systemName: "link").foregroundStyle(.orange)
                            Text("Link to workout").foregroundStyle(.orange)
                            Spacer()
                        }
                    }
                    .font(.caption)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 8)
                }
                .buttonStyle(.plain)
                .background(Color.orange.opacity(0.06))
            }
        }
    }

    private var vDivider: some View {
        Rectangle()
            .fill(Color(uiColor: .separator))
            .frame(width: 0.5)
    }
}
