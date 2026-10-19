import SwiftUI
import SwiftData
import UserNotifications

@main
struct TrainingLogApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
        }
        .modelContainer(for: [TrainingPlan.self, PlanSession.self])
    }
}

func scheduleEnergyReminder(time: Date) async {
    let center = UNUserNotificationCenter.current()
    let granted = (try? await center.requestAuthorization(options: [.alert, .sound])) ?? false
    guard granted else { return }

    center.removePendingNotificationRequests(withIdentifiers: ["energy-reminder"])

    let content = UNMutableNotificationContent()
    content.title = "Training Log"
    content.body = "How's your energy today? Tap to log it."
    content.sound = .default

    let cal = Calendar.current
    var components = DateComponents()
    components.hour = cal.component(.hour, from: time)
    components.minute = cal.component(.minute, from: time)
    let trigger = UNCalendarNotificationTrigger(dateMatching: components, repeats: true)

    let request = UNNotificationRequest(identifier: "energy-reminder", content: content, trigger: trigger)
    try? await center.add(request)
}
