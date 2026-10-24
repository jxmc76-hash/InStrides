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
                        userStore.persist()
                        Task { await rescheduleReminder() }
                    }
                }

                Section {
                    Toggle("Remind me of planned sessions", isOn: $userStore.sessionReminderEnabled)
                        .onChange(of: userStore.sessionReminderEnabled) { _, _ in userStore.persist() }
                    if userStore.sessionReminderEnabled {
                        DatePicker("Reminder time",
                                   selection: $userStore.sessionReminderTime,
                                   displayedComponents: .hourAndMinute)
                            .onChange(of: userStore.sessionReminderTime) { _, _ in userStore.persist() }
                    }
                } header: {
                    Text("Session Reminder")
                } footer: {
                    Text("A morning notification on days with a planned session you haven't completed.")
                }

                Section {
                    Picker("Session length", selection: $userStore.sessionLengthMinutes) {
                        ForEach([30, 45, 60, 75, 90, 120], id: \.self) { minutes in
                            Text("\(minutes) min").tag(minutes)
                        }
                    }
                    .onChange(of: userStore.sessionLengthMinutes) { _, _ in userStore.persist() }
                } header: {
                    Text("Calendar")
                } footer: {
                    Text("How long each session appears in your calendar. Tap the calendar button on the Plan tab to update it.")
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
