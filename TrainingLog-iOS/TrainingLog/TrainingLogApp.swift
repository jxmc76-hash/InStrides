import SwiftUI
import SwiftData
import UserNotifications

@main
struct TrainingLogApp: App {
    let container: ModelContainer

    init() {
        let schema = Schema([TrainingPlan.self, PlanSession.self])
        do {
            container = try ModelContainer(for: schema)
        } catch {
            // Migration failed — wipe store and recreate fresh
            let appSupport = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
            for file in (try? FileManager.default.contentsOfDirectory(at: appSupport, includingPropertiesForKeys: nil)) ?? [] {
                if file.lastPathComponent.hasPrefix("default") || file.pathExtension == "sqlite" || file.pathExtension == "store" {
                    try? FileManager.default.removeItem(at: file)
                }
            }
            container = try! ModelContainer(for: schema)
        }
    }

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
