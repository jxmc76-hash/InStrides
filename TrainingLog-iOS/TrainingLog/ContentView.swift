import SwiftUI

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
    @State private var userStore = UserStore()
    @State private var workoutPrompt: WorkoutPrompt? = nil
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        TabView {
            GridView()
                .environment(healthKit)
                .environment(userStore)
                .tabItem { Label("Grid", systemImage: "grid") }

            LogView()
                .environment(healthKit)
                .environment(userStore)
                .tabItem { Label("Log", systemImage: "list.bullet") }

            PlanView()
                .environment(healthKit)
                .environment(userStore)
                .tabItem { Label("Plan", systemImage: "calendar") }

            TrendsView()
                .environment(healthKit)
                .environment(userStore)
                .tabItem { Label("Trends", systemImage: "chart.line.uptrend.xyaxis") }
        }
        .tint(.orange)
        .environment(healthKit)
        .environment(userStore)
        .task {
            await healthKit.requestAuthorization()
            await scheduleEnergyReminder(time: userStore.reminderTime)
            checkForWorkoutPrompts()
        }
        .onChange(of: healthKit.dailyData.count) { _, _ in
            checkForWorkoutPrompts()
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active {
                Task { await healthKit.fetchAll() }
            }
        }
        .sheet(item: $workoutPrompt) { prompt in
            switch prompt {
            case .depth(let workout):
                DepthPromptSheet(workout: workout)
                    .environment(userStore)
                    .environment(healthKit)
            case .gymWeight(let workout):
                GymWeightEntrySheet(workout: workout)
                    .environment(userStore)
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
