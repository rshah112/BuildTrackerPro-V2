import SwiftData
import SwiftUI

struct ProjectFormView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.modelContext) private var modelContext

    @State private var step: ProjectSetupStep = .template
    @State private var selectedTemplateType: ProjectTemplateType = .customHome
    @State private var name = ""
    @State private var address = ""
    @State private var status: ProjectStatus = .planning
    @State private var priority: ProjectPriority = .normal
    @State private var hasStartDate = false
    @State private var startDate = Date()
    @State private var hasTargetFinishDate = false
    @State private var targetFinishDate = Date()
    @State private var scopeSummary = ""
    @State private var purchasePrice = 0.0
    @State private var squareFootage = 0.0
    @State private var lotDimensions = ""
    @State private var proposedBuildDimensions = ""
    @State private var stories = 2
    @State private var basement = "Unfinished basement"
    @State private var constructionBudget = 0.0
    @State private var contingencyBudget = 0.0
    @State private var draftCategories: [BudgetCategoryDraft] = []
    @State private var expandedCategoryIDs = Set<UUID>()
    @State private var showingTemplateToast = false
    @State private var saveErrorMessage: String?

    private var selectedTemplate: ProjectTemplate {
        ProjectTemplateService.template(for: selectedTemplateType)
    }

    private var setupProfile: ProjectSetupProfile {
        ProjectSetupProfile.profile(for: selectedTemplateType)
    }

    private var canContinueToReview: Bool {
        !name.trimmed.isEmpty && !address.trimmed.isEmpty && constructionBudget > 0
    }

    private var allocatedBudget: Double {
        MoneyMath.sum(draftCategories, by: \.amount)
    }

    private var unallocatedBudget: Double {
        MoneyMath.diff(constructionBudget, allocatedBudget)
    }

    private var saveErrorBinding: Binding<Bool> {
        Binding(
            get: { saveErrorMessage != nil },
            set: { isPresented in
                if !isPresented {
                    saveErrorMessage = nil
                }
            }
        )
    }

    var body: some View {
        NavigationStack {
            ZStack(alignment: .bottom) {
                content
                    .scrollContentBackground(.hidden)
                    .background(AppTheme.pageBackground)

                if showingTemplateToast {
                    TemplateToast()
                        .padding(.horizontal, AppTheme.pagePadding)
                        .padding(.bottom, 14)
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                }
            }
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(step == .template ? "Cancel" : "Back") {
                        goBack()
                    }
                }

                ToolbarItem(placement: .confirmationAction) {
                    Button(primaryActionTitle) {
                        primaryAction()
                    }
                    .disabled(primaryActionDisabled)
                }
            }
            .alert("Project Could Not Be Saved", isPresented: saveErrorBinding) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(saveErrorMessage ?? "Please try again.")
            }
        }
    }

    @ViewBuilder
    private var content: some View {
        switch step {
        case .template:
            templatePicker
        case .details:
            detailsForm
        case .review:
            budgetReview
        }
    }

    private var templatePicker: some View {
        List {
            Section {
                VStack(alignment: .leading, spacing: 6) {
                    Text("What are you building?")
                        .font(.system(.title2, design: .rounded, weight: .bold))
                    Text("Choose a starter setup. You can edit it next.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                .padding(.vertical, 4)
            }
            .listRowBackground(Color.clear)

            Section {
                ForEach(ProjectTemplateService.templates) { template in
                    TemplatePickerCard(
                        template: template,
                        isSelected: selectedTemplateType == template.type
                    )
                    .contentShape(Rectangle())
                    .onTapGesture {
                        Haptics.lightTap()
                        selectedTemplateType = template.type
                    }
                    .listRowInsets(EdgeInsets(top: 7, leading: 16, bottom: 7, trailing: 16))
                    .listRowSeparator(.hidden)
                    .listRowBackground(Color.clear)
                }
            }
        }
        .listStyle(.plain)
    }

    private var detailsForm: some View {
        ModernForm {
            ModernFormSection("Template") {
                TemplateSummaryPill(template: selectedTemplate)
            }

            ModernFormSection("Project") {
                ModernField("Project name") {
                    TextField("e.g. 676 Rutgers Pl", text: $name)
                        .textInputAutocapitalization(.words)
                        .modernTextField()
                }

                ModernField("Address") {
                    TextField("Street, city, state", text: $address, axis: .vertical)
                        .lineLimit(2 ... 3)
                        .modernTextField()
                }
            }

            ModernFormSection("Plan") {
                ModernField("Status") {
                    Picker("Status", selection: $status) {
                        ForEach(ProjectStatus.allCases) { status in
                            Label(status.title, systemImage: status.systemImage).tag(status)
                        }
                    }
                    .pickerStyle(.menu)
                }

                ModernField("Priority") {
                    Picker("Priority", selection: $priority) {
                        ForEach(ProjectPriority.allCases) { priority in
                            Text(priority.title).tag(priority)
                        }
                    }
                    .pickerStyle(.segmented)
                }

                Toggle("Start date", isOn: $hasStartDate)
                    .font(.body.weight(.medium))

                if hasStartDate {
                    ModernField("Starts") {
                        DatePicker("Starts", selection: $startDate, displayedComponents: .date)
                            .labelsHidden()
                    }
                }

                Toggle("Target finish", isOn: $hasTargetFinishDate)
                    .font(.body.weight(.medium))

                if hasTargetFinishDate {
                    ModernField("Finish target") {
                        DatePicker("Finish target", selection: $targetFinishDate, displayedComponents: .date)
                            .labelsHidden()
                    }
                }

                ModernField("Scope summary") {
                    TextField("Simple notes about what is included", text: $scopeSummary, axis: .vertical)
                        .lineLimit(2 ... 5)
                        .modernTextField()
                }
            }

            ModernFormSection(setupProfile.sectionTitle, footer: setupProfile.footer) {
                if let purchasePriceLabel = setupProfile.purchasePriceLabel {
                    ModernField(purchasePriceLabel) {
                        CurrencyField(value: $purchasePrice)
                            .modernTextField()
                    }
                }

                if setupProfile.proposedDimensionsLabel != nil {
                    ModernField("Square footage") {
                        TextField("0", value: $squareFootage, format: .number.precision(.fractionLength(0)))
                            .keyboardType(.decimalPad)
                            .modernTextField()
                    }
                }

                if let lotLabel = setupProfile.lotDimensionsLabel {
                    ModernField(lotLabel) {
                        TextField("e.g. 70 x 125", text: $lotDimensions)
                            .modernTextField()
                    }
                }

                if let proposedLabel = setupProfile.proposedDimensionsLabel {
                    ModernField(proposedLabel) {
                        TextField("Dimensions, square footage, or scope notes", text: $proposedBuildDimensions, axis: .vertical)
                            .lineLimit(1 ... 3)
                            .modernTextField()
                    }
                }

                if setupProfile.showsStories {
                    ModernField(setupProfile.storiesLabel) {
                        Stepper("\(stories)", value: $stories, in: 1 ... 4)
                            .font(.body.weight(.semibold))
                    }
                }

                if let basementLabel = setupProfile.basementLabel {
                    ModernField(basementLabel) {
                        TextField("Current or proposed condition", text: $basement)
                            .modernTextField()
                    }
                }
            }

            ModernFormSection(
                "Budget",
                footer: "The starter budget uses this project budget and template percentages. You can edit every category next."
            ) {
                ModernField("Project budget", subtitle: "The base amount you expect to spend on the actual scope of work.") {
                    CurrencyField(value: $constructionBudget)
                        .modernTextField()
                }

                ModernField(
                    "Reserve / contingency",
                    subtitle: "Optional backup money kept outside the base budget for surprises or owner changes."
                ) {
                    CurrencyField(value: $contingencyBudget)
                        .modernTextField()
                }

                HStack {
                    Label("Total planned funding", systemImage: "sum")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(.secondary)

                    Spacer()

                    Text((constructionBudget + contingencyBudget).currencyString)
                        .font(.headline.weight(.bold))
                }
            }
        }
    }

    private var budgetReview: some View {
        List {
            Section {
                BudgetReviewSummary(
                    allocated: allocatedBudget,
                    constructionBudget: constructionBudget,
                    contingency: contingencyBudget,
                    remaining: unallocatedBudget
                )
                .listRowInsets(EdgeInsets(top: 8, leading: 16, bottom: 8, trailing: 16))
                .listRowBackground(Color.clear)
            }

            Section {
                Button {
                    resetTemplate()
                } label: {
                    Label("Reset to Template", systemImage: "arrow.counterclockwise")
                        .frame(maxWidth: .infinity, alignment: .center)
                }
                .buttonStyle(.bordered)
            }
            .listRowBackground(Color.clear)

            Section {
                ForEach($draftCategories) { $category in
                    BudgetDraftCategoryCard(
                        category: $category,
                        constructionBudget: constructionBudget,
                        isExpanded: expandedCategoryIDs.contains(category.id),
                        onToggle: {
                            toggle(category.id)
                        },
                        onSetCategoryAmount: { amount in
                            setCategoryAmount(categoryID: category.id, amount: amount)
                        },
                        onSetCategoryPercent: { percent in
                            setCategoryAmount(categoryID: category.id, amount: constructionBudget * percent / 100)
                        },
                        onDeleteItem: { itemID in
                            deleteItem(categoryID: category.id, itemID: itemID)
                        },
                        onAddItem: {
                            addItem(to: category.id)
                        }
                    )
                    .listRowInsets(EdgeInsets(top: 7, leading: 16, bottom: 7, trailing: 16))
                    .listRowSeparator(.hidden)
                    .listRowBackground(Color.clear)
                }

                Button {
                    addCategory()
                } label: {
                    Label("Add Category", systemImage: "folder.badge.plus")
                        .frame(maxWidth: .infinity, alignment: .center)
                }
                .buttonStyle(.bordered)
                .listRowBackground(Color.clear)
            } footer: {
                Text("Starter budget added. You can edit anything.")
            }
        }
        .listStyle(.plain)
    }

    private var title: String {
        switch step {
        case .template: "New Project"
        case .details: "Project Details"
        case .review: "Review Budget"
        }
    }

    private var primaryActionTitle: String {
        switch step {
        case .template: "Next"
        case .details: "Review"
        case .review: "Create"
        }
    }

    private var primaryActionDisabled: Bool {
        switch step {
        case .template:
            false
        case .details:
            !canContinueToReview
        case .review:
            draftCategories.flatMap(\.items).isEmpty || allocatedBudget <= 0
        }
    }

    private func primaryAction() {
        switch step {
        case .template:
            withAnimation(.smooth(duration: 0.22)) {
                step = .details
            }
        case .details:
            applyTemplate()
        case .review:
            save()
        }
    }

    private func goBack() {
        switch step {
        case .template:
            dismiss()
        case .details:
            withAnimation(.smooth(duration: 0.22)) {
                step = .template
            }
        case .review:
            withAnimation(.smooth(duration: 0.22)) {
                step = .details
            }
        }
    }

    private func applyTemplate() {
        draftCategories = ProjectTemplateService.makeDraft(from: selectedTemplate, constructionBudget: constructionBudget)
        expandedCategoryIDs = Set(draftCategories.prefix(2).map(\.id))
        Haptics.success()

        withAnimation(.smooth(duration: 0.22)) {
            step = .review
            showingTemplateToast = true
        }

        Task {
            try? await Task.sleep(for: .seconds(2.2))
            await MainActor.run {
                withAnimation(.smooth(duration: 0.22)) {
                    showingTemplateToast = false
                }
            }
        }
    }

    private func resetTemplate() {
        draftCategories = ProjectTemplateService.makeDraft(from: selectedTemplate, constructionBudget: constructionBudget)
        expandedCategoryIDs = Set(draftCategories.prefix(2).map(\.id))
        Haptics.lightTap()

        withAnimation(.smooth(duration: 0.22)) {
            showingTemplateToast = true
        }

        Task {
            try? await Task.sleep(for: .seconds(1.8))
            await MainActor.run {
                withAnimation(.smooth(duration: 0.22)) {
                    showingTemplateToast = false
                }
            }
        }
    }

    private func toggle(_ id: UUID) {
        withAnimation(.smooth(duration: 0.2)) {
            if expandedCategoryIDs.contains(id) {
                expandedCategoryIDs.remove(id)
            } else {
                expandedCategoryIDs.insert(id)
            }
        }
    }

    private func setCategoryAmount(categoryID: UUID, amount: Double) {
        guard let categoryIndex = draftCategories.firstIndex(where: { $0.id == categoryID }) else { return }
        let currentAmount = draftCategories[categoryIndex].amount
        let lockedTotal = draftCategories[categoryIndex].items.filter(\.isLocked).reduce(0) { $0 + $1.amount }
        let unlockedIndices = draftCategories[categoryIndex].items.indices.filter { !draftCategories[categoryIndex].items[$0].isLocked }
        let unlockedTotal = unlockedIndices.reduce(0) { $0 + draftCategories[categoryIndex].items[$1].amount }
        let newUnlockedTotal = max(0, amount - lockedTotal)

        guard !unlockedIndices.isEmpty else { return }

        for index in unlockedIndices {
            let current = draftCategories[categoryIndex].items[index].amount
            let share = unlockedTotal > 0 ? current / unlockedTotal : 1 / Double(unlockedIndices.count)
            draftCategories[categoryIndex].items[index].amount = (newUnlockedTotal * share).rounded()
        }

        if currentAmount == 0, lockedTotal == 0 {
            let evenAmount = amount / Double(max(1, unlockedIndices.count))
            for index in unlockedIndices {
                draftCategories[categoryIndex].items[index].amount = evenAmount.rounded()
            }
        }
    }

    private func deleteItem(categoryID: UUID, itemID: UUID) {
        guard let categoryIndex = draftCategories.firstIndex(where: { $0.id == categoryID }) else { return }
        draftCategories[categoryIndex].items.removeAll { $0.id == itemID && !$0.isLocked }
    }

    private func addItem(to categoryID: UUID) {
        guard let categoryIndex = draftCategories.firstIndex(where: { $0.id == categoryID }) else { return }
        let categoryNumber = categoryIndex + 1
        let usedCodes = allUsedCostCodes()
        let newCode = uniqueCostCode(forCategoryNumber: categoryNumber, used: usedCodes)
        draftCategories[categoryIndex].items.append(
            BudgetLineItemDraft(
                costCode: newCode,
                title: "New Item",
                amount: 0
            )
        )
        expandedCategoryIDs.insert(categoryID)
    }

    private func addCategory() {
        let categoryNumber = nextAvailableCategoryNumber()
        let usedCodes = allUsedCostCodes()
        let newCode = uniqueCostCode(forCategoryNumber: categoryNumber, used: usedCodes)
        let category = BudgetCategoryDraft(
            name: "New Category",
            systemImage: "folder",
            items: [
                BudgetLineItemDraft(
                    costCode: newCode,
                    title: "New Item",
                    amount: 0
                )
            ]
        )
        draftCategories.append(category)
        expandedCategoryIDs.insert(category.id)
    }

    private func allUsedCostCodes() -> Set<String> {
        Set(draftCategories.flatMap { $0.items.map(\.costCode.trimmed) })
    }

    private func nextAvailableCategoryNumber() -> Int {
        let existingPrefixes = Set(draftCategories.flatMap { $0.items.compactMap { Int($0.costCode.prefix(2)) } })
        var candidate = 1
        while existingPrefixes.contains(candidate) {
            candidate += 1
        }
        return candidate
    }

    private func uniqueCostCode(forCategoryNumber categoryNumber: Int, used: Set<String>) -> String {
        var sequence = 1
        while sequence <= 99 {
            let code = String(format: "%02d%02d", categoryNumber, sequence)
            if !used.contains(code) { return code }
            sequence += 1
        }
        // Fallback to a 4-digit numeric outside the standard ranges
        return String(format: "%04d", (used.compactMap { Int($0) }.max() ?? 7000) + 1)
    }

    private func save() {
        let project = Project(
            name: name.trimmed,
            address: address.trimmed,
            status: status,
            priority: priority,
            templateType: selectedTemplateType,
            purchasePrice: setupProfile.purchasePriceLabel == nil ? 0 : purchasePrice,
            squareFootage: squareFootage > 0 ? squareFootage : nil,
            lotDimensions: setupProfile.lotDimensionsLabel == nil ? "" : lotDimensions.trimmed,
            proposedBuildDimensions: setupProfile.proposedDimensionsLabel == nil ? "" : proposedBuildDimensions.trimmed,
            footprint: proposedBuildDimensions.trimmed,
            stories: setupProfile.showsStories ? stories : 1,
            basement: setupProfile.basementLabel == nil ? "" : basement.trimmed,
            scopeSummary: scopeSummary.trimmed,
            startDate: hasStartDate ? startDate : nil,
            targetFinishDate: hasTargetFinishDate ? targetFinishDate : nil,
            constructionBudget: constructionBudget,
            contingencyBudget: contingencyBudget
        )
        modelContext.insert(project)
        ProjectTemplateService.insertBudgetDraft(draftCategories, for: project, in: modelContext)

        if contingencyBudget > 0 {
            let category = BudgetCategory(
                projectID: project.id,
                name: "Contingency",
                sortOrder: draftCategories.count,
                targetBudget: contingencyBudget,
                systemImage: "shield.lefthalf.filled"
            )
            let item = BudgetLineItem(
                projectID: project.id,
                costCode: "9001",
                title: "Contingency Reserve",
                categoryName: "Contingency",
                roomTag: RoomCatalog.general,
                budget: contingencyBudget,
                isPinned: true
            )
            modelContext.insert(category)
            modelContext.insert(item)
        }

        do {
            try modelContext.save()
            Haptics.success()
            dismiss()
        } catch {
            modelContext.safeRollback()
            saveErrorMessage = error.localizedDescription
            Haptics.warning()
        }
    }
}

private enum ProjectSetupStep {
    case template
    case details
    case review
}

private struct ProjectSetupProfile {
    let sectionTitle: String
    let purchasePriceLabel: String?
    let lotDimensionsLabel: String?
    let proposedDimensionsLabel: String?
    let showsStories: Bool
    let storiesLabel: String
    let basementLabel: String?
    let footer: String

    static func profile(for templateType: ProjectTemplateType) -> ProjectSetupProfile {
        switch templateType {
        case .customHome:
            ProjectSetupProfile(
                sectionTitle: "Property & Build",
                purchasePriceLabel: "Purchase price",
                lotDimensionsLabel: "Lot dimensions",
                proposedDimensionsLabel: "Proposed home dimensions",
                showsStories: true,
                storiesLabel: "Stories",
                basementLabel: "Basement",
                footer: "Use the key facts that define the home and site."
            )
        case .majorRenovation:
            ProjectSetupProfile(
                sectionTitle: "Renovation Scope",
                purchasePriceLabel: "Purchase price",
                lotDimensionsLabel: nil,
                proposedDimensionsLabel: "Renovated area / square footage",
                showsStories: false,
                storiesLabel: "Floors affected",
                basementLabel: nil,
                footer: "Capture the size or area being renovated."
            )
        case .addition:
            ProjectSetupProfile(
                sectionTitle: "Addition Scope",
                purchasePriceLabel: nil,
                lotDimensionsLabel: "Lot / yard constraints",
                proposedDimensionsLabel: "Addition dimensions",
                showsStories: true,
                storiesLabel: "Addition stories",
                basementLabel: "Foundation or basement notes",
                footer: "Capture the footprint and tie-in details that drive the budget."
            )
        case .poolBackyard:
            ProjectSetupProfile(
                sectionTitle: "Pool & Yard Scope",
                purchasePriceLabel: nil,
                lotDimensionsLabel: "Backyard / work area dimensions",
                proposedDimensionsLabel: "Pool / patio dimensions",
                showsStories: false,
                storiesLabel: "Stories",
                basementLabel: nil,
                footer: "Use approximate sizes for the pool, patio, and outdoor work area."
            )
        case .deckPatio:
            ProjectSetupProfile(
                sectionTitle: "Deck / Patio Scope",
                purchasePriceLabel: nil,
                lotDimensionsLabel: "Work area dimensions",
                proposedDimensionsLabel: "Deck / patio dimensions",
                showsStories: false,
                storiesLabel: "Stories",
                basementLabel: nil,
                footer: "Capture the planned footprint, surface type, stairs, and rail scope."
            )
        case .kitchenRemodel:
            ProjectSetupProfile(
                sectionTitle: "Kitchen Scope",
                purchasePriceLabel: nil,
                lotDimensionsLabel: nil,
                proposedDimensionsLabel: "Kitchen size / layout notes",
                showsStories: false,
                storiesLabel: "Stories",
                basementLabel: nil,
                footer: "Use the room size, layout change, or cabinet run as the baseline."
            )
        case .bathroomRemodel:
            ProjectSetupProfile(
                sectionTitle: "Bathroom Scope",
                purchasePriceLabel: nil,
                lotDimensionsLabel: nil,
                proposedDimensionsLabel: "Bathroom size / layout notes",
                showsStories: false,
                storiesLabel: "Stories",
                basementLabel: nil,
                footer: "Capture room size, shower/tub scope, and any layout changes."
            )
        case .basementFinish:
            ProjectSetupProfile(
                sectionTitle: "Basement Scope",
                purchasePriceLabel: nil,
                lotDimensionsLabel: nil,
                proposedDimensionsLabel: "Basement area / square footage",
                showsStories: false,
                storiesLabel: "Stories",
                basementLabel: "Current basement condition",
                footer: "Capture the finish area and existing condition."
            )
        case .garageBuild:
            ProjectSetupProfile(
                sectionTitle: "Garage Scope",
                purchasePriceLabel: nil,
                lotDimensionsLabel: "Driveway / site constraints",
                proposedDimensionsLabel: "Garage dimensions",
                showsStories: true,
                storiesLabel: "Garage stories",
                basementLabel: nil,
                footer: "Capture bay count, dimensions, access, and site constraints."
            )
        case .landscapingHardscape:
            ProjectSetupProfile(
                sectionTitle: "Outdoor Scope",
                purchasePriceLabel: nil,
                lotDimensionsLabel: "Work area dimensions",
                proposedDimensionsLabel: "Hardscape / planting scope",
                showsStories: false,
                storiesLabel: "Stories",
                basementLabel: nil,
                footer: "Use the work area, patio/wall size, planting scope, and drainage notes."
            )
        case .custom:
            ProjectSetupProfile(
                sectionTitle: "Scope",
                purchasePriceLabel: nil,
                lotDimensionsLabel: nil,
                proposedDimensionsLabel: "Scope notes",
                showsStories: false,
                storiesLabel: "Stories",
                basementLabel: nil,
                footer: "Add a simple baseline for this custom project."
            )
        }
    }
}

private struct TemplatePickerCard: View {
    let template: ProjectTemplate
    let isSelected: Bool

    var body: some View {
        HStack(spacing: 14) {
            Image(systemName: template.systemImage)
                .font(.headline.weight(.semibold))
                .foregroundStyle(isSelected ? .white : AppTheme.accent)
                .frame(width: 42, height: 42)
                .background(
                    isSelected ? AppTheme.accent : AppTheme.accent.opacity(0.12),
                    in: RoundedRectangle(cornerRadius: 9, style: .continuous)
                )

            VStack(alignment: .leading, spacing: 5) {
                HStack {
                    Text(template.title)
                        .font(.headline.weight(.semibold))
                    Spacer()
                    if isSelected {
                        Image(systemName: "checkmark.circle.fill")
                            .foregroundStyle(AppTheme.accent)
                    }
                }

                Text(template.subtitle)
                    .font(.caption)
                    .foregroundStyle(.secondary)

                Text("\(template.typicalRange) • \(template.itemCount) items")
                    .font(.caption2.weight(.bold))
                    .foregroundStyle(.secondary)
            }
        }
        .padding(14)
        .background(AppTheme.cardBackground, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .strokeBorder(isSelected ? AppTheme.accent.opacity(0.55) : AppTheme.border, lineWidth: isSelected ? 1.4 : 1)
        }
    }
}

private struct TemplateSummaryPill: View {
    let template: ProjectTemplate

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: template.systemImage)
                .font(.headline.weight(.semibold))
                .foregroundStyle(AppTheme.accent)
                .frame(width: 38, height: 38)
                .background(AppTheme.accent.opacity(0.12), in: RoundedRectangle(cornerRadius: 8, style: .continuous))

            VStack(alignment: .leading, spacing: 3) {
                Text(template.title)
                    .font(.subheadline.weight(.semibold))
                Text("\(template.itemCount) starter items • \(template.typicalRange)")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(12)
        .background(AppTheme.cardBackground, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
    }
}

private struct BudgetReviewSummary: View {
    let allocated: Double
    let constructionBudget: Double
    let contingency: Double
    let remaining: Double

    private var progress: Double {
        guard constructionBudget > 0 else { return 0 }
        return allocated / constructionBudget
    }

    var body: some View {
        PremiumCard {
            VStack(alignment: .leading, spacing: 14) {
                HStack {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Starter budget")
                            .font(.headline.weight(.semibold))
                        Text("Edit anything before creating.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }

                    Spacer()

                    Text("\(Int(progress * 100))%")
                        .font(.system(.title3, design: .rounded, weight: .bold))
                        .foregroundStyle(remaining < 0 ? AppTheme.negative : AppTheme.accent)
                }

                BudgetProgressBar(value: progress, tint: remaining < 0 ? AppTheme.negative : AppTheme.accent)

                LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 3), spacing: 8) {
                    SummaryChip(title: "Allocated", value: allocated.compactCurrencyString)
                    SummaryChip(title: "Budget", value: constructionBudget.compactCurrencyString)
                    SummaryChip(
                        title: remaining >= 0 ? "Left" : "Over",
                        value: abs(remaining).compactCurrencyString,
                        tint: remaining >= 0 ? AppTheme.positive : AppTheme.negative
                    )
                }

                if contingency > 0 {
                    Label("Contingency: \(contingency.compactCurrencyString)", systemImage: "shield.lefthalf.filled")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.secondary)
                }
            }
        }
    }
}

