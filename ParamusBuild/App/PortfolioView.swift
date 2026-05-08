import SwiftData
import SwiftUI

struct PortfolioView: View {
    @Environment(\.modelContext) private var modelContext

    @Query(sort: \Project.createdAt, order: .reverse) private var projects: [Project]

    @State private var showingAddProject = false
    @State private var projectPendingDelete: ProjectDeleteCandidate?
    @State private var metricsByProjectID: [UUID: ProjectCardMetrics] = [:]
    @State private var statusFilter: ProjectStatus?
    @State private var priorityFilter: ProjectPriority?
    @State private var showingInsights = false

    private var portfolioOpenTotal: Double {
        metricsByProjectID.values.reduce(0) { $0 + $1.openInvoiceTotal }
    }

    private var filteredProjects: [Project] {
        projects.filter { project in
            (statusFilter.map { project.status == $0 } ?? true) &&
                (priorityFilter.map { project.priority == $0 } ?? true)
        }
    }

    private var hasActiveFilter: Bool {
        statusFilter != nil || priorityFilter != nil
    }

    var body: some View {
        NavigationStack {
            portfolioList
        }
    }

    private var portfolioList: AnyView {
        AnyView(List {
            portfolioHeaderSection

            if !projects.isEmpty {
                portfolioSummarySection
                portfolioFiltersSection
            }

            projectsSection
        }
        .listStyle(.insetGrouped)
        .environment(\.defaultMinListRowHeight, 0)
        .scrollContentBackground(.hidden)
        .background(AppTheme.pageBackground)
        .navigationTitle("Projects")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button { showingInsights = true } label: {
                    Image(systemName: "chart.xyaxis.line")
                }
                .accessibilityLabel("Portfolio Insights")
                .disabled(projects.isEmpty)
            }
        }
        .sheet(isPresented: $showingInsights) {
            PortfolioInsightsView()
        }
        .onAppear {
            refreshProjectMetrics()
        }
        .onChange(of: projects.map(\.id)) { _, _ in
            refreshProjectMetrics()
        }
        .primaryFloatingAction(title: "Project") {
            showingAddProject = true
        }
        .sheet(isPresented: $showingAddProject, onDismiss: refreshProjectMetrics) {
            ProjectFormView()
        }
        .alert("Delete Project?", isPresented: deleteAlertBinding, presenting: projectPendingDelete) { project in
            Button("Delete", role: .destructive) {
                deleteProject(withID: project.id)
            }
            Button("Cancel", role: .cancel) {
                projectPendingDelete = nil
            }
        } message: { project in
            Text(
                "This permanently removes \(project.name), including its budget, expenses, photos, documents, vendors and change orders."
            )
        })
    }

    private var portfolioHeaderSection: AnyView {
        AnyView(Section {
            VStack(alignment: .leading, spacing: AppTheme.Space.xs) {
                Text("PORTFOLIO")
                    .font(AppFont.eyebrow)
                    .tracking(1.2)
                    .foregroundStyle(AppTheme.brand)

                Text("HomeBuild Pro")
                    .font(AppFont.largeTitle)
                    .foregroundStyle(AppTheme.ink)

                Text("Track every dollar, photo and document across your builds.")
                    .font(AppFont.subheadline)
                    .foregroundStyle(AppTheme.inkSecondary)
            }
            .padding(.vertical, AppTheme.Space.xs)
        }
        .listRowBackground(Color.clear)
        .listRowSeparator(.hidden))
    }

    private var portfolioSummarySection: AnyView {
        AnyView(Section {
            HStack(spacing: 10) {
                PortfolioSummaryTile(title: "Projects", value: "\(projects.count)", systemImage: "house")
                PortfolioSummaryTile(
                    title: "Budget",
                    value: projects.reduce(0) { $0 + $1.constructionBudget }.compactCurrencyString,
                    systemImage: "banknote"
                )
                PortfolioSummaryTile(title: "Open", value: portfolioOpenTotal.compactCurrencyString, systemImage: "clock")
            }
            .listRowInsets(EdgeInsets(top: 4, leading: 16, bottom: 8, trailing: 16))
            .listRowBackground(Color.clear)
        })
    }

    private var portfolioFiltersSection: AnyView {
        AnyView(Section {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    ForEach(ProjectStatus.allCases) { status in
                        PortfolioFilterChip(
                            title: status.title,
                            systemImage: status.systemImage,
                            tint: AppTheme.projectStatusColor(status),
                            isSelected: statusFilter == status
                        ) {
                            statusFilter = (statusFilter == status) ? nil : status
                        }
                    }
                    Divider().frame(height: 18).padding(.horizontal, 4)
                    ForEach(ProjectPriority.allCases.filter { $0 != .normal }) { priority in
                        PortfolioFilterChip(
                            title: priority.title,
                            systemImage: "flag.fill",
                            tint: AppTheme.projectPriorityColor(priority),
                            isSelected: priorityFilter == priority
                        ) {
                            priorityFilter = (priorityFilter == priority) ? nil : priority
                        }
                    }
                }
                .padding(.horizontal, 16)
            }
            .listRowInsets(EdgeInsets(top: 0, leading: 0, bottom: 6, trailing: 0))
            .listRowBackground(Color.clear)
        })
    }

    private var projectsSection: AnyView {
        AnyView(Section("Projects") {
            if projects.isEmpty {
                EmptyStateView(
                    title: "No projects",
                    subtitle: "Create your first build to start tracking.",
                    systemImage: "house.badge.plus"
                )
            } else if filteredProjects.isEmpty {
                EmptyStateView(
                    title: "No matches",
                    subtitle: "Clear filters to see all projects.",
                    systemImage: "line.3.horizontal.decrease.circle"
                )
            } else {
                ForEach(filteredProjects) { project in
                    projectRow(project)
                }
            }
        })
    }

    private func projectRow(_ project: Project) -> AnyView {
        AnyView(NavigationLink {
            RootTabView(project: project) { projectID in
                deleteProject(withID: projectID)
            }
            .navigationBarBackButtonHidden(true)
        } label: {
            ProjectCardRow(
                project: project,
                metrics: metricsByProjectID[project.id, default: .empty]
            )
        }
        .listRowInsets(EdgeInsets(top: 7, leading: 16, bottom: 7, trailing: 16))
        .listRowSeparator(.hidden)
        .listRowBackground(Color.clear)
        .contextMenu {
            Button(role: .destructive) {
                projectPendingDelete = ProjectDeleteCandidate(project: project)
            } label: {
                Label("Delete Project", systemImage: "trash")
            }
        })
    }

    private var deleteAlertBinding: Binding<Bool> {
        Binding(
            get: { projectPendingDelete != nil },
            set: { isPresented in
                if !isPresented {
                    projectPendingDelete = nil
                }
            }
        )
    }

    private func deleteProject(withID projectID: UUID) {
        do {
            let categories = try fetchAllForDelete(BudgetCategory.self, projectID: projectID)
            let items = try fetchAllForDelete(BudgetLineItem.self, projectID: projectID)
            let expenses = try fetchAllForDelete(Expense.self, projectID: projectID)
            let vendors = try fetchAllForDelete(Vendor.self, projectID: projectID)
            let photos = try fetchAllForDelete(PhotoAttachment.self, projectID: projectID)
            let documents = try fetchAllForDelete(ProjectDocument.self, projectID: projectID)
            let allowanceSelections = try fetchAllForDelete(AllowanceSelection.self, projectID: projectID)
            let tasks = try fetchAllForDelete(ProjectTask.self, projectID: projectID)
            let changeOrders = try fetchAllForDelete(ChangeOrder.self, projectID: projectID)
            let bidPackages = try fetchAllForDelete(BidPackage.self, projectID: projectID)
            let bids = try fetchAllForDelete(Bid.self, projectID: projectID)
            let project = try fetchProject(withID: projectID)
            let projectMediaFolder = project.map(MediaStorageService.projectFolder(project:))

            categories.forEach(modelContext.delete)
            items.forEach(modelContext.delete)
            expenses.forEach(modelContext.delete)
            vendors.forEach(modelContext.delete)
            photos.forEach(modelContext.delete)
            documents.forEach(modelContext.delete)
            allowanceSelections.forEach(modelContext.delete)
            tasks.forEach(modelContext.delete)
            changeOrders.forEach(modelContext.delete)
            bidPackages.forEach(modelContext.delete)
            bids.forEach(modelContext.delete)
            if let project {
                modelContext.delete(project)
            }

            try modelContext.save()
            if let projectMediaFolder {
                MediaStorageService.removeAllMedia(at: projectMediaFolder)
            }
            projectPendingDelete = nil
            Haptics.success()
            refreshProjectMetrics()
        } catch {
            modelContext.safeRollback()
            projectPendingDelete = nil
            Haptics.warning()
        }
    }

    private func fetchAllForDelete<T: PersistentModel & ProjectScoped>(_ type: T.Type, projectID: UUID) throws -> [T] {
        let descriptor = FetchDescriptor<T>(predicate: #Predicate { $0.projectID == projectID })
        return try modelContext.fetch(descriptor)
    }

    private func fetchProject(withID projectID: UUID) throws -> Project? {
        let descriptor = FetchDescriptor<Project>(
            predicate: #Predicate { $0.id == projectID }
        )
        return try modelContext.fetch(descriptor).first
    }

    private func refreshProjectMetrics() {
        let items = fetchAllBudgetItems()
        let expenses = fetchAllExpenses()
        let changeOrders = fetchAllChangeOrders()
        let itemsByProjectID = Dictionary(grouping: items, by: \.projectID)
        let expensesByProjectID = Dictionary(grouping: expenses, by: \.projectID)
        let changeOrdersByProjectID = Dictionary(grouping: changeOrders, by: \.projectID)

        metricsByProjectID = Dictionary(
            uniqueKeysWithValues: projects.map { project in
                let projectItems = itemsByProjectID[project.id, default: []]
                let projectExpenses = expensesByProjectID[project.id, default: []]
                let projectChangeOrders = changeOrdersByProjectID[project.id, default: []]
                return (
                    project.id,
                    ProjectCardMetrics(
                        actual: BudgetMathService.actualSpend(expenses: projectExpenses, changeOrders: projectChangeOrders),
                        committed: BudgetMathService.committedSpend(items: projectItems, changeOrders: projectChangeOrders),
                        openInvoiceTotal: BudgetMathService.openInvoiceTotal(expenses: projectExpenses),
                        itemCount: projectItems.count
                    )
                )
            }
        )
    }

    private func fetchAllBudgetItems() -> [BudgetLineItem] {
        let descriptor = FetchDescriptor<BudgetLineItem>(
            sortBy: [SortDescriptor(\.costCode)]
        )
        return (try? modelContext.fetch(descriptor)) ?? []
    }

    private func fetchAllExpenses() -> [Expense] {
        let descriptor = FetchDescriptor<Expense>(
            sortBy: [SortDescriptor(\.date, order: .reverse)]
        )
        return (try? modelContext.fetch(descriptor)) ?? []
    }

    private func fetchAllChangeOrders() -> [ChangeOrder] {
        let descriptor = FetchDescriptor<ChangeOrder>(
            sortBy: [SortDescriptor(\.createdAt, order: .reverse)]
        )
        return (try? modelContext.fetch(descriptor)) ?? []
    }
}

