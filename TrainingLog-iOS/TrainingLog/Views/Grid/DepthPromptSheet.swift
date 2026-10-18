import SwiftUI
import UIKit

struct DepthPromptSheet: View {
    let workout: HealthWorkout
    @Environment(UserStore.self) private var userStore
    @Environment(\.dismiss) private var dismiss

    private let haptic = UIImpactFeedbackGenerator(style: .light)

    var body: some View {
        @Bindable var store = userStore
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