private struct BudgetDraftCategoryCard: View {
    @Binding var category: BudgetCategoryDraft
    let constructionBudget: Double
    let isExpanded: Bool
    let onToggle: () -> Void
    let onSetCategoryAmount: (Double) -> Void
    let onSetCategoryPercent: (Double) -> Void
    let onDeleteItem: (UUID) -> Void
    let onAddItem: () -> Void

    private var amount: Double {
        category.amount
    }

    private var percent: Double {
        guard constructionBudget > 0 else { return 0 }
        return amount / constructionBudget * 100
    }

    var body: some View {
        PremiumCard {
            VStack(alignment: .leading, spacing: 12) {
                HStack(spacing: 10) {
                    Image(systemName: category.systemImage)
                        .font(.subheadline.weight(.bold))
                        .foregroundStyle(AppTheme.accent)
                        .frame(width: 34, height: 34)
                        .background(AppTheme.accent.opacity(0.12), in: RoundedRectangle(cornerRadius: 8, style: .continuous))

                    TextField("Category", text: $category.name)
                        .font(.headline.weight(.semibold))
                        .disabled(category.isLocked)

                    Spacer()

                    Button {
                        category.isLocked.toggle()
                    } label: {
                        Image(systemName: category.isLocked ? "lock.fill" : "lock.open")
                            .font(.caption.weight(.bold))
                    }
                    .buttonStyle(.borderless)

                    Button(action: onToggle) {
                        Image(systemName: "chevron.down")
                            .font(.caption.weight(.bold))
                            .rotationEffect(.degrees(isExpanded ? 180 : 0))
                    }
                    .buttonStyle(.borderless)
                }

                HStack(spacing: 8) {
                    EditableAmountField(title: "Amount", value: amount, isDisabled: category.isLocked) { newValue in
                        onSetCategoryAmount(newValue)
                    }

                    EditablePercentField(title: "Percent", value: percent, isDisabled: category.isLocked) { newValue in
                        onSetCategoryPercent(newValue)
                    }
                }

                if isExpanded {
                    VStack(spacing: 8) {
                        ForEach($category.items) { $item in
                            BudgetDraftItemRow(
                                item: $item,
                                categoryAmount: max(amount, 1),
                                onDelete: {
                                    onDeleteItem(item.id)
                                }
                            )
                        }

                        Button {
                            onAddItem()
                        } label: {
                            Label("Add Item", systemImage: "plus")
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.bordered)
                    }
                    .transition(.opacity.combined(with: .move(edge: .top)))
                }
            }
        }
    }
}

