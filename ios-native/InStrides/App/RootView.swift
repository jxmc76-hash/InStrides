import SwiftUI

struct RootView: View {
    @Environment(TrainingStore.self) private var store
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        Group {
            if store.needsAuthorization {
                OnboardingView()
            } else {
                TabView {
                    DashboardView()
                        .tabItem { Label("Today", systemImage: "gauge.with.dots.needle.50percent") }
                    WorkoutListView()
                        .tabItem { Label("Workouts", systemImage: "figure.run") }
                    TrendsView()
                        .tabItem { Label("Trends", systemImage: "chart.xyaxis.line") }
                    SettingsView()
                        .tabItem { Label("Settings", systemImage: "gearshape") }
                }
            }
        }
        .task { await store.start() }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active, store.phase == .loaded {
                Task { await store.refresh() }
            }
        }
    }
}

#Preview {
    RootView()
        .environment(TrainingStore.preview())
        .tint(.brand)
}
