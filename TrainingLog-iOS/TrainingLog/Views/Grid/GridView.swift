import SwiftUI
import SwiftData

struct GridView: View {
    @Environment(HealthKitManager.self) private var hk
    @EnvironmentObject var userStore: UserStore
    @State private var selectedWorkouts: [HealthWorkout]? = nil
    @State private var showColumnPicker = false
    @State private var showSettings = false
    @State private var collapsedWeeks: Set<Date> = []
    @State private var collapseInitialised = false

    private let collapseThreshold = 12 // weeks

    private var columns: [WorkoutType] { userStore.selectedColumns }

    private var collapseIconName: String {
        collapsedWeeks.count == groupByWeek(hk.dailyData).count
            ? "arrow.down.right.and.arrow.up.left"
            : "arrow.up.left.and.arrow.down.right"
    }

    private var detailSheetBinding: Binding<SelectedWorkoutList?> {
        Binding(
            get: { selectedWorkouts.map { SelectedWorkoutList(workouts: $0) } },
            set: { _ in selectedWorkouts = nil }
        )
    }

    var body: some View {
        NavigationStack {
            scrollContent
                .refreshable { await hk.fetchAll() }
                .navigationTitle("Overview")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar { toolbarContent }
                .sheet(isPresented: $showSettings) {
                    SettingsSheet().environmentObject(userStore)
                }
                .sheet(isPresented: $showColumnPicker) {
                    ColumnPickerSheet(selected: Binding(
                        get: { userStore.selectedColumns },
                        set: { userStore.selectedColumns = $0 }
                    ))
                }
                .sheet(item: detailSheetBinding) { item in
                    WorkoutDetailSheet(workouts: item.workouts)
                        .environmentObject(userStore)
                        .environment(hk)
                }
        }
    }

    private var scrollContent: some View {
        ScrollView {
            VStack(spacing: 0) {
                ScoreCards()
                SectionTitle("Activity")
                LazyVStack(spacing: 0, pinnedViews: .sectionHeaders) {
                    Section {
                        gridBody
                    } header: {
                        headerRow
                    }
                }
            }
            .contentWidth(820)
        }
    }

    @ToolbarContentBuilder
    private var toolbarContent: some ToolbarContent {
        ToolbarItem(placement: .topBarTrailing) {
            HStack(spacing: 16) {
                Button {
                    let grouped = groupByWeek(hk.dailyData)
                    if collapsedWeeks.count == grouped.count {
                        collapsedWeeks = []
                    } else {
                        collapsedWeeks = Set(grouped.map(\.week))
                    }
                } label: {
                    Image(systemName: collapseIconName).font(.system(size: 13))
                }
                Button { showSettings = true } label: {
                    Image(systemName: "gear")
                }
                Button { showColumnPicker = true } label: {
                    Image(systemName: "slider.horizontal.3")
                }
            }
        }
    }

    @ViewBuilder
    private var headerRow: some View {
        HStack(spacing: 0) {
            Text("Date")
                .frame(width: 72, alignment: .leading)
                .font(.caption.bold())
                .foregroundStyle(.secondary)
                .padding(.leading, 16)

            ForEach(columns) { col in
                Image(systemName: col.icon)
                    .frame(maxWidth: .infinity)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(col.color)
            }
        }
        .padding(.vertical, 8)
        .background(.bar)
    }

    @ViewBuilder
    private var gridBody: some View {
        let grouped = groupByWeek(hk.dailyData)
        let cutoff = Calendar.current.date(byAdding: .weekOfYear, value: -collapseThreshold, to: .now) ?? .now
        ForEach(grouped, id: \.week) { group in
            weekHeader(for: group.days, previous: group.previousDays, collapsed: collapsedWeeks.contains(group.week)) {
                if collapsedWeeks.contains(group.week) {
                    collapsedWeeks.remove(group.week)
                } else {
                    collapsedWeeks.insert(group.week)
                }
            }
            if !collapsedWeeks.contains(group.week) {
                ForEach(group.days) { day in
                    GridRow(day: day, columns: columns) { workouts in
                        selectedWorkouts = workouts
                    }
                }
            }
        }
        .onAppear {
            guard !collapseInitialised else { return }
            collapseInitialised = true
            for group in grouped where group.week < cutoff {
                collapsedWeeks.insert(group.week)
            }
        }
    }

