import PhotosUI
import QuickLook
import SwiftData
import SwiftUI
import UIKit
import UniformTypeIdentifiers

struct DocumentsView: View {
    @Environment(\.modelContext) private var modelContext
    let project: Project

    @Query private var documents: [ProjectDocument]
    @Query private var items: [BudgetLineItem]
    @State private var selectedKindFilter: ProjectDocumentKind?
    @State private var selectedStatusFilter: DocumentStatusFilter = .all
    @State private var showingImporter = false
    @State private var showingUploadSourceDialog = false
    @State private var importKindOverride: ProjectDocumentKind?
    @State private var selectedPhotoItem: PhotosPickerItem?
    @State private var showingCamera = false
    @State private var showingUploadReview = false
    @State private var showingDocumentEditor = false
    @State private var documentIDToEdit: UUID?
    @State private var pendingUploads: [PendingDocumentUpload] = []
    @State private var documentToPreview: PreviewDocument?
    @State private var documentToShare: PreviewDocument?

    init(project: Project) {
        self.project = project
        let projectID = project.id
        _documents = Query(filter: #Predicate<ProjectDocument> { $0.projectID == projectID }, sort: \.uploadedAt, order: .reverse)
        _items = Query(filter: #Predicate<BudgetLineItem> { $0.projectID == projectID }, sort: \.costCode)
    }

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 14) {
                DocumentSummaryCard(
                    totalCount: documents.count,
                    receivedCount: documents.filter { $0.status == .received }.count,
                    missingCount: missingRequiredKinds.count
                )

                DocumentFilterPanel(
                    selectedKind: $selectedKindFilter,
                    selectedStatus: $selectedStatusFilter,
                    documents: documents,
                    missingRequiredKinds: missingRequiredKinds
                )

                if shouldShowChecklist {
                    RequiredDocumentsCard(
                        requiredKinds: ProjectDocumentKind.requiredForProjectSetup,
                        documents: documents,
                        selectedKind: $selectedKindFilter,
                        selectedStatus: $selectedStatusFilter
                    ) { kind in
                        beginUpload(kind: kind)
                    }
                }

                if filteredDocuments.isEmpty {
                    EmptyStateView(
                        title: selectedStatusFilter == .missing ? "Nothing missing here" : "No files found",
                        subtitle: selectedStatusFilter == .all && selectedKindFilter == nil ?
                            "Upload surveys, permits, plans, contracts, insurance and receipts." :
                            "Try another filter or upload a file for this section.",
                        systemImage: "folder"
                    )
                    .frame(maxWidth: .infinity)
                    .padding(.top, 16)
                } else {
                    ForEach(filteredDocuments) { document in
                        DocumentRow(document: document)
                            .padding(12)
                            .background(AppTheme.cardBackground, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                            .contentShape(Rectangle())
                            .onTapGesture {
                                documentToPreview = makePreview(document)
                            }
                            .contextMenu {
                                Button {
                                    documentIDToEdit = document.id
                                    showingDocumentEditor = true
                                } label: {
                                    Label("Edit", systemImage: "pencil")
                                }

                                Button {
                                    documentToShare = makePreview(document)
                                } label: {
                                    Label("Share", systemImage: "square.and.arrow.up")
                                }

                                Button(role: .destructive) {
                                    deleteDocument(withID: document.id)
                                } label: {
                                    Label("Delete", systemImage: "trash")
                                }
                            }
                    }
                }
            }
            .padding(AppTheme.pagePadding)
        }
        .background(AppTheme.pageBackground)
        .navigationTitle("Documents")
        .primaryFloatingAction(title: "Upload", systemImage: "doc.badge.plus") {
            beginUpload(kind: selectedKindFilter)
        }
        .confirmationDialog("Upload", isPresented: $showingUploadSourceDialog, titleVisibility: .visible) {
            Button {
                showingCamera = true
            } label: {
                Label("Take Photo", systemImage: "camera")
            }

            PhotosPicker(selection: $selectedPhotoItem, matching: .images) {
                Label("Upload from Album", systemImage: "photo.on.rectangle")
            }

            Button {
                showingImporter = true
            } label: {
                Label("Upload from Files", systemImage: "folder")
            }
        }
        .fileImporter(
            isPresented: $showingImporter,
            allowedContentTypes: [.item],
            allowsMultipleSelection: true
        ) { result in
            importFiles(result)
        }
        .onChange(of: selectedPhotoItem) { _, newItem in
            handleAlbumPick(newItem)
        }
        .sheet(isPresented: $showingCamera) {
            CameraPicker { image in
                importImage(image)
            }
        }
        .sheet(isPresented: $showingUploadReview, onDismiss: {
            if !pendingUploads.isEmpty {
                pendingUploads.removeAll()
            }
        }) {
            UploadDocumentsReviewView(uploads: $pendingUploads, items: items) { uploads in
                saveUploads(uploads)
            }
        }
        .sheet(isPresented: $showingDocumentEditor, onDismiss: {
            documentIDToEdit = nil
        }) {
            if let documentIDToEdit, let document = fetchDocument(withID: documentIDToEdit) {
                DocumentEditorView(project: project, document: document, items: items)
            }
        }
        .sheet(item: $documentToPreview) { preview in
            QuickLookPreview(url: preview.url)
        }
        .sheet(item: $documentToShare) { preview in
            DocumentActivityView(url: preview.url)
        }
    }

