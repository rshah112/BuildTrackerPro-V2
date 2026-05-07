import PhotosUI
import SwiftData
import SwiftUI

struct AddExpenseView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.modelContext) private var modelContext
    let project: Project
    let expenseID: UUID?

    @StateObject private var viewModel: ExpenseFormViewModel
    @State private var items: [BudgetLineItem] = []
    @State private var vendors: [Vendor] = []
    @State private var selectedPhotoItem: PhotosPickerItem?
    @State private var showingScanner = false
    @State private var lastScanSummary: String?
    @AppStorage(AppSettingsKeys.autoFillFromScans) private var autoFillFromScans = true

    init(project: Project, expense: Expense? = nil) {
        self.project = project
        expenseID = expense?.id
        _viewModel = StateObject(wrappedValue: ExpenseFormViewModel(expense: expense))
    }

    init(project: Project, expenseID: UUID) {
        self.project = project
        self.expenseID = expenseID
        _viewModel = StateObject(wrappedValue: ExpenseFormViewModel())
    }

    private var selectedItem: BudgetLineItem? {
        guard let id = viewModel.budgetLineItemID else { return nil }
        return items.first { $0.id == id }
    }

    private var groupedItems: [(category: String, items: [BudgetLineItem])] {
        Dictionary(grouping: items, by: \.categoryName)
            .map { category, items in
                (
                    category,
                    items.sorted { $0.costCode.localizedStandardCompare($1.costCode) == .orderedAscending }
                )
            }
            .sorted { $0.category.localizedStandardCompare($1.category) == .orderedAscending }
    }

    private var vendorSuggestions: [Vendor] {
        let query = viewModel.vendorName.trimmed.localizedLowercase
        let sorted = vendors.sorted { $0.name.localizedStandardCompare($1.name) == .orderedAscending }

        guard !query.isEmpty else {
            return Array(sorted.prefix(4))
        }

        return Array(sorted.filter { vendor in
            vendor.name.localizedLowercase.contains(query) ||
                vendor.trade.localizedLowercase.contains(query)
        }.prefix(4))
    }

    var body: some View {
        NavigationStack {
            ModernForm {
                ModernFormSection("Amount") {
                    CurrencyField(value: $viewModel.amount, displayStyle: .hero)
                        .padding(.vertical, 8)
                }

                ModernFormSection("Details") {
                    ModernField("Vendor") {
                        TextField("Vendor name", text: $viewModel.vendorName)
                            .textInputAutocapitalization(.words)
                            .modernTextField()
                    }

                    if !vendorSuggestions.isEmpty {
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 8) {
                                ForEach(vendorSuggestions) { vendor in
                                    Button {
                                        viewModel.vendorName = vendor.name
                                        Haptics.lightTap()
                                    } label: {
                                        VStack(alignment: .leading, spacing: 2) {
                                            Text(vendor.name)
                                                .font(.caption.weight(.bold))
                                                .lineLimit(1)
                                            if !vendor.trade.trimmed.isEmpty {
                                                Text(vendor.trade)
                                                    .font(.caption2.weight(.semibold))
                                                    .foregroundStyle(.secondary)
                                                    .lineLimit(1)
                                            }
                                        }
                                        .padding(.horizontal, 10)
                                        .padding(.vertical, 8)
                                        .background(AppTheme.cardBackground, in: Capsule())
                                        .overlay {
                                            Capsule()
                                                .strokeBorder(AppTheme.border, lineWidth: 1)
                                        }
                                    }
                                    .buttonStyle(.plain)
                                }
                            }
                        }
                    }

                    ModernField("Invoice #") {
                        TextField("Optional", text: $viewModel.invoiceNumber)
                            .textInputAutocapitalization(.characters)
                            .modernTextField()
                    }

                    ModernField("Date") {
                        DatePicker("Date", selection: $viewModel.date, displayedComponents: .date)
                            .labelsHidden()
                    }

                    Toggle("Due Date", isOn: $viewModel.hasDueDate)
                        .font(.body.weight(.medium))

                    if viewModel.hasDueDate {
                        ModernField("Due") {
                            DatePicker("Due", selection: $viewModel.dueDate, displayedComponents: .date)
                                .labelsHidden()
                        }
                    }

                    ModernField("Budget item", subtitle: "Expense totals update the selected budget item and dashboard.") {
                        if items.isEmpty {
                            Label(
                                "Add at least one budget line item before recording expenses.",
                                systemImage: "exclamationmark.triangle.fill"
                            )
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(AppTheme.negative)
                        } else {
                            Picker("Budget item", selection: $viewModel.budgetLineItemID) {
                                ForEach(groupedItems, id: \.category) { group in
                                    Section(group.category) {
                                        ForEach(group.items) { item in
                                            Text("\(item.costCode)  \(item.title)")
                                                .tag(Optional(item.id))
                                        }
                                    }
                                }
                            }
                            .pickerStyle(.menu)
                        }
                    }

                    Toggle("Paid", isOn: $viewModel.isPaid)
                        .font(.body.weight(.medium))
                }

                ModernFormSection("Payment") {
                    ModernField("Amount paid") {
                        CurrencyField(value: $viewModel.amountPaid)
                            .modernTextField()
                    }

                    Toggle("Paid Date", isOn: $viewModel.hasPaidDate)
                        .disabled(!viewModel.isPaid)
                        .font(.body.weight(.medium))

                    if viewModel.isPaid, viewModel.hasPaidDate {
                        ModernField("Paid") {
                            DatePicker("Paid", selection: $viewModel.paidDate, displayedComponents: .date)
                                .labelsHidden()
                        }
                    }

                    ModernField("Method") {
                        TextField("Check, ACH, card, cash", text: $viewModel.paymentMethod)
                            .textInputAutocapitalization(.words)
                            .modernTextField()
                    }

                    ModernField("Reference") {
                        TextField("Check #, confirmation, memo", text: $viewModel.paymentReference)
                            .textInputAutocapitalization(.characters)
                            .modernTextField()
                    }
                }

                ModernFormSection("Receipt") {
                    if let lastScanSummary {
                        HStack(spacing: 8) {
                            Image(systemName: "sparkles")
                                .font(.caption.weight(.bold))
                            Text(lastScanSummary)
                                .font(AppFont.caption)
                                .lineLimit(2)
                        }
                        .foregroundStyle(AppTheme.brand)
                        .padding(10)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(
                            RoundedRectangle(cornerRadius: AppTheme.Radius.sm, style: .continuous)
                                .fill(AppTheme.brandSoft)
                        )
                    }

                    HStack(spacing: 12) {
                        PhotosPicker(selection: $selectedPhotoItem, matching: .images) {
                            Label("Library", systemImage: "photo")
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.bordered)

                        Button {
                            showingScanner = true
                        } label: {
                            Label("Scan Receipt", systemImage: "doc.viewfinder")
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.borderedProminent)
                    }

                    if viewModel.receiptImageData != nil {
                        PhotoThumbnail(data: viewModel.receiptImageData)
                            .frame(height: 180)
                            .padding(.vertical, 4)
                    }
                }

                ModernFormSection("Notes") {
                    ModernField("Notes") {
                        TextField("Optional details", text: $viewModel.notes, axis: .vertical)
                            .lineLimit(3 ... 6)
                            .modernTextField()
                    }
                }
            }
            .navigationTitle(expenseID == nil ? "Add Expense" : "Edit Expense")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        dismiss()
                    }
                }

                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        save()
                    }
                    .disabled(!viewModel.canSave)
                }
            }
            .onAppear {
                refreshData()
                loadExistingExpenseIfNeeded()
                seedDefaultDateForNewExpense()
                sanitizeBudgetSelection()
            }
            .onChange(of: selectedPhotoItem) { _, newItem in
                Task {
                    guard let data = try? await newItem?.loadTransferable(type: Data.self) else { return }
                    let optimized = ImageDataProcessor.optimizedJPEGData(from: data, maxDimension: 1400, compressionQuality: 0.82)
                    await MainActor.run {
                        viewModel.receiptImageData = optimized ?? data
                    }
                }
            }
            .onChange(of: viewModel.isPaid) { _, isPaid in
                if isPaid, viewModel.amountPaid <= 0 {
                    viewModel.amountPaid = viewModel.amount
                }
                if !isPaid {
                    viewModel.hasPaidDate = false
                }
            }
            .sheet(isPresented: $showingScanner) {
                ReceiptCaptureView { result in
                    applyScan(result)
                }
                .ignoresSafeArea()
            }
        }
    }

    private func applyScan(_ scan: ScannedReceipt) {
        if let data = scan.imageData {
            viewModel.receiptImageData = data
        }
        guard autoFillFromScans, scan.anyExtraction else {
            lastScanSummary = scan.imageData != nil ? "Receipt captured. Auto-fill is off — fill in the fields manually." : nil
            return
        }

        var filled: [String] = []
        if let amount = scan.amount, viewModel.amount <= 0 {
            viewModel.amount = amount
            filled.append("amount")
        }
        if let vendor = scan.vendorName, viewModel.vendorName.trimmed.isEmpty {
            viewModel.vendorName = vendor
            filled.append("vendor")
        }
        if let date = scan.date {
            viewModel.date = date
            filled.append("date")
        }

        if filled.isEmpty {
            lastScanSummary = "Receipt captured but nothing new to fill in."
        } else {
            lastScanSummary = "Filled in \(filled.joined(separator: ", ")) from the scan. Review before saving."
            Haptics.success()
        }
    }

    private func save() {
        guard let selectedItem else { return }
        ensureVendorExists(named: viewModel.vendorName, trade: selectedItem.categoryName)

        if let expenseID {
            guard let expenseToEdit = fetchExpense(withID: expenseID) else {
                Haptics.warning()
                return
            }
            viewModel.apply(to: expenseToEdit, projectID: project.id, for: selectedItem)
            BudgetMathService.recalculateActuals(
                for: project.id,
                items: fetchBudgetItems(),
                expenses: fetchExpenses(),
                changeOrders: fetchChangeOrders()
            )
            saveAndDismiss()
            return
        }

        let expense = viewModel.makeExpense(projectID: project.id, for: selectedItem)
        modelContext.insert(expense)
        BudgetMathService.recalculateActuals(
            for: project.id,
            items: fetchBudgetItems(),
            expenses: fetchExpenses(including: expense),
            changeOrders: fetchChangeOrders()
        )
        saveAndDismiss()
    }

    private func refreshData() {
        items = fetchBudgetItems()
        vendors = fetchVendors()
    }

    private func loadExistingExpenseIfNeeded() {
        guard let expenseID, let expense = fetchExpense(withID: expenseID) else { return }
        viewModel.load(from: expense)
    }

    /// For NEW expenses, default the date to the most recent existing expense in this project
    /// (typical workflow: logging a batch from a single jobsite day).
    private func seedDefaultDateForNewExpense() {
        guard expenseID == nil, let mostRecent = fetchExpenses().map(\.date).max() else { return }
        viewModel.date = mostRecent
    }

    private func sanitizeBudgetSelection() {
        if let selectedID = viewModel.budgetLineItemID,
           items.contains(where: { $0.id == selectedID })
        {
            return
        }

        viewModel.budgetLineItemID = items.first?.id
    }

    private func fetchBudgetItems() -> [BudgetLineItem] {
        let projectID = project.id
        let descriptor = FetchDescriptor<BudgetLineItem>(
            predicate: #Predicate { $0.projectID == projectID },
            sortBy: [SortDescriptor(\.costCode)]
        )
        return (try? modelContext.fetch(descriptor)) ?? []
    }

    private func fetchExpenses() -> [Expense] {
        let projectID = project.id
        let descriptor = FetchDescriptor<Expense>(
            predicate: #Predicate { $0.projectID == projectID },
            sortBy: [SortDescriptor(\.date, order: .reverse)]
        )
        return (try? modelContext.fetch(descriptor)) ?? []
    }

    private func fetchExpense(withID expenseID: UUID) -> Expense? {
        let projectID = project.id
        let descriptor = FetchDescriptor<Expense>(
            predicate: #Predicate { $0.id == expenseID && $0.projectID == projectID }
        )
        return try? modelContext.fetch(descriptor).first
    }

    private func fetchExpenses(including expense: Expense) -> [Expense] {
        let existing = fetchExpenses()
        guard !existing.contains(where: { $0.id == expense.id }) else { return existing }
        return existing + [expense]
    }

    private func fetchChangeOrders() -> [ChangeOrder] {
        let projectID = project.id
        let descriptor = FetchDescriptor<ChangeOrder>(
            predicate: #Predicate { $0.projectID == projectID },
            sortBy: [SortDescriptor(\.createdAt, order: .reverse)]
        )
        return (try? modelContext.fetch(descriptor)) ?? []
    }

    private func fetchVendors() -> [Vendor] {
        let projectID = project.id
        let descriptor = FetchDescriptor<Vendor>(
            predicate: #Predicate { $0.projectID == projectID },
            sortBy: [SortDescriptor(\.name)]
        )
        return (try? modelContext.fetch(descriptor)) ?? []
    }

    private func ensureVendorExists(named name: String, trade: String) {
        let cleanedName = name.trimmed
        guard !cleanedName.isEmpty else { return }

        // Existing vendors keep their trade — don't overwrite from an unrelated category.
        if vendors.contains(where: { $0.name.trimmed.caseInsensitiveCompare(cleanedName) == .orderedSame }) {
            return
        }

        let vendor = Vendor(projectID: project.id, name: cleanedName, trade: trade)
        modelContext.insert(vendor)
        vendors.append(vendor)
    }

    private func saveAndDismiss() {
        do {
            try modelContext.save()
            Haptics.success()
            dismiss()
        } catch {
            Haptics.warning()
            modelContext.safeRollback()
        }
    }
}
