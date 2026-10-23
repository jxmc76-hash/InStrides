import SwiftUI
import SwiftData
import UserNotifications

@main
struct TrainingLogApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) var appDelegate

    var body: some Scene {
        WindowGroup {
            ContentView()
                .onOpenURL { url in
                    if url.scheme == "traininglog", url.host == "energy" {
                        NotificationCenter.default.post(name: .openEnergyPicker, object: nil)
                    }
                }
        }
        .modelContainer(for: [TrainingPlan.self, PlanSession.self, Injury.self])
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