    private var filteredDocuments: [ProjectDocument] {
        documents.filter { document in
            if let selectedKindFilter, document.kind != selectedKindFilter {
                return false
            }

            switch selectedStatusFilter {
            case .all:
                return true
            case .received:
                return document.status == .received
            case .required:
                return document.status == .required || ProjectDocumentKind.requiredForProjectSetup.contains(document.kind)
            case .missing:
                return document.status == .missing
            }
        }
    }

    private var missingRequiredKinds: [ProjectDocumentKind] {
        ProjectDocumentKind.requiredForProjectSetup.filter { kind in
            !documents.contains { $0.kind == kind && $0.status == .received }
        }
    }

    private var shouldShowChecklist: Bool {
        selectedStatusFilter == .all || selectedStatusFilter == .required || selectedStatusFilter == .missing
    }

    private func beginUpload(kind: ProjectDocumentKind?) {
        importKindOverride = kind
        showingUploadSourceDialog = true
    }

    private func handleAlbumPick(_ item: PhotosPickerItem?) {
        guard let item else { return }
        Task {
            guard let data = try? await item.loadTransferable(type: Data.self),
                  let image = UIImage(data: data) else { return }
            await MainActor.run {
                importImage(image)
            }
        }
    }

    private func importImage(_ image: UIImage) {
        let kind = importKindOverride ?? selectedKindFilter ?? .other
        let data = ImageDataProcessor.optimizedJPEGData(from: image, maxDimension: 2200, compressionQuality: 0.88) ?? image
            .jpegData(compressionQuality: 0.88)
        guard let data else { return }
        pendingUploads = [
            PendingDocumentUpload(
                originalFileName: "\(kind.uploadFileStem)-photo.jpg",
                displayName: "",
                kind: kind,
                status: .received,
                budgetLineItemID: nil,
                notes: "",
                fileData: data
            )
        ]
        importKindOverride = nil
        showingUploadReview = true
    }

    private func importFiles(_ result: Result<[URL], Error>) {
        defer { importKindOverride = nil }
        guard case let .success(urls) = result else { return }

        var uploads: [PendingDocumentUpload] = []

        for url in urls {
            let isScoped = url.startAccessingSecurityScopedResource()
            defer {
                if isScoped {
                    url.stopAccessingSecurityScopedResource()
                }
            }

            guard let data = try? Data(contentsOf: url) else { continue }
            uploads.append(
                PendingDocumentUpload(
                    originalFileName: url.lastPathComponent,
                    displayName: "",
                    kind: importKindOverride ?? selectedKindFilter ?? inferredKind(from: url.lastPathComponent),
                    status: .received,
                    budgetLineItemID: nil,
                    notes: "",
                    fileData: data
                )
            )
        }

        guard !uploads.isEmpty else { return }
        pendingUploads = uploads
        showingUploadReview = true
    }

