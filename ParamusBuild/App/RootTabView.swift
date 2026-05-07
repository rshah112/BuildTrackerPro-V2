import SwiftUI

struct RootTabView: View {
    let project: Project
    let deleteProject: (UUID) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var selectedTab: ProjectTab = .dashboard
    @State private var expenseFilter: ExpenseListFilter = .all
    @State private var budgetSearchText = ""

    var body: some View {
        TabView(selection: $selectedTab) {
            DashboardView(project: project) { target in
                navigate(to: target)
            }
            .tabItem {
                Label("Dashboard", systemImage: "gauge.with.dots.needle.67percent")
            }
            .tag(ProjectTab.dashboard)

            BudgetView(project: project, initialSearchText: budgetSearchText)
                .tabItem {
                    Label("Budget", systemImage: "list.bullet.rectangle")
                }
                .tag(ProjectTab.budget)

            ExpensesView(project: project, initialFilter: expenseFilter)
                .tabItem {
                    Label("Expenses", systemImage: "creditcard")
                }
                .tag(ProjectTab.expenses)

            PhotosView(project: project)
                .tabItem {
                    Label("Photos", systemImage: "photo.on.rectangle.angled")
                }
                .tag(ProjectTab.photos)

            MoreView(project: project) {
                dismiss()
            } deleteProject: { projectID in
                dismiss()
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) {
                    deleteProject(projectID)
                }
            }
            .tabItem {
                Label("More", systemImage: "ellipsis.circle")
            }
            .tag(ProjectTab.more)
        }
        .tint(AppTheme.brand)
        .toolbarBackground(AppTheme.surface, for: .tabBar)
        .toolbarBackground(.visible, for: .tabBar)
    }

    private func navigate(to target: ProjectNavigationTarget) {
        switch target {
        case let .tab(tab):
            selectedTab = tab
        case let .budget(searchText):
            budgetSearchText = searchText
            selectedTab = .budget
        case let .expenses(filter):
            expenseFilter = filter
            selectedTab = .expenses
        }
    }
}

enum ProjectTab: Hashable {
    case dashboard
    case budget
    case expenses
    case photos
    case more
}

enum ProjectNavigationTarget: Hashable {
    case tab(ProjectTab)
    case budget(searchText: String = "")
    case expenses(ExpenseListFilter)
}
