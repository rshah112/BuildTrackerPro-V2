import SwiftData
import SwiftUI

struct DashboardView: View {
    @Environment(\.modelContext) private var modelContext
    let project: Project
    let navigateToTarget: (ProjectNavigationTarget) -> Void

    @Query private var items: [BudgetLineItem]
    @Query private var expenses: [Expense]
    @Query private var photos: [PhotoAttachment]
    @Query private var changeOrders: [ChangeOrder]

    init(project: Project, navigateToTarget: @escaping (ProjectNavigationTarget) -> Void = { _ in }) {
        self.project = project
        self.navigateToTarget = navigateToTarget
        let projectID = project.id
        _items = Query(filter: #Predicate<BudgetLineItem> { $0.projectID == projectID }, sort: \.costCode)
        _expenses = Query(filter: #Predicate<Expense> { $0.projectID == projectID }, sort: \.date, order: .reverse)
        _photos = Query(filter: #Predicate<PhotoAttachment> { $0.projectID == projectID }, sort: \.createdAt, order: .reverse)
        _changeOrders = Query(filter: #Predicate<ChangeOrder> { $0.projectID == projectID }, sort: \.createdAt, order: .reverse)
    }

    private var viewModel: DashboardViewModel {
        DashboardViewModel(
            project: project,
            items: items,
            expenses: expenses,
            photos: photos,
            changeOrders: changeOrders
        )
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    header
                    projectBrief
                    quickActions
                    metricsGrid
                    progressCard
                    attentionCard
                    pinnedWatchlist
                    phasePulse
                    recentExpenses
                    recentPhotos
                    overBudgetItems
                    upcomingPayments
                }
                .padding(.horizontal, AppTheme.pagePadding)
                .padding(.bottom, 28)
            }
            .background(AppTheme.pageBackground)
            .navigationTitle("Dashboard")
            .onAppear {
                refreshBudgetMath()
            }
        }
    }

    private func refreshBudgetMath() {
        let didChange = BudgetMathService.recalculateActuals(for: project.id, items: items, expenses: expenses, changeOrders: changeOrders)
        guard didChange else { return }
        do {
            try modelContext.save()
        } catch {
            modelContext.rollback()
            Haptics.warning()
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: AppTheme.Space.xs) {
            Text("DASHBOARD")
                .font(AppFont.eyebrow)
                .tracking(1.2)
                .foregroundStyle(AppTheme.brand)

            Text(project.name)
                .font(AppFont.largeTitle)
                .foregroundStyle(AppTheme.ink)

            HStack(spacing: 6) {
                Image(systemName: "mappin.and.ellipse")
                    .font(.caption.weight(.semibold))
                Text(project.address)
                    .font(AppFont.subheadline)
            }
            .foregroundStyle(AppTheme.inkSecondary)

            HStack(spacing: 6) {
                DashboardStatusChip(
                    title: project.status.title,
                    systemImage: project.status.systemImage,
                    tint: AppTheme.projectStatusColor(project.status)
                )

                DashboardStatusChip(
                    title: project.priority.title,
                    systemImage: "flag.fill",
                    tint: AppTheme.projectPriorityColor(project.priority)
                )
            }
            .padding(.top, 4)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.top, AppTheme.Space.xs)
    }

    @ViewBuilder
    private var projectBrief: some View {
        if project.startDate != nil || project.targetFinishDate != nil || !project.scopeSummary.trimmed
            .isEmpty || (project.status == .complete && !project.warrantyNotes.trimmed.isEmpty)
        {
            PremiumCard {
                VStack(alignment: .leading, spacing: 11) {
                    HStack {
                        Text("Project Brief")
                            .font(.headline.weight(.semibold))
                        Spacer()
                        if project.status == .complete {
                            Image(systemName: "checkmark.seal.fill")
                                .foregroundStyle(AppTheme.positive)
                        }
                    }

                    if !project.scopeSummary.trimmed.isEmpty {
                        Text(project.scopeSummary.trimmed)
                            .font(.subheadline)
                            .foregroundStyle(.primary)
                    }

                    if project.startDate != nil || project.targetFinishDate != nil {
                        HStack(spacing: 12) {
                            if let startDate = project.startDate {
                                Label(startDate.shortDateString, systemImage: "play.circle")
                            }

                            if let targetFinishDate = project.targetFinishDate {
                                Label(targetFinishDate.shortDateString, systemImage: "flag.checkered")
                            }
                        }
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.secondary)
                    }

                    if project.status == .complete, !project.warrantyNotes.trimmed.isEmpty {
                        Divider()
                        Label(project.warrantyNotes.trimmed, systemImage: "wrench.adjustable")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(.secondary)
                    }
                }
            }
        }
    }

