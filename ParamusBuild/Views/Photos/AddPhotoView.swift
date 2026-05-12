import PhotosUI
import SwiftData
import SwiftUI
import UniformTypeIdentifiers

struct AddPhotoView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.modelContext) private var modelContext
    let project: Project
    let photoID: UUID?

    @Query private var items: [BudgetLineItem]
    @Query private var existingPhotos: [PhotoAttachment]

    @StateObject private var viewModel: PhotoFormViewModel
    @State private var selectedPhotoItem: PhotosPickerItem?
    @State private var showingCamera = false
    @State private var showingFileImporter = false

    init(project: Project, photo: PhotoAttachment? = nil) {
        self.project = project
        photoID = photo?.id
        let projectID = project.id
        _items = Query(filter: #Predicate<BudgetLineItem> { $0.projectID == projectID }, sort: \.costCode)
        _existingPhotos = Query(
            filter: #Predicate<PhotoAttachment> { $0.projectID == projectID },
            sort: \.createdAt,
            order: .reverse
        )
        _viewModel = StateObject(
            wrappedValue: PhotoFormViewModel(
                imageData: photo?.imageData,
                roomTag: photo?.roomTag ?? "",
                phaseTag: photo?.phaseTag ?? PhotoFormViewModel.defaultFolder,
                notes: photo?.notes ?? "",
                budgetLineItemID: photo?.budgetLineItemID
            )
        )
    }

    private var selectedItem: BudgetLineItem? {
        guard let id = viewModel.budgetLineItemID else { return nil }
        return items.first { $0.id == id }
    }

    var body: some View {
        NavigationStack {
            ModernForm {
                ModernFormSection("Photo") {
                    if viewModel.imageData != nil {
                        PhotoThumbnail(data: viewModel.imageData)
                            .frame(height: 260)
                            .padding(.vertical, 4)
                    } else {
                        ZStack {
                            RoundedRectangle(cornerRadius: AppTheme.cardRadius, style: .continuous)
                                .fill(AppTheme.cardBackground)

                            VStack(spacing: 10) {
                                Image(systemName: "camera.viewfinder")
                                    .font(.system(size: 42, weight: .semibold))
                                    .foregroundStyle(AppTheme.accent)
                                Text("Add jobsite photo")
                                    .font(.headline)
                            }
                        }
                        .frame(height: 220)
                    }

                    VStack(spacing: 10) {
                        Button {
                            showingCamera = true
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
                }

                ModernFormSection("Tags") {
                    ModernField("Room or area") {
                        TextField("e.g. Kitchen, rear yard, basement", text: $viewModel.roomTag)
                            .textInputAutocapitalization(.words)
                            .modernTextField()
                    }

                    ModernField("Folder") {
                        Picker("Folder", selection: $viewModel.phaseTag) {
                            ForEach(viewModel.phaseOptions, id: \.self) { phase in
                                Text(phase).tag(phase)
                            }
                        }
                        .pickerStyle(.menu)
                    }

                    ModernField("Budget item", subtitle: "Optional link for context and export.") {
                        Picker("Budget item", selection: $viewModel.budgetLineItemID) {
                            Text("None").tag(UUID?.none)
                            ForEach(items) { item in
                                Text("\(item.costCode)  \(item.title)")
                                    .tag(Optional(item.id))
                            }
                        }
                        .pickerStyle(.menu)
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
            .navigationTitle(photoID == nil ? "Add Photo" : "Edit Photo")
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
                // For NEW photos, default the folder to the most recently used in this project.
                if photoID == nil,
                   viewModel.phaseTag == PhotoFormViewModel.defaultFolder,
                   let recent = existingPhotos.first?.phaseTag,
                   !recent.trimmed.isEmpty
                {
                    viewModel.phaseTag = recent
                }
            }
            .onChange(of: selectedPhotoItem) { _, newItem in
                Task {
                    guard let data = try? await newItem?.loadTransferable(type: Data.self) else { return }
                    await MainActor.run {
                        setImageData(data)
                    }
                }
            }
            .fileImporter(
                isPresented: $showingFileImporter,
                allowedContentTypes: [.image],
                allowsMultipleSelection: false
            ) { result in
                handleFileImport(result)
            }
            .sheet(isPresented: $showingCamera) {
                CameraPicker { image in
                    viewModel.imageData = ImageDataProcessor.optimizedJPEGData(from: image, maxDimension: 1800, compressionQuality: 0.84)
                }
            }
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
        setImageData(data)
    }

    private func setImageData(_ data: Data) {
        viewModel.imageData = ImageDataProcessor.optimizedJPEGData(from: data, maxDimension: 1800, compressionQuality: 0.84) ?? data
    }

    private func save() {
        do {
            let target: PhotoAttachment
            if let photoID {
                guard let photoToEdit = fetchPhoto(withID: photoID) else {
                    Haptics.warning()
                    return
                }
                applyViewModel(to: photoToEdit)
                target = photoToEdit
            } else {
                let newPhoto = makePhoto()
                modelContext.insert(newPhoto)
                target = newPhoto
            }

            try modelContext.save()
            if let data = target.imageData {
                do {
                    try MediaStorageService.savePhoto(data: data, project: project, photo: target)
                } catch {
                    StorageHealthMonitor.shared.reportMirrorFailure(error)
                }
            }
            Haptics.success()
            dismiss()
        } catch {
            modelContext.safeRollback()
            Haptics.warning()
        }
    }

    private func makePhoto() -> PhotoAttachment {
        PhotoAttachment(
            projectID: project.id,
            imageData: viewModel.imageData,
            createdAt: .now,
            roomTag: viewModel.roomTag.trimmed,
            phaseTag: viewModel.phaseTag,
            categoryName: selectedItem?.categoryName ?? "",
            budgetLineItemID: selectedItem?.id,
            notes: viewModel.notes.trimmed
        )
    }

    private func applyViewModel(to photo: PhotoAttachment) {
        photo.imageData = viewModel.imageData
        photo.roomTag = viewModel.roomTag.trimmed
        photo.phaseTag = viewModel.phaseTag
        if let selectedItem {
            photo.categoryName = selectedItem.categoryName
            photo.budgetLineItemID = selectedItem.id
        } else {
            photo.categoryName = ""
            photo.budgetLineItemID = nil
        }
        photo.notes = viewModel.notes.trimmed
    }

    private func fetchPhoto(withID photoID: UUID) -> PhotoAttachment? {
        let projectID = project.id
        let descriptor = FetchDescriptor<PhotoAttachment>(
            predicate: #Predicate { $0.id == photoID && $0.projectID == projectID }
        )
        return try? modelContext.fetch(descriptor).first
    }
}