    private func weekHeader(for days: [DailyHealthData], previous: [DailyHealthData]?, collapsed: Bool, onTap: @escaping () -> Void) -> some View {
        let cal = Calendar.current
        let fmt = DateFormatter()
        fmt.dateFormat = "d MMM"
        let sorted = days.sorted { $0.date < $1.date }
        let label: String = {
            guard let first = sorted.first, let last = sorted.last else { return "" }
            let d1 = cal.component(.day, from: first.date)
            let d2 = fmt.string(from: last.date)
            return "\(d1)–\(d2)"
        }()
        let activeTypes = Set(days.flatMap { $0.workouts }.map { $0.type })
        let allFive = columns.count >= 5 && columns.allSatisfy { activeTypes.contains($0) }
        return Button(action: onTap) {
            HStack(spacing: 0) {
                HStack(spacing: 4) {
                    Image(systemName: collapsed ? "chevron.right" : "chevron.down")
                        .font(.system(size: 8, weight: .bold))
                        .foregroundStyle(.tertiary)
                    Text(label)
                        .font(.caption2.bold())
                        .foregroundStyle(.secondary)
                    if allFive {
                        Image(systemName: "star.fill")
                            .font(.system(size: 11))
                            .foregroundStyle(.yellow)
                    }
                }
                .frame(width: 72, alignment: .leading)
                .padding(.leading, 12)
                .padding(.vertical, 6)
                ForEach(columns) { col in
                    let mins = days.reduce(0) { $0 + $1.totalDuration(for: col) }
                    let fg: Color = mins > 0 ? (allFive ? Color.primary : col.color.opacity(0.8)) : Color.secondary.opacity(0.3)
                    let lastWeek = previous.map { $0.reduce(0) { $0 + $1.totalDuration(for: col) } }
                    HStack(spacing: 2) {
                        Text(mins > 0 ? "\(mins)" : "–")
                            .font(.caption2.bold())
                            .foregroundStyle(fg)
                        WeekChangeArrow(minutes: mins, lastWeek: lastWeek)
                    }
                    .frame(maxWidth: .infinity)
                }
            }
        }
        .buttonStyle(.plain)
        .background(allFive ? Color.yellow.opacity(0.18) : Color(uiColor: .systemGroupedBackground))
        .overlay {
            if allFive {
                RoundedRectangle(cornerRadius: 6)
                    .stroke(Color.yellow.opacity(0.7), lineWidth: 1.5)
                    .padding(.horizontal, 8)
            }
        }
    }

    private struct WeekGroup {
        let week: Date
        let days: [DailyHealthData]
        /// The week before, for the up/down arrows. nil when there's no data that far back.
        let previousDays: [DailyHealthData]?
    }

    private func groupByWeek(_ data: [DailyHealthData]) -> [WeekGroup] {
        let cal = Calendar.current
        var groups: [Date: [DailyHealthData]] = [:]
        for day in data {
            let start = cal.dateInterval(of: .weekOfYear, for: day.date)?.start ?? day.date
            groups[start, default: []].append(day)
        }
        return groups.keys.sorted(by: >).map { week in
            let previousWeek = cal.date(byAdding: .weekOfYear, value: -1, to: week) ?? week
            return WeekGroup(week: week,
                             days: groups[week]!.sorted { $0.date > $1.date },
                             previousDays: groups[previousWeek])
        }
    }
}

