import SwiftUI

struct GridView: View {
    @Environment(HealthKitManager.self) private var hk
    @Environment(UserStore.self) private var userStore
    @State private var selectedWorkouts: [HealthWorkout]? = nil
    @State private var showColumnPicker = false

    private var columns: [WorkoutType] { userStore.selectedColumns }

    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVStack(spacing: 0, pinnedViews: .sectionHeaders) {
                    Section {
                        gridBody
                    } header: {
                        headerRow
                    }
                }
            }
            .navigationTitle("Grid")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        showColumnPicker = true
                    } label: {
                        Image(systemName: "slider.horizontal.3")
                    }
                }
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
            ForEach(group.days) { day in
                GridRow(day: day, columns: columns) { workouts in
                    selectedWorkouts = workouts
                }
            }
            Divider()
                .overlay(Color.secondary.opacity(0.4))
                .padding(.horizontal, 16)
                .background(
                    Rectangle()
                        .fill(Color(uiColor: .systemBackground))
                        .frame(height: 1)
                        .overlay(
                            GeometryReader { geo in
                                Path { path in
                                    let y = geo.size.height / 2
                                    var x = 0.0
                                    while x < geo.size.width {
                                        path.move(to: CGPoint(x: x, y: y))
                                        path.addLine(to: CGPoint(x: x + 6, y: y))
                                        x += 12
                                    }
                                }
                                .stroke(Color.secondary.opacity(0.35), lineWidth: 1)
                            }
                        )
                )
        }
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
                            .font(.system(size: 13, weight: .semibold, design: .rounded))
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
        .padding(.vertical, 2)
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
