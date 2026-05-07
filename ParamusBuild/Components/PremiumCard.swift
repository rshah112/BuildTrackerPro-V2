import SwiftUI

// MARK: - Card

struct PremiumCard<Content: View>: View {
    private let content: Content
    private var padding: CGFloat
    private var elevated: Bool

    init(padding: CGFloat = AppTheme.Space.md, elevated: Bool = false, @ViewBuilder content: () -> Content) {
        self.padding = padding
        self.elevated = elevated
        self.content = content()
    }

    var body: some View {
        content
            .padding(padding)
            .background(
                RoundedRectangle(cornerRadius: AppTheme.Radius.lg, style: .continuous)
                    .fill(AppTheme.surface)
            )
            .overlay(
                RoundedRectangle(cornerRadius: AppTheme.Radius.lg, style: .continuous)
                    .strokeBorder(AppTheme.border, lineWidth: 0.75)
            )
            .modifier(ConditionalCardShadow(active: elevated))
    }
}

private struct ConditionalCardShadow: ViewModifier {
    let active: Bool

    func body(content: Content) -> some View {
        if active {
            content.appCardShadow()
        } else {
            content
        }
    }
}

// MARK: - Section header

struct SectionHeader: View {
    let title: String
    var subtitle: String?
    var actionTitle: String?
    var action: (() -> Void)?

    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            VStack(alignment: .leading, spacing: 2) {
                Text(title.uppercased())
                    .font(AppFont.eyebrow)
                    .tracking(0.8)
                    .foregroundStyle(AppTheme.inkTertiary)

                if let subtitle {
                    Text(subtitle)
                        .font(AppFont.title3)
                        .foregroundStyle(AppTheme.ink)
                }
            }

            Spacer()

            if let actionTitle, let action {
                Button(action: action) {
                    HStack(spacing: 4) {
                        Text(actionTitle)
                            .font(AppFont.subheadline.weight(.semibold))
                        Image(systemName: "chevron.right")
                            .font(.caption.weight(.bold))
                    }
                    .foregroundStyle(AppTheme.brand)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, AppTheme.pagePadding)
        .padding(.top, AppTheme.Space.xs)
    }
}

// MARK: - Progress bar

struct BudgetProgressBar: View {
    let value: Double
    var tint: Color = AppTheme.brand
    var height: CGFloat = 10

    private var clampedValue: Double {
        min(max(value, 0), 1)
    }

    var body: some View {
        GeometryReader { proxy in
            ZStack(alignment: .leading) {
                Capsule()
                    .fill(AppTheme.surfaceSunken)

                Capsule()
                    .fill(
                        LinearGradient(
                            colors: [tint.opacity(0.85), tint],
                            startPoint: .leading,
                            endPoint: .trailing
                        )
                    )
                    .frame(width: proxy.size.width * clampedValue)
            }
        }
        .frame(height: height)
        .animation(.smooth(duration: 0.35), value: clampedValue)
    }
}

// MARK: - Floating action

struct PrimaryFloatingAddButton: View {
    let title: String
    var systemImage = "plus"
    let action: () -> Void

    var body: some View {
        Button {
            Haptics.lightTap()
            action()
        } label: {
            HStack(spacing: 10) {
                Image(systemName: systemImage)
                    .font(.subheadline.weight(.heavy))

                Text(title)
                    .font(AppFont.subheadline.weight(.bold))
                    .lineLimit(1)
            }
            .foregroundStyle(Color.white)
            .padding(.horizontal, AppTheme.Space.md)
            .frame(height: 54)
            .background(
                Capsule()
                    .fill(
                        LinearGradient(
                            colors: [AppTheme.brand, AppTheme.brand.opacity(0.92)],
                            startPoint: .top,
                            endPoint: .bottom
                        )
                    )
            )
            .overlay(
                Capsule()
                    .strokeBorder(Color.white.opacity(0.12), lineWidth: 0.5)
            )
            .appFloatingShadow()
        }
        .buttonStyle(.plain)
        .accessibilityLabel(title)
    }
}

