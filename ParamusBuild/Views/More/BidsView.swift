import SwiftData
import SwiftUI
import UniformTypeIdentifiers

private enum BidPackageStatusFilter: String, CaseIterable, Identifiable {
    case all
    case open
    case awarded
    case passed

    var id: String {
        rawValue
    }

    var title: String {
        switch self {
        case .all: "All"
        case .open: "Open"
        case .awarded: "Awarded"
        case .passed: "Passed"
        }
    }

    var systemImage: String {
        switch self {
        case .all: "tray.full"
        case .open: "tray"
        case .awarded: "checkmark.seal"
        case .passed: "nosign"
        }
    }

    var tint: Color {
        switch self {
        case .all: AppTheme.brand
        case .open: AppTheme.accent
        case .awarded: AppTheme.positive
        case .passed: AppTheme.warning
        }
    }

    func matches(_ status: BidPackageStatus) -> Bool {
        switch self {
        case .all: true
        case .open: status == .open
        case .awarded: status == .awarded
        case .passed: status == .passed
        }
    }
}

struct BidsView: View {
    @Environment(\.modelContext) private var modelContext
    let project: Project

    @Query private var packages: [BidPackage]
    @Query private var bids: [Bid]
    @Query private var vendors: [Vendor]

    @State private var showingAddPackage = false
    @State private var packageToEdit: BidPackage?
    @State private var errorMessage: String?
    @State private var searchText = ""

    @AppStorage(AppSettingsKeys.bidsStatusFilter) private var statusFilterRaw = BidPackageStatusFilter.all.rawValue