    private func saveUploads(_ uploads: [PendingDocumentUpload]) {
        var mirroredDocuments: [(document: ProjectDocument, data: Data)] = []
        for upload in uploads {
            let document = ProjectDocument(
                projectID: project.id,
                fileName: upload.resolvedFileName,
                kind: upload.kind,
                status: upload.status,
                notes: upload.notes.trimmed,
                budgetLineItemID: upload.budgetLineItemID,
                budgetLineItemTitle: items.first { $0.id == upload.budgetLineItemID }?.title ?? "",
                fileData: upload.fileData
            )
            modelContext.insert(document)
            mirroredDocuments.append((document, upload.fileData))
        }

        if saveChanges(successHaptic: true) {
            for (document, data) in mirroredDocuments {
                do {
                    try MediaStorageService.saveDocument(data: data, project: project, document: document)
                } catch {
                    StorageHealthMonitor.shared.reportMirrorFailure(error)
                }
            }
        }
        pendingUploads.removeAll()
        showingUploadReview = false
    }

    private func inferredKind(from fileName: String) -> ProjectDocumentKind {
        let lowercased = fileName.localizedLowercase
        if lowercased.contains("survey") { return .survey }
        if lowercased.contains("permit") || lowercased.contains("zoning") || lowercased.contains("variance") || lowercased
            .contains("approval") { return .approvals }
        if lowercased.contains("architect") || lowercased.contains("arch") || lowercased.contains("structural") || lowercased
            .contains("engineer") || lowercased.contains("mep") || lowercased.contains("drawing") || lowercased
            .contains("plan") { return .plans }
        if lowercased.contains("inspection") { return .inspections }
        if lowercased.contains("insurance") || lowercased.contains("contract") || lowercased
            .contains("proposal") { return .contractsInsurance }
        if lowercased.contains("warranty") || lowercased.contains("receipt") || lowercased
            .contains("invoice") { return .receiptsWarranties }
        return .other
    }

    private func makePreview(_ document: ProjectDocument) -> PreviewDocument? {
        guard let data = document.fileData else { return nil }
        let directory = Self.previewDirectory()
        try? FileManager.default.removeItem(at: directory)
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let url = directory.appending(path: "\(document.id.uuidString)-\(document.fileName.safeFileName)")
        try? data.write(to: url, options: .atomic)
        return PreviewDocument(url: url)
    }

    private static func previewDirectory() -> URL {
        FileManager.default.temporaryDirectory.appending(path: "DocumentPreviews", directoryHint: .isDirectory)
    }

    private func deleteDocument(withID documentID: UUID) {
        guard let document = fetchDocument(withID: documentID) else { return }
        let deletedDocumentID = document.id
        let deletedDocumentKind = document.kind
        let deletedDocumentFileName = document.fileName
        modelContext.delete(document)
        if saveChanges(successHaptic: false) {
            MediaStorageService.removeDocument(
                id: deletedDocumentID,
                kind: deletedDocumentKind,
                fileName: deletedDocumentFileName,
                project: project
            )
        }
    }

    private func fetchDocument(withID documentID: UUID) -> ProjectDocument? {
        let projectID = project.id
        let descriptor = FetchDescriptor<ProjectDocument>(
            predicate: #Predicate { $0.id == documentID && $0.projectID == projectID }
        )
        return try? modelContext.fetch(descriptor).first
    }

    @discardableResult
    private func saveChanges(successHaptic: Bool) -> Bool {
        do {
            try modelContext.save()
            if successHaptic {
                Haptics.success()
            }
            return true
        } catch {
            modelContext.safeRollback()
            Haptics.warning()
            return false
        }
    }
}

