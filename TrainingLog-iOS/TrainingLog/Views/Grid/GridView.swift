import SwiftUI
import SwiftData

struct GridView: View {
    @Environment(HealthKitManager.self) private var hk
    @EnvironmentObject var userStore: UserStore
    @Environment(\.modelContext) private var context
    @State private var selectedWorkouts: [HealthWorkout]? = nil
    @State private var showColumnPicker = false
    @State private var showSettings = false
    @State private var collapsedWeeks: Set<Date> = []
    @State private var collapseInitialised = false
    @State private var todaySessions: [(plan: TrainingPlan, session: PlanSession)] = []

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
                .onAppear { todaySessions = fetchTodaySessions() }
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
                if !todaySessions.isEmpty {
                    TodayPlanCard(sessions: todaySessions)
                        .padding(.horizontal, 16)
                        .padding(.top, 12)
                        .padding(.bottom, 4)
                }
                LazyVStack(spacing: 0, pinnedViews: .sectionHeaders) {
                    Section {
                        gridBody
                    } header: {
                        headerRow
                    }
                }
            }
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
            weekHeader(for: group.days, collapsed: collapsedWeeks.contains(group.week)) {
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

    private func weekHeader(for days: [DailyHealthData], collapsed: Bool, onTap: @escaping () -> Void) -> some View {
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
                Text(mins > 0 ? "\(mins)" : "–")
                        .font(.caption2.bold())
                        .foregroundStyle(fg)
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
    }

    private func fetchTodaySessions() -> [(plan: TrainingPlan, session: PlanSession)] {
        let today = Calendar.current.startOfDay(for: .now)
        let tomorrow = Calendar.current.date(byAdding: .day, value: 1, to: today)!
        let descriptor = FetchDescriptor<TrainingPlan>()
        guard let plans = try? context.fetch(descriptor) else { return [] }
        var result: [(TrainingPlan, PlanSession)] = []
        for plan in plans {
            for session in plan.sessions {
                let sessionDay = Calendar.current.startOfDay(for: session.date)
                if sessionDay >= today && sessionDay < tomorrow {
                    result.append((plan, session))
                }
            }
        }
        return result.sorted { $0.1.date < $1.1.date }
    }

    private func groupByWeek(_ data: [DailyHealthData]) -> [WeekGroup] {
        let cal = Calendar.current
        var groups: [Date: [DailyHealthData]] = [:]
        for day in data {
            let start = cal.dateInterval(of: .weekOfYear, for: day.date)?.start ?? day.date
            groups[start, default: []].append(day)
        }
        return groups.keys.sorted(by: >).map { week in
            WeekGroup(week: week, days: groups[week]!.sorted { $0.date > $1.date })
        }
    }
}

struct TodayPlanCard: View {
    let sessions: [(plan: TrainingPlan, session: PlanSession)]

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Label("Today's Plan", systemImage: "calendar")
                    .font(.subheadline.bold())
                    .foregroundStyle(.primary)
                Spacer()
                let done = sessions.filter { $0.session.isComplete }.count
                Text("\(done)/\(sessions.count) done")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Divider()

            ForEach(sessions, id: \.session.id) { pair in
                HStack(spacing: 10) {
                    let color = WorkoutType(rawValue: pair.session.type)?.color ?? .orange
                    RoundedRectangle(cornerRadius: 3)
                        .fill(color)
                        .frame(width: 4, height: 36)

                    VStack(alignment: .leading, spacing: 2) {
                        HStack(spacing: 6) {
                            Text(pair.session.type.uppercased())
                                .font(.caption.bold())
                                .foregroundStyle(color)
                            Text("·")
                                .font(.caption)
                                .foregroundStyle(.tertiary)
                            Text(pair.plan.title)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                                .lineLimit(1)
                        }
                        Text(pair.session.target)
                            .font(.subheadline)
                            .foregroundStyle(.primary)
                            .lineLimit(2)
                    }

                    Spacer()

                    Image(systemName: pair.session.isComplete ? "checkmark.circle.fill" : "circle")
                        .foregroundStyle(pair.session.isComplete ? .green : .tertiary)
                        .font(.title3)
                }
            }
        }
        .padding(14)
        .background(Color(uiColor: .secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 14))
        .overlay(
            RoundedRectangle(cornerRadius: 14)
                .stroke(Color.orange.opacity(0.25), lineWidth: 1)
        )
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
