import SwiftUI

struct BudgetHealthPill: View {
    let health: BudgetHealth
    var compact: Bool = false

    private var title: String {
        switch health {
        case .healthy: "On Track"
        case .nearLimit: "Watch"
        case .overBudget: "Over"
        }
    }

    private var systemImage: String {
        switch health {
        case .healthy: "checkmark.seal.fill"
        case .nearLimit: "exclamationmark.triangle.fill"
        case .overBudget: "xmark.octagon.fill"
        }
    }

    var body: some View {
        HStack(spacing: 4) {
            Image(systemName: systemImage)
                .font(.caption2.weight(.bold))
            if !compact {
                Text(title)
                    .font(AppFont.caption2)
                    .lineLimit(1)
            }
        }
        .foregroundStyle(AppTheme.healthColor(health))
        .padding(.horizontal, compact ? 6 : 9)
        .padding(.vertical, 5)
        .background(
            Capsule().fill(AppTheme.healthColor(health).opacity(0.14))
        )
    }
}

struct StatusBadge: View {
    let status: ChangeOrderStatus

    private var tint: Color {
        switch status {
        case .pending: AppTheme.warning
        case .approved: AppTheme.brand
        case .paid: AppTheme.positive
        }
    }

    private var systemImage: String {
        switch status {
        case .pending: "clock.fill"
        case .approved: "checkmark.circle.fill"
        case .paid: "dollarsign.circle.fill"
        }
    }

    var body: some View {
        HStack(spacing: 4) {
            Image(systemName: systemImage)
                .font(.caption2.weight(.bold))
            Text(status.title)
                .font(AppFont.caption2)
        }
        .foregroundStyle(tint)
        .padding(.horizontal, 9)
        .padding(.vertical, 5)
        .background(
            Capsule().fill(tint.opacity(0.14))
        )
    }
}