/// Small up/down arrow showing whether this week's minutes beat last week's.
private struct WeekChangeArrow: View {
    let minutes: Int
    let lastWeek: Int?

    var body: some View {
        if let lastWeek, minutes != lastWeek {
            let up = minutes > lastWeek
            Image(systemName: up ? "arrowtriangle.up.fill" : "arrowtriangle.down.fill")
                .font(.system(size: 7))
                .foregroundStyle(up ? Color.green : Color.red.opacity(0.7))
                .accessibilityLabel(up ? "Up on last week" : "Down on last week")
        }
    }
}

struct SelectedWorkoutList: Identifiable {
    let id = UUID()
    let workouts: [HealthWorkout]
}

struct GridRow: View {
    let day: DailyHealthData
    let columns: [WorkoutType]
    let onTap: ([HealthWorkout]) -> Void

    private static let dateFmt: DateFormatter = {
        let f = DateFormatter(); f.dateFormat = "d MMM"; return f
    }()

    var body: some View {
        HStack(spacing: 0) {
            Text(Self.dateFmt.string(from: day.date))
                .frame(width: 72, alignment: .leading)
                .font(.caption)
                .foregroundStyle(.secondary)
                .padding(.leading, 16)

            ForEach(columns) { col in
                let workouts = day.workouts(for: col)
                let total = day.totalDuration(for: col)
                Button {
                    if !workouts.isEmpty { onTap(workouts) }
                } label: {
                    if total > 0 {
                        Text("\(total)")
                            .font(.system(size: 14, weight: .semibold, design: .rounded))
                            .foregroundStyle(.white)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 6)
                            .background(col.color.opacity(0.85), in: RoundedRectangle(cornerRadius: 6))
                            .padding(.horizontal, 3)
                    } else {
                        Color.clear
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 6)
                    }
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.vertical, 5)
        .padding(.trailing, 8)
    }
}

struct ColumnPickerSheet: View {
    @Binding var selected: [WorkoutType]
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List(WorkoutType.allCases) { type in
                HStack {
                    Circle()
                        .fill(type.color)
                        .frame(width: 12, height: 12)
                    Text(type.displayName)
                    Spacer()
                    if selected.contains(type) {
                        Image(systemName: "checkmark")
                            .foregroundStyle(.blue)
                    }
                }
                .contentShape(Rectangle())
                .onTapGesture {
                    if let idx = selected.firstIndex(of: type) {
                        if selected.count > 1 { selected.remove(at: idx) }
                    } else {
                        selected.append(type)
                    }
                }
            }
            .navigationTitle("Columns")
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }
}

private struct SectionTitle: View {
    let text: String
    init(_ text: String) { self.text = text }
    var body: some View {
        Text(text)
            .font(.footnote.weight(.semibold))
            .foregroundStyle(.secondary)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 20)
            .padding(.top, 20)
            .padding(.bottom, 4)
    }
}

extension View {
    func contentWidth(_ maxWidth: CGFloat = 760) -> some View {
        self.frame(maxWidth: maxWidth).frame(maxWidth: .infinity)
    }
}

// MARK: - Fitness and readiness scores

/// One part of a score, e.g. "Consistency: 24 of 30".
struct ScorePart: Identifiable {
    let id = UUID()
    let name: String
    let points: Double
    let maxPoints: Double
    let detail: String
    var fraction: Double { maxPoints > 0 ? points / maxPoints : 0 }
}

/// A score out of 100 made from parts. Parts with no data are left out and the rest
/// are scaled up to 100, so a missing energy score doesn't drag readiness down.
struct ComposedScore {
    let parts: [ScorePart]
    /// Why there's no score yet, when too little is known to give one.
    var missingReason: String? = nil

    var total: Int? {
        let available = parts.map(\.maxPoints).reduce(0, +)
        guard missingReason == nil, available > 0 else { return nil }
        return Int((parts.map(\.points).reduce(0, +) / available * 100).rounded())
    }

