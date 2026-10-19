import SwiftUI
import SwiftData
import UserNotifications

@main
struct TrainingLogApp: App {
    let container: ModelContainer = {
        let schema = Schema([TrainingPlan.self, PlanSession.self])
        let config = ModelConfiguration(schema: schema, isStoredInMemoryOnly: false)
        do {
            return try ModelContainer(for: schema, configurations: config)
        } catch {
            // Schema migration failed — wipe and recreate so the app stays usable
            if let url = config.url {
                try? FileManager.default.removeItem(at: url)
                let wal = url.deletingPathExtension().appendingPathExtension("sqlite-wal")
                let shm = url.deletingPathExtension().appendingPathExtension("sqlite-shm")
                try? FileManager.default.removeItem(at: wal)
                try? FileManager.default.removeItem(at: shm)
            }
            return try! ModelContainer(for: schema, configurations: config)
        }
    }()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .modelContainer(container)
        }
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
