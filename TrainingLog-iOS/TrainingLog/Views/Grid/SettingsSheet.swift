import SwiftUI
import UserNotifications

struct SettingsSheet: View {
    @EnvironmentObject var userStore: UserStore
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Form {
                Section("Energy Reminder") {
                    DatePicker("Reminder time",
                               selection: $userStore.reminderTime,
                               displayedComponents: .hourAndMinute)
                    .onChange(of: userStore.reminderTime) { _, _ in
                        Task { await rescheduleReminder() }
                    }
                }
            }
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }

    private func rescheduleReminder() async {
        let center = UNUserNotificationCenter.current()
        center.removePendingNotificationRequests(withIdentifiers: ["energy-reminder"])

        let settings = await center.notificationSettings()
        guard settings.authorizationStatus == .authorized else { return }

        let content = UNMutableNotificationContent()
        content.title = "Training Log"
        content.body = "How's your energy today? Tap to log it."
        content.sound = .default

        let cal = Calendar.current
        var components = DateComponents()
        components.hour = cal.component(.hour, from: userStore.reminderTime)
        components.minute = cal.component(.minute, from: userStore.reminderTime)
        let trigger = UNCalendarNotificationTrigger(dateMatching: components, repeats: true)

        let request = UNNotificationRequest(identifier: "energy-reminder", content: content, trigger: trigger)
        try? await center.add(request)
    }
}