    private var quickActions: some View {
        LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
            NavigationLink {
                DocumentsView(project: project)
            } label: {
                DashboardActionLabel(title: "Documents", systemImage: "folder")
            }

            NavigationLink {
                ChangeOrdersView(project: project)
            } label: {
                DashboardActionLabel(title: "Changes", systemImage: "arrow.triangle.2.circlepath")
            }
        }
    }

    private var metricsGrid: some View {
        LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
            DashboardMetricButton(
                title: "Total Budget",
                value: viewModel.totalBudget.compactCurrencyString,
                subtitle: "Construction scope",
                systemImage: "banknote",
                tint: AppTheme.brand
            ) {
                navigateToTarget(.budget())
            }

            DashboardMetricButton(
                title: "Invoiced",
                value: viewModel.actualSpent.compactCurrencyString,
                subtitle: "Posted expenses and paid COs",
                systemImage: "checkmark.circle",
                tint: AppTheme.positive
            ) {
                navigateToTarget(.expenses(.all))
            }

            DashboardMetricButton(
                title: "Paid",
                value: viewModel.cashPaid.compactCurrencyString,
                subtitle: "Cash out",
                systemImage: "checkmark.seal",
                tint: AppTheme.positive
            ) {
                navigateToTarget(.expenses(.paid))
            }

            DashboardMetricButton(
                title: "Open Invoices",
                value: viewModel.openInvoiceTotal.compactCurrencyString,
                subtitle: "Unpaid balances",
                systemImage: "clock",
                tint: viewModel.openInvoiceTotal > 0 ? AppTheme.warning : AppTheme.brand
            ) {
                navigateToTarget(.expenses(.open))
            }

            DashboardMetricButton(
                title: "Committed",
                value: viewModel.committedSpend.compactCurrencyString,
                subtitle: viewModel
                    .pendingExposure > 0 ? "\(viewModel.pendingExposure.compactCurrencyString) pending exposure" :
                    "Open commitments and approved COs",
                systemImage: "signature",
                tint: AppTheme.info
            ) {
                navigateToTarget(.budget())
            }

            DashboardMetricButton(
                title: "Remaining",
                value: viewModel.remainingBudget.compactCurrencyString,
                subtitle: "Budget left",
                systemImage: "chart.pie",
                tint: viewModel.remainingBudget >= 0 ? AppTheme.positive : AppTheme.negative
            ) {
                navigateToTarget(.budget())
            }

            DashboardMetricButton(
                title: "Contingency",
                value: viewModel.contingencyRemaining.compactCurrencyString,
                subtitle: "Reserve remaining",
                systemImage: "shield.checkered",
                tint: viewModel.contingencyRemaining >= 0 ? AppTheme.accent : AppTheme.negative
            ) {
                navigateToTarget(.budget(searchText: "Contingency"))
            }
            .gridCellColumns(2)
        }
    }

    private var progressCard: some View {
        Button {
            navigateToTarget(.budget())
        } label: {
            PremiumCard {
                VStack(alignment: .leading, spacing: 14) {
                    HStack {
                        VStack(alignment: .leading, spacing: 3) {
                            Text("Budget Progress")
                                .font(.headline.weight(.semibold))
                            Text("\((viewModel.budgetProgress * 100).formatted(.number.precision(.fractionLength(0))))% spent or committed")
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                        }

                        Spacer()

                        Text((viewModel.actualSpent + viewModel.committedSpend).compactCurrencyString)
                            .font(.headline.weight(.bold))
                    }

                    BudgetProgressBar(
                        value: viewModel.budgetProgress,
                        tint: viewModel.budgetProgress > 1 ? AppTheme.negative : AppTheme.brand
                    )

                    HStack {
                        Label("Invoiced \(viewModel.actualSpent.compactCurrencyString)", systemImage: "circle.fill")
                            .foregroundStyle(AppTheme.positive)
                        Spacer()
                        Label("Committed \(viewModel.committedSpend.compactCurrencyString)", systemImage: "circle.fill")
                            .foregroundStyle(AppTheme.info)
                    }
                    .font(AppFont.caption)
                }
            }
        }
        .buttonStyle(.plain)
    }

    @ViewBuilder
    private var attentionCard: some View {
        let overBudgetCount = viewModel.overBudgetItems.count
        let openInvoices = viewModel.openInvoiceTotal
        let pendingChanges = viewModel.pendingExposure
        let unassignedCount = viewModel.unassignedExpenses.count

        if overBudgetCount > 0 || openInvoices > 0 || pendingChanges > 0 || unassignedCount > 0 {
            PremiumCard {
                VStack(alignment: .leading, spacing: 12) {
                    HStack {
                        Text("Needs Attention")
                            .font(.headline.weight(.semibold))
                        Spacer()
                        Image(systemName: "exclamationmark.circle.fill")
                            .foregroundStyle(AppTheme.warning)
                    }

                    if overBudgetCount > 0 {
                        DashboardAttentionRow(
                            title: "\(overBudgetCount) budget \(overBudgetCount == 1 ? "item" : "items") over",
                            subtitle: "Review estimates, commitments, or change orders",
                            systemImage: "flag.fill",
                            tint: AppTheme.negative
                        ) {
                            navigateToTarget(.budget())
                        }
                    }

                    if openInvoices > 0 {
                        DashboardAttentionRow(
                            title: "\(openInvoices.compactCurrencyString) open invoices",
                            subtitle: "Mark paid as checks or transfers clear",
                            systemImage: "clock.fill",
                            tint: AppTheme.warning
                        ) {
                            navigateToTarget(.expenses(.open))
                        }
                    }

                    if pendingChanges > 0 {
                        DashboardAttentionRow(
                            title: "\(pendingChanges.compactCurrencyString) pending changes",
                            subtitle: "Approve, reject, or keep tracking exposure",
                            systemImage: "arrow.triangle.2.circlepath",
                            tint: AppTheme.info
                        ) {
                            navigateToTarget(.tab(.more))
                        }
                    }

                    if unassignedCount > 0 {
                        DashboardAttentionRow(
                            title: "\(unassignedCount) unassigned \(unassignedCount == 1 ? "expense" : "expenses")",
                            subtitle: "Attach each one to a budget item so category math stays clean",
                            systemImage: "link.badge.plus",
                            tint: AppTheme.warning
                        ) {
                            navigateToTarget(.expenses(.all))
                        }
                    }
                }
            }
        }
    }

    @ViewBuilder
    private var pinnedWatchlist: some View {
        if !viewModel.pinnedItems.isEmpty {
            VStack(alignment: .leading, spacing: 10) {
                Text("Watchlist")
                    .font(.headline.weight(.semibold))

                PremiumCard {
                    VStack(spacing: 0) {
                        ForEach(viewModel.pinnedItems.prefix(4)) { item in
                            NavigationLink {
                                BudgetDetailView(item: item)
                            } label: {
                                DashboardBudgetWatchRow(item: item)
                            }
                            .buttonStyle(.plain)
                            if item.id != viewModel.pinnedItems.prefix(4).last?.id {
                                Divider().padding(.leading, 44)
                            }
                        }
                    }
                }
            }
        }
    }

    private var phasePulse: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Category Pulse")
                .font(.headline.weight(.semibold))

            PremiumCard {
                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
                    ForEach(viewModel.phaseSummaries) { summary in
                        NavigationLink {
                            BudgetView(project: project, initialSearchText: summary.name)
                        } label: {
                            PhasePulseTile(summary: summary)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
    }

    private var recentExpenses: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Recent Expenses")
                .font(.headline.weight(.semibold))

            PremiumCard {
                if viewModel.recentExpenses.isEmpty {
                    CompactEmptyRow(title: "No expenses yet", systemImage: "creditcard")
                } else {
                    VStack(spacing: 0) {
                        ForEach(viewModel.recentExpenses) { expense in
                            NavigationLink {
                                AddExpenseView(project: project, expenseID: expense.id)
                            } label: {
                                DashboardExpenseRow(expense: expense)
                            }
                            .buttonStyle(.plain)
                            if expense.id != viewModel.recentExpenses.last?.id {
                                Divider().padding(.leading, 44)
                            }
                        }
                    }
                }
            }
        }
    }

    private var recentPhotos: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Recent Photos")
                .font(.headline.weight(.semibold))

            if viewModel.recentPhotos.isEmpty {
                PremiumCard {
                    CompactEmptyRow(title: "No photos yet", systemImage: "photo")
                }
            } else {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 12) {
                        ForEach(viewModel.recentPhotos) { photo in
                            NavigationLink {
                                PhotoViewer(photo: photo)
                            } label: {
                                VStack(alignment: .leading, spacing: 8) {
                                    PhotoThumbnail(data: photo.imageData)
                                        .frame(width: 132, height: 148)

                                    Text(photo.phaseTag.isEmpty ? "Photo" : photo.phaseTag)
                                        .font(.caption.weight(.semibold))
                                        .lineLimit(1)

                                    Text(photo.createdAt.shortDateString)
                                        .font(.caption2)
                                        .foregroundStyle(.secondary)
                                }
                                .frame(width: 132, alignment: .leading)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(.vertical, 2)
                }
            }
        }
    }

    private var overBudgetItems: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Over Budget")
                .font(.headline.weight(.semibold))

            PremiumCard {
                if viewModel.overBudgetItems.isEmpty {
                    CompactEmptyRow(title: "No categories over budget", systemImage: "checkmark.seal")
                } else {
                    VStack(spacing: 12) {
                        ForEach(viewModel.overBudgetItems.prefix(3)) { item in
                            NavigationLink {
                                BudgetDetailView(item: item)
                            } label: {
                                HStack(spacing: 12) {
                                    BudgetHealthPill(health: item.health)
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(item.title)
                                            .font(.subheadline.weight(.semibold))
                                        Text(item.categoryName)
                                            .font(.caption)
                                            .foregroundStyle(.secondary)
                                    }
                                    Spacer()
                                    Text(item.variance.currencyString)
                                        .font(.subheadline.weight(.bold))
                                        .foregroundStyle(AppTheme.negative)
                                }
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
            }
        }
    }

    private var upcomingPayments: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Upcoming Payments")
                .font(.headline.weight(.semibold))

            PremiumCard {
                if viewModel.upcomingPayments.isEmpty {
                    CompactEmptyRow(title: "No open invoices", systemImage: "calendar.badge.checkmark")
                } else {
                    VStack(spacing: 0) {
                        ForEach(viewModel.upcomingPayments.prefix(4)) { expense in
                            NavigationLink {
                                AddExpenseView(project: project, expenseID: expense.id)
                            } label: {
                                DashboardExpenseRow(expense: expense)
                            }
                            .buttonStyle(.plain)
                            if expense.id != viewModel.upcomingPayments.prefix(4).last?.id {
                                Divider().padding(.leading, 44)
                            }
                        }
                    }
                }
            }
        }
    }
}

