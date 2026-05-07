import SwiftData
import SwiftUI

struct BudgetDetailView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.modelContext) private var modelContext

    let itemID: UUID
    let projectID: UUID

    @Query private var expenses: [Expense]
    @Query private var photos: [PhotoAttachment]
    @Query private var projectItems: [BudgetLineItem]

    @State private var costCode: String
    @State private var title: String
    @State private var categoryName: String
    @State private var budget: Double
    @State private var committed: Double
    @State private var notes: String
    @State private var isPinned: Bool
    @State private var saveErrorMessage: String?

    init(item: BudgetLineItem) {
        itemID = item.id
        projectID = item.projectID
        let itemID = item.id
        let projectID = item.projectID
        _expenses = Query(
            filter: #Predicate<Expense> { $0.projectID == projectID && $0.budgetLineItemID == itemID },
            sort: \.date,
            order: .reverse
        )
        _photos = Query(
            filter: #Predicate<PhotoAttachment> { $0.projectID == projectID && $0.budgetLineItemID == itemID },
            sort: \.createdAt,
            order: .reverse
        )
        _projectItems = Query(filter: #Predicate<BudgetLineItem> { $0.projectID == projectID }, sort: \.costCode)
        _costCode = State(initialValue: item.costCode)
        _title = State(initialValue: item.title)
        _categoryName = State(initialValue: item.categoryName)
        _budget = State(initialValue: item.budget)
        _committed = State(initialValue: item.committed)
        _notes = State(initialValue: item.notes)
        _isPinned = State(initialValue: item.isPinned)
    }

    private var linkedExpenses: [Expense] {
        expenses
    }

    private var linkedPhotos: [PhotoAttachment] {
        photos
    }

    private var actual: Double {
        projectItems.first(where: { $0.id == itemID })?.actual ?? 0
    }

    private var openCommitment: Double {
        max(0, committed - actual)
    }

    private var spentAndCommitted: Double {
        actual + openCommitment
    }

    private var remaining: Double {
        budget - spentAndCommitted
    }

    private var variance: Double {
        spentAndCommitted - budget
    }

    private var utilization: Double {
        guard budget > 0 else { return 0 }
        return spentAndCommitted / budget
    }

    private var health: BudgetHealth {
        if variance > 0 {
            return .overBudget
        }

        if utilization >= 0.9 {
            return .nearLimit
        }

        return .healthy
    }

    private var hasDuplicateCostCode: Bool {
        let normalizedCode = costCode.trimmed
        guard !normalizedCode.isEmpty else { return false }
        return projectItems.contains {
            $0.id != itemID && $0.costCode.trimmed.caseInsensitiveCompare(normalizedCode) == .orderedSame
        }
    }

    var body: some View {
        ModernForm {
            ModernFormSection("Status") {
                VStack(alignment: .leading, spacing: 14) {
                    HStack {
                        Text(costCode)
                            .font(.caption.weight(.bold))
                            .foregroundStyle(AppTheme.healthColor(health))
                            .padding(.horizontal, 8)
                            .padding(.vertical, 5)
                            .background(
                                AppTheme.healthColor(health).opacity(0.14),
                                in: RoundedRectangle(cornerRadius: 6, style: .continuous)
                            )

                        Spacer()

                        BudgetHealthPill(health: health)
                    }

                    Text(title)
                        .font(.title2.weight(.bold))

                    BudgetProgressBar(value: utilization, tint: AppTheme.healthColor(health))
                }
                .padding(.vertical, 6)
            }

            ModernFormSection("Financials") {
                LabeledContent("Budget", value: budget.currencyString)
                LabeledContent("Actual", value: actual.currencyString)
                LabeledContent("Committed Contract", value: committed.currencyString)
                LabeledContent("Open Commitment", value: openCommitment.currencyString)
                LabeledContent("Remaining", value: remaining.currencyString)
                LabeledContent("Variance", value: variance.signedCurrencyString)
            }

            ModernFormSection("Edit") {
                ModernField("Cost code", subtitle: "Must be unique within this project.") {
                    TextField("e.g. 3210", text: $costCode)
                        .textInputAutocapitalization(.characters)
                        .modernTextField()
                }

                if hasDuplicateCostCode {
                    Label("That cost code is already used in this project.", systemImage: "exclamationmark.triangle.fill")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(AppTheme.negative)
                }

                ModernField("Title") {
                    TextField("Line item title", text: $title)
                        .textInputAutocapitalization(.words)
                        .modernTextField()
                }

                ModernField("Estimated budget") {
                    TextField("$0", value: $budget, format: .currency(code: "USD"))
                        .keyboardType(.decimalPad)
                        .modernTextField()
                }

                ModernField("Committed / contracted") {
                    TextField("$0", value: $committed, format: .currency(code: "USD"))
                        .keyboardType(.decimalPad)
                        .modernTextField()
                }

                Toggle("Pinned", isOn: $isPinned)
                    .font(.body.weight(.medium))

                ModernField("Notes") {
                    TextField("Optional details", text: $notes, axis: .vertical)
                        .lineLimit(3 ... 6)
                        .modernTextField()
                }
            }

            ModernFormSection("Expenses") {
                if linkedExpenses.isEmpty {
                    Text("No expenses attached")
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(linkedExpenses) { expense in
                        HStack {
                            VStack(alignment: .leading, spacing: 3) {
                                Text(expense.vendorName)
                                    .font(.subheadline.weight(.semibold))
                                Text(expense.date.shortDateString)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }

                            Spacer()

                            Text(expense.amount.currencyString)
                                .font(.subheadline.weight(.bold))
                        }
                    }
                }
            }

            ModernFormSection("Photos") {
                if linkedPhotos.isEmpty {
                    Text("No photos attached")
                        .foregroundStyle(.secondary)
                } else {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 10) {
                            ForEach(linkedPhotos) { photo in
                                PhotoThumbnail(data: photo.imageData)
                                    .frame(width: 112, height: 124)
                            }
                        }
                        .padding(.vertical, 4)
                    }
                }
            }
        }
        .navigationTitle(categoryName)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                Button("Save") {
                    save()
                }
                .disabled(title.trimmed.isEmpty || costCode.trimmed.isEmpty || hasDuplicateCostCode)
            }
        }
        .alert("Budget Item Could Not Be Saved", isPresented: saveErrorBinding) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(saveErrorMessage ?? "Please try again.")
        }
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

    private func save() {
        guard !hasDuplicateCostCode else {
            saveErrorMessage = "Cost code \(costCode.trimmed) already exists in this project. Use a unique code so expenses and reports stay accurate."
            Haptics.warning()
            return
        }

        guard let item = fetchItem() else {
            saveErrorMessage = "This budget item no longer exists."
            Haptics.warning()
            return
        }

        item.costCode = costCode.trimmed
        item.title = title.trimmed
        item.budget = max(0, budget)
        item.committed = max(0, committed)
        item.notes = notes.trimmed
        item.isPinned = isPinned

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

    private func fetchItem() -> BudgetLineItem? {
        let descriptor = FetchDescriptor<BudgetLineItem>(
            predicate: #Predicate { $0.id == itemID && $0.projectID == projectID }
        )
        return try? modelContext.fetch(descriptor).first
    }
}
