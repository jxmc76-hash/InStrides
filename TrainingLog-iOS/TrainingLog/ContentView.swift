import SwiftUI

struct ContentView: View {
    @State private var healthKit = HealthKitManager()
    @State private var userStore = UserStore()
    @State private var depthPromptWorkout: HealthWorkout? = nil

    var body: some View {
        TabView {
            GridView()
                .tabItem { Label("Grid", systemImage: "grid") }

            LogView()
                .tabItem { Label("Log", systemImage: "list.bullet") }

            PlanView()
                .tabItem { Label("Plan", systemImage: "calendar") }

            TrendsView()
                .tabItem { Label("Trends", systemImage: "chart.line.uptrend.xyaxis") }
        }
        .environment(healthKit)
        .environment(userStore)
        .task {
            await healthKit.requestAuthorization()
            await scheduleEnergyReminder(time: userStore.reminderTime)
            checkForUnscoredSitWorkouts()
        }
        .onChange(of: healthKit.dailyData) { _, _ in
            checkForUnscoredSitWorkouts()
        }
        .sheet(item: $depthPromptWorkout) { workout in
            DepthPromptSheet(workout: workout)
        }
    }

    private func checkForUnscoredSitWorkouts() {
        let today = Calendar.current.startOfDay(for: Date())
        let todaySits = healthKit.dailyData
            .first { Calendar.current.startOfDay(for: $0.date) == today }?
            .workouts(for: .sit) ?? []
        depthPromptWorkout = todaySits.first { userStore.effort(for: $0.id) == nil }
    }
}
