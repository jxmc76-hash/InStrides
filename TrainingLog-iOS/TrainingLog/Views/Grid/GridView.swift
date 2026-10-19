import SwiftUI

struct GridView: View {
    @Environment(HealthKitManager.self) private var hk
    @Environment(UserStore.self) private var userStore
    @State private var selectedWorkouts: [HealthWorkout]? = nil
    @State private var showColumnPicker = false
    @State private var showSettings = false

    private var columns: [WorkoutType] { userStore.selectedColumns }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 0) {
                    Text("TrainingLog")
                        .font(.largeTitle.bold())
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, 16)
                        .padding(.top, 8)
                        .padding(.bottom, 4)
                    LazyVStack(spacing: 0, pinnedViews: .sectionHeaders) {
                        Section {
                            gridBody
                        } header: {
                            headerRow
                        }
                    }
                }
            }
            .refreshable { await hk.fetchAll() }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    HStack(spacing: 4) {
                        Image(uiImage: (UIImage(named: "AppIcon") ?? UIImage()))
                            .resizable()
                            .frame(width: 26, height: 26)
                            .clipShape(RoundedRectangle(cornerRadius: 6))
                            .font(.caption.bold())
                            .foregroundStyle(.orange)
                        Text("TrainingLog")
                            .font(.caption.bold())
                            .foregroundStyle(.primary)
                    }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    HStack(spacing: 16) {
                        Button { showSettings = true } label: {
                            Image(systemName: "gear")
                        }
                        Button { showColumnPicker = true } label: {
                            Image(systemName: "slider.horizontal.3")
                        }
                    }
                }
            }
            .sheet(isPresented: $showSettings) {
                SettingsSheet()
            }
            .sheet(isPresented: $showColumnPicker) {
                ColumnPickerSheet(selected: Binding(
                    get: { userStore.selectedColumns },
                    set: { userStore.selectedColumns = $0 }
                ))
            }
            .sheet(item: Binding(
                get: { selectedWorkouts.map { SelectedWorkoutList(workouts: $0) } },
                set: { _ in selectedWorkouts = nil }
            )) { item in
                WorkoutDetailSheet(workouts: item.workouts)
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
                Text(col.displayName)
                    .frame(maxWidth: .infinity)
                    .font(.caption.bold())
                    .foregroundStyle(col.color)
            }
        }
        .padding(.vertical, 8)
        .background(.bar)
    }

    @ViewBuilder
    private var gridBody: some View {
        let grouped = groupByWeek(hk.dailyData)
        ForEach(grouped, id: \.week) { group in
            weekHeader(for: group.days)
            ForEach(group.days) { day in
                GridRow(day: day, columns: columns) { workouts in
                    selectedWorkouts = workouts
                }
            }
        }
    }

    private func weekHeader(for days: [DailyHealthData]) -> some View {
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
        return HStack(spacing: 0) {
            Text(label)
                .font(.caption2.bold())
                .foregroundStyle(.secondary)
                .frame(width: 72, alignment: .leading)
                .padding(.leading, 16)
                .padding(.vertical, 6)
            ForEach(columns) { col in
                let total = days.reduce(0) { $0 + $1.totalDuration(for: col) }
                Text(total > 0 ? "\(total)" : "")
                    .font(.caption2.bold())
                    .foregroundStyle(col.color.opacity(0.8))
                    .frame(maxWidth: .infinity)
            }
        }
        .background(Color(uiColor: .systemGroupedBackground))
    }

    private struct WeekGroup {
        let week: Date
        let days: [DailyHealthData]
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