private enum DocumentStatusFilter: String, CaseIterable, Identifiable {
    case all
    case received
    case required
    case missing

    var id: String {
        rawValue
    }

    var title: String {
        switch self {
        case .all: "All"
        case .received: "Uploaded"
        case .required: "Required"
        case .missing: "Missing"
        }
    }
}

private struct PendingDocumentUpload: Identifiable {
    let id = UUID()
    let originalFileName: String
    var displayName: String
    var kind: ProjectDocumentKind
    var status: ProjectDocumentStatus
    var budgetLineItemID: UUID?
    var notes: String
    let fileData: Data

    var resolvedFileName: String {
        let trimmed = displayName.trimmed
        guard !trimmed.isEmpty else { return originalFileName }

        let originalExtension = (originalFileName as NSString).pathExtension
        let enteredExtension = (trimmed as NSString).pathExtension
        guard enteredExtension.isEmpty, !originalExtension.isEmpty else {
            return trimmed
        }

        return "\(trimmed).\(originalExtension)"
    }
}

private struct DocumentSummaryCard: View {
    let totalCount: Int
    let receivedCount: Int
    let missingCount: Int

    var body: some View {
        PremiumCard {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Project files")
                            .font(.headline.weight(.semibold))
                        Text("Plans, permits, survey, contracts and closeout documents.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }

                    Spacer()

                    Image(systemName: "folder.fill")
                        .font(.title3.weight(.semibold))
                        .foregroundStyle(AppTheme.accent)
                        .frame(width: 38, height: 38)
                        .background(AppTheme.accent.opacity(0.12), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                }

                HStack(spacing: 8) {
                    DocumentCountChip(title: "Files", value: totalCount, tint: AppTheme.accent)
                    DocumentCountChip(title: "Uploaded", value: receivedCount, tint: AppTheme.positive)
                    DocumentCountChip(
                        title: "Missing",
                        value: missingCount,
                        tint: missingCount == 0 ? AppTheme.positive : AppTheme.negative
                    )
                }
            }
        }
    }
}

private struct DocumentCountChip: View {
    let title: String
    let value: Int
    let tint: Color

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text("\(value)")
                .font(.system(.headline, design: .rounded, weight: .bold))
                .foregroundStyle(tint)
            Text(title)
                .font(.caption2.weight(.semibold))
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(10)
        .background(AppTheme.surfaceSunken, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
    }
}

private struct DocumentFilterPanel: View {
    @Binding var selectedKind: ProjectDocumentKind?
    @Binding var selectedStatus: DocumentStatusFilter
    let documents: [ProjectDocument]
    let missingRequiredKinds: [ProjectDocumentKind]

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Picker("Status", selection: $selectedStatus) {
                ForEach(DocumentStatusFilter.allCases) { filter in
                    Text(filter.title).tag(filter)
                }
            }
            .pickerStyle(.segmented)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    FilterChip(title: "All", count: documents.count, isSelected: selectedKind == nil) {
                        Haptics.lightTap()
                        selectedKind = nil
                    }

                    ForEach(ProjectDocumentKind.allCases) { kind in
                        FilterChip(title: kind.title, count: count(for: kind), isSelected: selectedKind == kind) {
                            Haptics.lightTap()
                            selectedKind = kind
                        }
                    }
                }
                .padding(.vertical, 2)
            }
        }
    }

    private func count(for kind: ProjectDocumentKind) -> Int {
        let documentCount = documents.filter { $0.kind == kind }.count
        let missingCount = missingRequiredKinds.contains(kind) ? 1 : 0
        return documentCount + missingCount
    }
}

private struct FilterChip: View {
    let title: String
    let count: Int
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 6) {
                Text(title)
                    .font(.caption.weight(.semibold))
                Text("\(count)")
                    .font(.caption2.weight(.bold))
                    .foregroundStyle(isSelected ? .white.opacity(0.8) : .secondary)
            }
            .foregroundStyle(isSelected ? .white : .primary)
            .padding(.horizontal, 11)
            .padding(.vertical, 8)
            .background(isSelected ? AppTheme.accent : AppTheme.cardBackground, in: Capsule())
            .overlay {
                Capsule()
                    .strokeBorder(isSelected ? Color.clear : AppTheme.border, lineWidth: 1)
            }
        }
        .buttonStyle(.plain)
    }
}

