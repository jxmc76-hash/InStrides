import SwiftUI

struct LogView: View {
    @Environment(HealthKitManager.self) private var hk
    @Environment(UserStore.self) private var userStore
    @State private var energyPickerDate: Date? = nil

    private static let dateFmt: DateFormatter = {
        let f = DateFormatter(); f.dateFormat = "d MMM"; return f
    }()

    var body: some View {
        NavigationStack {
            ScrollView(.vertical) {
                ScrollView(.horizontal, showsIndicators: false) {
                    VStack(spacing: 0) {
                        headerRow
                        Divider()
                        bodyRows
                    }
                    .padding(.bottom, 32)
                }
            }
            .navigationTitle("Log")
            .sheet(item: Binding(
                get: { energyPickerDate.map { EnergyPickerItem(date: $0) } },
                set: { _ in energyPickerDate = nil }
            )) { item in
                EnergyPickerSheet(date: item.date)
            }
        }
    }

    @ViewBuilder
    private var headerRow: some View {
        HStack(spacing: 0) {
            colHeader("Date",    width: 72)
            colHeader("Sleep",   width: 64)
            colHeader("Energy",  width: 64)
            colHeader("VO₂",     width: 64)
            colHeader("Weight",  width: 64)
            ForEach(userStore.selectedColumns) { col in
                colHeader(col.displayName, width: 64, color: col.color)
            }
        }
        .padding(.horizontal, 16)
        .background(.bar)
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

    @ViewBuilder
    private var bodyRows: some View {
        let grouped = groupByWeek(hk.dailyData)
        let wFill = carryForwardWeight
        let vFill = carryForwardVO2
        ForEach(grouped, id: \.week) { group in
            weekSummaryRow(for: group.days)
            ForEach(group.days) { day in
                dayRow(day, weight: wFill[day.date], vo2: vFill[day.date])
                Divider().padding(.leading, 16)
            }
        }
    }

    @ViewBuilder
    private func dayRow(_ day: DailyHealthData, weight: Double?, vo2: Double?) -> some View {
        HStack(spacing: 0) {
            Text(Self.dateFmt.string(from: day.date))
                .frame(width: 72, alignment: .leading)
                .font(.caption)
                .foregroundStyle(.secondary)

            // Sleep score
            cell(day.sleep.map { "\($0.score)" } ?? "—", width: 64)

            // Energy (tappable)
            Button {
                energyPickerDate = day.date
            } label: {
                let energy = userStore.energy(for: day.date)
                energyDots(energy)
                    .frame(width: 64)
            }
            .buttonStyle(.plain)

            // VO2 Max (carry-forward, muted if not today's reading)
            if let v = vo2 {
                Text(String(format: "%.1f", v))
                    .frame(width: 64)
                    .font(.caption)
                    .foregroundStyle(day.vo2Max != nil ? Color.primary : Color.secondary)
            } else {
                cell("—", width: 64)
            }

            // Weight (carry-forward, muted if not today's reading)
            if let w = weight {
                Text(String(format: "%.1f", w))
                    .frame(width: 64)
                    .font(.caption)
                    .foregroundStyle(day.weight != nil ? Color.primary : Color.secondary)
            } else {
                cell("—", width: 64)
            }

            // Workout durations
            ForEach(userStore.selectedColumns) { col in
                let mins = day.totalDuration(for: col)
                Text(mins > 0 ? "\(mins)" : "—")
                    .frame(width: 64)
                    .font(.caption)
                    .foregroundStyle(mins > 0 ? col.color : Color.secondary)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 6)
    }

    @ViewBuilder
    private func weekSummaryRow(for days: [DailyHealthData]) -> some View {
        let avgSleep = avg(days.compactMap { $0.sleep?.score }.map { Double($0) })
        let avgEnergy = avgInt(days.compactMap { d in userStore.energy(for: d.date) })
        let avgVo2 = avg(days.compactMap { $0.vo2Max })
        let avgWeight = avg(days.compactMap { $0.weight })

        HStack(spacing: 0) {
            Text("Wk avg")
                .frame(width: 72, alignment: .leading)
                .font(.caption2.bold())
                .foregroundStyle(.secondary)

            summaryCell(avgSleep.map { "\(Int($0))" } ?? "—", width: 64)
            summaryCell(avgEnergy.map { "\($0)" } ?? "—", width: 64)
            summaryCell(avgVo2.map { String(format: "%.1f", $0) } ?? "—", width: 64)
            summaryCell(avgWeight.map { String(format: "%.1f", $0) } ?? "—", width: 64)

            ForEach(userStore.selectedColumns) { col in
                let total = days.reduce(0) { $0 + $1.totalDuration(for: col) }
                summaryCell(total > 0 ? "\(total)" : "—", width: 64)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 4)
        .background(Color.secondary.opacity(0.07))
    }

    private func colHeader(_ title: String, width: CGFloat, color: Color = .secondary) -> some View {
        Text(title)
            .frame(width: width, alignment: title == "Notes" ? .leading : .center)
            .font(.caption2.bold())
            .foregroundStyle(color)
            .padding(.vertical, 8)
    }

    private func cell(_ text: String, width: CGFloat) -> some View {
        Text(text)
            .frame(width: width)
            .font(.caption)
            .foregroundStyle(text == "—" ? Color.secondary : Color.primary)
    }

    private func summaryCell(_ text: String, width: CGFloat) -> some View {
        Text(text)
            .frame(width: width)
            .font(.caption2.bold())
            .foregroundStyle(.secondary)
    }

    @ViewBuilder
    private func energyDots(_ value: Int?) -> some View {
        HStack(spacing: 2) {
            ForEach(1...5, id: \.self) { i in
                Circle()
                    .fill(i <= (value ?? 0) ? Color.orange : Color.secondary.opacity(0.3))
                    .frame(width: 7, height: 7)
            }
        }
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

struct EnergyPickerItem: Identifiable {
    let id = UUID()
    let date: Date
}