private struct ProjectCardMetrics {
    let actual: Double
    let committed: Double
    let openInvoiceTotal: Double
    let itemCount: Int

    static let empty = ProjectCardMetrics(actual: 0, committed: 0, openInvoiceTotal: 0, itemCount: 0)
}

private struct ProjectDeleteCandidate: Identifiable {
    let id: UUID
    let name: String

    init(project: Project) {
        id = project.id
        name = project.name
    }
}

private struct PortfolioFilterChip: View {
    let title: String
    let systemImage: String
    let tint: Color
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 5) {
                Image(systemName: systemImage)
                    .font(.caption2.weight(.bold))
                Text(title)
                    .font(AppFont.caption2)
            }
            .foregroundStyle(isSelected ? Color.white : tint)
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(
                Capsule().fill(isSelected ? tint : tint.opacity(0.13))
            )
        }
        .buttonStyle(.plain)
    }
}

private struct ProjectCardRow: View {
    let project: Project
    let metrics: ProjectCardMetrics

    private var spentAndCommitted: Double {
        metrics.actual + metrics.committed
    }

    private var progress: Double {
        guard project.constructionBudget > 0 else { return 0 }
        return spentAndCommitted / project.constructionBudget
    }

    private var unpaidTotal: Double {
        metrics.openInvoiceTotal
    }