    var weakest: ScorePart? { parts.min { $0.fraction < $1.fraction } }
}

enum TrainingScores {
    private static let cal = Calendar.current
    static let weeklyTarget = 5.0

    private static func clamp(_ x: Double) -> Double { min(1, max(0, x)) }

    /// Days from `start` (inclusive) to `end` (exclusive).
    private static func days(_ all: [DailyHealthData], from start: Date, to end: Date) -> [DailyHealthData] {
        all.filter { $0.date >= start && $0.date < end }
    }

    private static func minutes(_ days: [DailyHealthData]) -> Double {
        Double(days.flatMap(\.workouts).map(\.durationMinutes).reduce(0, +))
    }

    /// How fit you are compared with your own history, as of a given day.
    static func fitness(days all: [DailyHealthData], asOf date: Date = .now) -> ComposedScore {
        let end = cal.date(byAdding: .day, value: 1, to: cal.startOfDay(for: date)) ?? date
        func back(_ n: Int) -> Date { cal.date(byAdding: .day, value: -n, to: end) ?? end }
        var parts: [ScorePart] = []

        // Aerobic fitness: latest VO2 max against the best in the last three years.
        let history = all.filter { $0.date < end && $0.date >= back(3 * 365) }
        let readings = history.compactMap { d in d.vo2Max.map { (d.date, $0) } }.sorted { $0.0 > $1.0 }
        if let best = readings.map(\.1).max(), let latest = readings.first {
            // 100% of your best scores full marks; 80% or less scores nothing.
            let ratio = latest.1 / best
            let stale = latest.0 < back(30) ? " (no reading in 30 days)" : ""
            parts.append(ScorePart(
                name: "Aerobic fitness", points: 50 * clamp((ratio - 0.8) / 0.2), maxPoints: 50,
                detail: String(format: "VO₂ max %.1f vs your best %.1f", latest.1, best) + stale))
        }

        // Consistency: sessions a week over the last four weeks, against the target.
        let recent = days(all, from: back(28), to: end)
        let perWeek = Double(recent.flatMap(\.workouts).count) / 4
        parts.append(ScorePart(
            name: "Consistency", points: 30 * clamp(perWeek / weeklyTarget), maxPoints: 30,
            detail: String(format: "%.1f sessions a week (target %.0f)", perWeek, weeklyTarget)))

        // Volume: minutes in the last four weeks against the usual four weeks over the
        // six months before.
        let recentMinutes = minutes(recent)
        let baselineDays = days(all, from: back(28 + 168), to: back(28))
        let usual = minutes(baselineDays) / 6
        let volumeFraction = usual > 0 ? clamp(recentMinutes / usual) : (recentMinutes > 0 ? 1 : 0)
        parts.append(ScorePart(
            name: "Training volume", points: 20 * volumeFraction, maxPoints: 20,
            detail: usual > 0
                ? "\(Int(recentMinutes)) min in 4 weeks vs your usual \(Int(usual))"
                : "\(Int(recentMinutes)) min in 4 weeks"))

        return ComposedScore(parts: parts)
    }