private struct RequiredDocumentsCard: View {
    let requiredKinds: [ProjectDocumentKind]
    let documents: [ProjectDocument]
    @Binding var selectedKind: ProjectDocumentKind?
    @Binding var selectedStatus: DocumentStatusFilter
    let onUpload: (ProjectDocumentKind) -> Void

    var body: some View {
        PremiumCard {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    Text("Required checklist")
                        .font(.headline.weight(.semibold))
                    Spacer()
                    Text("\(receivedCount)/\(requiredKinds.count)")
                        .font(.caption.weight(.bold))
                        .foregroundStyle(.secondary)
                }

                ForEach(requiredKinds) { kind in
                    Button {
                        Haptics.lightTap()
                        selectedKind = kind
                        selectedStatus = .required
                        onUpload(kind)
                    } label: {
                        HStack(spacing: 10) {
                            Image(systemName: isReceived(kind) ? "checkmark.circle.fill" : "exclamationmark.circle.fill")
                                .foregroundStyle(isReceived(kind) ? AppTheme.positive : AppTheme.negative)

                            Text(kind.title)
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(.primary)

                            Spacer()

                            Text(isReceived(kind) ? "Add another" : "Upload")
                                .font(.caption.weight(.bold))
                                .foregroundStyle(isReceived(kind) ? AppTheme.accent : AppTheme.negative)
                        }
                        .padding(.vertical, 2)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private var receivedCount: Int {
        requiredKinds.filter(isReceived).count
    }

    private func isReceived(_ kind: ProjectDocumentKind) -> Bool {
        documents.contains { $0.kind == kind && $0.status == .received }
    }
}

private struct UploadDocumentsReviewView: View {
    @Environment(\.dismiss) private var dismiss
    @Binding var uploads: [PendingDocumentUpload]
    let items: [BudgetLineItem]
    let onSave: ([PendingDocumentUpload]) -> Void

    var body: some View {
        NavigationStack {
            ModernForm {
                ModernFormSection("Classify Files") {
                    ForEach($uploads) { $upload in
                        UploadDocumentCard(upload: $upload, items: items)
                    }
                }
            }
            .navigationTitle(uploads.count == 1 ? "Upload File" : "Upload Files")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        uploads.removeAll()
                        dismiss()
                    }
                }

                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        onSave(uploads)
                    }
                    .disabled(uploads.isEmpty)
                }
            }
        }
    }
}

private struct UploadDocumentCard: View {
    @Binding var upload: PendingDocumentUpload
    let items: [BudgetLineItem]

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 10) {
                Image(systemName: "doc.fill")
                    .font(.headline.weight(.semibold))
                    .foregroundStyle(AppTheme.accent)
                    .frame(width: 34, height: 34)
                    .background(AppTheme.accent.opacity(0.12), in: RoundedRectangle(cornerRadius: 8, style: .continuous))

                VStack(alignment: .leading, spacing: 2) {
                    Text(upload.originalFileName)
                        .font(.subheadline.weight(.semibold))
                        .lineLimit(1)
                    Text(upload.fileData.count.fileSizeString)
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(.secondary)
                }
            }

            ModernField("Name", subtitle: "Optional. Leave blank to use the original file name.") {
                TextField(upload.originalFileName, text: $upload.displayName)
                    .modernTextField()
            }

            ModernField("Category") {
                Picker("Category", selection: $upload.kind) {
                    ForEach(ProjectDocumentKind.allCases) { kind in
                        Text(kind.title).tag(kind)
                    }
                }
                .pickerStyle(.menu)
            }

            ModernField("Status") {
                Picker("Status", selection: $upload.status) {
                    ForEach(ProjectDocumentStatus.allCases) { status in
                        Text(status.title).tag(status)
                    }
                }
                .pickerStyle(.segmented)
            }

            ModernField("Budget item", subtitle: "Optional") {
                Picker("Budget item", selection: $upload.budgetLineItemID) {
                    Text("None").tag(UUID?.none)
                    ForEach(items) { item in
                        Text("\(item.costCode)  \(item.title)").tag(Optional(item.id))
                    }
                }
                .pickerStyle(.menu)
            }

            ModernField("Notes") {
                TextField("Optional notes", text: $upload.notes, axis: .vertical)
                    .lineLimit(2 ... 4)
                    .modernTextField()
            }
        }
        .padding(12)
        .background(AppTheme.surfaceSunken, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
    }
}