private struct BudgetDraftItemRow: View {
    @Binding var item: BudgetLineItemDraft
    let categoryAmount: Double
    let onDelete: () -> Void

    private var percent: Double {
        guard categoryAmount > 0 else { return 0 }
        return item.amount / categoryAmount * 100
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                TextField("Code", text: $item.costCode)
                    .font(.caption.weight(.bold))
                    .frame(width: 54)
                    .disabled(item.isLocked)

                TextField("Item", text: $item.title)
                    .font(.subheadline.weight(.semibold))
                    .disabled(item.isLocked)

                Button {
                    item.isLocked.toggle()
                } label: {
                    Image(systemName: item.isLocked ? "lock.fill" : "lock.open")
                        .font(.caption.weight(.bold))
                }
                .buttonStyle(.borderless)

                Button(role: .destructive) {
                    onDelete()
                } label: {
                    Image(systemName: "trash")
                        .font(.caption.weight(.bold))
                }
                .buttonStyle(.borderless)
                .disabled(item.isLocked)
            }

            HStack(spacing: 8) {
                CurrencyField(value: $item.amount, prompt: "Amount")
                    .font(.caption.weight(.bold))
                    .disabled(item.isLocked)

                Text("\(percent, specifier: "%.1f")%")
                    .font(.caption2.weight(.bold))
                    .foregroundStyle(.secondary)
                    .frame(width: 56, alignment: .trailing)
            }
        }
        .padding(10)
        .background(AppTheme.surfaceSunken, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
    }
}

