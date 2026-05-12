import SwiftData
import SwiftUI

struct DashboardView: View {
    @Environment(\.modelContext) private var modelContext
    let project: Project
    let navigateToTarget: (ProjectNavigationTarget) -> Void
    @State private var showingProjectBrief = false
    @State private var showingCustomizeSheet = false

    @Query private var items: [BudgetLineItem]
    @Query private var expenses: [Expense]
    @Query private var photos: [PhotoAttachment]
    @Query private var changeOrders: [ChangeOrder]
    @Query private var allowanceSelections: [AllowanceSelection]
    @Query private var tasks: [ProjectTask]

    @AppStorage(AppSettingsKeys.dashboardShowMetricsGrid) private var showMetricsGrid = true
    @AppStorage(AppSettingsKeys.dashboardShowCashFlow) private var showCashFlow = true
    @AppStorage(AppSettingsKeys.dashboardShowAttention) private var showAttention = true
    @AppStorage(AppSettingsKeys.dashboardShowWatchlist) private var showWatchlist = true
    @AppStorage(AppSettingsKeys.dashboardShowPhasePulse) private var showPhasePulse = true
    @AppStorage(AppSettingsKeys.dashboardShowRecentExpenses) private var showRecentExpenses = true
    @AppStorage(AppSettingsKeys.dashboardShowRecentPhotos) private var showRecentPhotos = true
    @AppStorage(AppSettingsKeys.dashboardShowOverBudget) private var showOverBudget = true
    @AppStorage(AppSettingsKeys.dashboardShowUpcomingPayments) private var showUpcomingPayments = true

    @ObservedObject private var health = StorageHealthMonitor.shared