    init(project: Project) {
        self.project = project
        let projectID = project.id
        _packages = Query(filter: #Predicate<BidPackage> { $0.projectID == projectID }, sort: \.createdAt, order: .reverse)
        _bids = Query(filter: #Predicate<Bid> { $0.projectID == projectID }, sort: \.createdAt, order: .reverse)
        _vendors = Query(filter: #Predicate<Vendor> { $0.projectID == projectID }, sort: \.name)
    }

    // MARK: - Derived state

    private var statusFilter: BidPackageStatusFilter {
        BidPackageStatusFilter(rawValue: statusFilterRaw) ?? .all
    }

    private var openPackages: [BidPackage] {
        packages.filter { $0.status == .open }
    }

    private var statusFilteredPackages: [BidPackage] {
        guard statusFilter != .all else { return packages }
        return packages.filter { statusFilter.matches($0.status) }
    }

    private var searchedPackages: [BidPackage] {
        let query = searchText.trimmed.localizedLowercase
        guard !query.isEmpty else { return statusFilteredPackages }
        return statusFilteredPackages.filter { package in
            if package.scopeTitle.localizedLowercase.contains(query) { return true }
            if package.notes.localizedLowercase.contains(query) { return true }
            // Match any of the package's bids' vendor names so a quick "smith" finds the
            // package that has the Smith bid in it.
            let packageBids = bids.filter { $0.packageID == package.id }
            return packageBids.contains { bid in
                if bid.vendorName.localizedLowercase.contains(query) { return true }
                if let vendorID = bid.vendorID,
                   let vendor = vendors.first(where: { $0.id == vendorID }),
                   vendor.name.localizedLowercase.contains(query)
                {
                    return true
                }
                return false
            }
        }
    }

    private var hasActiveFilters: Bool {
        statusFilter != .all || !searchText.trimmed.isEmpty
    }

    private func statusCount(_ filter: BidPackageStatusFilter) -> Int {
        switch filter {
        case .all: packages.count
        case .open, .awarded, .passed: packages.filter { filter.matches($0.status) }.count
        }
    }

    // MARK: - Body

    var body: some View {
        List {
            Section {
                PremiumCard {
                    HStack {
                        VStack(alignment: .leading, spacing: 5) {
                            Text("Bid Packages")
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(.secondary)
                            Text("\(openPackages.count) open")
                                .font(.system(.title2, design: .rounded, weight: .bold))
                        }
                        Spacer()
                        Image(systemName: "shippingbox")
                            .font(.title2.weight(.semibold))
                            .foregroundStyle(AppTheme.accent)
                    }
                }
                .listRowInsets(EdgeInsets(top: 8, leading: 16, bottom: 4, trailing: 16))
                .listRowBackground(Color.clear)
            }

            if !packages.isEmpty {
                Section {
                    statusFilterBar
                        .listRowInsets(EdgeInsets(top: 0, leading: 16, bottom: 4, trailing: 16))
                        .listRowBackground(Color.clear)
                }
            }

            packagesSection
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .background(AppTheme.pageBackground)
        .navigationTitle("Bids")
        .searchable(text: $searchText, prompt: "Search scope, notes, vendor")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button { showingAddPackage = true } label: { Image(systemName: "plus.circle.fill") }
                    .accessibilityLabel("Add Bid Package")
            }
        }
        .sheet(isPresented: $showingAddPackage) { AddBidPackageView(project: project) }
        .sheet(item: $packageToEdit) { package in AddBidPackageView(project: project, package: package) }
        .alert("Bid Error", isPresented: errorBinding) { Button("OK", role: .cancel) {} } message: { Text(errorMessage ?? "") }
    }

    private var statusFilterBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(BidPackageStatusFilter.allCases) { filter in
                    Button {
                        withAnimation(.smooth(duration: 0.2)) {
                            statusFilterRaw = filter.rawValue
                        }
                    } label: {
                        HStack(spacing: 6) {
                            Image(systemName: filter.systemImage)
                                .font(.caption.weight(.bold))
                            Text(filter.title)
                                .font(.caption.weight(.bold))
                            Text("\(statusCount(filter))")
                                .font(.caption2.weight(.bold))
                                .foregroundStyle(statusFilter == filter ? .white.opacity(0.78) : .secondary)
                        }
                        .foregroundStyle(statusFilter == filter ? .white : .primary)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                        .background(statusFilter == filter ? filter.tint : AppTheme.surface, in: Capsule())
                        .overlay(
                            Capsule()
                                .strokeBorder(statusFilter == filter ? Color.clear : AppTheme.border, lineWidth: 0.75)
                        )
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.vertical, 4)
        }
    }

    @ViewBuilder
    private var packagesSection: some View {
        if packages.isEmpty {
            Section {
                VStack(spacing: 12) {
                    EmptyStateView(
                        title: "No bid packages",
                        subtitle: "Create a scope, collect vendor bids, and compare them side by side before awarding.",
                        systemImage: "shippingbox"
                    )
                    Button {
                        showingAddPackage = true
                    } label: {
                        Label("Add first package", systemImage: "plus")
                    }
                    .buttonStyle(.borderedProminent)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 24)
            }
        } else if searchedPackages.isEmpty {
            Section {
                VStack(spacing: 12) {
                    EmptyStateView(
                        title: "No matches",
                        subtitle: hasActiveFilters
                            ? "Clear the status filter or search to see all packages."
                            : "Try a different filter.",
                        systemImage: "magnifyingglass"
                    )
                    if hasActiveFilters {
                        Button("Clear filters") {
                            statusFilterRaw = BidPackageStatusFilter.all.rawValue
                            searchText = ""
                        }
                        .buttonStyle(.bordered)
                    }
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 16)
            }
        } else {
            Section(statusFilter == .all ? "Packages" : statusFilter.title) {
                ForEach(searchedPackages) { package in
                    packageRow(package)
                }
            }
        }
    }

    private var errorBinding: Binding<Bool> {
        Binding(get: { errorMessage != nil }, set: { if !$0 { errorMessage = nil } })
    }

    private func packageRow(_ package: BidPackage) -> some View {
        let packageBids = bids.filter { $0.packageID == package.id }
        return NavigationLink {
            BidPackageDetailView(project: project, package: package)
        } label: {
            HStack(spacing: 12) {
                Image(systemName: package.status.systemImage)
                    .font(.headline.weight(.semibold))
                    .foregroundStyle(package.status == .awarded ? AppTheme.positive : AppTheme.accent)
                    .frame(width: 36, height: 36)
                    .background(
                        (package.status == .awarded ? AppTheme.positive : AppTheme.accent).opacity(0.13),
                        in: RoundedRectangle(cornerRadius: 8, style: .continuous)
                    )

                VStack(alignment: .leading, spacing: 3) {
                    Text(package.scopeTitle)
                        .font(.subheadline.weight(.semibold))
                    Text(packageSubtitle(package, bidCount: packageBids.count))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            .padding(.vertical, 5)
        }
        .swipeActions(edge: .trailing, allowsFullSwipe: false) {
            Button(role: .destructive) {
                delete(package)
            } label: {
                Label("Delete", systemImage: "trash")
            }
        }
        .contextMenu {
            Button { packageToEdit = package } label: { Label("Edit", systemImage: "pencil") }
            Button(role: .destructive) { delete(package) } label: { Label("Delete", systemImage: "trash") }
        }
    }

    private func packageSubtitle(_ package: BidPackage, bidCount: Int) -> String {
        var parts = [package.status.title, "\(bidCount) bid\(bidCount == 1 ? "" : "s")"]
        if let dueDate = package.dueDate { parts.append("Due \(dueDate.shortDateString)") }
        return parts.joined(separator: " - ")
    }

    private func delete(_ package: BidPackage) {
        for bid in bids where bid.packageID == package.id {
            modelContext.delete(bid)
        }
        modelContext.delete(package)
        save()
    }

    private func save() {
        do { try modelContext.save(); Haptics.lightTap() } catch {
            modelContext.safeRollback(); errorMessage = error.localizedDescription; Haptics.warning()
        }
    }
}

private struct BidPackageDetailView: View {
    @Environment(\.modelContext) private var modelContext
    let project: Project
    let package: BidPackage

    @Query private var bids: [Bid]
    @Query private var vendors: [Vendor]
    @Query private var items: [BudgetLineItem]
    @Query private var categories: [BudgetCategory]

    @State private var showingAddBid = false
    @State private var bidToEdit: Bid?
    @State private var bidToAward: Bid?
    @State private var showingAwardActions = false
    @State private var errorMessage: String?

    init(project: Project, package: BidPackage) {
        self.project = project
        self.package = package
        let projectID = project.id
        let packageID = package.id
        _bids = Query(filter: #Predicate<Bid> { $0.projectID == projectID && $0.packageID == packageID }, sort: \.amount)
        _vendors = Query(filter: #Predicate<Vendor> { $0.projectID == projectID }, sort: \.name)
        _items = Query(filter: #Predicate<BudgetLineItem> { $0.projectID == projectID }, sort: \.costCode)
        _categories = Query(filter: #Predicate<BudgetCategory> { $0.projectID == projectID }, sort: \.sortOrder)
    }

    private var lowBid: Bid? {
        bids.min { $0.amount < $1.amount }
    }

    var body: some View {
        List {
            Section {
                VStack(alignment: .leading, spacing: 12) {
                    HStack(alignment: .top) {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(package.scopeTitle)
                                .font(.title3.weight(.bold))
                            Text(package.status.title)
                                .font(.caption.weight(.bold))
                                .foregroundStyle(package.status == .awarded ? AppTheme.positive : .secondary)
                        }
                        Spacer()
                        if let lowBid {
                            VStack(alignment: .trailing, spacing: 3) {
                                Text(lowBid.amount.currencyString)
                                    .font(.headline.weight(.bold))
                                Text("Low bid")
                                    .font(.caption2.weight(.bold))
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                    if let dueDate = package.dueDate {
                        Label("Due \(dueDate.shortDateString)", systemImage: "calendar")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(.secondary)
                    }
                }
                .padding(.vertical, 8)
            }

            if bids.count >= 2 {
                Section {
                    NavigationLink {
                        BidComparisonView(project: project, package: package)
                    } label: {
                        Label("Compare Side by Side", systemImage: "tablecells")
                    }
                }
            }

            Section("Bids") {
                if bids.isEmpty {
                    EmptyStateView(
                        title: "No bids yet",
                        subtitle: "Add bids from vendors to compare totals and line items.",
                        systemImage: "doc.text.magnifyingglass"
                    )
                } else {
                    ForEach(bids) { bid in
                        bidRow(bid)
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .background(AppTheme.pageBackground)
        .navigationTitle("Bid Package")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button { showingAddBid = true } label: { Image(systemName: "plus.circle.fill") }
                    .accessibilityLabel("Add Bid")
            }
        }
        .sheet(isPresented: $showingAddBid) { AddBidView(project: project, package: package) }
        .sheet(item: $bidToEdit) { bid in AddBidView(project: project, package: package, bid: bid) }
        .confirmationDialog("Award Bid", isPresented: $showingAwardActions, titleVisibility: .visible) {
            Button("Create Budget Item") { if let bidToAward { award(bidToAward, asChangeOrder: false) } }
            Button("Create Change Order") { if let bidToAward { award(bidToAward, asChangeOrder: true) } }
            Button("Cancel", role: .cancel) { bidToAward = nil }
        } message: {
            Text("Choose how to add the winning bid to the project.")
        }
        .alert("Bid Error", isPresented: errorBinding) { Button("OK", role: .cancel) {} } message: { Text(errorMessage ?? "") }
    }

    private var errorBinding: Binding<Bool> {
        Binding(get: { errorMessage != nil }, set: { if !$0 { errorMessage = nil } })
    }

    private func bidRow(_ bid: Bid) -> some View {
        Button { bidToEdit = bid } label: {
            HStack(spacing: 12) {
                Image(systemName: package.awardedBidID == bid.id ? "checkmark.seal.fill" : "doc.text")
                    .font(.headline.weight(.semibold))
                    .foregroundStyle(package.awardedBidID == bid.id ? AppTheme.positive : AppTheme.accent)
                    .frame(width: 36, height: 36)
                    .background(
                        (package.awardedBidID == bid.id ? AppTheme.positive : AppTheme.accent).opacity(0.13),
                        in: RoundedRectangle(cornerRadius: 8, style: .continuous)
                    )
                VStack(alignment: .leading, spacing: 3) {
                    Text(displayVendor(for: bid))
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(.primary)
                    Text("\(bid.lineItems.count) line items\(bid.fileName.isEmpty ? "" : " — \(bid.fileName)")")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                Text(bid.amount.currencyString)
                    .font(.subheadline.weight(.bold))
                    .foregroundStyle(.primary)
            }
            .padding(.vertical, 5)
        }
        .buttonStyle(.plain)
        .swipeActions(edge: .leading, allowsFullSwipe: true) {
            if package.awardedBidID == nil {
                Button {
                    bidToAward = bid
                    showingAwardActions = true
                } label: {
                    Label("Award", systemImage: "checkmark.seal")
                }
                .tint(AppTheme.positive)
            }
        }
        .swipeActions(edge: .trailing, allowsFullSwipe: false) {
            Button(role: .destructive) {
                delete(bid)
            } label: {
                Label("Delete", systemImage: "trash")
            }
        }
        .contextMenu {
            if package.awardedBidID == nil {
                Button { bidToAward = bid; showingAwardActions = true } label: { Label("Award", systemImage: "checkmark.seal") }
            }
            Button(role: .destructive) { delete(bid) } label: { Label("Delete", systemImage: "trash") }
        }
    }

    private func displayVendor(for bid: Bid) -> String {
        if let vendorID = bid.vendorID, let vendor = vendors.first(where: { $0.id == vendorID }) { return vendor.name }
        return bid.vendorName.trimmed.isEmpty ? "Bid" : bid.vendorName.trimmed
    }

    private func award(_ bid: Bid, asChangeOrder: Bool) {
        guard package.awardedBidID == nil else {
            errorMessage = "This bid package already has an awarded bid."
            bidToAward = nil
            Haptics.warning()
            return
        }
        package.status = .awarded
        package.awardedBidID = bid.id
        bid.awardedAt = .now
        if asChangeOrder {
            let order = ChangeOrder(
                projectID: project.id,
                title: package.scopeTitle,
                amount: bid.amount,
                status: .approved,
                notes: awardNotes(for: bid),
                categoryName: "Bids"
            )
            modelContext.insert(order)
        } else {
            ensureBidsCategory()
            let item = BudgetLineItem(
                projectID: project.id,
                costCode: suggestedCostCode,
                title: package.scopeTitle,
                categoryName: "Bids",
                roomTag: RoomCatalog.inferredRoom(title: package.scopeTitle, category: "Bids", project: project),
                budget: bid.amount,
                committed: bid.amount,
                notes: awardNotes(for: bid)
            )
            modelContext.insert(item)
        }
        save()
        bidToAward = nil
    }

    private func ensureBidsCategory() {
        guard !categories.contains(where: { $0.name.caseInsensitiveCompare("Bids") == .orderedSame }) else { return }
        modelContext.insert(BudgetCategory(
            projectID: project.id,
            name: "Bids",
            sortOrder: (categories.map(\.sortOrder).max() ?? 0) + 1,
            targetBudget: 0,
            systemImage: "shippingbox"
        ))
    }

    private var suggestedCostCode: String {
        let next = (items.compactMap { Int($0.costCode) }.filter { $0 < 9000 }.max() ?? 8000) + 1
        return String(format: "%04d", min(next, 8999))
    }

    private func awardNotes(for bid: Bid) -> String {
        var parts = ["Awarded from bid package: \(package.scopeTitle)", "Vendor: \(displayVendor(for: bid))"]
        if !bid.notes.trimmed.isEmpty { parts.append(bid.notes.trimmed) }
        return parts.joined(separator: " - ")
    }

    private func delete(_ bid: Bid) {
        modelContext.delete(bid)
        save()
    }

    private func save() {
        do { try modelContext.save(); Haptics.success() } catch {
            modelContext.safeRollback(); errorMessage = error.localizedDescription; Haptics.warning()
        }
    }
}

private struct BidComparisonView: View {
    @Environment(\.modelContext) private var modelContext
    let project: Project
    let package: BidPackage

    @Query private var bids: [Bid]
    @Query private var vendors: [Vendor]

    init(project: Project, package: BidPackage) {
        self.project = project
        self.package = package
        let projectID = project.id
        let packageID = package.id
        _bids = Query(filter: #Predicate<Bid> { $0.projectID == projectID && $0.packageID == packageID }, sort: \.amount)
        _vendors = Query(filter: #Predicate<Vendor> { $0.projectID == projectID }, sort: \.name)
    }

    private var lineTitles: [String] {
        let titles = Set(bids.flatMap { $0.lineItems.map(\.title.trimmed).filter { !$0.isEmpty } })
        return titles.sorted { $0.localizedStandardCompare($1) == .orderedAscending }
    }

    var body: some View {
        ScrollView([.vertical, .horizontal]) {
            Grid(alignment: .leading, horizontalSpacing: 0, verticalSpacing: 0) {
                GridRow {
                    headerCell("Line Item", width: 170)
                    ForEach(bids) { bid in headerCell(displayVendor(for: bid), width: 136) }
                }
                ForEach(lineTitles, id: \.self) { title in
                    GridRow {
                        bodyCell(title, width: 170, alignment: .leading)
                        ForEach(bids) { bid in
                            bodyCell(amount(for: title, in: bid).currencyString, width: 136, alignment: .trailing)
                        }
                    }
                }
                GridRow {
                    headerCell("Total", width: 170)
                    ForEach(bids) { bid in headerCell(bid.amount.currencyString, width: 136, alignment: .trailing) }
                }
            }
            .padding(AppTheme.pagePadding)
        }
        .background(AppTheme.pageBackground)
        .navigationTitle("Compare Bids")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func displayVendor(for bid: Bid) -> String {
        if let vendorID = bid.vendorID, let vendor = vendors.first(where: { $0.id == vendorID }) { return vendor.name }
        return bid.vendorName.trimmed.isEmpty ? "Bid" : bid.vendorName.trimmed
    }

    private func amount(for title: String, in bid: Bid) -> Double {
        MoneyMath.sum(
            bid.lineItems.filter { $0.title.trimmed.caseInsensitiveCompare(title) == .orderedSame },
            by: \.amount
        )
    }

    private func headerCell(_ text: String, width: CGFloat, alignment: Alignment = .leading) -> some View {
        Text(text)
            .font(.caption.weight(.bold))
            .foregroundStyle(.primary)
            .lineLimit(2)
            .frame(width: width, alignment: alignment)
            .frame(minHeight: 48)
            .padding(.horizontal, 10)
            .background(AppTheme.accent.opacity(0.12))
            .border(AppTheme.border.opacity(0.7), width: 0.5)
    }

    private func bodyCell(_ text: String, width: CGFloat, alignment: Alignment) -> some View {
        Text(text)
            .font(.caption)
            .foregroundStyle(.primary)
            .lineLimit(2)
            .frame(width: width, alignment: alignment)
            .frame(minHeight: 44)
            .padding(.horizontal, 10)
            .background(Color(.secondarySystemGroupedBackground))
            .border(AppTheme.border.opacity(0.7), width: 0.5)
    }
}

private struct AddBidPackageView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.modelContext) private var modelContext
    let project: Project
    let package: BidPackage?

    @State private var scopeTitle: String
    @State private var hasDueDate: Bool
    @State private var dueDate: Date
    @State private var status: BidPackageStatus
    @State private var notes: String
    @State private var errorMessage: String?

    init(project: Project, package: BidPackage? = nil) {
        self.project = project
        self.package = package
        _scopeTitle = State(initialValue: package?.scopeTitle ?? "")
        _hasDueDate = State(initialValue: package?.dueDate != nil)
        _dueDate = State(initialValue: package?.dueDate ?? .now)
        _status = State(initialValue: package?.status ?? .open)
        _notes = State(initialValue: package?.notes ?? "")
    }

    var body: some View {
        NavigationStack {
            ModernForm {
                ModernFormSection("Package") {
                    ModernField("Scope title") {
                        TextField("e.g. Roofing bids", text: $scopeTitle)
                            .textInputAutocapitalization(.words)
                            .modernTextField()
                    }
                    Picker("Status", selection: $status) {
                        ForEach(BidPackageStatus.allCases) { status in Label(status.title, systemImage: status.systemImage).tag(status) }
                    }
                    Toggle("Due date", isOn: $hasDueDate)
                    if hasDueDate { DatePicker("Due", selection: $dueDate, displayedComponents: .date) }
                }
                ModernFormSection("Notes") {
                    ModernField("Notes") {
                        TextField("Optional scope notes", text: $notes, axis: .vertical)
                            .lineLimit(3 ... 6)
                            .modernTextField()
                    }
                }
            }
            .navigationTitle(package == nil ? "Add Bid Package" : "Edit Bid Package")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) { Button("Save") { save() }.disabled(scopeTitle.trimmed.isEmpty) }
            }
            .alert("Package Error", isPresented: errorBinding) { Button("OK", role: .cancel) {} } message: { Text(errorMessage ?? "") }
        }
    }

    private var errorBinding: Binding<Bool> {
        Binding(get: { errorMessage != nil }, set: { if !$0 { errorMessage = nil } })
    }

    private func save() {
        let target = package ?? BidPackage(projectID: project.id, scopeTitle: scopeTitle.trimmed)
        target.scopeTitle = scopeTitle.trimmed
        target.status = status
        target.dueDate = hasDueDate ? dueDate : nil
        target.notes = notes.trimmed
        if package == nil { modelContext.insert(target) }
        do { try modelContext.save(); Haptics.success(); dismiss() } catch {
            modelContext.safeRollback(); errorMessage = error.localizedDescription; Haptics.warning()
        }
    }
}

private struct AddBidView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.modelContext) private var modelContext
    let project: Project
    let package: BidPackage
    let bid: Bid?

    @Query private var vendors: [Vendor]

    @State private var vendorID: UUID?
    @State private var vendorName: String
    @State private var amount: Double
    @State private var notes: String
    @State private var lineItems: [BidLine]
    @State private var fileData: Data?
    @State private var fileName: String
    @State private var showingFileImporter = false
    @State private var errorMessage: String?

    init(project: Project, package: BidPackage, bid: Bid? = nil) {
        self.project = project
        self.package = package
        self.bid = bid
        let projectID = project.id
        _vendors = Query(filter: #Predicate<Vendor> { $0.projectID == projectID }, sort: \.name)
        _vendorID = State(initialValue: bid?.vendorID)
        _vendorName = State(initialValue: bid?.vendorName ?? "")
        _amount = State(initialValue: bid?.amount ?? 0)
        _notes = State(initialValue: bid?.notes ?? "")
        _lineItems = State(initialValue: bid?.lineItems.isEmpty == false ? bid?.lineItems ?? [] : [BidLine(title: "", amount: 0)])
        _fileData = State(initialValue: bid?.fileData)
        _fileName = State(initialValue: bid?.fileName ?? "")
    }

    private var computedTotal: Double {
        // Clamp each line at 0 then sum via cent-exact integer math.
        let totalCents = lineItems.reduce(Int64(0)) { running, line in
            running + max(Int64(0), MoneyMath.cents(line.amount))
        }
        return MoneyMath.dollars(totalCents)
    }

    private var effectiveAmount: Double {
        amount > 0 ? amount : computedTotal
    }

    var body: some View {
        NavigationStack {
            ModernForm {
                ModernFormSection("Vendor") {
                    Picker("Vendor", selection: $vendorID) {
                        Text("Manual entry").tag(UUID?.none)
                        ForEach(vendors) { vendor in Text(vendor.name).tag(Optional(vendor.id)) }
                    }
                    ModernField("Vendor name") {
                        TextField("Name if not in vendors", text: $vendorName)
                            .textInputAutocapitalization(.words)
                            .modernTextField()
                    }
                }

                ModernFormSection("Bid") {
                    ModernField("Total amount", subtitle: computedTotal > 0 ? "Line items total: \(computedTotal.currencyString)" : nil) {
                        CurrencyField(value: $amount)
                            .modernTextField()
                    }
                    if !fileName.isEmpty {
                        Label(fileName, systemImage: "doc")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(.secondary)
                    }
                    Button { showingFileImporter = true } label: { Label(
                        fileName.isEmpty ? "Upload Bid File" : "Replace Bid File",
                        systemImage: "folder"
                    ) }
                }

                ModernFormSection("Line Items") {
                    ForEach($lineItems) { $line in
                        VStack(spacing: 8) {
                            TextField("Scope line", text: $line.title)
                                .textInputAutocapitalization(.words)
                                .modernTextField()
                            CurrencyField(value: $line.amount)
                                .modernTextField()
                        }
                    }
                    .onDelete { lineItems.remove(atOffsets: $0) }

                    Button { lineItems.append(BidLine(title: "", amount: 0)) } label: { Label("Add Line", systemImage: "plus.circle") }
                }

                ModernFormSection("Notes") {
                    ModernField("Notes") {
                        TextField("Clarifications, exclusions, warranty notes", text: $notes, axis: .vertical)
                            .lineLimit(3 ... 6)
                            .modernTextField()
                    }
                }
            }
            .navigationTitle(bid == nil ? "Add Bid" : "Edit Bid")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { save() }.disabled(effectiveAmount <= 0 || displayVendorName.trimmed.isEmpty)
                }
            }
            .fileImporter(
                isPresented: $showingFileImporter,
                allowedContentTypes: [.pdf, .image, .spreadsheet, .text, .data],
                allowsMultipleSelection: false
            ) { result in
                handleFile(result)
            }
            .alert("Bid Error", isPresented: errorBinding) { Button("OK", role: .cancel) {} } message: { Text(errorMessage ?? "") }
        }
    }

    private var displayVendorName: String {
        if let vendorID, let vendor = vendors.first(where: { $0.id == vendorID }) { return vendor.name }
        return vendorName.trimmed
    }

    private var errorBinding: Binding<Bool> {
        Binding(get: { errorMessage != nil }, set: { if !$0 { errorMessage = nil } })
    }

    private func save() {
        let cleanedLines = lineItems.filter { !$0.title.trimmed.isEmpty || $0.amount > 0 }.map { BidLine(
            id: $0.id,
            title: $0.title.trimmed.isEmpty ? "Scope" : $0.title.trimmed,
            amount: max(0, $0.amount)
        ) }
        let target = bid ?? Bid(projectID: project.id, packageID: package.id, amount: effectiveAmount)
        target.vendorID = vendorID
        target.vendorName = displayVendorName
        target.amount = max(0, effectiveAmount)
        target.fileData = fileData
        target.fileName = fileName
        target.notes = notes.trimmed
        target.lineItems = cleanedLines
        if bid == nil { modelContext.insert(target) }
        do { try modelContext.save(); Haptics.success(); dismiss() } catch {
            modelContext.safeRollback(); errorMessage = error.localizedDescription; Haptics.warning()
        }
    }

    private func handleFile(_ result: Result<[URL], Error>) {
        guard case let .success(urls) = result, let url = urls.first else { return }
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }
        do {
            fileData = try Data(contentsOf: url)
            fileName = url.lastPathComponent
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
