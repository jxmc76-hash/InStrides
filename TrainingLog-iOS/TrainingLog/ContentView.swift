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
    @State private var showEnergyPicker = false
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        TabView {
            GridView()
                .environment(healthKit)
                .environmentObject(userStore)
                .tabItem { Label("Overview", systemImage: "grid") }

            LogView()
                .environment(healthKit)
                .environmentObject(userStore)
                .tabItem { Label("Log", systemImage: "list.bullet") }

            PlanView()
                .environment(healthKit)
                .environmentObject(userStore)
                .tabItem { Label("Plan", systemImage: "calendar") }

            TrendsView()
                .environment(healthKit)
                .environmentObject(userStore)
                .tabItem { Label("Trends", systemImage: "chart.line.uptrend.xyaxis") }

            InjuriesView()
                .tabItem { Label("Injuries", systemImage: "bandage") }

        }
        .tint(.orange)
        .environment(healthKit)
        .environmentObject(userStore)
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
