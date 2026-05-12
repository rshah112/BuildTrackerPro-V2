import Foundation

/// Currency math helpers that guard against `Double` IEEE-754 accumulation drift.
///
/// Every `Double` in this app that represents money is treated as exact cents
/// (rounded to two decimal places). The helpers below preserve that invariant at
/// every arithmetic boundary so a run of summations doesn't drift below the cent.
///
/// Why this matters at Raj's scale: a $1M, 15-month build with thousands of line
/// items and expenses is well inside the range where IEEE 754 drift is sub-cent in
/// the absolute sense, but it's enough to flip comparisons like `actual > budget`
/// from a "near limit" tile to "over budget" on a tile that's pixel-exactly even.
/// Routing all aggregation through integer cents removes those flips entirely.
///
/// Why not just convert money fields to `Decimal` or `Int64` on the @Model classes:
/// SwiftData supports `Decimal`, but changing the stored type on a live store mid-
/// project requires a schema migration with real risk of data loss. Wrapping the
/// math at the service boundary gets us cent-exact aggregation and comparison
/// without touching the persisted schema. A future migration to `Decimal` is the
/// cleanest long-term direction; this is the safe-now intermediate.
enum MoneyMath {
    /// Convert a Double dollar value to whole-cent integer cents using banker's rounding.
    /// Banker's rounding (.toNearestOrEven) is the standard for financial reporting and
    /// avoids the systematic upward bias of "round half up" over many transactions.
    static func cents(_ value: Double) -> Int64 {
        Int64((value * 100).rounded(.toNearestOrEven))
    }

    /// Convert cents back to a Double dollar value. Lossless for any cent integer up
    /// to ~9.2 × 10^15, i.e. ~$92 quadrillion — well past any plausible project total.
    static func dollars(_ cents: Int64) -> Double {
        Double(cents) / 100
    }

    /// Sum a sequence of Double dollar values via integer cents. The result is
    /// guaranteed cent-exact: no IEEE 754 drift can sneak in across operands.
    static func sum<S: Sequence>(_ values: S) -> Double where S.Element == Double {
        let totalCents = values.reduce(Int64(0)) { $0 + cents($1) }
        return dollars(totalCents)
    }

    /// Sum a sequence of money values projected from each element.
    static func sum<S: Sequence>(_ values: S, by keyPath: (S.Element) -> Double) -> Double {
        let totalCents = values.reduce(Int64(0)) { $0 + cents(keyPath($1)) }
        return dollars(totalCents)
    }

    /// Cent-exact difference. Equivalent to `(a - b).roundedToCents` but written as an
    /// integer subtraction so the result is unambiguous.
    static func diff(_ a: Double, _ b: Double) -> Double {
        dollars(cents(a) - cents(b))
    }
}

extension Double {
    /// Snap a Double to the nearest cent using banker's rounding. Use at the boundary
    /// between user-typed input and stored money fields, and again at the boundary
    /// between computed-aggregate Doubles and code that compares them.
    var roundedToCents: Double {
        MoneyMath.dollars(MoneyMath.cents(self))
    }
}

extension Sequence where Element == Double {
    /// `[1.10, 2.20, 3.30].sumRoundedToCents()` → 6.60, even when the same `reduce(+)`
    /// would produce 6.6000000000000005.
    func sumRoundedToCents() -> Double {
        MoneyMath.sum(self)
    }
}
