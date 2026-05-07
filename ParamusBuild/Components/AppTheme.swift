import SwiftData
import SwiftUI
import UIKit

extension ModelContext {
    /// Roll back unsaved changes AND clear the undo stack. Use after a save() throws —
    /// otherwise the undoManager retains references to rolled-back operations.
    func safeRollback() {
        rollback()
        undoManager?.removeAllActions()
    }
}

enum AppTheme {
    // MARK: Brand

    static let brand = Color(light: hex(0x1E3A5F), dark: hex(0x3C5C84))
    static let brandSoft = Color(light: hex(0xE6EDF6), dark: hex(0x1A2A40))
    /// Legacy `accent` is now an alias for `brand` so existing call sites resolve to the
    /// new primary slate-blue. Use `highlight` (amber) for true accent highlights.
    static let accent = brand
    static let highlight = Color(light: hex(0xC97D1F), dark: hex(0xE8A33D))
    static let accentSoft = Color(light: hex(0xFBEAD0), dark: hex(0x3B2C16))

    // MARK: Surfaces

    static let pageBackground = Color(light: hex(0xFAF8F5), dark: hex(0x0E1116))
    static let surface = Color(light: hex(0xFFFFFF), dark: hex(0x181C22))
    static let surfaceSunken = Color(light: hex(0xF2EDE3), dark: hex(0x0A0D11))
    static let surfaceElevated = Color(light: hex(0xFFFFFF), dark: hex(0x1F242C))
    static let cardBackground = surface
    static let border = Color(light: hex(0xE6DFD3), dark: hex(0x2A2F38))
    static let divider = Color(light: hex(0xEBE4D6), dark: hex(0x232831))

    // MARK: Ink

    static let ink = Color(light: hex(0x141821), dark: hex(0xF5F1E8))
    static let inkSecondary = Color(light: hex(0x4F5563), dark: hex(0xB6BCC9))
    static let inkTertiary = Color(light: hex(0x8A8F9C), dark: hex(0x6E7484))
    static let muted = inkSecondary

    // MARK: Status

    static let positive = Color(light: hex(0x2E7D5F), dark: hex(0x4FB58A))
    static let warning = Color(light: hex(0xC97D1F), dark: hex(0xE8A33D))
    static let negative = Color(light: hex(0xB83A3A), dark: hex(0xE36464))
    static let info = Color(light: hex(0x2B6E7A), dark: hex(0x5BA9B5))

    // MARK: Radii

    enum Radius {
        static let xs: CGFloat = 8
        static let sm: CGFloat = 12
        static let md: CGFloat = 16
        static let lg: CGFloat = 20
        static let xl: CGFloat = 28
        static let pill: CGFloat = 999
    }

    // MARK: Spacing

    enum Space {
        static let xxs: CGFloat = 4
        static let xs: CGFloat = 8
        static let sm: CGFloat = 12
        static let md: CGFloat = 16
        static let lg: CGFloat = 20
        static let xl: CGFloat = 28
        static let xxl: CGFloat = 36
    }

    // MARK: Backwards-compat aliases

    static let cardRadius: CGFloat = Radius.md
    static let pagePadding: CGFloat = Space.md

    // MARK: Semantic colors

    static func healthColor(_ health: BudgetHealth) -> Color {
        switch health {
        case .healthy: positive
        case .nearLimit: warning
        case .overBudget: negative
        }
    }

    static func projectStatusColor(_ status: ProjectStatus) -> Color {
        switch status {
        case .planning: brand
        case .active: positive
        case .paused: warning
        case .complete: info
        }
    }

    static func projectPriorityColor(_ priority: ProjectPriority) -> Color {
        switch priority {
        case .low: inkTertiary
        case .normal: brand
        case .high: warning
        case .urgent: negative
        }
    }

    static func documentStatusColor(_ status: ProjectDocumentStatus) -> Color {
        switch status {
        case .required: warning
        case .received: positive
        case .missing: negative
        }
    }

    // MARK: Hex helper

    fileprivate static func hex(_ value: UInt32) -> Color {
        let r = Double((value >> 16) & 0xFF) / 255
        let g = Double((value >> 8) & 0xFF) / 255
        let b = Double(value & 0xFF) / 255
        return Color(.sRGB, red: r, green: g, blue: b, opacity: 1)
    }
}

// MARK: - Color helpers

extension Color {
    init(light: Color, dark: Color) {
        self = Color(UIColor { traits in
            traits.userInterfaceStyle == .dark
                ? UIColor(dark)
                : UIColor(light)
        })
    }
}

// MARK: - Typography

enum AppFont {
    static func display(_ size: CGFloat, weight: Font.Weight = .bold) -> Font {
        .system(size: size, weight: weight, design: .rounded)
    }

    static func numeric(_ size: CGFloat, weight: Font.Weight = .bold) -> Font {
        .system(size: size, weight: weight, design: .rounded)
    }

    static let largeTitle = display(34, weight: .bold)
    static let title = display(28, weight: .bold)
    static let title2 = display(22, weight: .semibold)
    static let title3 = display(20, weight: .semibold)
    static let headline = Font.system(.headline, design: .rounded).weight(.semibold)
    static let body = Font.system(.body, design: .default)
    static let bodyMedium = Font.system(.body, design: .default).weight(.medium)
    static let callout = Font.system(.callout, design: .default)
    static let subheadline = Font.system(.subheadline, design: .default)
    static let footnote = Font.system(.footnote, design: .default)
    static let caption = Font.system(.caption, design: .default).weight(.medium)
    static let caption2 = Font.system(.caption2, design: .default).weight(.semibold)
    static let eyebrow = Font.system(.caption2, design: .default).weight(.bold).smallCaps()
}

