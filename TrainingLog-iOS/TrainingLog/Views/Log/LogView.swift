import SwiftUI

struct LogView: View {
    @Environment(HealthKitManager.self) private var hk
    @Environment(UserStore.self) private var userStore
    @State private var energyPickerDate: Date? = nil
    @State private var selectedWorkouts: [HealthWorkout]? = nil

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
                    let grouped = groupByWeek(hk.dailyData)
                    ForEach(grouped, id: \.week) { group in
                        Section {
                            ForEach(group.days) { day in
                                DayLogCard(
                                    day: day,
                                    weight: carryForwardWeight[day.date],
                                    vo2: carryForwardVO2[day.date],
                                    onTapEnergy: { energyPickerDate = day.date },
                                    onTapWorkout: { selectedWorkouts = $0 }
                                )
                                .padding(.horizontal, 16)
                                .padding(.vertical, 4)
                            }
                        } header: {
                            weekSummaryHeader(for: group.days)
                        }
                    }
                }
                .padding(.bottom, 32)
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
            }
            .sheet(item: Binding(
                get: { energyPickerDate.map { EnergyPickerItem(date: $0) } },
                set: { _ in energyPickerDate = nil }
            )) { item in
                EnergyPickerSheet(date: item.date)
            }
            .sheet(item: Binding(
                get: { selectedWorkouts.map { SelectedWorkoutsItem(workouts: $0) } },
                set: { _ in selectedWorkouts = nil }
            )) { item in
                WorkoutDetailSheet(workouts: item.workouts)
            }
        }
    }

    private var carryForwardWeight: [Date: Double] {
        var result: [Date: Double] = [:]
        var last: Double? = nil
        for day in hk.dailyData.reversed() {
            if let w = day.weight { last = w }
            result[day.date] = last
        }
        return result
    }

    private var carryForwardVO2: [Date: Double] {
        var result: [Date: Double] = [:]
        var last: Double? = nil
        for day in hk.dailyData.reversed() {
            if let v = day.vo2Max { last = v }
            result[day.date] = last
        }
        return result
    }

    private func weekLabel(for days: [DailyHealthData]) -> String {
        let fmt = DateFormatter()
        fmt.dateFormat = "d MMM"
        let sorted = days.sorted { $0.date < $1.date }
        guard let first = sorted.first, let last = sorted.last else { return "" }
        let d1 = Calendar.current.component(.day, from: first.date)
        return "\(d1)–\(fmt.string(from: last.date))"
    }

    private func weekSummaryHeader(for days: [DailyHealthData]) -> some View {
        let label = weekLabel(for: days)
        let avgSleep = avg(days.compactMap { $0.sleep?.totalMinutes })
        let avgEnergy = avgInt(days.compactMap { userStore.energy(for: $0.date) })
        return HStack(spacing: 12) {
            Text(label)
                .font(.caption.bold())
                .foregroundStyle(.primary)
            Spacer()
            if let s = avgSleep {
                Label(formatSleep(s), systemImage: "moon.fill")
                    .font(.caption2)
                    .foregroundStyle(.indigo)
            }
            if let e = avgEnergy {
                Label("\(e)/5 energy", systemImage: "bolt.fill")
                    .font(.caption2)
                    .foregroundStyle(.orange)
            }
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 8)
        .background(.bar)
    }

    private func formatSleep(_ minutes: Double) -> String {
        let h = Int(minutes) / 60; let m = Int(minutes) % 60
        return h > 0 ? "\(h)h\(m > 0 ? " \(m)m" : "")" : "\(m)m"
    }

    private func avg(_ vals: [Double]) -> Double? {
        guard !vals.isEmpty else { return nil }
        return vals.reduce(0, +) / Double(vals.count)
    }
    private func avgInt(_ vals: [Int]) -> Int? {
        guard !vals.isEmpty else { return nil }
        return vals.reduce(0, +) / vals.count
    }

    private struct WeekGroup { let week: Date; let days: [DailyHealthData] }
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

// MARK: - Day card

struct DayLogCard: View {
    let day: DailyHealthData
    let weight: Double?
    let vo2: Double?
    let onTapEnergy: () -> Void
    let onTapWorkout: ([HealthWorkout]) -> Void
    @Environment(UserStore.self) private var userStore

    private static let dateFmt: DateFormatter = {
        let f = DateFormatter(); f.dateFormat = "EEE d MMM"; return f
    }()

    var body: some View {
        VStack(spacing: 0) {
            // Header row: date + sleep + weight
            HStack {
                Text(Self.dateFmt.string(from: day.date))
                    .font(.subheadline.bold())
                Spacer()
                if let sleep = day.sleep {
                    Label(formatSleep(sleep.totalMinutes), systemImage: "moon.fill")
                        .font(.caption)
                        .foregroundStyle(.indigo)
                }
                if let w = weight {
                    Text(String(format: "%.1f kg", w))
                        .font(.caption)
                        .foregroundStyle(day.weight != nil ? Color.primary : Color.secondary)
                        .padding(.leading, 8)
                }
            }
            .padding(.horizontal, 14)
            .padding(.top, 12)
            .padding(.bottom, 8)

            Divider().padding(.horizontal, 14)

            // Stats row: energy + vo2 + workouts
            HStack(spacing: 0) {
                // Energy dots
                Button { onTapEnergy() } label: {
                    VStack(spacing: 3) {
                        HStack(spacing: 3) {
                            ForEach(1...5, id: \.self) { i in
                                Circle()
                                    .fill(i <= (userStore.energy(for: day.date) ?? 0)
                                          ? Color.orange : Color.secondary.opacity(0.2))
                                    .frame(width: 8, height: 8)
                            }
                        }
                        Text("Energy")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                    .frame(maxWidth: .infinity)
                }
                .buttonStyle(.plain)

                // VO2
                if let v = vo2 {
                    VStack(spacing: 3) {
                        Text(String(format: "%.1f", v))
                            .font(.caption.bold())
                            .foregroundStyle(day.vo2Max != nil ? Color.teal : Color.secondary)
                        Text("VO₂")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                    .frame(maxWidth: .infinity)
                }

                // Workouts
                ForEach(day.workouts, id: \.id) { workout in
                    Button { onTapWorkout([workout]) } label: {
                        VStack(spacing: 3) {
                            Text("\(workout.durationMinutes)")
                                .font(.caption.bold())
                                .foregroundStyle(workout.type.color)
                            Text(workout.type.rawValue)
                                .font(.caption2)
                                .foregroundStyle(workout.type.color.opacity(0.8))
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 4)
                        .background(workout.type.color.opacity(0.08), in: RoundedRectangle(cornerRadius: 6))
                        .padding(.horizontal, 3)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 10)
        }
        .background(Color(uiColor: .secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 12))
    }

    private func formatSleep(_ minutes: Double) -> String {
        let h = Int(minutes) / 60; let m = Int(minutes) % 60
        return h > 0 ? "\(h)h\(m > 0 ? " \(m)m" : "")" : "\(m)m"
    }
}

struct EnergyPickerItem: Identifiable {
    let id = UUID()
    let date: Date
}

struct SelectedWorkoutsItem: Identifiable {
    let id = UUID()
    let workouts: [HealthWorkout]
}
