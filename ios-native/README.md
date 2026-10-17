# InStrides for iOS

A native SwiftUI app that tracks your fitness and training from Apple Health. It reads workouts, heart rate,
HRV, resting HR, VO₂ max and sleep from HealthKit, then models your training load and recovery on the device.

This is separate from the Expo app in `../instrides-native`. It doesn't use Firebase: all data stays on the iPhone.

## Features

| Tab | What it shows |
| --- | --- |
| **Today** | Training form (fitness vs fatigue), this week's volume compared with last week, recovery tiles (resting HR, HRV, VO₂ max, sleep against your 4-week baseline), recent workouts |
| **Workouts** | Every workout in Health, grouped by week and filterable by activity. Detail view has pace or speed, HR, training load, a heart-rate chart, time in HR zones and the GPS route map |
| **Trends** | Weekly volume stacked by activity, fitness/fatigue/form chart, daily charts for each health metric (4 or 12 weeks) |
| **Settings** | Max and resting HR overrides, your HR zones, a sample-data toggle, a manual refresh |

Workouts from any source that writes to Health show up: Apple Watch, the Fitness app, Strava, Garmin Connect and others.
The app observes HealthKit and enables background delivery, so new workouts appear without a manual refresh.

### Training load model

- **Per-workout load** is Banister TRIMP: `minutes × HRr × a·e^(b·HRr)`. HRr is the fraction of heart-rate reserve
  used, from your resting and max HR. Workouts without heart rate fall back to a per-activity estimate.
- **Fitness** (chronic training load) is a 42-day exponentially weighted average of daily load. **Fatigue** (acute
  training load) is a 7-day average. **Form** is fitness − fatigue.
- **Max HR** defaults to the Tanaka estimate (208 − 0.7 × age), using your date of birth from Health. **Resting HR**
  defaults to your 4-week average. You can override both in Settings.

Workouts are loaded for the last 180 days so the 42-day average is warmed up. The charts show the last 90 days.

## Requirements

- A Mac with **Xcode 16 or later** (the project uses Xcode 16's synchronized folders)
- An iPhone running **iOS 17 or later**. The Simulator has no Health data, so the app uses generated sample data there.
- An Apple ID signed into Xcode. Try a free Personal Team first for running on your own phone. If Xcode won't
  provision the HealthKit capability with it, you'll need a paid Apple Developer Program membership, which TestFlight
  and the App Store require anyway.

## Getting started

1. Open `ios-native/InStrides.xcodeproj` in Xcode.
2. Select the **InStrides** target › **Signing & Capabilities**:
   - Choose your **Team**.
   - Change the **Bundle Identifier** to one you own, e.g. `com.yourname.instrides`.
   - Check that the **HealthKit** capability is listed with **Background Delivery** ticked. It comes from
     `Config/InStrides.entitlements`.
3. Pick your iPhone as the run destination and press **⌘R**. The first time, you'll need to trust the developer
   certificate on the phone: **Settings › General › VPN & Device Management**.
4. Tap **Connect Apple Health** and allow access.

Run the unit tests with **⌘U**. They use Swift Testing and cover the training-load model, HR zones, weekly and sleep
aggregation, baselines and formatting.

If the project file ever gets into a bad state, `project.yml` regenerates it with
[XcodeGen](https://github.com/yonaskolb/XcodeGen): `brew install xcodegen && xcodegen`.

## Project layout

```
InStrides/
  App/          App entry point and root tab view
  Models/       Plain value types: WorkoutSummary, ActivityKind, HealthMetric
  Analytics/    Pure logic with unit tests: TRIMP and fitness/fatigue, HR zones, weekly and sleep aggregation, formatting
  Services/     HealthDataProvider protocol, HealthKitService (the only file that imports HealthKit), SampleDataProvider
  Store/        TrainingStore (@Observable; loads data and derives everything the views show) and UserSettings
  Views/        SwiftUI screens, built with Swift Charts and MapKit
InStridesTests/ Swift Testing unit tests
Config/         Entitlements (HealthKit and background delivery)
```

Only `HealthKitService` touches HealthKit. Everything else works with plain Swift values, so the analytics are unit
tested and the UI runs on sample data in previews and the Simulator.

## Ideas for next steps

- Sync workouts into the existing InStrides Firebase log so they appear on the web app
- Home Screen widgets and an Apple Watch complication for training form
- Training plans and goals, matching the web app
- Persist computed history with SwiftData so launches are instant
- Running power, cadence and splits from workout events
