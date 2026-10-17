import SwiftUI

struct OnboardingView: View {
    @Environment(TrainingStore.self) private var store
    @State private var isRequesting = false

    var body: some View {
        VStack(spacing: 32) {
            Spacer()

            Image(systemName: "heart.text.square.fill")
                .font(.system(size: 72))
                .foregroundStyle(.brand)

            VStack(spacing: 12) {
                Text("Welcome to InStrides")
                    .font(.largeTitle.bold())
                Text("InStrides reads your workouts and health metrics from Apple Health to track your training load, fitness and recovery.")
                    .font(.body)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            }

            VStack(alignment: .leading, spacing: 16) {
                FeatureRow(symbol: "figure.run", title: "Workouts", detail: "Every run, ride, swim and session, with heart rate and routes.")
                FeatureRow(symbol: "chart.line.uptrend.xyaxis", title: "Fitness & fatigue", detail: "A daily training load model built from your heart rate.")
                FeatureRow(symbol: "bed.double.fill", title: "Recovery", detail: "Resting HR, HRV and sleep compared with your baseline.")
                FeatureRow(symbol: "lock.fill", title: "Private", detail: "Data stays on your iPhone. InStrides never writes to Health.")
            }
            .padding(.horizontal)

            Spacer()

            VStack(spacing: 12) {
                if case .failed(let message) = store.phase {
                    Text(message)
                        .font(.footnote)
                        .foregroundStyle(.red)
                        .multilineTextAlignment(.center)
                }
                Button {
                    isRequesting = true
                    Task {
                        await store.requestAuthorization()
                        isRequesting = false
                    }
                } label: {
                    Group {
                        if isRequesting {
                            ProgressView().tint(.white)
                        } else {
                            Text("Connect Apple Health")
                        }
                    }
                    .font(.headline)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 6)
                }
                .buttonStyle(.borderedProminent)
                .disabled(isRequesting)

                Button("Explore with sample data") {
                    Task { await store.setUseSampleData(true) }
                }
                .font(.subheadline)
            }
        }
        .padding(24)
    }
}

private struct FeatureRow: View {
    let symbol: String
    let title: String
    let detail: String

    var body: some View {
        HStack(alignment: .top, spacing: 16) {
            Image(systemName: symbol)
                .font(.title2)
                .foregroundStyle(.brand)
                .frame(width: 32)
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.headline)
                Text(detail).font(.subheadline).foregroundStyle(.secondary)
            }
        }
    }
}

#Preview {
    OnboardingView()
        .previewStore()
}
