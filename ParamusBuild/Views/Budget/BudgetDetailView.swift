import PhotosUI
import SwiftData
import SwiftUI
import UniformTypeIdentifiers

struct BudgetDetailView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.modelContext) private var modelContext

    let itemID: UUID
    let projectID: UUID

    @Query private var expenses: [Expense]
    @Query private var photos: [PhotoAttachment]
    @Query private var projectItems: [BudgetLineItem]
    @Query private var allowanceSelections: [AllowanceSelection]

    @State private var costCode: String
    @State private var title: String
    @State private var categoryName: String
    @State private var budget: Double
    @State private var committed: Double
    @State private var notes: String
    @State private var isPinned: Bool
    @State private var isAllowance: Bool
    @State private var allowanceAmount: Double
    @State private var showingAddSelection = false
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
        _allowanceSelections = Query(
            filter: #Predicate<AllowanceSelection> { $0.projectID == projectID && $0.lineItemID == itemID },
            sort: \.selectionDate,
            order: .reverse
        )
        _costCode = State(initialValue: item.costCode)
        _title = State(initialValue: item.title)
        _categoryName = State(initialValue: item.categoryName)
        _budget = State(initialValue: item.budget)
        _committed = State(initialValue: item.committed)
        _notes = State(initialValue: item.notes)
        _isPinned = State(initialValue: item.isPinned)
        _isAllowance = State(initialValue: item.isAllowance)
        _allowanceAmount = State(initialValue: item.allowanceAmount > 0 ? item.allowanceAmount : item.budget)
    }

    private var linkedExpenses: [Expense] {
        expenses
    }

    private var linkedPhotos: [PhotoAttachment] {
        photos
    }

    private var currentItem: BudgetLineItem? {
        projectItems.first(where: { $0.id == itemID })
    }

    private var linkedExpenseActual: Double {
        linkedExpenses.reduce(0) { $0 + $1.amount }
    }

    private var allowanceActual: Double {
        let selectionActual = allowanceSelections.reduce(0) { $0 + $1.amount }
        return allowanceSelections.isEmpty ? linkedExpenseActual : selectionActual
    }

    private var actual: Double {
        isAllowance ? allowanceActual : currentItem?.actual ?? 0
    }

    private var openCommitment: Double {
        isAllowance ? 0 : max(0, committed - actual)
    }

    private var spentAndCommitted: Double {
        actual + openCommitment
    }

    private var limitAmount: Double {
        isAllowance ? allowanceAmount : budget
    }

    private var remaining: Double {
        limitAmount - spentAndCommitted
    }

    private var variance: Double {
        isAllowance ? max(0, actual - allowanceAmount) : spentAndCommitted - budget
    }

    private var utilization: Double {
        guard limitAmount > 0 else { return 0 }
        return spentAndCommitted / limitAmount
    }

    private var health: BudgetHealth {
        if variance > 0 { return .overBudget }
        if utilization >= 0.9 { return .nearLimit }
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

                        if isAllowance {
                            Text("Allowance")
                                .font(.caption.weight(.bold))
                                .foregroundStyle(AppTheme.info)
                                .padding(.horizontal, 8)
                                .padding(.vertical, 5)
                                .background(AppTheme.info.opacity(0.12), in: RoundedRectangle(cornerRadius: 6, style: .continuous))
                        }

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
                if isAllowance {
                    LabeledContent("Allowance", value: allowanceAmount.currencyString)
                    LabeledContent("Selections", value: actual.currencyString)
                    LabeledContent("Remaining", value: remaining.currencyString)
                    LabeledContent("Overage", value: variance.currencyString)
                } else {
                    LabeledContent("Budget", value: budget.currencyString)
                    LabeledContent("Actual", value: actual.currencyString)
                    LabeledContent("Committed Contract", value: committed.currencyString)
                    LabeledContent("Open Commitment", value: openCommitment.currencyString)
                    LabeledContent("Remaining", value: remaining.currencyString)
                    LabeledContent("Variance", value: variance.signedCurrencyString)
                }
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

                Toggle("Allowance", isOn: $isAllowance)
                    .font(.body.weight(.medium))

                ModernField(isAllowance ? "Allowance amount" : "Estimated budget") {
                    CurrencyField(value: isAllowance ? $allowanceAmount : $budget)
                        .modernTextField()
                }

                if isAllowance {
                    ModernField("Budget baseline", subtitle: "Used for category rollups and exports.") {
                        CurrencyField(value: $budget)
                            .modernTextField()
                    }
                }

                ModernField("Committed / contracted") {
                    CurrencyField(value: $committed)
                        .modernTextField()
                        .disabled(isAllowance)
                        .opacity(isAllowance ? 0.45 : 1)
                }

                Toggle("Pinned", isOn: $isPinned)
                    .font(.body.weight(.medium))

                ModernField("Notes") {
                    TextField("Optional details", text: $notes, axis: .vertical)
                        .lineLimit(3 ... 6)
                        .modernTextField()
                }
            }

            if isAllowance {
                selectionsSection
            } else {
                expensesSection
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
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    isPinned.toggle()
                    Haptics.lightTap()
                } label: {
                    Image(systemName: isPinned ? "pin.fill" : "pin")
                }
                .accessibilityLabel(isPinned ? "Unpin item" : "Pin item")
            }
            ToolbarItem(placement: .confirmationAction) {
                Button("Save") {
                    save()
                }
                .disabled(title.trimmed.isEmpty || costCode.trimmed.isEmpty || hasDuplicateCostCode)
            }
        }
        .onChange(of: isAllowance) { _, newValue in
            if newValue, allowanceAmount <= 0 {
                allowanceAmount = budget
            }
        }
        .sheet(isPresented: $showingAddSelection) {
            AddAllowanceSelectionView(projectID: projectID, lineItemID: itemID) { selection in
                save(selection: selection)
            }
        }
        .alert("Budget Item Could Not Be Saved", isPresented: saveErrorBinding) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(saveErrorMessage ?? "Please try again.")
        }
    }

    private var selectionsSection: some View {
        ModernFormSection("Selections") {
            Button {
                showingAddSelection = true
            } label: {
                Label("Add Selection", systemImage: "plus.circle.fill")
                    .frame(maxWidth: .infinity, alignment: .leading)
            }

            if allowanceSelections.isEmpty {
                Text("No selections recorded")
                    .foregroundStyle(.secondary)
            } else {
                ForEach(allowanceSelections) { selection in
                    HStack(spacing: 12) {
                        if selection.photoData != nil {
                            PhotoThumbnail(data: selection.photoData, cornerRadius: 6)
                                .frame(width: 44, height: 44)
                        } else {
                            Image(systemName: "checklist")
                                .font(.headline.weight(.semibold))
                                .foregroundStyle(AppTheme.info)
                                .frame(width: 44, height: 44)
                                .background(AppTheme.info.opacity(0.12), in: RoundedRectangle(cornerRadius: 6, style: .continuous))
                        }

                        VStack(alignment: .leading, spacing: 3) {
                            Text(selection.vendor.trimmed.isEmpty ? "Selection" : selection.vendor.trimmed)
                                .font(.subheadline.weight(.semibold))
                            Text(selection.selectionDate.shortDateString)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }

                        Spacer()

                        Text(selection.amount.currencyString)
                            .font(.subheadline.weight(.bold))

                        Button(role: .destructive) {
                            deleteSelection(selection)
                        } label: {
                            Image(systemName: "trash")
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
    }

    private var expensesSection: some View {
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
        item.isAllowance = isAllowance
        item.allowanceAmount = isAllowance ? max(0, allowanceAmount) : 0
        let effectiveSelections = isAllowance ? seedSelectionsFromLinkedExpensesIfNeeded() : allowanceSelections
        BudgetMathService.recalculateActuals(
            for: projectID,
            items: projectItems,
            expenses: expenses,
            changeOrders: [],
            allowanceSelections: effectiveSelections
        )

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

    private func seedSelectionsFromLinkedExpensesIfNeeded() -> [AllowanceSelection] {
        guard allowanceSelections.isEmpty, !linkedExpenses.isEmpty else { return allowanceSelections }

        let seededSelections = linkedExpenses.map { expense in
            AllowanceSelection(
                projectID: projectID,
                lineItemID: itemID,
                selectionDate: expense.date,
                vendor: expense.vendorName,
                amount: expense.amount,
                notes: convertedSelectionNotes(for: expense),
                photoData: expense.receiptImageData
            )
        }

        for selection in seededSelections {
            modelContext.insert(selection)
        }

        return seededSelections
    }

    private func convertedSelectionNotes(for expense: Expense) -> String {
        var parts = ["Converted from linked expense"]
        if !expense.invoiceNumber.trimmed.isEmpty {
            parts.append("Invoice #\(expense.invoiceNumber.trimmed)")
        }
        if !expense.notes.trimmed.isEmpty {
            parts.append(expense.notes.trimmed)
        }
        return parts.joined(separator: " - ")
    }

    private func save(selection: AllowanceSelection) {
        if let item = fetchItem() {
            item.isAllowance = true
            item.allowanceAmount = max(0, allowanceAmount)
            item.budget = max(0, budget)
            item.committed = max(0, committed)
        }
        modelContext.insert(selection)
        let effectiveSelections = allowanceSelections + [selection]
        BudgetMathService.recalculateActuals(
            for: projectID,
            items: projectItems,
            expenses: expenses,
            changeOrders: [],
            allowanceSelections: effectiveSelections
        )

        do {
            try modelContext.save()
            Haptics.success()
        } catch {
            modelContext.safeRollback()
            saveErrorMessage = error.localizedDescription
            Haptics.warning()
        }
    }

    private func deleteSelection(_ selection: AllowanceSelection) {
        if let item = fetchItem() {
            item.allowanceAmount = max(0, allowanceAmount)
        }
        modelContext.delete(selection)
        let effectiveSelections = allowanceSelections.filter { $0.id != selection.id }
        BudgetMathService.recalculateActuals(
            for: projectID,
            items: projectItems,
            expenses: expenses,
            changeOrders: [],
            allowanceSelections: effectiveSelections
        )
        do {
            try modelContext.save()
            Haptics.lightTap()
        } catch {
            modelContext.safeRollback()
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

private struct AddAllowanceSelectionView: View {
    @Environment(\.dismiss) private var dismiss
    let projectID: UUID
    let lineItemID: UUID
    let onSave: (AllowanceSelection) -> Void

    @State private var selectionDate = Date()
    @State private var vendor = ""
    @State private var amount = 0.0
    @State private var notes = ""
    @State private var photoData: Data?
    @State private var selectedPhotoItem: PhotosPickerItem?
    @State private var showingFileImporter = false
    @State private var showingCameraPicker = false

    private var canSave: Bool {
        amount > 0
    }

    var body: some View {
        NavigationStack {
            ModernForm {
                ModernFormSection("Selection") {
                    DatePicker("Date", selection: $selectionDate, displayedComponents: .date)
                    ModernField("Vendor") {
                        TextField("Vendor or showroom", text: $vendor)
                            .textInputAutocapitalization(.words)
                            .modernTextField()
                    }
                    ModernField("Amount") {
                        CurrencyField(value: $amount)
                            .modernTextField()
                    }
                    ModernField("Notes") {
                        TextField("Optional details", text: $notes, axis: .vertical)
                            .lineLimit(3 ... 6)
                            .modernTextField()
                    }
                }

                ModernFormSection("Photo", footer: "Optional quote, receipt, or selection tag.") {
                    if photoData != nil {
                        PhotoThumbnail(data: photoData)
                            .frame(height: 180)
                    }

                    Button {
                        showingCameraPicker = true
                    } label: {
                        Label("Take Photo", systemImage: "camera")
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }

                    PhotosPicker(selection: $selectedPhotoItem, matching: .images) {
                        Label("Upload from Album", systemImage: "photo.on.rectangle")
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }

                    Button {
                        showingFileImporter = true
                    } label: {
                        Label("Upload from Files", systemImage: "folder")
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                }
            }
            .navigationTitle("Add Selection")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { save() }
                        .disabled(!canSave)
                }
            }
            .onChange(of: selectedPhotoItem) { _, newItem in
                handleLibraryPick(newItem)
            }
            .fileImporter(
                isPresented: $showingFileImporter,
                allowedContentTypes: [.image],
                allowsMultipleSelection: false
            ) { result in
                handleFileImport(result)
            }
            .sheet(isPresented: $showingCameraPicker) {
                CameraPicker { image in
                    photoData = ImageDataProcessor.optimizedJPEGData(
                        from: image,
                        maxDimension: 1800,
                        compressionQuality: 0.82
                    )
                }
                .ignoresSafeArea()
            }
        }
    }

    private func save() {
        let selection = AllowanceSelection(
            projectID: projectID,
            lineItemID: lineItemID,
            selectionDate: selectionDate,
            vendor: vendor.trimmed,
            amount: max(0, amount),
            notes: notes.trimmed,
            photoData: photoData
        )
        onSave(selection)
        dismiss()
    }

    private func handleLibraryPick(_ item: PhotosPickerItem?) {
        guard let item else { return }
        Task {
            guard let data = try? await item.loadTransferable(type: Data.self) else { return }
            photoData = ImageDataProcessor.optimizedJPEGData(from: data, maxDimension: 1800, compressionQuality: 0.82)
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
        photoData = ImageDataProcessor.optimizedJPEGData(from: data, maxDimension: 1800, compressionQuality: 0.82)
    }
}
