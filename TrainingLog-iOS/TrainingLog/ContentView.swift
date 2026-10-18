import SwiftUI

struct ContentView: View {
    @State private var healthKit = HealthKitManager()
    @State private var userStore = UserStore()

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
        }
    }
}
