import SwiftUI
import SwiftData
import UIKit

enum WorkoutPrompt: Identifiable {
    case depth(HealthWorkout)
    case gymWeight(HealthWorkout)

    var id: UUID {
        switch self {
        case .depth(let w), .gymWeight(let w): return w.id
        }
    }
}

struct ContentView: View {
    @State private var healthKit = HealthKitManager()
    @StateObject private var userStore = UserStore()
    @State private var workoutPrompt: WorkoutPrompt? = nil
    @State private var showEnergyPicker = false
    @Environment(\.scenePhase) private var scenePhase
    // No sort: on @Query — it's broken on iOS 26; the code below sorts where needed.
    @Query private var allSessions: [PlanSession]
    @Query private var snapshots: [HealthDaySnapshot]
    @Environment(\.modelContext) private var context

    private static let snapshotDays = 84   // 12 weeks

    private var healthSyncSignature: String {
        let updated = snapshots.map { $0.updatedAt.timeIntervalSince1970 }.reduce(0, +)
        return "\(String(describing: healthKit.hasLocalHealthData))-\(healthKit.lastFetch?.timeIntervalSince1970 ?? 0)-\(snapshots.count)-\(updated)"
    }

    /// iPhone: save the last 12 weeks of Health data to iCloud.
    /// Devices without Health data: show that saved copy instead.
    private func syncHealthSnapshots() {
        guard let hasLocalData = healthKit.hasLocalHealthData else { return }
        if hasLocalData {
            if UIDevice.current.userInterfaceIdiom == .phone { writeSnapshots() }
        } else {
            applySnapshots()
        }
    }

    private func writeSnapshots() {
        let cal = Calendar.current
        let windowStart = cal.date(byAdding: .day, value: -Self.snapshotDays, to: cal.startOfDay(for: Date())) ?? Date()
        let encoder = JSONEncoder()
        let existing = Dictionary(grouping: snapshots, by: \.dayKey)
        var keep = Set<String>()
        var changed = false

        for day in healthKit.dailyData where day.date >= windowStart {
            let hasData = !day.workouts.isEmpty || day.sleep != nil || day.weight != nil || day.vo2Max != nil
            guard hasData else { continue }
            let key = HealthDaySnapshot.key(for: day.date)
            keep.insert(key)

            let workoutsData: Data? = day.workouts.isEmpty
                ? nil
                : (try? encoder.encode(day.workouts.sorted { $0.startDate < $1.startDate }))

            if let found = existing[key]?.first {
                for duplicate in (existing[key] ?? []).dropFirst() {
                    context.delete(duplicate)
                    changed = true
                }
                if found.update(from: day, workoutsData: workoutsData) { changed = true }
            } else {
                let snapshot = HealthDaySnapshot(dayKey: key, date: day.date)
                snapshot.update(from: day, workoutsData: workoutsData)
                context.insert(snapshot)
                changed = true
            }
        }

        // Remove days that are outside the 12 weeks or no longer have data.
        for snapshot in snapshots where !keep.contains(snapshot.dayKey) {
            context.delete(snapshot)
            changed = true
        }
        if changed { try? context.save() }
    }

    private func applySnapshots() {
        guard !snapshots.isEmpty else { return }
        let cal = Calendar.current
        let today = cal.startOfDay(for: Date())
        let byDay = Dictionary(
            snapshots.map { (cal.startOfDay(for: $0.date), $0.toDaily()) },
            uniquingKeysWith: { first, _ in first })

        var days: [DailyHealthData] = []
        for offset in 0...Self.snapshotDays {
            guard let date = cal.date(byAdding: .day, value: -offset, to: today) else { continue }
            days.append(byDay[date] ?? DailyHealthData(date: date, workouts: [], sleep: nil, weight: nil, vo2Max: nil))
        }
        healthKit.dailyData = days
    }

    private var reminderItems: [SessionReminderItem] {
        allSessions
            .sorted { $0.date < $1.date }
            .filter { $0.plan != nil && !$0.isComplete }
            .map { SessionReminderItem(date: $0.date, type: $0.type, target: $0.target) }
    }

    private var reminderSignature: String {
        let sessions = reminderItems
            .map { "\($0.date.timeIntervalSince1970)\($0.type)\($0.target)" }
            .joined(separator: "|")
        return "\(userStore.sessionReminderEnabled)-\(userStore.sessionReminderTime.timeIntervalSince1970)-\(sessions)"
    }

    var body: some View {
        TabView {
            Tab("Overview", systemImage: "grid") {
                GridView()
                    .environment(healthKit)
                    .environmentObject(userStore)
            }
            Tab("Log", systemImage: "list.bullet") {
                LogView()
                    .environment(healthKit)
                    .environmentObject(userStore)
            }
            Tab("Plan", systemImage: "calendar") {
                PlanView()
                    .environment(healthKit)
                    .environmentObject(userStore)
            }
            Tab("Injuries", systemImage: "bandage") {
                InjuriesView()
            }
            Tab("Trends", systemImage: "chart.line.uptrend.xyaxis") {
                TrendsView()
                    .environment(healthKit)
                    .environmentObject(userStore)
            }
        }
        .tint(.appTeal)
        .environment(healthKit)
        .environmentObject(userStore)
        .task {
            await healthKit.requestAuthorization()
            await scheduleEnergyReminder(time: userStore.reminderTime)
            checkForWorkoutPrompts()
        }
        .task(id: healthSyncSignature) {
            syncHealthSnapshots()
        }
        .task(id: reminderSignature) {
            await scheduleSessionReminders(
                items: reminderItems,
                enabled: userStore.sessionReminderEnabled,
                time: userStore.sessionReminderTime)
        }
        .onChange(of: healthKit.dailyData.count) { _, _ in
            checkForWorkoutPrompts()
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active {
                Task { await healthKit.fetchAll() }
            }
        }
        .onReceive(NotificationCenter.default.publisher(for: .openEnergyPicker)) { _ in
            showEnergyPicker = true
        }
        .sheet(isPresented: $showEnergyPicker) {
            EnergyPickerSheet(date: Calendar.current.startOfDay(for: .now))
                .environmentObject(userStore)
        }
        .sheet(item: $workoutPrompt) { prompt in
            switch prompt {
            case .depth(let workout):
                DepthPromptSheet(workout: workout)
                    .environmentObject(userStore)
                    .environment(healthKit)
            case .gymWeight(let workout):
                GymWeightEntrySheet(workout: workout)
                    .environmentObject(userStore)
                    .environment(healthKit)
            }
        }
    }

    private func checkForWorkoutPrompts() {
        let today = Calendar.current.startOfDay(for: Date())
        guard let todayData = healthKit.dailyData.first(where: {
            Calendar.current.startOfDay(for: $0.date) == today
        }) else { return }

        // Gym with no weight logged takes priority
        if let gym = todayData.workouts(for: .gym).first(where: { userStore.gymWeight(for: $0.id) == nil }) {
            workoutPrompt = .gymWeight(gym)
            return
        }

        // SIT with no depth score
        if let sit = todayData.workouts(for: .sit).first(where: { userStore.effort(for: $0.id) == nil }) {
            workoutPrompt = .depth(sit)
        }
    }
}