    init(project: Project, navigateToTarget: @escaping (ProjectNavigationTarget) -> Void = { _ in }) {
        self.project = project
        self.navigateToTarget = navigateToTarget
        let projectID = project.id
        _items = Query(filter: #Predicate<BudgetLineItem> { $0.projectID == projectID }, sort: \.costCode)
        _expenses = Query(filter: #Predicate<Expense> { $0.projectID == projectID }, sort: \.date, order: .reverse)
        _photos = Query(filter: #Predicate<PhotoAttachment> { $0.projectID == projectID }, sort: \.createdAt, order: .reverse)
        _changeOrders = Query(filter: #Predicate<ChangeOrder> { $0.projectID == projectID }, sort: \.createdAt, order: .reverse)
        _allowanceSelections = Query(
            filter: #Predicate<AllowanceSelection> { $0.projectID == projectID },
            sort: \.selectionDate,
            order: .reverse
        )
        _tasks = Query(filter: #Predicate<ProjectTask> { $0.projectID == projectID }, sort: \.createdAt, order: .reverse)
    }

    private var viewModel: DashboardViewModel {
        DashboardViewModel(
            project: project,
            items: items,
            expenses: expenses,
            photos: photos,
            changeOrders: changeOrders,
            allowanceSelections: allowanceSelections,
            tasks: tasks
        )
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    header
                    todayMetricsRow
                    quickActions
                    progressCard
                    if showCashFlow { cashFlowCard }
                    if showMetricsGrid { metricsGrid }
                    if showAttention { attentionCard }
                    if showWatchlist { pinnedWatchlist }
                    if showPhasePulse { phasePulse }
                    if showRecentExpenses { recentExpenses }
                    if showRecentPhotos { recentPhotos }
                    if showOverBudget { overBudgetItems }
                    if showUpcomingPayments { upcomingPayments }
                }
                .padding(.horizontal, AppTheme.pagePadding)
                .padding(.bottom, 28)
            }
            .background(AppTheme.pageBackground)
            .navigationTitle("Dashboard")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        showingCustomizeSheet = true
                    } label: {
                        Image(systemName: "slider.horizontal.3")
                    }
                    .accessibilityLabel("Customize dashboard")
                }
            }
            .sheet(isPresented: $showingProjectBrief) {
                ProjectBriefSheet(project: project)
            }
            .sheet(isPresented: $showingCustomizeSheet) {
                DashboardCustomizationView()
            }
            .onAppear {
                refreshBudgetMath()
            }
        }
    }

    private func refreshBudgetMath() {
        let didChange = BudgetMathService.recalculateActuals(
            for: project.id,
            items: items,
            expenses: expenses,
            changeOrders: changeOrders,
            allowanceSelections: allowanceSelections
        )
        guard didChange else { return }
        do {
            try modelContext.save()
        } catch {
            modelContext.safeRollback()
            Haptics.warning()
        }
    }

    private var hasProjectBrief: Bool {
        project.startDate != nil || project.targetFinishDate != nil || !project.scopeSummary.trimmed.isEmpty ||
            (project.status == .complete && !project.warrantyNotes.trimmed.isEmpty)
    }

    private func persistProjectChange() {
        Haptics.lightTap()
        do {
            try modelContext.save()
        } catch {
            modelContext.safeRollback()
            Haptics.warning()
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: AppTheme.Space.xs) {
            Text(project.name)
                .font(.title2.weight(.bold))
                .foregroundStyle(AppTheme.ink)
                .lineLimit(1)
                .minimumScaleFactor(0.78)

            HStack(spacing: 6) {
                Image(systemName: "mappin.and.ellipse")
                    .font(.caption.weight(.semibold))
                Text(project.address)
                    .font(AppFont.subheadline)
            }
            .foregroundStyle(AppTheme.inkSecondary)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    Menu {
                        ForEach(ProjectStatus.allCases) { status in
                            Button {
                                project.status = status
                                persistProjectChange()
                            } label: {
                                Label(status.title, systemImage: status.systemImage)
                            }
                        }
                    } label: {
                        DashboardStatusChip(
                            title: project.status.title,
                            systemImage: project.status.systemImage,
                            tint: AppTheme.projectStatusColor(project.status)
                        )
                    }

                    Menu {
                        ForEach(ProjectPriority.allCases) { priority in
                            Button {
                                project.priority = priority
                                persistProjectChange()
                            } label: {
                                Label(priority.title, systemImage: "flag.fill")
                            }
                        }
                    } label: {
                        DashboardStatusChip(
                            title: project.priority.title,
                            systemImage: "flag.fill",
                            tint: AppTheme.projectPriorityColor(project.priority)
                        )
                    }

                    if let timelineChip {
                        DashboardStatusChip(
                            title: timelineChip.title,
                            systemImage: timelineChip.systemImage,
                            tint: timelineChip.tint
                        )
                    }

                    if hasProjectBrief {
                        Button {
                            showingProjectBrief = true
                        } label: {
                            DashboardStatusChip(
                                title: "Brief",
                                systemImage: "doc.text",
                                tint: AppTheme.accent
                            )
                        }
                        .buttonStyle(.plain)
                    }

                    if let backupChip {
                        DashboardStatusChip(
                            title: backupChip.title,
                            systemImage: backupChip.systemImage,
                            tint: backupChip.tint
                        )
                    }
                }
                .padding(.top, 2)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.top, 4)
    }

    private struct DashboardChipInfo {
        let title: String
        let systemImage: String
        let tint: Color
    }

    /// Days-to-target chip. Hidden when no target date, or when the project is marked complete.
    private var timelineChip: DashboardChipInfo? {
        guard project.status != .complete,
              let target = project.targetFinishDate
        else { return nil }
        let now = Calendar.current.startOfDay(for: .now)
        let targetDay = Calendar.current.startOfDay(for: target)
        let days = Calendar.current.dateComponents([.day], from: now, to: targetDay).day ?? 0
        if days < 0 {
            let overdue = abs(days)
            return DashboardChipInfo(
                title: "\(overdue) day\(overdue == 1 ? "" : "s") overdue",
                systemImage: "clock.badge.exclamationmark",
                tint: AppTheme.negative
            )
        }
        if days == 0 {
            return DashboardChipInfo(
                title: "Target today",
                systemImage: "flag.checkered",
                tint: AppTheme.warning
            )
        }
        return DashboardChipInfo(
            title: "\(days) day\(days == 1 ? "" : "s") to target",
            systemImage: "flag.checkered",
            tint: days <= 14 ? AppTheme.warning : AppTheme.info
        )
    }

    /// Backup status chip — matches the indicator used on Photos / Expenses / Budget.
    private var backupChip: DashboardChipInfo? {
        switch health.iCloudAvailable {
        case .some(true):
            DashboardChipInfo(title: "Backed up", systemImage: "icloud.fill", tint: AppTheme.positive)
        case .some(false):
            DashboardChipInfo(title: "Local only", systemImage: "iphone", tint: AppTheme.warning)
        case .none:
            nil
        }
    }

    /// Today / this-week activity at a glance. Compact tiles below the header.
    @ViewBuilder
    private var todayMetricsRow: some View {
        let calendar = Calendar.current
        let today = calendar.startOfDay(for: .now)
        let weekStart = calendar.date(byAdding: .day, value: -6, to: today) ?? today

        let todayExpenses = expenses.filter { calendar.isDate($0.date, inSameDayAs: .now) }
        let weekPhotos = photos.filter { $0.createdAt >= weekStart }
        let weekExpenses = expenses.filter { $0.date >= weekStart }

        HStack(spacing: 10) {
            todayMetricTile(
                value: todayExpenses.isEmpty ? "—" : MoneyMath.sum(todayExpenses, by: \.amount).compactCurrencyString,
                label: "Logged today",
                systemImage: "creditcard"
            )
            todayMetricTile(
                value: "\(weekExpenses.count)",
                label: "Expenses · 7d",
                systemImage: "calendar.day.timeline.left"
            )
            todayMetricTile(
                value: "\(weekPhotos.count)",
                label: "Photos · 7d",
                systemImage: "photo.stack"
            )
        }
    }

    private func todayMetricTile(value: String, label: String, systemImage: String) -> some View {
        HStack(spacing: 8) {
            Image(systemName: systemImage)
                .font(.caption.weight(.bold))
                .foregroundStyle(AppTheme.accent)
                .frame(width: 26, height: 26)
                .background(AppTheme.accent.opacity(0.13), in: RoundedRectangle(cornerRadius: 7, style: .continuous))
            VStack(alignment: .leading, spacing: 1) {
                Text(value)
                    .font(.subheadline.weight(.bold))
                    .lineLimit(1)
                    .minimumScaleFactor(0.65)
                Text(label)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(8)
        .frame(maxWidth: .infinity)
        .background(AppTheme.surface, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .strokeBorder(AppTheme.border, lineWidth: 0.75)
        )
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
        LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
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

            NavigationLink {
                TasksView(project: project)
            } label: {
                DashboardActionLabel(title: "Tasks", systemImage: "checklist")
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
                tint: AppTheme.brand,
                exactValue: viewModel.totalBudget
            ) {
                navigateToTarget(.budget())
            }

            DashboardMetricButton(
                title: "Invoiced",
                value: viewModel.actualSpent.compactCurrencyString,
                subtitle: "Posted expenses and paid COs",
                systemImage: "checkmark.circle",
                tint: AppTheme.positive,
                exactValue: viewModel.actualSpent
            ) {
                navigateToTarget(.expenses(.all))
            }

            DashboardMetricButton(
                title: "Committed",
                value: viewModel.committedSpend.compactCurrencyString,
                subtitle: viewModel
                    .pendingExposure > 0 ? "\(viewModel.pendingExposure.compactCurrencyString) pending exposure" :
                    "Open commitments and approved COs",
                systemImage: "signature",
                tint: AppTheme.info,
                exactValue: viewModel.committedSpend
            ) {
                navigateToTarget(.budget())
            }

            DashboardMetricButton(
                title: "Remaining",
                value: viewModel.remainingBudget.compactCurrencyString,
                subtitle: "Budget left",
                systemImage: "chart.pie",
                tint: viewModel.remainingBudget >= 0 ? AppTheme.positive : AppTheme.negative,
                exactValue: viewModel.remainingBudget
            ) {
                navigateToTarget(.budget())
            }

            DashboardMetricButton(
                title: "Contingency",
                value: viewModel.contingencyRemaining.compactCurrencyString,
                subtitle: "Reserve remaining",
                systemImage: "shield.checkered",
                tint: viewModel.contingencyRemaining >= 0 ? AppTheme.accent : AppTheme.negative,
                exactValue: viewModel.contingencyRemaining
            ) {
                navigateToTarget(.budget(searchText: "Contingency"))
            }
        }
    }

    private var progressCard: some View {
        Button {
            navigateToTarget(.budget())
        } label: {
            PremiumCard {
                VStack(alignment: .leading, spacing: 10) {
                    HStack(spacing: 8) {
                        VStack(alignment: .leading, spacing: 3) {
                            Text("Budget Progress")
                                .font(.headline.weight(.semibold))
                            Text("\((viewModel.budgetProgress * 100).formatted(.number.precision(.fractionLength(0))))% spent or committed")
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                        }

                        Spacer()

                        Text(MoneyMath.dollars(MoneyMath.cents(viewModel.actualSpent) + MoneyMath.cents(viewModel.committedSpend))
                            .compactCurrencyString)
                            .font(.headline.weight(.bold))
                    }

                    BudgetProgressBar(
                        value: viewModel.budgetProgress,
                        tint: viewModel.budgetProgress > 1 ? AppTheme.negative : AppTheme.brand
                    )

                    HStack(spacing: 8) {
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

    private var cashFlowDays: [CashFlowDay] {
        CashFlowService.forecast(project: project, expenses: expenses, changeOrders: changeOrders)
    }

    private var cashFlowCard: some View {
        CashFlowCard(
            days: cashFlowDays,
            nextFourteenDaysDue: CashFlowService.nextFourteenDaysDueTotal(
                project: project,
                expenses: expenses,
                changeOrders: changeOrders
            ),
            paidTotal: viewModel.cashPaid,
            openInvoiceTotal: viewModel.openInvoiceTotal,
            showsDisclosure: true,
            disclosureDestination: AnyView(CashFlowDetailView(project: project))
        )
    }

    @ViewBuilder
    private var attentionCard: some View {
        let overBudgetCount = viewModel.overBudgetItems.count
        let openInvoices = viewModel.openInvoiceTotal
        let pendingChanges = viewModel.pendingExposure
        let allowanceOverage = viewModel.allowanceOverage
        let overdueTaskCount = viewModel.overdueTasks.count
        let unassignedCount = viewModel.unassignedExpenses.count

        if overBudgetCount > 0 || openInvoices > 0 || pendingChanges > 0 || allowanceOverage > 0 || overdueTaskCount > 0 ||
            unassignedCount >
            0
        {
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
                            tint: AppTheme.info,
                            destination: AnyView(ChangeOrdersView(project: project))
                        )
                    }

                    if allowanceOverage > 0 {
                        DashboardAttentionRow(
                            title: "\(allowanceOverage.compactCurrencyString) allowance overage",
                            subtitle: "Review selections that exceeded their allowance",
                            systemImage: "square.stack.3d.up.fill",
                            tint: AppTheme.negative
                        ) {
                            navigateToTarget(.budget())
                        }
                    }

                    if overdueTaskCount > 0 {
                        DashboardAttentionRow(
                            title: "\(overdueTaskCount) overdue \(overdueTaskCount == 1 ? "task" : "tasks")",
                            subtitle: "Review open punch list items past due",
                            systemImage: "checklist",
                            tint: AppTheme.negative,
                            destination: AnyView(TasksView(project: project))
                        )
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

                let visible = viewModel.pinnedItems.count > 4 ? viewModel.pinnedItems : Array(viewModel.pinnedItems.prefix(4))

                if viewModel.pinnedItems.count > 4 {
                    // Long lists scroll horizontally so the cap doesn't hide pinned work.
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 10) {
                            ForEach(visible) { item in
                                NavigationLink {
                                    BudgetDetailView(item: item)
                                } label: {
                                    DashboardBudgetWatchRow(item: item)
                                        .frame(width: 280)
                                        .padding(12)
                                        .background(
                                            RoundedRectangle(cornerRadius: AppTheme.Radius.md, style: .continuous)
                                                .fill(AppTheme.surface)
                                        )
                                        .overlay(
                                            RoundedRectangle(cornerRadius: AppTheme.Radius.md, style: .continuous)
                                                .strokeBorder(AppTheme.border, lineWidth: 0.75)
                                        )
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }
                } else {
                    PremiumCard {
                        VStack(spacing: 0) {
                            ForEach(visible) { item in
                                NavigationLink {
                                    BudgetDetailView(item: item)
                                } label: {
                                    DashboardBudgetWatchRow(item: item)
                                }
                                .buttonStyle(.plain)
                                if item.id != visible.last?.id {
                                    Divider().padding(.leading, 44)
                                }
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
                        ForEach(Array(viewModel.recentPhotos.enumerated()), id: \.element.id) { index, photo in
                            NavigationLink {
                                PhotoViewer(
                                    context: PhotoViewerContext(
                                        photos: viewModel.recentPhotos,
                                        initialIndex: index,
                                        linkedItemTitle: { _ in nil }
                                    ),
                                    onEdit: { _ in },
                                    onDelete: { _ in }
                                )
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
    var exactValue: Double?
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            MetricCard(
                title: title,
                value: value,
                subtitle: subtitle,
                systemImage: systemImage,
                tint: tint,
                exactValue: exactValue?.currencyString
            )
        }
        .buttonStyle(.plain)
    }
}

private struct CashFlowCard: View {
    let days: [CashFlowDay]
    let nextFourteenDaysDue: Double
    let paidTotal: Double
    let openInvoiceTotal: Double
    let showsDisclosure: Bool
    let disclosureDestination: AnyView?

    private var hasFutureDebt: Bool {
        days.contains { $0.total > 0 }
    }

    var body: some View {
        PremiumCard {
            VStack(alignment: .leading, spacing: 10) {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 3) {
                        Text("Cash Flow")
                            .font(.headline.weight(.semibold))
                        Text("\(nextFourteenDaysDue.compactCurrencyString) due next 14 days")
                            .font(AppFont.subheadline)
                            .foregroundStyle(nextFourteenDaysDue > 0 ? AppTheme.warning : AppTheme.inkSecondary)
                    }

                    Spacer()

                    if showsDisclosure, let disclosureDestination {
                        NavigationLink {
                            disclosureDestination
                        } label: {
                            Image(systemName: "chevron.right")
                                .font(.caption.weight(.bold))
                                .foregroundStyle(AppTheme.inkTertiary)
                                .frame(width: 28, height: 28)
                        }
                        .buttonStyle(.plain)
                        .padding(.top, -3)
                    }
                }

                if hasFutureDebt {
                    CashFlowMiniChart(days: days)
                        .frame(height: 104)

                    HStack(spacing: 8) {
                        CashFlowMiniStat(title: "Paid", value: paidTotal.compactCurrencyString, tint: AppTheme.positive)
                        CashFlowMiniStat(title: "Open", value: openInvoiceTotal.compactCurrencyString, tint: AppTheme.warning)
                    }

                    HStack(spacing: 12) {
                        Label("Committed", systemImage: "rectangle.fill")
                            .foregroundStyle(AppTheme.brand)
                        Label("Pending exposure", systemImage: "rectangle.dashed")
                            .foregroundStyle(AppTheme.info)
                    }
                    .font(AppFont.caption)
                } else {
                    CompactEmptyRow(title: "All clear for the next 14 days 🎯", systemImage: "checkmark.seal")
                }
            }
        }
    }
}

private struct CashFlowMiniChart: View {
    let days: [CashFlowDay]
    @State private var selectedDayID: Date?

    private var maxValue: Double {
        max(days.map(\.total).max() ?? 0, 1)
    }

    private var selectedDay: CashFlowDay? {
        guard let selectedDayID else { return nil }
        return days.first { Calendar.current.isDate($0.date, inSameDayAs: selectedDayID) }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(selectedDay?.date.cashFlowDayLabel ?? "Tap a bar")
                    .font(AppFont.caption)
                    .foregroundStyle(AppTheme.inkSecondary)
                Spacer()
                Text((selectedDay?.total ?? MoneyMath.sum(days, by: \.total)).compactCurrencyString)
                    .font(AppFont.numeric(13, weight: .bold))
                    .foregroundStyle(selectedDay == nil ? AppTheme.inkSecondary : AppTheme.ink)
            }

            GeometryReader { proxy in
                HStack(alignment: .bottom, spacing: 5) {
                    ForEach(days) { day in
                        Button {
                            selectedDayID = day.id
                        } label: {
                            VStack(spacing: 5) {
                                Spacer(minLength: 0)
                                VStack(spacing: 2) {
                                    if day.pendingExposureTotal > 0 {
                                        RoundedRectangle(cornerRadius: 3, style: .continuous)
                                            .fill(AppTheme.info.opacity(0.12))
                                            .overlay {
                                                RoundedRectangle(cornerRadius: 3, style: .continuous)
                                                    .stroke(AppTheme.info, style: StrokeStyle(lineWidth: 1, dash: [2, 2]))
                                            }
                                            .frame(height: barHeight(for: day.pendingExposureTotal, in: proxy.size.height))
                                    }
                                    if day.committedTotal > 0 {
                                        RoundedRectangle(cornerRadius: 3, style: .continuous)
                                            .fill(AppTheme.brand)
                                            .frame(height: barHeight(for: day.committedTotal, in: proxy.size.height))
                                    }
                                    if day.total == 0 {
                                        RoundedRectangle(cornerRadius: 2, style: .continuous)
                                            .fill(AppTheme.border)
                                            .frame(height: 3)
                                    }
                                }
                                .frame(maxWidth: .infinity)
                                .overlay(alignment: .top) {
                                    if selectedDayID == day.id {
                                        Capsule()
                                            .fill(AppTheme.ink)
                                            .frame(width: 5, height: 5)
                                            .offset(y: -8)
                                    }
                                }

                                Text(day.date.tinyDayLabel)
                                    .font(.system(size: 9, weight: .semibold))
                                    .foregroundStyle(AppTheme.inkTertiary)
                                    .lineLimit(1)
                                    .minimumScaleFactor(0.7)
                            }
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("\(day.date.cashFlowDayLabel), \(day.total.currencyString)")
                    }
                }
            }
        }
        .padding(.top, 4)
    }

    private func barHeight(for value: Double, in containerHeight: CGFloat) -> CGFloat {
        let chartHeight = max(32, containerHeight - 22)
        return max(4, chartHeight * CGFloat(value / maxValue))
    }
}

private struct CashFlowMiniStat: View {
    let title: String
    let value: String
    let tint: Color

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(value)
                .font(AppFont.numeric(15, weight: .bold))
                .foregroundStyle(tint)
                .lineLimit(1)
                .minimumScaleFactor(0.76)
            Text(title)
                .font(AppFont.caption2)
                .foregroundStyle(AppTheme.inkTertiary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(10)
        .background(AppTheme.surfaceSunken, in: RoundedRectangle(cornerRadius: AppTheme.Radius.sm, style: .continuous))
    }
}

struct CashFlowDetailView: View {
    let project: Project

    @Query private var expenses: [Expense]
    @Query private var changeOrders: [ChangeOrder]
    @Query private var allowanceSelections: [AllowanceSelection]
    @State private var editorRoute: CashFlowEditorRoute?

    init(project: Project) {
        self.project = project
        let projectID = project.id
        _expenses = Query(filter: #Predicate<Expense> { $0.projectID == projectID }, sort: \.date, order: .reverse)
        _changeOrders = Query(filter: #Predicate<ChangeOrder> { $0.projectID == projectID }, sort: \.createdAt, order: .reverse)
        _allowanceSelections = Query(
            filter: #Predicate<AllowanceSelection> { $0.projectID == projectID },
            sort: \.selectionDate,
            order: .reverse
        )
    }

    private var days: [CashFlowDay] {
        CashFlowService.forecast(project: project, expenses: expenses, changeOrders: changeOrders)
    }

    private var hasFutureDebt: Bool {
        days.contains { !$0.payments.isEmpty }
    }

    var body: some View {
        List {
            Section {
                CashFlowCard(
                    days: days,
                    nextFourteenDaysDue: CashFlowService.nextFourteenDaysDueTotal(
                        project: project,
                        expenses: expenses,
                        changeOrders: changeOrders
                    ),
                    paidTotal: BudgetMathService.cashPaidTotal(expenses: expenses, changeOrders: changeOrders),
                    openInvoiceTotal: BudgetMathService.openInvoiceTotal(expenses: expenses),
                    showsDisclosure: false,
                    disclosureDestination: nil
                )
                .listRowInsets(EdgeInsets(top: 8, leading: 16, bottom: 8, trailing: 16))
                .listRowBackground(Color.clear)
            }

            if hasFutureDebt {
                ForEach(days.filter { !$0.payments.isEmpty }) { day in
                    Section(day.date.cashFlowDayLabel) {
                        ForEach(day.payments) { payment in
                            Button {
                                editorRoute = CashFlowEditorRoute(payment: payment)
                            } label: {
                                CashFlowPaymentRow(payment: payment)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
            } else {
                Section {
                    EmptyStateView(
                        title: "All clear for the next 14 days 🎯",
                        subtitle: "Future-dated debt will appear here when invoices or change orders get expected payment dates.",
                        systemImage: "checkmark.seal"
                    )
                }
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .background(AppTheme.pageBackground)
        .navigationTitle("Cash Flow")
        .navigationBarTitleDisplayMode(.inline)
        .sheet(item: $editorRoute) { route in
            switch route {
            case let .expense(id):
                AddExpenseView(project: project, expenseID: id)
            case let .changeOrder(id):
                if let order = changeOrders.first(where: { $0.id == id }) {
                    AddChangeOrderView(project: project, order: order)
                } else {
                    MissingCashFlowEditorView()
                }
            }
        }
    }
}

private enum CashFlowEditorRoute: Identifiable {
    case expense(UUID)
    case changeOrder(UUID)

    init(payment: CashFlowPayment) {
        switch payment.kind {
        case .expense:
            self = .expense(payment.sourceID)
        case .changeOrder:
            self = .changeOrder(payment.sourceID)
        }
    }

    var id: String {
        switch self {
        case let .expense(id):
            "expense-\(id.uuidString)"
        case let .changeOrder(id):
            "change-\(id.uuidString)"
        }
    }
}

private struct CashFlowPaymentRow: View {
    let payment: CashFlowPayment

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: payment.exposure == .pending ? "circle.dotted" : "circle.fill")
                .font(.caption.weight(.bold))
                .foregroundStyle(payment.exposure == .pending ? AppTheme.info : AppTheme.brand)
                .frame(width: 26, height: 34)

            VStack(alignment: .leading, spacing: 3) {
                Text(payment.title)
                    .font(AppFont.subheadline.weight(.semibold))
                    .foregroundStyle(AppTheme.ink)
                    .lineLimit(1)
                Text("\(payment.subtitle) - \(payment.expectedDate.shortDateString)")
                    .font(AppFont.caption)
                    .foregroundStyle(AppTheme.inkSecondary)
                    .lineLimit(1)
            }

            Spacer()

            Text(payment.amount.compactCurrencyString)
                .font(AppFont.numeric(15, weight: .bold))
                .foregroundStyle(payment.exposure == .pending ? AppTheme.info : AppTheme.ink)

            Image(systemName: "chevron.right")
                .font(.caption.weight(.bold))
                .foregroundStyle(AppTheme.inkTertiary)
        }
        .padding(.vertical, 6)
        .contentShape(Rectangle())
    }
}

private struct MissingCashFlowEditorView: View {
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            EmptyStateView(
                title: "Entry no longer exists",
                subtitle: "The forecast will refresh after you close this view.",
                systemImage: "exclamationmark.triangle"
            )
            .padding(AppTheme.pagePadding)
            .background(AppTheme.pageBackground)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") {
                        dismiss()
                    }
                }
            }
        }
    }
}

private struct ProjectBriefSheet: View {
    @Environment(\.dismiss) private var dismiss
    let project: Project

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    if !project.scopeSummary.trimmed.isEmpty {
                        PremiumCard {
                            VStack(alignment: .leading, spacing: 8) {
                                Label("Scope", systemImage: "doc.text")
                                    .font(.headline.weight(.semibold))
                                    .foregroundStyle(AppTheme.ink)

                                Text(project.scopeSummary.trimmed)
                                    .font(AppFont.body)
                                    .foregroundStyle(AppTheme.ink)
                                    .textSelection(.enabled)
                                    .fixedSize(horizontal: false, vertical: true)
                            }
                        }
                    }

                    if project.startDate != nil || project.targetFinishDate != nil {
                        PremiumCard {
                            VStack(alignment: .leading, spacing: 10) {
                                Text("Timeline")
                                    .font(.headline.weight(.semibold))

                                if let startDate = project.startDate {
                                    Label("Start " + startDate.shortDateString, systemImage: "play.circle")
                                }
                                if let targetFinishDate = project.targetFinishDate {
                                    Label("Target " + targetFinishDate.shortDateString, systemImage: "flag.checkered")
                                }
                            }
                            .font(AppFont.subheadline.weight(.semibold))
                            .foregroundStyle(AppTheme.inkSecondary)
                        }
                    }

                    if project.status == .complete, !project.warrantyNotes.trimmed.isEmpty {
                        PremiumCard {
                            VStack(alignment: .leading, spacing: 8) {
                                Label("Warranty Notes", systemImage: "wrench.adjustable")
                                    .font(.headline.weight(.semibold))
                                    .foregroundStyle(AppTheme.ink)

                                Text(project.warrantyNotes.trimmed)
                                    .font(AppFont.body)
                                    .foregroundStyle(AppTheme.ink)
                                    .textSelection(.enabled)
                                    .fixedSize(horizontal: false, vertical: true)
                            }
                        }
                    }
                }
                .padding(AppTheme.pagePadding)
            }
            .background(AppTheme.pageBackground)
            .navigationTitle("Project Brief")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") {
                        dismiss()
                    }
                }
            }
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
    }
}

private struct DashboardCustomizationView: View {
    @Environment(\.dismiss) private var dismiss

    @AppStorage(AppSettingsKeys.dashboardShowMetricsGrid) private var showMetricsGrid = true
    @AppStorage(AppSettingsKeys.dashboardShowCashFlow) private var showCashFlow = true
    @AppStorage(AppSettingsKeys.dashboardShowAttention) private var showAttention = true
    @AppStorage(AppSettingsKeys.dashboardShowWatchlist) private var showWatchlist = true
    @AppStorage(AppSettingsKeys.dashboardShowPhasePulse) private var showPhasePulse = true
    @AppStorage(AppSettingsKeys.dashboardShowRecentExpenses) private var showRecentExpenses = true
    @AppStorage(AppSettingsKeys.dashboardShowRecentPhotos) private var showRecentPhotos = true
    @AppStorage(AppSettingsKeys.dashboardShowOverBudget) private var showOverBudget = true
    @AppStorage(AppSettingsKeys.dashboardShowUpcomingPayments) private var showUpcomingPayments = true

    var body: some View {
        NavigationStack {
            List {
                Section {
                    Toggle(isOn: $showCashFlow) {
                        Label("Cash Flow", systemImage: "chart.bar.xaxis")
                    }
                    Toggle(isOn: $showMetricsGrid) {
                        Label("Metrics grid", systemImage: "square.grid.2x2")
                    }
                    Toggle(isOn: $showAttention) {
                        Label("Needs Attention", systemImage: "exclamationmark.circle.fill")
                    }
                    Toggle(isOn: $showWatchlist) {
                        Label("Watchlist", systemImage: "pin.fill")
                    }
                    Toggle(isOn: $showPhasePulse) {
                        Label("Category Pulse", systemImage: "rectangle.split.3x1")
                    }
                    Toggle(isOn: $showRecentExpenses) {
                        Label("Recent Expenses", systemImage: "creditcard")
                    }
                    Toggle(isOn: $showRecentPhotos) {
                        Label("Recent Photos", systemImage: "photo.stack")
                    }
                    Toggle(isOn: $showOverBudget) {
                        Label("Over Budget", systemImage: "flag.fill")
                    }
                    Toggle(isOn: $showUpcomingPayments) {
                        Label("Upcoming Payments", systemImage: "calendar.badge.clock")
                    }
                } header: {
                    Text("Sections")
                } footer: {
                    Text(
                        "Project name, status chips, the today/7-day metrics, quick actions, and the Budget Progress card always stay visible. These toggles control the optional cards below."
                    )
                }

                Section {
                    Button("Show all") {
                        showMetricsGrid = true
                        showCashFlow = true
                        showAttention = true
                        showWatchlist = true
                        showPhasePulse = true
                        showRecentExpenses = true
                        showRecentPhotos = true
                        showOverBudget = true
                        showUpcomingPayments = true
                    }
                    Button("Minimal layout", role: .destructive) {
                        showMetricsGrid = false
                        showCashFlow = false
                        showAttention = true
                        showWatchlist = false
                        showPhasePulse = false
                        showRecentExpenses = false
                        showRecentPhotos = false
                        showOverBudget = false
                        showUpcomingPayments = false
                    }
                } footer: {
                    Text("Minimal keeps only the Budget Progress card and the Needs Attention alerts.")
                }
            }
            .navigationTitle("Customize Dashboard")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                }
            }
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
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
        VStack(spacing: 6) {
            Image(systemName: systemImage)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(AppTheme.brand)
                .frame(width: 28, height: 28)
                .background(
                    RoundedRectangle(cornerRadius: AppTheme.Radius.sm, style: .continuous)
                        .fill(AppTheme.brandSoft)
                )

            Text(title)
                .font(AppFont.caption.weight(.bold))
                .foregroundStyle(AppTheme.ink)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 10)
        .padding(.horizontal, 6)
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
    let destination: AnyView?
    let action: (() -> Void)?

    init(
        title: String,
        subtitle: String,
        systemImage: String,
        tint: Color,
        action: @escaping () -> Void
    ) {
        self.title = title
        self.subtitle = subtitle
        self.systemImage = systemImage
        self.tint = tint
        destination = nil
        self.action = action
    }

    init(
        title: String,
        subtitle: String,
        systemImage: String,
        tint: Color,
        destination: AnyView
    ) {
        self.title = title
        self.subtitle = subtitle
        self.systemImage = systemImage
        self.tint = tint
        self.destination = destination
        action = nil
    }

    var body: some View {
        if let destination {
            NavigationLink {
                destination
            } label: {
                content
            }
            .buttonStyle(.plain)
        } else {
            Button(action: action ?? {}) {
                content
            }
            .buttonStyle(.plain)
        }
    }

    private var content: some View {
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
                Text(MoneyMath.dollars(MoneyMath.cents(summary.actual) + MoneyMath.cents(summary.committed)).compactCurrencyString)
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

private extension Date {
    var tinyDayLabel: String {
        let formatter = DateFormatter()
        formatter.dateFormat = "M/d"
        return formatter.string(from: self)
    }

    var cashFlowDayLabel: String {
        let formatter = DateFormatter()
        formatter.dateFormat = "EEE, MMM d"
        return formatter.string(from: self)
    }
}