private struct DocumentRow: View {
    let document: ProjectDocument

    var body: some View {
        HStack(spacing: 12) {
            thumbnail
                .frame(width: 46, height: 54)

            VStack(alignment: .leading, spacing: 4) {
                Text(document.fileName)
                    .font(.subheadline.weight(.semibold))
                    .lineLimit(2)

                Text("\(document.kind.title) - \(document.uploadedAt.shortDateString)")
                    .font(.caption)
                    .foregroundStyle(.secondary)

                Text(document.status.title)
                    .font(.caption2.weight(.bold))
                    .foregroundStyle(AppTheme.documentStatusColor(document.status))
                    .padding(.horizontal, 7)
                    .padding(.vertical, 3)
                    .background(AppTheme.documentStatusColor(document.status).opacity(0.12), in: Capsule())

                if !document.budgetLineItemTitle.isEmpty {
                    Text(document.budgetLineItemTitle)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }

                if let count = document.fileData?.count {
                    Text(count.fileSizeString)
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(.secondary)
                }
            }
        }
        .padding(.vertical, 6)
    }

    @ViewBuilder
    private var thumbnail: some View {
        if let data = document.fileData,
           UIImage(data: data) != nil
        {
            PhotoThumbnail(data: data)
        } else {
            RoundedRectangle(cornerRadius: 8, style: .continuous)
                .fill(AppTheme.accent.opacity(0.13))
                .overlay {
                    Image(systemName: iconName)
                        .font(.title3.weight(.semibold))
                        .foregroundStyle(AppTheme.accent)
                }
        }
    }

    private var iconName: String {
        switch document.kind {
        case .survey: "map"
        case .approvals: "checkmark.seal"
        case .plans: "doc.richtext"
        case .inspections: "checklist.checked"
        case .contractsInsurance: "signature"
        case .receiptsWarranties: "receipt"
        case .other: "doc"
        }
    }
}

private extension ProjectDocumentKind {
    var uploadFileStem: String {
        switch self {
        case .survey: "survey"
        case .approvals: "permit"
        case .plans: "plans"
        case .inspections: "inspection"
        case .contractsInsurance: "contract"
        case .receiptsWarranties: "receipt"
        case .other: "document"
        }
    }
}

