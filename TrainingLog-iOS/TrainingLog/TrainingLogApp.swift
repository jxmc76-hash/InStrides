import SwiftUI
import SwiftData
import UserNotifications

@main
struct TrainingLogApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
                .modelContainer(for: [TrainingPlan.self, PlanSession.self])
                .task { await scheduleEnergyReminder() }
        }
    }

    private func scheduleEnergyReminder() async {
        let center = UNUserNotificationCenter.current()
        let granted = (try? await center.requestAuthorization(options: [.alert, .sound])) ?? false
        guard granted else { return }

        // Remove any existing energy reminder before rescheduling
        center.removePendingNotificationRequests(withIdentifiers: ["energy-reminder"])

        let content = UNMutableNotificationContent()
        content.title = "Training Log"
        content.body = "How's your energy today? Tap to log it."
        content.sound = .default

        var components = DateComponents()
        components.hour = 7
        components.minute = 0
        let trigger = UNCalendarNotificationTrigger(dateMatching: components, repeats: true)

        let request = UNNotificationRequest(identifier: "energy-reminder", content: content, trigger: trigger)
        try? await center.add(request)
    }
}