// MARK: - Shadows

enum AppShadow {
    static func subtle(_ view: some View) -> some View {
        view.shadow(color: Color.black.opacity(0.04), radius: 8, x: 0, y: 2)
    }

    static func floating(_ view: some View) -> some View {
        view.shadow(color: Color.black.opacity(0.06), radius: 24, x: 0, y: 10)
    }
}

extension View {
    func appCardShadow() -> some View {
        shadow(color: Color.black.opacity(0.045), radius: 10, x: 0, y: 3)
    }

    func appFloatingShadow() -> some View {
        shadow(color: Color.black.opacity(0.08), radius: 28, x: 0, y: 12)
    }
}

// MARK: - Haptics

enum Haptics {
    private static let impact: UIImpactFeedbackGenerator = {
        let generator = UIImpactFeedbackGenerator(style: .light)
        generator.prepare()
        return generator
    }()

    private static let notification: UINotificationFeedbackGenerator = {
        let generator = UINotificationFeedbackGenerator()
        generator.prepare()
        return generator
    }()

    static func lightTap() {
        impact.impactOccurred()
        impact.prepare()
    }

    static func success() {
        notification.notificationOccurred(.success)
        notification.prepare()
    }

    static func warning() {
        notification.notificationOccurred(.warning)
        notification.prepare()
    }
}

// MARK: - App info & settings keys

enum AppInfo {
    static var versionString: String {
        let info = Bundle.main.infoDictionary
        let version = info?["CFBundleShortVersionString"] as? String ?? "1.0"
        let build = info?["CFBundleVersion"] as? String ?? ""
        return build.isEmpty ? version : "\(version) (\(build))"
    }
}

enum AppSettingsKeys {
    static let preferLargeControls = "preferLargeJobsiteControls"
    static let showCentsInExports = "showCentsInExports"
    static let autoFillFromScans = "autoFillFromReceiptScans"
}

// MARK: - Text field behaviour

enum TextFieldSelectionBehavior {
    static func enableSelectAllOnFocus() {
        _ = observers
    }

    private static let observers: [NSObjectProtocol] = {
        let center = NotificationCenter.default
        let textFieldObserver = center.addObserver(
            forName: UITextField.textDidBeginEditingNotification,
            object: nil,
            queue: .main
        ) { notification in
            guard let textField = notification.object as? UITextField,
                  let text = textField.text,
                  !text.isEmpty
            else {
                return
            }

            DispatchQueue.main.async {
                textField.selectAll(nil)
            }
        }

        let textViewObserver = center.addObserver(
            forName: UITextView.textDidBeginEditingNotification,
            object: nil,
            queue: .main
        ) { notification in
            guard let textView = notification.object as? UITextView,
                  !textView.text.isEmpty
            else {
                return
            }

            DispatchQueue.main.async {
                textView.selectAll(nil)
            }
        }

        return [textFieldObserver, textViewObserver]
    }()
}

// MARK: - Currency formatters

private enum CurrencyFormatters {
    static let whole: NumberFormatter = {
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.maximumFractionDigits = 0
        return formatter
    }()

    static let compact: NumberFormatter = {
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.minimumFractionDigits = 0
        formatter.maximumFractionDigits = 0
        formatter.usesGroupingSeparator = true
        return formatter
    }()

    static let exact: NumberFormatter = {
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.minimumFractionDigits = 2
        formatter.maximumFractionDigits = 2
        formatter.usesGroupingSeparator = true
        return formatter
    }()
}

enum AppCurrencyPreferences {
    static var showCents: Bool {
        UserDefaults.standard.object(forKey: AppSettingsKeys.showCentsInExports) as? Bool ?? true
    }
}

extension Double {
    var currencyString: String {
        CurrencyFormatters.whole.string(from: NSNumber(value: self)) ?? "$0"
    }

    var signedCurrencyString: String {
        let value = abs(self).currencyString
        if self < 0 { return "-\(value)" }
        if self > 0 { return "+\(value)" }
        return value
    }

    var compactCurrencyString: String {
        let absolute = abs(self)
        let sign = self < 0 ? "-" : ""

        switch absolute {
        case 1_000_000...:
            return "\(sign)$\(String(format: "%.1f", absolute / 1_000_000))M"
        case 10000...:
            return "\(sign)$\(String(format: "%.0f", absolute / 1000))k"
        case 1000...:
            return "\(sign)$\(String(format: "%.1f", absolute / 1000))k"
        default:
            return CurrencyFormatters.compact.string(from: NSNumber(value: self)) ?? "$0"
        }
    }
}

extension Date {
    var shortDateString: String {
        formatted(.dateTime.month(.abbreviated).day().year(.twoDigits))
    }

    var timelineString: String {
        formatted(.dateTime.month(.abbreviated).day().hour().minute())
    }
}

extension String {
    var trimmed: String {
        trimmingCharacters(in: .whitespacesAndNewlines)
    }
}
