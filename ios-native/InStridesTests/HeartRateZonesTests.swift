import Foundation
import Testing
@testable import InStrides

struct HeartRateZonesTests {
    let zones = HeartRateZones(maxHeartRate: 200)

    @Test func zoneBoundariesArePercentagesOfMax() {
        let bounds = zones.zones.map { [$0.lowerBound, $0.upperBound] }
        #expect(bounds == [[100, 120], [120, 140], [140, 160], [160, 180], [180, 200]])
    }

    @Test(arguments: [
        (90.0, nil as Int?),
        (100.0, 1),
        (139.0, 2),
        (140.0, 3),
        (179.0, 4),
        (195.0, 5),
        (210.0, 5),
    ])
    func zoneForHeartRate(bpm: Double, expected: Int?) {
        #expect(zones.zoneNumber(for: bpm) == expected)
    }

    @Test func timeInZonesHoldsEachSampleUntilTheNext() {
        let start = Fixtures.date(2026, 1, 5, 7)
        let samples = [
            HeartRateSample(date: start, bpm: 130), // Z2 for 30s
            HeartRateSample(date: start.addingTimeInterval(30), bpm: 165), // Z4 for 20s
            HeartRateSample(date: start.addingTimeInterval(50), bpm: 150), // last sample: no duration
        ]
        let result = zones.timeInZones(samples)
        #expect(result == [2: 30, 4: 20])
    }

    @Test func timeInZonesCapsGapsInRecording() {
        let start = Fixtures.date(2026, 1, 5, 7)
        let samples = [
            HeartRateSample(date: start, bpm: 150),
            HeartRateSample(date: start.addingTimeInterval(600), bpm: 150),
        ]
        #expect(zones.timeInZones(samples, maxGap: 60) == [3: 60])
    }

    @Test func timeInZonesSortsSamples() {
        let start = Fixtures.date(2026, 1, 5, 7)
        let samples = [
            HeartRateSample(date: start.addingTimeInterval(10), bpm: 150),
            HeartRateSample(date: start, bpm: 150),
        ]
        #expect(zones.timeInZones(samples) == [3: 10])
    }

    @Test func tanakaMaxHeartRate() {
        #expect(HeartRateZones.estimatedMaxHeartRate(age: 40) == 180)
        #expect(HeartRateZones.estimatedMaxHeartRate(age: 30) == 187)
    }
}
