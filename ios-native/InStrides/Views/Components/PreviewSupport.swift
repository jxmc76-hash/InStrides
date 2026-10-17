import SwiftUI

/// Gives a preview its own sample-data store and loads it.
@MainActor
private struct PreviewStoreModifier: ViewModifier {
    @State private var store = TrainingStore.preview()

    func body(content: Content) -> some View {
        content
            .environment(store)
            .tint(.brand)
            .task { await store.start() }
    }
}

extension View {
    func previewStore() -> some View {
        modifier(PreviewStoreModifier())
    }
}
