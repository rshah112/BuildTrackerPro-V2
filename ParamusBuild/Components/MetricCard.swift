import SwiftUI

struct MetricCard: View {
    let title: String
    let value: String
    let subtitle: String
    let systemImage: String
    let tint: Color
    var trend: Trend?
    /// Optional precise value shown on long-press for users who need the
    /// non-abbreviated number (e.g. `$1,349,500.00` instead of `$1.3M`).
    var exactValue: String?

    enum Trend {
        case up(String)
        case down(String)
        case flat(String)

        var label: String {
            switch self {
            case let .up(v), let .down(v), let .flat(v): v
            }
        }

        var systemImage: String {
            switch self {
            case .up: "arrow.up.right"
            case .down: "arrow.down.right"
            case .flat: "arrow.right"
            }
        }

        var color: Color {
            switch self {
            case .up: AppTheme.positive
            case .down: AppTheme.negative
            case .flat: AppTheme.inkTertiary
            }
        }
    }

    var body: some View {
        PremiumCard(padding: AppTheme.Space.md) {
            VStack(alignment: .leading, spacing: AppTheme.Space.sm) {
                HStack(alignment: .center) {
                    Image(systemName: systemImage)
                        .font(.system(size: 15, weight: .bold))
                        .foregroundStyle(tint)
                        .frame(width: 34, height: 34)
                        .background(
                            RoundedRectangle(cornerRadius: AppTheme.Radius.sm, style: .continuous)
                                .fill(tint.opacity(0.14))
                        )

                    Spacer(minLength: 8)

                    if let trend {
                        HStack(spacing: 3) {
                            Image(systemName: trend.systemImage)
                                .font(.caption2.weight(.bold))
                            Text(trend.label)
                                .font(AppFont.caption2)
                        }
                        .foregroundStyle(trend.color)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(
                            Capsule().fill(trend.color.opacity(0.12))
                        )
                    }
                }

                VStack(alignment: .leading, spacing: 2) {
                    Text(value)
                        .font(AppFont.numeric(26, weight: .bold))
                        .monospacedDigit()
                        .foregroundStyle(AppTheme.ink)
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)

                    Text(title)
                        .font(AppFont.caption)
                        .foregroundStyle(AppTheme.inkSecondary)

                    Text(subtitle)
                        .font(AppFont.caption2)
                        .foregroundStyle(AppTheme.inkTertiary)
                        .lineLimit(1)
                        .padding(.top, 2)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .contextMenu {
            if let exactValue {
                Text(exactValue)
            }
        }
    }
}
