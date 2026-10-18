import SwiftUI
import SwiftData

@main
struct TrainingLogApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
                .modelContainer(for: [TrainingPlan.self, PlanSession.self])
        }
    }
}