private struct DocumentEditorView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.modelContext) private var modelContext

    let project: Project
    let documentID: UUID
    let projectID: UUID
    let items: [BudgetLineItem]

    @State private var fileName: String
    @State private var kind: ProjectDocumentKind
    @State private var status: ProjectDocumentStatus
    @State private var budgetLineItemID: UUID?
    @State private var notes: String
    @State private var saveErrorMessage: String?

    init(project: Project, document: ProjectDocument, items: [BudgetLineItem]) {
        self.project = project
        documentID = document.id
        projectID = document.projectID
        self.items = items
        _fileName = State(initialValue: document.fileName)
        _kind = State(initialValue: document.kind)
        _status = State(initialValue: document.status)
        _budgetLineItemID = State(initialValue: document.budgetLineItemID)
        _notes = State(initialValue: document.notes)
    }

    var body: some View {
        NavigationStack {
            ModernForm {
                ModernFormSection("Document") {
                    ModernField("File name") {
                        TextField("Document name", text: $fileName)
                            .modernTextField()
                    }

                    ModernField("Type") {
                        Picker("Type", selection: $kind) {
                            ForEach(ProjectDocumentKind.allCases) { kind in
                                Text(kind.title).tag(kind)
                            }
                        }
                        .pickerStyle(.menu)
                    }

                    ModernField("Status") {
                        Picker("Status", selection: $status) {
                            ForEach(ProjectDocumentStatus.allCases) { status in
                                Text(status.title).tag(status)
                            }
                        }
                        .pickerStyle(.segmented)
                    }

                    ModernField("Budget item", subtitle: "Optional link for context and export.") {
                        Picker("Budget item", selection: $budgetLineItemID) {
                            Text("None").tag(UUID?.none)
                            ForEach(items) { item in
                                Text("\(item.costCode)  \(item.title)").tag(Optional(item.id))
                            }
                        }
                        .pickerStyle(.menu)
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
            .navigationTitle("Edit Document")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        save()
                    }
                    .disabled(fileName.trimmed.isEmpty)
                }
            }
            .alert("Document Could Not Be Saved", isPresented: saveErrorBinding) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(saveErrorMessage ?? "Please try again.")
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
        guard let document = fetchDocument() else {
            saveErrorMessage = "This document no longer exists."
            Haptics.warning()
            return
        }

        document.fileName = fileName.trimmed
        document.kind = kind
        document.status = status
        document.budgetLineItemID = budgetLineItemID
        document.budgetLineItemTitle = items.first { $0.id == budgetLineItemID }?.title ?? ""
        document.notes = notes.trimmed

        do {
            try modelContext.save()
            if let data = document.fileData {
                do {
                    try MediaStorageService.saveDocument(data: data, project: project, document: document)
                } catch {
                    StorageHealthMonitor.shared.reportMirrorFailure(error)
                }
            }
            Haptics.success()
            dismiss()
        } catch {
            modelContext.safeRollback()
            saveErrorMessage = error.localizedDescription
            Haptics.warning()
        }
    }

    private func fetchDocument() -> ProjectDocument? {
        let descriptor = FetchDescriptor<ProjectDocument>(
            predicate: #Predicate { $0.id == documentID && $0.projectID == projectID }
        )
        return try? modelContext.fetch(descriptor).first
    }
}

private struct PreviewDocument: Identifiable {
    let id = UUID()
    let url: URL
}

private struct QuickLookPreview: UIViewControllerRepresentable {
    let url: URL

    func makeCoordinator() -> Coordinator {
        Coordinator(url: url)
    }

    func makeUIViewController(context: Context) -> QLPreviewController {
        let controller = QLPreviewController()
        controller.dataSource = context.coordinator
        return controller
    }

    func updateUIViewController(_ uiViewController: QLPreviewController, context: Context) {}

    final class Coordinator: NSObject, QLPreviewControllerDataSource {
        let url: URL

        init(url: URL) {
            self.url = url
        }

        func numberOfPreviewItems(in controller: QLPreviewController) -> Int {
            1
        }

        func previewController(_ controller: QLPreviewController, previewItemAt index: Int) -> QLPreviewItem {
            url as NSURL
        }
    }
}

private struct DocumentActivityView: UIViewControllerRepresentable {
    let url: URL

    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: [url], applicationActivities: nil)
    }

    func updateUIViewController(_ uiViewController: UIActivityViewController, context: Context) {}
}

private extension Int {
    var fileSizeString: String {
        let formatter = ByteCountFormatter()
        formatter.allowedUnits = [.useKB, .useMB, .useGB]
        formatter.countStyle = .file
        return formatter.string(fromByteCount: Int64(self))
    }
}

private extension String {
    var safeFileName: String {
        let invalid = CharacterSet(charactersIn: "/\\?%*|\"<>:")
        let cleaned = components(separatedBy: invalid).joined(separator: "-").trimmed
        return cleaned.isEmpty ? "Document" : cleaned
    }
}
