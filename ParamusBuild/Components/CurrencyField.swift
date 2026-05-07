import SwiftUI

/// A money input with live currency formatting.
///
/// - Decimal-pad keyboard
/// - Live formatting: `5000` → `$5,000`, `5000.5` → `$5,000.50`
/// - Paste handling: strips `$`, `,`, whitespace; clamps to 2 decimal places
/// - Empty → 0
/// - Negatives blocked
/// - Monospaced digits so cursor doesn't dance during typing
///
/// Replaces the mix of `TextField(value: $x, format: .currency(code: "USD"))`
/// and hand-rolled `parseCurrency` flows used throughout the app.
struct CurrencyField: View {
    @Binding var value: Double
    var prompt: String = "$0"
    var allowsCents: Bool = true
    var displayStyle: DisplayStyle = .standard

    enum DisplayStyle {
        case standard
        case hero // Used on AddExpenseView amount field — 44pt rounded.
    }

    @State private var text: String = ""
    @FocusState private var isFocused: Bool

    var body: some View {
        TextField(prompt, text: $text)
            .keyboardType(allowsCents ? .decimalPad : .numberPad)
            .font(font)
            .monospacedDigit()
            .multilineTextAlignment(displayStyle == .hero ? .leading : .leading)
            .focused($isFocused)
            .onAppear { syncTextFromValue() }
            .onChange(of: value) { _, _ in
                if !isFocused { syncTextFromValue() }
            }
            .onChange(of: text) { _, newText in
                guard isFocused else { return }
                let (cleaned, parsed) = Self.parseAndFormat(newText, allowsCents: allowsCents)
                if cleaned != newText { text = cleaned }
                value = parsed
            }
            .onChange(of: isFocused) { _, focused in
                if !focused { syncTextFromValue() }
            }
    }

    private var font: Font {
        switch displayStyle {
        case .standard: AppFont.body.weight(.medium)
        case .hero: .system(size: 44, weight: .bold, design: .rounded)
        }
    }

    private func syncTextFromValue() {
        text = Self.format(value, allowsCents: allowsCents, whileEditing: false)
    }

    // MARK: - Parsing & formatting

    /// Cleans paste-junk, parses the numeric value, returns the canonical
    /// edit-mode string (live formatting). The caller writes the cleaned
    /// string back to the bound text and the parsed value to the bound value.
    fileprivate static func parseAndFormat(_ raw: String, allowsCents: Bool) -> (String, Double) {
        // Strip everything except digits and (if allowed) one decimal point.
        var stripped = ""
        var sawDecimal = false
        for ch in raw {
            if ch.isWholeNumber {
                stripped.append(ch)
            } else if allowsCents, ch == ".", !sawDecimal {
                stripped.append(ch)
                sawDecimal = true
            }
        }

        // Limit to 2 fractional digits.
        if let dot = stripped.firstIndex(of: ".") {
            let fraction = stripped.distance(from: dot, to: stripped.endIndex) - 1
            if fraction > 2 {
                stripped = String(stripped.prefix(stripped.distance(from: stripped.startIndex, to: dot) + 3))
            }
        }

        let parsed = max(0, Double(stripped) ?? 0)

        // Re-format with grouping separators on the integer portion.
        let display: String = {
            guard !stripped.isEmpty else { return "" }
            if let dot = stripped.firstIndex(of: ".") {
                let intPart = String(stripped[..<dot])
                let fracPart = String(stripped[stripped.index(after: dot)...])
                return "$\(grouped(intPart)).\(fracPart)"
            } else {
                return "$\(grouped(stripped))"
            }
        }()

        return (display, parsed)
    }

    /// Display format used outside the focused-edit path — fully formatted with
    /// grouping and zero or two fraction digits.
    fileprivate static func format(_ value: Double, allowsCents: Bool, whileEditing: Bool) -> String {
        guard value > 0 else { return "" }
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.currencyCode = "USD"
        formatter.maximumFractionDigits = allowsCents ? 2 : 0
        formatter.minimumFractionDigits = (allowsCents && value != value.rounded()) ? 2 : 0
        return formatter.string(from: NSNumber(value: value)) ?? ""
    }

    private static func grouped(_ digits: String) -> String {
        guard let intValue = Int(digits) else { return digits }
        let formatter = NumberFormatter()
        formatter.numberStyle = .decimal
        formatter.usesGroupingSeparator = true
        return formatter.string(from: NSNumber(value: intValue)) ?? digits
    }
}

#Preview {
    @Previewable @State var amount: Double = 0
    @Previewable @State var hero = 1234.56

    return Form {
        Section("Standard") {
            CurrencyField(value: $amount, prompt: "$0")
                .modernTextField()
            Text("value: \(amount)")
        }
        Section("Hero") {
            CurrencyField(value: $hero, prompt: "$0", displayStyle: .hero)
        }
    }
}
