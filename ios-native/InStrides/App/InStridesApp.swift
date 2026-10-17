import SwiftUI

@main
struct InStridesApp: App {
    @State private var store = TrainingStore(settings: UserSettings())

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(store)
                .tint(.brand)
        }
    }
}

extension ShapeStyle where Self == Color {
    /// InStrides orange (#FF5500), shared with the web and React Native apps.
    static var brand: Color { Color(red: 1.0, green: 0.333, blue: 0.0) }
}