private struct DashboardMetricButton: View {
    let title: String
    let value: String
    let subtitle: String
    let systemImage: String
    let tint: Color
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            MetricCard(
                title: title,
                value: value,
                subtitle: subtitle,
                systemImage: systemImage,
                tint: tint
            )
        }
        .buttonStyle(.plain)
    }
}

private struct DashboardStatusChip: View {
    let title: String
    let systemImage: String
    let tint: Color

    var body: some View {
        HStack(spacing: 5) {
            Image(systemName: systemImage)
                .font(.caption2.weight(.bold))
            Text(title)
                .font(AppFont.caption2)
        }
        .foregroundStyle(tint)
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .background(Capsule().fill(tint.opacity(0.13)))
    }
}

private struct DashboardExpenseRow: View {
    let expense: Expense

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: expense.isPaid ? "checkmark.circle.fill" : "clock.fill")
                .font(.title3)
                .foregroundStyle(expense.isPaid ? AppTheme.positive : AppTheme.warning)
                .frame(width: 32, height: 44)

            VStack(alignment: .leading, spacing: 3) {
                Text(expense.vendorName)
                    .font(.subheadline.weight(.semibold))
                    .lineLimit(1)

                Text("\(expense.categoryName) - \(expense.date.shortDateString)")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }

            Spacer()

            Text(expense.amount.currencyString)
                .font(.subheadline.weight(.bold))
        }
        .padding(.vertical, 8)
    }
}

