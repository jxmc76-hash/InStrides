import SwiftUI

struct EnergyPickerSheet: View {
    let date: Date
    @EnvironmentObject var userStore: UserStore
    @Environment(\.dismiss) private var dismiss
    @State private var selected: Int = 6

    private static let dateFmt: DateFormatter = {
        let f = DateFormatter(); f.dateStyle = .medium; return f
    }()

    var body: some View {
        NavigationStack {
            VStack(spacing: 40) {
                Text("How's your energy today?")
                    .font(.title2.bold())
                    .multilineTextAlignment(.center)

                Text(Self.dateFmt.string(from: date))
                    .font(.subheadline)
                    .foregroundStyle(.secondary)

                VStack(spacing: 20) {
                    LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 12), count: 5),
                              spacing: 16) {
                        ForEach(1...10, id: \.self) { i in
                            Button {
                                selected = i
                            } label: {
                                Circle()
                                    .fill(i <= selected ? Color.appTeal : Color.secondary.opacity(0.25))
                                    .frame(width: 48, height: 48)
                                    .overlay(
                                        Text("\(i)")
                                            .font(.headline)
                                            .foregroundStyle(i <= selected ? .white : .secondary)
                                    )
                                    .scaleEffect(selected == i ? 1.15 : 1.0)
                                    .animation(.spring(response: 0.2), value: selected)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .frame(maxWidth: 360)

                    Text(label(for: selected))
                        .font(.headline)
                        .foregroundStyle(Color.appTeal)
                }

                Spacer()
            }
            .padding(32)
            .navigationTitle("Energy")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        userStore.setEnergy(selected, for: date)
                        dismiss()
                    }
                }
            }
            .onAppear {
                selected = userStore.energy(for: date) ?? 6
            }
        }
    }

    private func label(for i: Int) -> String {
        switch i {
        case ...2: "Drained"
        case 3...4: "Low"
        case 5...6: "Okay"
        case 7...8: "Good"
        default: "Great"
        }
    }
}