    /// How ready you are to train today.
    static func readiness(days all: [DailyHealthData], energy: (Date) -> Int?,
                          injuries: [Injury], on date: Date = .now) -> ComposedScore {
        let today = cal.startOfDay(for: date)
        let end = cal.date(byAdding: .day, value: 1, to: today) ?? date
        func back(_ n: Int) -> Date { cal.date(byAdding: .day, value: -n, to: end) ?? end }
        var parts: [ScorePart] = []

        // Sleep: last night against your usual (the median of the four weeks before).
        let lastNight = all.first { $0.date == today }?.sleep?.totalMinutes
        let usualNights = days(all, from: back(29), to: today).compactMap { $0.sleep?.totalMinutes }.sorted()
        if let lastNight, !usualNights.isEmpty {
            let usual = usualNights[usualNights.count / 2]
            // Your usual or more scores full marks; 70% of it or less scores nothing.
            let ratio = usual > 0 ? lastNight / usual : 1
            parts.append(ScorePart(
                name: "Sleep", points: 30 * clamp((ratio - 0.7) / 0.3), maxPoints: 30,
                detail: "\(hm(lastNight)) last night vs your usual \(hm(usual))"))
        }

        // Energy: today's score, or yesterday's if today's isn't in yet.
        let yesterday = cal.date(byAdding: .day, value: -1, to: today) ?? today
        if let e = energy(today) ?? energy(yesterday) {
            let when = energy(today) != nil ? "today" : "yesterday"
            parts.append(ScorePart(
                name: "Energy", points: 25 * Double(e) / 10, maxPoints: 25,
                detail: "\(e)/10 \(when)"))
        }

        // Load: the last 7 days against the weekly average of the last 4 weeks. Up to 30%
        // above normal is fine; a jump of 80% or more scores nothing.
        let week = minutes(days(all, from: back(7), to: end))
        let usualWeek = minutes(days(all, from: back(28), to: end)) / 4
        if usualWeek > 0 {
            let ratio = week / usualWeek
            parts.append(ScorePart(
                name: "Training load", points: 25 * clamp(1 - (ratio - 1.3) / 0.5), maxPoints: 25,
                detail: "\(Int(week)) min this week vs \(Int(usualWeek)) usual"))
        }

        // Injury: the worst current pain among injuries logged in the last week.
        let active = injuries.filter { $0.date >= back(7) }
        var latestPain: [String: (date: Date, pain: Int, name: String)] = [:]
        for i in active {
            let key = i.bodyPart.trimmingCharacters(in: .whitespaces).lowercased()
            if let current = latestPain[key], current.date >= i.date { continue }
            latestPain[key] = (i.date, i.pain, i.bodyPart)
        }
        let worst = latestPain.values.max { $0.pain < $1.pain }
        parts.append(ScorePart(
            name: "Injury", points: 20 * (1 - Double(worst?.pain ?? 0) / 10), maxPoints: 20,
            detail: worst.map { "\($0.name) pain \($0.pain)/10" } ?? "No injuries logged this week"))

        // Without either of today's signals there's nothing to say about readiness.
        let hasDailySignal = parts.contains { $0.name == "Sleep" || $0.name == "Energy" }
        return ComposedScore(parts: parts,
                             missingReason: hasDailySignal ? nil : "Needs last night's sleep or today's energy")
    }

    private static func hm(_ minutes: Double) -> String {
        "\(Int(minutes) / 60)h \(String(format: "%02d", Int(minutes) % 60))m"
    }
}

// MARK: - Score cards

private enum ScoreKind: String, Identifiable {
    case fitness, readiness
    var id: String { rawValue }
}

/// Fitness and readiness side by side at the top of Overview. Tap one for its breakdown.
struct ScoreCards: View {
    @Environment(HealthKitManager.self) private var hk
    @EnvironmentObject var userStore: UserStore
    @Query private var injuries: [Injury]
    @State private var showing: ScoreKind? = nil

    private var fitness: ComposedScore { TrainingScores.fitness(days: hk.dailyData) }
    private var fitnessTwoWeeksAgo: ComposedScore {
        TrainingScores.fitness(days: hk.dailyData,
                               asOf: Calendar.current.date(byAdding: .day, value: -14, to: .now) ?? .now)
    }
    private var readiness: ComposedScore {
        TrainingScores.readiness(days: hk.dailyData, energy: { userStore.energy(for: $0) }, injuries: injuries)
    }

    private var fitnessCaption: String {
        guard let now = fitness.total, let before = fitnessTwoWeeksAgo.total else { return "" }
        let diff = now - before
        if diff == 0 { return "Same as 2 weeks ago" }
        return diff > 0 ? "▲ \(diff) on 2 weeks ago" : "▼ \(-diff) on 2 weeks ago"
    }

