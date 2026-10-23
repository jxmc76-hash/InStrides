import SwiftUI

struct EnergyPickerSheet: View {
    let date: Date
    @EnvironmentObject var userStore: UserStore
    @Environment(\.dismiss) private var dismiss
    @State private var selected: Int = 3

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

                HStack(spacing: 16) {
                    ForEach(1...5, id: \.self) { i in
                        Button {
                            selected = i
                        } label: {
                            VStack(spacing: 6) {
                                Circle()
                                    .fill(i <= selected ? Color.orange : Color.secondary.opacity(0.25))
                                    .frame(width: 44, height: 44)
                                    .overlay(
                                        Text("\(i)")
                                            .font(.headline)
                                            .foregroundStyle(i <= selected ? .white : .secondary)
                                    )
                                    .scaleEffect(selected == i ? 1.15 : 1.0)
                                    .animation(.spring(response: 0.2), value: selected)

                                Text(label(for: i))
                                    .font(.caption2)
                                    .foregroundStyle(.secondary)
                            }
                        }
                        .buttonStyle(.plain)
                    }
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
                selected = userStore.energy(for: date) ?? 3
            }
        }
    }

    private func label(for i: Int) -> String {
        switch i {
        case 1: "Drained"
        case 2: "Low"
        case 3: "Okay"
        case 4: "Good"
        case 5: "Great"
        default: ""
        }
    }
}