private struct DashboardActionLabel: View {
    let title: String
    let systemImage: String

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: systemImage)
                .font(.headline.weight(.semibold))
                .foregroundStyle(AppTheme.brand)
                .frame(width: 32, height: 32)
                .background(
                    RoundedRectangle(cornerRadius: AppTheme.Radius.sm, style: .continuous)
                        .fill(AppTheme.brandSoft)
                )

            Text(title)
                .font(AppFont.subheadline.weight(.semibold))
                .foregroundStyle(AppTheme.ink)

            Spacer(minLength: 0)

            Image(systemName: "chevron.right")
                .font(.caption.weight(.bold))
                .foregroundStyle(AppTheme.inkTertiary)
        }
        .padding(AppTheme.Space.sm)
        .background(
            RoundedRectangle(cornerRadius: AppTheme.Radius.md, style: .continuous)
                .fill(AppTheme.surface)
        )
        .overlay(
            RoundedRectangle(cornerRadius: AppTheme.Radius.md, style: .continuous)
                .strokeBorder(AppTheme.border, lineWidth: 0.75)
        )
    }
}

private struct DashboardBudgetWatchRow: View {
    let item: BudgetLineItem

    var body: some View {
        HStack(spacing: 12) {
            BudgetHealthPill(health: item.health)

            VStack(alignment: .leading, spacing: 5) {
                HStack(spacing: 6) {
                    Text(item.title)
                        .font(.subheadline.weight(.semibold))
                        .lineLimit(1)

                    Text(item.costCode)
                        .font(.caption2.weight(.bold))
                        .foregroundStyle(.secondary)
                }

                BudgetProgressBar(value: item.utilization, tint: AppTheme.healthColor(item.health))
            }

            Spacer()

            VStack(alignment: .trailing, spacing: 2) {
                Text(item.spentAndCommitted.compactCurrencyString)
                    .font(.subheadline.weight(.bold))
                    .foregroundStyle(AppTheme.healthColor(item.health))
                Text("used")
                    .font(.caption2.weight(.bold))
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 8)
    }
}

private struct DashboardAttentionRow: View {
    let title: String
    let subtitle: String
    let systemImage: String
    let tint: Color
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 12) {
                Image(systemName: systemImage)
                    .font(.subheadline.weight(.bold))
                    .foregroundStyle(tint)
                    .frame(width: 30, height: 30)
                    .background(tint.opacity(0.12), in: RoundedRectangle(cornerRadius: 8, style: .continuous))

                VStack(alignment: .leading, spacing: 3) {
                    Text(title)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(.primary)
                    Text(subtitle)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }

                Spacer()

                Image(systemName: "chevron.right")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(.secondary)
            }
            .padding(.vertical, 2)
        }
        .buttonStyle(.plain)
    }
}

private struct PhasePulseTile: View {
    let summary: BudgetPhaseSummary

    var body: some View {
        VStack(alignment: .leading, spacing: 9) {
            HStack {
                Text(summary.name)
                    .font(.subheadline.weight(.semibold))
                    .lineLimit(1)
                    .minimumScaleFactor(0.82)

                Spacer()

                Text("\((summary.utilization * 100).formatted(.number.precision(.fractionLength(0))))%")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(AppTheme.healthColor(summary.health))
            }

            BudgetProgressBar(value: summary.utilization, tint: AppTheme.healthColor(summary.health))

            HStack {
                Text((summary.actual + summary.committed).compactCurrencyString)
                Spacer()
                Text(summary.budget.compactCurrencyString)
            }
            .font(.caption2.weight(.semibold))
            .foregroundStyle(.secondary)
        }
        .padding(12)
        .background(AppTheme.surfaceSunken, in: RoundedRectangle(cornerRadius: AppTheme.cardRadius, style: .continuous))
    }
}

private struct CompactEmptyRow: View {
    let title: String
    let systemImage: String

    var body: some View {
        Label(title, systemImage: systemImage)
            .font(.subheadline.weight(.medium))
            .foregroundStyle(.secondary)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.vertical, 8)
    }
}