extension View {
    func primaryFloatingAction(title: String, systemImage: String = "plus", action: @escaping () -> Void) -> some View {
        safeAreaInset(edge: .bottom, alignment: .trailing) {
            HStack {
                Spacer()

                PrimaryFloatingAddButton(title: title, systemImage: systemImage, action: action)
                    .padding(.trailing, AppTheme.pagePadding)
                    .padding(.bottom, AppTheme.Space.xs)
            }
            .allowsHitTesting(true)
        }
    }
}

// MARK: - Button styles

struct PrimaryButtonStyle: ButtonStyle {
    var fullWidth: Bool = true

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(AppFont.subheadline.weight(.bold))
            .foregroundStyle(Color.white)
            .padding(.horizontal, AppTheme.Space.md)
            .frame(maxWidth: fullWidth ? .infinity : nil, minHeight: 50)
            .background(
                Capsule()
                    .fill(AppTheme.brand)
            )
            .opacity(configuration.isPressed ? 0.85 : 1)
            .scaleEffect(configuration.isPressed ? 0.98 : 1)
            .animation(.spring(response: 0.25, dampingFraction: 0.85), value: configuration.isPressed)
    }
}

struct SecondaryButtonStyle: ButtonStyle {
    var fullWidth: Bool = true

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(AppFont.subheadline.weight(.semibold))
            .foregroundStyle(AppTheme.brand)
            .padding(.horizontal, AppTheme.Space.md)
            .frame(maxWidth: fullWidth ? .infinity : nil, minHeight: 50)
            .background(
                Capsule()
                    .fill(AppTheme.brandSoft)
            )
            .opacity(configuration.isPressed ? 0.85 : 1)
            .scaleEffect(configuration.isPressed ? 0.98 : 1)
            .animation(.spring(response: 0.25, dampingFraction: 0.85), value: configuration.isPressed)
    }
}

struct AccentButtonStyle: ButtonStyle {
    var fullWidth: Bool = true

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(AppFont.subheadline.weight(.bold))
            .foregroundStyle(Color.white)
            .padding(.horizontal, AppTheme.Space.md)
            .frame(maxWidth: fullWidth ? .infinity : nil, minHeight: 50)
            .background(
                Capsule()
                    .fill(AppTheme.accent)
            )
            .opacity(configuration.isPressed ? 0.85 : 1)
            .scaleEffect(configuration.isPressed ? 0.98 : 1)
            .animation(.spring(response: 0.25, dampingFraction: 0.85), value: configuration.isPressed)
    }
}

// MARK: - Tag pill

struct TagPill: View {
    let label: String
    var systemImage: String?
    var tint: Color = AppTheme.brand

    var body: some View {
        HStack(spacing: 6) {
            if let systemImage {
                Image(systemName: systemImage)
                    .font(.caption2.weight(.bold))
            }

            Text(label)
                .font(AppFont.caption2)
                .lineLimit(1)
        }
        .foregroundStyle(tint)
        .padding(.horizontal, 10)
        .padding(.vertical, 5)
        .background(
            Capsule()
                .fill(tint.opacity(0.12))
        )
    }
}

// MARK: - Page background

struct BlueprintBackground: View {
    var body: some View {
        ZStack {
            AppTheme.pageBackground

            Canvas { context, size in
                let spacing: CGFloat = 36
                let strokeColor = AppTheme.border.opacity(0.45)
                var x: CGFloat = 0
                while x <= size.width {
                    var path = Path()
                    path.move(to: CGPoint(x: x, y: 0))
                    path.addLine(to: CGPoint(x: x, y: size.height))
                    context.stroke(path, with: .color(strokeColor), lineWidth: 0.5)
                    x += spacing
                }
                var y: CGFloat = 0
                while y <= size.height {
                    var path = Path()
                    path.move(to: CGPoint(x: 0, y: y))
                    path.addLine(to: CGPoint(x: size.width, y: y))
                    context.stroke(path, with: .color(strokeColor), lineWidth: 0.5)
                    y += spacing
                }
            }
            .opacity(0.35)
            .blendMode(.multiply)
            .allowsHitTesting(false)
        }
        .ignoresSafeArea()
    }
}
