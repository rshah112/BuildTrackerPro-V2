import SwiftUI

struct ModernForm<Content: View>: View {
    private let content: Content

    init(@ViewBuilder content: () -> Content) {
        self.content = content()
    }

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: AppTheme.Space.lg) {
                content
            }
            .padding(.horizontal, AppTheme.pagePadding)
            .padding(.top, AppTheme.Space.md)
            .padding(.bottom, AppTheme.Space.xl)
        }
        .scrollDismissesKeyboard(.interactively)
        .background(AppTheme.pageBackground.ignoresSafeArea())
    }
}

struct ModernFormSection<Content: View>: View {
    let title: String
    var footer: String?
    private let content: Content

    init(_ title: String, footer: String? = nil, @ViewBuilder content: () -> Content) {
        self.title = title
        self.footer = footer
        self.content = content()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: AppTheme.Space.xs) {
            Text(title.uppercased())
                .font(AppFont.eyebrow)
                .tracking(0.9)
                .foregroundStyle(AppTheme.inkTertiary)
                .padding(.horizontal, AppTheme.Space.xs)

            VStack(alignment: .leading, spacing: AppTheme.Space.md) {
                content
            }
            .padding(AppTheme.Space.md)
            .background(
                RoundedRectangle(cornerRadius: AppTheme.Radius.lg, style: .continuous)
                    .fill(AppTheme.surface)
            )
            .overlay(
                RoundedRectangle(cornerRadius: AppTheme.Radius.lg, style: .continuous)
                    .strokeBorder(AppTheme.border, lineWidth: 0.75)
            )

            if let footer {
                Text(footer)
                    .font(AppFont.caption)
                    .foregroundStyle(AppTheme.inkTertiary)
                    .padding(.horizontal, AppTheme.Space.xs)
            }
        }
    }
}

struct ModernField<Content: View>: View {
    let title: String
    var subtitle: String?
    private let content: Content

    init(_ title: String, subtitle: String? = nil, @ViewBuilder content: () -> Content) {
        self.title = title
        self.subtitle = subtitle
        self.content = content()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(AppFont.subheadline.weight(.semibold))
                    .foregroundStyle(AppTheme.ink)

                if let subtitle {
                    Text(subtitle)
                        .font(AppFont.caption)
                        .foregroundStyle(AppTheme.inkSecondary)
                }
            }

            content
        }
    }
}

struct ModernTextFieldStyle: TextFieldStyle {
    // swiftlint:disable:next identifier_name
    func _body(configuration: TextField<Self._Label>) -> some View {
        configuration
            .font(AppFont.body.weight(.medium))
            .foregroundStyle(AppTheme.ink)
            .padding(.horizontal, 14)
            .padding(.vertical, 12)
            .background(
                RoundedRectangle(cornerRadius: AppTheme.Radius.sm, style: .continuous)
                    .fill(AppTheme.surfaceSunken)
            )
            .overlay(
                RoundedRectangle(cornerRadius: AppTheme.Radius.sm, style: .continuous)
                    .strokeBorder(AppTheme.border, lineWidth: 0.75)
            )
    }
}

extension View {
    func modernTextField() -> some View {
        textFieldStyle(ModernTextFieldStyle())
    }
}