private struct EditableAmountField: View {
    let title: String
    let value: Double
    let isDisabled: Bool
    let onCommit: (Double) -> Void
    @State private var draftValue = 0.0

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title)
                .font(.caption2.weight(.semibold))
                .foregroundStyle(.secondary)

            CurrencyField(value: $draftValue, prompt: title)
                .font(.caption.weight(.bold))
                .disabled(isDisabled)
                .onChange(of: draftValue) { _, newValue in
                    onCommit(newValue)
                }
                .onChange(of: value) { _, newValue in
                    draftValue = newValue
                }
        }
        .padding(10)
        .background(AppTheme.surfaceSunken, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
        .onAppear {
            draftValue = value
        }
    }
}

private struct EditablePercentField: View {
    let title: String
    let value: Double
    let isDisabled: Bool
    let onCommit: (Double) -> Void
    @State private var draftValue = 0.0

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title)
                .font(.caption2.weight(.semibold))
                .foregroundStyle(.secondary)

            TextField(title, value: $draftValue, format: .number.precision(.fractionLength(1)))
                .keyboardType(.decimalPad)
                .font(.caption.weight(.bold))
                .disabled(isDisabled)
                .onChange(of: draftValue) { _, newValue in
                    onCommit(newValue)
                }
                .onChange(of: value) { _, newValue in
                    draftValue = newValue
                }
        }
        .padding(10)
        .background(AppTheme.surfaceSunken, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
        .onAppear {
            draftValue = value
        }
    }
}

private struct SummaryChip: View {
    let title: String
    let value: String
    var tint: Color = .primary

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(value)
                .font(.caption.weight(.bold))
                .foregroundStyle(tint)
                .lineLimit(1)
                .minimumScaleFactor(0.72)

            Text(title)
                .font(.caption2.weight(.semibold))
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(10)
        .background(AppTheme.surfaceSunken, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
    }
}

private struct TemplateToast: View {
    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: "checkmark.circle.fill")
                .foregroundStyle(AppTheme.positive)

            Text("Starter budget added. You can edit anything.")
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(.primary)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .strokeBorder(AppTheme.border, lineWidth: 1)
        }
        .shadow(color: .black.opacity(0.12), radius: 18, x: 0, y: 10)
    }
}
