import SwiftUI

struct EmptyStateView: View {
    let title: String
    let subtitle: String
    let systemImage: String
    var actionTitle: String?
    var action: (() -> Void)?

    var body: some View {
        VStack(spacing: AppTheme.Space.md) {
            ZStack {
                Circle()
                    .fill(AppTheme.brandSoft)
                    .frame(width: 88, height: 88)

                Image(systemName: systemImage)
                    .font(.system(size: 32, weight: .semibold))
                    .foregroundStyle(AppTheme.brand)
            }

            VStack(spacing: 6) {
                Text(title)
                    .font(AppFont.title3)
                    .foregroundStyle(AppTheme.ink)

                Text(subtitle)
                    .font(AppFont.subheadline)
                    .foregroundStyle(AppTheme.inkSecondary)
                    .multilineTextAlignment(.center)
            }
            .padding(.horizontal, AppTheme.Space.lg)

            if let actionTitle, let action {
                Button(actionTitle, action: action)
                    .buttonStyle(PrimaryButtonStyle(fullWidth: false))
                    .padding(.top, 4)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, AppTheme.Space.xl)
    }
}