    private var progressTint: Color {
        if progress > 1 { return AppTheme.negative }
        if progress > 0.9 { return AppTheme.warning }
        return AppTheme.brand
    }

    var body: some View {
        VStack(alignment: .leading, spacing: AppTheme.Space.md) {
            HStack(alignment: .top) {
                HStack(alignment: .top, spacing: AppTheme.Space.sm) {
                    Image(systemName: "house.lodge.fill")
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundStyle(progressTint)
                        .frame(width: 44, height: 44)
                        .background(
                            RoundedRectangle(cornerRadius: AppTheme.Radius.sm, style: .continuous)
                                .fill(progressTint.opacity(0.14))
                        )

                    VStack(alignment: .leading, spacing: 4) {
                        Text(project.name)
                            .font(AppFont.headline)
                            .foregroundStyle(AppTheme.ink)
                            .lineLimit(1)

                        Text(project.address)
                            .font(AppFont.caption)
                            .foregroundStyle(AppTheme.inkSecondary)
                            .lineLimit(2)

                        HStack(spacing: 6) {
                            ProjectInfoChip(
                                title: project.status.title,
                                systemImage: project.status.systemImage,
                                tint: AppTheme.projectStatusColor(project.status)
                            )

                            if project.priority != .normal {
                                ProjectInfoChip(
                                    title: project.priority.title,
                                    systemImage: "flag.fill",
                                    tint: AppTheme.projectPriorityColor(project.priority)
                                )
                            }
                        }
                        .padding(.top, 2)
                    }
                }

                Spacer()

                VStack(alignment: .trailing, spacing: 4) {
                    Text(project.constructionBudget.compactCurrencyString)
                        .font(AppFont.numeric(18, weight: .bold))
                        .monospacedDigit()
                        .foregroundStyle(AppTheme.ink)

                    Text("\(Int(progress * 100))% used")
                        .font(AppFont.caption2)
                        .foregroundStyle(progressTint)
                }
            }

            BudgetProgressBar(value: progress, tint: progressTint)

            HStack(spacing: 8) {
                ProjectCardStat(title: "Used", value: spentAndCommitted.compactCurrencyString, systemImage: "chart.line.uptrend.xyaxis")
                ProjectCardStat(title: "Open", value: unpaidTotal.compactCurrencyString, systemImage: "clock")
                ProjectCardStat(title: "Items", value: "\(metrics.itemCount)", systemImage: "checklist")
            }

            HStack {
                Label(project.lotDimensions.isEmpty ? "Lot TBD" : project.lotDimensions, systemImage: "map")
                Spacer()
                if let targetFinishDate = project.targetFinishDate {
                    Label(targetFinishDate.shortDateString, systemImage: "calendar")
                } else {
                    Label(
                        project.proposedBuildDimensions.isEmpty ? project.footprint : project.proposedBuildDimensions,
                        systemImage: "ruler"
                    )
                }
            }
            .font(AppFont.caption2)
            .foregroundStyle(AppTheme.inkTertiary)
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
        .appCardShadow()
    }
}

private struct ProjectInfoChip: View {
    let title: String
    let systemImage: String
    let tint: Color

