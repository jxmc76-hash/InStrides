import SwiftUI
import UIKit

struct DepthPromptSheet: View {
    let workout: HealthWorkout
    @EnvironmentObject var userStore: UserStore
    @Environment(\.dismiss) private var dismiss

    private let haptic = UIImpactFeedbackGenerator(style: .light)

    var body: some View {
        NavigationStack {
            VStack(spacing: 32) {
                VStack(spacing: 8) {
                    Text("How was your SIT session?")
                        .font(.title2.bold())
                    Text("Rate the depth of today's \(workout.durationMinutes)-minute session")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                }
                .padding(.top, 24)

                HStack(spacing: 8) {
                    ForEach(1...10, id: \.self) { i in
                        let selected = (userStore.effort(for: workout.id) ?? 0) >= i
                        Button {
                            haptic.impactOccurred()
                            userStore.setEffort(i, for: workout.id)
                        } label: {
                            Text("\(i)")
                                .font(.body.bold())
                                .frame(width: 32, height: 32)
                                .background(selected ? WorkoutType.sit.color : Color.secondary.opacity(0.15),
                                            in: RoundedRectangle(cornerRadius: 8))
                                .foregroundStyle(selected ? .white : .secondary)
                        }
                        .buttonStyle(.plain)
                    }
                }

                Spacer()
            }
            .padding(.horizontal, 24)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
                ToolbarItem(placement: .cancellationAction) {
                    Button("Skip") { dismiss() }
                }
            }
        }
        .presentationDetents([.medium])
    }
}

// MARK: - Improvements prompt

/// Asked after each new workout: anything to improve next time? Each line becomes a to-do.
struct ImprovementPromptSheet: View {
    let workout: HealthWorkout
    @EnvironmentObject var todoStore: TodoStore
    @Environment(\.dismiss) private var dismiss
    @State private var text = ""
    @FocusState private var focused: Bool

    private static let dateFmt: DateFormatter = {
        let f = DateFormatter(); f.dateFormat = "EEE d MMM, h:mm a"; return f
    }()

    private var lines: [String] {
        text.split(whereSeparator: \.isNewline)
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty }
    }

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 16) {
                HStack(spacing: 12) {
                    Image(systemName: workout.type.icon)
                        .font(.title2)
                        .foregroundStyle(workout.type.color)
                        .frame(width: 36)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(workout.type.displayName.capitalized)
                            .font(.headline)
                        Text("\(Self.dateFmt.string(from: workout.startDate)) · \(TodoStore.summary(of: workout))")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }

                Text("Anything to improve next time?")
                    .font(.title3.bold())

                TextEditor(text: $text)
                    .focused($focused)
                    .frame(minHeight: 120)
                    .padding(10)
                    .scrollContentBackground(.hidden)
                    .background(Color.secondary.opacity(0.1), in: RoundedRectangle(cornerRadius: 10))

                Text("One improvement per line. Each becomes a to-do in Log.")
                    .font(.caption)
                    .foregroundStyle(.secondary)

                Spacer()
            }
            .padding(20)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Skip") {
                        todoStore.markAsked(workout.id)
                        dismiss()
                    }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(lines.count > 1 ? "Save \(lines.count)" : "Save") {
                        for line in lines { todoStore.add(line, from: workout) }
                        todoStore.markAsked(workout.id)
                        dismiss()
                    }
                    .disabled(lines.isEmpty)
                }
            }
            .onAppear { focused = true }
        }
        .presentationDetents([.medium, .large])
    }
}
