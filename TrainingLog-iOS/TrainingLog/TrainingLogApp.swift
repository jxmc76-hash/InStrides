import SwiftUI
import SwiftData
import UserNotifications

@main
struct TrainingLogApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) var appDelegate

    let container: ModelContainer = {
        let schema = Schema([TrainingPlan.self, PlanSession.self, Injury.self, HealthDaySnapshot.self])
        do {
            let config = ModelConfiguration(
                schema: schema,
                cloudKitDatabase: .private("iCloud.com.johnmccarthy.traininglog")
            )
            return try ModelContainer(for: schema, configurations: config)
        } catch {
            print("CloudKit container failed, falling back to local store: \(error)")
            do {
                let local = ModelConfiguration(schema: schema, cloudKitDatabase: .none)
                return try ModelContainer(for: schema, configurations: local)
            } catch {
                fatalError("Container error: \(error)")
            }
        }
    }()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .onOpenURL { url in
                    if url.scheme == "traininglog", url.host == "energy" {
                        NotificationCenter.default.post(name: .openEnergyPicker, object: nil)
                    }
                }
        }
        .modelContainer(container)
    }
}

extension Notification.Name {
    static let openEnergyPicker = Notification.Name("openEnergyPicker")
}

class AppDelegate: NSObject, UIApplicationDelegate, @preconcurrency UNUserNotificationCenterDelegate {
    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        return true
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse, withCompletionHandler completionHandler: @escaping () -> Void) {
        if response.notification.request.identifier == "energy-reminder" {
            DispatchQueue.main.async {
                NotificationCenter.default.post(name: .openEnergyPicker, object: nil)
            }
        }
        completionHandler()
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
    content.userInfo = ["url": "traininglog://energy"]

    let cal = Calendar.current
    var components = DateComponents()
    components.hour = cal.component(.hour, from: time)
    components.minute = cal.component(.minute, from: time)
    let trigger = UNCalendarNotificationTrigger(dateMatching: components, repeats: true)

    let request = UNNotificationRequest(identifier: "energy-reminder", content: content, trigger: trigger)
    try? await center.add(request)
}

struct SessionReminderItem: Sendable {
    let date: Date
    let type: String
    let target: String
}

/// Schedules a morning notification for each upcoming day that has planned sessions.
func scheduleSessionReminders(items: [SessionReminderItem], enabled: Bool, time: Date) async {
    let center = UNUserNotificationCenter.current()

    let pending = await center.pendingNotificationRequests()
    let oldIDs = pending.map(\.identifier).filter { $0.hasPrefix("session-reminder-") }
    center.removePendingNotificationRequests(withIdentifiers: oldIDs)

    guard enabled, !items.isEmpty else { return }
    let settings = await center.notificationSettings()
    guard settings.authorizationStatus == .authorized else { return }

    let cal = Calendar.current
    let hour = cal.component(.hour, from: time)
    let minute = cal.component(.minute, from: time)
    let idFormatter = DateFormatter()
    idFormatter.dateFormat = "yyyy-MM-dd"

    let byDay = Dictionary(grouping: items) { cal.startOfDay(for: $0.date) }
    // iOS allows 64 pending notifications; keep room for the energy reminder.
    for day in byDay.keys.sorted().prefix(50) {
        guard let fireDate = cal.date(bySettingHour: hour, minute: minute, second: 0, of: day),
              fireDate > Date() else { continue }
        let sessions = (byDay[day] ?? []).sorted { $0.date < $1.date }

        let content = UNMutableNotificationContent()
        content.title = sessions.count == 1 ? "Today's session" : "Today's sessions"
        content.body = sessions
            .map { $0.target.isEmpty ? $0.type : "\($0.type): \($0.target)" }
            .joined(separator: "\n")
        content.sound = .default

        let comps = cal.dateComponents([.year, .month, .day, .hour, .minute], from: fireDate)
        let trigger = UNCalendarNotificationTrigger(dateMatching: comps, repeats: false)
        let request = UNNotificationRequest(
            identifier: "session-reminder-\(idFormatter.string(from: day))",
            content: content, trigger: trigger)
        try? await center.add(request)
    }
}