    private var readinessCaption: String {
        guard let r = readiness.total else { return readiness.missingReason ?? "" }
        switch r {
        case 75...: return "Good to train hard"
        case 55..<75: return "Train as normal"
        default: return "Take it easy today"
        }
    }

    var body: some View {
        HStack(spacing: 12) {
            tile(title: "Fitness", score: fitness.total, caption: fitnessCaption, color: .appTeal) {
                showing = .fitness
            }
            tile(title: "Readiness", score: readiness.total, caption: readinessCaption,
                 color: Self.readinessColor(readiness.total)) {
                showing = .readiness
            }
        }
        .padding(.horizontal, 16)
        .padding(.top, 12)
        .sheet(item: $showing) { kind in
            ScoreBreakdownSheet(
                title: kind == .fitness ? "Fitness" : "Readiness",
                score: kind == .fitness ? fitness : readiness,
                explanation: kind == .fitness
                    ? "How fit you are compared with your own history. It changes slowly: VO₂ max against your best in the last 3 years, sessions a week against a target of 5, and training minutes against your usual."
                    : "How ready you are to train today: last night's sleep against your usual, your energy score, whether this week's training is well above normal, and any injury logged in the last week. Parts with no data yet are left out.")
        }
    }

    static func readinessColor(_ score: Int?) -> Color {
        guard let score else { return .secondary }
        return score >= 75 ? .green : score >= 55 ? .orange : .red
    }

    private func tile(title: String, score: Int?, caption: String, color: Color,
                      action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 12) {
                ZStack {
                    Circle().stroke(color.opacity(0.18), lineWidth: 7)
                    Circle()
                        .trim(from: 0, to: Double(score ?? 0) / 100)
                        .stroke(color, style: StrokeStyle(lineWidth: 7, lineCap: .round))
                        .rotationEffect(.degrees(-90))
                    Text(score.map(String.init) ?? "–")
                        .font(.title3.bold())
                        .monospacedDigit()
                }
                .frame(width: 56, height: 56)

                VStack(alignment: .leading, spacing: 3) {
                    Text(title)
                        .font(.subheadline.bold())
                        .foregroundStyle(.primary)
                    Text(caption)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 0)
            }
            .padding(12)
            .frame(maxWidth: .infinity)
            .background(.background.secondary, in: RoundedRectangle(cornerRadius: 14))
        }
        .buttonStyle(.plain)
    }
}

private struct ScoreBreakdownSheet: View {
    let title: String
    let score: ComposedScore
    let explanation: String
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List {
                Section {
                    HStack {
                        Text(score.total.map(String.init) ?? "–")
                            .font(.system(size: 48, weight: .bold))
                            .monospacedDigit()
                        Text("/ 100")
                            .font(.title3)
                            .foregroundStyle(.secondary)
                    }
                    if let reason = score.missingReason {
                        Text(reason)
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    } else if let weakest = score.weakest, weakest.fraction < 0.9 {
                        Label("Biggest gain available: \(weakest.name.lowercased())", systemImage: "arrow.up.forward.circle")
                            .font(.subheadline)
                            .foregroundStyle(Color.appTeal)
                    }
                }
                Section("Breakdown") {
                    ForEach(score.parts) { part in
                        VStack(alignment: .leading, spacing: 6) {
                            HStack {
                                Text(part.name).font(.subheadline.bold())
                                Spacer()
                                Text("\(Int(part.points.rounded())) / \(Int(part.maxPoints))")
                                    .font(.subheadline)
                                    .monospacedDigit()
                                    .foregroundStyle(.secondary)
                            }
                            ProgressView(value: part.fraction)
                                .tint(Color.appTeal)
                            Text(part.detail)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        .padding(.vertical, 4)
                    }
                }
                Section {
                    Text(explanation)
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } }
            }
        }
        .presentationDetents([.medium, .large])
    }
}
