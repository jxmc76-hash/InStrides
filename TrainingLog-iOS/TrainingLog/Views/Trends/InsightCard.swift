import SwiftUI
import FoundationModels

@Observable
@MainActor
final class InsightViewModel {
    var text: String = ""
    var isLoading = false
    var error: String? = nil

    func refresh(summary: String) async {
        isLoading = true
        error = nil
        text = ""

        do {
            let session = LanguageModelSession()
            let prompt = """
            You are a personal running and fitness coach. Based on these weekly training metrics, provide 2-3 concise, actionable insights (no more than 80 words total). Focus on trends, patterns, or recommendations.

            \(summary)
            """
            let response = try await session.respond(to: prompt)
            text = response.content
        } catch {
            self.error = "On-device AI not available on this device, or could not generate insights."
        }
        isLoading = false
    }
}

struct InsightCard: View {
    let summary: String
    @State private var vm = InsightViewModel()

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Label("AI Insights", systemImage: "sparkles")
                    .font(.subheadline.bold())
                    .foregroundStyle(.white)
                Spacer()
                Text("On-device")
                    .font(.caption2.bold())
                    .padding(.horizontal, 8)
                    .padding(.vertical, 3)
                    .background(.white.opacity(0.2), in: Capsule())
                    .foregroundStyle(.white)
                Button {
                    Task { await vm.refresh(summary: summary) }
                } label: {
                    Image(systemName: "arrow.clockwise")
                        .font(.subheadline)
                        .foregroundStyle(.white)
                }
                .disabled(vm.isLoading)
            }

            if vm.isLoading {
                HStack(spacing: 8) {
                    ProgressView()
                        .tint(.white)
                    Text("Analysing your training…")
                        .font(.subheadline)
                        .foregroundStyle(.white.opacity(0.8))
                }
            } else if let err = vm.error {
                Text(err)
                    .font(.subheadline)
                    .foregroundStyle(.white.opacity(0.7))
            } else if vm.text.isEmpty {
                Text("Tap ↻ to generate insights from your recent training data.")
                    .font(.subheadline)
                    .foregroundStyle(.white.opacity(0.7))
            } else {
                Text(vm.text)
                    .font(.subheadline)
                    .foregroundStyle(.white)
                    .lineSpacing(4)
            }
        }
        .padding(16)
        .background(
            LinearGradient(
                colors: [Color(hex: "#7C3AED"), Color(hex: "#4F46E5")],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            ),
            in: RoundedRectangle(cornerRadius: 16)
        )
    }
}