    var body: some View {
        HStack(spacing: 4) {
            Image(systemName: systemImage)
                .font(.caption2.weight(.bold))
            Text(title)
                .font(AppFont.caption2)
        }
        .foregroundStyle(tint)
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background(Capsule().fill(tint.opacity(0.13)))
    }
}

private struct ProjectCardStat: View {
    let title: String
    let value: String
    let systemImage: String

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: systemImage)
                .font(.caption.weight(.bold))
                .foregroundStyle(AppTheme.brand)

            VStack(alignment: .leading, spacing: 1) {
                Text(value)
                    .font(AppFont.numeric(13, weight: .bold))
                    .monospacedDigit()
                    .foregroundStyle(AppTheme.ink)
                    .lineLimit(1)
                    .minimumScaleFactor(0.72)

                Text(title)
                    .font(AppFont.caption2)
                    .foregroundStyle(AppTheme.inkTertiary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, AppTheme.Space.sm)
        .padding(.vertical, 10)
        .background(
            RoundedRectangle(cornerRadius: AppTheme.Radius.sm, style: .continuous)
                .fill(AppTheme.surfaceSunken)
        )
    }
}

private struct PortfolioSummaryTile: View {
    let title: String
    let value: String
    let systemImage: String

    var body: some View {
        VStack(alignment: .leading, spacing: AppTheme.Space.xs) {
            Image(systemName: systemImage)
                .font(.caption.weight(.bold))
                .foregroundStyle(AppTheme.brand)
                .frame(width: 28, height: 28)
                .background(
                    RoundedRectangle(cornerRadius: AppTheme.Radius.xs, style: .continuous)
                        .fill(AppTheme.brandSoft)
                )

            Text(value)
                .font(AppFont.numeric(19, weight: .bold))
                .monospacedDigit()
                .foregroundStyle(AppTheme.ink)
                .lineLimit(1)
                .minimumScaleFactor(0.72)

            Text(title.uppercased())
                .font(AppFont.eyebrow)
                .tracking(0.7)
                .foregroundStyle(AppTheme.inkTertiary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
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
