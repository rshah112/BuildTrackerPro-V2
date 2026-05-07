import SwiftData
import SwiftUI

struct AddBudgetItemView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.modelContext) private var modelContext
    let project: Project

    @Query private var categories: [BudgetCategory]
    @Query private var items: [BudgetLineItem]

    @State private var costCode = ""
    @State private var title = ""
    @State private var selectedCategoryID: UUID?
    @State private var newCategoryName = ""
    @State private var budget = 0.0
    @State private var committed = 0.0
    @State private var notes = ""
    @State private var saveErrorMessage: String?

    init(project: Project) {
        self.project = project
        let projectID = project.id
        _categories = Query(filter: #Predicate<BudgetCategory> { $0.projectID == projectID }, sort: \.sortOrder)
        _items = Query(filter: #Predicate<BudgetLineItem> { $0.projectID == projectID }, sort: \.costCode)
    }

    private var selectedCategory: BudgetCategory? {
        guard let selectedCategoryID else { return nil }
        return categories.first { $0.id == selectedCategoryID }
    }

    private var resolvedCategoryName: String {
        let newName = newCategoryName.trimmed
        if !newName.isEmpty {
            return newName
        }
        return selectedCategory?.name ?? ""
    }

    private var canSave: Bool {
        !costCode.trimmed.isEmpty && !title.trimmed.isEmpty && !resolvedCategoryName.isEmpty && !hasDuplicateCostCode
    }

    private var hasDuplicateCostCode: Bool {
        let normalizedCode = costCode.trimmed
        guard !normalizedCode.isEmpty else { return false }
        return items.contains { $0.costCode.trimmed.caseInsensitiveCompare(normalizedCode) == .orderedSame }
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
            ModernForm {
                ModernFormSection("Item") {
                    ModernField("Cost code", subtitle: "Must be unique within this project.") {
                        TextField("e.g. 3210", text: $costCode)
                            .textInputAutocapitalization(.characters)
                            .modernTextField()
                    }

                    ModernField("Title") {
                        TextField("e.g. Garage doors", text: $title)
                            .textInputAutocapitalization(.words)
                            .modernTextField()
                    }

                    if hasDuplicateCostCode {
                        Label("That cost code is already used in this project.", systemImage: "exclamationmark.triangle.fill")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(AppTheme.negative)
                    }
                }

                ModernFormSection("Category") {
                    ModernField("Use existing category") {
                        Picker("Category", selection: $selectedCategoryID) {
                            ForEach(categories) { category in
                                Text(category.name).tag(Optional(category.id))
                            }
                        }
                        .pickerStyle(.menu)
                    }

                    ModernField("Or create new category") {
                        TextField("Leave blank to use selected category", text: $newCategoryName)
                            .textInputAutocapitalization(.words)
                            .modernTextField()
                    }
                }

                ModernFormSection(
                    "Budget",
                    footer: "Use committed only when this item already has a signed contract or known commitment."
                ) {
                    ModernField("Estimated budget", subtitle: "The planned allowance for this line item.") {
                        CurrencyField(value: $budget)
                            .modernTextField()
                    }

                    ModernField("Committed / contracted", subtitle: "Known contracted amount that is not fully paid yet.") {
                        CurrencyField(value: $committed)
                            .modernTextField()
                    }
                }

                ModernFormSection("Notes") {
                    ModernField("Notes") {
                        TextField("Optional details", text: $notes, axis: .vertical)
                            .lineLimit(3 ... 6)
                            .modernTextField()
                    }
                }
            }
            .navigationTitle("Add Budget Item")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }

                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        save()
                    }
                    .disabled(!canSave)
                }
            }
            .onAppear {
                selectedCategoryID = selectedCategoryID ?? categories.first?.id
                costCode = costCode.isEmpty ? suggestedCostCode : costCode
            }
            .alert("Budget Item Could Not Be Saved", isPresented: saveErrorBinding) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(saveErrorMessage ?? "Please try again.")
            }
        }
    }

    private var suggestedCostCode: String {
        // Exclude contingency-range codes (9000+) so the suggestion stays in the construction range.
        let numbers = items
            .filter { $0.categoryName.trimmed.caseInsensitiveCompare("Contingency") != .orderedSame }
            .compactMap { Int($0.costCode) }
            .filter { $0 < 9000 }
        let next = (numbers.max() ?? 3000) + 1
        return String(format: "%04d", min(next, 8999))
    }

    private func save() {
        guard !hasDuplicateCostCode else {
            saveErrorMessage = "Cost code \(costCode.trimmed) already exists in this project. Use a unique code so expenses and reports stay accurate."
            Haptics.warning()
            return
        }

        let categoryName = resolvedCategoryName

        if !newCategoryName.trimmed.isEmpty,
           categories.contains(where: { $0.name.caseInsensitiveCompare(categoryName) == .orderedSame }) == false
        {
            let category = BudgetCategory(
                projectID: project.id,
                name: categoryName,
                sortOrder: (categories.map(\.sortOrder).max() ?? 0) + 1,
                targetBudget: budget,
                systemImage: "folder"
            )
            modelContext.insert(category)
        }

        let item = BudgetLineItem(
            projectID: project.id,
            costCode: costCode.trimmed,
            title: title.trimmed,
            categoryName: categoryName,
            budget: budget,
            committed: committed,
            notes: notes.trimmed
        )
        modelContext.insert(item)
        do {
            try modelContext.save()
            Haptics.success()
            dismiss()
        } catch {
            modelContext.rollback()
            saveErrorMessage = error.localizedDescription
            Haptics.warning()
        }
    }
}
