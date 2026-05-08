import PhotosUI
import SwiftData
import SwiftUI
import UniformTypeIdentifiers

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
    @State private var showingFileImporter = false
    @State private var lastScanSummary: String?
    @State private var lastScanTypeHint: String?
    @State private var lastScanAddress: String?
    @State private var lastScanPhone: String?
    /// For new expenses, show the scan hero first. Becomes false after the user
    /// scans, picks "Enter manually", or types into any field.
    @State private var showingScanHero: Bool
    @AppStorage(AppSettingsKeys.autoFillFromScans) private var autoFillFromScans = true

    init(project: Project, expense: Expense? = nil) {
        self.project = project
        expenseID = expense?.id
        _viewModel = StateObject(wrappedValue: ExpenseFormViewModel(expense: expense))
        _showingScanHero = State(initialValue: expense == nil)
    }

    init(project: Project, expenseID: UUID) {
        self.project = project
        self.expenseID = expenseID
        _viewModel = StateObject(wrappedValue: ExpenseFormViewModel())
        _showingScanHero = State(initialValue: false)
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
            Group {
                if showingScanHero {
                    scanHero
                } else {
                    expenseForm
                }
            }
            .navigationTitle(expenseID == nil ? "Add Expense" : "Edit Expense")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                if !showingScanHero {
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Save") { save() }.disabled(!viewModel.canSave)
                    }
                }
            }
            .onAppear {
                refreshData()
                loadExistingExpenseIfNeeded()
                seedDefaultDateForNewExpense()
                sanitizeBudgetSelection()
            }
            .sheet(isPresented: $showingScanner) {
                ReceiptCaptureView { result in
                    applyScan(result)
                }
                .ignoresSafeArea()
            }
            .fileImporter(
                isPresented: $showingFileImporter,
                allowedContentTypes: [.image],
                allowsMultipleSelection: false
            ) { result in
                handleFileImport(result)
            }
            .onChange(of: selectedPhotoItem) { _, newItem in
                handleLibraryPick(newItem)
            }
        }
    }

    /// Loads the picked image, runs OCR on it (so library imports get the same auto-fill
    /// as live scans), then applies the result.
    private func handleLibraryPick(_ item: PhotosPickerItem?) {
        guard let item else { return }
        Task {
            guard let data = try? await item.loadTransferable(type: Data.self) else { return }
            await scanReceiptImageData(data)
        }
    }

    private func handleFileImport(_ result: Result<[URL], Error>) {
        guard case let .success(urls) = result, let url = urls.first else { return }
        let isScoped = url.startAccessingSecurityScopedResource()
        defer {
            if isScoped {
                url.stopAccessingSecurityScopedResource()
            }
        }
        guard let data = try? Data(contentsOf: url) else { return }
        Task {
            await scanReceiptImageData(data)
        }
    }

    private func scanReceiptImageData(_ data: Data) async {
        guard let image = UIImage(data: data) else { return }
        let optimizedData = ImageDataProcessor.optimizedJPEGData(from: data, maxDimension: 2200, compressionQuality: 0.88) ?? data
        let optimizedImage = UIImage(data: optimizedData) ?? image

        let result: ScannedReceipt
        do {
            result = try await VisionReceiptScanner.scan(image: optimizedImage)
        } catch {
            result = ScannedReceipt(
                amount: nil, amountConfidence: 0,
                amountPaid: nil,
                vendorName: nil, vendorConfidence: 0,
                date: nil, dateConfidence: 0,
                dueDate: nil, documentReference: nil,
                paymentMethod: nil, paymentReference: nil,
                phoneNumber: nil, address: nil, isPaid: nil, vendorTypeHint: nil,
                imageData: optimizedData
            )
        }
        await MainActor.run { applyScan(result) }
    }

    private var scanHero: some View {
        ScrollView {
            VStack(spacing: AppTheme.Space.lg) {
                Spacer(minLength: AppTheme.Space.xl)

                VStack(spacing: AppTheme.Space.sm) {
                    ZStack {
                        Circle()
                            .fill(AppTheme.brandSoft)
                            .frame(width: 120, height: 120)
                        Image(systemName: "doc.viewfinder")
                            .font(.system(size: 48, weight: .semibold))
                            .foregroundStyle(AppTheme.brand)
                    }

                    Text("Scan a receipt")
                        .font(AppFont.title2)
                        .foregroundStyle(AppTheme.ink)

                    Text("We'll auto-fill the vendor, amount, date, phone and paid status. You can edit anything before saving.")
                        .font(AppFont.subheadline)
                        .foregroundStyle(AppTheme.inkSecondary)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, AppTheme.Space.lg)
                }

                VStack(spacing: AppTheme.Space.sm) {
                    Button {
                        showingScanner = true
                    } label: {
                        Label("Take Photo", systemImage: "camera")
                    }
                    .buttonStyle(PrimaryButtonStyle(fullWidth: true))

                    PhotosPicker(selection: $selectedPhotoItem, matching: .images) {
                        Label("Upload from Album", systemImage: "photo.on.rectangle")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(SecondaryButtonStyle(fullWidth: true))

                    Button {
                        showingFileImporter = true
                    } label: {
                        Label("Upload from Files", systemImage: "folder")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(SecondaryButtonStyle(fullWidth: true))
                }
                .padding(.horizontal, AppTheme.Space.lg)

                Button("Enter Manually") {
                    showingScanHero = false
                }
                .font(AppFont.subheadline.weight(.medium))
                .foregroundStyle(AppTheme.inkSecondary)

                Spacer()
            }
            .frame(maxWidth: .infinity)
            .padding(.horizontal, AppTheme.pagePadding)
        }
        .background(AppTheme.pageBackground)
    }

    private var expenseForm: some View {
        ModernForm {
            if let lastScanSummary {
                ScanResultBanner(
                    summary: lastScanSummary,
                    typeHint: lastScanTypeHint,
                    address: lastScanAddress,
                    phone: lastScanPhone
                )
            }

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

            ModernFormSection(
                "Payment",
                footer: "Paid fields are saved for reference but only count toward cash-paid metrics while Paid is on. Unpaid balances feed committed cash flow; pending exposure comes from pending change orders."
            ) {
                ModernField("Amount paid", subtitle: viewModel.isPaid ? nil : "Inactive while this expense is unpaid.") {
                    CurrencyField(value: $viewModel.amountPaid)
                        .modernTextField()
                }
                .disabled(!viewModel.isPaid)
                .opacity(viewModel.isPaid ? 1 : 0.58)

                Toggle("Paid Date", isOn: $viewModel.hasPaidDate)
                    .disabled(!viewModel.isPaid)
                    .font(.body.weight(.medium))

                if viewModel.hasPaidDate {
                    ModernField("Paid") {
                        DatePicker("Paid", selection: $viewModel.paidDate, displayedComponents: .date)
                            .labelsHidden()
                    }
                    .disabled(!viewModel.isPaid)
                    .opacity(viewModel.isPaid ? 1 : 0.58)
                }

                Toggle("Expected Payment", isOn: $viewModel.hasExpectedPaymentDate)
                    .disabled(viewModel.effectiveBalanceDue <= 0)
                    .font(.body.weight(.medium))

                if viewModel.effectiveBalanceDue > 0, viewModel.hasExpectedPaymentDate {
                    ModernField("Expected") {
                        DatePicker("Expected", selection: $viewModel.expectedPaymentDate, displayedComponents: .date)
                            .labelsHidden()
                    }
                }

                ModernField("Method") {
                    TextField("Check, ACH, card, cash", text: $viewModel.paymentMethod)
                        .textInputAutocapitalization(.words)
                        .modernTextField()
                }
                .disabled(!viewModel.isPaid)
                .opacity(viewModel.isPaid ? 1 : 0.58)

                ModernField("Reference") {
                    TextField("Check #, confirmation, memo", text: $viewModel.paymentReference)
                        .textInputAutocapitalization(.characters)
                        .modernTextField()
                }
                .disabled(!viewModel.isPaid)
                .opacity(viewModel.isPaid ? 1 : 0.58)
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

                VStack(spacing: 10) {
                    Button {
                        showingScanner = true
                    } label: {
                        Label("Take Photo", systemImage: "camera")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)

                    PhotosPicker(selection: $selectedPhotoItem, matching: .images) {
                        Label("Upload from Album", systemImage: "photo.on.rectangle")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.bordered)

                    Button {
                        showingFileImporter = true
                    } label: {
                        Label("Upload from Files", systemImage: "folder")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.bordered)
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
        .onChange(of: viewModel.budgetLineItemID) { _, _ in
            inheritRoomFromSelectedItemIfNeeded()
        }
        .onChange(of: viewModel.isPaid) { _, isPaid in
            if isPaid, viewModel.amountPaid <= 0 {
                viewModel.amountPaid = viewModel.amount
            }
        }
        .onChange(of: viewModel.hasDueDate) { _, hasDueDate in
            guard hasDueDate, viewModel.effectiveBalanceDue > 0 else { return }
            viewModel.expectedPaymentDate = viewModel.dueDate
            viewModel.hasExpectedPaymentDate = true
        }
        .onChange(of: viewModel.dueDate) { _, dueDate in
            guard viewModel.hasDueDate, viewModel.effectiveBalanceDue > 0 else { return }
            viewModel.expectedPaymentDate = dueDate
            viewModel.hasExpectedPaymentDate = true
        }
    }

    private func applyScan(_ scan: ScannedReceipt) {
        if let data = scan.imageData {
            viewModel.receiptImageData = data
        }
        // Capture extras for the post-scan banner regardless of auto-fill setting.
        lastScanTypeHint = scan.vendorTypeHint
        lastScanAddress = scan.address
        lastScanPhone = scan.phoneNumber

        defer { showingScanHero = false }

        guard autoFillFromScans, scan.anyExtraction else {
            lastScanSummary = scan.imageData != nil ?
                "Receipt captured. Auto-fill is off — fill in the fields manually." : nil
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
        if let dueDate = scan.dueDate, !viewModel.hasDueDate {
            viewModel.dueDate = dueDate
            viewModel.hasDueDate = true
            viewModel.expectedPaymentDate = dueDate
            viewModel.hasExpectedPaymentDate = true
            filled.append("due date")
        }
        if let reference = scan.documentReference, viewModel.invoiceNumber.trimmed.isEmpty {
            viewModel.invoiceNumber = reference
            filled.append("invoice/reference")
        }
        if let isPaid = scan.isPaid {
            viewModel.isPaid = isPaid
            filled.append(isPaid ? "marked paid" : "marked unpaid")
        }
        if let amountPaid = scan.amountPaid, viewModel.amountPaid <= 0 {
            viewModel.amountPaid = amountPaid
            filled.append("amount paid")
        } else if viewModel.isPaid, viewModel.amountPaid <= 0, viewModel.amount > 0 {
            viewModel.amountPaid = viewModel.amount
            filled.append("amount paid")
        }
        if let method = scan.paymentMethod, viewModel.paymentMethod.trimmed.isEmpty {
            viewModel.paymentMethod = method
            filled.append("payment method")
        }
        if let reference = scan.paymentReference, viewModel.paymentReference.trimmed.isEmpty {
            viewModel.paymentReference = reference
            filled.append("payment reference")
        }
        if viewModel.hasDueDate, viewModel.effectiveBalanceDue > 0, !viewModel.hasExpectedPaymentDate {
            viewModel.expectedPaymentDate = viewModel.dueDate
            viewModel.hasExpectedPaymentDate = true
        }

        if filled.isEmpty {
            lastScanSummary = "Receipt captured. Review fields below."
        } else {
            lastScanSummary = "Filled in \(filled.joined(separator: ", ")). Review before saving."
            Haptics.success()
        }
    }

    private func save() {
        guard let selectedItem else { return }
        ensureVendorExists(
            named: viewModel.vendorName,
            trade: selectedItem.categoryName,
            phone: lastScanPhone,
            address: lastScanAddress
        )

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
            saveAndDismiss {
                mirrorReceiptToDisk(for: expenseToEdit)
            }
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
        saveAndDismiss {
            mirrorReceiptToDisk(for: expense)
        }
    }

    private func mirrorReceiptToDisk(for expense: Expense) {
        guard let data = expense.receiptImageData else { return }
        MediaStorageService.saveReceipt(data: data, project: project, expense: expense)
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
            inheritRoomFromSelectedItemIfNeeded()
            return
        }

        viewModel.budgetLineItemID = items.first?.id
        inheritRoomFromSelectedItemIfNeeded()
    }

    private func inheritRoomFromSelectedItemIfNeeded() {
        guard let selectedItem else { return }
        viewModel.roomTag = selectedItem.roomTag
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

    private func ensureVendorExists(named name: String, trade: String, phone: String? = nil, address: String? = nil) {
        let cleanedName = name.trimmed
        guard !cleanedName.isEmpty else { return }

        // Existing vendors keep their trade and contact info — don't overwrite from a single scan.
        if vendors.contains(where: { $0.name.trimmed.caseInsensitiveCompare(cleanedName) == .orderedSame }) {
            return
        }

        let notes = address?.trimmed.isEmpty == false ? "Address: \(address!.trimmed)" : ""
        let vendor = Vendor(
            projectID: project.id,
            name: cleanedName,
            trade: trade,
            phone: (phone ?? "").trimmed,
            email: "",
            notes: notes
        )
        modelContext.insert(vendor)
        vendors.append(vendor)
    }

    private func saveAndDismiss(afterSave: (() -> Void)? = nil) {
        do {
            try modelContext.save()
            afterSave?()
            Haptics.success()
            dismiss()
        } catch {
            Haptics.warning()
            modelContext.safeRollback()
        }
    }
}

private struct ScanResultBanner: View {
    let summary: String
    let typeHint: String?
    let address: String?
    let phone: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 8) {
                Image(systemName: "sparkles")
                    .font(.caption.weight(.bold))
                Text(summary)
                    .font(AppFont.caption)
            }
            .foregroundStyle(AppTheme.brand)

            // Extras the form has no field for — surfaced inline so they aren't lost.
            VStack(alignment: .leading, spacing: 2) {
                if let typeHint {
                    Label(typeHint, systemImage: "tag")
                }
                if let phone, !phone.isEmpty {
                    Label(phone, systemImage: "phone")
                }
                if let address, !address.isEmpty {
                    Label(address, systemImage: "mappin.and.ellipse")
                        .lineLimit(2)
                }
            }
            .font(AppFont.caption2)
            .foregroundStyle(AppTheme.inkSecondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(
            RoundedRectangle(cornerRadius: AppTheme.Radius.md, style: .continuous)
                .fill(AppTheme.brandSoft)
        )
    }
}
